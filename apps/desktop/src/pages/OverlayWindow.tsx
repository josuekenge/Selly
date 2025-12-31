// Overlay Window Route
// Standalone page that renders only the OverlayPanel for the pop-out window

import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import OverlayPanel from '../components/OverlayPanel';
import {
  subscribeToTranscriptStream,
  subscribeToRecommendations,
  agentPauseCapture,
  agentResumeCapture,
  type TranscriptEvent,
  type RecommendationEvent
} from '../lib/api';

type SpeakerLabel = 'Rep' | 'Prospect' | 'Unknown';

interface TranscriptUtterance {
    speaker: SpeakerLabel;
    text: string;
    confidence: number;
}

export default function OverlayWindow() {
    const [transcriptUtterances, setTranscriptUtterances] = useState<TranscriptUtterance[]>([]);
    const [liveRecommendations, setLiveRecommendations] = useState<NonNullable<RecommendationEvent['recommendation']>[]>([]);
    const [isPaused, setIsPaused] = useState<boolean>(false);

    // Get sessionId from URL query params
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const sessionId = params.get('sessionId') || '';

    // Ensure overlay window is visible on mount
    useEffect(() => {
        const currentWindow = getCurrentWindow();
        currentWindow.show().then(() => {
            console.log('[OverlayWindow] Window shown');
            currentWindow.setFocus();
        }).catch((err) => {
            console.error('[OverlayWindow] Failed to show window:', err);
        });
    }, []);

    useEffect(() => {
        if (!sessionId) {
            console.warn('[OverlayWindow] No sessionId provided');
            return;
        }

        // Subscribe to transcript stream
        const unsubscribeTranscript = subscribeToTranscriptStream(
            sessionId,
            (event: TranscriptEvent) => {
                // Handle pause/resume events
                if (event.type === 'paused') {
                    console.log('[OverlayWindow] Session paused by backend');
                    setIsPaused(true);
                    return;
                }

                if (event.type === 'resumed') {
                    console.log('[OverlayWindow] Session resumed by backend');
                    setIsPaused(false);
                    return;
                }

                if (event.type === 'partial' || event.type === 'final') {
                    const speakerLabel: SpeakerLabel =
                        event.speaker === 'rep' ? 'Rep' :
                            event.speaker === 'prospect' ? 'Prospect' :
                                'Unknown';

                    setTranscriptUtterances(prev => [...prev, {
                        speaker: speakerLabel,
                        text: event.text || '',
                        confidence: event.confidence || 0,
                    }]);
                }
            },
            (error) => console.error('[OverlayWindow] Transcript SSE error:', error)
        );

        // Subscribe to recommendations stream
        const unsubscribeRecs = subscribeToRecommendations(
            sessionId,
            (event: RecommendationEvent) => {
                if (event.type === 'recommendation.generated' && event.recommendation) {
                    setLiveRecommendations(prev => {
                        const newRecs = [...prev, event.recommendation!];
                        return newRecs.slice(-10);
                    });
                }
            },
            (error) => console.error('[OverlayWindow] Recommendations SSE error:', error)
        );

        return () => {
            unsubscribeTranscript();
            unsubscribeRecs();
        };
    }, [sessionId]);

    const transcriptText = transcriptUtterances
        .map(u => `[${u.speaker}] ${u.text}`)
        .join('\n');

    const handleStop = async () => {
        // Close this window - the main window handles the actual stop
        const window = getCurrentWindow();
        await window.close();
    };

    const handlePause = async () => {
        if (!sessionId) return;

        try {
            console.log('[OverlayWindow] Pausing session...');
            await agentPauseCapture(sessionId);
            setIsPaused(true);
            console.log('[OverlayWindow] Session paused successfully');
        } catch (err) {
            console.error('[OverlayWindow] Failed to pause session:', err);
        }
    };

    const handleResume = async () => {
        if (!sessionId) return;

        try {
            console.log('[OverlayWindow] Resuming session...');
            await agentResumeCapture(sessionId);
            setIsPaused(false);
            console.log('[OverlayWindow] Session resumed successfully');
        } catch (err) {
            console.error('[OverlayWindow] Failed to resume session:', err);
        }
    };

    return (
        <div className="h-screen w-screen bg-transparent">
            <OverlayPanel
                transcriptUtterances={transcriptUtterances}
                transcriptText={transcriptText}
                liveRecommendations={liveRecommendations}
                isRecording={true}
                isPaused={isPaused}
                onStop={handleStop}
                onPause={handlePause}
                onResume={handleResume}
                standalone={true}
            />
        </div>
    );
}
