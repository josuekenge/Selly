// API Routes
// Step 4.5 endpoints for call processing
// NO secrets in logs

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
    createCall,
    getCall,
    updateCall,
    hasCall,
} from './store.js';
import {
    isSupabaseConfigured,
    createSignedUploadUrl,
    insertCallRecord,
    getAudioObjectPath,
} from '../services/supabase.js';
import { createJob } from '../jobs/index.js';
import { isDeepgramConfigured } from '../services/deepgram.js';
import { processCall, isOpenAIConfigured } from '../services/pipeline.js';
import { recommendationSSEManager } from './recommendationSSE.js';

const router = Router();

/**
 * POST /api/calls/start
 * Start a new call session
 */
router.post('/calls/start', async (req: Request, res: Response) => {
    try {
        const sessionId = randomUUID();
        // Use default workspace from schema, or provided one
        const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
        const workspaceId = (req.body as { workspaceId?: string })?.workspaceId ?? DEFAULT_WORKSPACE_ID;

        // Create in-memory record
        const callRecord = createCall(sessionId, workspaceId);

        // Try to create Supabase record if configured
        if (isSupabaseConfigured()) {
            try {
                await insertCallRecord(sessionId, workspaceId);
            } catch (err) {
                console.error('[api] Failed to create Supabase record, continuing with in-memory:', err);
            }
        }

        res.json({
            ok: true,
            sessionId,
            workspaceId,
            createdAt: callRecord.createdAt,
        });
    } catch (error) {
        console.error('[api] Error in /calls/start:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/uploads/sign
 * Get a signed upload URL for audio file
 */
router.post('/uploads/sign', async (req: Request, res: Response) => {
    try {
        const body = req.body as { sessionId?: string; contentType?: string };

        if (!body.sessionId) {
            res.status(400).json({ ok: false, error: 'Missing sessionId' });
            return;
        }

        if (!isSupabaseConfigured()) {
            // Return a mock response for development
            const path = getAudioObjectPath(body.sessionId);
            res.json({
                ok: true,
                sessionId: body.sessionId,
                path,
                signedUrl: null,
                message: 'Supabase not configured - use direct file upload in development',
            });
            return;
        }

        const contentType = body.contentType ?? 'audio/wav';
        const result = await createSignedUploadUrl(body.sessionId, contentType);

        res.json({
            ok: true,
            sessionId: body.sessionId,
            path: result.path,
            objectPath: result.path,  // Desktop expects this field
            signedUrl: result.signedUrl,
            token: result.token,
        });
    } catch (error) {
        console.error('[api] Error in /uploads/sign:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/calls/:sessionId/stop
 * Mark call as ended and trigger processing
 */
router.post('/calls/:sessionId/stop', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const body = req.body as { audioObjectPath?: string };

        if (!sessionId) {
            res.status(400).json({ ok: false, error: 'Missing sessionId' });
            return;
        }

        // Check if call exists
        if (!hasCall(sessionId)) {
            // Create it if it doesn't exist (for testing)
            createCall(sessionId);
        }

        // Update call status
        updateCall(sessionId, {
            endedAt: Date.now(),
            audioPath: body.audioObjectPath,
        });

        // Return immediately, processing can be triggered separately
        res.json({
            ok: true,
            sessionId,
            audioObjectPath: body.audioObjectPath ?? getAudioObjectPath(sessionId),
            message: 'Call stopped. Use POST /api/calls/:sessionId/process to process audio.',
        });
    } catch (error) {
        console.error('[api] Error in /calls/:sessionId/stop:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/calls/:sessionId/process
 * Enqueue call processing job (async with retries)
 */
router.post('/calls/:sessionId/process', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const body = req.body as { audioObjectPath?: string };

        if (!sessionId) {
            res.status(400).json({ ok: false, error: 'Missing sessionId' });
            return;
        }

        // Check configuration
        const configStatus = {
            supabase: isSupabaseConfigured(),
            deepgram: isDeepgramConfigured(),
            openai: isOpenAIConfigured(),
        };

        if (!configStatus.supabase) {
            res.status(400).json({
                ok: false,
                error: 'Supabase not configured',
                configStatus,
            });
            return;
        }

        // Get call info
        const call = getCall(sessionId);
        const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
        const workspaceId = call?.workspaceId ?? DEFAULT_WORKSPACE_ID;
        const audioPath = body.audioObjectPath ?? getAudioObjectPath(sessionId);

        // Enqueue job (idempotent - returns existing job if already queued)
        const { job, isNew } = await createJob(sessionId, workspaceId, audioPath);

        res.json({
            ok: true,
            sessionId,
            jobId: job.id,
            status: job.status,
            isNew,
            message: isNew ? 'Job enqueued for processing' : 'Job already exists',
        });
    } catch (error) {
        console.error('[api] Error in /calls/:sessionId/process:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/calls/:sessionId/insights
 * Get processed insights for a call
 */
router.get('/calls/:sessionId/insights', (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId) {
            res.status(400).json({ ok: false, error: 'Missing sessionId' });
            return;
        }

        const call = getCall(sessionId);

        if (!call) {
            res.status(404).json({ ok: false, error: 'Call not found' });
            return;
        }

        res.json({
            ok: true,
            sessionId,
            status: call.status,
            transcript: call.transcript ?? [],
            summary: call.summary ?? null,
            signals3a: call.signals3a ?? null,
            signals3b: call.signals3b ?? null,
            recommendations: call.recommendations ?? null,
            metadata: {
                createdAt: call.createdAt,
                endedAt: call.endedAt,
                workspaceId: call.workspaceId,
                audioPath: call.audioPath,
                error: call.error,
            },
        });
    } catch (error) {
        console.error('[api] Error in /calls/:sessionId/insights:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/calls/:sessionId/recommendations-stream
 * SSE endpoint for live recommendations during active calls
 */
router.get('/calls/:sessionId/recommendations-stream', (req: Request, res: Response) => {
    const { sessionId } = req.params;

    if (!sessionId) {
        res.status(400).json({ ok: false, error: 'Missing sessionId' });
        return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx

    // Register client and get unsubscribe function
    const unsubscribe = recommendationSSEManager.registerClient(sessionId, res);

    // Handle client disconnect
    req.on('close', () => {
        unsubscribe();
    });

    console.log(`[api] SSE recommendations stream established for session ${sessionId}`);
});

/**
 * GET /api/status
 * Get API configuration status
 */
router.get('/status', (_req: Request, res: Response) => {
    res.json({
        ok: true,
        services: {
            supabase: isSupabaseConfigured(),
            deepgram: isDeepgramConfigured(),
            openai: isOpenAIConfigured(),
        },
        timestamp: new Date().toISOString(),
    });
});

export default router;
