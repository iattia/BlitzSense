import React, { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { Home } from './components/Home';
import { Toast, ToastMessage } from './components/ui/Toast';
import { AppState, GameStats, SessionRecord, ColorPref, RatingRange } from './types';
import {
  computeStreak, recordPlayedToday,
  setDailyCompletion, todayUTC,
  recordLifetimeStats,
  getGuestMode, setGuestMode,
  exportProfileState, importProfileState, mergeProfileState,
} from './utils/storage';
import {
  loadSessionHistory,
  saveSession,
  markSeenGames,
  loadHighScore,
  updateHighScore,
} from './services/progress';
import { currentElo, sessionEloChange } from './utils/eloHistory';
import { useAuth } from './hooks/useAuth';
import { usePreferences } from './hooks/usePreferences';
import { usePositionSession } from './hooks/usePositionSession';
import { Loader2, X } from 'lucide-react';
import { getProfileStateDB, saveProfileStateDB } from './db/sessions';

const Game = lazy(() => import('./components/Game').then((module) => ({ default: module.Game })));
const Results = lazy(() => import('./components/Results').then((module) => ({ default: module.Results })));
const History = lazy(() => import('./components/History').then((module) => ({ default: module.History })));
const Auth = lazy(() => import('./components/Auth').then((module) => ({ default: module.Auth })));

function AppLoading({
  label,
  detail,
  progress,
  action,
  actionLabel = 'Cancel',
}: {
  label: string;
  detail: string;
  progress?: { current: number; target: number };
  action?: () => void;
  actionLabel?: string;
}) {
  const percentage = progress ? Math.min(100, (progress.current / progress.target) * 100) : undefined;

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 dark:bg-[#1b1a18] dark:text-stone-100">
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-lg border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-[#22211f] sm:p-7" aria-live="polite">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-50">
              <Loader2 className="h-5 w-5 animate-spin text-[#53652c]" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-stone-900 dark:text-stone-100">{label}</h1>
              <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{detail}</p>
            </div>
          </div>

          {progress && (
            <div className="mt-7">
              <div className="mb-2 flex items-center justify-between text-xs text-stone-500">
                <span>Positions prepared</span>
                <span className="font-medium tabular-nums text-stone-700">{progress.current} of {progress.target}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-[#53652c] transition-all duration-300 ease-out" style={{ width: `${percentage}%` }} />
              </div>
            </div>
          )}

          {action && (
            <button onClick={action} className="mt-7 inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300 focus:ring-offset-2">
              {actionLabel === 'Cancel' && <X className="h-4 w-4" />}
              {actionLabel}
            </button>
          )}
        </section>
      </main>
    </div>
  );
}

const App: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [isGuest, setIsGuest] = useState(() => getGuestMode());
  const [showAuth, setShowAuth] = useState(false);

  const prefs = usePreferences();
  const {
    difficulty, setDifficulty,
    analysisMode, setAnalysisMode,
    positionCount, setPositionCount,
    boardTheme, setBoardTheme,
    soundEnabled, setSoundEnabled,
    gameTypeFilter, setGameTypeFilter,
    timerMode, setTimerMode,
    openingFilter, setOpeningFilter,
    colorPref, setColorPref,
    ratingRange, setRatingRange,
    appearance, setAppearance,
    engineDepth, setEngineDepth,
    reloadPreferences,
  } = prefs;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', appearance === 'dark');
    document.documentElement.style.colorScheme = appearance;
  }, [appearance]);

  const [appState, setAppState] = useState<AppState>(AppState.HOME);
  const [showHistory, setShowHistory] = useState(false);
  const [highScore, setHighScoreState] = useState(0);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [streak, setStreak] = useState(() => computeStreak());
  const [lastStats, setLastStats] = useState<GameStats | null>(null);
  const [lastEloChange, setLastEloChange] = useState(0);
  const [lastIntuitionElo, setLastIntuitionElo] = useState(1200);
  const [isDailyChallenge, setIsDailyChallenge] = useState(false);
  const [isReviewSession, setIsReviewSession] = useState(false);
  const [dailyMoveTimeMs, setDailyMoveTimeMs] = useState<number | undefined>(undefined);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [profileRevision, setProfileRevision] = useState(0);

  const progressCtx = useMemo(
    () => ({ userId: user?.id ?? null, isGuest }),
    [user?.id, isGuest],
  );

  const showToast = useCallback((text: string, type: ToastMessage['type'] = 'error') => {
    setToast({ id: Date.now(), type, text });
  }, []);

  const positionSession = usePositionSession({
    progressCtx,
    onError: showToast,
    engineDepth,
  });

  const { rawPositions, analyzedPositions, isLoadingRaw, partialWarning, fetchedCount, loadPositions, loadRoundResults, invalidatePrefetch, cancelLoad } = positionSession;

  // Load progress data on mount and when auth/preferences change
  useEffect(() => {
    loadSessionHistory(progressCtx).then(setSessions);
    loadHighScore(progressCtx, difficulty, positionCount).then(setHighScoreState);
  }, [progressCtx, difficulty, positionCount]);

  // Open directly into the training app. Authentication is an optional action
  // from the header rather than a gate in front of the product.
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      setGuestMode(false);
      setIsGuest(false);
      setShowAuth(false);
    } else if (!showAuth) {
      setGuestMode(true);
      setIsGuest(true);
    }
  }, [authLoading, user, showAuth]);

  // Merge guest/device progress into the signed-in account once per login.
  useEffect(() => {
    if (!user || isGuest) return;
    let cancelled = false;
    void (async () => {
      try {
        const local = exportProfileState();
        const remote = await getProfileStateDB(user.id);
        const merged = mergeProfileState(local, remote ?? {});
        importProfileState(merged);
        await saveProfileStateDB(user.id, merged);
        if (!cancelled) {
          reloadPreferences();
          setStreak(computeStreak());
        }
      } catch (error) {
        console.error('[BlitzSense] Account state hydration failed:', error);
        if (!cancelled) showToast('Your account is connected, but some device settings could not be synchronized.', 'info');
      }
    })();
    return () => { cancelled = true; };
  }, [user, isGuest, reloadPreferences, showToast]);

  useEffect(() => {
    const onStateChange = () => setProfileRevision((revision) => revision + 1);
    window.addEventListener('blitzsense:profile-state-change', onStateChange);
    return () => window.removeEventListener('blitzsense:profile-state-change', onStateChange);
  }, []);

  // Debounce preference/bookmark/milestone uploads into one compact JSON record.
  useEffect(() => {
    if (!user || isGuest) return;
    const timer = window.setTimeout(() => {
      saveProfileStateDB(user.id, exportProfileState()).catch((error) => {
        console.error('[BlitzSense] Account state sync failed:', error);
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [user, isGuest, profileRevision, difficulty, analysisMode, positionCount, boardTheme, soundEnabled, gameTypeFilter, timerMode, openingFilter, colorPref, ratingRange, appearance, engineDepth]);

  const handlePlayAsGuest = () => {
    setGuestMode(true);
    setIsGuest(true);
    setShowAuth(false);
  };

  const handleSignIn = () => {
    setGuestMode(false);
    setIsGuest(false);
    setShowAuth(true);
  };

  const startGame = async () => {
    setIsDailyChallenge(false);
    setIsReviewSession(false);
    setDailyMoveTimeMs(undefined);
    const ok = await loadPositions(difficulty, positionCount, gameTypeFilter, openingFilter, colorPref, ratingRange);
    if (ok) {
      setAppState(AppState.PLAYING);
    }
  };

  // The loader updates this asynchronously, so its value is not reliable in
  // startGame immediately after awaiting the request.
  useEffect(() => {
    if (appState === AppState.PLAYING && partialWarning) {
      showToast(partialWarning, 'info');
    }
  }, [appState, partialWarning, showToast]);

  const startDailyChallenge = async (gmUsername: string, challengeDate: string) => {
    setIsDailyChallenge(true);
    setIsReviewSession(false);
    setDailyMoveTimeMs(10_000);
    const ok = await loadPositions(difficulty, 10, gameTypeFilter, openingFilter, 'random', ratingRange, {
      gmUsername,
      dailyKey: challengeDate,
      prefetchAfter: false,
    });
    if (ok) setAppState(AppState.PLAYING);
  };

  const handleGameEnd = async (stats: GameStats) => {
    const finishedDailyChallenge = isDailyChallenge;
    const finishedReviewSession = isReviewSession;
    const eloBefore = currentElo(sessions);
    const isRatedSession = !finishedDailyChallenge && !finishedReviewSession;
    const eloDelta = isRatedSession ? sessionEloChange({
      date: new Date().toISOString(),
      score: stats.score,
      correctCount: stats.correctCount,
      totalPlayed: stats.totalPlayed,
      difficulty,
      positionCount,
      gmStats: {},
    }) : 0;

    // Signed-in users derive their best score from saved sessions. Keep guest
    // scores local instead of changing a shared browser score.
    if (isRatedSession) {
      if (isGuest || !user) updateHighScore(difficulty, positionCount, stats.score);
      setHighScoreState((prev) => Math.max(prev, stats.score));
    }

    const gmStats: Record<string, { correct: number; total: number }> = {};
    for (const r of stats.history) {
      const gm = r.gmUsername;
      if (!gmStats[gm]) gmStats[gm] = { correct: 0, total: 0 };
      gmStats[gm].total++;
      if (r.isCorrect) gmStats[gm].correct++;
    }

    const record: SessionRecord = {
      date: new Date().toISOString(),
      score: stats.score,
      correctCount: stats.correctCount,
      totalPlayed: stats.totalPlayed,
      difficulty,
      positionCount,
      gmStats,
    };

    if (!finishedReviewSession) {
      const gmBeats = stats.history.filter(r => r.beatGm).length;
      recordLifetimeStats({
        gmBeats,
        correct: stats.correctCount,
        total: stats.totalPlayed,
        sessionScore: stats.score,
        inGameStreak: stats.maxInGameStreak,
      });
      setStreak(recordPlayedToday());
    }

    setLastStats(stats);
    setLastEloChange(eloDelta);
    setLastIntuitionElo(eloBefore + eloDelta);
    setAppState(AppState.RESULTS);

    if (finishedDailyChallenge) {
      setDailyCompletion(todayUTC(), {
        score: stats.score,
        correctCount: stats.correctCount,
        totalPlayed: stats.totalPlayed,
        completedAt: new Date().toISOString(),
      });
      setIsDailyChallenge(false);
      setDailyMoveTimeMs(undefined);
    }

    // Daily and review sessions have their own progress semantics and should
    // not affect the configurable-session leaderboard or Elo history.
    if (!isRatedSession) {
      setIsReviewSession(false);
      return;
    }

    // Results are a local UI transition and should never wait for account or
    // history persistence. Save in the background after the screen changes.
    try {
      await saveSession(progressCtx, record);
      const seenGameIds = [...new Set(stats.history.map((r) => r.gameId).filter(Boolean))];
      await markSeenGames(progressCtx, seenGameIds);
      setSessions(await loadSessionHistory(progressCtx));
    } catch (error) {
      console.error('[BlitzSense] Could not persist completed session:', error);
      showToast('Results are shown, but this session could not be saved.', 'info');
    }
  };

  const handleQuitGame = () => {
    positionSession.resetPositions();
    setIsDailyChallenge(false);
    setIsReviewSession(false);
    setDailyMoveTimeMs(undefined);
    setAppState(AppState.HOME);
  };

  const goHome = () => setAppState(AppState.HOME);

  const retryMistakes = () => {
    if (!lastStats) return;
    const mistakes = lastStats.history.filter((round) => !round.isCorrect);
    if (mistakes.length === 0) return;
    setIsDailyChallenge(false);
    setIsReviewSession(true);
    setDailyMoveTimeMs(undefined);
    loadRoundResults(mistakes, difficulty);
    setAppState(AppState.PLAYING);
  };

  const handleSetGameTypeFilter = (v: typeof gameTypeFilter) => {
    setGameTypeFilter(v);
    invalidatePrefetch();
  };

  const handleSetDifficulty = (d: typeof difficulty) => {
    setDifficulty(d);
    invalidatePrefetch();
  };

  const handleSetPositionCount = (n: number) => {
    setPositionCount(n);
    invalidatePrefetch();
  };

  const handleSetOpeningFilter = (v: string[]) => {
    setOpeningFilter(v);
    invalidatePrefetch();
  };

  const handleSetColorPref = (v: ColorPref) => {
    setColorPref(v);
    invalidatePrefetch();
  };

  const handleSetRatingRange = (r: RatingRange) => {
    setRatingRange(r);
    invalidatePrefetch();
  };

  const handleSetEngineDepth = (depth: typeof engineDepth) => {
    setEngineDepth(depth);
    invalidatePrefetch();
  };

  if (authLoading) {
    return <AppLoading label="Opening BlitzSense" detail="Checking your saved session." />;
  }

  if (showAuth && !user) {
    return <Suspense fallback={<AppLoading label="Opening sign in" detail="Loading account options." />}><Auth onPlayAsGuest={handlePlayAsGuest} /></Suspense>;
  }

  if (isLoadingRaw) {
    const hasFilter = openingFilter.length > 0;
    const targetCount = isDailyChallenge ? 10 : positionCount;
    return (
      <AppLoading
        label={hasFilter ? 'Finding matching positions' : 'Preparing your session'}
        detail={hasFilter
          ? `Searching rated games that match: ${openingFilter.join(', ')}.`
          : 'Selecting positions from rated games. Stockfish analysis runs locally.'}
        progress={{ current: fetchedCount, target: targetCount }}
        action={cancelLoad}
      />
    );
  }

  return (
    <div className="min-h-screen text-slate-100 font-sans selection:bg-cyan-500/30">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {appState === AppState.HOME && (
        <Home
          setDifficulty={handleSetDifficulty}
          currentDifficulty={difficulty}
          analysisMode={analysisMode}
          setAnalysisMode={setAnalysisMode}
          positionCount={positionCount}
          setPositionCount={handleSetPositionCount}
          boardTheme={boardTheme}
          setBoardTheme={setBoardTheme}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          gameTypeFilter={gameTypeFilter}
          setGameTypeFilter={handleSetGameTypeFilter}
          highScore={highScore}
          streak={streak}
          onStart={startGame}
          onStartDaily={startDailyChallenge}
          onShowHistory={() => setShowHistory(true)}
          user={user ?? undefined}
          isGuest={isGuest}
          onSignIn={handleSignIn}
          timerMode={timerMode}
          setTimerMode={setTimerMode}
          openingFilter={openingFilter}
          setOpeningFilter={handleSetOpeningFilter}
          colorPref={colorPref}
          setColorPref={handleSetColorPref}
          ratingRange={ratingRange}
          setRatingRange={handleSetRatingRange}
          sessionCount={sessions.length}
          appearance={appearance}
          setAppearance={setAppearance}
          engineDepth={engineDepth}
          setEngineDepth={handleSetEngineDepth}
        />
      )}

      {appState === AppState.PLAYING && (
        <Suspense fallback={<AppLoading label="Opening session" detail="Loading the chessboard." />}><Game
          rawPositions={rawPositions}
          analyzedPositions={analyzedPositions}
          analysisMode={analysisMode}
          boardTheme={boardTheme}
          soundEnabled={soundEnabled}
          difficulty={difficulty}
          timerMode={timerMode}
          onGameEnd={handleGameEnd}
          onQuit={handleQuitGame}
          moveTimeMsOverride={dailyMoveTimeMs}
          engineDepth={engineDepth}
        /></Suspense>
      )}

      {appState === AppState.RESULTS && lastStats && (
        <Suspense fallback={<AppLoading label="Preparing results" detail="Building your session review." />}><Results
          stats={lastStats}
          difficulty={difficulty}
          boardTheme={boardTheme}
          streak={streak}
          intuitionElo={lastIntuitionElo}
          eloChange={lastEloChange}
          onPlayAgain={startGame}
          onRetryMistakes={retryMistakes}
          onHome={goHome}
        /></Suspense>
      )}

      {showHistory && (
        <Suspense fallback={null}><History
          sessions={sessions}
          difficulty={difficulty}
          positionCount={positionCount}
          onClose={() => setShowHistory(false)}
        /></Suspense>
      )}
    </div>
  );
};

export default App;
