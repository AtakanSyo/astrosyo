import { describe as group, expect, it } from 'vitest';
import { BODIES, angularDiameterDeg, describe, formatDeg } from './skyData.js';

const byKey = Object.fromEntries(BODIES.map((b) => [b.key, describe(b)]));

group('planets at the Moon’s distance', () => {
  it('gives the Moon its familiar half degree', () => {
    expect(byKey.moon.deg).toBeCloseTo(0.518, 3);
  });

  it('lists bodies from smallest to largest in the sky', () => {
    const sizes = BODIES.map((b) => describe(b).deg);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });

  it('matches the facts the page states', () => {
    expect(byKey.mars.timesWider).toBeCloseTo(2, 0);
    expect(byKey.venus.timesWider).toBeCloseTo(3.5, 1);
    expect(byKey.neptune.timesWider).toBeCloseTo(14, 0);
    expect(byKey.neptune.timesArea).toBeCloseTo(200, -1);
    expect(byKey.uranus.timesWider).toBeCloseTo(15, 0);
    expect(byKey.saturn.deg).toBeCloseTo(17, 0);
    expect(byKey.saturn.ringDeg).toBeCloseTo(39, 0);
    expect(byKey.jupiter.deg).toBeCloseTo(21, 0);
    expect(byKey.jupiter.timesWider).toBeCloseTo(40, 0);
    expect(byKey.jupiter.timesArea).toBeCloseTo(1600, -2);
    expect(byKey.jupiter.timesTide).toBeCloseTo(25850, -2);
  });

  it('formats degrees', () => {
    expect(formatDeg(angularDiameterDeg(1737.4))).toBe('0.5°');
    expect(formatDeg(20.62)).toBe('21°');
  });
});
