import './Dashboard.css';

interface DashboardProps {
    onStartCall: () => void;
}

export default function Dashboard({ onStartCall }: DashboardProps) {
    // Mock user name
    const userName = "Josue";

    // Mock activity data
    const activities = [
        {
            id: 1,
            title: "Download Instructions Clarification",
            time: "1:05",
            uses: 0,
            timestamp: "5:32pm, Yesterday"
        },
        {
            id: 2,
            title: "Transport Design Company Dashboard Discussion",
            time: "5:09:12",
            uses: 0,
            timestamp: "12:22pm, Yesterday"
        },
        {
            id: 3,
            title: "C++ Pointer Tutorial and Subscription Clarifications",
            time: "1:35:03",
            uses: 6,
            timestamp: "10:58am, Tue, Sep 23"
        }
    ];

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input type="text" placeholder="Search or ask anything..." />
                    <div className="kbd-shortcut">Ctrl K</div>
                </div>
                <div className="header-actions">
                    <button className="btn-secondary">Start Selly</button>
                    <div className="avatar">J</div>
                </div>
            </header>

            <main className="dashboard-content">
                <section className="welcome-section">
                    <h1>Good afternoon, {userName}</h1>

                    <div className="hero-banner">
                        <div className="hero-content">
                            <h2>Never show up unprepared again</h2>
                            <p>Connect your calendar for research on meeting participants, meeting agendas from past calls, and calendar notifications.</p>
                            <button className="btn-primary" onClick={onStartCall}>
                                Get started <span className="arrow">→</span>
                            </button>
                        </div>
                        <div className="hero-card">
                            <div className="meeting-info">
                                <span className="meeting-time">Meeting in 2 minutes</span>
                                <h3>Product Roadmap Sync</h3>
                                <div className="participants">
                                    <span>Roy Lee</span>
                                    <span>Alex Chen</span>
                                    <span>Neel Shanmugam</span>
                                </div>
                                <div className="participant-detail">
                                    <span className="role">📍 San Francisco</span>
                                    <span className="role">💼 CEO</span>
                                    <p>21-year-old CEO of Selly and Columbia dropout</p>
                                </div>
                                <div className="card-actions">
                                    <button className="btn-close">×</button>
                                    <button className="btn-join" onClick={onStartCall}>Join and Start Selly →</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="activity-section">
                    <div className="section-header">
                        <h2>YOUR ACTIVITY</h2>
                    </div>

                    <div className="activity-list">
                        <div className="date-group">
                            <h3>Yesterday</h3>
                            {activities.slice(0, 2).map(activity => (
                                <div key={activity.id} className="activity-item">
                                    <div className="activity-title">{activity.title}</div>
                                    <div className="activity-meta">
                                        <span className="duration">{activity.time}</span>
                                        <span className="uses">{activity.uses} uses</span>
                                        <span className="timestamp">{activity.timestamp.split(', ')[0]}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="date-group">
                            <h3>Tue, Sep 23</h3>
                            {activities.slice(2).map(activity => (
                                <div key={activity.id} className="activity-item">
                                    <div className="activity-title">{activity.title}</div>
                                    <div className="activity-meta">
                                        <span className="duration">{activity.time}</span>
                                        <span className="uses active">{activity.uses} uses</span>
                                        <span className="timestamp">{activity.timestamp.split(', ')[0]}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
