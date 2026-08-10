import { describe, expect, it } from 'vitest';
import { sessionRequestKey } from './usePositionSession';

describe('position session request identity', () => {
  it('treats reordered and differently-cased opening selections as the same request', () => {
    const first = sessionRequestKey('Medium', 10, 'rapid', ['Sicilian Defense', "Queen's Gambit"], 'black', { min: 1800, max: 2200 });
    const second = sessionRequestKey('Medium', 10, 'rapid', [" queen's gambit ", 'sicilian defense'], 'black', { min: 1800, max: 2200 });

    expect(first).toBe(second);
  });

  it('changes when any position-selection filter changes', () => {
    const base = sessionRequestKey('Medium', 10, 'rapid', [], 'random', { min: 2000, max: null });

    expect(sessionRequestKey('Medium', 10, 'blitz', [], 'random', { min: 2000, max: null })).not.toBe(base);
    expect(sessionRequestKey('Medium', 10, 'rapid', [], 'white', { min: 2000, max: null })).not.toBe(base);
    expect(sessionRequestKey('Medium', 10, 'rapid', [], 'random', { min: 2200, max: null })).not.toBe(base);
  });
});
