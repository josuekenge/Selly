import { useState } from 'react';
import { copyToClipboard } from '../lib/clipboard';
import type { SpeakerLabel } from '../lib/viewModel';

interface OverlayPanelProps {
  transcriptUtterances: { speaker: SpeakerLabel; text: string; confidence: number }[];
  transcriptText: string;
  isRecording?: boolean;
}

export default function OverlayPanel({ transcriptUtterances, transcriptText, isRecording }: OverlayPanelProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'transcript'>('chat');
  const [inputValue, setInputValue] = useState('');

  const actionChips = [
    'What should I say?',
    'Follow-up questions',
    'Fact-check',
    'Recap'
  ];

  const handleChipClick = (chip: string) => {
    setInputValue(chip);
  };

  const handleCopyAll = async () => {
    try {
      await copyToClipboard(transcriptText);
      alert('Transcript copied to clipboard');
    } catch (err) {
      alert('Failed to copy transcript');
    }
  };

  return (
    <div className="fixed top-4 right-4 w-96 bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden">
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'transcript'
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Transcript
        </button>
      </div>

      <div className="h-96 overflow-y-auto">
        {activeTab === 'chat' && (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {actionChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-full transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a message..."
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-gray-500"
            />
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="p-4 space-y-3">
            {!isRecording && transcriptUtterances.length > 0 && (
              <button
                onClick={handleCopyAll}
                className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              >
                Copy All
              </button>
            )}

            {isRecording ? (
              <p className="text-gray-400 text-sm text-center py-8">
                Transcript will appear after recording stops
              </p>
            ) : transcriptUtterances.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                No transcript available
              </p>
            ) : (
              <div className="space-y-2">
                {transcriptUtterances.map((utterance, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${
                      utterance.speaker === 'Rep'
                        ? 'bg-blue-900/30 ml-4'
                        : utterance.speaker === 'Prospect'
                        ? 'bg-green-900/30 mr-4'
                        : 'bg-gray-700 mx-2'
                    }`}
                  >
                    <div className="text-xs font-semibold mb-1 text-gray-300">
                      {utterance.speaker}
                    </div>
                    <div className="text-sm text-gray-100">{utterance.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
