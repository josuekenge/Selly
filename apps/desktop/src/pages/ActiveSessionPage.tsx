import { useState, useEffect, useRef } from 'react';
import { Home, MessageSquare, Send, Zap, Search, RefreshCw, Copy, Sparkles } from 'lucide-react';
import RecommendationsPanel, { RecommendationItem } from '../components/RecommendationsPanel';
import { subscribeToTranscriptStream, generateSummary, type TranscriptEvent } from '../lib/api';
import './ActiveSessionPage.css';

interface ActiveSessionPageProps {
    sessionId: string;
    duration: string;
    onStop: () => void;
}

type Tab = 'chat' | 'transcript';

export default function ActiveSessionPage({ sessionId, duration, onStop }: ActiveSessionPageProps) {
    const [activeTab, setActiveTab] = useState<Tab>('chat');
    const [transcript, setTranscript] = useState<{ speaker: string, text: string }[]>([]);
    const [summary, setSummary] = useState<string>('');
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const lastSummaryTime = useRef<number>(0);
    const summaryDebounceTimeout = useRef<NodeJS.Timeout>();

    // Mock recommendations data - in production this would come from SSE stream
    const [recommendations, setRecommendations] = useState<RecommendationItem[]>([
        {
            id: '1',
            type: 'next_best_response',
            title: 'Address their dashboard question',
            script: 'Great! Let me show you the analytics dashboard. It gives you real-time insights into your sales pipeline and helps you identify bottlenecks instantly.',
            confidence: 0.92,
            createdAt: Date.now() - 30000,
            warnings: []
        },
        {
            id: '2',
            type: 'discovery_question',
            title: 'Ask about current workflow',
            script: 'Before I dive in, how are you currently tracking your sales metrics? This will help me show you the most relevant features.',
            confidence: 0.78,
            createdAt: Date.now() - 60000,
            warnings: []
        }
    ]);

    // Subscribe to live transcript stream
    useEffect(() => {
        const unsubscribe = subscribeToTranscriptStream(
            sessionId,
            (event: TranscriptEvent) => {
                if (event.type === 'final' && event.text) {
                    const speaker = event.speaker === 'rep' ? 'Rep' : event.speaker === 'prospect' ? 'Prospect' : 'Unknown';
                    setTranscript(prev => [...prev, { speaker, text: event.text! }]);
                }
            },
            (error) => console.error('[ActiveSession] Transcript error:', error)
        );

        return () => unsubscribe();
    }, [sessionId]);

    // Generate summary when transcript updates (debounced)
    useEffect(() => {
        // Only generate summary if we have enough content and enough time has passed
        if (transcript.length < 3) return;

        const now = Date.now();
        const timeSinceLastSummary = now - lastSummaryTime.current;

        // Debounce summary generation - wait for 10 seconds of inactivity or force update every 30 seconds
        if (summaryDebounceTimeout.current) {
            clearTimeout(summaryDebounceTimeout.current);
        }

        const shouldForceUpdate = timeSinceLastSummary > 30000; // 30 seconds

        summaryDebounceTimeout.current = setTimeout(async () => {
            setIsLoadingSummary(true);
            const result = await generateSummary(sessionId, transcript);
            setIsLoadingSummary(false);

            if (result.ok) {
                setSummary(result.summary);
                lastSummaryTime.current = Date.now();
            }
        }, shouldForceUpdate ? 0 : 10000); // Force immediately or wait 10 seconds

        return () => {
            if (summaryDebounceTimeout.current) {
                clearTimeout(summaryDebounceTimeout.current);
            }
        };
    }, [transcript, sessionId]);

    const copyTranscript = () => {
        const text = transcript.map(m => `${m.speaker}: ${m.text}`).join('\n');
        navigator.clipboard.writeText(text);
    };

    const handleDismissRecommendation = (id: string) => {
        setRecommendations(prev => prev.filter(rec => rec.id !== id));
    };

    const handleDismissAllRecommendations = () => {
        setRecommendations([]);
    };

    return (
        <div className="active-session-container">
            {/* Background Content with Live Summary */}
            <div className="session-background">
                <div className="session-title">Active session</div>
                <div className="session-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>

                {summary ? (
                    <div className="session-summary">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <Sparkles size={16} style={{ color: '#818cf8' }} />
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>AI Summary</h3>
                            {isLoadingSummary && <div style={{ fontSize: '11px', color: '#64748b' }}>Updating...</div>}
                        </div>
                        <div style={{
                            fontSize: '13px',
                            lineHeight: '1.6',
                            color: '#cbd5e1',
                            whiteSpace: 'pre-wrap',
                            background: 'rgba(255,255,255,0.03)',
                            padding: '16px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            {summary}
                        </div>
                        <div style={{ marginTop: '12px', fontSize: '11px', color: '#64748b' }}>
                            {transcript.length} utterances • Last updated {new Date(lastSummaryTime.current).toLocaleTimeString()}
                        </div>
                    </div>
                ) : transcript.length > 0 ? (
                    <div className="session-placeholder">
                        <Sparkles size={20} style={{ color: '#818cf8', marginBottom: '8px' }} />
                        <span>Listening... AI summary will appear soon</span>
                    </div>
                ) : (
                    <div className="session-placeholder">
                        <span>Waiting for conversation to start...</span>
                    </div>
                )}
            </div>

            {/* Recommendations Panel - Left Side */}
            <RecommendationsPanel
                recommendations={recommendations}
                onDismiss={handleDismissRecommendation}
                onDismissAll={handleDismissAllRecommendations}
            />

            {/* Overlay Panel (Widget) - Right Side */}
            <div className="overlay-panel">
                <div className="overlay-header">
                    <div className="overlay-tabs">
                        <button className="icon-btn-home"><Home size={16} /></button>
                        <button
                            className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                            onClick={() => setActiveTab('chat')}
                        >
                            Chat
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'transcript' ? 'active' : ''}`}
                            onClick={() => setActiveTab('transcript')}
                        >
                            Transcript
                        </button>
                    </div>
                </div>

                <div className="overlay-content">
                    {activeTab === 'chat' && (
                        <div className="chat-tab">
                            <div className="quick-actions">
                                <button className="chip"><Zap size={12} /> What should I say?</button>
                                <button className="chip"><MessageSquare size={12} /> Follow-up questions</button>
                                <button className="chip"><Search size={12} /> Fact-check</button>
                                <button className="chip"><RefreshCw size={12} /> Recap</button>
                            </div>

                            <div className="chat-input-wrapper">
                                <input type="text" placeholder="Ask about your screen or conversation..." />
                                <button className="send-btn"><Send size={14} /></button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'transcript' && (
                        <div className="transcript-tab">
                            <div className="transcript-actions">
                                <button className="copy-btn" onClick={copyTranscript}>
                                    <Copy size={12} /> Copy All
                                </button>
                            </div>
                            <div className="transcript-stream">
                                {transcript.length > 0 ? (
                                    <>
                                        {transcript.map((t, i) => (
                                            <div key={i} className={`transcript-bubble ${t.speaker === 'Rep' ? 'me' : 'them'}`}>
                                                {t.text}
                                            </div>
                                        ))}
                                        <div className="transcript-listening">
                                            <div className="pulse-dot"></div> Listening...
                                        </div>
                                    </>
                                ) : (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        color: '#64748b',
                                        fontSize: '13px'
                                    }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div className="pulse-dot" style={{ margin: '0 auto 12px' }}></div>
                                            Waiting for conversation...
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Recording Pill */}
            <div className="recording-pill">
                <div className="waveform-visual">
                    <div className="bar b1"></div>
                    <div className="bar b2"></div>
                    <div className="bar b3"></div>
                    <div className="bar b4"></div>
                    <div className="bar b2"></div>
                </div>
                <div className="timer">{duration}</div>
                <button className="stop-btn" onClick={onStop}>
                    <div className="stop-icon"></div>
                </button>
            </div>
        </div>
    );
}
