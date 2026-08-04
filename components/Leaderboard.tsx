import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
        getLeaderboard(difficulty, positionCount, 20).then((data) => {
            setEntries(data);
            setLoading(false);
        });
    }, [difficulty, positionCount]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-24">
                <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
                No scores yet — be the first!
            </div>
        );
    }

    const medals = ['🥇', '🥈', '🥉'];

    return (
        <div className="space-y-2">
            {entries.map((e, i) => (
                <div
                    key={e.username + i}
                    className="flex items-center gap-3 px-3 py-2.5 bg-slate-800/50 rounded-md border border-slate-700"
                >
                    {/* Rank */}
                    <div className="w-6 text-center text-sm shrink-0">
                        {i < 3 ? medals[i] : <span className="text-slate-500 text-xs font-bold">#{i + 1}</span>}
                    </div>

                    {/* Avatar */}
                    {e.avatar_url
                        ? <img src={e.avatar_url} alt={e.username} className="w-7 h-7 rounded-full shrink-0 object-cover" />
                        : (
                            <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                                <span className="text-cyan-400 text-xs font-bold">{e.username[0]?.toUpperCase()}</span>
                            </div>
                        )
                    }

                    {/* Name + sessions */}
                    <div className="flex-1 min-w-0">
                        <div className="text-slate-200 text-sm font-semibold truncate">{e.username}</div>
                        <div className="text-slate-600 text-xs">{e.total_sessions} session{e.total_sessions !== 1 ? 's' : ''}</div>
                    </div>

                    {/* Score + accuracy */}
                    <div className="text-right shrink-0">
                        <div className="text-slate-100 font-bold font-mono text-sm">{e.best_score}</div>
                        <div className="text-slate-500 text-xs">{Math.round(e.avg_accuracy)}%</div>
                    </div>
                </div>
            ))}
        </div>
    );
};
