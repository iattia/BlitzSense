import React, { useState, useEffect } from 'react';
import { X, Trophy, Lock, Clock, CalendarDays } from 'lucide-react';
import { getDailyCompletion, todayUTC, DailyCompletion } from '../utils/storage';
import { seedFromString } from '../utils/random';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { DAILY_GMS } from '../data/dailyGms';

interface DailyChallengeProps {
    onClose: () => void;
    onStart: (gmUsername: string, challengeDate: string) => void;
}

function getCountdown(): string {
    const now = new Date();
    // Find next midnight in America/New_York (handles EST/EDT automatically)
    // Create a formatter to get the current ET offset
    const etParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(now);
    const etH = parseInt(etParts.find(p => p.type === 'hour')!.value);
    const etM = parseInt(etParts.find(p => p.type === 'minute')!.value);
    const etS = parseInt(etParts.find(p => p.type === 'second')!.value);
    // Seconds remaining until midnight ET
    const totalSecsLeft = (24 * 3600) - (etH * 3600 + etM * 60 + etS);
    const h = Math.floor(totalSecsLeft / 3600);
    const m = Math.floor((totalSecsLeft % 3600) / 60);
    const s = totalSecsLeft % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

export const DailyChallenge: React.FC<DailyChallengeProps> = ({ onClose, onStart }) => {
    const dialogRef = useDialogA11y(onClose);
    const today = todayUTC();
    const seed = seedFromString(today);
    const dailyGM = DAILY_GMS[seed % DAILY_GMS.length];
    const gmName = dailyGM.name;
    const gmUsername = dailyGM.username;
    const completion: DailyCompletion | null = getDailyCompletion(today);
    const [countdown, setCountdown] = useState(getCountdown());

    useEffect(() => {
        const id = setInterval(() => setCountdown(getCountdown()), 1000);
        return () => clearInterval(id);
    }, []);

    // Format date nicely
    const displayDate = new Date(today + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
    });

    return (
        <div
            className="theme-game fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="daily-challenge-title" className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-sm shadow-2xl relative">
                {/* Close */}
                <button
                    onClick={onClose}
                    aria-label="Close daily challenge"
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-800 text-slate-300"><CalendarDays className="h-4 w-4" /></div>
                    <div>
                        <div id="daily-challenge-title" className="text-slate-200 font-bold text-sm">Daily Challenge</div>
                        <div className="text-slate-500 text-xs">{displayDate}</div>
                    </div>
                </div>

                {/* Today's featured player */}
                <div className="bg-slate-800 rounded-md border border-slate-700 p-4 mb-5">
                    <div className="text-slate-500 text-xs uppercase tracking-widest mb-1">Featured player</div>
                    <div className="text-slate-100 font-bold text-xl">{gmName}</div>
                    <div className="text-slate-500 text-xs mt-1">10 positions · 10 seconds per move</div>
                </div>

                {/* Completion or Play */}
                {completion ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-4 py-3">
                            <Trophy className="w-5 h-5 text-emerald-400 shrink-0" />
                            <div className="text-left">
                                <div className="text-emerald-300 font-bold text-sm">Completed!</div>
                                <div className="text-slate-400 text-xs">
                                    Score: <span className="text-slate-100 font-bold">{completion.score} pts</span>
                                    {' · '}Accuracy: <span className="text-slate-100 font-bold">
                                        {Math.round((completion.correctCount / completion.totalPlayed) * 100)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-slate-600 text-xs">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Next challenge in</span>
                            <span className="text-slate-400 font-mono font-bold">{countdown}</span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <button
                            onClick={() => { onStart(gmUsername, today); onClose(); }}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-md bg-cyan-500 text-white font-bold text-sm hover:bg-cyan-400 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                        >
                            Play Today's Challenge
                        </button>

                        <div className="flex items-center justify-center gap-2 text-slate-600 text-xs">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Resets in <span className="text-slate-400 font-mono font-bold">{countdown}</span></span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
