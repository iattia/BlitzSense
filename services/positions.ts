import { ChessPosition, Difficulty, EngineDepth, GameTypeFilter, RawPosition, ColorPref, RatingRange } from '../types';
import { Chess } from 'chess.js';
import { analyzeLocally, type LocalAnalysisResult } from './localEngine';
import { seededShuffle, seedFromString } from '../utils/random';
import { getPersistentCache, setPersistentCache } from '../utils/persistentCache';

// ── Cache for player lists and games ─────────────────────────────────────────────
const PLAYER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const GAME_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const BROADCAST_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const ANALYSIS_CACHE_TTL = 24 * 60 * 60 * 1000; // engine lines are stable for a position
const LIVE_SESSION_BUDGET_MS = 8_000;
const MAX_POSITIONS_PER_GAME = 2;
const providerWarnings = new Set<string>();

function warnProviderOnce(key: string, message: string): void {
  if (providerWarnings.has(key)) return;
  providerWarnings.add(key);
  console.warn(message);
}

interface CachedPlayers {
  data: { username: string; name: string; title?: string }[];
  timestamp: number;
}

interface CachedGames {
  data: LichessGame[] | ChessComGame[];
  timestamp: number;
}

interface CachedBroadcasts {
  data: RawPosition[];
  timestamp: number;
}

const playerCache = new Map<string, CachedPlayers>();
const gameCache = new Map<string, CachedGames>();
const broadcastCache = new Map<string, CachedBroadcasts>();
const analysisCache = new Map<string, { data: LocalAnalysisResult; timestamp: number }>();

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(abort, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}

function getCachedPlayers(key: string): { username: string; name: string; title?: string }[] | null {
  const cached = playerCache.get(key);
  if (cached && Date.now() - cached.timestamp < PLAYER_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedPlayers(key: string, data: { username: string; name: string; title?: string }[]): void {
  playerCache.set(key, { data, timestamp: Date.now() });
}

function getCachedGames(key: string): LichessGame[] | ChessComGame[] | null {
  const cached = gameCache.get(key);
  if (cached && Date.now() - cached.timestamp < GAME_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedGames(key: string, data: LichessGame[] | ChessComGame[]): void {
  gameCache.set(key, { data, timestamp: Date.now() });
}

// ── Opening name normalisation ───────────────────────────────────────────────
// Strips apostrophes, colons, hyphens, extra whitespace and lowercases so that
// "Queen's Gambit Declined" and "Queens-Gambit-Declined" both normalise to
// "queens gambit declined" and can be matched with simple substring search.
export function normalizeOpening(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, '')   // remove apostrophes
    .replace(/:/g, '')        // remove colons
    .replace(/-/g, ' ')       // hyphens → spaces
    .replace(/\s+/g, ' ')     // collapse whitespace
    .trim();
}

// ── Lichess live leaderboard API ────────────────────────────────────────────
// Fetches the top-N players for a given perf type from Lichess.
// Falls back to LICHESS_FALLBACK if the API is unavailable.

const LICHESS_FALLBACK: { username: string; name: string }[] = [
  { username: 'DrNykterstein', name: 'Magnus Carlsen' },
  { username: 'nihalsarin2004', name: 'Nihal Sarin' },
  { username: 'alireza2003', name: 'Alireza Firouzja' },
  { username: 'penguingm1', name: 'Andrew Tang' },
  { username: 'Hikaru', name: 'Hikaru Nakamura' },
  { username: 'RebeccaHarris', name: 'Daniel Naroditsky' },
  { username: 'AnishGiri', name: 'Anish Giri' },
  { username: 'MVL', name: 'Maxime Vachier-Lagrave' },
  { username: 'Grischuk', name: 'Alexander Grischuk' },
  { username: 'Nepomniachtchi', name: 'Ian Nepomniachtchi' },
  { username: 'DingLiren', name: 'Ding Liren' },
  { username: 'GukeshD', name: 'Gukesh D' },
  { username: 'Praggnanandhaa', name: 'Praggnanandhaa R' },
  { username: 'ArjunErigaisi', name: 'Arjun Erigaisi' },
  { username: 'LevonAronian', name: 'Levon Aronian' },
  { username: 'KramnikVladimir', name: 'Vladimir Kramnik' },
  { username: 'Jobava', name: 'Baadur Jobava' },
  { username: 'ShirovAlex', name: 'Alexei Shirov' },
  { username: 'chessbrahs', name: 'Eric Hansen' },
  { username: 'muisback', name: 'Jorden van Foreest' },
];

interface LichessTopPlayer {
  id: string;
  username: string;
  title?: string;
  perfs: Record<string, { rating: number }>;
}

function isGmUser(username: string, title?: string): boolean {
  if (title?.toUpperCase() === 'GM') return true;
  const normalizedUser = username.toLowerCase();
  const knownGms = [
    'drnykterstein', 'nihalsarin2004', 'alireza2003', 'penguingm1', 'hikaru',
    'rebeccaharris', 'anishgiri', 'mvl', 'grischuk', 'nepomniachtchi',
    'dingliren', 'gukeshd', 'praggnanandhaa', 'arjunerigaisi', 'levonaronian',
    'kramnikvladimir', 'jobava', 'shirovalex', 'chessbrahs', 'muisback',
    'magnuscarlsen', 'fabianocaruana', 'danielnaroditsky', 'nihalsarin', 'firouzja2003',
    'lachesisq', 'vachier-lagrave', 'gmwso', 'rpragchess', 'oleksandr_bortnyk',
    'polish_fighter3000', 'duhless', 'msb2'
  ];
  return knownGms.includes(normalizedUser);
}

async function fetchLichessTopPlayers(
  perfType: string,
  count: number = 100,
  signal?: AbortSignal,
): Promise<{ username: string; name: string; title?: string }[]> {
  const cacheKey = `lichess_top_${perfType}_${count}`;
  const cached = getCachedPlayers(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetchWithTimeout(
      `https://lichess.org/api/player/top/${count}/${perfType}`,
      { headers: { Accept: 'application/json' }, signal },
    );

    if (!response.ok) {
      warnProviderOnce('lichess-leaderboard', `[Lichess] Leaderboard unavailable (${response.status}); using reserve players.`);
      return LICHESS_FALLBACK;
    }

    const data = await response.json();
    const users: LichessTopPlayer[] = data.users ?? [];

    const players = users.map((u) => ({
      username: u.username,
      // Use the username as the display name — we don't have full names from this endpoint.
      // The game fetch will fill in opponent names from game data.
      name: u.username,
      title: u.title,
    }));

    if (players.length === 0) return LICHESS_FALLBACK;

    setCachedPlayers(cacheKey, players);
    return players;
  } catch {
    if (!signal?.aborted) warnProviderOnce('lichess-leaderboard', '[Lichess] Leaderboard unavailable; using reserve players.');
    return LICHESS_FALLBACK;
  }
}

// ── Map Lichess perf type to our filter ──────────────────────────────────────
// ── Chess.com fallback players (used if API fails) ─────────────────────────────
const CHESSCOM_FALLBACK: { username: string; name: string }[] = [
  { username: 'MagnusCarlsen', name: 'Magnus Carlsen' },
  { username: 'Hikaru', name: 'Hikaru Nakamura' },
  { username: 'FabianoCaruana', name: 'Fabiano Caruana' },
  { username: 'DanielNaroditsky', name: 'Daniel Naroditsky' },
  { username: 'nihalsarin', name: 'Nihal Sarin' },
  { username: 'Firouzja2003', name: 'Alireza Firouzja' },
  { username: 'Anishgiri', name: 'Anish Giri' },
  { username: 'LevonAronian', name: 'Levon Aronian' },
  { username: 'lachesisQ', name: 'Ian Nepomniachtchi' },
  { username: 'Vachier-Lagrave', name: 'Maxime Vachier-Lagrave' },
  { username: 'gmwso', name: 'Wesley So' },
  { username: 'rpragchess', name: 'Praggnanandhaa R' },
  { username: 'oleksandr_bortnyk', name: 'Oleksandr Bortnyk' },
  { username: 'Polish_fighter3000', name: 'Jan-Krzysztof Duda' },
  { username: 'Duhless', name: 'Daniil Dubov' },
  { username: 'Msb2', name: 'Matthias Blübaum' },
];

// ── Fetch top players from Chess.com leaderboard API ───────────────────────────
async function fetchChessComTopPlayers(
  count: number = 20,
  signal?: AbortSignal,
): Promise<{ username: string; name: string; title?: string }[]> {
  const cacheKey = 'chesscom_top_players';
  const cached = getCachedPlayers(cacheKey);
  if (cached) return cached.slice(0, count);

  try {
    const response = await fetchWithTimeout('https://api.chess.com/pub/leaderboards', { signal });
    if (!response.ok) {
      warnProviderOnce('chesscom-leaderboard', `[Chess.com] Leaderboard unavailable (${response.status}); using reserve players.`);
      return CHESSCOM_FALLBACK.slice(0, count);
    }

    const data = await response.json();
    const liveBlitz = data.live_blitz || [];
    const liveRapid = data.live_rapid || [];

    // Combine and deduplicate players from both lists
    const playerMap = new Map<string, { username: string; name: string; title?: string }>();

    for (const entry of [...liveBlitz, ...liveRapid]) {
      if (entry.username && (entry.title === 'GM' || entry.title === 'IM' || entry.score > 2500)) {
        const name = entry.name || entry.username;
        playerMap.set(entry.username, { username: entry.username, name, title: entry.title });
      }
    }

    const players = Array.from(playerMap.values()).slice(0, count * 2);
    setCachedPlayers(cacheKey, players);
    return players.slice(0, count);
  } catch {
    if (!signal?.aborted) warnProviderOnce('chesscom-leaderboard', '[Chess.com] Leaderboard unavailable; using reserve players.');
    return CHESSCOM_FALLBACK.slice(0, count);
  }
}

// ── Lichess game fetching ────────────────────────────────────────────────────

interface LichessGame {
  id: string;
  rated: boolean;
  speed: string;
  perf: string;
  createdAt: number;
  players: {
    white: { user?: { name?: string; id: string }; rating?: number };
    black: { user?: { name?: string; id: string }; rating?: number };
  };
  moves: string;
  winner?: 'white' | 'black';
  opening?: { eco?: string; name?: string };
}

async function fetchLichessGames(
  username: string,
  count: number,
  filter: GameTypeFilter,
  signal?: AbortSignal,
  until?: number,
): Promise<LichessGame[]> {
  const cacheKey = `lichess_${username}_${filter}_${until ?? 'latest'}`;
  const cached = getCachedGames(cacheKey);
  // Opening filters request many more games than a regular session. Never use
  // a smaller cached response for a larger request.
  if (cached && cached.length >= count) return (cached as LichessGame[]).slice(0, count);
  const persisted = await getPersistentCache<LichessGame[]>('lichess-games', cacheKey, GAME_CACHE_TTL);
  if (persisted && persisted.length >= count) {
    setCachedGames(cacheKey, persisted);
    return persisted.slice(0, count);
  }

  const perfTypes =
    filter === 'all'
      ? 'bullet,blitz,rapid,classical'
      : filter === 'blitz'
        ? 'bullet,blitz'
        : filter === 'rapid'
          ? 'rapid'
          : 'classical';

  try {
    const params = new URLSearchParams({
      max: String(count), rated: 'true', perfType: perfTypes,
      clocks: 'false', evals: 'false', opening: 'true',
    });
    if (until) params.set('until', String(until));
    const response = await fetchWithTimeout(
      `https://lichess.org/api/games/user/${username}?${params.toString()}`,
      { headers: { Accept: 'application/x-ndjson' }, signal },
    );

    if (!response.ok) {
      warnProviderOnce('lichess-games', `[Lichess] Some game requests failed (${response.status}); continuing with other sources.`);
      return [];
    }

    const text = await response.text();
    const games = text
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as LichessGame;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as LichessGame[];

    const existing = getCachedGames(cacheKey) as LichessGame[] | null;
    if (!existing || games.length >= existing.length) setCachedGames(cacheKey, games);
    void setPersistentCache('lichess-games', cacheKey, games);
    return games.slice(0, count);
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') return [];
    warnProviderOnce('lichess-games', '[Lichess] Some game requests failed; continuing with other sources.');
    return [];
  }
}

// ── Chess.com game fetching ──────────────────────────────────────────────────

interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  time_class: string; // 'bullet' | 'blitz' | 'rapid' | 'daily'
  white: { username: string; rating: number };
  black: { username: string; rating: number };
}

const CHESSCOM_SPEED_MAP: Record<string, GameTypeFilter> = {
  bullet: 'blitz',
  blitz: 'blitz',
  rapid: 'rapid',
  daily: 'classical',
};

// Chess.com's public API documents that parallel requests can be rate-limited.
// Sessions fetch multiple players at once, so serialize only this provider's
// requests rather than slowing down the independent Lichess work.
let chessComRequestTail: Promise<void> = Promise.resolve();

function abortError(): DOMException {
  return new DOMException('The request was aborted.', 'AbortError');
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchChessComJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const request = async (): Promise<T | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw abortError();
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' }, signal });
      if (response.status !== 429) return response.ok ? response.json() as Promise<T> : null;

      const retryAfter = Number(response.headers.get('Retry-After'));
      await waitForRetry(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5_000) : 750, signal);
    }
    return null;
  };

  const queued = chessComRequestTail.then(request, request);
  chessComRequestTail = queued.then(() => undefined, () => undefined);
  return queued;
}

async function fetchChessComGames(
  username: string,
  count: number,
  filter: GameTypeFilter,
  signal?: AbortSignal,
): Promise<ChessComGame[]> {
  const cacheKey = `chesscom_${username}_${filter}`;
  const cached = getCachedGames(cacheKey);
  if (cached && cached.length >= count) return (cached as ChessComGame[]).slice(0, count);
  const persisted = await getPersistentCache<ChessComGame[]>('chesscom-games', cacheKey, GAME_CACHE_TTL);
  if (persisted && persisted.length >= count) {
    setCachedGames(cacheKey, persisted);
    return persisted.slice(0, count);
  }

  try {
    const archiveData = await fetchChessComJson<{ archives?: string[] }>(
      `https://api.chess.com/pub/player/${username}/games/archives`, signal,
    );
    if (!archiveData) {
      if (!signal?.aborted) warnProviderOnce('chesscom-games', '[Chess.com] Some game requests failed; continuing with other sources.');
      return [];
    }
    const archives: string[] = archiveData.archives || [];
    if (archives.length === 0) return [];

    const allGames: ChessComGame[] = [];
    const monthsToTry = Math.min(archives.length, 4);

    for (let i = archives.length - 1; i >= archives.length - monthsToTry && allGames.length < count; i--) {
      if (signal?.aborted) break;
      try {
        const monthData = await fetchChessComJson<{ games?: ChessComGame[] }>(archives[i], signal);
        if (!monthData) continue;
        const games: ChessComGame[] = monthData.games || [];

        for (const game of games) {
          if (!game.pgn || !game.rated) continue;
          const speed = CHESSCOM_SPEED_MAP[game.time_class] || 'blitz';
          if (filter !== 'all' && speed !== filter) continue;
          allGames.push(game);
          if (allGames.length >= count) break;
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') break;
        continue;
      }
    }

    const existing = getCachedGames(cacheKey) as ChessComGame[] | null;
    if (!existing || allGames.length >= existing.length) setCachedGames(cacheKey, allGames);
    void setPersistentCache('chesscom-games', cacheKey, allGames);
    return allGames.slice(0, count);
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') return [];
    warnProviderOnce('chesscom-games', '[Chess.com] Some game requests failed; continuing with other sources.');
    return [];
  }
}

// ── Lichess OTB Broadcast game fetching ─────────────────────────────────────
// Fetches top-level classical tournament games (Candidates, WCC, Tata Steel, etc.)
// from the Lichess broadcast system.

interface LichessBroadcast {
  tour: { id: string; name: string };
  round: { id: string; name: string; url: string };
}

async function fetchLichessBroadcastPositions(
  count: number,
  seenGames: Set<string>,
  colorPref: ColorPref = 'random',
  ratingRange: RatingRange = { min: 2000, max: null },
  signal?: AbortSignal,
): Promise<RawPosition[]> {
  const cacheKey = `lichess_broadcasts_${count}_${colorPref}`;
  const cached = broadcastCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < BROADCAST_CACHE_TTL) {
    // Filter out seen games from cache
    return cached.data.filter(p => !seenGames.has(p.id.split('_m')[0]));
  }

  const positions: RawPosition[] = [];

  try {
    // Fetch the list of top recent/ongoing broadcasts
    const resp = await fetchWithTimeout('https://lichess.org/api/broadcast?nb=20', {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!resp.ok) {
      console.warn('[Broadcast] Failed to fetch broadcast list:', resp.status);
      return [];
    }

    const text = await resp.text();
    const broadcasts: LichessBroadcast[] = text
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean) as LichessBroadcast[];

    console.log(`[Broadcast] Found ${broadcasts.length} broadcasts`);

    // Fetch PGN from a selection of recent rounds
    const roundsToFetch = broadcasts.slice(0, 8);

    await Promise.all(roundsToFetch.map(async (bc) => {
      try {
        const roundId = bc.round?.id;
        if (!roundId) return;

        const pgnResp = await fetchWithTimeout(`https://lichess.org/api/broadcast/-/-/${roundId}.pgn`, {
          headers: { Accept: 'application/x-chess-pgn' },
          signal,
        });
        if (!pgnResp.ok) return;

        const pgn = await pgnResp.text();
        const games = pgn.split('\n\n[').map((g, i) => i === 0 ? g : '[' + g).filter(g => g.trim());

        for (const gamePgn of games) {
          try {
            const whiteMatch = gamePgn.match(/\[White "([^"]+)"\]/);
            const blackMatch = gamePgn.match(/\[Black "([^"]+)"\]/);
            const whiteEloMatch = gamePgn.match(/\[WhiteElo "([^"]+)"\]/);
            const blackEloMatch = gamePgn.match(/\[BlackElo "([^"]+)"\]/);
            const dateMatch = gamePgn.match(/\[Date "([^"]+)"\]/);
            const whiteTitleMatch = gamePgn.match(/\[WhiteTitle "([^"]+)"\]/);
            const blackTitleMatch = gamePgn.match(/\[BlackTitle "([^"]+)"\]/);
            const siteMatch = gamePgn.match(/\[Site "([^"]+)"\]/);
            const openingMatch = gamePgn.match(/\[Opening "([^"]+)"\]/);
            const ecoUrlMatch = gamePgn.match(/\[ECOUrl "([^"]+)"\]/);

            const whiteName = whiteMatch?.[1] ?? 'Unknown';
            const blackName = blackMatch?.[1] ?? 'Unknown';
            const whiteElo = parseInt(whiteEloMatch?.[1] ?? '0') || 0;
            const blackElo = parseInt(blackEloMatch?.[1] ?? '0') || 0;
            const year = dateMatch?.[1]?.slice(0, 4) ?? new Date().getFullYear().toString();
            const gameUrl = siteMatch?.[1] ?? '';
            const openingName = openingMatch?.[1] ??
              (ecoUrlMatch ? ecoUrlMatch[1].split('/').pop()?.replace(/-/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase()) : undefined);

            // Only process games with titled players (both rated >= 2400 or name indicates GM)
            if (whiteElo < 2400 && blackElo < 2400 && whiteElo !== 0) continue;
            // Apply rating range filter
            const minR = ratingRange.min ?? 2000;
            const maxR = ratingRange.max ?? null;
            if (whiteElo > 0 && whiteElo < minR) continue;
            if (blackElo > 0 && blackElo < minR) continue;
            if (maxR !== null && whiteElo > 0 && whiteElo > maxR) continue;
            if (maxR !== null && blackElo > 0 && blackElo > maxR) continue;

            // Generate a stable game ID from the game URL or player+date combo
            const gameId = gameUrl
              ? `otb_${gameUrl.split('/').pop()}`
              : `otb_${whiteName}_${blackName}_${year}`.replace(/\s/g, '_');

            if (seenGames.has(gameId)) continue;

            // Parse PGN moves
            const chess = new Chess();
            try { chess.loadPgn(gamePgn); } catch { continue; }
            const history = chess.history({ verbose: true });
            if (history.length < 20) continue;

            // Extract positions from moves 16–50 for both sides (favour the better-rated player)
            const gmIsWhite = whiteElo >= blackElo;
            const gmName = gmIsWhite ? whiteName : blackName;
            const opponentName = gmIsWhite ? blackName : whiteName;
            const gmRating = gmIsWhite ? whiteElo : blackElo;
            const playersStr = gmIsWhite
              ? `${whiteName} vs ${blackName}`
              : `${blackName} vs ${whiteName}`;

            const gmTitle = gmIsWhite ? whiteTitleMatch?.[1] : blackTitleMatch?.[1];
            const isGm = gmTitle?.toUpperCase() === 'GM';

            const replay = new Chess();
            let prevMove: { from: string; to: string } | undefined;
            const minMove = 16;
            const maxMove = 50;

            for (let i = 0; i < history.length && i < maxMove * 2; i++) {
              const fen = replay.fen();
              const turn = replay.turn();
              const moveNumber = Math.floor(i / 2) + 1;
              const isGmTurn = (turn === 'w') === gmIsWhite;

              try {
                const moveResult = replay.move(history[i].san);
                if (!moveResult) break;

                if (isGmTurn && moveNumber >= minMove && moveNumber <= maxMove) {
                  // ColorPref filter
                  if (colorPref === 'white' && turn !== 'w') {
                    prevMove = { from: moveResult.from, to: moveResult.to };
                    continue;
                  }
                  if (colorPref === 'black' && turn !== 'b') {
                    prevMove = { from: moveResult.from, to: moveResult.to };
                    continue;
                  }

                  const preCheck = new Chess(fen);
                  if (!preCheck.isCheck() && !preCheck.isGameOver()) {
                    const posId = `${gameId}_m${moveNumber}_${turn}`;
                    positions.push({
                      id: posId,
                      fen,
                      turn,
                      gmMove: moveResult.san,
                      difficulty: 'Hard', // OTB classical top-level games are inherently hard
                      players: playersStr,
                      year,
                      gmUsername: gmName,
                      opponentUsername: opponentName,
                      gameUrl,
                      rating: gmRating || undefined,
                      lastMove: prevMove,
                      openingName,
                      isGm,
                    });
                  }
                }

                prevMove = { from: moveResult.from, to: moveResult.to };
              } catch {
                break;
              }
            }
          } catch {
            // skip malformed game
          }
        }
      } catch {
        if (!signal?.aborted) warnProviderOnce('broadcast-rounds', '[Broadcast] Some round data was unavailable; continuing.');
      }
    }));

    console.log(`[Broadcast] Extracted ${positions.length} OTB positions`);
    broadcastCache.set(cacheKey, { data: positions, timestamp: Date.now() });
    return positions.filter(p => !seenGames.has(p.id.split('_m')[0]));
  } catch {
    if (!signal?.aborted) warnProviderOnce('broadcasts', '[Broadcast] Broadcast positions unavailable; continuing with other sources.');
    return [];
  }
}

// ── Position extraction ──────────────────────────────────────────────────────

interface ExtractedPosition {
  fen: string;
  gmMove: string;
  turn: 'w' | 'b';
  moveNumber: number;
  lastMove?: { from: string; to: string };
}

function extractPositionsFromGame(
  game: LichessGame,
  gmUsername: string,
  minMove = 16,
  maxMove = 50,
): ExtractedPosition[] {
  const chess = new Chess();
  const movesArr = game.moves.split(' ').filter((m) => m.trim());
  const positions: ExtractedPosition[] = [];

  const gmIsWhite =
    game.players.white.user?.id?.toLowerCase() === gmUsername.toLowerCase();

  let prevMove: { from: string; to: string } | undefined;

  for (let i = 0; i < movesArr.length && i < maxMove * 2; i++) {
    const fen = chess.fen();
    const turn = chess.turn();
    const isGmTurn =
      (turn === 'w' && gmIsWhite) || (turn === 'b' && !gmIsWhite);

    try {
      const moveResult = chess.move(movesArr[i]);
      if (!moveResult) break;

      const moveNumber = Math.floor(i / 2) + 1;

      if (isGmTurn && moveNumber >= minMove && moveNumber <= maxMove) {
        const preCheck = new Chess(fen);
        if (!preCheck.isCheck() && !preCheck.isGameOver()) {
          positions.push({
            fen,
            gmMove: moveResult.san,
            turn,
            moveNumber,
            lastMove: prevMove,
          });
        }
      }

      prevMove = { from: moveResult.from, to: moveResult.to };
    } catch {
      break;
    }
  }

  return positions;
}

/** Extract positions from a Chess.com game PGN */
function extractPositionsFromPgn(
  pgn: string,
  gmUsername: string,
  white: { username: string; rating: number },
  black: { username: string; rating: number },
  minMove = 16,
  maxMove = 50,
): ExtractedPosition[] {
  const chess = new Chess();
  const positions: ExtractedPosition[] = [];

  try {
    chess.loadPgn(pgn);
  } catch {
    return [];
  }

  const history = chess.history({ verbose: true });
  chess.reset();

  const newChess = new Chess();
  const fenMatch = pgn.match(/\[FEN "([^"]+)"\]/);
  if (fenMatch) {
    try { newChess.load(fenMatch[1]); } catch { /* use default start */ }
  }

  const gmIsWhite = white.username.toLowerCase() === gmUsername.toLowerCase();
  let prevMove: { from: string; to: string } | undefined;

  for (let i = 0; i < history.length && i < maxMove * 2; i++) {
    const fen = newChess.fen();
    const turn = newChess.turn();
    const isGmTurn =
      (turn === 'w' && gmIsWhite) || (turn === 'b' && !gmIsWhite);

    const moveNumber = Math.floor(i / 2) + 1;

    try {
      const moveResult = newChess.move(history[i].san);
      if (!moveResult) break;

      if (isGmTurn && moveNumber >= minMove && moveNumber <= maxMove) {
        const preCheck = new Chess(fen);
        if (!preCheck.isCheck() && !preCheck.isGameOver()) {
          positions.push({
            fen,
            gmMove: moveResult.san,
            turn,
            moveNumber,
            lastMove: prevMove,
          });
        }
      }

      prevMove = { from: moveResult.from, to: moveResult.to };
    } catch {
      break;
    }
  }

  return positions;
}

// ── Main fetch: returns RawPositions (no engine analysis yet) ────────────────

export async function fetchRawPositions(
  difficulty: Difficulty,
  count: number,
  filter: GameTypeFilter,
  seenGames: Set<string>,
  openingFilter: string[] = [],
  colorPref: ColorPref = 'random',
  ratingRange: RatingRange = { min: 2000, max: null },
  signal?: AbortSignal,
  onProgress?: (current: number) => void,
): Promise<RawPosition[]> {
  console.log(`[BlitzSense] Fetching ${count} ${difficulty} positions (filter: ${filter}, opening: ${openingFilter.join(', ') || 'none'}, side: ${colorPref}, rating: ${ratingRange.min ?? 'any'}-${ratingRange.max ?? 'any'})...`);

  // Effective rating bounds — floor at absolute minimum of 1500 to keep positions meaningful
  const effectiveMin = ratingRange.min ?? 2000;
  const effectiveMax = ratingRange.max ?? null;

  const normalizedOpeningFilters = openingFilter.map(normalizeOpening).filter(Boolean);
  const hasOpeningFilter = normalizedOpeningFilters.length > 0;

  // All live providers share one session-level budget. When it expires we keep
  // any useful live positions and fill the remainder from the bundled reserve.
  const liveController = new AbortController();
  const abortLive = () => liveController.abort();
  if (signal?.aborted) abortLive();
  else signal?.addEventListener('abort', abortLive, { once: true });
  const liveTimer = window.setTimeout(abortLive, LIVE_SESSION_BUDGET_MS);
  const liveSignal = liveController.signal;
  const finishLiveFetch = () => {
    window.clearTimeout(liveTimer);
    signal?.removeEventListener('abort', abortLive);
  };

  /** All extracted positions, regardless of opening filter */
  const rawCandidates: RawPosition[] = [];
  /** Game IDs already processed this session — avoids re-processing cached games */
  const processedGameIds = new Set<string>();

  // ── Inner helpers ────────────────────────────────────────────────────────

  function applyOpeningFilter(positions: RawPosition[]): RawPosition[] {
    if (!hasOpeningFilter) return positions;
    return positions.filter((p) => {
      if (!p.openingName) return false;
      const name = normalizeOpening(p.openingName);
      return normalizedOpeningFilters.some((f) => name.includes(f) || f.includes(name));
    });
  }

  function selectResult(pool: RawPosition[], allowRelaxedVariety = false): RawPosition[] {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const result: RawPosition[] = [];
    const gameCounts = new Map<string, number>();
    const playerCounts = new Map<string, number>();
    const playerKey = (position: RawPosition) => position.playerKey ?? position.gmUsername.trim().toLowerCase();
    const gameId = (position: RawPosition) => position.id.split('_m')[0];
    // A 20-puzzle session can reasonably revisit a player, but short sessions
    // should introduce a new featured player for every puzzle whenever possible.
    const preferredPlayerLimit = count >= 20 ? 2 : 1;

    const addCandidate = (position: RawPosition, playerLimit: number, gameLimit: number) => {
      if (result.length >= count) return false;
      const player = playerKey(position);
      const game = gameId(position);
      if ((playerCounts.get(player) ?? 0) >= playerLimit || (gameCounts.get(game) ?? 0) >= gameLimit) return false;
      playerCounts.set(player, (playerCounts.get(player) ?? 0) + 1);
      gameCounts.set(game, (gameCounts.get(game) ?? 0) + 1);
      result.push(position);
      return true;
    };

    // First pass: prefer a different player and a different game every time.
    for (const p of shuffled) {
      if (result.length >= count) break;
      addCandidate(p, preferredPlayerLimit, 1);
    }

    // Only after every available source has been queried do we relax the
    // player rule. This is important for a narrow opening filter, where a
    // repeat is preferable to returning an unexpectedly short session.
    if (allowRelaxedVariety && result.length < count) {
      for (const p of shuffled) {
        if (result.length >= count) break;
        addCandidate(p, count, 1);
      }

      // Keep source-game repeats as a last resort too. Two positions is
      // enough to fill a constrained session without flooding it from one game.
      for (const p of shuffled) {
        if (result.length >= count) break;
        addCandidate(p, count, 2);
      }
    }

    return result;
  }

  function currentFilteredCount(): number {
    // Strictly require unique games during iteration
    return selectResult(applyOpeningFilter(rawCandidates), false).length;
  }

  function addLichessGame(game: LichessGame, player: { username: string; name: string; title?: string }): void {
    if (seenGames.has(game.id) || processedGameIds.has(game.id)) return;

    // Rating range check: both players must be within the specified bounds
    const whiteRating = game.players.white.rating ?? 0;
    const blackRating = game.players.black.rating ?? 0;
    const minR = effectiveMin;
    const maxR = effectiveMax;
    if (whiteRating > 0 && whiteRating < minR) return;
    if (blackRating > 0 && blackRating < minR) return;
    if (maxR !== null && whiteRating > 0 && whiteRating > maxR) return;
    if (maxR !== null && blackRating > 0 && blackRating > maxR) return;

    processedGameIds.add(game.id);

    const positions = extractPositionsFromGame(game, player.username);
    if (positions.length === 0) return;

    const gmIsWhite = game.players.white.user?.id?.toLowerCase() === player.username.toLowerCase();
    const gmSide = gmIsWhite ? game.players.white : game.players.black;
    const opponentSide = gmIsWhite ? game.players.black : game.players.white;
    const opponentName = opponentSide.user?.name || opponentSide.user?.id || 'Unknown';
    const playersStr = gmIsWhite
      ? `${player.name} vs ${opponentName}`
      : `${opponentName} vs ${player.name}`;

    const isGm = isGmUser(player.username, player.title);

    const eligiblePositions = positions.filter((position) =>
      (colorPref !== 'white' || position.turn === 'w') &&
      (colorPref !== 'black' || position.turn === 'b'));

    for (const pos of seededShuffle(eligiblePositions, seedFromString(game.id)).slice(0, MAX_POSITIONS_PER_GAME)) {

      rawCandidates.push({
        id: `${game.id}_m${pos.moveNumber}_${pos.turn}`,
        fen: pos.fen,
        turn: pos.turn,
        gmMove: pos.gmMove,
        difficulty,
        players: playersStr,
        year: new Date(game.createdAt).getFullYear().toString(),
        gmUsername: player.name,
        opponentUsername: opponentName,
        gameUrl: `https://lichess.org/${game.id}`,
        rating: gmSide.rating,
        lastMove: pos.lastMove,
        openingName: game.opening?.name,
        isGm,
        playerKey: player.username.toLowerCase(),
      });
    }
  }

  function addChessComGame(game: ChessComGame, player: { username: string; name: string; title?: string }): void {
    const gameId = game.url.split('/').pop() || String(game.end_time);
    const ccId = `cc_${gameId}`;
    if (seenGames.has(ccId) || processedGameIds.has(ccId)) return;

    // Rating range check: both players must be within the specified bounds
    const whiteRating = game.white.rating ?? 0;
    const blackRating = game.black.rating ?? 0;
    const minR = effectiveMin;
    const maxR = effectiveMax;
    if (whiteRating > 0 && whiteRating < minR) return;
    if (blackRating > 0 && blackRating < minR) return;
    if (maxR !== null && whiteRating > 0 && whiteRating > maxR) return;
    if (maxR !== null && blackRating > 0 && blackRating > maxR) return;

    processedGameIds.add(ccId);

    const gmIsWhite = game.white.username.toLowerCase() === player.username.toLowerCase();
    const gmSide = gmIsWhite ? game.white : game.black;
    const opponentSide = gmIsWhite ? game.black : game.white;
    const positions = extractPositionsFromPgn(game.pgn, player.username, game.white, game.black);
    if (positions.length === 0) return;

    const ecoUrlMatch = game.pgn.match(/\[ECOUrl "[^"]*\/([^"]+)"\]/);
    const openingName = ecoUrlMatch
      ? ecoUrlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : (game.pgn.match(/\[Opening "([^"]+)"\]/)?.[1] || undefined);

    const isGm = isGmUser(player.username, player.title);

    const eligiblePositions = positions.filter((position) =>
      (colorPref !== 'white' || position.turn === 'w') &&
      (colorPref !== 'black' || position.turn === 'b'));

    for (const pos of seededShuffle(eligiblePositions, seedFromString(ccId)).slice(0, MAX_POSITIONS_PER_GAME)) {

      rawCandidates.push({
        id: `${ccId}_m${pos.moveNumber}_${pos.turn}`,
        fen: pos.fen,
        turn: pos.turn,
        gmMove: pos.gmMove,
        difficulty,
        players: gmIsWhite
          ? `${player.name} vs ${opponentSide.username}`
          : `${opponentSide.username} vs ${player.name}`,
        year: new Date(game.end_time * 1000).getFullYear().toString(),
        gmUsername: player.name,
        opponentUsername: opponentSide.username,
        gameUrl: game.url,
        rating: gmSide.rating,
        lastMove: pos.lastMove,
        openingName,
        isGm,
        playerKey: player.username.toLowerCase(),
      });
    }
  }

  if (signal?.aborted) { finishLiveFetch(); return []; }

  // ── Build combined player pool (Lichess top-100 + Chess.com) ─────────────
  const lichessPerfTypes =
    filter === 'all' ? ['blitz', 'rapid', 'classical'] :
    filter === 'blitz' ? ['blitz'] :
    filter === 'rapid' ? ['rapid'] : ['classical'];

  // Opening searches favor a small known Lichess pool. This avoids blocking on
  // four leaderboard calls before the first game can even be inspected.
  const [lichessPlayerSets, chessComTopPlayers] = hasOpeningFilter
    ? [[LICHESS_FALLBACK.slice(0, 8)], []]
    : await Promise.all([
        Promise.all(lichessPerfTypes.map((pt) => fetchLichessTopPlayers(pt, 100, liveSignal))),
        fetchChessComTopPlayers(20, liveSignal),
      ]);

  if (signal?.aborted) { finishLiveFetch(); return []; }

  const lichessPlayerMap = new Map<string, { username: string; name: string; title?: string }>();
  for (const set of lichessPlayerSets) {
    for (const p of set) lichessPlayerMap.set(p.username.toLowerCase(), p);
  }

  // Tag each player with their source so we know which fetch to call
  type PlayerEntry = { username: string; name: string; title?: string; source: 'lichess' | 'chesscom' };
  let allPlayers: PlayerEntry[] = [
    ...Array.from(lichessPlayerMap.values()).map((p) => ({ ...p, source: 'lichess' as const })),
    ...chessComTopPlayers.map((p) => ({ ...p, source: 'chesscom' as const })),
  ];
  if (!hasOpeningFilter) allPlayers.sort(() => Math.random() - 0.5);
  else allPlayers = allPlayers.slice(0, 4);

  // ── Iterative batch fetching ──────────────────────────────────────────────
  // Process players in batches of 4. After each batch, check if we already
  // have enough positions. If so, stop — no more API calls needed.
  const BATCH_SIZE = hasOpeningFilter ? 2 : 4;
  const gamesPerPlayer = hasOpeningFilter ? 40 : 15;
  let emptyBatches = 0;

  for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
    if (liveSignal.aborted) break;
    if (currentFilteredCount() >= count) break;

    const batch = allPlayers.slice(i, i + BATCH_SIZE);
    const candidatesBeforeBatch = rawCandidates.length;

    await Promise.all(
      batch.map(async (player) => {
        if (liveSignal.aborted) return;
        try {
          if (player.source === 'lichess') {
            const games = await fetchLichessGames(player.username, gamesPerPlayer, filter, liveSignal);
            if (!liveSignal.aborted) for (const g of games) addLichessGame(g, player);
          } else {
            const games = await fetchChessComGames(player.username, gamesPerPlayer, filter, liveSignal);
            if (!liveSignal.aborted) for (const g of games) addChessComGame(g, player);
          }
        } catch { /* individual player failure is non-fatal */ }
      }),
    );

    const n = currentFilteredCount();
    emptyBatches = rawCandidates.length === candidatesBeforeBatch ? emptyBatches + 1 : 0;
    console.log(`[BlitzSense] After batch ${Math.floor(i / BATCH_SIZE) + 1}: ${n}/${count} positions (${rawCandidates.length} raw candidates)`);
    if (onProgress) onProgress(n);
    // A provider outage or browser network policy should not make users wait
    // while every leaderboard account is probed. Fall back after three empty batches.
    if (!hasOpeningFilter && emptyBatches >= 3) {
      console.warn('[BlitzSense] Live providers returned three empty batches; using the bundled reserve.');
      break;
    }
  }

  // Broadcast PGNs are valuable but slower, so query them only as a bounded
  // last resort after the normal game APIs have failed to fill the session.
  if (
    !hasOpeningFilter &&
    !liveSignal.aborted &&
    currentFilteredCount() < count &&
    (filter === 'all' || filter === 'classical')
  ) {
    const remaining = count - currentFilteredCount();
    const otbPositions = await fetchLichessBroadcastPositions(remaining * 2, seenGames, colorPref, ratingRange, liveSignal);
    for (const position of otbPositions) {
      const gameId = position.id.split('_m')[0];
      if (!processedGameIds.has(gameId)) {
        processedGameIds.add(gameId);
        rawCandidates.push(position);
      }
    }
    if (onProgress) onProgress(currentFilteredCount());
  }

  if (signal?.aborted) {
    finishLiveFetch();
    console.log('[BlitzSense] Fetch cancelled by user');
    return [];
  }

  const filteredPool = applyOpeningFilter(rawCandidates);
  // Try 1-per-game first
  let result = selectResult(filteredPool, false);

  // Fallback: if we exhausted the entire player database and still don't have enough,
  // allow multiple positions per game.
  if (result.length < count) {
    result = selectResult(filteredPool, true);
  }

  if (filteredPool.length < count && hasOpeningFilter) {
    console.warn(`[BlitzSense] Opening filter: only ${result.length}/${count} positions found across ${allPlayers.length} players`);
  }

  console.log(`[BlitzSense] Returning ${result.length} positions (${rawCandidates.length} raw, ${filteredPool.length} filtered)`);

  // A requested opening is a hard constraint. Returning unrelated fallback
  // positions makes the filter appear broken and trains the wrong repertoire.
  if (hasOpeningFilter) {
    finishLiveFetch();
    if (result.length > 0) return result;
    // Keep the filter strict even when live game providers are temporarily
    // unavailable. The bundled reserve is tagged by opening and never leaks an
    // unrelated position into the session.
    return getFallbackRawPositions(difficulty, count, openingFilter);
  }
  finishLiveFetch();
  if (result.length >= count) return result;

  const resultIds = new Set(result.map((position) => position.id));
  const reserve = getFallbackRawPositions(difficulty, count)
    .filter((position) => !resultIds.has(position.id));
  return [...result, ...reserve].slice(0, count);
}

// ── Fetch positions from a single GM (for Daily Challenge) ───────────────────


export async function fetchRawPositionsForGM(
  gmUsername: string,
  count: number,
  seenGames: Set<string>,
  dailyKey?: string,
): Promise<RawPosition[]> {
  // Try to find the player in the fallback list first (for display name lookup)
  const fallbackPlayer = LICHESS_FALLBACK.find(
    (p) => p.username.toLowerCase() === gmUsername.toLowerCase() ||
      p.name.toLowerCase() === gmUsername.toLowerCase(),
  );

  const playerUsername = fallbackPlayer?.username ?? gmUsername;
  const playerName = fallbackPlayer?.name ?? gmUsername;

  console.log(`[BlitzSense] Fetching ${count} positions from ${playerName}...`);

  const candidates: RawPosition[] = [];

  for (const batchSize of [60, 120]) {
    if (candidates.length >= count) break;

    // Snapshot daily challenges at a fixed UTC boundary so new games during the
    // day do not change the candidate pool for later players.
    const until = dailyKey ? Date.parse(`${dailyKey}T00:00:00Z`) : undefined;
    const games = await fetchLichessGames(playerUsername, batchSize, 'all', undefined, until);
    const seenGameIds = new Set(candidates.map((c) => c.id.split('_m')[0]));

    for (const game of games) {
      // ── Game-level deduplication ──
      if (seenGames.has(game.id) || seenGameIds.has(game.id)) continue;
      seenGameIds.add(game.id);

      const positions = extractPositionsFromGame(game, playerUsername);

      const gmIsWhite =
        game.players.white.user?.id?.toLowerCase() === playerUsername.toLowerCase();
      const gmSide = gmIsWhite ? game.players.white : game.players.black;
      const opponentSide = gmIsWhite ? game.players.black : game.players.white;

      const opponentName =
        opponentSide.user?.name || opponentSide.user?.id || 'Unknown';
      const playersStr = gmIsWhite
        ? `${playerName} vs ${opponentName}`
        : `${opponentName} vs ${playerName}`;
      const year = new Date(game.createdAt).getFullYear().toString();
      const gameUrl = `https://lichess.org/${game.id}`;
      const gmRating = gmSide.rating;

      for (const pos of positions) {
        candidates.push({
          id: `${game.id}_m${pos.moveNumber}_${pos.turn}`,
          fen: pos.fen,
          turn: pos.turn,
          gmMove: pos.gmMove,
          difficulty: 'Medium',
          players: playersStr,
          year,
          gmUsername: playerName,
          opponentUsername: opponentName,
          gameUrl,
          rating: gmRating,
          lastMove: pos.lastMove,
          openingName: game.opening?.name,
          isGm: true,
        });
      }
    }
  }

  if (candidates.length === 0) {
    console.warn(`[BlitzSense] No positions from ${playerName}, using fallback`);
    return getFallbackRawPositions('Medium', count);
  }

  const shuffled = dailyKey
    ? seededShuffle(candidates, seedFromString(`${dailyKey}:${playerUsername}`))
    : [...candidates].sort(() => Math.random() - 0.5);
  const result: RawPosition[] = [];
  const usedGameIds = new Set<string>();

  for (const pos of shuffled) {
    if (result.length >= count) break;
    const gameId = pos.id.split('_m')[0];
    if (!usedGameIds.has(gameId)) {
      usedGameIds.add(gameId);
      result.push(pos);
    }
  }

  console.log(`[BlitzSense] Returning ${result.length} positions for ${playerName}`);
  return result;
}

// ── Analyze a single raw position ────────────────────────────────────────────

export async function analyzeRawPosition(
  raw: RawPosition,
  engineDepth: EngineDepth = 14,
): Promise<ChessPosition> {
    const cacheKey = `v3:${engineDepth}:${raw.fen}`;
    const cached = analysisCache.get(cacheKey);
    const memoryValue = cached && Date.now() - cached.timestamp < ANALYSIS_CACHE_TTL ? cached.data : null;
    const persisted = memoryValue ? null : await getPersistentCache<LocalAnalysisResult>('engine-analysis', cacheKey, ANALYSIS_CACHE_TTL);
    const analysis = memoryValue ?? persisted ?? await analyzeLocally(raw.fen, engineDepth);
    if (analysis.moves.length === 0) throw new Error('Stockfish returned no moves.');
    if (!memoryValue) {
      analysisCache.set(cacheKey, { data: analysis, timestamp: Date.now() });
      if (!persisted) void setPersistentCache('engine-analysis', cacheKey, analysis);
    }

    const engineLines = analysis.lines.flatMap(({ move: lan, evaluation }) => {
      try {
        const chess = new Chess(raw.fen);
        const move = chess.move({
          from: lan.slice(0, 2),
          to: lan.slice(2, 4),
          promotion: lan.length > 4 ? lan[4] : undefined,
        });
        return move ? [{ move: move.san, evaluation }] : [];
      } catch {
        return [];
      }
    });
    const bestMoves = engineLines.map(({ move }) => move);
    if (bestMoves.length === 0) throw new Error('Stockfish returned invalid moves.');

    return {
      id: raw.id,
      fen: raw.fen,
      turn: raw.turn,
      gmMove: raw.gmMove,
      bestMoves: bestMoves.slice(0, 3),
      engineLines,
      evaluation: analysis.evaluation,
      difficulty: raw.difficulty,
      players: raw.players,
      year: raw.year,
      gmUsername: raw.gmUsername,
      opponentUsername: raw.opponentUsername,
      gameUrl: raw.gameUrl,
      rating: raw.rating,
      lastMove: raw.lastMove,
      openingName: raw.openingName,
      isGm: raw.isGm,
    };
}

// ── Fallback positions ───────────────────────────────────────────────────────
// Used only when all three live sources fail. gameUrl is '' (empty) so the
// UI correctly hides the link for these synthetic positions.

function getFallbackRawPositions(
  difficulty: Difficulty,
  count: number,
  openingFilter: string[] = [],
): RawPosition[] {
  const fallbacks: RawPosition[] = [
    {
      id: 'fb_qgd_1',
      fen: 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 4 8',
      turn: 'w',
      gmMove: 'dxc5',
      difficulty: 'Medium',
      players: 'Magnus Carlsen vs Anish Giri',
      year: '2024',
      gmUsername: 'Magnus Carlsen',
      opponentUsername: 'Anish Giri',
      gameUrl: '',
      rating: 2850,
    },
    {
      id: 'fb_london_2',
      fen: 'r2q1rk1/ppp2ppp/2n1bn2/3p4/3P1B2/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 9',
      turn: 'w',
      gmMove: 'Bd3',
      difficulty: 'Medium',
      players: 'Fabiano Caruana vs Anish Giri',
      year: '2024',
      gmUsername: 'Fabiano Caruana',
      opponentUsername: 'Anish Giri',
      gameUrl: '',
      rating: 2790,
    },
    {
      id: 'fb_sicilian_3',
      fen: 'r2qr1k1/1p1nbppp/p2pbn2/4p3/4P3/1NN1BP2/PPPQ2PP/2KR1B1R w - - 2 12',
      turn: 'w',
      gmMove: 'g4',
      difficulty: 'Hard',
      players: 'Alireza Firouzja vs David Navara',
      year: '2024',
      gmUsername: 'Alireza Firouzja',
      opponentUsername: 'David Navara',
      gameUrl: '',
      rating: 2785,
    },
    {
      id: 'fb_ruy_4',
      fen: 'r1bq1rk1/2p1bppp/p1n2n2/1p1pp3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - - 0 9',
      turn: 'w',
      gmMove: 'd3',
      difficulty: 'Easy',
      players: 'Vladislav Artemiev vs Sergei Zhigalko',
      year: '2023',
      gmUsername: 'Vladislav Artemiev',
      opponentUsername: 'Sergei Zhigalko',
      gameUrl: '',
      rating: 2700,
    },
    {
      id: 'fb_catalan_5',
      fen: 'rnbq1rk1/pp3pbp/4pnp1/2ppP3/3P4/2N2NP1/PP2PPBP/R1BQ1RK1 w - - 0 8',
      turn: 'w',
      gmMove: 'Re1',
      difficulty: 'Easy',
      players: 'Nihal Sarin vs Andrew Tang',
      year: '2024',
      gmUsername: 'Nihal Sarin',
      opponentUsername: 'Andrew Tang',
      gameUrl: '',
      rating: 2700,
    },
    {
      id: 'fb_endgame_6',
      fen: '8/5pk1/6p1/4P3/1p3P1p/1P4rP/6PK/3R4 w - - 0 40',
      turn: 'w',
      gmMove: 'Rd7',
      difficulty: 'Hard',
      players: 'Magnus Carlsen vs Wesley So',
      year: '2023',
      gmUsername: 'Magnus Carlsen',
      opponentUsername: 'Wesley So',
      gameUrl: '',
      rating: 2855,
    },
    {
      id: 'fb_nimzo_7',
      fen: 'r1bq1rk1/pp3ppp/2nbpn2/3p4/2PP4/2N1PN2/PP2BPPP/R1BQ1RK1 w - - 0 7',
      turn: 'w',
      gmMove: 'cxd5',
      difficulty: 'Easy',
      players: 'Abhimanyu Mishra vs Rauf Mamedov',
      year: '2024',
      gmUsername: 'Abhimanyu Mishra',
      opponentUsername: 'Rauf Mamedov',
      gameUrl: '',
      rating: 2650,
    },
    {
      id: 'fb_french_8',
      fen: 'r1b2rk1/pp1nqppp/2n1p3/2ppP3/3P4/2P2N2/PP2BPPP/R1BQR1K1 w - - 0 10',
      turn: 'w',
      gmMove: 'Nf1',
      difficulty: 'Medium',
      players: 'Parham Maghsoodloo vs Eric Hansen',
      year: '2024',
      gmUsername: 'Parham Maghsoodloo',
      opponentUsername: 'Eric Hansen',
      gameUrl: '',
      rating: 2740,
    },
    {
      id: 'fb_kings_indian_9',
      fen: 'r1bq1rk1/ppp1npbp/3p1np1/3Pp3/2P1P3/2N2N2/PP2BPPP/R1BQ1RK1 b - - 0 8',
      turn: 'b',
      gmMove: 'a5',
      difficulty: 'Medium',
      players: 'Jeffery Xiong vs Sergei Zhigalko',
      year: '2023',
      gmUsername: 'Sergei Zhigalko',
      opponentUsername: 'Jeffery Xiong',
      gameUrl: '',
      rating: 2700,
    },
    {
      id: 'fb_caro_10',
      fen: 'r1bqkb1r/pp1npppp/2p2n2/3p4/3P1B2/2N2N2/PPP1PPPP/R2QKB1R w KQkq - 4 4',
      turn: 'w',
      gmMove: 'e3',
      difficulty: 'Easy',
      players: 'Wesley So vs David Navara',
      year: '2024',
      gmUsername: 'Wesley So',
      opponentUsername: 'David Navara',
      gameUrl: '',
      rating: 2770,
    },
    {
      id: 'fb_rook_end_11',
      fen: '8/1R3pk1/5np1/4p2p/4P2P/5PP1/6K1/1r6 w - - 0 38',
      turn: 'w',
      gmMove: 'Ra7',
      difficulty: 'Hard',
      players: 'Vladislav Artemiev vs Nihal Sarin',
      year: '2023',
      gmUsername: 'Vladislav Artemiev',
      opponentUsername: 'Nihal Sarin',
      gameUrl: '',
      rating: 2730,
    },
    {
      id: 'fb_scotch_12',
      fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQ - 4 5',
      turn: 'w',
      gmMove: 'Nxe5',
      difficulty: 'Easy',
      players: 'Simon Williams vs Razvan Preotu',
      year: '2024',
      gmUsername: 'Simon Williams',
      opponentUsername: 'Razvan Preotu',
      gameUrl: '',
      rating: 2530,
    },
  ];

  const openingById: Record<string, string> = {
    fb_qgd_1: "Queen's Gambit Declined",
    fb_london_2: 'London System',
    fb_sicilian_3: 'Sicilian Defense',
    fb_ruy_4: 'Ruy Lopez',
    fb_catalan_5: 'Catalan Opening',
    fb_nimzo_7: 'Nimzo-Indian Defense',
    fb_french_8: 'French Defense',
    fb_kings_indian_9: "King's Indian Defense",
    fb_caro_10: 'Caro-Kann Defense',
    fb_scotch_12: 'Scotch Game',
  };
  const labeled = fallbacks.map((position) => ({
    ...position,
    openingName: openingById[position.id],
    isGm: true,
  }));
  const normalizedFilters = openingFilter.map(normalizeOpening).filter(Boolean);
  const openingMatches = normalizedFilters.length === 0
    ? labeled
    : labeled.filter((position) => {
        if (!position.openingName) return false;
        const name = normalizeOpening(position.openingName);
        return normalizedFilters.some((filter) => name.includes(filter) || filter.includes(name));
      });
  if (openingMatches.length === 0) return [];
  const matching = openingMatches.filter((p) => p.difficulty === difficulty);
  const otherDifficulties = openingMatches.filter((p) => p.difficulty !== difficulty);
  // Prefer the requested difficulty, but a complete session is better than a
  // mysteriously shortened one when live providers are unavailable.
  const pool = [
    ...matching.sort(() => Math.random() - 0.5),
    ...otherDifficulties.sort(() => Math.random() - 0.5),
  ];
  return pool.slice(0, count).map((position) => ({ ...position, difficulty }));
}
