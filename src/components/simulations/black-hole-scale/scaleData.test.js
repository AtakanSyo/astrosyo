import { describe, expect, it } from 'vitest';
import { OBJECTS, ORBITS, AU_KM, formatDistance } from './scaleData.js';

const byKey = Object.fromEntries(OBJECTS.map((o) => [o.key, o]));

describe('black hole scale data', () => {
  it('derives event horizons from r_s = 2GM/c²', () => {
    // Reference values: Sgr A* ≈ 12.7 million km, M87* ≈ 128 AU, TON 618 ≈ 800 AU.
    expect(byKey.sgra.radiusAu * AU_KM).toBeCloseTo(1.269e7, -5);
    expect(byKey.m87.radiusAu).toBeCloseTo(128.3, 0);
    expect(byKey.ton618.radiusAu).toBeGreaterThan(795);
    expect(byKey.ton618.radiusAu).toBeLessThan(810);
  });

  it('converts stellar radii to AU', () => {
    expect(byKey.sun.radiusAu).toBeCloseTo(0.00465, 5);
    expect(byKey.uyscuti.radiusAu).toBeCloseTo(4.23, 2);
    expect(byKey.st218.radiusAu).toBeCloseTo(8.56, 2);
  });

  it('lists objects from smallest to largest', () => {
    const radii = OBJECTS.map((o) => o.radiusAu);
    expect([...radii].sort((a, b) => a - b)).toEqual(radii);
  });

  it('matches the facts the page states', () => {
    const orbit = (name) => ORBITS.find((o) => o.name === name).au;
    expect(byKey.sgra.radiusAu).toBeLessThan(orbit('Mercury'));
    expect(byKey.uyscuti.radiusAu).toBeGreaterThan(orbit('Mars'));
    expect(byKey.uyscuti.radiusAu).toBeLessThan(orbit('Jupiter'));
    expect(byKey.st218.radiusAu).toBeGreaterThan(orbit('Jupiter'));
    expect(byKey.st218.radiusAu).toBeLessThan(orbit('Saturn'));
    expect(byKey.m87.radiusAu / orbit('Neptune')).toBeCloseTo(4.3, 0);
    expect(byKey.ton618.radiusAu / orbit('Neptune')).toBeCloseTo(26.7, 0);
    expect(byKey.ton618.radiusAu).toBeGreaterThan(orbit('Voyager 1 (2026)'));
  });

  it('formats distances in km or AU', () => {
    expect(formatDistance(byKey.sun.radiusAu)).toBe('695,700 km');
    expect(formatDistance(byKey.sgra.radiusAu)).toBe('0.08 AU');
    expect(formatDistance(byKey.ton618.radiusAu)).toBe('803 AU');
  });
});
