import { useState, useEffect } from 'react';
import { Share, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { getInsights } from '../lib/api';
import './SessionRecapPage.css';

interface SessionRecapPageProps {
    sessionId: string;
    onBack: () => void;
}

interface InsightData {
    status?: string;
    summary?: string | { text?: string };
    recommendations?: Array<{ description?: string; title?: string }>;
    metadata?: { date?: string };
}

export default function SessionRecapPage({ sessionId, onBack }: SessionRecapPageProps) {
    const [insights, setInsights] = useState<InsightData | null>(null);
    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState("Sales Call");

    useEffect(() => {
        let isMounted = true;
        const fetchInsights = async () => {
            let attempts = 0;
            while (attempts < 5) {
                try {
                    const data = await getInsights(sessionId) as InsightData;
                    if (data && data.status === 'completed') {
                        if (isMounted) {
                            setInsights(data);
                            setLoading(false);
                            if (data.metadata?.date) {
                                setTitle(`Call on ${new Date(data.metadata.date).toLocaleDateString()}`);
                            }
                        }
                        return;
                    }
                } catch (err) {
                    console.error('Failed to fetch insights:', err);
                }
                await new Promise((r) => setTimeout(r, 2000));
                attempts++;
            }
            if (isMounted) setLoading(false);
        };
        fetchInsights();
        return () => { isMounted = false; };
    }, [sessionId]);

    const handleShare = () => {
        if (!insights) return;
        const summaryText = typeof insights.summary === 'string'
            ? insights.summary
            : insights.summary?.text || '';
        navigator.clipboard.writeText(summaryText);
        alert("Summary copied to clipboard!");
    };

    const handleEmail = () => {
        if (!insights) return;
        const summaryText = typeof insights.summary === 'string'
            ? insights.summary
            : insights.summary?.text || '';
        const recs = insights.recommendations || [];
        const body = `Here is a recap of our call:\n\n${summaryText}\n\nAction Items:\n${recs.map((r: { description?: string; title?: string }) => `- ${r.description || r.title || ''}`).join('\n')}`;
        navigator.clipboard.writeText(body);
        alert("Draft email copied to clipboard!");
    };

    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const summaryText = insights
        ? (typeof insights.summary === 'string'
            ? insights.summary
            : (insights.summary && typeof insights.summary === 'object' ? insights.summary.text || '' : ''))
        : '';
    const recommendations = insights?.recommendations || [];

    return (
        <div className="recap-container">
            <header className="recap-header">
                <button className="back-btn" onClick={onBack}><ArrowLeft size={16} /> Back</button>
                <div className="header-actions">
                    <button className="action-btn" onClick={handleShare}>
                        <Share size={14} /> Share
                    </button>
                    <button className="action-btn primary" onClick={handleEmail}>
                        <Mail size={14} /> Follow-up email
                    </button>
                </div>
            </header>

            <main className="recap-content">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Generating insights...</p>
                    </div>
                ) : !insights ? (
                    <div className="error-state">
                        <p>Could not load insights. The session may not have processed correctly.</p>
                        <button onClick={onBack}>Return Home</button>
                    </div>
                ) : (
                    <div className="document-view">
                        <h1 className="doc-title">{title}</h1>
                        <div className="doc-date">{dateStr}</div>

                        <div className="section">
                            <h2>Summary</h2>
                            <div className="summary-box">
                                {summaryText.split('\n').map((line: string, i: number) => (
                                    <p key={i}>{line}</p>
                                ))}
                            </div>
                        </div>

                        {recommendations.length > 0 && (
                            <div className="section">
                                <h2>Recommendations</h2>
                                <ul className="rec-list">
                                    {recommendations.map((rec: { description?: string; title?: string }, i: number) => (
                                        <li key={i} className="rec-item">
                                            <CheckCircle size={16} className="rec-icon" />
                                            <span>{rec.description || rec.title || ''}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="promo-chip">
                            Try Selly Pro
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
