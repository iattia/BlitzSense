/**
 * db/sessions.ts
 * Supabase-backed persistence for sessions and seen FENs.
 * Falls back to localStorage if the user is not authenticated.
 */
import { supabase } from '../lib/supabase';
import type { SessionRecord } from '../types';
import { getHighScore as localGetHighScore } from '../utils/storage';
import type { Difficulty } from '../types';
import type { ProfileState } from '../utils/storage';

// ── Session history ────────────────────────────────────────────────────────────

export async function getSessionHistoryDB(userId: string): Promise<SessionRecord[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(20);

    if (error) {
        console.warn('[DB] getSessionHistory failed', error.message);
        return [];
    }

    return (data ?? []).map((row) => ({
        date: row.date,
        score: row.score,
        correctCount: row.correct_count,
        totalPlayed: row.total_played,
        difficulty: row.difficulty as Difficulty,
        positionCount: row.position_count,
        gmStats: row.gm_stats ?? {},
    }));
}

export async function addSessionRecordDB(
    userId: string,
    record: SessionRecord,
): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('sessions').insert({
        user_id: userId,
        date: record.date,
        score: record.score,
        correct_count: record.correctCount,
        total_played: record.totalPlayed,
        difficulty: record.difficulty,
        position_count: record.positionCount,
        gm_stats: record.gmStats,
    });

    if (error) {
        throw new Error(`Could not save session: ${error.message}`);
    }
}

// ── High score (derived from DB) ──────────────────────────────────────────────

export async function getHighScoreDB(
    userId: string,
    difficulty: Difficulty,
    positionCount: number,
): Promise<number> {
    if (!supabase) return localGetHighScore(difficulty, positionCount);
    const { data, error } = await supabase
        .from('sessions')
        .select('score')
        .eq('user_id', userId)
        .eq('difficulty', difficulty)
        .eq('position_count', positionCount)
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) {
        return localGetHighScore(difficulty, positionCount);
    }
    return data.score;
}

// ── Seen Games ──────────────────────────────────────────────────────────

export async function getSeenGamesDB(userId: string): Promise<Set<string>> {
    if (!supabase) return new Set<string>();
    const { data, error } = await supabase
        .from('seen_games')
        .select('game_ids')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) {
        return new Set<string>();
    }

    const rawGameIds: string[] = data.game_ids ?? [];
    const now = Date.now();
    const COOLDOWN = 3 * 24 * 60 * 60 * 1000;
    const onCooldown = new Set<string>();

    for (const item of rawGameIds) {
        if (item.includes(':')) {
            const [id, tsStr] = item.split(':');
            const ts = parseInt(tsStr, 10);
            if (!isNaN(ts) && (now - ts < COOLDOWN)) {
                onCooldown.add(id);
            }
        }
    }
    return onCooldown;
}

export async function addSeenGamesDB(userId: string, newGameIds: string[]): Promise<void> {
    if (!supabase) return;

    const { data, error: readError } = await supabase
        .from('seen_games')
        .select('game_ids')
        .eq('user_id', userId)
        .maybeSingle();

    if (readError) throw new Error(`Could not load seen games: ${readError.message}`);

    const rawGameIds: string[] = data?.game_ids ?? [];
    const now = Date.now();
    const COOLDOWN = 3 * 24 * 60 * 60 * 1000;
    const map = new Map<string, number>();

    // Parse existing entries that are still on cooldown
    for (const item of rawGameIds) {
        if (item.includes(':')) {
            const [id, tsStr] = item.split(':');
            const ts = parseInt(tsStr, 10);
            if (!isNaN(ts) && (now - ts < COOLDOWN)) {
                map.set(id, ts);
            }
        }
    }

    // Add new ones
    for (const id of newGameIds) {
        map.set(id, now);
    }

    const merged = Array.from(map.entries())
        .map(([id, ts]) => `${id}:${ts}`)
        .slice(-2000);

    const { error } = await supabase.from('seen_games').upsert(
        { user_id: userId, game_ids: merged, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
    );

    if (error) {
        throw new Error(`Could not save seen games: ${error.message}`);
    }
}

export async function getProfileStateDB(userId: string): Promise<ProfileState | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('user_state')
        .select('payload')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw new Error(`Could not load account settings: ${error.message}`);
    return (data?.payload as ProfileState | undefined) ?? null;
}

export async function saveProfileStateDB(userId: string, payload: ProfileState): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('user_state').upsert(
        { user_id: userId, payload, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
    );
    if (error) throw new Error(`Could not save account settings: ${error.message}`);
}

// ── Global leaderboard ────────────────────────────────────────────────────────

export interface LeaderboardEntry {
    username: string;
    avatar_url: string | null;
    best_score: number;
    total_sessions: number;
    avg_accuracy: number;
}

export async function getLeaderboard(
    difficulty: Difficulty = 'Medium',
    positionCount = 10,
    limit = 20,
): Promise<LeaderboardEntry[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('get_leaderboard', {
        requested_difficulty: difficulty,
        requested_position_count: positionCount,
        requested_limit: limit,
    });

    if (error || !data) {
        console.warn('[DB] getLeaderboard failed', error?.message);
        return [];
    }

    return (data as LeaderboardEntry[]).slice(0, limit);
}
