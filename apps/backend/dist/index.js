// Selly Backend - Entry Point
// V1 Sales Copilot Backend API
// 
// Architecture: Modular Monolith (per SPEC.md)
// - One deployable backend service
// - All modules run in the same process
// - Modules are logically isolated by folders and interfaces
// - Background job worker for async processing (Step 7)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import smokeTestRouter from './api/smoke-test.js';
import apiRoutes from './api/routes.js';
import jobRoutes from './api/jobRoutes.js';
import { startWorker, stopWorker, isWorkerRunning } from './jobs/index.js';
import { isSupabaseConfigured } from './services/supabase.js';
import { globalErrorHandler, notFoundHandler, requestLogger } from './api/middleware.js';
const app = express();
const PORT = process.env.PORT ?? 3000;
// ============================================
// MIDDLEWARE
// ============================================
// CORS - Allow all origins in development
app.use(cors({
    origin: true, // Reflect the request origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));
// Body parsing
app.use(express.json({ limit: '50mb' }));
// Request logging
app.use(requestLogger);
// ============================================
// ROUTES
// ============================================
// Health endpoint with detailed status
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'selly-backend',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        worker: isWorkerRunning() ? 'running' : 'stopped',
        services: {
            supabase: isSupabaseConfigured(),
        },
    });
});
// Smoke test endpoint
app.use('/smoke-test', smokeTestRouter);
// API routes (Step 4.5)
app.use('/api', apiRoutes);
// Job routes (Step 7)
app.use('/api', jobRoutes);
// ============================================
// ERROR HANDLING
// ============================================
// 404 handler - must be after all routes
app.use(notFoundHandler);
// Global error handler - must be LAST
app.use(globalErrorHandler);
// ============================================
// SERVER STARTUP
// ============================================
const server = app.listen(PORT, () => {
    console.log(`[index] Backend ready on port ${PORT}`);
    // Start job worker if Supabase is configured
    if (isSupabaseConfigured()) {
        startWorker();
        console.log('[index] Job worker started');
    }
    else {
        console.log('[index] Supabase not configured - job worker disabled');
    }
});
// ============================================
// GRACEFUL SHUTDOWN
// ============================================
function shutdown(signal) {
    console.log(`[index] ${signal} received, shutting down gracefully...`);
    stopWorker();
    server.close(() => {
        console.log('[index] Server closed');
        process.exit(0);
    });
    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
        console.error('[index] Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// ============================================
// UNHANDLED ERRORS (Last resort)
// ============================================
process.on('uncaughtException', (error) => {
    console.error('[index] CRITICAL: Uncaught exception:', error);
    // Log and exit - process manager (PM2, Docker) should restart
    shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[index] WARNING: Unhandled promise rejection:', reason);
    // Don't exit on unhandled rejections in Node 16+, but log them
});
//# sourceMappingURL=index.js.map