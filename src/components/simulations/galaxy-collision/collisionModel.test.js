import { describe, expect, it } from 'vitest';
import { SCENARIOS, GALAXIES, integrateCores, buildStars, circularSpeed, KMS, DT } from './collisionModel.js';

const byKey = Object.fromEntries(SCENARIOS.map((s) => [s.key, integrateCores(s)]));

describe('Milky Way–Andromeda core orbits', () => {
  it('starts at Andromeda’s distance, approaching at ~110 km/s', () => {
    const { separation } = byKey.direct;
    expect(separation[0]).toBeCloseTo(785, 0);
    const closingKms = (separation[0] - separation[1]) / DT / KMS;
    expect(closingKms).toBeGreaterThan(105);
    expect(closingKms).toBeLessThan(115);
  });

  it('direct hit: first pass in ~4–4.5 Gyr, merger before ~6 Gyr', () => {
    const { firstPass, merger } = byKey.direct.events;
    expect(firstPass.time).toBeGreaterThan(4);
    expect(firstPass.time).toBeLessThan(4.6);
    expect(firstPass.distance).toBeLessThan(40);
    expect(merger.time).toBeLessThan(6);
  });

  it('close pass: wider first pass, merger later but within 10 Gyr', () => {
    const { firstPass, merger } = byKey.pass.events;
    expect(firstPass.distance).toBeGreaterThan(40);
    expect(firstPass.distance).toBeLessThan(100);
    expect(merger.time).toBeGreaterThan(byKey.direct.events.merger.time);
    expect(merger.time).toBeLessThan(10);
  });

  it('near miss: stays hundreds of kpc apart, no merger in 10 Gyr', () => {
    const { firstPass, merger } = byKey.miss.events;
    expect(firstPass.distance).toBeGreaterThan(300);
    expect(merger).toBeNull();
  });
});

describe('initial stars', () => {
  const { track } = byKey.direct;
  const stars = buildStars(4000, track);

  it('splits stars between the galaxies by share', () => {
    const mw = stars.galaxyOf.filter((g) => g === 0).length;
    expect(mw / 4000).toBeCloseTo(GALAXIES[0].share, 1);
  });

  it('places the Sun 8.2 kpc from the Milky Way centre on a circular orbit', () => {
    const i = stars.sunIndex;
    const p = stars.positions.slice(i * 4, i * 4 + 3);
    const r = Math.hypot(p[0] - track[0], p[1] - track[1], p[2] - track[2]);
    expect(r).toBeCloseTo(8.2, 3);
    const coreV = [0, 1, 2].map((k) => (track[6 + k] - track[k]) / DT);
    const v = stars.velocities.slice(i * 4, i * 4 + 3);
    const speedKms = Math.hypot(v[0] - coreV[0], v[1] - coreV[1], v[2] - coreV[2]) / KMS;
    const vc = circularSpeed(GALAXIES[0].mass, GALAXIES[0].scale, 8.2) / KMS;
    expect(speedKms).toBeCloseTo(vc, 3);
    expect(speedKms).toBeGreaterThan(150); // a sensible galactic orbital speed
  });
});
