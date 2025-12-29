import { useState } from 'react';
import {
  startCall,
  agentStartCapture,
  agentStopCapture,
  signUpload,
  uploadToSignedUrl,
  stopCall,
  processCall,
  getInsights,
  subscribeToTranscriptStream,
  type TranscriptEvent,
  subscribeToRecommendations,
  type RecommendationEvent
} from '../lib/api';
import { buildViewModel, type CallInsightsViewModel } from '../lib/viewModel';
import { copyToClipboard } from '../lib/clipboard';
import OverlayPanel from '../components/OverlayPanel';
import ActiveSessionView from '../components/ActiveSessionView';
import ErrorAlert from '../components/ErrorAlert';
import Dashboard from './Dashboard';
import { openOverlayWindow, closeOverlayWindow } from '../lib/windowManager';

type State = 'idle' | 'starting' | 'recording' | 'stopping' | 'uploading' | 'processing' | 'ready' | 'error';

type SpeakerLabel = 'Rep' | 'Prospect' | 'Unknown';

interface TranscriptUtterance {
  speaker: SpeakerLabel;
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
}

export default function CallSession() {
  const [state, setState] = useState<State>('idle');
  const [sessionId, setSessionId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [viewModel, setViewModel] = useState<CallInsightsViewModel | null>(null);
  const [transcriptUtterances, setTranscriptUtterances] = useState<TranscriptUtterance[]>([]);
  const [unsubscribeSSE, setUnsubscribeSSE] = useState<(() => void) | null>(null);
  const [liveRecommendations, setLiveRecommendations] = useState<NonNullable<RecommendationEvent['recommendation']>[]>([]);
  const [unsubscribeRecommendations, setUnsubscribeRecommendations] = useState<(() => void) | null>(null);

  const handleStart = async () => {
    setState('starting');
    try {
      const { sessionId: newSessionId } = await startCall();
      setSessionId(newSessionId);
      await agentStartCapture(newSessionId);
      setState('recording');

      // Open overlay pop-out window
      try {
        await openOverlayWindow(newSessionId);
      } catch (err) {
        console.warn('[CallSession] Failed to open overlay window:', err);
        // Continue without pop-out, in-app overlay will still work
      }

      // Start SSE connection for live transcripts
      console.log('[CallSession] Setting up transcript SSE for session:', newSessionId);
      const cleanup = subscribeToTranscriptStream(
        newSessionId,
        (event: TranscriptEvent) => {
          console.log('[CallSession] Received transcript event:', event);
          if (event.type === 'partial' || event.type === 'final') {
            // Map speaker to SpeakerLabel format
            const speakerLabel: SpeakerLabel =
              event.speaker === 'rep' ? 'Rep' :
                event.speaker === 'prospect' ? 'Prospect' :
                  'Unknown';

            const newUtterance: TranscriptUtterance = {
              speaker: speakerLabel,
              text: event.text || '',
              confidence: event.confidence || 0,
              isFinal: event.type === 'final',
              timestamp: event.timestamp,
            };

            setTranscriptUtterances(prev => {
              // If this is a partial transcript, check if we should replace the last partial
              // from the same speaker (to show live updates smoothly)
              if (event.type === 'partial') {
                const lastUtterance = prev[prev.length - 1];
                if (lastUtterance && !lastUtterance.isFinal && lastUtterance.speaker === speakerLabel) {
                  // Replace the last partial utterance with the new one
                  console.log(`[CallSession] Replacing partial transcript from ${speakerLabel}: "${newUtterance.text.substring(0, 30)}..."`);
                  return [...prev.slice(0, -1), newUtterance];
                } else {
                  console.log(`[CallSession] Adding new partial transcript from ${speakerLabel}: "${newUtterance.text.substring(0, 30)}..."`);
                }
              } else {
                console.log(`[CallSession] Adding FINAL transcript from ${speakerLabel}: "${newUtterance.text.substring(0, 30)}..."`);
              }

              // Otherwise, add the new utterance
              return [...prev, newUtterance];
            });
          }
        },
        (error) => {
          console.error('[CallSession] SSE Transcript error:', error);
          // Don't fail the entire session on SSE error, just log it
        }
      );
      setUnsubscribeSSE(() => cleanup);

      // Start SSE connection for live recommendations
      const recommendationCleanup = subscribeToRecommendations(
        newSessionId,
        (event: RecommendationEvent) => {
          console.log('[CallSession] Received recommendation event:', event);

          if (event.type === 'recommendation.generated' && event.recommendation) {
            setLiveRecommendations(prev => {
              // Limit to last 10 recommendations to avoid memory issues
              const newRecs = [...prev, event.recommendation!];
              return newRecs.slice(-10);
            });
          } else if (event.type === 'recommendation.updated' && event.recommendation) {
            // Replace the last recommendation with updated version
            setLiveRecommendations(prev => {
              if (prev.length === 0) return [event.recommendation!];
              const newRecs = [...prev];
              newRecs[newRecs.length - 1] = event.recommendation!;
              return newRecs;
            });
          }
        },
        (error) => {
          console.error('Recommendations SSE error:', error);
          // Don't fail the entire session on SSE error, just update state
          // setRecommendationsConnectionState('error');
        },
        (connectionState) => {
          console.log('[CallSession] Recommendations connection state:', connectionState);
          // setRecommendationsConnectionState(connectionState);
        }
      );
      setUnsubscribeRecommendations(() => recommendationCleanup);
    } catch (err) {
      setErrorMessage(String(err));
      setState('error');
    }
  };

  const handleStop = async () => {
    setState('stopping');

    // Close SSE connections before stopping
    if (unsubscribeSSE) {
      unsubscribeSSE();
      setUnsubscribeSSE(null);
    }
    if (unsubscribeRecommendations) {
      unsubscribeRecommendations();
      setUnsubscribeRecommendations(null);
    }

    // Close overlay pop-out window
    await closeOverlayWindow();

    try {
      const { fileBase64 } = await agentStopCapture(sessionId);

      setState('uploading');

      // Use base64 data from agent (avoids local file read issues)
      if (!fileBase64) {
        throw new Error('No audio data received from agent');
      }

      // Decode base64 to Uint8Array
      const binaryString = atob(fileBase64);
      const fileBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        fileBytes[i] = binaryString.charCodeAt(i);
      }

      const signed = await signUpload({
        sessionId,
        contentType: 'audio/wav',
        fileName: 'audio.wav'
      });
      await uploadToSignedUrl(signed, fileBytes, 'audio/wav');

      await stopCall(sessionId, signed.objectPath);

      setState('processing');
      await processCall(sessionId, signed.objectPath);

      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const data = await getInsights(sessionId);

        if (data && typeof data === 'object') {
          const hasTranscript = 'transcript' in data && data.transcript;
          const hasSummary = 'summary' in data && data.summary;
          const hasRecommendations = 'recommendations' in data && data.recommendations;

          if (hasTranscript || hasSummary || hasRecommendations) {
            const vm = buildViewModel(data);
            setViewModel(vm);
            setState('ready');
            return;
          }
        }

        attempts++;
      }

      const vm = buildViewModel(null);
      setViewModel(vm);
      setState('ready');
    } catch (err) {
      setErrorMessage(String(err));
      setState('error');
    }
  };

  const handleReset = () => {
    // Close SSE if still open
    if (unsubscribeSSE) {
      unsubscribeSSE();
      setUnsubscribeSSE(null);
    }
    if (unsubscribeRecommendations) {
      unsubscribeRecommendations();
      setUnsubscribeRecommendations(null);
    }

    setState('idle');
    setSessionId('');
    setErrorMessage('');
    setViewModel(null);
    setTranscriptUtterances([]);
    setLiveRecommendations([]);
  };

  const handleShare = async () => {
    if (!viewModel) return;

    const text = [
      viewModel.title,
      '',
      'Summary:',
      ...viewModel.bullets.map(b => `• ${b}`),
      '',
      'Top Recommendations:',
      ...viewModel.recommendations.slice(0, 3).map(r => `• ${r.title}`),
    ].join('\n');

    try {
      await copyToClipboard(text);
      alert('Recap copied to clipboard');
    } catch (err) {
      alert('Failed to copy recap');
    }
  };

  const handleFollowUpEmail = async () => {
    if (!viewModel) return;

    const email = [
      'Subject: Follow-up from our conversation',
      '',
      'Hi [Customer Name],',
      '',
      'Thank you for taking the time to speak with me today. Here are the key points we discussed:',
      '',
      ...viewModel.bullets.map(b => `• ${b}`),
      '',
      'Next steps:',
      ...viewModel.recommendations.slice(0, 3).map(r => `• ${r.title}${r.script ? ': ' + r.script : ''}`),
      '',
      'Looking forward to our next meeting on [Next Meeting Date].',
      '',
      'Best regards,',
      '[Your Name]'
    ].join('\n');

    try {
      await copyToClipboard(email);
      alert('Follow-up email copied to clipboard');
    } catch (err) {
      alert('Failed to copy email');
    }
  };


  if (state === 'idle') {
    return <Dashboard onStartCall={handleStart} />;
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
        <ErrorAlert
          message={errorMessage}
          onRetry={handleReset}
          onDismiss={handleReset}
        />
      </div>
    );
  }

  if (state === 'starting' || state === 'stopping' || state === 'uploading' || state === 'processing') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-300 capitalize">{state}...</p>
        </div>
      </div>
    );
  }

  if (state === 'recording') {
    const transcriptText = transcriptUtterances
      .map(u => `[${u.speaker}] ${u.text}`)
      .join('\n');

    return (
      <>
        {/* Full-screen Active Session backdrop with live transcripts */}
        <ActiveSessionView
          onStop={handleStop}
          transcriptUtterances={transcriptUtterances}
        />

        {/* Draggable Overlay Panel */}
        <OverlayPanel
          transcriptUtterances={transcriptUtterances}
          transcriptText={transcriptText}
          liveRecommendations={liveRecommendations}
          isRecording={true}
          onStop={handleStop}
          onPause={() => console.log('[CallSession] Pause clicked - pause feature not yet implemented')}
        />
      </>
    );
  }

  if (state === 'ready' && viewModel) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">{viewModel.title}</h1>
          <p className="text-gray-400 mb-8">{viewModel.dateLabel}</p>

          {viewModel.bullets.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Summary</h2>
              <ul className="space-y-2">
                {viewModel.bullets.map((bullet, idx) => (
                  <li key={idx} className="flex items-start">
                    <span className="text-blue-400 mr-2">•</span>
                    <span className="text-gray-200">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {viewModel.recommendations.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Recommendations</h2>
              <div className="space-y-3">
                {viewModel.recommendations.map((rec, idx) => (
                  <div key={idx} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-white mb-1">{rec.title}</h3>
                        {rec.script && (
                          <p className="text-sm text-gray-300">{rec.script}</p>
                        )}
                      </div>
                      <span className="ml-3 px-2 py-1 bg-gray-700 text-xs rounded text-gray-300">
                        {rec.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-4 mb-6">
            <button
              onClick={handleShare}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
            >
              Share
            </button>
            <button
              onClick={handleFollowUpEmail}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
            >
              Follow-up email
            </button>
          </div>

          <button
            onClick={handleReset}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors border border-gray-600"
          >
            Start new session
          </button>
        </div>

        <OverlayPanel
          transcriptUtterances={viewModel.transcriptUtterances}
          transcriptText={viewModel.transcriptText}
          liveRecommendations={liveRecommendations}
          isRecording={false}
        />
      </div>
    );
  }

  return null;
}
