// Selly Local Agent - Entry Point
// V1 Sales Copilot Local Agent
// 
// This agent runs as a local background process.
// Responsibilities (per SPEC.md):
// - Audio capture
// - Device management
// - Transcription streaming
// - Question detection
//
// Current phase: Audio capture via HTTP server
import { startServer } from './server.js';
console.log('Selly Agent starting...');
startServer();
//# sourceMappingURL=index.js.map