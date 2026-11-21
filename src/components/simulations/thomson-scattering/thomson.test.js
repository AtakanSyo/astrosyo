import { describe, it, expect } from "vitest";
import { SIGMA_T, R_E, ME_OVER_MP, pattern, polarization, meanFreePath, opticalDepth, escapeTime, yearsFromSeconds } from "./thomson";

const close = (a, b, pct) => Math.abs((a - b) / b) * 100 < pct;
const deg = (d) => (d * Math.PI) / 180;

describe("Thomson scattering physics", () => {
  it("σ_T = (8π/3) r_e²", () => {
    expect(close((8 * Math.PI * R_E * R_E) / 3, SIGMA_T, 0.001)).toBe(true);
  });

  it("unpolarized light: half as bright at 90° as straight ahead, and fully polarized", () => {
    expect(close(pattern(deg(90), "unpol"), 0.5, 0.001)).toBe(true);
    expect(close(polarization(deg(90), "unpol"), 1, 0.001)).toBe(true);
  });

  it("forward and backward scattering are equally bright and unpolarized", () => {
    expect(close(pattern(Math.PI, "unpol"), pattern(0, "unpol"), 0.001)).toBe(true);
    expect(polarization(0, "unpol")).toBeLessThan(1e-12);
  });

  it("an electron shaken in the plane sends no light along its motion (90°)", () => {
    expect(pattern(deg(90), "in")).toBeLessThan(1e-12);
  });

  it("a proton scatters (mₑ/mₚ)² ≈ 1/3.4 million as much", () => {
    expect(close(1 / ME_OVER_MP ** 2, 3.37e6, 0.2)).toBe(true);
  });

  it("solar-core electron density gives a mean free path near a quarter millimetre", () => {
    expect(close(meanFreePath(6e31), 2.5e-4, 1)).toBe(true);
  });

  it("random walk out of the Sun at that density takes around 200,000 years", () => {
    const yr = yearsFromSeconds(escapeTime(6e31, 6.96e8));
    expect(yr).toBeGreaterThan(1e5);
    expect(yr).toBeLessThan(3e5);
  });

  it("the corona is almost transparent", () => {
    expect(opticalDepth(1e15, 6.96e8)).toBeLessThan(1e-4);
  });
});
