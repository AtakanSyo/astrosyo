import { describe, expect, it } from 'vitest';
import { scoreTier } from './scoreTier.js';

describe('scoreTier', () => {
  it('fills the ring in proportion to the score', () => {
    expect(scoreTier('9.6')).toMatchObject({ text: '9.6', fill: 0.96, tier: 'top' });
    expect(scoreTier(6)).toMatchObject({ text: '6.0', fill: 0.6, tier: 'good' });
  });

  it('puts scores in colour tiers', () => {
    expect(scoreTier(9).tier).toBe('top');
    expect(scoreTier(8.9).tier).toBe('great');
    expect(scoreTier(8).tier).toBe('great');
    expect(scoreTier(7.9).tier).toBe('good');
    expect(scoreTier(5.9).tier).toBe('low');
  });

  it('treats missing or out-of-range scores as unrated', () => {
    for (const v of ['N/A', undefined, '', 11, -1]) {
      expect(scoreTier(v)).toMatchObject({ text: null, fill: 0, tier: 'none' });
    }
  });
});
