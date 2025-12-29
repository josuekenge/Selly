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

// Load environment variables from .env file
import 'dotenv/config';

import { startServer } from './server.js';

console.log('Selly Agent starting...');
console.log('[agent] DEEPGRAM_API_KEY:', process.env.DEEPGRAM_API_KEY ? '✓ Set' : '✗ Not set');
startServer();
