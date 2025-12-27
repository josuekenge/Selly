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

const app = express();
const PORT = process.env.PORT ?? 3000;

// CORS - Allow all origins in development
app.use(cors({
    origin: true, // Reflect the request origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

// Middleware
app.use(express.json({ limit: '50mb' }));

// Health endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'selly-backend',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        worker: isWorkerRunning() ? 'running' : 'stopped',
    });
});

// Smoke test endpoint
app.use('/smoke-test', smokeTestRouter);

// API routes (Step 4.5)
app.use('/api', apiRoutes);

// Job routes (Step 7)
app.use('/api', jobRoutes);

// Start server
const server = app.listen(PORT, () => {
    console.log(`Backend ready on port ${PORT}`);

    // Start job worker if Supabase is configured
    if (isSupabaseConfigured()) {
        startWorker();
    } else {
        console.log('[index] Supabase not configured - job worker disabled');
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[index] SIGTERM received, shutting down...');
    stopWorker();
    server.close(() => {
        console.log('[index] Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('[index] SIGINT received, shutting down...');
    stopWorker();
    server.close(() => {
        console.log('[index] Server closed');
        process.exit(0);
    });
});
