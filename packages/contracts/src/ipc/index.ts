// IPC Contracts
// Shared type definitions for IPC between Desktop shell and Local Agent
// 
// RULES (from SPEC.md):
// - No logic
// - No helpers
// - No data access
// - Only interfaces, types, and enums

// ============================================
// IPC CHANNEL NAMES
// ============================================

export enum IPCChannel {
    // Session lifecycle
    SESSION_START = 'session:start',
    SESSION_STOP = 'session:stop',
    SESSION_STATUS = 'session:status',

    // Audio
    AUDIO_DEVICE_LIST = 'audio:device:list',
    AUDIO_DEVICE_SELECT = 'audio:device:select',

    // Transcription
    TRANSCRIPT_PARTIAL = 'transcript:partial',
    TRANSCRIPT_FINAL = 'transcript:final',

    // Suggestions
    SUGGESTION_REQUEST = 'suggestion:request',
    SUGGESTION_RESPONSE = 'suggestion:response',
}

// ============================================
// IPC MESSAGE SHAPES
// ============================================

export interface IPCMessage<T = unknown> {
    readonly channel: IPCChannel;
    readonly payload: T;
    readonly timestamp: number;
}

// ============================================
// SESSION IPC
// ============================================

export interface SessionStartRequest {
    readonly workspaceId: string;
}

export interface SessionStartResponse {
    readonly sessionId: string;
    readonly success: boolean;
    readonly error?: string;
}

export interface SessionStatusResponse {
    readonly isActive: boolean;
    readonly sessionId?: string;
    readonly startedAt?: number;
}

// ============================================
// AUDIO DEVICE IPC
// ============================================

export interface AudioDevice {
    readonly id: string;
    readonly name: string;
    readonly isDefault: boolean;
    readonly isInput: boolean;
}

export interface AudioDeviceListResponse {
    readonly devices: readonly AudioDevice[];
}

export interface AudioDeviceSelectRequest {
    readonly deviceId: string;
}

// ============================================
// SUGGESTION IPC
// ============================================

export interface SuggestionRequest {
    readonly question: string;
    readonly context?: string;
}

export interface SuggestionResponse {
    readonly suggestion: string;
    readonly confidence: number;
    readonly sources: readonly string[];
}
