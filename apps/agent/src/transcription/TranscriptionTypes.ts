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

export interface TranscriptionSession {
    id: string;
    startedAt: Date;
    endedAt?: Date;
    transcripts: FinalTranscript[];
}
