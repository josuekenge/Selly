// Live Transcriber
// Reads framed PCM from sidecar stdout, sends to Deepgram, broadcasts via SSE

import { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';
import { DeepgramStream } from './deepgramStream.js';
import type { TranscriptStreamEvent } from './deepgramTypes.js';
import { sseManager } from '../sse/index.js';

// Frame format from sidecar:
// [SELL(4)] [SeqNum(4)] [Size(4)] [PCM data...]
const MAGIC_BYTES = Buffer.from('SELL');
const HEADER_SIZE = 12; // 4 + 4 + 4

interface LiveTranscriberConfig {
    sessionId: string;
    deepgramApiKey: string;
    sampleRate?: number;
    channels?: number;
}

export class LiveTranscriber extends EventEmitter {
    private sessionId: string;
    private deepgramStream: DeepgramStream;
    private buffer: Buffer = Buffer.alloc(0);
    private isRunning = false;
    private expectedSequence = 0;

    constructor(config: LiveTranscriberConfig) {
        super();
        this.sessionId = config.sessionId;

        // Create Deepgram streaming client
        this.deepgramStream = new DeepgramStream(config.sessionId, {
            apiKey: config.deepgramApiKey,
            sample_rate: config.sampleRate ?? 48000,
            channels: config.channels ?? 2,
            encoding: 'linear16',
            model: 'nova-2',
            diarize: true,
            interim_results: true,
            punctuate: true,
            smart_format: true,
            utterances: true,
            multichannel: true,
        });

        this.setupDeepgramListeners();
    }

    private setupDeepgramListeners(): void {
        // On transcript event, broadcast to SSE clients
        this.deepgramStream.on('transcript', (event: TranscriptStreamEvent) => {
            // Map to SSE TranscriptEvent format
            const sseEvent = {
                type: event.isFinal ? 'final' as const : 'partial' as const,
                sessionId: this.sessionId,
                timestamp: Date.now(),
                text: event.text,
                confidence: event.confidence,
                speaker: event.speaker,
                startTime: event.startTime,
                endTime: event.endTime,
            };

            // Broadcast to all connected SSE clients
            const clientCount = sseManager.getClientCount(this.sessionId);
            console.log(
                `[live-transcriber:${this.sessionId}] Broadcasting to ${clientCount} client(s): "${sseEvent.text?.substring(0, 50)}..."`
            );
            sseManager.broadcastTranscript(this.sessionId, sseEvent);

            // Also emit for local listeners
            this.emit('transcript', sseEvent);

            console.log(
                `[live-transcriber:${this.sessionId}] ${event.isFinal ? 'FINAL' : 'PARTIAL'} [${event.speaker}]: ${event.text}`
            );
        });

        this.deepgramStream.on('error', (error: Error) => {
            console.error(`[live-transcriber:${this.sessionId}] Deepgram error:`, error.message);
            this.emit('error', error);
        });

        this.deepgramStream.on('close', () => {
            console.log(`[live-transcriber:${this.sessionId}] Deepgram connection closed`);
        });
    }

    async start(): Promise<void> {
        if (this.isRunning) return;

        console.log(`[live-transcriber:${this.sessionId}] Starting...`);
        this.isRunning = true;

        try {
            await this.deepgramStream.connect();
            console.log(`[live-transcriber:${this.sessionId}] Connected to Deepgram`);
        } catch (error) {
            console.error(`[live-transcriber:${this.sessionId}] Failed to connect to Deepgram:`, error);
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Attach to sidecar stdout stream
     */
    attachToStream(stdout: Readable): void {
        stdout.on('data', (chunk: Buffer) => {
            this.processChunk(chunk);
        });

        stdout.on('end', () => {
            console.log(`[live-transcriber:${this.sessionId}] Sidecar stdout ended`);
        });

        stdout.on('error', (err) => {
            console.error(`[live-transcriber:${this.sessionId}] Stdout error:`, err.message);
        });
    }

    /**
     * Process incoming data chunk from sidecar
     */
    private processChunk(chunk: Buffer): void {
        // Accumulate data
        this.buffer = Buffer.concat([this.buffer, chunk]);

        // Parse frames
        while (this.buffer.length >= HEADER_SIZE) {
            // Look for magic bytes
            const magicIndex = this.buffer.indexOf(MAGIC_BYTES);

            if (magicIndex === -1) {
                // No magic found, discard buffer (shouldn't happen in normal operation)
                console.warn(`[live-transcriber:${this.sessionId}] No magic found, discarding ${this.buffer.length} bytes`);
                this.buffer = Buffer.alloc(0);
                break;
            }

            if (magicIndex > 0) {
                // Discard bytes before magic
                this.buffer = this.buffer.subarray(magicIndex);
            }

            // Check if we have full header
            if (this.buffer.length < HEADER_SIZE) {
                break;
            }

            // Parse header
            const sequenceNumber = this.buffer.readUInt32LE(4);
            const frameSize = this.buffer.readUInt32LE(8);

            const totalFrameSize = HEADER_SIZE + frameSize;

            // Check if we have full frame
            if (this.buffer.length < totalFrameSize) {
                break;
            }

            // Extract PCM data
            const pcmData = this.buffer.subarray(HEADER_SIZE, totalFrameSize);

            // Check sequence
            if (sequenceNumber !== this.expectedSequence) {
                console.warn(
                    `[live-transcriber:${this.sessionId}] Sequence gap: expected ${this.expectedSequence}, got ${sequenceNumber}`
                );
            }
            this.expectedSequence = sequenceNumber + 1;

            // Send to Deepgram
            if (this.deepgramStream.isConnected()) {
                this.deepgramStream.sendAudioChunk(pcmData);
            }

            // Remove processed frame from buffer
            this.buffer = this.buffer.subarray(totalFrameSize);
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) return;

        console.log(`[live-transcriber:${this.sessionId}] Stopping...`);
        this.isRunning = false;

        await this.deepgramStream.disconnect();
        this.buffer = Buffer.alloc(0);

        console.log(`[live-transcriber:${this.sessionId}] Stopped`);
    }
}
