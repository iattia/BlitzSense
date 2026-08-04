import { describe, expect, it } from 'vitest';
import { seededShuffle, seedFromString } from './random';

describe('deterministic random helpers', () => {
  it('creates a stable seed from a challenge date', () => {
    expect(seedFromString('2026-08-02')).toBe(seedFromString('2026-08-02'));
    expect(seedFromString('2026-08-02')).not.toBe(seedFromString('2026-08-03'));
  });

  it('shuffles reproducibly without changing the source', () => {
    const source = [1, 2, 3, 4, 5, 6];
    const first = seededShuffle(source, 42);
    expect(first).toEqual(seededShuffle(source, 42));
    expect(first).not.toEqual(seededShuffle(source, 43));
    expect(source).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
