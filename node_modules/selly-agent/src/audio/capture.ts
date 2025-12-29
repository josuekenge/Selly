// Audio Capture Module
// Windows-only dual audio capture via Rust sidecar
// MIC (left) + WASAPI loopback (right) -> stereo WAV
// Now with LIVE TRANSCRIPTION via Deepgram streaming

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveTranscriber } from '../transcription/LiveTranscriber.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the Rust sidecar executable
// At runtime, __dirname is dist/audio/, so we go up to dist/, then up to agent root
const SIDECAR_PATH = join(__dirname, '..', '..', 'native', 'win-audio-capture', 'target', 'release', 'win-audio-capture.exe');

// Debug: Log the resolved path on startup
console.log('[capture] Looking for sidecar at:', SIDECAR_PATH);

// Recordings directory
const RECORDINGS_DIR = join(__dirname, '..', '..', 'recordings');

// Map of active capture sessions
const activeCaptures = new Map<string, ChildProcess>();

// Map of active live transcribers
const activeLiveTranscribers = new Map<string, LiveTranscriber>();

// Map of paused sessions
const pausedSessions = new Set<string>();

// Deepgram API Key (from environment)
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';

export interface CaptureStartResult {
    ok: boolean;
    sessionId: string;
    outputPath: string;
    error?: string;
}

export interface CaptureStopResult {
    ok: boolean;
    sessionId: string;
    outputPath: string;
    bytesWritten?: number;
    fileBase64?: string;  // Base64-encoded file content for direct upload
    error?: string;
}

/**
 * Ensures the recordings directory exists.
 */
function ensureRecordingsDir(): void {
    if (!existsSync(RECORDINGS_DIR)) {
        mkdirSync(RECORDINGS_DIR, { recursive: true });
    }
}

/**
 * Generates the deterministic output path for a session.
 */
export function getOutputPath(sessionId: string): string {
    return join(RECORDINGS_DIR, `${sessionId}.wav`);
}

/**
 * Checks if the Rust sidecar executable exists.
 */
export function isSidecarAvailable(): boolean {
    return existsSync(SIDECAR_PATH);
}

/**
 * Checks if a capture session is currently active.
 */
export function isSessionActive(sessionId: string): boolean {
    return activeCaptures.has(sessionId);
}

/**
 * Starts audio capture for a session.
 * Spawns the Rust sidecar to capture MIC + loopback to stereo WAV.
 * Also starts live transcription via Deepgram if API key is available.
 */
export async function startCapture(sessionId: string): Promise<CaptureStartResult> {
    // Fail fast on non-Windows
    if (process.platform !== 'win32') {
        return {
            ok: false,
            sessionId,
            outputPath: '',
            error: 'Audio capture is only supported on Windows',
        };
    }

    // Check if sidecar exists
    if (!isSidecarAvailable()) {
        return {
            ok: false,
            sessionId,
            outputPath: '',
            error: `Sidecar not found at: ${SIDECAR_PATH}. Run 'npm run build:sidecar' first.`,
        };
    }

    // Check if session already active
    if (isSessionActive(sessionId)) {
        return {
            ok: false,
            sessionId,
            outputPath: getOutputPath(sessionId),
            error: 'Capture session already active',
        };
    }

    ensureRecordingsDir();
    const outputPath = getOutputPath(sessionId);

    // Spawn the sidecar process WITH stdout pipe (for live transcription)
    const child = spawn(SIDECAR_PATH, [
        '--session', sessionId,
        '--out', outputPath,
        '--sample-rate', '48000',
        '--channels', '2',
    ], {
        stdio: ['ignore', 'pipe', 'pipe'], // stdout piped for PCM frames
        windowsHide: true,
    });

    // Start live transcription if Deepgram API key is available
    let liveTranscriber: LiveTranscriber | null = null;
    if (DEEPGRAM_API_KEY && child.stdout) {
        try {
            console.log(`[capture:${sessionId}] Initializing LiveTranscriber with Deepgram...`);
            liveTranscriber = new LiveTranscriber({
                sessionId,
                deepgramApiKey: DEEPGRAM_API_KEY,
                sampleRate: 48000,
                channels: 2,
            });

            // Start Deepgram connection
            console.log(`[capture:${sessionId}] Connecting to Deepgram...`);
            await liveTranscriber.start();
            console.log(`[capture:${sessionId}] Deepgram connection established`);

            // Attach to sidecar stdout for PCM frames
            console.log(`[capture:${sessionId}] Attaching to sidecar stdout stream...`);
            liveTranscriber.attachToStream(child.stdout);

            activeLiveTranscribers.set(sessionId, liveTranscriber);
            console.log(`[capture:${sessionId}] ✓ Live transcription fully enabled and streaming`);
        } catch (err) {
            console.warn(`[capture:${sessionId}] Live transcription failed to start:`, err);
            // Continue without live transcription
        }
    } else {
        if (!DEEPGRAM_API_KEY) {
            console.warn(`[capture:${sessionId}] No DEEPGRAM_API_KEY, live transcription disabled`);
        }
        // Log stderr for debugging when not transcribing
        child.stdout?.on('data', () => {
            // Discard stdout PCM data when not transcribing
        });
    }

    // Log stderr (sidecar status messages)
    child.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[capture:${sessionId}] ${msg}`);
    });

    // Clean up on exit
    child.on('exit', (code) => {
        console.log(`[capture:${sessionId}] Process exited with code ${code}`);
        activeCaptures.delete(sessionId);

        // Stop live transcriber
        const transcriber = activeLiveTranscribers.get(sessionId);
        if (transcriber) {
            transcriber.stop().catch(console.error);
            activeLiveTranscribers.delete(sessionId);
        }
    });

    child.on('error', (err) => {
        console.error(`[capture:${sessionId}] Process error: ${err.message}`);
        activeCaptures.delete(sessionId);
    });

    // Store the process
    activeCaptures.set(sessionId, child);

    // Wait a short moment to ensure process started
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check if process is still running
    if (child.killed || child.exitCode !== null) {
        activeCaptures.delete(sessionId);
        if (liveTranscriber) {
            await liveTranscriber.stop();
            activeLiveTranscribers.delete(sessionId);
        }
        return {
            ok: false,
            sessionId,
            outputPath,
            error: 'Sidecar process failed to start',
        };
    }

    return {
        ok: true,
        sessionId,
        outputPath,
    };
}

/**
 * Stops audio capture for a session.
 * Sends SIGINT to the sidecar and waits for graceful shutdown.
 * Also stops live transcription.
 */
export async function stopCapture(sessionId: string): Promise<CaptureStopResult> {
    const outputPath = getOutputPath(sessionId);

    // Check if session exists
    if (!isSessionActive(sessionId)) {
        return {
            ok: false,
            sessionId,
            outputPath,
            error: 'No active capture session found',
        };
    }

    const child = activeCaptures.get(sessionId)!;

    // Stop live transcriber first
    const transcriber = activeLiveTranscribers.get(sessionId);
    if (transcriber) {
        console.log(`[capture:${sessionId}] Stopping live transcription...`);
        await transcriber.stop();
        activeLiveTranscribers.delete(sessionId);
    }

    // Send SIGINT (works on Windows too in Node.js)
    // On Windows, this sends a ctrl+c event
    const killed = child.kill('SIGINT');

    if (!killed) {
        // Force kill if SIGINT didn't work
        child.kill('SIGKILL');
    }

    // Wait for process to exit
    await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
        }, 5000);

        child.on('exit', () => {
            clearTimeout(timeout);
            resolve();
        });
    });

    // Clean up
    activeCaptures.delete(sessionId);

    // Get file size and content if exists
    let bytesWritten: number | undefined;
    let fileBase64: string | undefined;
    if (existsSync(outputPath)) {
        try {
            const stats = statSync(outputPath);
            bytesWritten = stats.size;
            // Read and encode file for direct transfer to desktop
            const fileBuffer = readFileSync(outputPath);
            fileBase64 = fileBuffer.toString('base64');
        } catch {
            // Ignore read errors
        }
    }

    return {
        ok: true,
        sessionId,
        outputPath,
        bytesWritten,
        fileBase64,
    };
}

/**
 * Gets the list of active session IDs.
 */
export function getActiveSessions(): string[] {
    return Array.from(activeCaptures.keys());
}

/**
 * Stops all active capture sessions.
 */
export async function stopAllCaptures(): Promise<void> {
    const sessions = getActiveSessions();
    await Promise.all(sessions.map((sessionId) => stopCapture(sessionId)));
}

/**
 * Pauses audio capture and transcription for a session.
 */
export async function pauseCapture(sessionId: string): Promise<{ ok: boolean; error?: string }> {
    if (!isSessionActive(sessionId)) {
        return { ok: false, error: 'No active capture session found' };
    }

    if (pausedSessions.has(sessionId)) {
        return { ok: false, error: 'Session is already paused' };
    }

    // Pause the live transcriber (stops sending audio to Deepgram)
    const transcriber = activeLiveTranscribers.get(sessionId);
    if (transcriber) {
        transcriber.pause();
        console.log(`[capture:${sessionId}] Transcription paused`);
    }

    pausedSessions.add(sessionId);
    console.log(`[capture:${sessionId}] Session paused`);

    return { ok: true };
}

/**
 * Resumes audio capture and transcription for a session.
 */
export async function resumeCapture(sessionId: string): Promise<{ ok: boolean; error?: string }> {
    if (!isSessionActive(sessionId)) {
        return { ok: false, error: 'No active capture session found' };
    }

    if (!pausedSessions.has(sessionId)) {
        return { ok: false, error: 'Session is not paused' };
    }

    // Resume the live transcriber
    const transcriber = activeLiveTranscribers.get(sessionId);
    if (transcriber) {
        transcriber.resume();
        console.log(`[capture:${sessionId}] Transcription resumed`);
    }

    pausedSessions.delete(sessionId);
    console.log(`[capture:${sessionId}] Session resumed`);

    return { ok: true };
}

/**
 * Checks if a session is currently paused.
 */
export function isSessionPaused(sessionId: string): boolean {
    return pausedSessions.has(sessionId);
}
