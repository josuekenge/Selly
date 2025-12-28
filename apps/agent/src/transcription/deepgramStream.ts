// Deepgram WebSocket Streaming Client
// Manages WebSocket connection to Deepgram Live API and handles reconnection

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type {
    DeepgramStreamConfig,
    DeepgramMessage,
    DeepgramResultsMessage,
    TranscriptStreamEvent,
    StreamStatus,
} from './deepgramTypes.js';

export class DeepgramStream extends EventEmitter {
    private ws: WebSocket | null = null;
    private sessionId: string;
    private config: DeepgramStreamConfig;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private isConnecting = false;
    private isClosed = false;
    private bytesSent = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;

    constructor(sessionId: string, config: DeepgramStreamConfig) {
        super();
        this.sessionId = sessionId;
        this.config = {
            model: 'nova-2',
            diarize: true,
            interim_results: true,
            encoding: 'linear16',
            sample_rate: 48000,
            channels: 2,
            punctuate: true,
            smart_format: true,
            utterances: true,
            vad_events: false,
            multichannel: true,
            ...config,
        };
    }

    async connect(): Promise<void> {
        if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
            return;
        }

        this.isConnecting = true;
        this.isClosed = false;

        try {
            const url = this.buildWebSocketUrl();
            console.log(`[deepgram:${this.sessionId}] Connecting to Deepgram...`);

            this.ws = new WebSocket(url, {
                headers: {
                    Authorization: `Token ${this.config.apiKey}`,
                },
            });

            this.setupEventHandlers();

            // Wait for connection
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.ws!.once('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.ws!.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });

            this.isConnecting = false;
            this.reconnectAttempts = 0;
            console.log(`[deepgram:${this.sessionId}] Connected successfully`);
            this.emit('open');
        } catch (error) {
            this.isConnecting = false;
            console.error(`[deepgram:${this.sessionId}] Connection failed:`, error);
            this.emit('error', error);

            if (this.reconnectAttempts < this.maxReconnectAttempts && !this.isClosed) {
                await this.reconnect();
            } else {
                this.emit('fatal_error', new Error('Max reconnection attempts reached'));
            }
        }
    }

    sendAudioChunk(chunk: Buffer | Uint8Array): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(chunk);
                this.bytesSent += chunk.length;
            } catch (error) {
                console.error(`[deepgram:${this.sessionId}] Failed to send audio chunk:`, error);
                this.emit('error', error);
            }
        } else {
            console.warn(`[deepgram:${this.sessionId}] Cannot send audio: WebSocket not open`);
        }
    }

    async disconnect(): Promise<void> {
        console.log(`[deepgram:${this.sessionId}] Disconnecting...`);
        this.isClosed = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            // Send close frame to Deepgram
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(1000, 'Client disconnect');
            }

            // Wait a bit for graceful close
            await new Promise((resolve) => setTimeout(resolve, 100));

            this.ws.removeAllListeners();
            this.ws = null;
        }

        console.log(`[deepgram:${this.sessionId}] Disconnected. Bytes sent: ${this.bytesSent}`);
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    getStatus(): StreamStatus {
        return {
            connected: this.isConnected(),
            reconnecting: this.isConnecting,
            error: undefined,
        };
    }

    private buildWebSocketUrl(): string {
        const params = new URLSearchParams({
            model: this.config.model!,
            diarize: this.config.diarize!.toString(),
            interim_results: this.config.interim_results!.toString(),
            encoding: this.config.encoding!,
            sample_rate: this.config.sample_rate!.toString(),
            channels: this.config.channels!.toString(),
            punctuate: this.config.punctuate!.toString(),
            smart_format: this.config.smart_format!.toString(),
            utterances: this.config.utterances!.toString(),
            vad_events: this.config.vad_events!.toString(),
            multichannel: this.config.multichannel!.toString(),
        });

        return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    }

    private setupEventHandlers(): void {
        if (!this.ws) return;

        this.ws.on('message', (data: Buffer) => {
            this.handleMessage(data);
        });

        this.ws.on('error', (error: Error) => {
            console.error(`[deepgram:${this.sessionId}] WebSocket error:`, error);
            this.emit('error', error);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
            console.log(
                `[deepgram:${this.sessionId}] WebSocket closed: ${code} - ${reason.toString()}`
            );
            this.emit('close', { code, reason: reason.toString() });

            // Attempt reconnection if not intentionally closed
            if (!this.isClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnect();
            }
        });
    }

    private handleMessage(data: Buffer): void {
        try {
            const message = JSON.parse(data.toString()) as DeepgramMessage;

            switch (message.type) {
                case 'Open':
                    console.log(`[deepgram:${this.sessionId}] Stream opened`);
                    break;

                case 'Metadata':
                    console.log(
                        `[deepgram:${this.sessionId}] Metadata received:`,
                        message.metadata
                    );
                    this.emit('metadata', message.metadata);
                    break;

                case 'Results':
                    this.handleTranscriptResult(message);
                    break;

                case 'UtteranceEnd':
                    this.emit('utterance_end', message);
                    break;

                case 'SpeechStarted':
                    this.emit('speech_started', message);
                    break;

                case 'Close':
                    console.log(`[deepgram:${this.sessionId}] Server closed connection`);
                    break;

                case 'Error':
                    console.error(
                        `[deepgram:${this.sessionId}] Deepgram error:`,
                        message.error,
                        message.description
                    );
                    this.emit('error', new Error(message.error));
                    break;

                default:
                    console.warn(`[deepgram:${this.sessionId}] Unknown message type:`, message);
            }
        } catch (error) {
            console.error(`[deepgram:${this.sessionId}] Failed to parse message:`, error);
        }
    }

    private handleTranscriptResult(message: DeepgramResultsMessage): void {
        const alternative = message.channel?.alternatives?.[0];
        if (!alternative || !alternative.transcript) {
            return; // Empty transcript
        }

        // Determine speaker from channel (multichannel mode)
        // channel_index is [start, end] for the channel being transcribed
        const channelId = message.channel_index?.[0] ?? 0;
        const speaker = this.channelToSpeaker(channelId);

        // Check if words have speaker diarization
        const firstWord = alternative.words?.[0];
        const speakerId = firstWord?.speaker;

        const event: TranscriptStreamEvent = {
            sessionId: this.sessionId,
            type: message.is_final ? 'final' : 'partial',
            speaker,
            text: alternative.transcript,
            confidence: alternative.confidence,
            startTime: message.start,
            endTime: message.start + message.duration,
            isFinal: message.is_final,
            speakerId,
            metadata: {
                deepgramRequestId: message.metadata?.request_id,
                duration: message.duration,
                channel: channelId,
            },
        };

        this.emit('transcript', event);

        if (message.is_final) {
            this.emit('final_transcript', event);
        } else {
            this.emit('interim_transcript', event);
        }
    }

    private channelToSpeaker(channelId: number): 'rep' | 'prospect' | 'unknown' {
        if (channelId === 0) return 'rep'; // Left channel = MIC
        if (channelId === 1) return 'prospect'; // Right channel = LOOPBACK
        return 'unknown';
    }

    private async reconnect(): Promise<void> {
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

        console.log(
            `[deepgram:${this.sessionId}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
        );

        this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                console.error(`[deepgram:${this.sessionId}] Reconnection failed:`, error);
            }
        }, delay);
    }
}
