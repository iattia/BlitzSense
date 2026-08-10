import React, { useMemo, useState } from 'react';
import {
    BarChart3,
    Bookmark,
    Check,
    Clock3,
    ExternalLink,
    Globe2,
    LockKeyhole,
    Trash2,
    TrendingUp,
    Trophy,
    X,
} from 'lucide-react';
import type { BookmarkedPosition, Difficulty, Milestone, SessionRecord } from '../types';
import { computeEloHistory, currentElo } from '../utils/eloHistory';
import { getBookmarks, getLifetimeStats, removeBookmark } from '../utils/storage';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { Leaderboard } from './Leaderboard';

interface HistoryProps {
    sessions: SessionRecord[];
    onClose: () => void;
    difficulty: Difficulty;
    positionCount: number;
}

type HistoryTab = 'sessions' | 'stats' | 'elo' | 'gms' | 'leaderboard';

const HISTORY_TABS: Array<{
    id: HistoryTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { id: 'sessions', label: 'Sessions', icon: Clock3 },
    { id: 'stats', label: 'Stats', icon: BarChart3 },
    { id: 'elo', label: 'Rating', icon: TrendingUp },
    { id: 'gms', label: 'Players', icon: Trophy },
    { id: 'leaderboard', label: 'Global', icon: Globe2 },
];

const MILESTONES: Milestone[] = [
    { id: 'games-10', label: 'Getting Started', description: 'Play 10 sessions', threshold: 10, category: 'games' },
    { id: 'games-50', label: 'Regular', description: 'Play 50 sessions', threshold: 50, category: 'games' },
    { id: 'games-100', label: 'Centurion', description: 'Play 100 sessions', threshold: 100, category: 'games' },
    { id: 'gm-beats-5', label: 'Sharp Eye', description: 'Find 5 better moves', threshold: 5, category: 'gm-beats' },
    { id: 'gm-beats-25', label: 'Move Hunter', description: 'Find 25 better moves', threshold: 25, category: 'gm-beats' },
    { id: 'gm-beats-100', label: 'Engine Instinct', description: 'Find 100 better moves', threshold: 100, category: 'gm-beats' },
    { id: 'streak-5', label: 'Hot Streak', description: '5 correct in a row', threshold: 5, category: 'streak' },
    { id: 'streak-10', label: 'On Fire', description: '10 correct in a row', threshold: 10, category: 'streak' },
    { id: 'streak-20', label: 'Unstoppable', description: '20 correct in a row', threshold: 20, category: 'streak' },
    { id: 'score-500', label: 'Half K', description: 'Score 500+ in one session', threshold: 500, category: 'score' },
    { id: 'score-1000', label: 'Elite Instinct', description: 'Score 1000+ in one session', threshold: 1000, category: 'score' },
    { id: 'positions-500', label: 'Position Grinder', description: 'Play 500 positions total', threshold: 500, category: 'accuracy' },
];

const surfaceClass = 'border border-stone-200 bg-white dark:border-stone-800 dark:bg-[#22211f]';

const SectionHeading: React.FC<{ title: string; description: string }> = ({ title, description }) => (
    <div className="mb-5">
        <h3 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-stone-500 dark:text-stone-400">{description}</p>
    </div>
);

const EmptyState: React.FC<{ title: string; description: string }> = ({ title, description }) => (
    <div className={`flex min-h-52 flex-col items-center justify-center rounded-xl px-6 text-center ${surfaceClass}`}>
        <Clock3 className="mb-3 h-6 w-6 text-stone-400" aria-hidden="true" />
        <p className="font-medium text-stone-800 dark:text-stone-200">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{description}</p>
    </div>
);

const EloSparkline: React.FC<{ history: number[] }> = ({ history }) => {
    if (history.length < 2) {
        return (
            <div className={`flex h-56 items-center justify-center rounded-xl px-6 text-center text-sm text-stone-500 dark:text-stone-400 ${surfaceClass}`}>
                Complete at least two sessions to reveal your rating trend.
            </div>
        );
    }

    const width = 640;
    const height = 220;
    const padLeft = 44;
    const padRight = 54;
    const padY = 24;
    const min = Math.min(...history) - 20;
    const max = Math.max(...history) + 20;
    const range = max - min || 1;
    const points = history.map((value, index) => {
        const x = padLeft + (index / (history.length - 1)) * (width - padLeft - padRight);
        const y = height - padY - ((value - min) / range) * (height - padY * 2);
        return { x, y, value };
    });
    const pointString = points.map(({ x, y }) => `${x},${y}`).join(' ');
    const lastPoint = points[points.length - 1];

    return (
        <div className={`rounded-xl p-3 sm:p-5 ${surfaceClass}`}>
            <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Rating trend ending at ${lastPoint.value}`}>
                {[0.2, 0.5, 0.8].map((ratio) => {
                    const y = padY + ratio * (height - padY * 2);
                    const label = Math.round(max - ratio * range);
                    return (
                        <g key={ratio}>
                            <line x1={padLeft} y1={y} x2={width - padRight} y2={y} className="stroke-stone-200 dark:stroke-stone-700" strokeWidth="1" />
                            <text x={padLeft - 10} y={y + 4} className="fill-stone-400 dark:fill-stone-500" fontSize="11" textAnchor="end">{label}</text>
                        </g>
                    );
                })}
                <polygon
                    points={`${padLeft},${height - padY} ${pointString} ${width - padRight},${height - padY}`}
                    className="fill-[#748c4a]/10 dark:fill-[#b3c78f]/10"
                />
                <polyline points={pointString} fill="none" className="stroke-[#748c4a] dark:stroke-[#b3c78f]" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={lastPoint.x} cy={lastPoint.y} r="6" className="fill-[#748c4a] dark:fill-[#b3c78f]" />
                <text x={lastPoint.x + 12} y={lastPoint.y + 5} className="fill-[#5f763b] dark:fill-[#c7d8a7]" fontSize="13" fontWeight="700">{lastPoint.value}</text>
            </svg>
        </div>
    );
};

const PlayerAccuracy: React.FC<{ sessions: SessionRecord[] }> = ({ sessions }) => {
    const rows = useMemo(() => {
        const aggregate: Record<string, { correct: number; total: number }> = {};
        for (const session of sessions) {
            for (const [player, stat] of Object.entries(session.gmStats)) {
                aggregate[player] ??= { correct: 0, total: 0 };
                aggregate[player].correct += stat.correct;
                aggregate[player].total += stat.total;
            }
        }
        return Object.entries(aggregate)
            .filter(([, stat]) => stat.total > 0)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 12);
    }, [sessions]);

    if (rows.length === 0) {
        return <EmptyState title="No player data yet" description="Complete a session to compare your prediction accuracy across featured players." />;
    }

    return (
        <div className="grid gap-3 md:grid-cols-2">
            {rows.map(([player, stat]) => {
                const percentage = Math.round((stat.correct / stat.total) * 100);
                const sampleIsSmall = stat.total < 3;
                const barClass = sampleIsSmall
                    ? 'bg-stone-400 dark:bg-stone-500'
                    : percentage >= 60 ? 'bg-emerald-500' : percentage >= 40 ? 'bg-amber-500' : 'bg-rose-500';
                const valueClass = sampleIsSmall
                    ? 'text-stone-500 dark:text-stone-400'
                    : percentage >= 60 ? 'text-emerald-600 dark:text-emerald-400' : percentage >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
                return (
                    <article key={player} className={`rounded-xl p-4 ${surfaceClass}`}>
                        <div className="mb-3 flex items-baseline justify-between gap-4">
                            <h4 className="min-w-0 truncate text-sm font-semibold text-stone-800 dark:text-stone-200">{player}</h4>
                            <span className={`shrink-0 font-mono text-sm font-bold ${valueClass}`}>{percentage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" aria-hidden="true">
                            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percentage}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                            {stat.correct} of {stat.total} predictions correct{sampleIsSmall ? ' · small sample' : ''}
                        </p>
                    </article>
                );
            })}
        </div>
    );
};

const StatCard: React.FC<{ label: string; value: string | number; tone?: string }> = ({ label, value, tone = 'text-stone-900 dark:text-stone-100' }) => (
    <div className={`rounded-xl p-4 ${surfaceClass}`}>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">{label}</p>
        <p className={`mt-2 font-mono text-2xl font-bold tracking-tight ${tone}`}>{value}</p>
    </div>
);

const StatsTab: React.FC = () => {
    const lifetime = useMemo(() => getLifetimeStats(), []);
    const [bookmarks, setBookmarks] = useState<BookmarkedPosition[]>(() => getBookmarks());
    const [showBookmarks, setShowBookmarks] = useState(false);

    const getCategoryValue = (milestone: Milestone) => {
        switch (milestone.category) {
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
                <button
                    type="button"
                    onClick={() => setShowBookmarks(false)}
                    className="mb-5 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#5f763b] transition hover:bg-[#748c4a]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#748c4a]/50 dark:text-[#b3c78f]"
                >
                    <span aria-hidden="true">←</span> Back to stats
                </button>
                <SectionHeading title="Saved positions" description={`${bookmarks.length} position${bookmarks.length === 1 ? '' : 's'} saved for later review.`} />
                {bookmarks.length === 0 ? (
                    <EmptyState title="No saved positions" description="Bookmark a position during analysis and it will appear here." />
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {bookmarks.map((bookmark) => (
                            <article key={bookmark.id || bookmark.fen} className={`flex items-center gap-3 rounded-xl p-4 ${surfaceClass}`}>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-mono text-sm font-semibold text-stone-800 dark:text-stone-200">{bookmark.gmMove}</p>
                                    <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
                                        {bookmark.gmUsername}{bookmark.openingName ? ` · ${bookmark.openingName}` : ''}
                                    </p>
                                </div>
                                {bookmark.gameUrl && bookmark.gameUrl !== 'https://lichess.org' && (
                                    <a
                                        href={bookmark.gameUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`Open ${bookmark.gmUsername}'s game`}
                                        className="rounded-lg p-2 text-stone-400 transition hover:bg-stone-100 hover:text-[#5f763b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#748c4a]/50 dark:hover:bg-stone-800 dark:hover:text-[#b3c78f]"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        removeBookmark(bookmark.fen);
                                        setBookmarks((current) => current.filter((item) => item.fen !== bookmark.fen));
                                    }}
                                    aria-label={`Remove ${bookmark.gmUsername}'s saved position`}
                                    className="rounded-lg p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const accuracy = lifetime.totalPositions > 0
        ? Math.round((lifetime.totalCorrect / lifetime.totalPositions) * 100)
        : 0;

    return (
        <div>
            <SectionHeading title="Lifetime stats" description="A compact view of your progress across every completed training session." />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <StatCard label="Sessions" value={lifetime.totalGames} tone="text-[#5f763b] dark:text-[#b3c78f]" />
                <StatCard label="Positions" value={lifetime.totalPositions} />
                <StatCard label="Accuracy" value={`${accuracy}%`} tone="text-emerald-600 dark:text-emerald-400" />
                <StatCard label="Better moves" value={lifetime.totalGmBeats} tone="text-amber-600 dark:text-amber-400" />
                <StatCard label="Best streak" value={lifetime.bestStreak} tone="text-orange-600 dark:text-orange-400" />
                <StatCard label="Best score" value={lifetime.bestSessionScore} />
            </div>

            {bookmarks.length > 0 && (
                <button
                    type="button"
                    onClick={() => setShowBookmarks(true)}
                    className="mt-5 flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-800 transition hover:border-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300"
                >
                    <span className="flex items-center gap-2"><Bookmark className="h-4 w-4" /> Saved positions</span>
                    <span className="font-mono text-xs">{bookmarks.length}</span>
                </button>
            )}

            <div className="mb-3 mt-8 flex items-end justify-between gap-4">
                <div>
                    <h4 className="font-semibold text-stone-900 dark:text-stone-100">Milestones</h4>
                    <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Keep training to unlock each achievement.</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-stone-500 dark:text-stone-400">
                    {MILESTONES.filter((milestone) => getCategoryValue(milestone) >= milestone.threshold).length}/{MILESTONES.length} earned
                </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                {MILESTONES.map((milestone) => {
                    const current = getCategoryValue(milestone);
                    const earned = current >= milestone.threshold;
                    const percentage = Math.min(100, Math.round((current / milestone.threshold) * 100));
                    return (
                        <article
                            key={milestone.id}
                            className={`flex items-center gap-3 rounded-xl border p-4 ${earned
                                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/70 dark:bg-emerald-950/20'
                                : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-[#22211f]'}`}
                        >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${earned
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                                : 'bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500'}`} aria-hidden="true">
                                {earned ? <Check className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                    <h5 className={`truncate text-sm font-semibold ${earned ? 'text-emerald-800 dark:text-emerald-300' : 'text-stone-800 dark:text-stone-200'}`}>{milestone.label}</h5>
                                    <span className="shrink-0 font-mono text-xs text-stone-500 dark:text-stone-400">{earned ? 'Earned' : `${current}/${milestone.threshold}`}</span>
                                </div>
                                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{milestone.description}</p>
                                {!earned && (
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" role="progressbar" aria-label={`${milestone.label} progress`} aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}>
                                        <div className="h-full rounded-full bg-[#748c4a] dark:bg-[#b3c78f]" style={{ width: `${percentage}%` }} />
                                    </div>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
};

const SessionsTab: React.FC<{ sessions: SessionRecord[] }> = ({ sessions }) => {
    const summary = useMemo(() => {
        const positions = sessions.reduce((total, session) => total + session.totalPlayed, 0);
        const correct = sessions.reduce((total, session) => total + session.correctCount, 0);
        return { positions, accuracy: positions > 0 ? Math.round((correct / positions) * 100) : 0 };
    }, [sessions]);

    return (
        <div>
            <SectionHeading title="Recent sessions" description="Review your latest scores and see where your move intuition is improving." />
            {sessions.length === 0 ? (
                <EmptyState title="No sessions yet" description="Finish your first training session and its score, accuracy, and settings will appear here." />
            ) : (
                <>
                    <div className="mb-5 grid grid-cols-3 gap-3">
                        <StatCard label="Sessions" value={sessions.length} tone="text-[#5f763b] dark:text-[#b3c78f]" />
                        <StatCard label="Positions" value={summary.positions} />
                        <StatCard label="Accuracy" value={`${summary.accuracy}%`} tone="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className={`overflow-hidden rounded-xl ${surfaceClass}`}>
                        <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem] gap-4 border-b border-stone-200 px-5 py-3 text-xs font-medium uppercase tracking-[0.12em] text-stone-500 dark:border-stone-800 dark:text-stone-400 sm:grid">
                            <span>Session</span><span>Accuracy</span><span className="text-right">Score</span>
                        </div>
                        <div className="divide-y divide-stone-200 dark:divide-stone-800">
                            {sessions.map((session, index) => {
                                const accuracy = session.totalPlayed > 0 ? Math.round((session.correctCount / session.totalPlayed) * 100) : 0;
                                const date = new Date(session.date);
                                const dateLabel = Number.isNaN(date.getTime())
                                    ? session.date
                                    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                const accuracyClass = accuracy >= 60
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : accuracy >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
                                return (
                                    <article key={`${session.date}-${index}`} className="grid gap-3 px-4 py-4 transition hover:bg-stone-50 dark:hover:bg-stone-900/60 sm:grid-cols-[minmax(0,1fr)_8rem_7rem] sm:items-center sm:gap-4 sm:px-5">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-stone-800 dark:text-stone-200">{session.difficulty} · {session.positionCount} positions</p>
                                            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{dateLabel}</p>
                                        </div>
                                        <div>
                                            <p className={`font-mono text-sm font-bold ${accuracyClass}`}>{accuracy}%</p>
                                            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{session.correctCount}/{session.totalPlayed} correct</p>
                                        </div>
                                        <p className="font-mono text-lg font-bold text-stone-900 dark:text-stone-100 sm:text-right">{session.score}<span className="ml-1 text-xs font-normal text-stone-500 dark:text-stone-400">pts</span></p>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export const History: React.FC<HistoryProps> = ({ sessions, onClose, difficulty, positionCount }) => {
    const dialogRef = useDialogA11y(onClose);
    const [tab, setTab] = useState<HistoryTab>('sessions');
    const eloHistory = useMemo(() => computeEloHistory(sessions), [sessions]);
    const elo = useMemo(() => currentElo(sessions), [sessions]);

    const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: HistoryTab) => {
        const currentIndex = HISTORY_TABS.findIndex(({ id }) => id === currentTab);
        let nextIndex: number | null = null;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % HISTORY_TABS.length;
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + HISTORY_TABS.length) % HISTORY_TABS.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = HISTORY_TABS.length - 1;
        if (nextIndex === null) return;

        event.preventDefault();
        const nextTab = HISTORY_TABS[nextIndex].id;
        setTab(nextTab);
        requestAnimationFrame(() => document.getElementById(`history-tab-${nextTab}`)?.focus());
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="history-title"
                aria-describedby="history-description"
                className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f5f4ef] text-stone-900 shadow-2xl dark:bg-[#191917] dark:text-stone-100 sm:h-[min(46rem,calc(100dvh-2.5rem))] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-stone-200 dark:sm:border-stone-800"
            >
                <header className="flex shrink-0 items-start justify-between gap-5 border-b border-stone-200 bg-white px-4 py-4 dark:border-stone-800 dark:bg-[#22211f] sm:px-6 sm:py-5">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h2 id="history-title" className="text-xl font-semibold tracking-tight text-stone-950 dark:text-white">Training history</h2>
                            {sessions.length > 0 && (
                                <span className="rounded-full border border-[#748c4a]/30 bg-[#748c4a]/10 px-2.5 py-1 font-mono text-xs font-bold text-[#5f763b] dark:border-[#b3c78f]/30 dark:bg-[#b3c78f]/10 dark:text-[#c7d8a7]">
                                    {elo} Elo
                                </span>
                            )}
                        </div>
                        <p id="history-description" className="mt-1 text-sm text-stone-500 dark:text-stone-400">Track sessions, milestones, rating, and player accuracy.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close history"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#748c4a]/50 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div role="tablist" aria-label="History sections" className="grid shrink-0 grid-cols-5 border-b border-stone-200 bg-white px-1 dark:border-stone-800 dark:bg-[#22211f] sm:px-4">
                    {HISTORY_TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            id={`history-tab-${id}`}
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            aria-controls={`history-panel-${id}`}
                            tabIndex={tab === id ? 0 : -1}
                            onClick={() => setTab(id)}
                            onKeyDown={(event) => handleTabKeyDown(event, id)}
                            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2.5 text-[10px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#748c4a]/50 sm:flex-row sm:gap-2 sm:px-4 sm:py-3.5 sm:text-sm ${tab === id
                                ? 'text-[#5f763b] dark:text-[#c7d8a7]'
                                : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-900/60 dark:hover:text-stone-100'}`}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{label}</span>
                            {tab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#748c4a] dark:bg-[#b3c78f] sm:inset-x-6" aria-hidden="true" />}
                        </button>
                    ))}
                </div>

                <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
                    <section id={`history-panel-${tab}`} role="tabpanel" aria-labelledby={`history-tab-${tab}`} tabIndex={0} className="outline-none">
                        {tab === 'sessions' && <SessionsTab sessions={sessions} />}
                        {tab === 'stats' && <StatsTab />}
                        {tab === 'elo' && (
                            <div>
                                <SectionHeading title="Intuition rating" description={`Your rating movement across ${sessions.length} completed session${sessions.length === 1 ? '' : 's'}.`} />
                                <EloSparkline history={eloHistory} />
                                <div className="mt-4 grid grid-cols-3 gap-3">
                                    <StatCard label="Current" value={elo} tone="text-[#5f763b] dark:text-[#b3c78f]" />
                                    <StatCard label="Peak" value={eloHistory.length > 0 ? Math.max(...eloHistory) : 1200} tone="text-emerald-600 dark:text-emerald-400" />
                                    <StatCard label="Sessions" value={sessions.length} />
                                </div>
                            </div>
                        )}
                        {tab === 'gms' && (
                            <div>
                                <SectionHeading title="Player accuracy" description="See which featured players' moves you predict most consistently." />
                                <PlayerAccuracy sessions={sessions} />
                            </div>
                        )}
                        {tab === 'leaderboard' && (
                            <div>
                                <SectionHeading title="Global leaderboard" description={`Best scores for ${difficulty.toLowerCase()} sessions with ${positionCount} positions.`} />
                                <Leaderboard difficulty={difficulty} positionCount={positionCount} />
                            </div>
                        )}
                    </section>
                </main>
            </div>
        </div>
    );
};
