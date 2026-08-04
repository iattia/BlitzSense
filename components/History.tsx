import React, { useState } from 'react';
import { SessionRecord, Difficulty, Milestone, BookmarkedPosition } from '../types';
import { computeEloHistory, currentElo } from '../utils/eloHistory';
import { getLifetimeStats, getBookmarks, removeBookmark } from '../utils/storage';
import { X, TrendingUp, Clock, Trophy, Globe, BarChart3, Bookmark, Trash2 } from 'lucide-react';
import { Leaderboard } from './Leaderboard';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface HistoryProps {
    sessions: SessionRecord[];
    onClose: () => void;
    difficulty: Difficulty;
    positionCount: number;
}

type HistoryTab = 'sessions' | 'stats' | 'elo' | 'gms' | 'leaderboard';

// ── Milestones definition ─────────────────────────────────────────────────────
const MILESTONES: Milestone[] = [
  { id: 'games-10', label: 'Getting Started', description: 'Play 10 sessions', icon: '🎮', threshold: 10, category: 'games' },
  { id: 'games-50', label: 'Regular', description: 'Play 50 sessions', icon: '🏅', threshold: 50, category: 'games' },
  { id: 'games-100', label: 'Centurion', description: 'Play 100 sessions', icon: '💯', threshold: 100, category: 'games' },
  { id: 'gm-beats-5', label: 'Sharp Eye', description: 'Find 5 better moves', icon: '⚔️', threshold: 5, category: 'gm-beats' },
  { id: 'gm-beats-25', label: 'Move Hunter', description: 'Find 25 better moves', icon: '🗡️', threshold: 25, category: 'gm-beats' },
  { id: 'gm-beats-100', label: 'Engine Instinct', description: 'Find 100 better moves', icon: '👑', threshold: 100, category: 'gm-beats' },
  { id: 'streak-5', label: 'Hot Streak', description: '5 correct in a row', icon: '🔥', threshold: 5, category: 'streak' },
  { id: 'streak-10', label: 'On Fire', description: '10 correct in a row', icon: '🌋', threshold: 10, category: 'streak' },
  { id: 'streak-20', label: 'Unstoppable', description: '20 correct in a row', icon: '⚡', threshold: 20, category: 'streak' },
  { id: 'score-500', label: 'Half K', description: 'Score 500+ in one session', icon: '📈', threshold: 500, category: 'score' },
  { id: 'score-1000', label: 'Elite Instinct', description: 'Score 1000+ in one session', icon: '🧠', threshold: 1000, category: 'score' },
  { id: 'positions-500', label: 'Position Grinder', description: 'Play 500 positions total', icon: '♟️', threshold: 500, category: 'accuracy' },
];

// ── Elo sparkline ─────────────────────────────────────────────────────────────
const EloSparkline: React.FC<{ history: number[] }> = ({ history }) => {
    if (history.length < 2) {
        return (
            <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
                Play at least 2 sessions to see your Elo trend.
            </div>
        );
    }

    const W = 400, H = 120, PAD_L = 28, PAD_R = 36, PAD_Y = 16;
    const min = Math.min(...history) - 20;
    const max = Math.max(...history) + 20;
    const range = max - min || 1;

    const pts = history.map((v, i) => {
        const x = PAD_L + (i / (history.length - 1)) * (W - PAD_L - PAD_R);
        const y = H - PAD_Y - ((v - min) / range) * (H - PAD_Y * 2);
        return `${x},${y}`;
    }).join(' ');

    const lastPt = pts.split(' ').pop()!.split(',').map(Number);
    const current = history[history.length - 1];

    return (
        <div className="w-full">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32">
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map((t) => {
                    const y = PAD_Y + t * (H - PAD_Y * 2);
                    const elo = Math.round(max - t * range);
                    return (
                        <g key={t}>
                            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#44403c" strokeWidth="1" />
                            <text x={PAD_L - 6} y={y + 4} fill="#78716c" fontSize="9" textAnchor="end">{elo}</text>
                        </g>
                    );
                })}
                {/* Line */}
                <polyline points={pts} fill="none" stroke="#91ad63" strokeWidth="2" strokeLinejoin="round" />
                {/* Area fill */}
                <polyline
                    points={`${PAD_L},${H - PAD_Y} ${pts} ${W - PAD_R},${H - PAD_Y}`}
                    fill="url(#eloGrad)" opacity="0.3"
                />
                <defs>
                    <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#91ad63" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#91ad63" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {/* Last dot */}
                <circle cx={lastPt[0]} cy={lastPt[1]} r="4" fill="#91ad63" />
                <text x={lastPt[0] + 7} y={lastPt[1] + 4} fill="#91ad63" fontSize="10" fontWeight="bold">{current}</text>
            </svg>
        </div>
    );
};

// ── GM leaderboard (aggregated across all sessions) ───────────────────────────
const GMLedgerboard: React.FC<{ sessions: SessionRecord[] }> = ({ sessions }) => {
    const agg: Record<string, { correct: number; total: number }> = {};
    for (const s of sessions) {
        for (const [gm, stat] of Object.entries(s.gmStats) as [string, { correct: number; total: number }][]) {
            if (!agg[gm]) agg[gm] = { correct: 0, total: 0 };
            agg[gm].correct += stat.correct;
            agg[gm].total += stat.total;
        }
    }

    const rows = Object.entries(agg)
        .filter(([, s]) => s.total >= 1)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 12);

    if (rows.length === 0) {
        return (
            <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
                Play some sessions to see your accuracy stats.
            </div>
        );
    }

    return (
        <div className="space-y-2 mt-1">
            {rows.map(([gm, stat]) => {
                const pct = Math.round((stat.correct / stat.total) * 100);
                const smallSample = stat.total < 3;
                const color = smallSample
                    ? 'bg-slate-500'
                    : pct >= 60 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-500';
                const pctColor = smallSample
                    ? 'text-slate-400'
                    : pct >= 60 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-rose-400';
                return (
                    <div key={gm}>
                        <div className="flex justify-between items-baseline text-xs mb-1">
                            <span className="text-slate-300 font-semibold truncate max-w-[160px]">{gm}</span>
                            <span className={`font-mono font-semibold ${pctColor}`}>
                                {pct}%
                                <span className="text-slate-600 font-sans font-normal ml-1">({stat.correct}/{stat.total})</span>
                            </span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ── Stats & Milestones tab ────────────────────────────────────────────────────
const StatsTab: React.FC = () => {
    const lifetime = getLifetimeStats();
    const bookmarks = getBookmarks();
    const [showBookmarks, setShowBookmarks] = useState(false);
    const [bmList, setBmList] = useState<BookmarkedPosition[]>(bookmarks);

    const getCategoryValue = (m: Milestone) => {
        switch (m.category) {
            case 'games': return lifetime.totalGames;
            case 'gm-beats': return lifetime.totalGmBeats;
            case 'streak': return lifetime.bestStreak;
            case 'score': return lifetime.bestSessionScore;
            case 'accuracy': return lifetime.totalPositions;
            default: return 0;
        }
    };

    if (showBookmarks) {
        return (
            <div>
                <button onClick={() => setShowBookmarks(false)} className="text-xs text-cyan-400 hover:underline mb-3 flex items-center gap-1">
                    ← Back to stats
                </button>
                <div className="text-xs text-slate-500 mb-3">Saved positions ({bmList.length})</div>
                {bmList.length === 0 ? (
                    <div className="text-slate-600 text-sm text-center py-8">No bookmarks yet</div>
                ) : (
                    <div className="space-y-2">
                        {bmList.map((bm) => (
                            <div key={bm.fen} className="flex items-center justify-between px-3 py-2.5 bg-slate-800/50 rounded-md border border-slate-700">
                                <div className="flex-1 min-w-0">
                                    <div className="text-slate-300 text-xs font-mono truncate">{bm.gmMove}</div>
                                    <div className="text-slate-500 text-[10px] flex items-center gap-2">
                                        <span>{bm.gmUsername}</span>
                                        {bm.openingName && (
                                            <span>♟ {bm.openingName}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {bm.gameUrl && bm.gameUrl !== 'https://lichess.org' && (
                                        <a href={bm.gameUrl} target="_blank" rel="noopener noreferrer"
                                            className="text-slate-600 hover:text-cyan-400 transition-colors p-1">
                                            <TrendingUp className="w-3 h-3" />
                                        </a>
                                    )}
                                    <button onClick={() => {
                                        removeBookmark(bm.fen);
                                        setBmList(prev => prev.filter(b => b.fen !== bm.fen));
                                    }} className="text-slate-700 hover:text-rose-400 transition-colors p-1">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            {/* Lifetime stats grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-800/50 rounded-md py-2.5 px-3 text-center">
                    <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Games</div>
                    <div className="text-cyan-400 font-bold font-mono text-lg">{lifetime.totalGames}</div>
                </div>
                <div className="bg-slate-800/50 rounded-md py-2.5 px-3 text-center">
                    <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Positions</div>
                    <div className="text-slate-200 font-bold font-mono text-lg">{lifetime.totalPositions}</div>
                </div>
                <div className="bg-slate-800/50 rounded-md py-2.5 px-3 text-center">
                    <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Accuracy</div>
                    <div className="text-emerald-400 font-bold font-mono text-lg">
                        {lifetime.totalPositions > 0 ? Math.round((lifetime.totalCorrect / lifetime.totalPositions) * 100) : 0}%
                    </div>
                </div>
                <div className="bg-slate-800/50 rounded-md py-2.5 px-3 text-center">
                    <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Better Moves</div>
                    <div className="text-yellow-400 font-bold font-mono text-lg">{lifetime.totalGmBeats}</div>
                </div>
                <div className="bg-slate-800/50 rounded-md py-2.5 px-3 text-center">
                    <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Best Streak</div>
                    <div className="text-orange-400 font-bold font-mono text-lg">{lifetime.bestStreak}</div>
                </div>
                <div className="bg-slate-800/50 rounded-md py-2.5 px-3 text-center">
                    <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Best Score</div>
                    <div className="text-slate-200 font-bold font-mono text-lg">{lifetime.bestSessionScore}</div>
                </div>
            </div>

            {/* Bookmarks shortcut */}
            {bookmarks.length > 0 && (
                <button onClick={() => setShowBookmarks(true)}
                    className="w-full flex items-center justify-between px-3 py-2.5 mb-4 bg-amber-500/5 border border-amber-500/20 rounded-md text-sm text-amber-400 hover:bg-amber-500/10 transition-colors">
                    <span className="flex items-center gap-2">
                        <Bookmark className="w-4 h-4" />
                        Bookmarked Positions
                    </span>
                    <span className="text-amber-500/60 font-mono text-xs">{bookmarks.length}</span>
                </button>
            )}

            {/* Milestones */}
            <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">Milestones</div>
            <div className="space-y-2">
                {MILESTONES.map((m) => {
                    const current = getCategoryValue(m);
                    const earned = current >= m.threshold;
                    const progress = Math.min(1, current / m.threshold);
                    return (
                        <div key={m.id} className={`flex items-center gap-3 px-3 py-2 rounded-md border transition-all ${earned
                            ? 'bg-emerald-500/5 border-emerald-500/30'
                            : 'bg-slate-800 border-slate-700 opacity-60'}`}>
                            <span className="text-xl">{m.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className={`text-xs font-bold ${earned ? 'text-emerald-400' : 'text-slate-400'}`}>{m.label}</div>
                                <div className="text-[10px] text-slate-600">{m.description}</div>
                                {!earned && (
                                    <div className="mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-cyan-500/70 rounded-full" style={{ width: `${progress * 100}%` }} />
                                    </div>
                                )}
                            </div>
                            {earned && <span className="text-emerald-400 text-xs font-bold">✓</span>}
                            {!earned && <span className="text-slate-600 text-[10px] font-mono">{current}/{m.threshold}</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Main History modal ────────────────────────────────────────────────────────
export const History: React.FC<HistoryProps> = ({ sessions, onClose, difficulty, positionCount }) => {
    const dialogRef = useDialogA11y(onClose);
    const [tab, setTab] = useState<HistoryTab>('sessions');
    const eloHistory = computeEloHistory(sessions);
    const elo = currentElo(sessions);

    const tabs: { id: HistoryTab; label: string; icon: React.ReactNode }[] = [
        { id: 'sessions', label: 'Sessions', icon: <Clock className="w-3.5 h-3.5" /> },
        { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-3.5 h-3.5" /> },
        { id: 'elo', label: 'Elo', icon: <TrendingUp className="w-3.5 h-3.5" /> },
        { id: 'gms', label: 'Players', icon: <Trophy className="w-3.5 h-3.5" /> },
        { id: 'leaderboard', label: 'Global', icon: <Globe className="w-3.5 h-3.5" /> },
    ];

    return (
        <div
            className="theme-game fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="history-title" className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span id="history-title" className="text-slate-200 font-bold text-base">History</span>
                        {sessions.length > 0 && (
                            <span className="text-xs bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-2 py-0.5 rounded-full font-mono">
                                Elo {elo}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} aria-label="Close history" className="text-slate-500 hover:text-slate-200 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tab bar — horizontally scrollable so tabs never clip on narrow screens */}
                <div className="flex border-b border-slate-800 overflow-x-auto no-scrollbar">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            role="tab"
                            aria-selected={tab === t.id}
                            className={`shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap
                ${tab === t.id
                                    ? 'text-cyan-400 border-b-2 border-cyan-500 bg-cyan-500/5'
                                    : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'}`}
                        >
                            {t.icon}
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-4 max-h-[65vh] overflow-y-auto">

                    {/* Sessions tab */}
                    {tab === 'sessions' && (
                        sessions.length === 0 ? (
                            <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
                                No sessions yet — play a game!
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {sessions.map((s, i) => {
                                    const acc = s.totalPlayed > 0 ? Math.round((s.correctCount / s.totalPlayed) * 100) : 0;
                                    const dateStr = new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                    const accColor = acc >= 60 ? 'text-emerald-400' : acc >= 40 ? 'text-amber-400' : 'text-rose-400';
                                    return (
                                        <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-slate-800/50 rounded-md border border-slate-700">
                                            <div>
                                                <div className="text-slate-300 text-sm font-semibold">{s.difficulty} · {s.positionCount} pos</div>
                                                <div className="text-slate-500 text-xs">{dateStr}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-slate-200 font-bold font-mono">{s.score} pts</div>
                                                <div className={`text-xs font-semibold ${accColor}`}>{acc}%</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}

                    {/* Elo tab */}
                    {tab === 'elo' && (
                        <div>
                            <div className="text-xs text-slate-500 mb-3">Intuition Elo over last {sessions.length} session{sessions.length !== 1 ? 's' : ''}</div>
                            <EloSparkline history={eloHistory} />
                            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                <div className="bg-slate-800/50 rounded-md py-2 px-3">
                                    <div className="text-slate-400 text-xs mb-1">Current</div>
                                    <div className="text-cyan-400 font-bold font-mono">{elo}</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-md py-2 px-3">
                                    <div className="text-slate-400 text-xs mb-1">Peak</div>
                                    <div className="text-emerald-400 font-bold font-mono">{eloHistory.length > 0 ? Math.max(...eloHistory) : 1200}</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-md py-2 px-3">
                                    <div className="text-slate-400 text-xs mb-1">Sessions</div>
                                    <div className="text-slate-200 font-bold font-mono">{sessions.length}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* GMs tab */}
                    {tab === 'gms' && (
                        <div>
                            <div className="text-xs text-slate-500 mb-3">Your prediction accuracy for each featured player</div>
                            <GMLedgerboard sessions={sessions} />
                        </div>
                    )}

                    {/* Global leaderboard tab */}
                    {tab === 'leaderboard' && (
                        <div>
                            <div className="text-xs text-slate-500 mb-3">
                                Top players · {difficulty} · {positionCount} pos
                            </div>
                            <Leaderboard difficulty={difficulty} positionCount={positionCount} />
                        </div>
                    )}

                    {/* Stats tab */}
                    {tab === 'stats' && (
                        <StatsTab />
                    )}
                </div>
            </div>
        </div>
    );
};
