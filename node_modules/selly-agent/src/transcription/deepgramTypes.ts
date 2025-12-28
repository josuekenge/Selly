// Deepgram Live API WebSocket message types
// Based on Deepgram Streaming API v1 documentation

export interface DeepgramOpenMessage {
    type: 'Open';
}

export interface DeepgramMetadataMessage {
    type: 'Metadata';
    metadata: {
        request_id: string;
        model_info: {
            name: string;
            version: string;
            arch: string;
        };
    };
}

export interface DeepgramResultsMessage {
    type: 'Results';
    channel_index: [number, number];
    duration: number;
    start: number;
    is_final: boolean;
    speech_final: boolean;
    channel: {
        alternatives: Array<{
            transcript: string;
            confidence: number;
            words: Array<{
                word: string;
                start: number;
                end: number;
                confidence: number;
                punctuated_word?: string;
                speaker?: number;
            }>;
        }>;
    };
    metadata?: {
        model_uuid: string;
        request_id: string;
    };
}

export interface DeepgramUtteranceEndMessage {
    type: 'UtteranceEnd';
    channel: number[];
    last_word_end: number;
}

export interface DeepgramSpeechStartedMessage {
    type: 'SpeechStarted';
    channel: number[];
    timestamp: number;
}

export interface DeepgramCloseMessage {
    type: 'Close';
    code?: number;
    reason?: string;
}

export interface DeepgramErrorMessage {
    type: 'Error';
    error: string;
    description?: string;
}

export type DeepgramMessage =
    | DeepgramOpenMessage
    | DeepgramMetadataMessage
    | DeepgramResultsMessage
    | DeepgramUtteranceEndMessage
    | DeepgramSpeechStartedMessage
    | DeepgramCloseMessage
    | DeepgramErrorMessage;

// Client-side transcript event (normalized from Deepgram)
export interface TranscriptStreamEvent {
    sessionId: string;
    type: 'partial' | 'final';
    speaker: 'rep' | 'prospect' | 'unknown';
    text: string;
    confidence: number;
    startTime: number;
    endTime: number;
    isFinal: boolean;
    speakerId?: number;
    metadata?: {
        deepgramRequestId?: string;
        duration?: number;
        channel?: number;
    };
}

export interface DeepgramStreamConfig {
    apiKey: string;
    model?: string; // default: 'nova-2'
    diarize?: boolean; // default: true
    interim_results?: boolean; // default: true
    encoding?: string; // default: 'linear16'
    sample_rate?: number; // default: 48000
    channels?: number; // default: 2
    punctuate?: boolean; // default: true
    smart_format?: boolean; // default: true
    utterances?: boolean; // default: true
    vad_events?: boolean; // default: false
    multichannel?: boolean; // default: true
}

export interface StreamStatus {
    connected: boolean;
    reconnecting: boolean;
    error?: string;
}
