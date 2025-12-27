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
//# sourceMappingURL=TranscriptionTypes.d.ts.map