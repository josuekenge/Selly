// Job Worker
// Polls for pending jobs and processes them
// Handles retries, timeouts, and partial completion

import { claimNextJob, completeJob, failJob, updateJobProgress, requeueStaleJobs, type Job } from './repo.js';
import { processCall } from '../services/pipeline.js';

let isRunning = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
const STALE_CHECK_INTERVAL_MS = 60000; // Check for stale jobs every minute

/**
 * Classify error as retryable or permanent
 */
function isRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();

    // Retryable: rate limits, timeouts, network issues, 5xx errors
    if (lowerMessage.includes('429') || lowerMessage.includes('rate limit')) return true;
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) return true;
    if (lowerMessage.includes('network') || lowerMessage.includes('econnrefused')) return true;
    if (lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503') || lowerMessage.includes('504')) return true;
    if (lowerMessage.includes('temporarily unavailable')) return true;

    // Permanent: 4xx errors (except 429), validation errors
    if (lowerMessage.includes('400') || lowerMessage.includes('401') || lowerMessage.includes('403') || lowerMessage.includes('404')) return false;
    if (lowerMessage.includes('invalid') || lowerMessage.includes('validation')) return false;

    // Default to retryable for unknown errors
    return true;
}

/**
 * Process a single job
 */
async function processJob(job: Job): Promise<void> {
    const startTime = Date.now();
    console.log(`[worker] Processing job ${job.id} for call ${job.call_id} (attempt ${job.attempt_count}/${job.max_attempts})`);
    console.log(`[worker] Audio path: ${job.audio_object_path}`);

    try {
        // Update stage - downloading
        await updateJobProgress(job.id, { current_stage: 'downloading' });

        // Run the pipeline
        const result = await processCall(job.call_id, job.audio_object_path);
        const duration = Date.now() - startTime;

        if (result.ok) {
            // Mark stages as done
            await updateJobProgress(job.id, {
                transcript_done: true,
                signals_done: true,
                recommendations_done: true,
                summary_done: true,
            });

            // Complete the job
            await completeJob(job.id);
            console.log(`[worker] Job ${job.id} completed successfully in ${duration}ms`);
            console.log(`[worker] Results: ${result.transcript.length} utterances, ${result.signals3a.signals.length} 3A signals, ${result.signals3b.signals.length} 3B signals, ${result.recommendations.recommendations.length} recommendations`);
        } else {
            // Pipeline returned error
            const isRetryable = isRetryableError(result.error);
            const errorMsg = result.error ?? 'Unknown pipeline error';
            await failJob(job.id, errorMsg, isRetryable, job.attempt_count, job.max_attempts);
            console.error(`[worker] Job ${job.id} failed after ${duration}ms: ${errorMsg} (retryable: ${isRetryable})`);
        }
    } catch (error) {
        // Unexpected error
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const isRetryable = isRetryableError(error);

        await failJob(job.id, errorMessage, isRetryable, job.attempt_count, job.max_attempts);
        console.error(`[worker] Job ${job.id} threw error after ${duration}ms: ${errorMessage} (retryable: ${isRetryable})`);
        if (errorStack) {
            console.error(`[worker] Stack trace:`, errorStack);
        }
    }
}

/**
 * Poll for and process jobs
 */
async function pollForJobs(): Promise<void> {
    if (!isRunning) return;

    try {
        const job = await claimNextJob();

        if (job) {
            await processJob(job);
        }
    } catch (error) {
        console.error('[worker] Poll error:', error);
    }
}

/**
 * Check for and requeue stale jobs
 */
async function checkStaleJobs(): Promise<void> {
    if (!isRunning) return;

    try {
        const count = await requeueStaleJobs();
        if (count > 0) {
            console.log(`[worker] Requeued ${count} stale jobs`);
        }
    } catch (error) {
        console.error('[worker] Stale check error:', error);
    }
}

/**
 * Start the job worker
 */
export function startWorker(): void {
    if (isRunning) {
        console.log('[worker] Already running');
        return;
    }

    isRunning = true;
    console.log('[worker] Starting job worker...');

    // Start polling
    pollInterval = setInterval(pollForJobs, POLL_INTERVAL_MS);

    // Start stale job checker
    setInterval(checkStaleJobs, STALE_CHECK_INTERVAL_MS);

    // Initial poll
    pollForJobs();

    console.log('[worker] Job worker started');
}

/**
 * Stop the job worker
 */
export function stopWorker(): void {
    isRunning = false;

    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }

    console.log('[worker] Job worker stopped');
}

/**
 * Check if worker is running
 */
export function isWorkerRunning(): boolean {
    return isRunning;
}
