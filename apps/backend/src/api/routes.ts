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
    type TranscriptRecord,
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
import { generateLiveRecommendations, isLiveRecommendationsConfigured } from '../services/liveRecommendations.js';
import { knowledgeService } from '../modules/knowledge/index.js';

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
 * POST /api/calls/:sessionId/trigger-recommendations
 * Triggered by agent when question is detected
 * Generates recommendations and broadcasts via SSE
 */
router.post('/calls/:sessionId/trigger-recommendations', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const body = req.body as {
            question?: string;
            recentTranscript?: Array<{
                speaker: string;
                text: string;
                confidence: number;
                startedAt: number;
                endedAt: number;
            }>;
            timestamp?: number;
        };

        if (!sessionId) {
            res.status(400).json({ ok: false, error: 'Missing sessionId' });
            return;
        }

        if (!body.question) {
            res.status(400).json({ ok: false, error: 'Missing question' });
            return;
        }

        if (!isLiveRecommendationsConfigured()) {
            res.status(503).json({ ok: false, error: 'Live recommendations not configured (missing OpenAI key)' });
            return;
        }

        // Get workspaceId from call record
        const call = getCall(sessionId);
        const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
        const workspaceId = call?.workspaceId ?? DEFAULT_WORKSPACE_ID;

        console.log(`[api] Generating live recommendations for session ${sessionId} (workspace: ${workspaceId})`);

        // Generate recommendations with knowledge retrieval
        const result = await generateLiveRecommendations({
            sessionId,
            workspaceId,
            question: body.question,
            recentTranscript: (body.recentTranscript || []) as TranscriptRecord[],
            timestamp: body.timestamp || Date.now(),
        });

        // Broadcast to connected SSE clients if successful
        if (result.ok && result.recommendations.recommendations.length > 0) {
            // Convert to SSE event format
            for (const rec of result.recommendations.recommendations) {
                // Map recommendation type to SSE category
                const categoryMap: Record<string, 'answer' | 'objection' | 'next-step'> = {
                    'next_best_response': 'answer',
                    'discovery_question': 'answer',
                    'objection_handling': 'objection',
                    'positioning_point': 'answer',
                    'next_step': 'next-step',
                };
                const category = categoryMap[rec.type] ?? 'answer';

                // Map confidence to priority
                const priority: 'high' | 'medium' | 'low' =
                    rec.confidence >= 0.8 ? 'high' :
                        rec.confidence >= 0.5 ? 'medium' : 'low';

                recommendationSSEManager.broadcastRecommendation(sessionId, {
                    type: 'recommendation.generated',
                    sessionId,
                    timestamp: result.generatedAt,
                    recommendation: {
                        title: rec.title,
                        message: rec.script || rec.title,
                        priority,
                        category,
                    },
                });
            }
        }

        // Return result to agent
        res.json({
            ok: result.ok,
            cached: result.cached,
            latencyMs: result.latencyMs,
            recommendationCount: result.recommendations.recommendations.length,
            error: result.error,
        });
    } catch (error) {
        console.error('[api] Error in /calls/:sessionId/trigger-recommendations:', error);
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
 * POST /api/workspaces/:workspaceId/knowledge
 * Ingest a new knowledge document
 */
router.post('/workspaces/:workspaceId/knowledge', async (req: Request, res: Response) => {
    try {
        const { workspaceId } = req.params;
        const body = req.body as {
            title?: string;
            content?: string;
            description?: string;
            sourceType?: 'manual' | 'upload' | 'api';
            metadata?: Record<string, any>;
        };

        if (!workspaceId) {
            res.status(400).json({ ok: false, error: 'Missing workspaceId' });
            return;
        }

        if (!body.title || !body.content) {
            res.status(400).json({ ok: false, error: 'Missing title or content' });
            return;
        }

        const document = await knowledgeService.ingestDocument({
            workspaceId,
            title: body.title,
            content: body.content,
            description: body.description,
            sourceType: body.sourceType,
            metadata: body.metadata,
        });

        res.json({
            ok: true,
            document: {
                id: document.id,
                title: document.title,
                description: document.description,
                sourceType: document.sourceType,
                status: document.status,
                chunkCount: document.chunks?.length || 0,
                createdAt: document.createdAt,
            },
        });
    } catch (error) {
        console.error('[api] Error in POST /workspaces/:workspaceId/knowledge:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/workspaces/:workspaceId/knowledge
 * List all knowledge documents for a workspace
 */
router.get('/workspaces/:workspaceId/knowledge', async (req: Request, res: Response) => {
    try {
        const { workspaceId } = req.params;

        if (!workspaceId) {
            res.status(400).json({ ok: false, error: 'Missing workspaceId' });
            return;
        }

        const documents = await knowledgeService.listDocuments(workspaceId);

        res.json({
            ok: true,
            documents: documents.map(doc => ({
                id: doc.id,
                title: doc.title,
                description: doc.description,
                sourceType: doc.sourceType,
                status: doc.status,
                chunkCount: doc.chunks?.length || 0,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
            })),
            count: documents.length,
        });
    } catch (error) {
        console.error('[api] Error in GET /workspaces/:workspaceId/knowledge:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/workspaces/:workspaceId/knowledge/:docId
 * Get a specific knowledge document
 */
router.get('/workspaces/:workspaceId/knowledge/:docId', async (req: Request, res: Response) => {
    try {
        const { workspaceId, docId } = req.params;

        if (!workspaceId || !docId) {
            res.status(400).json({ ok: false, error: 'Missing workspaceId or docId' });
            return;
        }

        const document = await knowledgeService.getDocument(workspaceId, docId);

        if (!document) {
            res.status(404).json({ ok: false, error: 'Document not found' });
            return;
        }

        res.json({
            ok: true,
            document: {
                id: document.id,
                title: document.title,
                description: document.description,
                sourceType: document.sourceType,
                status: document.status,
                content: document.content,
                chunks: document.chunks?.map(chunk => ({
                    id: chunk.id,
                    chunkIndex: chunk.chunkIndex,
                    content: chunk.content,
                    metadata: chunk.metadata,
                })),
                metadata: document.metadata,
                createdAt: document.createdAt,
                updatedAt: document.updatedAt,
            },
        });
    } catch (error) {
        console.error('[api] Error in GET /workspaces/:workspaceId/knowledge/:docId:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * DELETE /api/workspaces/:workspaceId/knowledge/:docId
 * Delete a knowledge document
 */
router.delete('/workspaces/:workspaceId/knowledge/:docId', async (req: Request, res: Response) => {
    try {
        const { workspaceId, docId } = req.params;

        if (!workspaceId || !docId) {
            res.status(400).json({ ok: false, error: 'Missing workspaceId or docId' });
            return;
        }

        await knowledgeService.deleteDocument(workspaceId, docId);

        res.json({
            ok: true,
            message: 'Document deleted successfully',
        });
    } catch (error) {
        console.error('[api] Error in DELETE /workspaces/:workspaceId/knowledge/:docId:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/calls/:sessionId/summarize
 * Generate real-time summary of conversation using OpenAI
 */
router.post('/calls/:sessionId/summarize', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const body = req.body as {
            transcript?: Array<{
                speaker: string;
                text: string;
            }>;
        };

        if (!sessionId) {
            res.status(400).json({ ok: false, error: 'Missing sessionId' });
            return;
        }

        if (!body.transcript || body.transcript.length === 0) {
            res.status(400).json({ ok: false, error: 'Missing or empty transcript' });
            return;
        }

        if (!isOpenAIConfigured()) {
            res.status(503).json({ ok: false, error: 'OpenAI not configured' });
            return;
        }

        const transcriptText = body.transcript
            .map(t => `${t.speaker}: ${t.text}`)
            .join('\n');

        // Call OpenAI to generate summary
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a sales call assistant. Generate a concise, structured summary of the ongoing conversation. Include: 1) Key discussion points 2) Customer pain points or objections 3) Action items or next steps. Keep it brief and actionable.'
                    },
                    {
                        role: 'user',
                        content: `Summarize this ongoing sales conversation:\n\n${transcriptText}`
                    }
                ],
                temperature: 0.3,
                max_tokens: 300
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data: any = await response.json();
        const summary = data.choices?.[0]?.message?.content || 'Unable to generate summary';

        res.json({
            ok: true,
            sessionId,
            summary,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('[api] Error in /calls/:sessionId/summarize:', error);
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
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
