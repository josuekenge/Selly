// Selly Local Agent - HTTP Server
// Exposes endpoints for audio capture control
//
// Endpoints:
//   POST /capture/start  - Start audio capture for a session
//   POST /capture/stop   - Stop audio capture for a session
//   GET /capture/status  - Get active capture sessions
//   GET /health          - Health check

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import {
    startCapture,
    stopCapture,
    pauseCapture,
    resumeCapture,
    getActiveSessions,
    isSidecarAvailable,
    stopAllCaptures,
} from './audio/capture.js';
import { sseManager } from './sse/index.js';

const PORT = parseInt(process.env.AGENT_PORT ?? '3001', 10);

/**
 * Parse JSON body from request
 */
async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

/**
 * Handle POST /capture/start
 */
async function handleCaptureStart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = (await parseJsonBody(req)) as { sessionId?: string };

        if (!body.sessionId || typeof body.sessionId !== 'string') {
            sendJson(res, 400, { ok: false, error: 'Missing or invalid sessionId' });
            return;
        }

        const result = await startCapture(body.sessionId);
        sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
        sendJson(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle POST /capture/stop
 */
async function handleCaptureStop(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = (await parseJsonBody(req)) as { sessionId?: string };

        if (!body.sessionId || typeof body.sessionId !== 'string') {
            sendJson(res, 400, { ok: false, error: 'Missing or invalid sessionId' });
            return;
        }

        const result = await stopCapture(body.sessionId);

        // Close all SSE connections for this session
        if (result.ok) {
            sseManager.closeSessionConnections(body.sessionId);
        }

        sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
        sendJson(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle POST /capture/pause
 */
async function handleCapturePause(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = (await parseJsonBody(req)) as { sessionId?: string };

        if (!body.sessionId || typeof body.sessionId !== 'string') {
            sendJson(res, 400, { ok: false, error: 'Missing or invalid sessionId' });
            return;
        }

        const result = await pauseCapture(body.sessionId);
        sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
        sendJson(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle POST /capture/resume
 */
async function handleCaptureResume(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = (await parseJsonBody(req)) as { sessionId?: string };

        if (!body.sessionId || typeof body.sessionId !== 'string') {
            sendJson(res, 400, { ok: false, error: 'Missing or invalid sessionId' });
            return;
        }

        const result = await resumeCapture(body.sessionId);
        sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
        sendJson(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle GET /capture/status
 */
function handleCaptureStatus(_req: IncomingMessage, res: ServerResponse): void {
    const sessions = getActiveSessions();
    sendJson(res, 200, {
        ok: true,
        activeSessions: sessions,
        sidecarAvailable: isSidecarAvailable(),
    });
}

/**
 * Handle GET /health
 */
function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    const deepgramConfigured = !!process.env.DEEPGRAM_API_KEY && process.env.DEEPGRAM_API_KEY !== 'your_deepgram_api_key_here';

    sendJson(res, 200, {
        status: 'ok',
        service: 'selly-agent',
        version: '0.1.0',
        platform: process.platform,
        sidecarAvailable: isSidecarAvailable(),
        deepgramConfigured,
        activeSessions: getActiveSessions().length,
        timestamp: new Date().toISOString(),
    });
}

/**
 * Handle GET /diagnostic
 * Comprehensive diagnostic endpoint for debugging
 */
function handleDiagnostic(_req: IncomingMessage, res: ServerResponse): void {
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY || '';
    const deepgramConfigured = !!deepgramApiKey && deepgramApiKey !== 'your_deepgram_api_key_here';

    const diagnostic = {
        status: 'ok',
        service: 'selly-agent',
        timestamp: new Date().toISOString(),
        platform: {
            os: process.platform,
            nodeVersion: process.version,
            arch: process.arch,
        },
        configuration: {
            agentPort: PORT,
            backendUrl: process.env.BACKEND_URL || 'not set',
            deepgramConfigured,
            deepgramKeyLength: deepgramApiKey ? deepgramApiKey.length : 0,
            deepgramKeyPrefix: deepgramApiKey ? deepgramApiKey.substring(0, 8) + '...' : 'not set',
        },
        sidecar: {
            available: isSidecarAvailable(),
            platform: process.platform === 'win32' ? 'supported' : 'unsupported',
        },
        sessions: {
            active: getActiveSessions(),
            count: getActiveSessions().length,
        },
        checks: {
            deepgramReady: deepgramConfigured && isSidecarAvailable(),
            canStartCapture: process.platform === 'win32' && isSidecarAvailable(),
            canTranscribe: deepgramConfigured,
        },
        warnings: [] as string[],
    };

    // Add warnings
    if (!deepgramConfigured) {
        diagnostic.warnings.push('DEEPGRAM_API_KEY not configured - transcription disabled');
    }
    if (!isSidecarAvailable()) {
        diagnostic.warnings.push('Sidecar executable not found - run "npm run build:sidecar"');
    }
    if (process.platform !== 'win32') {
        diagnostic.warnings.push('Audio capture only supported on Windows');
    }

    sendJson(res, 200, diagnostic);
}

/**
 * Handle GET /capture/:sessionId/transcript-stream
 * Stream transcripts as Server-Sent Events
 */
async function handleTranscriptStream(
    sessionId: string,
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'string') {
        sendJson(res, 400, { ok: false, error: 'Invalid sessionId' });
        return;
    }

    // Check if capture session exists
    const activeSessions = getActiveSessions();
    const sessionExists = activeSessions.includes(sessionId);

    console.log(`[sse] Transcript stream request for session ${sessionId}, active: ${sessionExists}, all sessions: [${activeSessions.join(', ')}]`);

    if (!sessionExists) {
        console.warn(`[sse] Session ${sessionId} not found in active sessions. Client will retry.`);
        sendJson(res, 404, {
            ok: false,
            error: `No active capture session for sessionId: ${sessionId}`,
        });
        return;
    }

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });

    // Send initial connection event
    const connectEvent = {
        type: 'connection-established',
        sessionId,
        timestamp: Date.now(),
    };
    res.write(`data: ${JSON.stringify(connectEvent)}\n\n`);

    // Register client and get unsubscribe function
    const unsubscribe = sseManager.registerClient(sessionId, res);

    console.log(
        `[sse] Client connected for session ${sessionId}. ` +
        `Total clients: ${sseManager.getClientCount(sessionId)}`
    );

    // Handle client disconnect
    req.on('close', () => {
        unsubscribe();
        console.log(
            `[sse] Client disconnected for session ${sessionId}. ` +
            `Remaining clients: ${sseManager.getClientCount(sessionId)}`
        );
    });

    req.on('error', (err) => {
        console.error(`[sse] Request error for ${sessionId}:`, err.message);
        unsubscribe();
    });
}

/**
 * Main request handler
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    console.log(`[agent] ${method} ${url}`);

    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Route requests
    if (url === '/capture/start' && method === 'POST') {
        await handleCaptureStart(req, res);
    } else if (url === '/capture/stop' && method === 'POST') {
        await handleCaptureStop(req, res);
    } else if (url === '/capture/pause' && method === 'POST') {
        await handleCapturePause(req, res);
    } else if (url === '/capture/resume' && method === 'POST') {
        await handleCaptureResume(req, res);
    } else if (url === '/capture/status' && method === 'GET') {
        handleCaptureStatus(req, res);
    } else if (url === '/health' && method === 'GET') {
        handleHealth(req, res);
    } else if (url === '/diagnostic' && method === 'GET') {
        handleDiagnostic(req, res);
    } else {
        // Check for SSE transcript stream endpoint
        const transcriptStreamMatch = url.match(/^\/capture\/([^/]+)\/transcript-stream$/);
        if (transcriptStreamMatch && method === 'GET') {
            const sessionId = transcriptStreamMatch[1];
            await handleTranscriptStream(sessionId, req, res);
        } else {
            sendJson(res, 404, { ok: false, error: 'Not found' });
        }
    }
}

/**
 * Start the HTTP server
 */
export function startServer(): void {
    const server = createServer((req, res) => {
        handleRequest(req, res).catch((err) => {
            console.error('[agent] Unhandled error:', err);
            sendJson(res, 500, { ok: false, error: 'Internal server error' });
        });
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n[agent] Shutting down...');
        await stopAllCaptures();
        server.close(() => {
            console.log('[agent] Server closed');
            process.exit(0);
        });
    });

    process.on('SIGTERM', async () => {
        console.log('\n[agent] Received SIGTERM...');
        await stopAllCaptures();
        server.close(() => {
            process.exit(0);
        });
    });

    server.listen(PORT, () => {
        console.log(`[agent] Server listening on port ${PORT}`);
        console.log(`[agent] Platform: ${process.platform}`);
        console.log(`[agent] Sidecar available: ${isSidecarAvailable()}`);
    });
}
