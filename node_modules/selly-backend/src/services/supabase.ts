// Supabase Service
// Server-side Supabase client for storage and database operations
// Matches schema.sql table structure
// NO secrets in logs

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Storage bucket for audio files
const AUDIO_BUCKET = 'call-audio';

export interface SupabaseConfig {
    url: string;
    serviceRoleKey: string;
}

export interface SignedUploadResult {
    signedUrl: string;
    path: string;
    token?: string;
}

export interface DownloadResult {
    data: ArrayBuffer;
    contentType: string;
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
    return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Get Supabase config (throws if not configured)
 */
function getConfig(): SupabaseConfig {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Supabase is not configured');
    }
    return {
        url: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    };
}

/**
 * Create headers with service role authorization
 */
function createHeaders(serviceRoleKey: string): Record<string, string> {
    return {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
    };
}

/**
 * Make a REST API call to Supabase
 */
async function supabaseRest<T>(
    table: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    options: {
        query?: string;
        body?: unknown;
        returnData?: boolean;
    } = {}
): Promise<T | null> {
    const config = getConfig();
    const queryStr = options.query ? `?${options.query}` : '';

    const response = await fetch(
        `${config.url}/rest/v1/${table}${queryStr}`,
        {
            method,
            headers: {
                ...createHeaders(config.serviceRoleKey),
                'Content-Type': 'application/json',
                'Prefer': options.returnData ? 'return=representation' : 'return=minimal',
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        }
    );

    if (!response.ok && response.status !== 409) {
        const text = await response.text();
        console.error(`[supabase] ${method} ${table} failed:`, response.status, text);
        throw new Error(`Supabase ${method} ${table} failed: ${response.status}`);
    }

    if (options.returnData && response.status !== 204) {
        return await response.json() as T;
    }
    return null;
}

// --- Storage Functions ---

/**
 * Generate object path for audio file
 */
export function getAudioObjectPath(sessionId: string): string {
    return `calls/${sessionId}/audio.wav`;
}

/**
 * Create a signed upload URL for audio file
 */
export async function createSignedUploadUrl(
    sessionId: string,
    _contentType: string = 'audio/wav'
): Promise<SignedUploadResult> {
    const config = getConfig();
    const path = getAudioObjectPath(sessionId);

    const response = await fetch(
        `${config.url}/storage/v1/object/upload/sign/${AUDIO_BUCKET}/${path}`,
        {
            method: 'POST',
            headers: {
                ...createHeaders(config.serviceRoleKey),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ upsert: true }),
        }
    );

    if (!response.ok) {
        console.error('[supabase] Failed to create signed URL:', response.status);
        throw new Error(`Failed to create signed upload URL: ${response.status}`);
    }

    const result = await response.json() as { signedURL?: string; url?: string; token?: string };
    const signedUrl = result.signedURL || result.url || '';

    return {
        signedUrl: signedUrl.startsWith('http') ? signedUrl : `${config.url}/storage/v1${signedUrl}`,
        path,
        token: result.token,
    };
}

/**
 * Download audio file from storage
 */
export async function downloadAudio(objectPath: string): Promise<DownloadResult> {
    const config = getConfig();

    const response = await fetch(
        `${config.url}/storage/v1/object/${AUDIO_BUCKET}/${objectPath}`,
        {
            method: 'GET',
            headers: createHeaders(config.serviceRoleKey),
        }
    );

    if (!response.ok) {
        console.error('[supabase] Failed to download audio:', response.status);
        throw new Error(`Failed to download audio: ${response.status}`);
    }

    const data = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'audio/wav';

    return { data, contentType };
}

// --- Database Functions (matches schema.sql) ---

/**
 * Create a call record in the `calls` table
 */
export async function createCallRecord(
    callId: string,
    workspaceId: string,
    createdBy?: string
): Promise<void> {
    await supabaseRest('calls', 'POST', {
        body: {
            id: callId,
            workspace_id: workspaceId,
            // created_by is required in schema but we skip it for now (no auth yet)
            // Once auth is added, pass the actual user ID
            ...(createdBy && { created_by: createdBy }),
            status: 'active',
            started_at: new Date().toISOString(),
        },
    });
}

/**
 * Update a call record
 */
export async function updateCallRecord(
    callId: string,
    updates: {
        status?: 'active' | 'ended' | 'error';
        ended_at?: string;
        duration_ms?: number;
        title?: string;
    }
): Promise<void> {
    await supabaseRest('calls', 'PATCH', {
        query: `id=eq.${callId}`,
        body: { ...updates, updated_at: new Date().toISOString() },
    });
}

/**
 * Store audio object metadata in `call_audio_objects`
 */
export async function storeAudioObject(
    callId: string,
    workspaceId: string,
    objectPath: string,
    metadata?: { bytes?: number; channels?: number; sampleRate?: number }
): Promise<void> {
    await supabaseRest('call_audio_objects', 'POST', {
        body: {
            call_id: callId,
            workspace_id: workspaceId,
            object_path: objectPath,
            content_type: 'audio/wav',
            bytes: metadata?.bytes,
            channels: metadata?.channels,
            sample_rate: metadata?.sampleRate,
        },
    });
}

/**
 * Store utterances in `call_utterances`
 */
export async function storeUtterances(
    callId: string,
    workspaceId: string,
    utterances: Array<{
        seq: number;
        speaker: 'rep' | 'prospect' | 'unknown';
        text: string;
        confidence?: number;
        startedAtMs?: number;
        endedAtMs?: number;
    }>
): Promise<void> {
    if (utterances.length === 0) return;

    const rows = utterances.map(u => ({
        call_id: callId,
        workspace_id: workspaceId,
        seq: u.seq,
        speaker: u.speaker,
        text: u.text,
        confidence: u.confidence,
        started_at_ms: u.startedAtMs,
        ended_at_ms: u.endedAtMs,
    }));

    await supabaseRest('call_utterances', 'POST', { body: rows });
}

/**
 * Store summary in `call_summaries`
 */
export async function storeSummary(
    callId: string,
    workspaceId: string,
    summary: { text: string },
    version?: string,
    model?: string
): Promise<void> {
    await supabaseRest('call_summaries', 'POST', {
        body: {
            call_id: callId,
            workspace_id: workspaceId,
            summary,
            version,
            model,
        },
    });
}

/**
 * Store 3A signals in `call_signal_sets_3a`
 */
export async function storeSignals3A(
    callId: string,
    workspaceId: string,
    signals: unknown,
    version?: string
): Promise<void> {
    await supabaseRest('call_signal_sets_3a', 'POST', {
        body: {
            call_id: callId,
            workspace_id: workspaceId,
            signals,
            version,
        },
    });
}

/**
 * Store 3B signals in `call_signal_sets_3b`
 */
export async function storeSignals3B(
    callId: string,
    workspaceId: string,
    signals: unknown,
    version?: string,
    model?: string
): Promise<void> {
    await supabaseRest('call_signal_sets_3b', 'POST', {
        body: {
            call_id: callId,
            workspace_id: workspaceId,
            signals,
            version,
            model,
        },
    });
}

/**
 * Store recommendations in `call_recommendation_sets`
 */
export async function storeRecommendations(
    callId: string,
    workspaceId: string,
    recommendations: unknown,
    version?: string,
    model?: string
): Promise<void> {
    await supabaseRest('call_recommendation_sets', 'POST', {
        body: {
            call_id: callId,
            workspace_id: workspaceId,
            recommendations,
            version,
            model,
        },
    });
}

/**
 * Store call events in `call_events`
 */
export async function storeEvents(
    callId: string,
    workspaceId: string,
    events: Array<{
        seq: number;
        type: string;
        occurredAt: string;
        payload: unknown;
    }>
): Promise<void> {
    if (events.length === 0) return;

    const rows = events.map(e => ({
        call_id: callId,
        workspace_id: workspaceId,
        seq: e.seq,
        type: e.type,
        occurred_at: e.occurredAt,
        payload: e.payload,
    }));

    await supabaseRest('call_events', 'POST', { body: rows });
}

/**
 * Get a call by ID
 */
export async function getCallById(callId: string): Promise<unknown> {
    const result = await supabaseRest<unknown[]>('calls', 'GET', {
        query: `id=eq.${callId}&select=*`,
        returnData: true,
    });
    return Array.isArray(result) && result.length > 0 ? result[0] : null;
}

/**
 * Get call insights by call ID
 */
export async function getCallInsights(callId: string): Promise<{
    summary: unknown;
    signals3a: unknown;
    signals3b: unknown;
    recommendations: unknown;
    utterances: unknown[];
} | null> {
    const config = getConfig();

    // Fetch all related data in parallel
    const [summaryRes, signals3aRes, signals3bRes, recsRes, utterancesRes] = await Promise.all([
        fetch(`${config.url}/rest/v1/call_summaries?call_id=eq.${callId}&select=*&order=created_at.desc&limit=1`, {
            headers: createHeaders(config.serviceRoleKey),
        }),
        fetch(`${config.url}/rest/v1/call_signal_sets_3a?call_id=eq.${callId}&select=*&order=created_at.desc&limit=1`, {
            headers: createHeaders(config.serviceRoleKey),
        }),
        fetch(`${config.url}/rest/v1/call_signal_sets_3b?call_id=eq.${callId}&select=*&order=created_at.desc&limit=1`, {
            headers: createHeaders(config.serviceRoleKey),
        }),
        fetch(`${config.url}/rest/v1/call_recommendation_sets?call_id=eq.${callId}&select=*&order=created_at.desc&limit=1`, {
            headers: createHeaders(config.serviceRoleKey),
        }),
        fetch(`${config.url}/rest/v1/call_utterances?call_id=eq.${callId}&select=*&order=seq.asc`, {
            headers: createHeaders(config.serviceRoleKey),
        }),
    ]);

    const summary = await summaryRes.json();
    const signals3a = await signals3aRes.json();
    const signals3b = await signals3bRes.json();
    const recommendations = await recsRes.json();
    const utterances = await utterancesRes.json();

    return {
        summary: Array.isArray(summary) && summary.length > 0 ? summary[0].summary : null,
        signals3a: Array.isArray(signals3a) && signals3a.length > 0 ? signals3a[0].signals : null,
        signals3b: Array.isArray(signals3b) && signals3b.length > 0 ? signals3b[0].signals : null,
        recommendations: Array.isArray(recommendations) && recommendations.length > 0 ? recommendations[0].recommendations : null,
        utterances: Array.isArray(utterances) ? utterances : [],
    };
}

// Legacy exports for backward compatibility
export const insertCallRecord = createCallRecord;
export async function storeCallInsights(
    sessionId: string,
    insights: {
        transcript?: unknown;
        summary?: string;
        signals3a?: unknown;
        signals3b?: unknown;
        recommendations?: unknown;
    }
): Promise<void> {
    // This is a simplified wrapper - use individual store functions for full control
    const workspaceId = 'default';
    if (insights.summary) {
        await storeSummary(sessionId, workspaceId, { text: insights.summary });
    }
    if (insights.signals3a) {
        await storeSignals3A(sessionId, workspaceId, insights.signals3a);
    }
    if (insights.signals3b) {
        await storeSignals3B(sessionId, workspaceId, insights.signals3b);
    }
    if (insights.recommendations) {
        await storeRecommendations(sessionId, workspaceId, insights.recommendations);
    }
}
