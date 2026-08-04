// ── localStorage helpers for BlitzSense ──────────────────────────────────────

import { Difficulty, GameTypeFilter, SessionRecord, BookmarkedPosition, TimerMode, ColorPref, RatingRange, Appearance, EngineDepth } from '../types';

const KEYS = {
    highScore: (d: Difficulty, count: number) => `blitzsense_hs_${d}_${count}`,
    soundEnabled: 'blitzsense_sound',
    boardTheme: 'blitzsense_theme',
    sessionHistory: 'blitzsense_sessions',
    seenGames: 'blitzsense_games',
    gameTypeFilter: 'blitzsense_gametype',
    difficulty: 'blitzsense_difficulty',
    positionCount: 'blitzsense_poscount',
    analysisMode: 'blitzsense_analysis',
    streak: 'blitzsense_streak',
    lastPlayedDate: 'blitzsense_last_played',
    dailyCompletion: (date: string) => `blitzsense_daily_${date}`,
    bookmarks: 'blitzsense_bookmarks',
    timerMode: 'blitzsense_timermode',
    openingFilter: 'blitzsense_openingfilter',
    totalGamesPlayed: 'blitzsense_total_games',
    totalGmBeats: 'blitzsense_total_gmbeats',
    totalCorrect: 'blitzsense_total_correct',
    totalPositionsPlayed: 'blitzsense_total_positions',
    bestStreak: 'blitzsense_best_streak',
    bestSessionScore: 'blitzsense_best_session',
    colorPref: 'blitzsense_colorpref',
    ratingRange: 'blitzsense_ratingrange',
    guestMode: 'blitzsense_guest',
    appearance: 'blitzsense_appearance',
    engineDepth: 'blitzsense_engine_depth',
};

const MAX_LOCAL_SESSIONS = 50;
const MAX_LOCAL_GAMES = 2000;

export type ProfileState = Record<string, string>;

function emitProfileStateChange(): void {
    try { window.dispatchEvent(new Event('blitzsense:profile-state-change')); } catch { /* non-browser */ }
}

/** Export account-scoped local state. Session history and seen games have dedicated tables. */
export function exportProfileState(): ProfileState {
    const state: ProfileState = {};
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith('blitzsense_') || key === KEYS.sessionHistory || key === KEYS.seenGames) continue;
            const value = localStorage.getItem(key);
            if (value !== null) state[key] = value;
        }
    } catch { /* storage unavailable */ }
    return state;
}

/** Merge remote and current-device state without discarding guest achievements. */
export function mergeProfileState(local: ProfileState, remote: ProfileState): ProfileState {
    const merged = { ...local, ...remote };
    const numericPrefixes = ['blitzsense_hs_', 'blitzsense_total_', 'blitzsense_best_', 'blitzsense_streak'];
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
        if (numericPrefixes.some((prefix) => key.startsWith(prefix))) {
            merged[key] = String(Math.max(Number(local[key] ?? 0), Number(remote[key] ?? 0)));
        }
    }
    try {
        const localBookmarks = JSON.parse(local[KEYS.bookmarks] ?? '[]') as BookmarkedPosition[];
        const remoteBookmarks = JSON.parse(remote[KEYS.bookmarks] ?? '[]') as BookmarkedPosition[];
        const byFen = new Map([...remoteBookmarks, ...localBookmarks].map((bookmark) => [bookmark.fen, bookmark]));
        merged[KEYS.bookmarks] = JSON.stringify([...byFen.values()].slice(0, MAX_BOOKMARKS));
    } catch { /* keep the remote-preferred raw value */ }
    return merged;
}

export function importProfileState(state: ProfileState): void {
    try {
        for (const [key, value] of Object.entries(state)) {
            if (key.startsWith('blitzsense_') && key !== KEYS.sessionHistory && key !== KEYS.seenGames) {
                localStorage.setItem(key, value);
            }
        }
        emitProfileStateChange();
    } catch { /* storage unavailable */ }
}

// ── High scores ───────────────────────────────────────────────────────────────

export function getHighScore(difficulty: Difficulty, count: number): number {
    try {
        return parseInt(localStorage.getItem(KEYS.highScore(difficulty, count)) ?? '0', 10) || 0;
    } catch { return 0; }
}

export function setHighScore(difficulty: Difficulty, count: number, score: number): boolean {
    try {
        const current = getHighScore(difficulty, count);
        if (score > current) {
            localStorage.setItem(KEYS.highScore(difficulty, count), String(score));
            return true;
        }
        return false;
    } catch { return false; }
}


// ── Game type filter ──────────────────────────────────────────────────────────

export function getGameTypeFilter(): GameTypeFilter {
    try {
        const value = localStorage.getItem(KEYS.gameTypeFilter);
        return value === 'blitz' || value === 'rapid' || value === 'classical' || value === 'all' ? value : 'all';
    } catch { return 'all'; }
}

export function setGameTypeFilter(v: GameTypeFilter): void {
    try { localStorage.setItem(KEYS.gameTypeFilter, v); } catch { /* ignore */ }
}

// ── Preferences ───────────────────────────────────────────────────────────────

export function getSoundEnabled(): boolean {
    try {
        const v = localStorage.getItem(KEYS.soundEnabled);
        return v === null ? true : v === 'true';
    } catch { return true; }
}

export function setSoundEnabled(v: boolean): void {
    try { localStorage.setItem(KEYS.soundEnabled, String(v)); } catch { /* ignore */ }
}

export function getBoardTheme(): 'slate' | 'wood' | 'green' {
    try {
        const value = localStorage.getItem(KEYS.boardTheme);
        return value === 'slate' || value === 'wood' || value === 'green' ? value : 'green';
    }
    catch { return 'green'; }
}

export function setBoardTheme(theme: string): void {
    try { localStorage.setItem(KEYS.boardTheme, theme); } catch { /* ignore */ }
}

export function getAppearance(): Appearance {
    try {
        const value = localStorage.getItem(KEYS.appearance);
        if (value === 'light' || value === 'dark') return value;
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { return 'light'; }
}

export function saveAppearance(appearance: Appearance): void {
    try { localStorage.setItem(KEYS.appearance, appearance); } catch { /* ignore */ }
}

export function getEngineDepth(): EngineDepth {
    try {
        const value = Number(localStorage.getItem(KEYS.engineDepth));
        return value === 10 || value === 14 || value === 18 ? value : 14;
    } catch { return 14; }
}

export function saveEngineDepth(depth: EngineDepth): void {
    try { localStorage.setItem(KEYS.engineDepth, String(depth)); } catch { /* ignore */ }
}

// ── Difficulty ────────────────────────────────────────────────────────────────

export function getDifficulty(): Difficulty {
    try {
        const value = localStorage.getItem(KEYS.difficulty);
        return value === 'Easy' || value === 'Medium' || value === 'Hard' ? value : 'Medium';
    }
    catch { return 'Medium'; }
}

export function saveDifficulty(d: Difficulty): void {
    try { localStorage.setItem(KEYS.difficulty, d); } catch { /* ignore */ }
}

// ── Position count ────────────────────────────────────────────────────────────

export function getPositionCount(): number {
    try {
        const value = parseInt(localStorage.getItem(KEYS.positionCount) ?? '10', 10);
        return value === 5 || value === 10 || value === 20 ? value : 10;
    }
    catch { return 10; }
}

export function savePositionCount(n: number): void {
    try { localStorage.setItem(KEYS.positionCount, String(n)); } catch { /* ignore */ }
}

// ── Analysis mode ─────────────────────────────────────────────────────────────

export function getAnalysisMode(): import('../types').AnalysisMode {
    try {
        const value = localStorage.getItem(KEYS.analysisMode);
        return value === 'between' || value === 'end-only' ? value : 'between';
    }
    catch { return 'between'; }
}

export function saveAnalysisMode(m: import('../types').AnalysisMode): void {
    try { localStorage.setItem(KEYS.analysisMode, m); } catch { /* ignore */ }
}

// ── Streaks ───────────────────────────────────────────────────────────────────

/** Returns today's date string in YYYY-MM-DD (Eastern Time, America/New_York) */
export function todayUTC(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function getStreak(): number {
    try { return parseInt(localStorage.getItem(KEYS.streak) ?? '0', 10) || 0; }
    catch { return 0; }
}

export function getLastPlayedDate(): string | null {
    try { return localStorage.getItem(KEYS.lastPlayedDate); }
    catch { return null; }
}

/**
 * Call once on app mount.
 * - If last played was yesterday → streak is intact, return current value.
 * - If last played was today → already counted, return current value.
 * - If last played was >1 day ago (or never) → reset streak to 0.
 */
export function computeStreak(): number {
    try {
        const last = getLastPlayedDate();
        if (!last) return 0;
        const today = todayUTC();
        const yesterdayDate = new Date(Date.now() - 86_400_000);
        const yesterday = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        if (last === today || last === yesterday) return getStreak();
        // Streak broken — reset
        localStorage.setItem(KEYS.streak, '0');
        return 0;
    } catch { return 0; }
}

/**
 * Call at the end of each game session to increment (or start) the streak.
 */
export function recordPlayedToday(): number {
    try {
        const today = todayUTC();
        const last = getLastPlayedDate();
        if (last === today) return getStreak(); // already played today, don't double-count
        const yesterdayDate = new Date(Date.now() - 86_400_000);
        const yesterday = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const currentStreak = (last === yesterday) ? getStreak() : 0;
        const newStreak = currentStreak + 1;
        localStorage.setItem(KEYS.streak, String(newStreak));
        localStorage.setItem(KEYS.lastPlayedDate, today);
        return newStreak;
    } catch { return getStreak(); }
}

// ── Daily Challenge ───────────────────────────────────────────────────────────

export interface DailyCompletion {
    score: number;
    correctCount: number;
    totalPlayed: number;
    completedAt: string;
}

export function getDailyCompletion(dateStr: string): DailyCompletion | null {
    try {
        const raw = localStorage.getItem(KEYS.dailyCompletion(dateStr));
        return raw ? JSON.parse(raw) as DailyCompletion : null;
    } catch { return null; }
}

export function setDailyCompletion(dateStr: string, data: DailyCompletion): void {
    try { localStorage.setItem(KEYS.dailyCompletion(dateStr), JSON.stringify(data)); emitProfileStateChange(); }
    catch { /* ignore */ }
}

// ── Timer mode ────────────────────────────────────────────────────────────────

export function getTimerMode(): TimerMode {
    try {
        const value = localStorage.getItem(KEYS.timerMode);
        return value === 'timed' || value === 'zen' ? value : 'timed';
    }
    catch { return 'timed'; }
}

export function saveTimerMode(m: TimerMode): void {
    try { localStorage.setItem(KEYS.timerMode, m); } catch { /* ignore */ }
}

// ── Opening filter ────────────────────────────────────────────────────────────

export function getOpeningFilter(): string[] {
    try {
        const raw = localStorage.getItem(KEYS.openingFilter);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}

export function saveOpeningFilter(openings: string[]): void {
    try { localStorage.setItem(KEYS.openingFilter, JSON.stringify(openings)); } catch { /* ignore */ }
}

// ── Color / Side Preference ───────────────────────────────────────────────────

export function getColorPref(): ColorPref {
    try {
        const value = localStorage.getItem(KEYS.colorPref);
        return value === 'white' || value === 'black' || value === 'random' ? value : 'random';
    }
    catch { return 'random'; }
}

export function saveColorPref(v: ColorPref): void {
    try { localStorage.setItem(KEYS.colorPref, v); } catch { /* ignore */ }
}

// ── Rating Range ──────────────────────────────────────────────────────────────

export function getRatingRange(): RatingRange {
    try {
        const raw = localStorage.getItem(KEYS.ratingRange);
        if (!raw) return { min: 2000, max: null };
        const parsed = JSON.parse(raw) as RatingRange;
        const min = typeof parsed.min === 'number' && Number.isFinite(parsed.min) ? parsed.min : null;
        const max = typeof parsed.max === 'number' && Number.isFinite(parsed.max) ? parsed.max : null;
        return max !== null && min !== null && max < min ? { min, max: null } : { min, max };
    } catch { return { min: 2000, max: null }; }
}

export function saveRatingRange(r: RatingRange): void {
    try { localStorage.setItem(KEYS.ratingRange, JSON.stringify(r)); } catch { /* ignore */ }
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

const MAX_BOOKMARKS = 100;

export function getBookmarks(): BookmarkedPosition[] {
    try { return JSON.parse(localStorage.getItem(KEYS.bookmarks) ?? '[]') as BookmarkedPosition[]; }
    catch { return []; }
}

export function addBookmark(pos: BookmarkedPosition): void {
    try {
        const existing = getBookmarks();
        if (existing.some(b => b.fen === pos.fen)) return; // skip duplicate
        existing.unshift(pos);
        localStorage.setItem(KEYS.bookmarks, JSON.stringify(existing.slice(0, MAX_BOOKMARKS)));
        emitProfileStateChange();
    } catch { /* ignore */ }
}

export function removeBookmark(fen: string): void {
    try {
        const existing = getBookmarks().filter(b => b.fen !== fen);
        localStorage.setItem(KEYS.bookmarks, JSON.stringify(existing));
        emitProfileStateChange();
    } catch { /* ignore */ }
}

export function isBookmarked(fen: string): boolean {
    return getBookmarks().some(b => b.fen === fen);
}

// ── Lifetime stats (for milestones) ───────────────────────────────────────────

function getCounter(key: string): number {
    try { return parseInt(localStorage.getItem(key) ?? '0', 10) || 0; } catch { return 0; }
}

function incrCounter(key: string, amount: number): number {
    const val = getCounter(key) + amount;
    try { localStorage.setItem(key, String(val)); } catch { /* */ }
    return val;
}

function setMaxCounter(key: string, value: number): number {
    const current = getCounter(key);
    if (value > current) {
        try { localStorage.setItem(key, String(value)); } catch { /* */ }
        return value;
    }
    return current;
}

export function getLifetimeStats() {
    return {
        totalGames: getCounter(KEYS.totalGamesPlayed),
        totalGmBeats: getCounter(KEYS.totalGmBeats),
        totalCorrect: getCounter(KEYS.totalCorrect),
        totalPositions: getCounter(KEYS.totalPositionsPlayed),
        bestStreak: getCounter(KEYS.bestStreak),
        bestSessionScore: getCounter(KEYS.bestSessionScore),
    };
}

export function recordLifetimeStats(stats: {
    gmBeats: number;
    correct: number;
    total: number;
    sessionScore: number;
    inGameStreak: number;
}) {
    incrCounter(KEYS.totalGamesPlayed, 1);
    incrCounter(KEYS.totalGmBeats, stats.gmBeats);
    incrCounter(KEYS.totalCorrect, stats.correct);
    incrCounter(KEYS.totalPositionsPlayed, stats.total);
    setMaxCounter(KEYS.bestStreak, stats.inGameStreak);
    setMaxCounter(KEYS.bestSessionScore, stats.sessionScore);
    emitProfileStateChange();
}

// ── Session history (local) ───────────────────────────────────────────────────

export function getSessionHistory(): SessionRecord[] {
    try {
        const raw = localStorage.getItem(KEYS.sessionHistory);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed as SessionRecord[] : [];
    } catch { return []; }
}

export function addSessionRecord(record: SessionRecord): void {
    try {
        const existing = getSessionHistory();
        existing.unshift(record);
        localStorage.setItem(KEYS.sessionHistory, JSON.stringify(existing.slice(0, MAX_LOCAL_SESSIONS)));
    } catch { /* ignore */ }
}

// ── Seen Games (local, with 3-day cooldown) ───────────────────────────────────
// Each entry records when a game was last played. A game is "on cooldown" for
// 3 days after it was seen, then it becomes available again automatically.

const GAME_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

interface SeenGameEntry { id: string; ts: number; }

/** Returns the set of game IDs that are currently on cooldown (seen within the last 3 days). */
export function getSeenGames(): Set<string> {
    try {
        const raw = localStorage.getItem(KEYS.seenGames);
        if (!raw) return new Set();
        const parsed: unknown[] = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set();

        const now = Date.now();
        const onCooldown = new Set<string>();
        for (const entry of parsed) {
            if (typeof entry === 'string') {
                // Old format (flat string[]) — treat ts=0 → expired → skip
                continue;
            }
            if (entry && typeof entry === 'object' && 'id' in entry && 'ts' in entry) {
                const e = entry as SeenGameEntry;
                if (now - e.ts < GAME_COOLDOWN_MS) onCooldown.add(e.id);
            }
        }
        return onCooldown;
    } catch { return new Set(); }
}

/** Marks the given game IDs as seen right now, starting their 3-day cooldown. */
export function addSeenGames(newGameIds: string[]): void {
    try {
        const now = Date.now();
        const raw = localStorage.getItem(KEYS.seenGames);
        const map = new Map<string, number>();

        if (raw) {
            const parsed: unknown[] = JSON.parse(raw);
            for (const entry of parsed) {
                if (entry && typeof entry === 'object' && 'id' in entry && 'ts' in entry) {
                    const e = entry as SeenGameEntry;
                    // Only keep entries still on cooldown — expired ones drop out naturally
                    if (now - e.ts < GAME_COOLDOWN_MS) map.set(e.id, e.ts);
                }
            }
        }

        // Stamp new entries with now
        for (const id of newGameIds) map.set(id, now);

        const entries: SeenGameEntry[] = [...map.entries()].map(([id, ts]) => ({ id, ts }));
        localStorage.setItem(KEYS.seenGames, JSON.stringify(entries.slice(-MAX_LOCAL_GAMES)));
    } catch { /* ignore */ }
}


// ── Guest mode (session-scoped) ───────────────────────────────────────────────

export function getGuestMode(): boolean {
    try { return sessionStorage.getItem(KEYS.guestMode) === 'true'; }
    catch { return false; }
}

export function setGuestMode(v: boolean): void {
    try {
        if (v) sessionStorage.setItem(KEYS.guestMode, 'true');
        else sessionStorage.removeItem(KEYS.guestMode);
    } catch { /* ignore */ }
}
