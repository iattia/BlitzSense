/**
 * Unified progress layer — localStorage for guests, Supabase for signed-in users.
 */
import type { Difficulty, SessionRecord } from '../types';
import {
  getHighScore,
  setHighScore,
  getSessionHistory,
  addSessionRecord,
  getSeenGames,
  addSeenGames,
} from '../utils/storage';
import {
  getSessionHistoryDB,
  addSessionRecordDB,
  getSeenGamesDB,
  addSeenGamesDB,
  getHighScoreDB,
} from '../db/sessions';

export interface ProgressContext {
  userId: string | null;
  isGuest: boolean;
}

function shouldUseCloud(ctx: ProgressContext): boolean {
  return !!ctx.userId && !ctx.isGuest;
}

export async function loadSessionHistory(ctx: ProgressContext): Promise<SessionRecord[]> {
  if (shouldUseCloud(ctx)) return getSessionHistoryDB(ctx.userId!);
  return getSessionHistory();
}

export async function saveSession(ctx: ProgressContext, record: SessionRecord): Promise<void> {
  if (shouldUseCloud(ctx)) {
    await addSessionRecordDB(ctx.userId!, record);
  } else {
    addSessionRecord(record);
  }
}

export async function loadSeenGames(ctx: ProgressContext): Promise<Set<string>> {
  if (shouldUseCloud(ctx)) return getSeenGamesDB(ctx.userId!);
  return getSeenGames();
}

export async function markSeenGames(ctx: ProgressContext, gameIds: string[]): Promise<void> {
  if (shouldUseCloud(ctx)) {
    await addSeenGamesDB(ctx.userId!, gameIds);
  } else {
    addSeenGames(gameIds);
  }
}

export async function loadHighScore(
  ctx: ProgressContext,
  difficulty: Difficulty,
  positionCount: number,
): Promise<number> {
  if (shouldUseCloud(ctx)) return getHighScoreDB(ctx.userId!, difficulty, positionCount);
  return getHighScore(difficulty, positionCount);
}

export function updateHighScore(
  difficulty: Difficulty,
  positionCount: number,
  score: number,
): boolean {
  return setHighScore(difficulty, positionCount, score);
}
