import { useState, useCallback } from 'react';
import type {
  AnalysisMode, Appearance, BoardTheme, Difficulty, EngineDepth, GameTypeFilter, TimerMode, ColorPref, RatingRange,
} from '../types';
import {
  getSoundEnabled, setSoundEnabled as saveSoundEnabled,
  getBoardTheme, setBoardTheme as saveBoardTheme,
  getGameTypeFilter, setGameTypeFilter as saveGameTypeFilter,
  getDifficulty, saveDifficulty,
  getPositionCount, savePositionCount,
  getAnalysisMode, saveAnalysisMode,
  getTimerMode, saveTimerMode,
  getOpeningFilter, saveOpeningFilter,
  getColorPref, saveColorPref,
  getRatingRange, saveRatingRange,
  getAppearance, saveAppearance,
  getEngineDepth, saveEngineDepth,
} from '../utils/storage';

export function usePreferences() {
  const [difficulty, setDifficultyState] = useState<Difficulty>(() => getDifficulty());
  const [analysisMode, setAnalysisModeState] = useState<AnalysisMode>(() => getAnalysisMode());
  const [positionCount, setPositionCountState] = useState<number>(() => getPositionCount());
  const [boardTheme, setBoardThemeState] = useState<BoardTheme>(getBoardTheme);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(getSoundEnabled);
  const [gameTypeFilter, setGameTypeFilterState] = useState<GameTypeFilter>(() => getGameTypeFilter());
  const [timerMode, setTimerModeState] = useState<TimerMode>(() => getTimerMode());
  const [openingFilter, setOpeningFilterState] = useState<string[]>(() => getOpeningFilter());
  const [colorPref, setColorPrefState] = useState<ColorPref>(() => getColorPref());
  const [ratingRange, setRatingRangeState] = useState<RatingRange>(() => getRatingRange());
  const [appearance, setAppearanceState] = useState<Appearance>(() => getAppearance());
  const [engineDepth, setEngineDepthState] = useState<EngineDepth>(() => getEngineDepth());

  const setDifficulty = useCallback((d: Difficulty) => {
    saveDifficulty(d);
    setDifficultyState(d);
  }, []);

  const setAnalysisMode = useCallback((m: AnalysisMode) => {
    saveAnalysisMode(m);
    setAnalysisModeState(m);
  }, []);

  const setPositionCount = useCallback((n: number) => {
    savePositionCount(n);
    setPositionCountState(n);
  }, []);

  const setBoardTheme = useCallback((t: BoardTheme) => {
    saveBoardTheme(t);
    setBoardThemeState(t);
  }, []);

  const setSoundEnabled = useCallback((v: boolean) => {
    saveSoundEnabled(v);
    setSoundEnabledState(v);
  }, []);

  const setGameTypeFilter = useCallback((v: GameTypeFilter) => {
    saveGameTypeFilter(v);
    setGameTypeFilterState(v);
  }, []);

  const setTimerMode = useCallback((m: TimerMode) => {
    saveTimerMode(m);
    setTimerModeState(m);
  }, []);

  const setOpeningFilter = useCallback((v: string[]) => {
    saveOpeningFilter(v);
    setOpeningFilterState(v);
  }, []);

  const setColorPref = useCallback((v: ColorPref) => {
    saveColorPref(v);
    setColorPrefState(v);
  }, []);

  const setRatingRange = useCallback((r: RatingRange) => {
    saveRatingRange(r);
    setRatingRangeState(r);
  }, []);

  const setAppearance = useCallback((value: Appearance) => {
    saveAppearance(value);
    setAppearanceState(value);
  }, []);

  const setEngineDepth = useCallback((value: EngineDepth) => {
    saveEngineDepth(value);
    setEngineDepthState(value);
  }, []);

  const reloadPreferences = useCallback(() => {
    setDifficultyState(getDifficulty());
    setAnalysisModeState(getAnalysisMode());
    setPositionCountState(getPositionCount());
    setBoardThemeState(getBoardTheme());
    setSoundEnabledState(getSoundEnabled());
    setGameTypeFilterState(getGameTypeFilter());
    setTimerModeState(getTimerMode());
    setOpeningFilterState(getOpeningFilter());
    setColorPrefState(getColorPref());
    setRatingRangeState(getRatingRange());
    setAppearanceState(getAppearance());
    setEngineDepthState(getEngineDepth());
  }, []);

  return {
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
  };
}
