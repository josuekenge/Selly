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
export interface StreamingSession {
    sessionId: string;
    startedAt: number;
    deepgramConnected: boolean;
    bytesSent: number;
    transcriptCount: number;
    lastEventAt?: number;
}
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
//# sourceMappingURL=TranscriptionTypes.d.ts.map