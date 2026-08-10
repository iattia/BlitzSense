import { describe, expect, it } from 'vitest';
import { randomShuffle, seededShuffle, seedFromString } from './random';

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

  it('uses Fisher-Yates for unbiased session shuffling', () => {
    const source = [1, 2, 3, 4];
    const values = [0.5, 0, 0.75];
    let index = 0;

    expect(randomShuffle(source, () => values[index++])).toEqual([4, 2, 1, 3]);
    expect(source).toEqual([1, 2, 3, 4]);
  });
});
