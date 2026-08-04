import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { ChessPosition, GameStats, RoundResult, AnalysisMode, BoardTheme, RawPosition, Difficulty, EngineDepth, TimerMode } from '../types';
import { calculateScore, getCentipawnLoss, getMoveShapes, getPromotionMoveSan, isPawnPromotion, type PromotionPiece } from '../utils/chessLogic';
import { useSound, type SoundType } from '../hooks/useSound';
import { useAnimatedScore } from '../hooks/useAnimatedScore';
import { ChessgroundBoard } from './ChessgroundBoard';
import { EvalBar, formatEngineEvaluation } from './ui/EvalBar';
import { MaterialCounter } from './ui/MaterialCounter';
import {
  CheckCircle2, XCircle, Users, Star, ExternalLink,
  ChevronLeft, ChevronRight, BookOpen, Clock,
} from 'lucide-react';
import { Button } from './ui/Button';

interface GameProps {
  rawPositions: RawPosition[];
  analyzedPositions: Map<string, ChessPosition>;
  analysisMode: AnalysisMode;
  boardTheme: BoardTheme;
  soundEnabled: boolean;
  difficulty: Difficulty;
  timerMode: TimerMode;
  onGameEnd: (stats: GameStats) => void;
  onQuit: () => void;
  moveTimeMsOverride?: number; // used by Daily Challenge (10s)
  engineDepth: EngineDepth;
}

type Phase = 'READY' | 'WAITING' | 'COUNTDOWN' | 'ACTIVE' | 'PROMOTION' | 'ANALYSIS';

interface PendingPromotion {
  from: string;
  to: string;
  timeSpent: number;
}

const MOVE_TIME_BY_DIFFICULTY: Record<Difficulty, number> = {
  Easy: 60_000,
  Medium: 30_000,
  Hard: 5_000,
};
const ZEN_TIME_MS = 999_000; // effectively unlimited

const SPEED_BONUS_THRESHOLD_MS = 1500;
const SPEED_BONUS_PTS = 20;

const ENGINE_RANK_LABEL: Record<number, string> = { 1: 'BEST', 2: 'EXCELLENT', 3: 'GREAT', 4: 'GREAT', 5: 'GOOD' };
const ENGINE_RANK_COLOR: Record<number, string> = { 1: 'text-cyan-500', 2: 'text-cyan-400', 3: 'text-purple-400', 4: 'text-purple-400', 5: 'text-slate-400' };

function formatMoveLoss(move: string | null | undefined, turn: 'w' | 'b', engineLines: ChessPosition['engineLines']): string {
  if (!move) return 'No move';
  const loss = getCentipawnLoss(move, turn, engineLines);
  if (loss === undefined) return `Outside engine top ${engineLines.length}`;
  if (loss === 0) return 'Best move';
  return `${(loss / 100).toFixed(2)} pawn loss`;
}

/** Extract castling rights text from a FEN string */
function getCastlingRights(fen: string, turn: 'w' | 'b'): { king: boolean; queen: boolean } {
  const castlePart = fen.split(' ')[2] || '-';
  if (turn === 'w') {
    return { king: castlePart.includes('K'), queen: castlePart.includes('Q') };
  }
  return { king: castlePart.includes('k'), queen: castlePart.includes('q') };
}

const ANALYSIS_WAIT_MS = 45_000;

export const Game: React.FC<GameProps> = ({
  rawPositions,
  analyzedPositions,
  analysisMode,
  boardTheme,
  soundEnabled,
  difficulty,
  timerMode,
  onGameEnd,
  onQuit,
  moveTimeMsOverride,
  engineDepth,
}) => {
  const isZen = timerMode === 'zen';
  const moveTimeMs = moveTimeMsOverride ?? (isZen ? ZEN_TIME_MS : MOVE_TIME_BY_DIFFICULTY[difficulty]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('READY');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(moveTimeMs);
  const [, setLastTickSecond] = useState(-1);

  const [moveStepIndex, setMoveStepIndex] = useState<number>(1);
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    streak: 0,
    correctCount: 0,
    totalPlayed: 0,
    maxInGameStreak: 0,
    history: [],
  });
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const rawPos = rawPositions[currentIdx] ?? null;
  const currentPos: ChessPosition | null = rawPos ? (analyzedPositions.get(rawPos.id) ?? null) : null;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsRef = useRef(stats);
  const currentPosRef = useRef<ChessPosition | null>(currentPos);
  const currentIdxRef = useRef(currentIdx);
  const roundResolvedRef = useRef(false);
  const sessionEndingRef = useRef(false);
  const moveTimeMsRef = useRef(moveTimeMs);
  const onGameEndRef = useRef(onGameEnd);
  const playRef = useRef<(sound: SoundType) => void>(() => {});
  const { play } = useSound(soundEnabled);
  const animatedScore = useAnimatedScore(stats.score);

  statsRef.current = stats;
  currentPosRef.current = currentPos;
  currentIdxRef.current = currentIdx;
  moveTimeMsRef.current = moveTimeMs;
  onGameEndRef.current = onGameEnd;
  playRef.current = play;

  // Wait for analysis of current position before starting
  useEffect(() => {
    if (phase === 'WAITING' && currentPos) {
      setPhase('COUNTDOWN');
    }
  }, [phase, currentPos]);

  // Skip position if analysis takes too long
  useEffect(() => {
    if (phase !== 'WAITING' || currentPos) return;
    const timer = setTimeout(() => {
      const idx = currentIdxRef.current;
      if (idx < rawPositions.length - 1) {
        setCurrentIdx(idx + 1);
        setPhase('WAITING');
        setLastRoundResult(null);
      } else {
        onGameEndRef.current(statsRef.current);
      }
    }, ANALYSIS_WAIT_MS);
    return () => clearTimeout(timer);
  }, [phase, currentPos, currentIdx, rawPositions.length]);

  // Countdown
  useEffect(() => {
    if (phase !== 'COUNTDOWN') return;
    const timers = [3, 2, 1].map((value, index) => window.setTimeout(() => {
      setCountdown(value);
      playRef.current('countdown');
    }, index * 800));
    timers.push(window.setTimeout(() => {
      playRef.current('success');
      setPhase('ACTIVE');
      setTimeLeft(moveTimeMsRef.current);
    }, 2_400));
    return () => timers.forEach(window.clearTimeout);
  }, [currentIdx, phase]);

  // Timer + tick sound in last second
  useEffect(() => {
    if (phase !== 'ACTIVE') return;
    const startTime = Date.now();
    const ms = moveTimeMsRef.current;
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, ms - (Date.now() - startTime));
      setTimeLeft(remaining);

      const secondsLeft = Math.ceil(remaining / 1000);
      setLastTickSecond((prev) => {
        if (secondsLeft <= 3 && secondsLeft !== prev && remaining > 0) {
          playRef.current('tick');
          return secondsLeft;
        }
        return prev;
      });

      if (remaining === 0) handleMoveResult(null, ms);
    }, 50);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // handleMoveResult reads current round state through refs; adding the
  // render-local callback would restart the active timer on every score update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentIdx, moveTimeMs]);

  const handleMoveResult = (moveSan: string | null, timeSpent: number) => {
    // A timer tick and a piece-drop can land in the same render frame. Resolve
    // each position once so a late event cannot award a second result.
    if (roundResolvedRef.current) return;
    roundResolvedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const pos = currentPosRef.current;
    if (!pos) return;

    const currentStats = statsRef.current;
    let points = 0,
      isCorrect = false,
      beatGm = false,
      matchedGm = false,
      engineRank = 0,
      speedBonus = 0;

    if (moveSan) {
      playRef.current('drop');
      const result = calculateScore(moveSan, pos.gmMove, pos.bestMoves, pos.engineLines, pos.turn);
      isCorrect = result.points > 0;
      beatGm = result.beatGm;
      matchedGm = result.matchedGm;
      engineRank = result.engineRank;

      if (isCorrect) {
        const streakBonus = Math.min(currentStats.streak * 10, 50);
        speedBonus = timeSpent < SPEED_BONUS_THRESHOLD_MS ? SPEED_BONUS_PTS : 0;
        points = result.points + streakBonus + speedBonus;
        if (beatGm) {
          playRef.current('beatGm');
        } else if (currentStats.streak >= 4 && (currentStats.streak + 1) % 5 === 0) {
          playRef.current('streak');
        } else if (speedBonus > 0) {
          playRef.current('fast');
        } else {
          playRef.current('success');
        }
      } else {
        playRef.current('miss');
      }
    } else {
      playRef.current('miss');
    }

    const roundResult: RoundResult = {
      positionId: pos.id,
      gameId: pos.id.split('_m')[0],
      userMove: moveSan,
      scoreEarned: points,
      isCorrect,
      beatGm,
      matchedGm,
      engineRank,
      speedBonus,
      timeTaken: timeSpent,
      fen: pos.fen,
      gmMove: pos.gmMove,
      bestMoves: pos.bestMoves,
      engineLines: pos.engineLines,
      centipawnLoss: moveSan ? getCentipawnLoss(moveSan, pos.turn, pos.engineLines) : undefined,
      evaluation: pos.evaluation,
      players: pos.players,
      gmUsername: pos.gmUsername,
      gameUrl: pos.gameUrl,
      openingName: pos.openingName,
      isGm: pos.isGm,
    };

    const newStats: GameStats = {
      score: currentStats.score + points,
      streak: isCorrect ? currentStats.streak + 1 : 0,
      correctCount: currentStats.correctCount + (isCorrect ? 1 : 0),
      totalPlayed: currentStats.totalPlayed + 1,
      maxInGameStreak: isCorrect
        ? Math.max(currentStats.maxInGameStreak, currentStats.streak + 1)
        : currentStats.maxInGameStreak,
      history: [...currentStats.history, roundResult],
    };

    setLastRoundResult(roundResult);
    setStats(newStats);

    if (analysisMode === 'end-only') {
      advanceOrEnd(newStats);
    } else {
      setPhase('ANALYSIS');
    }
  };

  const advanceOrEnd = (finalStats: GameStats) => {
    const idx = currentIdxRef.current;
    if (idx < rawPositions.length - 1) {
      const nextIdx = idx + 1;
      setCurrentIdx(nextIdx);
      roundResolvedRef.current = false;
      const nextRaw = rawPositions[nextIdx];
      const nextAnalyzed = nextRaw ? analyzedPositions.get(nextRaw.id) : null;
      setPhase(nextAnalyzed ? 'COUNTDOWN' : 'WAITING');
      setLastRoundResult(null);
    } else {
      if (sessionEndingRef.current) return;
      sessionEndingRef.current = true;
      onGameEndRef.current(finalStats);
    }
  };

  const handleContinue = () => {
    if (!lastRoundResult) return;
    advanceOrEnd(stats);
  };

  // ── READY: keep the handoff intentional while analysis finishes ──────────
  if (phase === 'READY') {
    const firstPos = rawPositions[0] ? analyzedPositions.get(rawPositions[0].id) : null;
    const analyzedCount = rawPositions.filter((position) => analyzedPositions.has(position.id)).length;

    return (
      <div className="theme-game flex min-h-screen items-center justify-center bg-slate-900 px-4 py-8">
        <section className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-xl sm:p-6">
          <div className="mb-5 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-500">Session ready</p>
            <h1 className="mt-2 text-xl font-bold text-slate-100">Your first position is on deck.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {firstPos ? 'Start when you are ready.' : `Analyzing the opening position (${analyzedCount} of ${rawPositions.length} prepared).`}
            </p>
          </div>

          <div className="relative overflow-hidden rounded-md" style={{ aspectRatio: '1' }}>
            {firstPos ? (
              <div className="pointer-events-none h-full w-full scale-[1.015] blur-[2px] brightness-[0.86]">
                <ChessgroundBoard
                  fen={firstPos.fen}
                  boardOrientation={firstPos.turn === 'w' ? 'white' : 'black'}
                  onPieceDrop={() => false}
                  boardTheme={boardTheme}
                  interactive={false}
                />
              </div>
            ) : (
              <div className="grid h-full w-full grid-cols-8 grid-rows-8 animate-pulse">
                {Array.from({ length: 64 }, (_, index) => (
                  <div key={index} className={(Math.floor(index / 8) + index) % 2 === 0 ? 'bg-slate-700' : 'bg-slate-600'} />
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPhase(firstPos ? 'COUNTDOWN' : 'WAITING')}
            disabled={!firstPos}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-cyan-500 px-4 text-base font-bold text-white shadow-sm transition hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {firstPos ? 'Start session' : 'Analyzing opening position…'}
          </button>
          <button onClick={onQuit} className="mt-4 w-full text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline">
            Cancel session
          </button>
        </section>
      </div>
    );
  }

  const onPieceDrop = (sourceSquare: string, targetSquare: string): boolean => {
    if (phase !== 'ACTIVE' || !currentPos) return false;
    // Check if move is legal
    try {
      if (isPawnPromotion(currentPos.fen, sourceSquare, targetSquare)) {
        if (timerRef.current) clearInterval(timerRef.current);
        setPendingPromotion({ from: sourceSquare, to: targetSquare, timeSpent: moveTimeMs - timeLeft });
        setPhase('PROMOTION');
        return false;
      }

      // Try to find the matching SAN move
      // Try normal moves
      let foundMove = null;
      for (const promo of ['q', 'r', 'b', 'n', undefined] as const) {
        try {
          const testChess = new Chess(currentPos.fen);
          const m = testChess.move({ from: sourceSquare, to: targetSquare, promotion: promo });
          if (m) {
            foundMove = m.san;
            break;
          }
        } catch { /* skip */ }
      }

      if (!foundMove) return false;

      handleMoveResult(foundMove, moveTimeMs - timeLeft);
      return true;
    } catch {
      return false;
    }
  };

  const choosePromotion = (piece: PromotionPiece) => {
    if (!pendingPromotion || !currentPos || phase !== 'PROMOTION') return;
    const moveSan = getPromotionMoveSan(currentPos.fen, pendingPromotion.from, pendingPromotion.to, piece);
    if (!moveSan) return;
    const timeSpent = pendingPromotion.timeSpent;
    setPendingPromotion(null);
    handleMoveResult(moveSan, timeSpent);
  };

  // ── WAITING for analysis — board skeleton ────────────────────────────────
  if (phase === 'WAITING') {
    return (
      <div className="theme-game flex flex-col items-center justify-center min-h-screen bg-slate-900 gap-4">
        {/* Pulsing board skeleton */}
        <div className="animate-pulse" style={{ width: 'min(calc(100vw - 32px), 480px)', aspectRatio: '1' }}>
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden border border-slate-700">
            {Array.from({ length: 64 }, (_, i) => {
              const row = Math.floor(i / 8);
              const col = i % 8;
              const isDark = (row + col) % 2 === 1;
              return (
                <div key={i} className={isDark ? 'bg-slate-700' : 'bg-slate-800'} />
              );
            })}
          </div>
        </div>
        <p className="text-slate-500 text-xs font-mono animate-pulse">Analyzing the first position…</p>
        <button onClick={onQuit} className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline">
          Cancel session
        </button>
      </div>
    );
  }

  // ── SHARED SHELL: COUNTDOWN / ACTIVE / ANALYSIS ───────────────────────────
  // Chess.com never swaps to a different page layout when a puzzle resolves —
  // the board + sidebar stay put and only the prompt/timer slots change content.
  // We do the same here instead of branching into a separate full-page view.
  const isAnalysis = phase === 'ANALYSIS' && !!lastRoundResult;
  const boardFen = isAnalysis ? lastRoundResult!.fen : (currentPos?.fen ?? '');
  const boardTurn: 'w' | 'b' = isAnalysis
    ? (new Chess(lastRoundResult!.fen).turn() as 'w' | 'b')
    : (currentPos?.turn ?? 'w');
  const progressPercent = (timeLeft / moveTimeMs) * 100;

  return (
    <div className="theme-game min-h-screen bg-slate-900 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 items-start justify-center gap-5 px-4 pb-8 pt-5 lg:grid-cols-[minmax(0,760px)_288px] lg:gap-6">

        {/* ── Board column ── */}
        <div className="mx-auto flex w-full flex-col items-center" style={{ maxWidth: 'min(760px, calc(100vh - 150px))' }}>

          {/* Puzzle counter */}
          <div className="w-full flex justify-between items-center mb-3">
            <div className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs font-semibold">
              Puzzle {currentIdx + 1} of {rawPositions.length}
            </div>
            {isAnalysis && (
              <div className="text-slate-500 text-xs font-mono truncate max-w-[55%] text-right">
                {rawPos?.isGm ? 'GM' : 'Player'} · {rawPos?.gmUsername}
              </div>
            )}
          </div>

          {/* Prompt bar (COUNTDOWN/ACTIVE) or result banner (ANALYSIS) — same slot, same shape */}
          <div className="w-full mb-3">
            {isAnalysis ? (
              lastRoundResult!.isCorrect ? (
                <div className={`flex items-center justify-between px-4 py-2 rounded-md border ${lastRoundResult!.beatGm
                  ? 'bg-yellow-400/10 border-yellow-400/40'
                  : 'bg-emerald-500/10 border-emerald-500/40'
                  }`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {lastRoundResult!.beatGm
                      ? <Star className="w-4 h-4 text-yellow-400" />
                      : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    <span className={`font-bold text-sm ${lastRoundResult!.beatGm ? 'text-yellow-400'
                      : 'text-emerald-400'
                      }`}>
                      {lastRoundResult!.beatGm
                        ? 'BETTER THAN THE PLAYED MOVE!'
                        : 'GOOD MOVE'}
                    </span>
                    {lastRoundResult!.engineRank > 0 && (
                      <span className={`text-xs font-bold ${ENGINE_RANK_COLOR[lastRoundResult!.engineRank]}`}>
                        {ENGINE_RANK_LABEL[lastRoundResult!.engineRank]}
                      </span>
                    )}
                    {lastRoundResult!.speedBonus > 0 && (
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />+{lastRoundResult!.speedBonus} FAST!
                      </span>
                    )}
                  </div>
                  <span className="text-slate-100 font-black text-lg">+{lastRoundResult!.scoreEarned}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between px-4 py-2 rounded-md border bg-rose-500/10 border-rose-500/40">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span className="text-rose-400 font-bold text-sm">{lastRoundResult!.userMove ? 'MISSED' : 'TIME UP'}</span>
                  </div>
                  <span className="text-slate-500 font-mono text-sm">+0</span>
                </div>
              )
            ) : (
              <div className={`border rounded-md px-4 py-2 flex items-center gap-2 transition-colors duration-500 ${
                rawPos?.isGm
                  ? 'bg-amber-500/10 border-amber-500/40'
                  : 'bg-slate-800 border-slate-700'
              }`}>
                {rawPos?.isGm ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded inline-block">
                    GM
                  </span>
                ) : (
                  <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                )}
                <span className="text-slate-200 text-sm font-medium">
                  Find the best move for <span className="font-bold text-cyan-400">{currentPos?.turn === 'b' ? 'Black' : 'White'}</span>.
                </span>
              </div>
            )}
          </div>

          {/* Top player's captured material */}
          {!!boardFen && (
            <MaterialCounter
              fen={boardFen}
              orientation={boardTurn === 'w' ? 'white' : 'black'}
              side="top"
              className="mb-1 pl-[31px]"
            />
          )}

          {/* Board + EvalBar container */}
          <div className="relative w-full flex items-stretch gap-2">
            {!!boardFen && (
              <EvalBar
                evalScore={isAnalysis ? formatEngineEvaluation(lastRoundResult?.evaluation) : undefined}
                concealed={!isAnalysis}
                orientation={boardTurn === 'w' ? 'white' : 'black'}
                className="h-auto shrink-0"
              />
            )}

            <div className="relative w-full" style={{ aspectRatio: '1' }}>
              {phase === 'COUNTDOWN' && (
                <div className="absolute inset-0 z-50 flex items-center justify-center rounded-md bg-black/25 backdrop-blur-[2px]" aria-live="polite">
                  <div className="text-9xl font-black leading-none text-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.7)]">{countdown}</div>
                </div>
              )}
              {!!boardFen && (
                <ChessgroundBoard
                  key={rawPos?.id ?? 'board'}
                  fen={boardFen}
                  boardOrientation={boardTurn === 'w' ? 'white' : 'black'}
                  onPieceDrop={onPieceDrop}
                  boardTheme={boardTheme}
                  interactive={phase === 'ACTIVE'}
                  moveShapes={isAnalysis && lastRoundResult && moveStepIndex === 1 ? getMoveShapes(lastRoundResult.fen, {
                    engineMove: lastRoundResult.bestMoves[0],
                    gmMove: lastRoundResult.gmMove,
                    userMove: lastRoundResult.userMove,
                  }) : undefined}
                  highlightMove={isAnalysis && moveStepIndex === 1 ? lastRoundResult!.bestMoves[0] : undefined}
                />
              )}
              {phase === 'PROMOTION' && pendingPromotion && currentPos && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="promotion-title"
                    className="w-full max-w-xs rounded-xl border border-slate-600 bg-slate-800 p-4 shadow-2xl"
                  >
                    <h2 id="promotion-title" className="text-center text-sm font-bold text-slate-100">Choose a promotion</h2>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {([
                        ['q', 'Queen'], ['r', 'Rook'], ['b', 'Bishop'], ['n', 'Knight'],
                      ] as const).map(([piece, label], index) => (
                        <button
                          key={piece}
                          type="button"
                          autoFocus={index === 0}
                          onClick={() => choosePromotion(piece)}
                          className="flex aspect-square items-center justify-center rounded-lg border border-slate-600 bg-slate-900 text-4xl text-slate-100 transition hover:border-cyan-400 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          aria-label={`Promote to ${label}`}
                        >
                          {currentPos.turn === 'w'
                            ? ({ q: '♕', r: '♖', b: '♗', n: '♘' } as const)[piece]
                            : ({ q: '♛', r: '♜', b: '♝', n: '♞' } as const)[piece]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom player's captured material */}
          {!!boardFen && (
            <MaterialCounter
              fen={boardFen}
              orientation={boardTurn === 'w' ? 'white' : 'black'}
              side="bottom"
              className="mt-1 pl-[31px]"
            />
          )}

          {/* Timer (COUNTDOWN/ACTIVE) or move breakdown (ANALYSIS) — same slot below board */}
          {isAnalysis ? (
            <div className="w-full mt-4">
              <div className="bg-slate-800/50 border border-slate-700 rounded-md p-4">
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div>
                    <div className="text-slate-500 text-xs mb-1">Your Move</div>
                    <div className="text-slate-100 font-mono font-bold text-lg">{lastRoundResult!.userMove || '—'}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{formatMoveLoss(lastRoundResult!.userMove, boardTurn, lastRoundResult!.engineLines ?? [])}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs mb-1">Played in game</div>
                    <div className="text-emerald-400 font-mono font-bold text-lg">{lastRoundResult!.gmMove}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{formatMoveLoss(lastRoundResult!.gmMove, boardTurn, lastRoundResult!.engineLines ?? [])}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs mb-1">Engine #1</div>
                    <div className="text-cyan-500 font-mono font-bold text-lg">{lastRoundResult!.bestMoves[0] || '—'}</div>
                    <div className="mt-1 text-[10px] text-cyan-500/70">Best move</div>
                  </div>
                </div>

                {/* Move Stepper Controls */}
                <div className="mt-3 border-t border-slate-700/80 pt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setMoveStepIndex(prev => Math.max(0, prev - 1))}
                    disabled={moveStepIndex === 0}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-700 text-xs font-semibold text-slate-200 transition hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" /> Start Position
                  </button>
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    {moveStepIndex === 0 ? 'Starting Position' : 'Move Arrows Shown'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMoveStepIndex(prev => Math.min(1, prev + 1))}
                    disabled={moveStepIndex === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-700 text-xs font-semibold text-slate-200 transition hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Analysis <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-3 border-t border-slate-700/80 pt-2.5 flex flex-wrap items-center justify-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Engine #1
                  </span>
                  <span className="flex items-center gap-1.5 text-cyan-400 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> Played move
                  </span>
                  {lastRoundResult!.userMove && lastRoundResult!.userMove !== lastRoundResult!.bestMoves[0] && lastRoundResult!.userMove !== lastRoundResult!.gmMove && (
                    <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" /> Your Move
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {!isZen && (
                <div className="w-full mt-4">
                  <div className="h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div className={`h-full transition-all duration-75 ease-linear ${progressPercent < 30 ? 'bg-rose-500' : progressPercent < 60 ? 'bg-amber-400' : 'bg-cyan-500'}`}
                      style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1 font-mono">
                    <div className="flex items-center gap-3">
                      <span>{currentPos?.turn === 'w' ? 'WHITE' : 'BLACK'} TO MOVE</span>
                      {currentPos && (() => {
                        const cr = getCastlingRights(currentPos.fen, currentPos.turn);
                        if (!cr.king && !cr.queen) return null;
                        return (
                          <span className="text-slate-600 text-[10px] flex items-center gap-1">
                            {cr.king && <span className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5">O-O</span>}
                            {cr.queen && <span className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5">O-O-O</span>}
                          </span>
                        );
                      })()}
                    </div>
                    <span>{(timeLeft / 1000).toFixed(1)}s</span>
                  </div>
                </div>
              )}
              {isZen && (
                <div className="w-full mt-4">
                  <div className="flex justify-center text-xs text-slate-600 font-mono">
                    <span>{currentPos?.turn === 'w' ? 'WHITE' : 'BLACK'} TO MOVE &nbsp;·&nbsp; ZEN</span>
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* ── Sidebar column — always present, never swapped out ── */}
        <div className="grid w-full shrink-0 grid-cols-2 gap-3 lg:flex lg:flex-col">
          {isAnalysis && (
            <Button onClick={handleContinue} size="md" className="col-span-2 flex w-full items-center justify-center gap-2">
              {currentIdx < rawPositions.length - 1
                ? <><ChevronRight className="h-4 w-4" /> Continue</>
                : <><BookOpen className="h-4 w-4" /> See results</>}
            </Button>
          )}
          <div className="flex-1 lg:flex-none bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Score</div>
            <div className="text-3xl font-extrabold text-cyan-400 font-mono mt-1">{animatedScore}</div>
            {stats.streak >= 2 && (
              <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold">
                🔥 {stats.streak} streak
              </div>
            )}
          </div>

          <div className="flex-1 lg:flex-none bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1.5">Source game</div>
            <div className="text-slate-300 text-sm truncate">{rawPos?.players}</div>
            {rawPos?.openingName && (
              <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-400">
                <span aria-hidden="true">♟</span><span className="truncate">{rawPos.openingName}</span>
              </div>
            )}
            <div className="text-slate-500 text-xs mt-1">Local Stockfish evaluation</div>
            {isAnalysis && !!lastRoundResult!.gameUrl && (
              <a href={lastRoundResult!.gameUrl} target="_blank" rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1 text-slate-500 hover:text-cyan-400 transition-colors text-xs">
                <ExternalLink className="w-3 h-3" /> {lastRoundResult!.gameUrl.includes('chess.com') ? 'View on Chess.com' : 'View on Lichess'}
              </a>
            )}
          </div>

          <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Session</div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Analysis</dt><dd className="font-mono text-slate-300">Depth {engineDepth}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Pace</dt><dd className="text-slate-300">{isZen ? 'No timer' : `${Math.round(moveTimeMs / 1000)} sec`}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Input</dt><dd className="text-right text-slate-300">Tap or drag</dd></div>
            </dl>
            <p className="mt-3 border-t border-slate-700 pt-3 text-[11px] leading-4 text-slate-500">Tap a piece, then tap its destination. Dragging still works.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
