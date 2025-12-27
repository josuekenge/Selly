// Selly Backend - Entry Point
// V1 Sales Copilot Backend API
// 
// Architecture: Modular Monolith (per SPEC.md)
// - One deployable backend service
// - All modules run in the same process
// - Modules are logically isolated by folders and interfaces
// - No microservices, no message queues
//
// Current phase: Bootstrap only
import express from 'express';
const app = express();
const PORT = process.env.PORT ?? 3000;
// Middleware
app.use(express.json());
// Health endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'selly-backend',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`Backend ready on port ${PORT}`);
});
//# sourceMappingURL=index.js.map