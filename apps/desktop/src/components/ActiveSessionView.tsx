import { Calendar, Square, Mic, Radio } from 'lucide-react';
import { useEffect, useRef } from 'react';

type SpeakerLabel = 'Rep' | 'Prospect' | 'Unknown';

interface TranscriptUtterance {
    speaker: SpeakerLabel;
    text: string;
    confidence: number;
    isFinal?: boolean;
    timestamp?: number;
}

interface ActiveSessionViewProps {
    onStop: () => void;
    transcriptUtterances?: TranscriptUtterance[];
}

export default function ActiveSessionView({ onStop, transcriptUtterances = [] }: ActiveSessionViewProps) {
    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });

    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new transcripts arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [transcriptUtterances]);

    return (
        <div className="min-h-screen bg-[#0A0C10] flex flex-col relative font-sans select-none">

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col items-start justify-start pt-16 px-12 pb-32">
                <div className="w-full max-w-4xl">
                    <h1 className="text-4xl font-semibold text-white tracking-tight mb-3">
                        Active session
                    </h1>

                    <div className="flex items-center gap-2 text-slate-400 text-sm mb-8">
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-md px-2 py-1">
                            <Calendar size={12} className="text-slate-500" />
                            <span>{today}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-md px-2 py-1">
                            <Radio size={12} className="text-green-500 animate-pulse" />
                            <span className="text-green-400 text-xs font-medium">Live</span>
                        </div>
                    </div>

                    {/* Live Transcript Display */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 px-6 py-4 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Mic size={16} className="text-indigo-400" />
                                <h2 className="text-lg font-semibold text-white">Live Transcript</h2>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                <span>Recording</span>
                            </div>
                        </div>

                        <div
                            ref={scrollRef}
                            className="p-6 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
                            style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '300px' }}
                        >
                            {transcriptUtterances.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-slate-600">
                                    <div className="mb-4 relative">
                                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                                            <Mic size={28} className="text-indigo-400/60" />
                                        </div>
                                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></div>
                                    </div>
                                    <p className="text-slate-500 font-medium mb-2 text-lg">Listening...</p>
                                    <p className="text-slate-600 text-sm">Speak to start seeing live transcription</p>
                                </div>
                            ) : (
                                transcriptUtterances.map((utt, i) => (
                                    <div
                                        key={`${i}-${utt.timestamp}`}
                                        className={`animate-in fade-in slide-in-from-bottom-2 duration-500 ${
                                            utt.isFinal === false ? 'opacity-70' : 'opacity-100'
                                        }`}
                                    >
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className={`text-sm font-bold uppercase tracking-wide ${
                                                utt.speaker === 'Rep' ? 'text-indigo-400' :
                                                utt.speaker === 'Prospect' ? 'text-emerald-400' :
                                                'text-amber-400'
                                            }`}>
                                                {utt.speaker}
                                            </span>
                                            {utt.isFinal === false && (
                                                <span className="text-xs text-slate-600 italic flex items-center gap-1">
                                                    <span className="inline-block w-1 h-1 bg-slate-600 rounded-full animate-pulse"></span>
                                                    typing...
                                                </span>
                                            )}
                                            {utt.confidence !== undefined && utt.confidence > 0 && (
                                                <span className="text-xs text-slate-600 ml-auto">
                                                    {Math.round(utt.confidence * 100)}%
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-base text-slate-300 leading-relaxed pl-0 ${
                                            utt.isFinal === false ? 'italic' : ''
                                        }`}>
                                            {utt.text}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <p className="text-slate-600 text-sm mt-6 text-center">
                        Finish meeting to see AI-generated notes and recommendations
                    </p>
                </div>
            </div>

            {/* Bottom Recording Pill */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#1A1D26]/90 backdrop-blur-lg rounded-full px-4 py-2 border border-white/10 shadow-2xl z-50">
                {/* Waveform Visual */}
                <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 3, 2, 1].map((height, i) => (
                        <div
                            key={i}
                            className="w-1 rounded-full bg-indigo-400"
                            style={{
                                height: `${height * 4 + 4}px`,
                                animation: `waveform 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                            }}
                        />
                    ))}
                </div>

                {/* Stop Button */}
                <button
                    onClick={onStop}
                    className="p-2 bg-white/10 hover:bg-red-500/20 rounded-full text-slate-300 hover:text-red-400 transition-all border border-white/10"
                    title="Stop Recording"
                >
                    <Square size={12} fill="currentColor" />
                </button>
            </div>

            {/* Waveform animation keyframes */}
            <style>{`
        @keyframes waveform {
          from { transform: scaleY(1); }
          to { transform: scaleY(1.5); }
        }
      `}</style>
        </div>
    );
}
