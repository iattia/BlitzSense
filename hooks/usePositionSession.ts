import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChessPosition, Difficulty, EngineDepth, GameTypeFilter, RawPosition, ColorPref, RatingRange, RoundResult } from '../types';
import { fetchRawPositions, fetchRawPositionsForGM, analyzeRawPosition } from '../services/positions';
import type { ProgressContext } from '../services/progress';
import { loadSeenGames } from '../services/progress';

interface PrefetchedSession {
  requestKey: string;
  rawPositions: RawPosition[];
  analyzedPositions: Map<string, ChessPosition>;
  analyzeQueue: RawPosition[];
}

const ANALYSIS_CONCURRENCY = 1;

export function sessionRequestKey(
  difficulty: Difficulty,
  count: number,
  filter: GameTypeFilter,
  openingFilter: string[],
  colorPref: ColorPref,
  ratingRange: RatingRange,
): string {
  return JSON.stringify({
    difficulty,
    count,
    filter,
    openingFilter: openingFilter.map((opening) => opening.trim().toLowerCase()).sort(),
    colorPref,
    ratingMin: ratingRange.min,
    ratingMax: ratingRange.max,
  });
}

async function analyzeWithRetry(raw: RawPosition, engineDepth: EngineDepth): Promise<ChessPosition> {
  return analyzeRawPosition(raw, engineDepth);
}

interface UsePositionSessionOptions {
  progressCtx: ProgressContext;
  onError: (message: string) => void;
  engineDepth: EngineDepth;
}

export function usePositionSession({ progressCtx, onError, engineDepth }: UsePositionSessionOptions) {
  const [rawPositions, setRawPositions] = useState<RawPosition[]>([]);
  const [analyzedPositions, setAnalyzedPositions] = useState<Map<string, ChessPosition>>(new Map());
  const [isLoadingRaw, setIsLoadingRaw] = useState(false);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [fetchedCount, setFetchedCount] = useState(0);

  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const analyzeQueueRef = useRef<RawPosition[]>([]);
  const isAnalyzingRef = useRef(false);
  const prefetchRef = useRef<PrefetchedSession | null>(null);
  const isPrefetchingRef = useRef(false);
  const prefetchAbortControllerRef = useRef<AbortController | null>(null);
  const prefetchGenerationRef = useRef(0);
  const progressCtxRef = useRef(progressCtx);
  progressCtxRef.current = progressCtx;

  const invalidatePrefetch = useCallback(() => {
    prefetchRef.current = null;
    prefetchAbortControllerRef.current?.abort();
    prefetchAbortControllerRef.current = null;
    prefetchGenerationRef.current += 1;
  }, []);

  useEffect(() => {
    invalidatePrefetch();
  }, [progressCtx, invalidatePrefetch]);

  const runAnalysisQueue = useCallback(async () => {
    if (isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    while (analyzeQueueRef.current.length > 0) {
      const batch = analyzeQueueRef.current.splice(0, ANALYSIS_CONCURRENCY);
      await Promise.all(batch.map(async (raw) => {
        try {
          const result = await analyzeWithRetry(raw, engineDepth);
          setAnalyzedPositions((prev) => new Map(prev).set(raw.id, result));
        } catch (error) {
          console.error('[BlitzSense] Local engine failed:', error);
          onError('Local Stockfish could not analyze a position. The engine restarted; please try again.');
        }
      }));
    }
    isAnalyzingRef.current = false;
  }, [engineDepth, onError]);

  const startAnalysisQueue = useCallback((positions: RawPosition[]) => {
    analyzeQueueRef.current = [...positions];
    isAnalyzingRef.current = false;
    void runAnalysisQueue();
  }, [runAnalysisQueue]);

  const prefetchNextSession = useCallback(async (
    d: Difficulty,
    count: number,
    filter: GameTypeFilter,
    opFilter: string[] = [],
    colorPref: ColorPref = 'random',
    ratingRange: RatingRange = { min: 2000, max: null },
  ) => {
    if (isPrefetchingRef.current) return;
    isPrefetchingRef.current = true;
    prefetchRef.current = null;
    const generation = prefetchGenerationRef.current;
    const requestKey = sessionRequestKey(d, count, filter, opFilter, colorPref, ratingRange);
    const controller = new AbortController();
    prefetchAbortControllerRef.current = controller;

    try {
      await new Promise<void>((resolve) => {
        const poll = () => {
          if (controller.signal.aborted || !isAnalyzingRef.current) { resolve(); return; }
          setTimeout(poll, 500);
        };
        poll();
      });
      if (controller.signal.aborted || generation !== prefetchGenerationRef.current) return;

      const seenGames = await loadSeenGames(progressCtxRef.current);
      const raws = await fetchRawPositions(d, count, filter, seenGames, opFilter, colorPref, ratingRange, controller.signal);
      const analyzed = new Map<string, ChessPosition>();

      for (let i = 0; i < raws.length; i += ANALYSIS_CONCURRENCY) {
        if (controller.signal.aborted) break;
        const batch = raws.slice(i, i + ANALYSIS_CONCURRENCY);
        await Promise.all(batch.map(async (raw) => {
          const result = await analyzeWithRetry(raw, engineDepth);
          analyzed.set(raw.id, result);
        }));
      }

      const remaining = raws.filter(r => !analyzed.has(r.id));
      if (!controller.signal.aborted && generation === prefetchGenerationRef.current) {
        prefetchRef.current = { requestKey, rawPositions: raws, analyzedPositions: analyzed, analyzeQueue: remaining };
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        console.warn('[BlitzSense] Prefetch failed:', error);
      }
    } finally {
      if (prefetchAbortControllerRef.current === controller) prefetchAbortControllerRef.current = null;
      isPrefetchingRef.current = false;
    }
  }, [engineDepth]);

  const loadPositions = useCallback(async (
    d: Difficulty,
    count: number,
    filter: GameTypeFilter,
    opFilter: string[],
    colorPref: ColorPref,
    ratingRange: RatingRange = { min: 2000, max: null },
    options?: { gmUsername?: string; prefetchAfter?: boolean; dailyKey?: string },
  ): Promise<boolean> => {
    const requestKey = sessionRequestKey(d, count, filter, opFilter, colorPref, ratingRange);
    if (prefetchRef.current && !options?.gmUsername && prefetchRef.current.requestKey === requestKey) {
      const pf = prefetchRef.current;
      prefetchRef.current = null;
      analyzeQueueRef.current = pf.analyzeQueue;
      setRawPositions(pf.rawPositions);
      setAnalyzedPositions(pf.analyzedPositions);
      startAnalysisQueue(pf.analyzeQueue);
      if (options?.prefetchAfter !== false) {
        prefetchNextSession(d, count, filter, opFilter, colorPref, ratingRange);
      }
      return true;
    }
    if (prefetchRef.current && prefetchRef.current.requestKey !== requestKey) {
      invalidatePrefetch();
    }

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    setIsLoadingRaw(true);
    setAnalyzedPositions(new Map());
    setPartialWarning(null);
    setFetchedCount(0);
    analyzeQueueRef.current = [];
    isAnalyzingRef.current = false;

    try {
      const seenGames = options?.dailyKey ? new Set<string>() : await loadSeenGames(progressCtxRef.current);
      const raws = options?.gmUsername
        ? await fetchRawPositionsForGM(options.gmUsername, count, seenGames, options.dailyKey)
        : await fetchRawPositions(d, count, filter, seenGames, opFilter, colorPref, ratingRange, controller.signal, (current) => {
            setFetchedCount(current);
          });

      if (controller.signal.aborted) return false;

      if (raws.length === 0) {
        if (opFilter.length > 0) throw new Error('NO_OPENING_MATCHES');
        throw new Error('No positions returned');
      }

      if (raws.length < count) {
        setPartialWarning(
          `Only ${raws.length} of ${count} live position${raws.length === 1 ? '' : 's'} matched these settings. ` +
          `Try a broader opening, game type, or rating range for a full session.`,
        );
      }

      setRawPositions(raws);
      startAnalysisQueue(raws);
      if (options?.prefetchAfter !== false && !options?.gmUsername) {
        prefetchNextSession(d, count, filter, opFilter, colorPref, ratingRange);
      }
      return true;
    } catch (e: any) {
      if (e?.name === 'AbortError' || controller.signal.aborted) {
        console.log('[usePositionSession] Load cancelled.');
        return false;
      }
      console.error('Error loading positions', e);
      onError(e?.message === 'NO_OPENING_MATCHES'
        ? `No rated games matched ${opFilter.join(', ')}. Try a broader opening name or rating range.`
        : 'Could not load positions — check your connection and try again.');
      return false;
    } finally {
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
      }
      setIsLoadingRaw(false);
    }
  }, [invalidatePrefetch, onError, prefetchNextSession, startAnalysisQueue]);

  const cancelLoad = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    invalidatePrefetch();
    setIsLoadingRaw(false);
  }, [invalidatePrefetch]);

  const resetPositions = useCallback(() => {
    setRawPositions([]);
    setAnalyzedPositions(new Map());
    analyzeQueueRef.current = [];
    isAnalyzingRef.current = false;
    invalidatePrefetch();
  }, [invalidatePrefetch]);

  const loadRoundResults = useCallback((rounds: RoundResult[], difficulty: Difficulty) => {
    const raws: RawPosition[] = rounds.map((round) => ({
      id: round.positionId,
      fen: round.fen,
      turn: round.fen.split(' ')[1] === 'b' ? 'b' : 'w',
      gmMove: round.gmMove,
      difficulty,
      players: round.players,
      year: '',
      gmUsername: round.gmUsername,
      opponentUsername: 'Opponent',
      gameUrl: round.gameUrl,
      openingName: round.openingName,
      isGm: round.isGm,
    }));
    const analyzed = new Map<string, ChessPosition>(raws.map((raw, index) => [raw.id, {
      ...raw,
      bestMoves: rounds[index].bestMoves,
      engineLines: rounds[index].engineLines ?? rounds[index].bestMoves.map((move) => ({
        move,
        evaluation: rounds[index].evaluation,
      })),
      evaluation: rounds[index].evaluation,
    }]));
    analyzeQueueRef.current = [];
    isAnalyzingRef.current = false;
    setRawPositions(raws);
    setAnalyzedPositions(analyzed);
    setPartialWarning(null);
  }, []);

  return {
    rawPositions,
    analyzedPositions,
    isLoadingRaw,
    partialWarning,
    fetchedCount,
    loadPositions,
    resetPositions,
    loadRoundResults,
    invalidatePrefetch,
    prefetchNextSession,
    cancelLoad,
    hasPrefetch: () => !!prefetchRef.current,
    isPrefetching: () => isPrefetchingRef.current,
  };
}
