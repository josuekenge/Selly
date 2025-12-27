// Shared Contracts
// RULES (from Spec.md):
// - No logic
// - No helpers  
// - No data access
// - Only DTOs, event schemas, request/response shapes
// - If something needs logic, it lives in a module, not here

// ============================================
// EVENT SCHEMAS
// ============================================

export interface AudioCaptureStartedEvent {
    type: 'audio.capture.started';
    payload: {
        sessionId: string;
        timestamp: number;
    };
}

export interface AudioCaptureStoppedEvent {
    type: 'audio.capture.stopped';
    payload: {
        sessionId: string;
        timestamp: number;
        durationMs: number;
    };
}

export interface TranscriptReceivedEvent {
    type: 'transcript.received';
    payload: {
        sessionId: string;
        text: string;
        isFinal: boolean;
        timestamp: number;
    };
}

export interface QuestionDetectedEvent {
    type: 'question.detected';
    payload: {
        sessionId: string;
        question: string;
        timestamp: number;
    };
}

export interface SuggestionGeneratedEvent {
    type: 'suggestion.generated';
    payload: {
        sessionId: string;
        questionId: string;
        suggestion: string;
        sources: string[];
        timestamp: number;
    };
}

export type DomainEvent =
    | AudioCaptureStartedEvent
    | AudioCaptureStoppedEvent
    | TranscriptReceivedEvent
    | QuestionDetectedEvent
    | SuggestionGeneratedEvent;

// ============================================
// REQUEST/RESPONSE SHAPES
// ============================================

export interface StartCallRequest {
    workspaceId: string;
}

export interface StartCallResponse {
    callId: string;
    sessionId: string;
}

export interface EndCallRequest {
    callId: string;
}

export interface EndCallResponse {
    callId: string;
    summary?: string;
}

export interface GetSuggestionRequest {
    question: string;
    workspaceId: string;
    context?: string;
}

export interface GetSuggestionResponse {
    suggestion: string;
    confidence: number;
    sources: string[];
}

export interface IngestKnowledgeRequest {
    workspaceId: string;
    title: string;
    content: string;
}

export interface IngestKnowledgeResponse {
    documentId: string;
}

// ============================================
// SHARED DTOs
// ============================================

export interface UserDTO {
    id: string;
    email: string;
    workspaceId: string;
}

export interface WorkspaceDTO {
    id: string;
    name: string;
}

export interface CallDTO {
    id: string;
    workspaceId: string;
    status: 'active' | 'completed' | 'failed';
    startedAt: string;
    endedAt?: string;
}

export interface TranscriptDTO {
    id: string;
    callId: string;
    text: string;
    createdAt: string;
}

export interface KnowledgeDocumentDTO {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}
