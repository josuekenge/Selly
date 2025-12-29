// SSE Connection Manager
// Manages Server-Sent Events connections for streaming transcripts to Desktop

import type { ServerResponse } from 'node:http';

interface SSEClient {
    response: ServerResponse;
    connectedAt: number;
}

interface TranscriptEvent {
    type: 'partial' | 'final' | 'session-closed' | 'error' | 'connection-established' | 'paused' | 'resumed';
    sessionId: string;
    timestamp: number;
    text?: string;
    confidence?: number;
    speaker?: string;
    startTime?: number;
    endTime?: number;
    error?: string;
}

export class SSEConnectionManager {
    // Map<sessionId, Set<SSEClient>>
    private connections: Map<string, Set<SSEClient>> = new Map();

    /**
     * Register a new SSE client for a session
     * @returns unsubscribe function to remove client on disconnect
     */
    registerClient(sessionId: string, response: ServerResponse): () => void {
        if (!this.connections.has(sessionId)) {
            this.connections.set(sessionId, new Set());
        }

        const client: SSEClient = {
            response,
            connectedAt: Date.now(),
        };

        this.connections.get(sessionId)!.add(client);

        console.log(`[sse] Client connected for session ${sessionId}. Total clients: ${this.connections.get(sessionId)!.size}`);

        // Handle client disconnect
        response.on('close', () => {
            this.removeClient(sessionId, client);
        });

        response.on('error', (error) => {
            console.error(`[sse] Client error for ${sessionId}:`, error.message);
            this.removeClient(sessionId, client);
        });

        // Return unsubscribe function
        return () => this.removeClient(sessionId, client);
    }

    private removeClient(sessionId: string, client: SSEClient): void {
        const clients = this.connections.get(sessionId);
        if (clients) {
            clients.delete(client);
            console.log(`[sse] Client disconnected for session ${sessionId}. Remaining clients: ${clients.size}`);

            if (clients.size === 0) {
                this.connections.delete(sessionId);
                console.log(`[sse] No more clients for session ${sessionId}, cleaned up`);
            }
        }
    }

    /**
     * Broadcast a transcript event to all connected clients for a session
     */
    broadcastTranscript(sessionId: string, event: TranscriptEvent): void {
        const clients = this.connections.get(sessionId);
        if (!clients || clients.size === 0) {
            console.log(`[sse] No clients connected for ${sessionId}, skipping broadcast`);
            return;
        }

        const sseData = this.formatSSEEvent(event);
        let successCount = 0;
        let failCount = 0;

        console.log(`[sse] Broadcasting ${event.type} transcript to ${clients.size} client(s) for ${sessionId}`);

        clients.forEach((client) => {
            try {
                client.response.write(sseData);
                successCount++;
            } catch (err) {
                // Client disconnected, will be cleaned up on next event
                console.error(`[sse] Error writing to client for ${sessionId}:`, err);
                failCount++;
            }
        });

        console.log(`[sse] Broadcast complete: ${successCount} success, ${failCount} failed for ${sessionId}`);

        if (failCount > 0) {
            console.warn(`[sse] Failed to send to ${failCount}/${clients.size} clients for ${sessionId}`);
        }
    }

    /**
     * Format event as SSE: data: {json}\n\n
     */
    private formatSSEEvent(event: TranscriptEvent): string {
        const jsonData = JSON.stringify(event);
        return `data: ${jsonData}\n\n`;
    }

    /**
     * Get count of connected clients for a session
     */
    getClientCount(sessionId: string): number {
        return this.connections.get(sessionId)?.size ?? 0;
    }

    /**
     * Get all active sessions with connections
     */
    getActiveSessions(): string[] {
        return Array.from(this.connections.keys());
    }

    /**
     * Close all connections for a session (when recording stops)
     */
    closeSessionConnections(sessionId: string): void {
        const clients = this.connections.get(sessionId);
        if (!clients) {
            return;
        }

        const closeEvent: TranscriptEvent = {
            type: 'session-closed',
            sessionId,
            timestamp: Date.now(),
        };

        const closeData = this.formatSSEEvent(closeEvent);

        console.log(`[sse] Closing ${clients.size} connections for session ${sessionId}`);

        clients.forEach((client) => {
            try {
                client.response.write(closeData);
                client.response.end();
            } catch (err) {
                // Ignore if already closed
            }
        });

        this.connections.delete(sessionId);
    }
}

// Singleton instance
export const sseManager = new SSEConnectionManager();
