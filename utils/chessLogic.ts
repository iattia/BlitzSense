import { Chess } from 'chess.js';
import type { EngineEvaluation, EngineLineEvaluation } from '../types';

export const validateMove = (fen: string, moveSan: string): boolean => {
  try {
    const game = new Chess(fen);
    return !!game.move(moveSan);
  } catch {
    return false;
  }
};

/**
 * Grade a move by its evaluation loss from Stockfish's best line.
 * Matching the source-game move is recorded for comparison but has no scoring
 * value by itself. Near-equivalent fourth and fifth lines can still score 100.
 */
export const calculateScore = (
  userMoveSan: string,
  gmMove: string,
  bestMoves: string[],
  engineLines: EngineLineEvaluation[] = [],
  turn: 'w' | 'b' = 'w',
): { points: number; beatGm: boolean; matchedGm: boolean; engineRank: number; centipawnLoss?: number } => {
  const rankedMoves = engineLines.length > 0 ? engineLines.map(({ move }) => move) : bestMoves;
  const engineRank = rankedMoves.indexOf(userMoveSan) + 1; // 1-indexed, 0 = not found
  const matchedGm = userMoveSan === gmMove;

  if (engineLines.length > 0) {
    const centipawnLoss = getCentipawnLoss(userMoveSan, turn, engineLines);
    if (centipawnLoss === undefined) {
      return { points: 0, beatGm: false, matchedGm, engineRank: 0 };
    }
    const points = centipawnLoss <= 20 ? 100
      : centipawnLoss <= 50 ? 90
        : centipawnLoss <= 100 ? 75
          : centipawnLoss <= 200 ? 50
            : 0;
    const gmLoss = getCentipawnLoss(gmMove, turn, engineLines);
    const beatGm = points > 0 && !matchedGm && (gmLoss === undefined || centipawnLoss + 20 < gmLoss);
    return { points, beatGm, matchedGm, engineRank, centipawnLoss };
  }

  // Compatibility path for stored sessions created before per-line scores.
  if (engineRank > 0) {
    const points = engineRank === 1 ? 100 : engineRank === 2 ? 80 : 60;
    return { points, beatGm: !matchedGm, matchedGm, engineRank };
  }
  return { points: 0, beatGm: false, matchedGm: false, engineRank: 0 };
};

function evaluationToWhiteCentipawns(evaluation: EngineEvaluation): number {
  if (evaluation.type === 'cp') return evaluation.value;
  const distancePenalty = Math.min(99, Math.abs(evaluation.value)) * 1_000;
  return Math.sign(evaluation.value || 1) * (100_000 - distancePenalty);
}

export function getCentipawnLoss(
  move: string | null | undefined,
  turn: 'w' | 'b',
  engineLines: EngineLineEvaluation[] = [],
): number | undefined {
  if (!move || engineLines.length === 0) return undefined;
  const best = engineLines[0];
  const candidate = engineLines.find((line) => line.move === move);
  if (!candidate) return undefined;
  const bestScore = evaluationToWhiteCentipawns(best.evaluation);
  const candidateScore = evaluationToWhiteCentipawns(candidate.evaluation);
  return Math.max(0, Math.round(turn === 'w' ? bestScore - candidateScore : candidateScore - bestScore));
}

export const getMoveSan = (fen: string, from: string, to: string): string | null => {
  try {
    const game = new Chess(fen);
    // Try queen promotion first, then underpromotions
    for (const promotion of ['q', 'r', 'b', 'n', undefined] as const) {
      const copy = new Chess(fen);
      const move = copy.move({ from, to, promotion });
      if (move) return move.san;
    }
    const move = game.move({ from, to });
    return move ? move.san : null;
  } catch {
    return null;
  }
};

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export const isPawnPromotion = (fen: string, from: string, to: string): boolean => {
  try {
    const game = new Chess(fen);
    const piece = game.get(from as any);
    if (piece?.type !== 'p' || (to[1] !== '1' && to[1] !== '8')) return false;
    return !!game.move({ from, to, promotion: 'q' });
  } catch {
    return false;
  }
};

export const getPromotionMoveSan = (
  fen: string,
  from: string,
  to: string,
  promotion: PromotionPiece,
): string | null => {
  try {
    return new Chess(fen).move({ from, to, promotion })?.san ?? null;
  } catch {
    return null;
  }
};

export interface MaterialInfo {
  whiteMaterial: number;
  blackMaterial: number;
  diff: number; // positive = White ahead, negative = Black ahead
  capturedByWhite: { p: number; n: number; b: number; r: number; q: number };
  capturedByBlack: { p: number; n: number; b: number; r: number; q: number };
}

const STARTING_COUNTS: Record<string, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
};

export const getMaterialBalance = (fen: string): MaterialInfo => {
  try {
    const game = new Chess(fen);
    const counts = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    };

    for (const row of game.board()) {
      for (const sq of row) {
        if (sq && sq.type !== 'k') {
          counts[sq.color][sq.type as 'p' | 'n' | 'b' | 'r' | 'q']++;
        }
      }
    }

    const whiteMaterial =
      counts.w.p * 1 + counts.w.n * 3 + counts.w.b * 3 + counts.w.r * 5 + counts.w.q * 9;
    const blackMaterial =
      counts.b.p * 1 + counts.b.n * 3 + counts.b.b * 3 + counts.b.r * 5 + counts.b.q * 9;

    const capturedByWhite = {
      p: Math.max(0, STARTING_COUNTS.p - counts.b.p),
      n: Math.max(0, STARTING_COUNTS.n - counts.b.n),
      b: Math.max(0, STARTING_COUNTS.b - counts.b.b),
      r: Math.max(0, STARTING_COUNTS.r - counts.b.r),
      q: Math.max(0, STARTING_COUNTS.q - counts.b.q),
    };

    const capturedByBlack = {
      p: Math.max(0, STARTING_COUNTS.p - counts.w.p),
      n: Math.max(0, STARTING_COUNTS.n - counts.w.n),
      b: Math.max(0, STARTING_COUNTS.b - counts.w.b),
      r: Math.max(0, STARTING_COUNTS.r - counts.w.r),
      q: Math.max(0, STARTING_COUNTS.q - counts.w.q),
    };

    return {
      whiteMaterial,
      blackMaterial,
      diff: whiteMaterial - blackMaterial,
      capturedByWhite,
      capturedByBlack,
    };
  } catch {
    return {
      whiteMaterial: 0,
      blackMaterial: 0,
      diff: 0,
      capturedByWhite: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      capturedByBlack: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    };
  }
};

export interface MoveShape {
  orig: string;
  dest: string;
  brush: 'green' | 'blue' | 'red' | 'yellow';
  label?: { text: string };
}

export const getMoveShapes = (
  fen: string,
  moves: {
    engineMove?: string;
    gmMove?: string;
    userMove?: string | null;
  }
): MoveShape[] => {
  const shapes: MoveShape[] = [];
  const addedMoves = new Set<string>();

  const tryAddShape = (moveSan: string | undefined | null, brush: MoveShape['brush'], label?: string) => {
    if (!moveSan) return;
    try {
      const chess = new Chess(fen);
      const move = chess.move(moveSan);
      if (move) {
        const key = `${move.from}-${move.to}`;
        if (!addedMoves.has(key)) {
          addedMoves.add(key);
          shapes.push({ orig: move.from, dest: move.to, brush, label: label ? { text: label } : undefined });
        }
      }
    } catch {
      // invalid SAN move
    }
  };

  // 1. Engine #1 Move (Green)
  tryAddShape(moves.engineMove, 'green', 'Engine #1');

  // 2. Source-game move (Blue)
  if (moves.gmMove && moves.gmMove !== moves.engineMove) {
  tryAddShape(moves.gmMove, 'blue', 'Played Move');
  }

  // 3. User Move (Red / Yellow if different)
  if (
    moves.userMove &&
    moves.userMove !== moves.engineMove &&
    moves.userMove !== moves.gmMove
  ) {
    tryAddShape(moves.userMove, 'red', 'Your Move');
  }

  return shapes;
};

export const getCheckStatus = (fen: string): { isCheck: boolean; isCheckmate: boolean; turn: 'w' | 'b' } => {
  try {
    const game = new Chess(fen);
    return {
      isCheck: game.isCheck(),
      isCheckmate: game.isCheckmate(),
      turn: game.turn(),
    };
  } catch {
    return { isCheck: false, isCheckmate: false, turn: 'w' };
  }
};
