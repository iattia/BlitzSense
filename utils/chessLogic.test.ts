import { describe, expect, it } from 'vitest';
import {
  calculateScore,
  getMaterialBalance,
  getMoveSan,
  getMoveShapes,
  getPromotionMoveSan,
  isPawnPromotion,
  validateMove,
} from './chessLogic';

describe('chess training logic', () => {
  const engineLines = [
    { move: 'Nf3', evaluation: { type: 'cp' as const, value: 60 } },
    { move: 'e4', evaluation: { type: 'cp' as const, value: 35 } },
    { move: 'd4', evaluation: { type: 'cp' as const, value: -15 } },
    { move: 'c4', evaluation: { type: 'cp' as const, value: 55 } },
  ];

  it('scores moves by evaluation loss instead of exact rank', () => {
    expect(calculateScore('Nf3', 'e4', ['Nf3', 'e4', 'd4'], engineLines)).toEqual({
      points: 100, beatGm: true, matchedGm: false, engineRank: 1, centipawnLoss: 0,
    });
    expect(calculateScore('e4', 'e4', ['Nf3', 'e4', 'd4'], engineLines)).toEqual({
      points: 90, beatGm: false, matchedGm: true, engineRank: 2, centipawnLoss: 25,
    });
  });

  it('rewards an equally strong fourth line and does not reward a poor source move', () => {
    expect(calculateScore('c4', 'e4', ['Nf3', 'e4', 'd4'], engineLines).points).toBe(100);
    expect(calculateScore('a3', 'a3', ['Nf3', 'e4', 'd4'], engineLines).points).toBe(0);
  });

  it('calculates loss from Black’s perspective', () => {
    const blackLines = [
      { move: '...Nf6', evaluation: { type: 'cp' as const, value: -120 } },
      { move: '...e6', evaluation: { type: 'cp' as const, value: -70 } },
    ];
    expect(calculateScore('...e6', '...Nf6', [], blackLines, 'b').centipawnLoss).toBe(50);
  });

  it('validates and converts legal moves', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(validateMove(start, 'e4')).toBe(true);
    expect(validateMove(start, 'e5')).toBe(false);
    expect(getMoveSan(start, 'e2', 'e4')).toBe('e4');
  });

  it('computes material balance from a FEN', () => {
    const noBlackQueen = 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(getMaterialBalance(noBlackQueen).diff).toBe(9);
  });

  it('formats Chessground arrow labels with the expected shape', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(getMoveShapes(start, { engineMove: 'e4', gmMove: 'd4' })).toEqual([
      { orig: 'e2', dest: 'e4', brush: 'green', label: { text: 'Engine #1' } },
      { orig: 'd2', dest: 'd4', brush: 'blue', label: { text: 'Played Move' } },
    ]);
  });

  it('detects promotions and preserves underpromotion SAN', () => {
    const promotion = '8/P7/8/8/8/8/7k/5K2 w - - 0 1';
    expect(isPawnPromotion(promotion, 'a7', 'a8')).toBe(true);
    expect(isPawnPromotion(promotion, 'a7', 'a6')).toBe(false);
    expect(getPromotionMoveSan(promotion, 'a7', 'a8', 'n')).toBe('a8=N');
  });
});
