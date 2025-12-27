-- Job Queue Schema for Selly
-- Add this to your Supabase SQL Editor after the main schema.sql

-- Job status enum
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'retrying');

-- Processing jobs table
CREATE TABLE IF NOT EXISTS call_processing_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    audio_object_path text NOT NULL,
    
    -- Job state
    status job_status NOT NULL DEFAULT 'pending',
    attempt_count integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    
    -- Timing
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    next_retry_at timestamptz,
    
    -- Progress tracking
    current_stage text, -- 'transcription', 'signals', 'recommendations', 'summary'
    
    -- Results (for partial completion)
    transcript_done boolean DEFAULT false,
    signals_done boolean DEFAULT false,
    recommendations_done boolean DEFAULT false,
    summary_done boolean DEFAULT false,
    
    -- Error info
    last_error text,
    error_category text, -- 'retryable', 'permanent'
    
    -- Idempotency
    UNIQUE(call_id)
);

-- Index for job polling (find pending/retrying jobs)
CREATE INDEX idx_jobs_pending ON call_processing_jobs(status, next_retry_at) 
    WHERE status IN ('pending', 'retrying');

-- Index for stale job detection
CREATE INDEX idx_jobs_stale ON call_processing_jobs(status, started_at) 
    WHERE status = 'processing';

-- Function to claim a job atomically
CREATE OR REPLACE FUNCTION claim_next_job()
RETURNS call_processing_jobs AS $$
DECLARE
    job call_processing_jobs;
BEGIN
    -- Find and lock the next available job
    SELECT * INTO job
    FROM call_processing_jobs
    WHERE (status = 'pending' OR (status = 'retrying' AND next_retry_at <= now()))
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    IF job.id IS NOT NULL THEN
        -- Mark as processing
        UPDATE call_processing_jobs
        SET status = 'processing',
            started_at = now(),
            updated_at = now(),
            attempt_count = attempt_count + 1
        WHERE id = job.id;
        
        -- Return updated job
        SELECT * INTO job FROM call_processing_jobs WHERE id = job.id;
    END IF;
    
    RETURN job;
END;
$$ LANGUAGE plpgsql;

-- Function to requeue stale jobs (processing for > 15 minutes)
CREATE OR REPLACE FUNCTION requeue_stale_jobs()
RETURNS integer AS $$
DECLARE
    count integer;
BEGIN
    UPDATE call_processing_jobs
    SET status = CASE 
            WHEN attempt_count >= max_attempts THEN 'failed'::job_status
            ELSE 'retrying'::job_status
        END,
        next_retry_at = now() + (attempt_count * interval '30 seconds'),
        last_error = 'Job timed out (stale)',
        error_category = 'retryable',
        updated_at = now()
    WHERE status = 'processing'
      AND started_at < now() - interval '15 minutes';
    
    GET DIAGNOSTICS count = ROW_COUNT;
    RETURN count;
END;
$$ LANGUAGE plpgsql;
