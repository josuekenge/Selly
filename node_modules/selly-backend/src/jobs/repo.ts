// Jobs Repository
// CRUD operations for call_processing_jobs table
// Uses Supabase REST API

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface Job {
    id: string;
    call_id: string;
    workspace_id: string;
    audio_object_path: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
    attempt_count: number;
    max_attempts: number;
    created_at: string;
    updated_at: string;
    started_at: string | null;
    completed_at: string | null;
    next_retry_at: string | null;
    current_stage: string | null;
    transcript_done: boolean;
    signals_done: boolean;
    recommendations_done: boolean;
    summary_done: boolean;
    last_error: string | null;
    error_category: string | null;
}

function getConfig() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Supabase not configured');
    }
    return { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY };
}

function headers(key: string): Record<string, string> {
    return {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    };
}

/**
 * Create a new job (idempotent - returns existing job if already exists)
 */
export async function createJob(
    callId: string,
    workspaceId: string,
    audioObjectPath: string
): Promise<{ job: Job; isNew: boolean }> {
    const config = getConfig();

    // Check if job already exists
    const existingRes = await fetch(
        `${config.url}/rest/v1/call_processing_jobs?call_id=eq.${callId}&select=*`,
        { headers: headers(config.key) }
    );

    if (existingRes.ok) {
        const existing = await existingRes.json() as Job[];
        if (existing.length > 0) {
            return { job: existing[0], isNew: false };
        }
    }

    // Create new job
    const res = await fetch(
        `${config.url}/rest/v1/call_processing_jobs`,
        {
            method: 'POST',
            headers: headers(config.key),
            body: JSON.stringify({
                call_id: callId,
                workspace_id: workspaceId,
                audio_object_path: audioObjectPath,
                status: 'pending',
            }),
        }
    );

    if (!res.ok) {
        // Might be a race condition - check again
        const checkAgain = await fetch(
            `${config.url}/rest/v1/call_processing_jobs?call_id=eq.${callId}&select=*`,
            { headers: headers(config.key) }
        );
        if (checkAgain.ok) {
            const jobs = await checkAgain.json() as Job[];
            if (jobs.length > 0) {
                return { job: jobs[0], isNew: false };
            }
        }
        throw new Error(`Failed to create job: ${res.status}`);
    }

    const jobs = await res.json() as Job[];
    return { job: jobs[0], isNew: true };
}

/**
 * Claim the next available job using the stored function
 */
export async function claimNextJob(): Promise<Job | null> {
    const config = getConfig();

    const res = await fetch(
        `${config.url}/rest/v1/rpc/claim_next_job`,
        {
            method: 'POST',
            headers: headers(config.key),
            body: '{}',
        }
    );

    if (!res.ok) {
        console.error('[jobs] Failed to claim job:', res.status);
        return null;
    }

    const job = await res.json() as Job | null;
    return job?.id ? job : null;
}

/**
 * Update job progress
 */
export async function updateJobProgress(
    jobId: string,
    updates: Partial<Pick<Job,
        'current_stage' | 'transcript_done' | 'signals_done' |
        'recommendations_done' | 'summary_done'
    >>
): Promise<void> {
    const config = getConfig();

    await fetch(
        `${config.url}/rest/v1/call_processing_jobs?id=eq.${jobId}`,
        {
            method: 'PATCH',
            headers: headers(config.key),
            body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
        }
    );
}

/**
 * Mark job as completed
 */
export async function completeJob(jobId: string): Promise<void> {
    const config = getConfig();

    await fetch(
        `${config.url}/rest/v1/call_processing_jobs?id=eq.${jobId}`,
        {
            method: 'PATCH',
            headers: headers(config.key),
            body: JSON.stringify({
                status: 'completed',
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }),
        }
    );
}

/**
 * Mark job as failed (with retry logic)
 */
export async function failJob(
    jobId: string,
    error: string,
    isRetryable: boolean,
    currentAttempt: number,
    maxAttempts: number
): Promise<void> {
    const config = getConfig();

    const shouldRetry = isRetryable && currentAttempt < maxAttempts;

    // Exponential backoff: 10s, 30s, 90s
    const backoffSeconds = Math.min(10 * Math.pow(3, currentAttempt - 1), 300);
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

    await fetch(
        `${config.url}/rest/v1/call_processing_jobs?id=eq.${jobId}`,
        {
            method: 'PATCH',
            headers: headers(config.key),
            body: JSON.stringify({
                status: shouldRetry ? 'retrying' : 'failed',
                last_error: error.substring(0, 1000),
                error_category: isRetryable ? 'retryable' : 'permanent',
                next_retry_at: shouldRetry ? nextRetryAt : null,
                updated_at: new Date().toISOString(),
            }),
        }
    );
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<Job | null> {
    const config = getConfig();

    const res = await fetch(
        `${config.url}/rest/v1/call_processing_jobs?id=eq.${jobId}&select=*`,
        { headers: headers(config.key) }
    );

    if (!res.ok) return null;

    const jobs = await res.json() as Job[];
    return jobs.length > 0 ? jobs[0] : null;
}

/**
 * Get job by call ID
 */
export async function getJobByCallId(callId: string): Promise<Job | null> {
    const config = getConfig();

    const res = await fetch(
        `${config.url}/rest/v1/call_processing_jobs?call_id=eq.${callId}&select=*`,
        { headers: headers(config.key) }
    );

    if (!res.ok) return null;

    const jobs = await res.json() as Job[];
    return jobs.length > 0 ? jobs[0] : null;
}

/**
 * Requeue stale jobs using stored function
 */
export async function requeueStaleJobs(): Promise<number> {
    const config = getConfig();

    const res = await fetch(
        `${config.url}/rest/v1/rpc/requeue_stale_jobs`,
        {
            method: 'POST',
            headers: headers(config.key),
            body: '{}',
        }
    );

    if (!res.ok) {
        console.error('[jobs] Failed to requeue stale jobs:', res.status);
        return 0;
    }

    return await res.json() as number;
}
