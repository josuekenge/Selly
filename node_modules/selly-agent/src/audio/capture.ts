// Audio Capture Module
// Windows-only dual audio capture via Rust sidecar
// MIC (left) + WASAPI loopback (right) -> stereo WAV
//
// NO transcription, NO AI, NO secrets in logs

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

    // Spawn the sidecar process
    const child = spawn(SIDECAR_PATH, [
        '--session', sessionId,
        '--out', outputPath,
        '--sample-rate', '48000',
        '--channels', '2',
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });

    // Log stdout/stderr without secrets
    child.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[capture:${sessionId}] ${msg}`);
    });

    child.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error(`[capture:${sessionId}] ${msg}`);
    });

    // Clean up on exit
    child.on('exit', (code) => {
        console.log(`[capture:${sessionId}] Process exited with code ${code}`);
        activeCaptures.delete(sessionId);
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
