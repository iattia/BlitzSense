import React, { useEffect, useState } from 'react';
import { Globe2, Loader2 } from 'lucide-react';
import { getLeaderboard, LeaderboardEntry } from '../db/sessions';
import type { Difficulty } from '../types';

interface LeaderboardProps {
    difficulty: Difficulty;
    positionCount: number;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ difficulty, positionCount }) => {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        getLeaderboard(difficulty, positionCount, 20).then((data) => {
            if (!active) return;
            setEntries(data);
            setLoading(false);
        });
        return () => { active = false; };
    }, [difficulty, positionCount]);

    if (loading) {
        return (
            <div className="flex min-h-52 items-center justify-center rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-[#22211f]">
                <Loader2 className="h-5 w-5 animate-spin text-stone-500" aria-label="Loading leaderboard" />
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-stone-200 bg-white px-6 text-center dark:border-stone-800 dark:bg-[#22211f]">
                <Globe2 className="mb-3 h-6 w-6 text-stone-400" aria-hidden="true" />
                <p className="font-medium text-stone-800 dark:text-stone-200">No leaderboard scores available</p>
                <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">Scores will appear here when this category has submissions.</p>
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-[#22211f]">
            <div className="hidden grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] gap-4 border-b border-stone-200 px-5 py-3 text-xs font-medium uppercase tracking-[0.12em] text-stone-500 dark:border-stone-800 dark:text-stone-400 sm:grid">
                <span>Rank</span><span>Player</span><span>Accuracy</span><span className="text-right">Best</span>
            </div>
            <div className="divide-y divide-stone-200 dark:divide-stone-800">
            {entries.map((e, i) => (
                <div
                    key={e.username + i}
                    className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition hover:bg-stone-50 dark:hover:bg-stone-900/60 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] sm:gap-4 sm:px-5"
                >
                    {/* Rank */}
                    <div className="text-center text-sm">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${i < 3
                            ? 'bg-[#748c4a]/15 text-[#5f763b] dark:bg-[#b3c78f]/15 dark:text-[#c7d8a7]'
                            : 'text-stone-500 dark:text-stone-400'}`}>{i + 1}</span>
                    </div>

                    <div className="flex min-w-0 items-center gap-3">
                        {e.avatar_url
                            ? <img src={e.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                            : (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#748c4a]/15 dark:bg-[#b3c78f]/15">
                                    <span className="text-xs font-bold text-[#5f763b] dark:text-[#b3c78f]">{e.username[0]?.toUpperCase()}</span>
                                </div>
                            )
                        }
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-stone-800 dark:text-stone-200">{e.username}</div>
                            <div className="text-xs text-stone-500 dark:text-stone-400">{e.total_sessions} session{e.total_sessions !== 1 ? 's' : ''}</div>
                        </div>
                    </div>

                    <div className="hidden font-mono text-sm font-semibold text-stone-600 dark:text-stone-300 sm:block">{Math.round(e.avg_accuracy)}%</div>
                    <div className="text-right">
                        <div className="font-mono text-sm font-bold text-stone-900 dark:text-stone-100">{e.best_score}</div>
                        <div className="text-xs text-stone-500 dark:text-stone-400 sm:hidden">{Math.round(e.avg_accuracy)}% accuracy</div>
                    </div>
                </div>
            ))}
            </div>
        </div>
    );
};
