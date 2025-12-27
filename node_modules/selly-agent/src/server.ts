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
    getActiveSessions,
    isSidecarAvailable,
    stopAllCaptures,
} from './audio/capture.js';

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
    sendJson(res, 200, {
        status: 'ok',
        service: 'selly-agent',
        version: '0.1.0',
        platform: process.platform,
        sidecarAvailable: isSidecarAvailable(),
        timestamp: new Date().toISOString(),
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
    } else if (url === '/capture/status' && method === 'GET') {
        handleCaptureStatus(req, res);
    } else if (url === '/health' && method === 'GET') {
        handleHealth(req, res);
    } else {
        sendJson(res, 404, { ok: false, error: 'Not found' });
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
