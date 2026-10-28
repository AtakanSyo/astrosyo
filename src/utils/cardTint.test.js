import { describe, expect, it } from 'vitest';
import { cardTint } from './cardTint.js';

describe('cardTint', () => {
  it('turns a post colour into an rgb() tint', () => {
    expect(cardTint('rgba(18, 92, 102, 1)')).toBe('rgb(18, 92, 102)');
    expect(cardTint(' rgb(4,4,8) ')).toBe('rgb(4, 4, 8)');
  });

  it('ignores missing or unexpected values', () => {
    expect(cardTint(undefined)).toBeNull();
    expect(cardTint('#125c66')).toBeNull();
    expect(cardTint('rgba(300, 0, 0, 1)')).toBeNull();
  });
});
