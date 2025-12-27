-- Selly Database Schema
-- Run this in Supabase SQL Editor
-- Safe to re-run (uses DROP IF EXISTS)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing types and tables to start fresh
DROP TABLE IF EXISTS call_processing_jobs CASCADE;
DROP TABLE IF EXISTS call_recommendation_sets CASCADE;
DROP TABLE IF EXISTS call_signal_sets_3b CASCADE;
DROP TABLE IF EXISTS call_signal_sets_3a CASCADE;
DROP TABLE IF EXISTS call_summaries CASCADE;
DROP TABLE IF EXISTS call_utterances CASCADE;
DROP TABLE IF EXISTS call_events CASCADE;
DROP TABLE IF EXISTS call_audio_objects CASCADE;
DROP TABLE IF EXISTS calls CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;

DROP TYPE IF EXISTS job_status CASCADE;
DROP TYPE IF EXISTS speaker_role_enum CASCADE;
DROP TYPE IF EXISTS call_status_enum CASCADE;

-- Create enums
CREATE TYPE speaker_role_enum AS ENUM ('rep', 'prospect', 'unknown');
CREATE TYPE call_status_enum AS ENUM ('active', 'ended', 'error');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'retrying');

-- Workspaces
CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Workspace members (optional - for multi-user)
CREATE TABLE workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,  -- Will reference auth.users when auth is enabled
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- Calls
CREATE TABLE calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by uuid,  -- Optional until auth is enabled
  status call_status_enum NOT NULL DEFAULT 'active',
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms integer,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Audio objects
CREATE TABLE call_audio_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_path text NOT NULL,
  content_type text,
  bytes bigint,
  channels integer,
  sample_rate integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Events
CREATE TABLE call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Utterances
CREATE TABLE call_utterances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  speaker speaker_role_enum NOT NULL,
  text text NOT NULL,
  confidence numeric,
  started_at_ms integer,
  ended_at_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Summaries
CREATE TABLE call_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  summary jsonb NOT NULL,
  version text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Signal sets 3A (deterministic)
CREATE TABLE call_signal_sets_3a (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  signals jsonb NOT NULL,
  version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Signal sets 3B (AI)
CREATE TABLE call_signal_sets_3b (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  signals jsonb NOT NULL,
  version text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Recommendations
CREATE TABLE call_recommendation_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recommendations jsonb NOT NULL,
  version text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Processing jobs (Step 7)
CREATE TABLE call_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audio_object_path text NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz,
  current_stage text,
  transcript_done boolean DEFAULT false,
  signals_done boolean DEFAULT false,
  recommendations_done boolean DEFAULT false,
  summary_done boolean DEFAULT false,
  last_error text,
  error_category text,
  UNIQUE(call_id)
);

-- Indexes
CREATE INDEX idx_jobs_pending ON call_processing_jobs(status, next_retry_at) 
  WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_jobs_stale ON call_processing_jobs(status, started_at) 
  WHERE status = 'processing';

-- Function to claim a job atomically
CREATE OR REPLACE FUNCTION claim_next_job()
RETURNS call_processing_jobs AS $$
DECLARE
  job call_processing_jobs;
BEGIN
  SELECT * INTO job
  FROM call_processing_jobs
  WHERE (status = 'pending' OR (status = 'retrying' AND next_retry_at <= now()))
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF job.id IS NOT NULL THEN
    UPDATE call_processing_jobs
    SET status = 'processing',
        started_at = now(),
        updated_at = now(),
        attempt_count = attempt_count + 1
    WHERE id = job.id;
    
    SELECT * INTO job FROM call_processing_jobs WHERE id = job.id;
  END IF;
  
  RETURN job;
END;
$$ LANGUAGE plpgsql;

-- Function to requeue stale jobs
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

-- Insert a default workspace for development
INSERT INTO workspaces (id, name) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Default Workspace');
