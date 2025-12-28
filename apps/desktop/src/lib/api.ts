const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const AGENT_URL = import.meta.env.VITE_AGENT_URL || 'http://localhost:3001';

if (!BACKEND_URL) {
    throw new Error('VITE_BACKEND_URL is required');
}

export async function startCall(): Promise<{ sessionId: string }> {
    const res = await fetch(`${BACKEND_URL}/api/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`startCall failed: ${res.status}`);
    return await res.json();
}

export async function agentStartCapture(sessionId: string): Promise<void> {
    const res = await fetch(`${AGENT_URL}/capture/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
    });
    if (!res.ok) throw new Error(`agentStartCapture failed: ${res.status}`);
}

export async function agentStopCapture(sessionId: string): Promise<{ outputPath: string; bytesWritten?: number; fileBase64?: string }> {
    const res = await fetch(`${AGENT_URL}/capture/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
    });
    if (!res.ok) throw new Error(`agentStopCapture failed: ${res.status}`);
    const data = await res.json();

    if (!data.outputPath) {
        throw new Error('Agent stop response missing outputPath');
    }

    return data;
}

interface SignUploadArgs {
    sessionId: string;
    contentType: string;
    fileName: string;
}

interface NormalizedSignedUpload {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    objectPath: string;
}

export async function signUpload(args: SignUploadArgs): Promise<NormalizedSignedUpload> {
    const res = await fetch(`${BACKEND_URL}/api/uploads/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
    });
    if (!res.ok) throw new Error(`signUpload failed: ${res.status}`);

    const data = await res.json();

    if (data.method === 'PUT' && data.url && data.objectPath) {
        return {
            method: 'PUT',
            url: data.url,
            headers: data.headers || {},
            objectPath: data.objectPath
        };
    }

    if (data.signedUrl && data.objectPath) {
        return {
            method: 'PUT',
            url: data.signedUrl,
            headers: {},
            objectPath: data.objectPath
        };
    }

    throw new Error('Unsupported signUpload response shape');
}

export async function uploadToSignedUrl(
    signed: NormalizedSignedUpload,
    bytes: Uint8Array,
    contentType: string
): Promise<void> {
    const headers = {
        ...signed.headers,
        'Content-Type': contentType
    };

    const res = await fetch(signed.url, {
        method: signed.method,
        headers,
        body: bytes as unknown as BodyInit
    });

    if (!res.ok) throw new Error(`uploadToSignedUrl failed: ${res.status}`);
}

export async function stopCall(sessionId: string, objectPath: string): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/calls/${sessionId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioObjectPath: objectPath })
    });
    if (!res.ok) throw new Error(`stopCall failed: ${res.status}`);

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'stopCall returned ok: false');
}

export async function processCall(sessionId: string, objectPath: string): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/calls/${sessionId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioObjectPath: objectPath })
    });
    if (!res.ok) throw new Error(`processCall failed: ${res.status}`);

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'processCall returned ok: false');
}

export async function getInsights(sessionId: string): Promise<unknown> {
    const res = await fetch(`${BACKEND_URL}/api/calls/${sessionId}/insights`);
    if (!res.ok) throw new Error(`getInsights failed: ${res.status}`);
    return await res.json();
}

// SSE Transcript Streaming Types
export interface TranscriptEvent {
    type: 'partial' | 'final' | 'session-closed' | 'error' | 'connection-established';
    sessionId: string;
    timestamp: number;
    text?: string;
    confidence?: number;
    speaker?: 'rep' | 'prospect' | 'unknown';
    startTime?: number;
    endTime?: number;
    error?: string;
}

/**
 * Subscribe to real-time transcript stream from Agent
 * Returns unsubscribe function to close the connection
 */
export function subscribeToTranscriptStream(
    sessionId: string,
    onEvent: (event: TranscriptEvent) => void,
    onError?: (error: Error) => void
): () => void {
    const eventSource = new EventSource(
        `${AGENT_URL}/capture/${sessionId}/transcript-stream`
    );

    eventSource.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data) as TranscriptEvent;
            onEvent(data);
        } catch (err) {
            console.error('[api] Failed to parse SSE event:', err);
            onError?.(new Error('Failed to parse SSE event'));
        }
    });

    eventSource.addEventListener('error', (event) => {
        if (eventSource.readyState === EventSource.CLOSED) {
            console.log('[api] SSE connection closed');
        } else {
            console.error('[api] SSE connection error:', event);
            onError?.(new Error('SSE connection error'));
        }
    });

    // Return unsubscribe function
    return () => {
        eventSource.close();
        console.log('[api] SSE connection closed by client');
    };
}
