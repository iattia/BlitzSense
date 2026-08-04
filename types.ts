export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type AnalysisMode = 'between' | 'end-only';
export type BoardTheme = 'slate' | 'wood' | 'green';
export type GameTypeFilter = 'all' | 'blitz' | 'rapid' | 'classical';
export type TimerMode = 'timed' | 'zen';  // zen = no timer pressure
export type ColorPref = 'white' | 'black' | 'random';
export type Appearance = 'light' | 'dark';
export type EngineDepth = 10 | 14 | 18;

/** Stockfish score from White's point of view. Positive values favor White. */
export interface EngineEvaluation {
  type: 'cp' | 'mate';
  /** Centipawns for `cp`, moves-to-mate for `mate`. */
  value: number;
}

export interface EngineLineEvaluation {
  move: string;
  evaluation: EngineEvaluation;
}

/** Minimum and maximum rating for both players in a game. null means no limit. */
export interface RatingRange {
  min: number | null;
  max: number | null;
}


export interface BookmarkedPosition {
  id: string;
  fen: string;
  gmMove: string;
  bestMoves: string[];
  players: string;
  gmUsername: string;
  gameUrl: string;
  openingName?: string;
  savedAt: string; // ISO date
  isGm?: boolean;
}

export interface SessionRecord {
  date: string;          // ISO string
  score: number;
  correctCount: number;
  totalPlayed: number;
  difficulty: Difficulty;
  positionCount: number;
  gmStats: Record<string, { correct: number; total: number }>; // per-GM accuracy
}

export interface ChessPosition {
  id: string;
  fen: string;
  turn: 'w' | 'b';
  gmMove: string;        // SAN of the actual move the GM played in the game
  bestMoves: string[];   // Top local-engine moves in SAN, ranked best-first
  engineLines: EngineLineEvaluation[];
  evaluation: EngineEvaluation;
  difficulty: Difficulty;
  description?: string;
  players: string;       // e.g. "Magnus Carlsen vs Hikaru Nakamura"
  year: string;
  gmUsername: string;
  opponentUsername: string;
  gameUrl: string;       // e.g. "https://lichess.org/abcd1234"
  rating?: number;       // GM's rating in that game
  lastMove?: { from: string; to: string }; // opponent's last move (for board highlighting)
  openingName?: string; // e.g. "Sicilian Defense: Najdorf Variation"
  isGm?: boolean;
}

// A raw position before engine analysis — used for rolling prefetch
export interface RawPosition {
  id: string;
  fen: string;
  turn: 'w' | 'b';
  gmMove: string;
  difficulty: Difficulty;
  players: string;
  year: string;
  gmUsername: string;
  opponentUsername: string;
  gameUrl: string;
  rating?: number;
  lastMove?: { from: string; to: string }; // opponent's last move (for board highlighting)
  openingName?: string; // opening name from the game
  isGm?: boolean;
  /** Stable account identifier used internally to keep a session's featured players varied. */
  playerKey?: string;
}

export interface GameStats {
  score: number;
  streak: number;
  correctCount: number;
  totalPlayed: number;
  maxInGameStreak: number; // highest consecutive-correct streak reached in this session
  history: RoundResult[];
}

export interface RoundResult {
  positionId: string;
  gameId: string;          // the source game ID (used for seen-game deduplication)
  userMove: string | null; // null if time ran out
  scoreEarned: number;
  isCorrect: boolean;
  beatGm: boolean;         // true if the user's evaluated move beat the source-game move
  matchedGm: boolean;      // true if user played exactly the GM's move
  engineRank: number;      // 1–5 if user played an analyzed engine line, 0 otherwise
  centipawnLoss?: number;
  speedBonus: number;      // extra pts for fast answer (< 1.5s)
  timeTaken: number;
  fen: string;
  gmMove: string;
  bestMoves: string[];
  /** Per-move scores were added after launch, so imported older rounds may omit them. */
  engineLines?: EngineLineEvaluation[];
  evaluation: EngineEvaluation;
  players: string;
  gmUsername: string;
  gameUrl: string;
  openingName?: string;
  isGm?: boolean;
}

// ── Milestone system ──────────────────────────────────────────────────────────
export interface Milestone {
  id: string;
  label: string;
  description: string;
  icon: string;       // emoji
  threshold: number;  // value to reach
  category: 'games' | 'accuracy' | 'streak' | 'gm-beats' | 'score';
}

export enum AppState {
  HOME = 'HOME',
  PLAYING = 'PLAYING',
  RESULTS = 'RESULTS',
}
