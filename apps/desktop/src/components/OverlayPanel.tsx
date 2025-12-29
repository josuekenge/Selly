import { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '../lib/clipboard';
import type { SpeakerLabel } from '../lib/viewModel';
import {
  Pause,
  Play,
  Square,
  X,
  MessageSquare,
  FileText,
  Send,
  Sparkles,
  Copy,
  ChevronDown,
  Wand2,
  Cpu,
  GripHorizontal,
  LayoutGrid
} from 'lucide-react';

interface OverlayPanelProps {
  transcriptUtterances: { speaker: SpeakerLabel; text: string; confidence: number; isFinal?: boolean; timestamp?: number }[];
  transcriptText: string;
  liveRecommendations?: Array<{
    title: string;
    message: string;
    priority: 'high' | 'medium' | 'low';
    category: 'answer' | 'objection' | 'next-step';
  }>;
  isRecording?: boolean;
  isPaused?: boolean;
  onStop?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

export default function OverlayPanel({
  transcriptUtterances,
  transcriptText,
  liveRecommendations = [],
  isRecording = false,
  isPaused = false,
  onStop,
  onPause,
  onResume
}: OverlayPanelProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'transcript'>('chat');
  const [inputText, setInputText] = useState('');
  const [isSmartMode, setIsSmartMode] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dragging State
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Auto-scroll to bottom of lists
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptUtterances, liveRecommendations, activeTab]);

  // Drag Event Listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleCopyAll = async () => {
    try {
      await copyToClipboard(transcriptText);
    } catch (_err) {
      // Error handling
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      className="fixed w-[360px] bg-black/40 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/5 overflow-hidden font-sans flex flex-col z-50 animate-in fade-in zoom-in-95 duration-200 ring-1 ring-white/10 select-none"
    >

      {/* Header / Controls */}
      <div
        className="bg-white/5 p-2 flex items-center justify-between border-b border-white/5 backdrop-blur-md cursor-grab active:cursor-grabbing"
        onMouseDown={handleDragStart}
      >

        {/* Recording Controls */}
        <div className="flex items-center bg-[#1A1D26]/80 rounded-full p-1 pl-2.5 pr-1 border border-white/5 shadow-lg backdrop-blur-md group hover:border-white/10 transition-colors">
          <button
            className="flex items-center gap-1.5 text-slate-300 text-[11px] hover:text-white transition-colors mr-1.5 font-medium"
            onMouseDown={(e) => e.stopPropagation()} // Prevent drag start
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-yellow-500 shadow-yellow-500/60' : 'bg-red-500 animate-pulse shadow-red-500/60'}`}></span>
            <span>{isPaused ? 'Paused' : 'Rec'}</span>
            <ChevronDown size={10} className="opacity-50 ml-0.5" />
          </button>

          <div className="h-3 w-[1px] bg-white/10 mx-1"></div>

          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={isPaused ? onResume : onPause}
            className={`p-1 hover:bg-white/10 rounded-full transition-colors ${isPaused ? 'text-green-400 hover:text-green-300' : 'text-slate-400 hover:text-white'}`}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play size={10} fill="currentColor" /> : <Pause size={10} fill="currentColor" />}
          </button>

          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onStop}
            className="p-1 hover:bg-red-500/20 rounded-full text-slate-400 hover:text-red-400 transition-colors" title="Stop"
          >
            <Square size={10} fill="currentColor" />
          </button>
        </div>

        {/* Drag Handle & Window Controls */}
        <div className="flex items-center gap-1">
          {/* 6 Dots Drag Handle */}
          <div className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors cursor-grab active:cursor-grabbing">
            <LayoutGrid size={14} className="opacity-60" />
          </div>

          <button
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 hover:bg-white/10 rounded-full text-slate-500 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-1 pt-1 flex gap-1 bg-black/20">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-t-lg transition-all ${activeTab === 'chat'
            ? 'text-white bg-white/5 border-t border-x border-white/5 shadow-sm'
            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
        >
          <MessageSquare size={12} className={activeTab === 'chat' ? 'text-indigo-400' : ''} />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-t-lg transition-all ${activeTab === 'transcript'
            ? 'text-white bg-white/5 border-t border-x border-white/5 shadow-sm'
            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
        >
          <FileText size={12} />
          Transcript
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 bg-[#0F1117]/80 min-h-[320px] max-h-[420px] flex flex-col relative backdrop-blur-md">

        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent" ref={scrollRef}>
              {/* Quick Actions */}
              <div className="flex overflow-x-auto pb-1 gap-1.5 no-scrollbar mask-linear-fade">
                {['Suggest', 'Follow-up', 'Fact check', 'Recap'].map((action, i) => (
                  <button
                    key={action}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-indigo-500/30 rounded-full text-[10px] text-slate-300 hover:text-white transition-all whitespace-nowrap shadow-sm group"
                  >
                    {action === 'Suggest' && <Wand2 size={8} className="text-indigo-400" />}
                    {action === 'Follow-up' && <MessageSquare size={8} className="text-purple-400" />}
                    {action}
                  </button>
                ))}
              </div>

              {/* Live AI Recommendations */}
              {liveRecommendations.length > 0 ? (
                <div className="space-y-2">
                  {liveRecommendations.map((rec, i) => (
                    <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5 shadow-lg animate-in fade-in slide-in-from-bottom-2 hover:bg-white/10 transition-colors group">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles size={10} className="text-indigo-400" />
                        <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider">{rec.category}</span>
                      </div>
                      <h4 className="text-xs font-medium text-slate-100 mb-1 leading-snug">{rec.title}</h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed font-light line-clamp-3">{rec.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-32 flex flex-col items-center justify-center text-slate-600 opacity-60">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-2 border border-white/5">
                    <Cpu size={14} className="text-slate-500" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-500">AI Active</span>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-2.5 bg-black/20 border-t border-white/5">
              <div className="relative group">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask Selly..."
                  className="w-full bg-white/5 text-slate-200 text-xs rounded-lg pl-3 pr-8 py-2.5 border border-white/5 focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all placeholder-slate-600/70"
                />
                <button
                  disabled={!inputText}
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-all ${inputText
                    ? 'bg-indigo-500 text-white shadow-lg'
                    : 'text-slate-600'
                    }`}
                >
                  <Send size={10} className={inputText ? 'ml-px' : ''} />
                </button>
              </div>

              <div className="flex items-center justify-between mt-2 px-0.5">
                <button
                  onClick={() => setIsSmartMode(!isSmartMode)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium transition-all ${isSmartMode
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-600 hover:text-slate-400'
                    }`}
                >
                  <Sparkles size={8} className={isSmartMode ? 'fill-indigo-300' : ''} />
                  Smart Mode
                </button>
              </div>
            </div>
          </>
        )}

        {/* TRANSCRIPT TAB */}
        {activeTab === 'transcript' && (
          <>
            <div className="bg-black/10 border-b border-white/5 px-3 py-1.5 flex items-center justify-between z-10">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <span className="w-1 h-1 rounded-full bg-green-500"></span>
                <span>Live Transcript</span>
              </div>
              <button onClick={handleCopyAll} className="flex items-center gap-1 text-[9px] font-medium text-slate-500 hover:text-slate-300 transition-colors px-2 py-0.5 rounded hover:bg-white/5">
                <Copy size={8} /> Copy
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans text-xs leading-relaxed scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent" ref={scrollRef}>
              {transcriptUtterances.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 text-[10px] text-center px-8">
                  <div className="mb-3 relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                      <FileText size={20} className="text-indigo-400/60" />
                    </div>
                    <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full shadow-lg ${isPaused ? 'bg-yellow-500 shadow-yellow-500/50' : 'bg-green-500 animate-pulse shadow-green-500/50'}`}></div>
                  </div>
                  <p className="text-slate-500 font-medium mb-1">{isPaused ? 'Paused' : 'Listening...'}</p>
                  <p className="text-slate-600 text-[9px]">{isPaused ? 'Resume to continue transcription' : 'Real-time transcriptions will appear here'}</p>
                </div>
              ) : (
                transcriptUtterances.map((utt, i) => (
                  <div
                    key={`${i}-${utt.timestamp}`}
                    className={`group animate-in fade-in slide-in-from-bottom-1 duration-300 ${
                      utt.isFinal === false ? 'opacity-70' : 'opacity-100'
                    }`}
                  >
                    <div className="flex items-baseline gap-1.5 mb-0.5">
                      <span className={`text-[9px] uppercase tracking-wider font-bold ${
                        utt.speaker === 'Rep' ? 'text-indigo-400' :
                        utt.speaker === 'Prospect' ? 'text-emerald-400' :
                        'text-amber-400'
                      }`}>
                        {utt.speaker}
                      </span>
                      {utt.isFinal === false && (
                        <span className="text-[8px] text-slate-600 italic">typing...</span>
                      )}
                      {utt.confidence !== undefined && utt.confidence > 0 && (
                        <span className="text-[8px] text-slate-600 ml-auto">
                          {Math.round(utt.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <p className={`text-slate-300 group-hover:text-slate-100 transition-colors leading-relaxed ${
                      utt.isFinal === false ? 'italic' : ''
                    }`}>
                      {utt.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
