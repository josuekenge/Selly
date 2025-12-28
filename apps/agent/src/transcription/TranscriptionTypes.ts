// Transcription Types
// Type definitions for transcription module

export interface PartialTranscript {
    text: string;
    confidence: number;
    timestamp: number;
}

export interface FinalTranscript {
    text: string;
    confidence: number;
    startTime: number;
    endTime: number;
    speaker?: string;
}

// Streaming session tracking
export interface StreamingSession {
    sessionId: string;
    startedAt: number;
    deepgramConnected: boolean;
    bytesSent: number;
    transcriptCount: number;
    lastEventAt?: number;
}

// Real-time transcript event (from stream)
export interface StreamTranscriptEvent {
    sessionId: string;
    type: 'interim' | 'final';
    speaker: 'rep' | 'prospect' | 'unknown';
    text: string;
    confidence: number;
    startTime: number;
    endTime: number;
    isFinal: boolean;
    sequenceId?: number;
}
