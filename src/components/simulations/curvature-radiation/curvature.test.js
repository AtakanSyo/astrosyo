import { describe, it, expect } from "vitest";
import { criticalFrequency, power, radiationReactionGamma } from "./curvature";
import {
  criticalFrequency as syncCritical,
  power as syncPower,
  larmorRadius,
  hzToEv,
  E_CHARGE,
  C,
} from "../synchrotron-radiation/synchrotron";

const close = (a, b, pct) => Math.abs((a - b) / b) * 100 < pct;

describe("curvature radiation physics", () => {
  it("γ = 10⁷ on a 1000 km field line radiates up to about 7 × 10²² Hz", () => {
    expect(close(criticalFrequency(1e7, 1e6), 7.157e22, 0.1)).toBe(true);
  });

  it("that is a ~300 MeV gamma ray", () => {
    expect(close(hzToEv(criticalFrequency(1e7, 1e6)) / 1e6, 296, 0.5)).toBe(true);
  });

  it("matches synchrotron when ρ is the gyroradius (critical frequency)", () => {
    const gamma = 1e4;
    const B = 1; // gauss
    const rho = larmorRadius(gamma, B);
    expect(close(criticalFrequency(gamma, rho), syncCritical(gamma, B), 0.01)).toBe(true);
  });

  it("matches synchrotron when ρ is the gyroradius (power)", () => {
    const gamma = 1e4;
    const B = 1;
    const rho = larmorRadius(gamma, B);
    expect(close(power(gamma, rho), syncPower(gamma, B), 0.01)).toBe(true);
  });

  it("radiation-reaction γ balances losses against e E c", () => {
    const E = 1e8;
    const g = radiationReactionGamma(E, 1e6);
    expect(close(power(g, 1e6), E_CHARGE * E * C, 0.01)).toBe(true);
    expect(g).toBeGreaterThan(1e7);
    expect(g).toBeLessThan(3e7);
  });

  it("frequency scales as γ³ / ρ", () => {
    expect(close(criticalFrequency(2e7, 1e6) / criticalFrequency(1e7, 1e6), 8, 0.001)).toBe(true);
    expect(close(criticalFrequency(1e7, 1e6) / criticalFrequency(1e7, 1e7), 10, 0.001)).toBe(true);
  });
});
