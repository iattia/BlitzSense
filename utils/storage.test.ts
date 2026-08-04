import { describe, expect, it } from 'vitest';
import { mergeProfileState } from './storage';

describe('account state merging', () => {
  it('keeps the best achievements from device and cloud', () => {
    const merged = mergeProfileState(
      { blitzsense_total_games: '12', blitzsense_hs_Hard_10: '400' },
      { blitzsense_total_games: '8', blitzsense_hs_Hard_10: '600' },
    );
    expect(merged.blitzsense_total_games).toBe('12');
    expect(merged.blitzsense_hs_Hard_10).toBe('600');
  });

  it('unions bookmarked positions by FEN', () => {
    const first = { fen: 'fen-a', savedAt: '2026-01-01' };
    const second = { fen: 'fen-b', savedAt: '2026-01-02' };
    const merged = mergeProfileState(
      { blitzsense_bookmarks: JSON.stringify([first]) },
      { blitzsense_bookmarks: JSON.stringify([second]) },
    );
    expect(JSON.parse(merged.blitzsense_bookmarks)).toEqual(expect.arrayContaining([first, second]));
  });
});
