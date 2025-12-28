// In-Memory Store
// Development-only storage for call data when Supabase is unavailable
// NO secrets in logs, NO production use

export interface CallRecord {
    sessionId: string;
    workspaceId: string;
    status: 'active' | 'processing' | 'completed' | 'error';
    createdAt: number;
    endedAt?: number;
    audioPath?: string;
    transcript?: TranscriptRecord[];
    summary?: { title: string; bullets: string[]; fullText: string } | string;
    signals3a?: unknown;
    signals3b?: unknown;
    recommendations?: unknown;
    metadata?: Record<string, unknown>;
    error?: string;
}

export interface TranscriptRecord {
    speaker: 'rep' | 'prospect';
    text: string;
    startedAt: number;
    endedAt: number;
    confidence: number;
}

// In-memory store for development
const callStore = new Map<string, CallRecord>();

/**
 * Create a new call record
 */
export function createCall(sessionId: string, workspaceId: string = 'default'): CallRecord {
    const record: CallRecord = {
        sessionId,
        workspaceId,
        status: 'active',
        createdAt: Date.now(),
    };
    callStore.set(sessionId, record);
    return record;
}

/**
 * Get a call record by sessionId
 */
export function getCall(sessionId: string): CallRecord | undefined {
    return callStore.get(sessionId);
}

/**
 * Update a call record
 */
export function updateCall(sessionId: string, updates: Partial<CallRecord>): CallRecord | undefined {
    const existing = callStore.get(sessionId);
    if (!existing) return undefined;

    const updated = { ...existing, ...updates };
    callStore.set(sessionId, updated);
    return updated;
}

/**
 * Delete a call record
 */
export function deleteCall(sessionId: string): boolean {
    return callStore.delete(sessionId);
}

/**
 * Get all call records
 */
export function getAllCalls(): CallRecord[] {
    return Array.from(callStore.values());
}

/**
 * Check if a call exists
 */
export function hasCall(sessionId: string): boolean {
    return callStore.has(sessionId);
}
