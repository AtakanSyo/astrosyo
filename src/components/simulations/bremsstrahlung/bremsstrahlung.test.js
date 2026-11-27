import { describe, it, expect } from "vitest";
import {
  electron,
  b0,
  deflection,
  closestApproach,
  photonEnergy,
  duaneHunt,
  tubeEfficiency,
  emissivity,
  coolingTime,
  spectrum,
  yearsFromSeconds,
  band,
  K_B_EV,
} from "./bremsstrahlung";

const close = (a, b, pct) => Math.abs((a - b) / b) * 100 < pct;

describe("Bremsstrahlung physics", () => {
  it("a 511 keV electron has γ = 2 and β = √3/2", () => {
    const e = electron(510998.95);
    expect(close(e.gamma, 2, 1e-6)).toBe(true);
    expect(close(e.beta, Math.sqrt(3) / 2, 1e-6)).toBe(true);
  });

  it("b₀ for a slow electron is Z e²/(4πε₀) / (2K)", () => {
    // non-relativistic: γ m v² ≈ 2K
    expect(close(b0(100, 1), 1.43996448e-9 / 200, 0.1)).toBe(true);
  });

  it("passing at b = b₀ bends the electron through 90°", () => {
    expect(close(deflection(1), Math.PI / 2, 1e-9)).toBe(true);
  });

  it("the attraction pulls the electron closer than its impact parameter", () => {
    expect(closestApproach(1, 1)).toBeLessThan(1);
    expect(close(closestApproach(1, 1), Math.SQRT2 - 1, 1e-9)).toBe(true);
  });

  it("no photon carries more than the electron's kinetic energy", () => {
    expect(photonEnergy(70e3, 74, 1e-13)).toBeLessThanOrEqual(70e3);
  });

  it("closer passes make harder photons", () => {
    // a 20 keV electron passing 50 pm away vs 5 pm away
    expect(photonEnergy(20e3, 1, 5e-12)).toBeGreaterThan(photonEnergy(20e3, 1, 50e-12));
    expect(close(photonEnergy(20e3, 1, 50e-12), 1.09e3, 2)).toBe(true);
  });

  it("a 70 kV X-ray tube's shortest wavelength is about 0.018 nm", () => {
    expect(close(duaneHunt(70e3), 1.771e-11, 0.1)).toBe(true);
  });

  it("a tungsten tube at 100 kV turns well under 1% of the beam into X-rays", () => {
    const eta = tubeEfficiency(74, 100e3);
    expect(eta).toBeGreaterThan(0.004);
    expect(eta).toBeLessThan(0.01);
  });

  it("the spectrum ν ε_ν peaks at E = kT", () => {
    const T = 1e7;
    const kT = K_B_EV * T;
    expect(close(spectrum(kT, T), 1, 1e-9)).toBe(true);
    expect(spectrum(0.5 * kT, T)).toBeLessThan(1);
    expect(spectrum(2 * kT, T)).toBeLessThan(1);
  });

  it("emissivity grows as √T and as density squared", () => {
    expect(close(emissivity(4e6, 1) / emissivity(1e6, 1), 2, 1e-9)).toBe(true);
    expect(close(emissivity(1e6, 10) / emissivity(1e6, 1), 100, 1e-9)).toBe(true);
  });

  it("galaxy-cluster gas takes longer than the age of the universe to cool", () => {
    // ~7 × 10⁷ K, ~10³ electrons per m³ (10⁻³ per cm³)
    expect(yearsFromSeconds(coolingTime(7e7, 1e3))).toBeGreaterThan(1.4e10);
  });

  it("names the right parts of the spectrum", () => {
    expect(band(2)).toBe("visible light");
    expect(band(10e3)).toBe("X-rays");
    expect(band(1e-5)).toBe("radio");
  });
});
