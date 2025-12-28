/**
 * SSE Connection Test Utility
 *
 * This module provides utilities for testing the SSE recommendations connection
 * independently from the main application flow.
 */

import { subscribeToRecommendations, type RecommendationEvent } from './api';

export interface SSETestResult {
  success: boolean;
  message: string;
  events: RecommendationEvent[];
  connectionStates: string[];
  errors: Error[];
}

/**
 * Test the SSE recommendations connection for a given session
 * @param sessionId - The session ID to connect to
 * @param durationMs - How long to listen for events (default: 30 seconds)
 * @returns Promise with test results
 */
export async function testRecommendationsSSE(
  sessionId: string,
  durationMs: number = 30000
): Promise<SSETestResult> {
  const result: SSETestResult = {
    success: false,
    message: '',
    events: [],
    connectionStates: [],
    errors: []
  };

  return new Promise((resolve) => {
    console.log(`[SSE Test] Starting test for session: ${sessionId}`);
    console.log(`[SSE Test] Will listen for ${durationMs}ms`);

    const unsubscribe = subscribeToRecommendations(
      sessionId,
      (event) => {
        console.log('[SSE Test] Received event:', event);
        result.events.push(event);
      },
      (error) => {
        console.error('[SSE Test] Error:', error);
        result.errors.push(error);
      },
      (state) => {
        console.log('[SSE Test] Connection state:', state);
        result.connectionStates.push(state);
      }
    );

    // Set timeout to stop listening
    setTimeout(() => {
      console.log('[SSE Test] Test duration completed');
      unsubscribe();

      // Analyze results
      const hasConnected = result.connectionStates.includes('connected');
      const hasEvents = result.events.length > 0;
      const hasErrors = result.errors.length > 0;

      if (hasConnected && hasEvents && !hasErrors) {
        result.success = true;
        result.message = `Successfully received ${result.events.length} recommendation(s)`;
      } else if (hasConnected && !hasEvents && !hasErrors) {
        result.success = true;
        result.message = 'Connected successfully, but no recommendations received yet';
      } else if (!hasConnected) {
        result.success = false;
        result.message = 'Failed to establish connection';
      } else if (hasErrors) {
        result.success = false;
        result.message = `Connection had ${result.errors.length} error(s)`;
      }

      console.log('[SSE Test] Test complete:', result);
      resolve(result);
    }, durationMs);
  });
}

/**
 * Monitor SSE connection health with periodic status updates
 * @param sessionId - The session ID to monitor
 * @param onStatus - Callback for status updates
 * @returns Cleanup function
 */
export function monitorRecommendationsSSE(
  sessionId: string,
  onStatus: (status: {
    state: string;
    eventCount: number;
    lastEventTime?: number;
    errors: number;
  }) => void
): () => void {
  let eventCount = 0;
  let errorCount = 0;
  let lastEventTime: number | undefined = undefined;
  let currentState = 'disconnected';

  const updateStatus = () => {
    onStatus({
      state: currentState,
      eventCount,
      lastEventTime,
      errors: errorCount
    });
  };

  // Update status every 5 seconds
  const statusInterval = setInterval(updateStatus, 5000);

  const unsubscribe = subscribeToRecommendations(
    sessionId,
    (_event) => {
      eventCount++;
      lastEventTime = Date.now();
      updateStatus();
    },
    (_error) => {
      errorCount++;
      updateStatus();
    },
    (state) => {
      currentState = state;
      updateStatus();
    }
  );

  // Initial status
  updateStatus();

  return () => {
    clearInterval(statusInterval);
    unsubscribe();
  };
}
