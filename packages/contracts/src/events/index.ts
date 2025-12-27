// Event Contracts
// Shared event schemas for inter-module communication
// 
// RULES (from SPEC.md):
// - No logic
// - No helpers
// - No data access
// - Only interfaces, types, and enums

// ============================================
// AUDIO EVENTS
// ============================================

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

// ============================================
// TRANSCRIPTION EVENTS
// ============================================

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

// ============================================
// QUESTION/INTENT EVENTS
// ============================================

export interface QuestionDetectedEvent {
    readonly type: 'question.detected';
    readonly payload: {
        readonly sessionId: string;
        readonly question: string;
        readonly confidence: number;
        readonly timestamp: number;
    };
}

// ============================================
// SUGGESTION EVENTS
// ============================================

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

// ============================================
// CALL LIFECYCLE EVENTS
// ============================================

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

// ============================================
// UNION TYPE
// ============================================

export type DomainEvent =
    | AudioCaptureStartedEvent
    | AudioCaptureStoppedEvent
    | TranscriptReceivedEvent
    | QuestionDetectedEvent
    | SuggestionGeneratedEvent
    | CallStartedEvent
    | CallEndedEvent;
