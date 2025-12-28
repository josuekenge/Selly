import { useState } from 'react';
import { Home, MessageSquare, Send, Zap, Search, RefreshCw, Copy } from 'lucide-react';
import RecommendationsPanel, { RecommendationItem } from '../components/RecommendationsPanel';
import './ActiveSessionPage.css';

interface ActiveSessionPageProps {
    sessionId: string;
    duration: string;
    onStop: () => void;
}

type Tab = 'chat' | 'transcript';

export default function ActiveSessionPage({ sessionId, duration, onStop }: ActiveSessionPageProps) {
    const [activeTab, setActiveTab] = useState<Tab>('chat');

    // Mock transcript data for active view (since backend doesn't stream yet)
    // In a real app, this would come from a websocket or polling
    const [mockTranscript] = useState<{ speaker: string, text: string }[]>([
        { speaker: 'Rep', text: "Thanks for joining. I wanted to walk through the dashboard." },
        { speaker: 'Prospect', text: "Sounds good, show me what you got." }
    ]);

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

    // Debug logging for sessionId to satisfy linter and verify prop passing
    console.debug('Active session:', sessionId);

    const copyTranscript = () => {
        const text = mockTranscript.map(m => `${m.speaker}: ${m.text}`).join('\n');
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
            {/* Background Content Placeholder */}
            <div className="session-background">
                <div className="session-title">Active session</div>
                <div className="session-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                <div className="session-placeholder">
                    <span>Finish meeting to see notes...</span>
                </div>
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
                                {mockTranscript.map((t, i) => (
                                    <div key={i} className={`transcript-bubble ${t.speaker === 'Rep' ? 'me' : 'them'}`}>
                                        {t.text}
                                    </div>
                                ))}
                                <div className="transcript-listening">
                                    <div className="pulse-dot"></div> Listening...
                                </div>
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
