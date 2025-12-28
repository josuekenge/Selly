// SSE Connection Manager for Live Recommendations
// Manages Server-Sent Events connections for streaming recommendations to Desktop

import type { ServerResponse } from 'node:http';

interface SSEClient {
    response: ServerResponse;
    connectedAt: number;
}

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

export class RecommendationSSEManager {
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

        console.log(`[recommendation-sse] Client connected for session ${sessionId}. Total clients: ${this.connections.get(sessionId)!.size}`);

        // Handle client disconnect
        response.on('close', () => {
            this.removeClient(sessionId, client);
        });

        response.on('error', (error) => {
            console.error(`[recommendation-sse] Client error for ${sessionId}:`, error.message);
            this.removeClient(sessionId, client);
        });

        // Send connection established event
        const connectionEvent: RecommendationEvent = {
            type: 'connection-established',
            sessionId,
            timestamp: Date.now(),
        };
        this.sendToClient(client, connectionEvent);

        // Return unsubscribe function
        return () => this.removeClient(sessionId, client);
    }

    private removeClient(sessionId: string, client: SSEClient): void {
        const clients = this.connections.get(sessionId);
        if (clients) {
            clients.delete(client);
            console.log(`[recommendation-sse] Client disconnected for session ${sessionId}. Remaining clients: ${clients.size}`);

            if (clients.size === 0) {
                this.connections.delete(sessionId);
                console.log(`[recommendation-sse] No more clients for session ${sessionId}, cleaned up`);
            }
        }
    }

    /**
     * Broadcast a recommendation event to all connected clients for a session
     */
    broadcastRecommendation(sessionId: string, event: RecommendationEvent): void {
        const clients = this.connections.get(sessionId);
        if (!clients || clients.size === 0) {
            console.log(`[recommendation-sse] No clients connected for ${sessionId}, event not sent`);
            return;
        }

        const sseData = this.formatSSEEvent(event);
        let successCount = 0;
        let failCount = 0;

        clients.forEach((client) => {
            try {
                client.response.write(sseData);
                successCount++;
            } catch (err) {
                // Client disconnected, will be cleaned up on next event
                console.error(`[recommendation-sse] Error writing to client for ${sessionId}:`, err);
                failCount++;
            }
        });

        console.log(`[recommendation-sse] Broadcast to ${successCount} clients for ${sessionId}`);
        if (failCount > 0) {
            console.warn(`[recommendation-sse] Failed to send to ${failCount}/${clients.size} clients for ${sessionId}`);
        }
    }

    /**
     * Send event to a specific client
     */
    private sendToClient(client: SSEClient, event: RecommendationEvent): void {
        try {
            const sseData = this.formatSSEEvent(event);
            client.response.write(sseData);
        } catch (err) {
            console.error('[recommendation-sse] Error sending to client:', err);
        }
    }

    /**
     * Format event as SSE: data: {json}\n\n
     */
    private formatSSEEvent(event: RecommendationEvent): string {
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
     * Close all connections for a session (when call ends)
     */
    closeSessionConnections(sessionId: string): void {
        const clients = this.connections.get(sessionId);
        if (!clients) {
            return;
        }

        console.log(`[recommendation-sse] Closing ${clients.size} connections for session ${sessionId}`);

        clients.forEach((client) => {
            try {
                client.response.end();
            } catch (err) {
                // Ignore if already closed
            }
        });

        this.connections.delete(sessionId);
    }
}

// Singleton instance
export const recommendationSSEManager = new RecommendationSSEManager();
