import { describe, expect, it } from 'vitest';
import { OBJECTS, NEUTRON_STAR, MANHATTAN_KM, formatKm, neutronStarFacts } from './scaleData.js';

const byKey = Object.fromEntries(OBJECTS.map((o) => [o.key, o]));
const ns = NEUTRON_STAR.radiusKm;

describe('neutron star scale data', () => {
  it('lists objects from smallest to largest', () => {
    const radii = OBJECTS.map((o) => o.radiusKm);
    expect([...radii].sort((a, b) => a - b)).toEqual(radii);
  });

  it('derives event horizons from r_s = 2GM/c²', () => {
    expect(byKey.cygx1.radiusKm).toBeCloseTo(62.6, 0);
    expect(neutronStarFacts().sameMassBlackHoleKm).toBeCloseTo(4.1, 1);
  });

  it('matches the facts the page states', () => {
    expect(2 * ns).toBeGreaterThan(MANHATTAN_KM);
    expect(byKey.cygx1.radiusKm / ns).toBeCloseTo(5.2, 0);
    expect(byKey.moon.radiusKm / ns).toBeCloseTo(145, -1);
    expect(byKey.siriusb.radiusKm).toBeCloseTo(5635, -1);
    expect(byKey.siriusb.radiusKm / ns).toBeGreaterThan(450);
    expect(byKey.siriusb.radiusKm / ns).toBeLessThan(500);
    expect(byKey.earth.radiusKm / ns).toBeCloseTo(531, -1);
    expect(byKey.sun.radiusKm / ns).toBeCloseTo(58000, -3);
    // 1.4 M☉ in Earth masses (M☉ / M⊕ ≈ 332,950).
    expect((1.4 * 332950) / 1e3).toBeCloseTo(466, 0);
  });

  it('gives the neutron star’s density, gravity and escape speed', () => {
    const f = neutronStarFacts();
    expect(f.density).toBeGreaterThan(3e17);
    expect(f.density).toBeLessThan(5e17);
    expect(f.teaspoonTonnes / 1e9).toBeCloseTo(1.9, 0); // about 2 billion tonnes
    expect(f.surfaceGravityG / 1e11).toBeCloseTo(1.3, 1);
    expect(f.escapeFractionC).toBeCloseTo(0.59, 2);
  });

  it('formats km', () => {
    expect(formatKm(12)).toBe('12 km');
    expect(formatKm(62.64)).toBe('62.6 km');
    expect(formatKm(6371)).toBe('6,371 km');
    expect(formatKm(695700)).toBe('695,700 km');
  });
});
