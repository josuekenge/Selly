import { Calendar, Square } from 'lucide-react';

interface ActiveSessionViewProps {
    onStop: () => void;
}

export default function ActiveSessionView({ onStop }: ActiveSessionViewProps) {
    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });

    return (
        <div className="min-h-screen bg-[#0A0C10] flex flex-col relative font-sans select-none">

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col items-start justify-start pt-16 px-12">
                <h1 className="text-4xl font-semibold text-white tracking-tight mb-3">
                    Active session
                </h1>

                <div className="flex items-center gap-2 text-slate-400 text-sm mb-8">
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-md px-2 py-1">
                        <Calendar size={12} className="text-slate-500" />
                        <span>{today}</span>
                    </div>
                </div>

                <p className="text-slate-600 text-base">
                    Finish meeting to see notes...
                </p>
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
