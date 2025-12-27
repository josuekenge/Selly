// API Contracts
// Shared request/response shapes for Backend API
// 
// RULES (from SPEC.md):
// - No logic
// - No helpers
// - No data access
// - Only interfaces, types, and enums

// ============================================
// COMMON DTOs
// ============================================

export interface UserDTO {
    readonly id: string;
    readonly email: string;
    readonly workspaceId: string;
}

export interface WorkspaceDTO {
    readonly id: string;
    readonly name: string;
}

export interface CallDTO {
    readonly id: string;
    readonly workspaceId: string;
    readonly userId: string;
    readonly status: CallStatus;
    readonly startedAt: string;
    readonly endedAt?: string;
}

export interface TranscriptDTO {
    readonly id: string;
    readonly callId: string;
    readonly text: string;
    readonly createdAt: string;
}

export interface KnowledgeDocumentDTO {
    readonly id: string;
    readonly title: string;
    readonly workspaceId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

// ============================================
// ENUMS
// ============================================

export enum CallStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    FAILED = 'failed',
}

// ============================================
// CALL API
// ============================================

export interface StartCallRequest {
    readonly workspaceId: string;
}

export interface StartCallResponse {
    readonly callId: string;
    readonly sessionId: string;
}

export interface EndCallRequest {
    readonly callId: string;
}

export interface EndCallResponse {
    readonly callId: string;
    readonly summary?: string;
}

// ============================================
// SUGGESTION API
// ============================================

export interface GetSuggestionRequest {
    readonly question: string;
    readonly workspaceId: string;
    readonly context?: string;
}

export interface GetSuggestionResponse {
    readonly suggestion: string;
    readonly confidence: number;
    readonly sources: readonly string[];
}

// ============================================
// KNOWLEDGE API
// ============================================

export interface IngestKnowledgeRequest {
    readonly workspaceId: string;
    readonly title: string;
    readonly content: string;
}

export interface IngestKnowledgeResponse {
    readonly documentId: string;
}

// ============================================
// HEALTH API
// ============================================

export interface HealthResponse {
    readonly status: 'ok' | 'degraded' | 'down';
    readonly service: string;
    readonly version: string;
    readonly timestamp: string;
}
