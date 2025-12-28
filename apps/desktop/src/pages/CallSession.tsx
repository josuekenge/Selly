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
  type TranscriptEvent
} from '../lib/api';
import { buildViewModel, type CallInsightsViewModel } from '../lib/viewModel';
import { copyToClipboard } from '../lib/clipboard';
import RecorderPill from '../components/RecorderPill';
import OverlayPanel from '../components/OverlayPanel';

type State = 'idle' | 'starting' | 'recording' | 'stopping' | 'uploading' | 'processing' | 'ready' | 'error';

type SpeakerLabel = 'Rep' | 'Prospect' | 'Unknown';

interface TranscriptUtterance {
  speaker: SpeakerLabel;
  text: string;
  confidence: number;
}

export default function CallSession() {
  const [state, setState] = useState<State>('idle');
  const [sessionId, setSessionId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [viewModel, setViewModel] = useState<CallInsightsViewModel | null>(null);
  const [transcriptUtterances, setTranscriptUtterances] = useState<TranscriptUtterance[]>([]);
  const [unsubscribeSSE, setUnsubscribeSSE] = useState<(() => void) | null>(null);

  const handleStart = async () => {
    setState('starting');
    try {
      const { sessionId: newSessionId } = await startCall();
      setSessionId(newSessionId);
      await agentStartCapture(newSessionId);
      setState('recording');

      // Start SSE connection for live transcripts
      const cleanup = subscribeToTranscriptStream(
        newSessionId,
        (event: TranscriptEvent) => {
          if (event.type === 'partial' || event.type === 'final') {
            // Map speaker to SpeakerLabel format
            const speakerLabel: SpeakerLabel =
              event.speaker === 'rep' ? 'Rep' :
              event.speaker === 'prospect' ? 'Prospect' :
              'Unknown';

            // Add new utterance to state
            setTranscriptUtterances(prev => [...prev, {
              speaker: speakerLabel,
              text: event.text || '',
              confidence: event.confidence || 0,
            }]);
          }
        },
        (error) => {
          console.error('SSE error:', error);
          // Don't fail the entire session on SSE error, just log it
        }
      );
      setUnsubscribeSSE(() => cleanup);
    } catch (err) {
      setErrorMessage(String(err));
      setState('error');
    }
  };

  const handleStop = async () => {
    setState('stopping');

    // Close SSE connection before stopping
    if (unsubscribeSSE) {
      unsubscribeSSE();
      setUnsubscribeSSE(null);
    }

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

    setState('idle');
    setSessionId('');
    setErrorMessage('');
    setViewModel(null);
    setTranscriptUtterances([]);
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

  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  if (state === 'idle') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <button
          onClick={handleStart}
          className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-lg transition-colors"
        >
          Start Call
        </button>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-bold mb-4">Error</h2>
          <p className="text-gray-300 mb-6">{errorMessage}</p>
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Reset
          </button>
        </div>
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
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Active session</h1>
          <p className="text-gray-400 mb-8">{currentDate}</p>
          {transcriptUtterances.length > 0 ? (
            <p className="text-gray-300 text-lg">Live transcript active ({transcriptUtterances.length} utterances)</p>
          ) : (
            <p className="text-gray-300 text-lg">Listening for speech...</p>
          )}
        </div>

        <RecorderPill onStop={handleStop} />
        <OverlayPanel
          transcriptUtterances={transcriptUtterances}
          transcriptText={transcriptText}
          isRecording={true}
        />
      </div>
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
          isRecording={false}
        />
      </div>
    );
  }

  return null;
}
