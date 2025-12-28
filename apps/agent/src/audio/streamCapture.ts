// Stream Audio Capture with Deepgram Integration
// Spawns Rust sidecar, reads PCM frames from stdout, streams to Deepgram

import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { DeepgramStream } from '../transcription/deepgramStream.js';
import type { TranscriptStreamEvent } from '../transcription/deepgramTypes.js';
import type { StreamingSession } from '../transcription/TranscriptionTypes.js';
import { QuestionDetector } from '../intent/QuestionDetector.js';

const SIDECAR_PATH = join(__dirname, '..', '..', 'native', 'win-audio-capture', 'target', 'release', 'win-audio-capture.exe');
const RECORDINGS_DIR = join(__dirname, '..', '..', 'recordings');
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const MAX_TRANSCRIPT_BUFFER = 20; // Keep last 20 utterances for context

interface PCMFrame {
    sequence: number;
    samples: Int16Array;
    timestamp: number;
}

interface TranscriptUtterance {
    speaker: string;
    text: string;
    confidence: number;
    startedAt: number;
    endedAt: number;
}

/**
 * Trigger live recommendations on the backend when a question is detected
 */
async function triggerLiveRecommendations(
    sessionId: string,
    question: string,
    transcriptBuffer: TranscriptUtterance[]
): Promise<void> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/calls/${sessionId}/trigger-recommendations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question,
                recentTranscript: transcriptBuffer,
                timestamp: Date.now(),
            }),
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const result = await response.json();
        console.log(`[streamCapture:${sessionId}] Recommendations triggered: ${result.ok ? 'success' : 'failed'}`);
    } catch (error) {
        console.error(`[streamCapture:${sessionId}] Error calling backend:`, error);
        throw error;
    }
}

/**
 * PCM Stream Reader
 * Parses framed PCM data from Rust sidecar stdout
 */
class PCMStreamReader extends EventEmitter {
    private buffer: Buffer = Buffer.alloc(0);
    private lastSequence = -1;
    private frameCount = 0;

    onData(chunk: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);

        while (this.buffer.length >= 12) {
            // Check for magic bytes "SELL"
            if (!this.buffer.subarray(0, 4).equals(Buffer.from('SELL'))) {
                // Lost frame sync, scan for magic bytes
                const magicIndex = this.buffer.indexOf('SELL');
                if (magicIndex > 0) {
                    console.warn(`[PCM] Lost sync, skipping ${magicIndex} bytes`);
                    this.buffer = this.buffer.subarray(magicIndex);
                } else {
                    // No magic found, skip one byte and retry
                    this.buffer = this.buffer.subarray(1);
                }
                continue;
            }

            // Parse header
            const sequence = this.buffer.readUInt32LE(4);
            const frameSize = this.buffer.readUInt32LE(8);
            const totalSize = 12 + frameSize;

            if (this.buffer.length < totalSize) {
                break; // Wait for more data
            }

            // Extract PCM data
            const pcmData = this.buffer.subarray(12, totalSize);
            const samples = new Int16Array(
                pcmData.buffer,
                pcmData.byteOffset,
                frameSize / 2
            );

            // Check sequence continuity
            if (this.lastSequence >= 0 && sequence !== (this.lastSequence + 1) % 0x100000000) {
                console.warn(`[PCM] Frame gap: expected ${this.lastSequence + 1}, got ${sequence}`);
            }
            this.lastSequence = sequence;
            this.frameCount++;

            // Emit frame event
            this.emit('frame', {
                sequence,
                samples,
                timestamp: Date.now(),
            } as PCMFrame);

            // Remove processed frame from buffer
            this.buffer = this.buffer.subarray(totalSize);
        }
    }

    getFrameCount(): number {
        return this.frameCount;
    }
}

/**
 * Start streaming audio capture with Deepgram transcription
 */
export async function startStreamingCapture(
    sessionId: string,
    deepgramApiKey: string,
    onTranscript: (event: TranscriptStreamEvent) => void,
    onError?: (error: Error) => void
): Promise<{
    stop: () => Promise<void>;
    status: () => StreamingSession;
}> {
    console.log(`[streamCapture:${sessionId}] Starting streaming capture...`);

    const outputPath = join(RECORDINGS_DIR, `${sessionId}.wav`);

    // Spawn Rust sidecar
    const child: ChildProcess = spawn(SIDECAR_PATH, [
        '--session',
        sessionId,
        '--out',
        outputPath,
        '--sample-rate',
        '48000',
        '--channels',
        '2',
    ], {
        stdio: ['ignore', 'pipe', 'pipe'], // stdin=ignore, stdout=pipe, stderr=pipe
    });

    if (!child.stdout || !child.stderr) {
        throw new Error('Failed to spawn sidecar with stdout/stderr pipes');
    }

    // Create Deepgram stream
    const deepgramStream = new DeepgramStream(sessionId, {
        apiKey: deepgramApiKey,
        model: 'nova-2',
        diarize: true,
        interim_results: true,
        encoding: 'linear16',
        sample_rate: 48000,
        channels: 2,
        multichannel: true,
        punctuate: true,
        smart_format: true,
        utterances: true,
    });

    // Create PCM reader
    const pcmReader = new PCMStreamReader();
    let transcriptCount = 0;
    let lastEventAt: number | undefined;

    // Transcript buffer for question context
    const transcriptBuffer: TranscriptUtterance[] = [];

    // Connect to Deepgram
    try {
        await deepgramStream.connect();
    } catch (error) {
        console.error(`[streamCapture:${sessionId}] Failed to connect to Deepgram:`, error);
        child.kill('SIGTERM');
        throw error;
    }

    // Listen to PCM frames from sidecar stdout
    child.stdout.on('data', (data: Buffer) => {
        pcmReader.onData(data);
    });

    // Log stderr (sidecar errors/info)
    child.stderr.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
            console.log(`[sidecar:${sessionId}] ${msg}`);
        }
    });

    // Forward PCM frames to Deepgram
    pcmReader.on('frame', (frame: PCMFrame) => {
        // Convert Int16Array to Buffer for WebSocket transmission
        const buffer = Buffer.from(frame.samples.buffer);
        deepgramStream.sendAudioChunk(buffer);

        // Log progress every 10 frames (~1 second)
        if (frame.sequence % 10 === 0) {
            console.log(`[streamCapture:${sessionId}] PCM frame ${frame.sequence}, ${frame.samples.length / 2} stereo pairs`);
        }
    });

    // Forward Deepgram transcripts to callback
    deepgramStream.on('transcript', (event: TranscriptStreamEvent) => {
        transcriptCount++;
        lastEventAt = Date.now();

        // Store final transcripts in buffer for question context
        if (event.isFinal && event.text && event.speaker) {
            const utterance: TranscriptUtterance = {
                speaker: event.speaker,
                text: event.text,
                confidence: event.confidence || 0,
                startedAt: event.startTime || Date.now(),
                endedAt: event.endTime || Date.now(),
            };

            transcriptBuffer.push(utterance);

            // Keep only last N utterances
            if (transcriptBuffer.length > MAX_TRANSCRIPT_BUFFER) {
                transcriptBuffer.shift();
            }

            // Detect questions in final transcripts
            const detection = QuestionDetector.detect(event.text);
            if (detection.isQuestion && detection.confidence > 0.6) {
                console.log(`[streamCapture:${sessionId}] Question detected: "${event.text}" (confidence: ${detection.confidence}, type: ${detection.questionType})`);

                // Trigger live recommendations by calling backend
                triggerLiveRecommendations(sessionId, event.text, transcriptBuffer).catch(err => {
                    console.error(`[streamCapture:${sessionId}] Failed to trigger recommendations:`, err);
                });
            }
        }

        onTranscript(event);
    });

    // Handle Deepgram errors
    deepgramStream.on('error', (error: Error) => {
        console.error(`[streamCapture:${sessionId}] Deepgram error:`, error);
        onError?.(error);
    });

    // Handle sidecar exit
    child.on('exit', (code, signal) => {
        console.log(`[streamCapture:${sessionId}] Sidecar exited: code=${code}, signal=${signal}`);
    });

    child.on('error', (error) => {
        console.error(`[streamCapture:${sessionId}] Sidecar error:`, error);
        onError?.(error);
    });

    const startedAt = Date.now();

    // Return controller
    return {
        stop: async (): Promise<void> => {
            console.log(`[streamCapture:${sessionId}] Stopping streaming capture...`);

            // Stop sidecar (SIGINT for graceful shutdown)
            child.kill('SIGINT');

            // Wait for sidecar to exit (with timeout)
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    console.warn(`[streamCapture:${sessionId}] Sidecar didn't exit gracefully, forcing kill`);
                    child.kill('SIGKILL');
                    resolve();
                }, 5000);

                child.once('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            // Disconnect Deepgram
            await deepgramStream.disconnect();

            console.log(`[streamCapture:${sessionId}] Stopped. Frames: ${pcmReader.getFrameCount()}, Transcripts: ${transcriptCount}`);
        },

        status: (): StreamingSession => {
            return {
                sessionId,
                startedAt,
                deepgramConnected: deepgramStream.isConnected(),
                bytesSent: (deepgramStream as any).bytesSent || 0,
                transcriptCount,
                lastEventAt,
            };
        },
    };
}
