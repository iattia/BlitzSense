import React, { useState } from 'react';
import { GameStats, Difficulty, BoardTheme } from '../types';
import { Button } from './ui/Button';
import { addBookmark, removeBookmark, isBookmarked } from '../utils/storage';
import {
  Target, TrendingUp, RotateCcw, X, ChevronLeft, ChevronRight,
  Star, ExternalLink, Zap, Clock, Share2, Check, Bookmark, BookmarkCheck,
} from 'lucide-react';
import { Chess } from 'chess.js';
import { EvalBar, formatEngineEvaluation } from './ui/EvalBar';
import { MaterialCounter } from './ui/MaterialCounter';
import { ChessgroundBoard } from './ChessgroundBoard';
import { getCentipawnLoss, getMoveShapes } from '../utils/chessLogic';

function moveLossLabel(move: string | null | undefined, turn: 'w' | 'b', engineLines: NonNullable<GameStats['history'][number]['engineLines']>): string {
  if (!move) return 'No move';
  const loss = getCentipawnLoss(move, turn, engineLines);
  if (loss === undefined) return `Outside engine top ${engineLines.length}`;
  return loss === 0 ? 'Best move' : `${(loss / 100).toFixed(2)} pawn loss`;
}

interface ResultsProps {
  stats: GameStats;
  difficulty: Difficulty;
  boardTheme: BoardTheme;
  streak: number;
  intuitionElo: number;
  eloChange: number;
  onPlayAgain: () => void;
  onRetryMistakes: () => void;
  onHome: () => void;
}

export const Results: React.FC<ResultsProps> = ({ stats, difficulty, boardTheme, streak, intuitionElo, eloChange, onPlayAgain, onRetryMistakes, onHome }) => {
  const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [bookmarkedFens, setBookmarkedFens] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const r of stats.history) { if (isBookmarked(r.fen)) set.add(r.fen); }
    return set;
  });

  const toggleBookmark = (round: typeof stats.history[0]) => {
    if (bookmarkedFens.has(round.fen)) {
      removeBookmark(round.fen);
      setBookmarkedFens(prev => { const s = new Set(prev); s.delete(round.fen); return s; });
    } else {
      addBookmark({
        id: round.positionId, fen: round.fen, gmMove: round.gmMove, bestMoves: round.bestMoves,
        players: round.players, gmUsername: round.gmUsername, gameUrl: round.gameUrl,
        openingName: round.openingName, savedAt: new Date().toISOString(),
      });
      setBookmarkedFens(prev => new Set(prev).add(round.fen));
    }
  };

  const accuracy = Math.round((stats.correctCount / stats.totalPlayed) * 100) || 0;
  const beatGmCount = stats.history.filter((r) => r.beatGm).length;
  const speedBonusTotal = stats.history.reduce((sum, r) => sum + (r.speedBonus ?? 0), 0);

  // Per-GM accuracy breakdown
  type GmStat = { correct: number; total: number };
  const gmStats: Record<string, GmStat> = {};
  for (const r of stats.history) {
    const gm = r.gmUsername;
    if (!gmStats[gm]) gmStats[gm] = { correct: 0, total: 0 };
    gmStats[gm].total++;
    if (r.isCorrect) gmStats[gm].correct++;
  }
  const gmList = Object.entries(gmStats).sort((a, b) => b[1].total - a[1].total);

  // Accuracy color
  const accuracyColor = accuracy >= 70 ? 'text-emerald-400' : accuracy >= 40 ? 'text-amber-400' : 'text-rose-400';

  // Analysis overlay
  if (analyzingIndex !== null) {
    const round = stats.history[analyzingIndex];
    const chess = new Chess(round.fen);
    const turn = chess.turn();
    const moveShapes = getMoveShapes(round.fen, {
      engineMove: round.bestMoves[0],
      gmMove: round.gmMove,
      userMove: round.userMove,
    });

    return (
      <div className="theme-game fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center overflow-y-auto py-4 px-4">
        <div className="w-full max-w-md flex justify-between items-center mb-3">
          <div className="text-slate-400 text-sm font-mono">ANALYSIS {analyzingIndex + 1}/{stats.totalPlayed}</div>
          <button onClick={() => setAnalyzingIndex(null)}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-100 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Result badge */}
        <div className="w-full max-w-md mb-3">
          <div className={`flex items-center justify-between px-4 py-2 rounded-md border ${round.beatGm ? 'bg-yellow-400/10 border-yellow-400/40' :
            round.isCorrect ? 'bg-emerald-500/10 border-emerald-500/40' :
              'bg-rose-500/10 border-rose-500/40'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {round.beatGm ? <Star className="w-4 h-4 text-yellow-400" /> :
                round.isCorrect ? <Target className="w-4 h-4 text-emerald-400" /> :
                  <X className="w-4 h-4 text-rose-400" />}
              <span className={`font-bold text-sm ${round.beatGm ? 'text-yellow-400' :
                round.isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                {round.beatGm ? 'BETTER THAN THE PLAYED MOVE' :
                  round.isCorrect ? 'GOOD MOVE' : round.userMove ? 'MISSED' : 'TIME UP'}
              </span>
              {round.speedBonus > 0 && (
                <span className="text-amber-400 text-xs font-bold flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />+{round.speedBonus} FAST
                </span>
              )}

            </div>
            <span className="text-slate-100 font-black">+{round.scoreEarned}</span>
          </div>
        </div>

        {/* Opening tag */}
        {round.openingName && (
          <div className="w-full max-w-md mb-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs">
              <span className="text-slate-500">♟</span>
              <span className="text-slate-300 font-semibold">{round.openingName}</span>
            </div>
          </div>
        )}

        {/* Top player's captured material */}
        <MaterialCounter
          fen={round.fen}
          orientation={turn === 'w' ? 'white' : 'black'}
          side="top"
          className="w-full max-w-md mb-1 pl-[52px]"
        />

        {/* Board + EvalBar */}
        <div className="relative w-full max-w-md flex items-stretch gap-2">
          <EvalBar
            evalScore={formatEngineEvaluation(round.evaluation)}
            orientation={turn === 'w' ? 'white' : 'black'}
            className="h-auto shrink-0"
          />
          <div className="relative w-full aspect-square rounded-sm overflow-hidden shadow-2xl shadow-black/50">
            <ChessgroundBoard
              fen={round.fen}
              boardOrientation={turn === 'w' ? 'white' : 'black'}
              boardTheme={boardTheme}
              onPieceDrop={() => false}
              interactive={false}
              moveShapes={moveShapes}
            />
          </div>
        </div>

        {/* Bottom player's captured material */}
        <MaterialCounter
          fen={round.fen}
          orientation={turn === 'w' ? 'white' : 'black'}
          side="bottom"
          className="w-full max-w-md mt-1 mb-2 pl-[52px]"
        />

        {/* Arrow legend */}
        <div className="flex flex-wrap justify-center gap-4 text-xs text-slate-400 mb-3">
          <span className="flex items-center gap-1 text-emerald-400"><span className="w-3 h-1 rounded bg-emerald-400 inline-block" /> {round.bestMoves[0] === round.gmMove ? 'Engine #1 · played move' : 'Engine #1'}</span>
          {round.bestMoves[0] && round.bestMoves[0] !== round.gmMove && (
            <span className="flex items-center gap-1 text-sky-400"><span className="w-3 h-1 rounded bg-sky-400 inline-block" /> Played move</span>
          )}
          {round.userMove && round.userMove !== round.gmMove && round.userMove !== round.bestMoves[0] && (
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-rose-500 inline-block" /> Your move</span>
          )}
        </div>

        <div className="w-full max-w-md bg-slate-800 p-4 rounded-md border border-slate-700 mb-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">{round.gmUsername}</span>
                          {round.gameUrl && (
                <a href={round.gameUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-slate-600 hover:text-cyan-400 transition-colors text-xs">
                  <ExternalLink className="w-3 h-3" /> {round.gameUrl.includes('chess.com') ? 'Chess.com' : 'Lichess'}
                </a>
              )}
            </div>
            <button onClick={() => toggleBookmark(round)}
              className={`p-1.5 rounded transition-colors ${bookmarkedFens.has(round.fen) ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400'}`}
              title={bookmarkedFens.has(round.fen) ? 'Remove bookmark' : 'Bookmark position'}>
              {bookmarkedFens.has(round.fen) ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm text-center">
            <div>
              <div className="text-slate-500 text-xs mb-1">Your Move</div>
              <div className="text-slate-100 font-mono font-bold text-lg">{round.userMove || '—'}</div>
              <div className="mt-1 text-[10px] text-slate-500">{moveLossLabel(round.userMove, turn, round.engineLines ?? [])}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">Played in game</div>
              <div className="text-sky-400 font-mono font-bold text-lg">{round.gmMove}</div>
              <div className="mt-1 text-[10px] text-slate-500">{moveLossLabel(round.gmMove, turn, round.engineLines ?? [])}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">Engine #1</div>
              <div className="text-emerald-400 font-mono font-bold text-lg">{round.bestMoves[0] || '—'}</div>
              <div className="mt-1 text-[10px] text-emerald-400/75">Best move</div>
            </div>
          </div>
          {round.bestMoves.length > 1 && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <div className="text-slate-500 text-xs mb-2">Engine top moves</div>
              <div className="flex gap-2">
                {round.bestMoves.map((m, i) => (
                  <span key={i} className={`font-mono text-sm font-bold px-2 py-1 rounded-lg bg-slate-950 ${i === 0 ? 'text-emerald-400' : i === 1 ? 'text-cyan-400' : 'text-purple-400'}`}>
                    {i + 1}. {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <Button variant="secondary" size="sm"
            onClick={() => setAnalyzingIndex(prev => Math.max(0, (prev || 0) - 1))}
            disabled={analyzingIndex === 0} className="disabled:opacity-50">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button variant="secondary" size="sm"
            onClick={() => setAnalyzingIndex(prev => Math.min(stats.totalPlayed - 1, (prev || 0) + 1))}
            disabled={analyzingIndex === stats.totalPlayed - 1} className="disabled:opacity-50">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  // Main results screen
  return (
    <div className="theme-game flex flex-col items-center min-h-screen p-6 bg-slate-900 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto">

      {/* Score card */}
      <div className="mb-5 p-6 bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md">
        <div className="text-slate-400 text-sm uppercase tracking-wider mb-1">Total Score</div>
        <div className="text-6xl font-extrabold text-cyan-400 mb-5">
          {stats.score}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <div className="bg-slate-950 p-2.5 rounded-md border border-slate-700">
            <Target className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
            <div className={`text-lg font-bold ${accuracyColor}`}>{accuracy}%</div>
            <div className="text-xs text-slate-500">Accuracy</div>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-md border border-slate-700">
            <TrendingUp className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <div className="text-lg font-bold text-slate-100">{intuitionElo}</div>
            <div className="text-xs text-slate-500">Intuition Elo</div>
            {eloChange !== 0 && (
              <div className={`text-xs font-bold mt-0.5 ${eloChange > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {eloChange > 0 ? '+' : ''}{eloChange}
              </div>
            )}
          </div>
          <div className="bg-slate-950 p-2.5 rounded-md border border-slate-700">
            <Star className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
            <div className="text-lg font-bold text-slate-100">{beatGmCount}</div>
            <div className="text-xs text-slate-500">Better moves</div>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-md border border-slate-700">
            <Zap className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <div className="text-lg font-bold text-slate-100">+{speedBonusTotal}</div>
            <div className="text-xs text-slate-500">Speed Pts</div>
          </div>
          {streak > 0 && (
            <div className="bg-orange-500/10 p-2.5 rounded-md border border-orange-500/20">
              <span className="text-base block text-center mb-1">🔥</span>
              <div className="text-lg font-bold text-orange-400">{streak}</div>
              <div className="text-xs text-slate-500">Day Streak</div>
            </div>
          )}
        </div>

        {/* Round dots */}
        <div className="border-t border-slate-700 pt-4">
          <div className="text-xs text-slate-500 mb-2">Tap to analyze</div>
          <div className="flex gap-2 justify-center flex-wrap">
            {stats.history.map((res, i) => (
              <button key={i} onClick={() => setAnalyzingIndex(i)}
                title={`Round ${i + 1}: ${res.beatGm ? 'Better than the played move' : res.isCorrect ? 'Correct' : 'Incorrect'}${res.openingName ? ` · ${res.openingName}` : ''}`}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-125 focus:outline-none text-xs font-bold ${res.beatGm ? 'bg-yellow-400 text-slate-900' :
                  res.isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                {res.beatGm ? '★' : i + 1}
              </button>
            ))}
          </div>
          {beatGmCount > 0 && (
            <div className="text-yellow-400 text-xs mt-2 font-semibold">★ = Better than the move played in the game</div>
          )}
        </div>
      </div>

      {/* Per-GM accuracy breakdown */}
      {gmList.length > 1 && (
        <div className="w-full max-w-md mb-5 bg-slate-800 rounded-lg border border-slate-700 p-4">
          <div className="text-slate-400 text-xs uppercase tracking-widest mb-3 text-left">Breakdown</div>
          <div className="space-y-2">
            {gmList.map(([gm, s]) => {
              const pct = Math.round((s.correct / s.total) * 100);
              const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-500';
              return (
                <div key={gm} className="flex items-center gap-3">
                  <div className="text-slate-300 text-xs font-medium w-32 text-left truncate">{gm}</div>
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-slate-400 text-xs font-mono w-16 text-right">
                    {s.correct}/{s.total} ({pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Share */}
      <div className="w-full max-w-xs mb-2">
        <button
          onClick={async () => {
            const emojis = stats.history.map((r) =>
              r.beatGm ? '⭐' : r.isCorrect ? '🟢' : r.userMove ? '🔴' : '⏱'
            ).join('');
            const streakStr = streak > 0 ? ` | 🔥 ${streak}d streak` : '';
            // Opening breakdown
            const openingCounts: Record<string, number> = {};
            for (const r of stats.history) {
              if (r.openingName) {
                openingCounts[r.openingName] = (openingCounts[r.openingName] || 0) + 1;
              }
            }
            const openingLine = Object.entries(openingCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([o, c]) => `♟${o}×${c}`)
              .join(' ');
            const text = `⚡ BlitzSense  ${difficulty} · ${stats.totalPlayed} positions\nScore: ${stats.score} | Accuracy: ${Math.round((stats.correctCount / stats.totalPlayed) * 100)}%${streakStr}\n${emojis}${openingLine ? `\n${openingLine}` : ''}\nPlay at blitzsense.com`;
            try {
              await navigator.clipboard.writeText(text);
            } catch {
              const ta = document.createElement('textarea');
              ta.value = text; document.body.appendChild(ta); ta.select();
              document.execCommand('copy'); document.body.removeChild(ta);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-slate-100 transition-all text-sm font-semibold"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Share Result'}
        </button>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {stats.history.some((round) => !round.isCorrect) && (
          <Button onClick={onRetryMistakes} variant="secondary" className="w-full flex justify-center items-center gap-2">
            <Target className="w-5 h-5" /> Retry Mistakes
          </Button>
        )}
        <Button onClick={onPlayAgain} size="lg" className="w-full flex justify-center items-center gap-2">
          <RotateCcw className="w-5 h-5" /> Play Again
        </Button>
        <Button onClick={onHome} variant="secondary" className="w-full">Back to Menu</Button>
      </div>
    </div>
  );
};
