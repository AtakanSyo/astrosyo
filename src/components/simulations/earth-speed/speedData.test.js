import { describe, expect, it } from 'vitest';
import {
  EQUATOR_SPEED,
  GALAXY_SPEED,
  GALACTIC_YEAR_MYR,
  KM_PER_AU,
  MILKY_WAY_CMB_DIRECTION,
  MILKY_WAY_CMB_SPEED,
  MOTIONS,
  SECONDS_PER_YEAR,
  formatDistance,
  formatSpeed,
  spinSpeedAt,
} from './speedData.js';

describe('Earth’s speeds', () => {
  it('spins at about 1,670 km/h at the equator, less towards the poles', () => {
    expect(EQUATOR_SPEED * 3600).toBeCloseTo(1674, 0);
    expect(spinSpeedAt(45) * 3600).toBeCloseTo(1184, 0);
    expect(spinSpeedAt(90)).toBeCloseTo(0, 10);
  });

  it('circles the galaxy with the Sun at about 248 km/s, once every ~200 million years', () => {
    expect(GALAXY_SPEED).toBeCloseTo(248.3, 1);
    expect(GALACTIC_YEAR_MYR).toBeGreaterThan(195);
    expect(GALACTIC_YEAR_MYR).toBeLessThan(210);
  });

  it('moves about 52 AU a year through the galaxy (the helix pitch)', () => {
    expect((GALAXY_SPEED * SECONDS_PER_YEAR) / KM_PER_AU).toBeCloseTo(52.4, 1);
  });

  it('gives the Milky Way about 560 km/s against the CMB, towards Hydra', () => {
    expect(MILKY_WAY_CMB_SPEED).toBeGreaterThan(550);
    expect(MILKY_WAY_CMB_SPEED).toBeLessThan(575);
    expect(MILKY_WAY_CMB_DIRECTION.l).toBeCloseTo(266, 0);
    expect(MILKY_WAY_CMB_DIRECTION.b).toBeCloseTo(28.5, 0);
  });

  it('lists the motions from slowest to fastest', () => {
    const speeds = MOTIONS.map((m) => m.speed);
    expect([...speeds].sort((a, b) => a - b)).toEqual(speeds);
  });

  it('formats speeds and distances', () => {
    expect(MOTIONS.map((m) => formatSpeed(m.speed, 'kmh'))).toEqual(['1,670 km/h', '107,200 km/h', '893,900 km/h', '2,025,100 km/h']);
    expect(formatSpeed(EQUATOR_SPEED, 'kms')).toBe('0.47 km/s');
    expect(formatSpeed(GALAXY_SPEED, 'kms')).toBe('248 km/s');
    expect(formatSpeed(29.78, 'mph')).toBe('66,600 mph');
    expect(formatDistance(12345678, 'kmh')).toBe('12.35 million km');
    expect(formatDistance(500, 'mph')).toBe('311 miles');
  });
});
