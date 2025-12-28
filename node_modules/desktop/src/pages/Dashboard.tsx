import { Play, Search, Command, ChevronRight, MoreHorizontal, User } from 'lucide-react';

interface DashboardProps {
    onStartCall: () => void;
}

export default function Dashboard({ onStartCall }: DashboardProps) {
    // Mock data for "Your Activity"
    const activities = [
        {
            date: 'Yesterday',
            items: [
                { title: 'Control Gate Opportunity Discussion', duration: '1:31', uses: 0, time: '2:41pm' },
                { title: 'Quick Guide Using Claude for LinkedIn Screenshots', duration: '10:30', uses: 0, time: '2:30pm' }
            ]
        },
        {
            date: 'Fri, Dec 26',
            items: [
                { title: 'Download Instructions Clarification', duration: '1:05', uses: 0, time: '5:32pm' },
                { title: 'Transport Design Company Dashboard Discussion', duration: '5:09:12', uses: 0, time: '12:22pm' }
            ]
        },
        {
            date: 'Tue, Sep 23',
            items: [
                { title: 'C++ Pointer Tutorial and Subscription Clarifications', duration: '1:35:03', uses: 6, time: '10:58am' }
            ]
        }
    ];

    return (
        <div className="min-h-screen bg-[#0F1117] text-slate-200 selection:bg-indigo-500/30 font-sans">
            {/* Ambient background glow */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]" />
                <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[100px]" />
            </div>

            {/* Top Navigation */}
            <nav className="relative flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0F1117]/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <button className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white">
                        <MoreHorizontal size={20} />
                    </button>
                </div>

                <div className="flex-1 max-w-xl mx-8">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search or ask anything..."
                            className="w-full bg-[#1A1D26] text-slate-200 rounded-xl pl-10 pr-12 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 border border-white/5 group-hover:border-white/10 transition-all placeholder-slate-600 shadow-sm"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1">
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-500 font-mono bg-[#232733] px-1.5 py-0.5 rounded border border-white/5">
                                <Command size={10} /> K
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={onStartCall}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-indigo-900/20 hover:shadow-indigo-900/40 border border-indigo-500/50"
                    >
                        <Play size={14} fill="currentColor" />
                        Start Selly
                    </button>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-sm font-medium border border-white/10 shadow-inner text-white ring-2 ring-transparent hover:ring-indigo-500/30 transition-all cursor-pointer">
                        J
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="relative max-w-5xl mx-auto px-8 py-12">
                <h1 className="text-3xl font-light mb-8 text-white mt-4 tracking-tight">
                    Good afternoon, <span className="font-medium text-indigo-400">Josue</span>
                </h1>

                {/* Promo Card */}
                <div className="relative overflow-hidden rounded-2xl border border-white/10 p-0 mb-16 shadow-2xl bg-[#141720] group">
                    {/* Card Gradient Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-[#141720] to-[#141720] z-0"></div>

                    <div className="relative z-10 p-10 flex flex-col md:flex-row items-center justify-between gap-12">
                        <div className="max-w-lg">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-6">
                                <SparklesIcon /> New Feature
                            </div>
                            <h2 className="text-3xl font-semibold mb-4 text-white tracking-tight leading-tight">
                                Never show up <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-400">unprepared again</span>
                            </h2>
                            <p className="text-slate-400 mb-8 max-w-md leading-relaxed text-sm">
                                Connect your calendar for research on meeting participants, meeting agendas from past calls, and calendar notifications.
                            </p>
                            <button
                                onClick={onStartCall}
                                className="group/btn px-6 py-3 bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-xl transition-all shadow-xl shadow-white/5 flex items-center gap-2"
                            >
                                Get started
                                <ChevronRight size={16} className="group-hover/btn:translate-x-0.5 transition-transform" />
                            </button>
                        </div>

                        {/* Decorative Element */}
                        <div className="relative w-full max-w-sm hidden md:block perspective-1000">
                            <div className="relative bg-[#1A1D26]/90 backdrop-blur-xl rounded-xl border border-white/10 p-5 shadow-2xl rotate-y-[-12deg] rotate-x-[5deg] transform transition-transform duration-700 ease-out group-hover:rotate-y-[-5deg] group-hover:rotate-x-[2deg]">
                                {/* Card Shine */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent rounded-xl pointer-events-none"></div>

                                <div className="flex items-center justify-between mb-5">
                                    <div className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                        Starting in 2m
                                    </div>
                                    <div className="flex -space-x-2">
                                        {[1, 2, 3].map((i) => (
                                            <div key={i} className="w-6 h-6 rounded-full bg-slate-700 border border-[#1A1D26] flex items-center justify-center text-[8px] text-white">
                                                <User size={10} />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <h3 className="text-white font-semibold text-lg mb-2">Product Roadmap Sync</h3>

                                <div className="flex items-center gap-3 text-xs text-slate-500 mb-5 pb-5 border-b border-white/5">
                                    <div className="flex items-center gap-1.5"><span className="text-indigo-400">📍</span> SF Office</div>
                                    <div className="flex items-center gap-1.5"><span className="text-indigo-400">📅</span> 3:00 PM</div>
                                </div>

                                <div className="bg-indigo-500/10 text-indigo-300 text-xs p-3 rounded-lg border border-indigo-500/20 mb-4 leading-relaxed">
                                    <span className="font-semibold text-indigo-200">Insight:</span> Key decision maker Roy likes concise metrics.
                                </div>

                                <button className="w-full bg-indigo-600/20 text-indigo-300 text-xs font-medium py-2 rounded-lg border border-indigo-500/30 flex items-center justify-center gap-2">
                                    View Briefing
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Activity Section */}
                <section>
                    <div className="flex items-center justify-between mb-8 pl-1">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recent Activity</h2>
                    </div>

                    <div className="space-y-12">
                        {activities.map((group, idx) => (
                            <div key={idx} className="relative">
                                {/* Timeline line */}
                                <div className="absolute left-[19px] top-8 bottom-0 w-[1px] bg-slate-800 -z-10 last:hidden"></div>

                                <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-3">
                                    <div className="w-10 h-[1px] bg-slate-800"></div>
                                    {group.date}
                                </h3>

                                <div className="space-y-2 pl-4">
                                    {group.items.map((item, itemIdx) => (
                                        <div
                                            key={itemIdx}
                                            className="group flex items-center justify-between py-3 px-4 rounded-xl hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/5"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
                                                    <Play size={12} fill="currentColor" />
                                                </div>
                                                <span className="font-medium text-slate-300 group-hover:text-white transition-colors text-sm">
                                                    {item.title}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-8 text-xs text-slate-500 font-mono">
                                                <span className="w-16 text-right group-hover:text-slate-400">{item.duration}</span>
                                                <span className={`px-2 py-0.5 rounded ${item.uses > 0
                                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                                    : 'bg-slate-800/50 text-slate-600 border border-white/5'
                                                    }`}>
                                                    {item.uses} uses
                                                </span>
                                                <span className="w-16 text-right group-hover:text-slate-400">{item.time}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}

// Simple Sparkles Icon Component
function SparklesIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L14.7 9.3L22 12L14.7 14.7L12 22L9.3 14.7L2 12L9.3 9.3L12 2Z" fill="currentColor" opacity="0.4" />
            <path d="M18 16L19.35 19.65L23 21L19.35 22.35L18 26L16.65 22.35L13 21L16.65 19.65L18 16Z" fill="currentColor" />
        </svg>
    );
}
