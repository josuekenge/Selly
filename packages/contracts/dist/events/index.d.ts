export interface AudioCaptureStartedEvent {
    readonly type: 'audio.capture.started';
    readonly payload: {
        readonly sessionId: string;
        readonly timestamp: number;
    };
}
export interface AudioCaptureStoppedEvent {
    readonly type: 'audio.capture.stopped';
    readonly payload: {
        readonly sessionId: string;
        readonly timestamp: number;
        readonly durationMs: number;
    };
}
export interface TranscriptReceivedEvent {
    readonly type: 'transcript.received';
    readonly payload: {
        readonly sessionId: string;
        readonly text: string;
        readonly isFinal: boolean;
        readonly confidence: number;
        readonly timestamp: number;
    };
}
export interface QuestionDetectedEvent {
    readonly type: 'question.detected';
    readonly payload: {
        readonly sessionId: string;
        readonly question: string;
        readonly confidence: number;
        readonly timestamp: number;
    };
}
export interface SuggestionGeneratedEvent {
    readonly type: 'suggestion.generated';
    readonly payload: {
        readonly sessionId: string;
        readonly questionId: string;
        readonly suggestion: string;
        readonly sources: readonly string[];
        readonly timestamp: number;
    };
}
export interface CallStartedEvent {
    readonly type: 'call.started';
    readonly payload: {
        readonly callId: string;
        readonly workspaceId: string;
        readonly userId: string;
        readonly timestamp: number;
    };
}
export interface CallEndedEvent {
    readonly type: 'call.ended';
    readonly payload: {
        readonly callId: string;
        readonly durationMs: number;
        readonly timestamp: number;
    };
}
export type DomainEvent = AudioCaptureStartedEvent | AudioCaptureStoppedEvent | TranscriptReceivedEvent | QuestionDetectedEvent | SuggestionGeneratedEvent | CallStartedEvent | CallEndedEvent;
//# sourceMappingURL=index.d.ts.map