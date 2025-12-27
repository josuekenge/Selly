// Job Status Routes
// Endpoints for checking job and call processing status

import { Router, type Request, type Response } from 'express';
import { getJob, getJobByCallId } from '../jobs/index.js';
import { getCall } from './store.js';

const router = Router();

/**
 * GET /api/jobs/:jobId
 * Get job status by job ID
 */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;

        if (!jobId) {
            res.status(400).json({ ok: false, error: 'Missing jobId' });
            return;
        }

        const job = await getJob(jobId);

        if (!job) {
            res.status(404).json({ ok: false, error: 'Job not found' });
            return;
        }

        res.json({
            ok: true,
            job: {
                id: job.id,
                callId: job.call_id,
                status: job.status,
                attemptCount: job.attempt_count,
                maxAttempts: job.max_attempts,
                currentStage: job.current_stage,
                progress: {
                    transcript: job.transcript_done,
                    signals: job.signals_done,
                    recommendations: job.recommendations_done,
                    summary: job.summary_done,
                },
                createdAt: job.created_at,
                startedAt: job.started_at,
                completedAt: job.completed_at,
                lastError: job.last_error,
            },
        });
    } catch (error) {
        console.error('[api] Error in /jobs/:jobId:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/calls/:sessionId/job
 * Get job status for a specific call
 */
router.get('/calls/:sessionId/job', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId) {
            res.status(400).json({ ok: false, error: 'Missing sessionId' });
            return;
        }

        const job = await getJobByCallId(sessionId);

        if (!job) {
            res.status(404).json({ ok: false, error: 'No job found for this call' });
            return;
        }

        // Also get call data to include insights availability
        const call = getCall(sessionId);

        res.json({
            ok: true,
            sessionId,
            job: {
                id: job.id,
                status: job.status,
                attemptCount: job.attempt_count,
                currentStage: job.current_stage,
                progress: {
                    transcript: job.transcript_done,
                    signals: job.signals_done,
                    recommendations: job.recommendations_done,
                    summary: job.summary_done,
                },
                lastError: job.last_error,
                completedAt: job.completed_at,
            },
            insightsReady: job.status === 'completed' && call?.status === 'completed',
        });
    } catch (error) {
        console.error('[api] Error in /calls/:sessionId/job:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
