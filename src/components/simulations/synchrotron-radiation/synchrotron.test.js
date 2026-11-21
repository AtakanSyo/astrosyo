import { describe, it, expect } from "vitest";
import {
  gyroFrequency,
  criticalFrequency,
  synchrotronF,
  PEAK_X,
  larmorRadius,
  coolingTime,
  hzToEv,
  yearsFromSeconds,
} from "./synchrotron";

const close = (a, b, pct) => Math.abs((a - b) / b) * 100 < pct;

describe("synchrotron physics", () => {
  it("gyrofrequency is 2.8 MHz per gauss", () => {
    expect(close(gyroFrequency(1), 2.799e6, 0.1)).toBe(true);
  });

  it("GeV electron in the Milky Way's 5 µG field radiates near 2 GHz", () => {
    expect(close(criticalFrequency(1e4, 5e-6), 2.099e9, 0.2)).toBe(true);
  });

  it("matches the accelerator rule E_c[keV] = 0.665 E²[GeV] B[T]", () => {
    const gamma = 6e9 / 510998.95;
    const ec = hzToEv(criticalFrequency(gamma, 8500)) / 1e3;
    expect(close(ec, 0.665 * 36 * 0.85, 0.5)).toBe(true);
  });

  it("F(x) peaks near x = 0.29 at about 0.918", () => {
    let best = 0;
    let bestX = 0;
    for (let x = 0.1; x < 0.6; x += 0.0005) {
      const f = synchrotronF(x);
      if (f > best) {
        best = f;
        bestX = x;
      }
    }
    expect(Math.abs(bestX - PEAK_X)).toBeLessThan(0.01);
    expect(close(best, 0.918, 1)).toBe(true);
  });

  it("F(1) ≈ 0.655 and F(0.1) ≈ 0.818", () => {
    expect(close(synchrotronF(1), 0.655, 1)).toBe(true);
    expect(close(synchrotronF(0.1), 0.818, 1)).toBe(true);
  });

  it("pitch-averaged cooling time is 7.7e8 / (B² γ) seconds", () => {
    const avgPitch = Math.asin(Math.sqrt(2 / 3)); // sin²α averaged over directions is 2/3
    expect(close(coolingTime(1e4, 1, avgPitch), 7.74e8 / 1e4, 0.5)).toBe(true);
  });

  it("Crab Nebula X-ray electrons cool in under a century", () => {
    const avgPitch = Math.asin(Math.sqrt(2 / 3));
    const yr = yearsFromSeconds(coolingTime(2e7, 1.25e-4, avgPitch));
    expect(yr).toBeGreaterThan(60);
    expect(yr).toBeLessThan(100);
  });

  it("GeV electron in 5 µG circles at about 0.2 AU", () => {
    expect(close(larmorRadius(1e4, 5e-6), 3.41e10, 0.5)).toBe(true);
  });
});
