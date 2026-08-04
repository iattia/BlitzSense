import { describe, expect, it } from 'vitest';
import { parseUciInfoLine } from './localEngine';

describe('parseUciInfoLine', () => {
  it('keeps a White-to-move centipawn score in White perspective', () => {
    expect(parseUciInfoLine('info depth 14 multipv 1 score cp 83 pv e2e4 e7e5', 'w')).toEqual({
      move: 'e2e4',
      evaluation: { type: 'cp', value: 83 },
    });
  });

  it('inverts a Black-to-move score into White perspective', () => {
    expect(parseUciInfoLine('info depth 18 multipv 1 score cp 125 pv e7e5 g1f3', 'b')).toEqual({
      move: 'e7e5',
      evaluation: { type: 'cp', value: -125 },
    });
  });

  it('parses promotion moves and mate scores', () => {
    expect(parseUciInfoLine('info depth 20 score mate -3 pv a7a8q h2h1q', 'b')).toEqual({
      move: 'a7a8q',
      evaluation: { type: 'mate', value: 3 },
    });
  });

  it('ignores lines without a principal variation', () => {
    expect(parseUciInfoLine('info depth 10 score cp 0 nodes 1200', 'w')).toBeNull();
  });
});
