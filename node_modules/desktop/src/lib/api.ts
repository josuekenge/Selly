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

export async function agentPauseCapture(sessionId: string): Promise<void> {
    const res = await fetch(`${AGENT_URL}/capture/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `agentPauseCapture failed: ${res.status}`);
    }
}

export async function agentResumeCapture(sessionId: string): Promise<void> {
    const res = await fetch(`${AGENT_URL}/capture/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `agentResumeCapture failed: ${res.status}`);
    }
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
    type: 'partial' | 'final' | 'session-closed' | 'error' | 'connection-established' | 'paused' | 'resumed';
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
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Handles timing issues when session is still initializing
 */
export function subscribeToTranscriptStream(
    sessionId: string,
    onEvent: (event: TranscriptEvent) => void,
    onError?: (error: Error) => void
): () => void {
    let eventSource: EventSource | null = null;
    let shouldReconnect = true;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseReconnectDelay = 500; // 500ms
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
        if (!shouldReconnect) return;

        console.log(`[api] Connecting to transcript SSE: ${AGENT_URL}/capture/${sessionId}/transcript-stream (attempt ${reconnectAttempts + 1})`);

        eventSource = new EventSource(
            `${AGENT_URL}/capture/${sessionId}/transcript-stream`
        );

        eventSource.addEventListener('open', () => {
            console.log('[api] SSE transcript connection OPENED');
            reconnectAttempts = 0; // Reset on successful connection
        });

        eventSource.addEventListener('message', (event) => {
            console.log('[api] SSE message received:', event.data?.substring(0, 100));
            try {
                const data = JSON.parse(event.data) as TranscriptEvent;
                onEvent(data);
            } catch (err) {
                console.error('[api] Failed to parse SSE event:', err);
                onError?.(new Error('Failed to parse SSE event'));
            }
        });

        eventSource.addEventListener('error', (event) => {
            if (eventSource?.readyState === EventSource.CLOSED) {
                console.log('[api] SSE transcript connection closed');

                // Attempt to reconnect
                if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
                    const delay = Math.min(
                        baseReconnectDelay * Math.pow(2, reconnectAttempts),
                        5000 // Max 5 seconds
                    );
                    reconnectAttempts++;

                    console.log(`[api] Reconnecting transcript SSE in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);

                    reconnectTimeout = setTimeout(() => {
                        connect();
                    }, delay);
                } else if (reconnectAttempts >= maxReconnectAttempts) {
                    console.error('[api] Max reconnection attempts reached for transcript SSE');
                    onError?.(new Error('Failed to establish transcript connection after multiple attempts'));
                }
            } else {
                console.error('[api] SSE connection error, readyState:', eventSource?.readyState, event);
                onError?.(new Error('SSE connection error'));
            }
        });
    };

    // Initial connection
    connect();

    // Return unsubscribe function
    return () => {
        shouldReconnect = false;

        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }

        console.log('[api] SSE transcript connection closed by client');
    };
}

// SSE Recommendation Streaming Types
export interface RecommendationEvent {
    type: 'recommendation.generated' | 'recommendation.updated' | 'connection-established';
    sessionId: string;
    timestamp: number;
    recommendation?: {
        title: string;
        message: string;
        priority: 'high' | 'medium' | 'low';
        category: 'answer' | 'objection' | 'next-step';
    };
}

/**
 * Subscribe to real-time recommendations stream from Backend
 * Returns unsubscribe function to close the connection
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection state tracking
 * - Error handling and recovery
 */
/**
 * Generate AI summary of transcript using OpenAI
 */
export async function generateSummary(sessionId: string, transcript: Array<{ speaker: string; text: string }>): Promise<{ ok: boolean; summary: string; error?: string }> {
    try {
        const res = await fetch(`${BACKEND_URL}/api/calls/${sessionId}/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript })
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || `Summary generation failed: ${res.status}`);
        }

        const data = await res.json();
        return { ok: true, summary: data.summary };
    } catch (error) {
        console.error('[api] Error generating summary:', error);
        return {
            ok: false,
            summary: '',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export function subscribeToRecommendations(
    sessionId: string,
    onEvent: (event: RecommendationEvent) => void,
    onError?: (error: Error) => void,
    onConnectionStateChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void
): () => void {
    let eventSource: EventSource | null = null;
    let shouldReconnect = true;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 1000; // 1 second
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
        if (!shouldReconnect) return;

        onConnectionStateChange?.('connecting');

        eventSource = new EventSource(
            `${BACKEND_URL}/api/calls/${sessionId}/recommendations-stream`
        );

        eventSource.addEventListener('open', () => {
            console.log('[api] Recommendations SSE connection established');
            reconnectAttempts = 0; // Reset on successful connection
            onConnectionStateChange?.('connected');
        });

        eventSource.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data) as RecommendationEvent;

                // Handle connection-established event
                if (data.type === 'connection-established') {
                    console.log('[api] Recommendations SSE connection confirmed');
                    onConnectionStateChange?.('connected');
                    return;
                }

                onEvent(data);
            } catch (err) {
                console.error('[api] Failed to parse recommendation SSE event:', err);
                onError?.(new Error('Failed to parse recommendation SSE event'));
            }
        });

        eventSource.addEventListener('error', (event) => {
            if (eventSource?.readyState === EventSource.CLOSED) {
                console.log('[api] Recommendations SSE connection closed');
                onConnectionStateChange?.('disconnected');

                // Attempt to reconnect
                if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
                    const delay = Math.min(
                        baseReconnectDelay * Math.pow(2, reconnectAttempts),
                        10000 // Max 10 seconds
                    );
                    reconnectAttempts++;

                    console.log(`[api] Reconnecting recommendations SSE in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);

                    reconnectTimeout = setTimeout(() => {
                        connect();
                    }, delay);
                } else if (reconnectAttempts >= maxReconnectAttempts) {
                    console.error('[api] Max reconnection attempts reached for recommendations SSE');
                    onConnectionStateChange?.('error');
                    onError?.(new Error('Failed to establish recommendations connection after multiple attempts'));
                }
            } else {
                console.error('[api] Recommendations SSE connection error:', event);
                onConnectionStateChange?.('error');
                onError?.(new Error('Recommendations SSE connection error'));
            }
        });
    };

    // Initial connection
    connect();

    // Return unsubscribe function
    return () => {
        shouldReconnect = false;

        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }

        console.log('[api] Recommendations SSE connection closed by client');
        onConnectionStateChange?.('disconnected');
    };
}
