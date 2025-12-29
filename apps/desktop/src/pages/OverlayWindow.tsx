// Overlay Window Route
// Standalone page that renders only the OverlayPanel for the pop-out window

import { useEffect, useState } from 'react';
import OverlayPanel from '../components/OverlayPanel';
import { subscribeToTranscriptStream, subscribeToRecommendations, type TranscriptEvent, type RecommendationEvent } from '../lib/api';

type SpeakerLabel = 'Rep' | 'Prospect' | 'Unknown';

interface TranscriptUtterance {
    speaker: SpeakerLabel;
    text: string;
    confidence: number;
}

export default function OverlayWindow() {
    const [transcriptUtterances, setTranscriptUtterances] = useState<TranscriptUtterance[]>([]);
    const [liveRecommendations, setLiveRecommendations] = useState<NonNullable<RecommendationEvent['recommendation']>[]>([]);

    // Get sessionId from URL query params
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const sessionId = params.get('sessionId') || '';

    useEffect(() => {
        if (!sessionId) {
            console.warn('[OverlayWindow] No sessionId provided');
            return;
        }

        // Subscribe to transcript stream
        const unsubscribeTranscript = subscribeToTranscriptStream(
            sessionId,
            (event: TranscriptEvent) => {
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
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const window = await getCurrentWindow();
        await window.close();
    };

    return (
        <div className="min-h-screen bg-transparent">
            <OverlayPanel
                transcriptUtterances={transcriptUtterances}
                transcriptText={transcriptText}
                liveRecommendations={liveRecommendations}
                isRecording={true}
                onStop={handleStop}
            />
        </div>
    );
}
