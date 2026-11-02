import { describe, expect, it } from "vitest";
import { packetCycles, photonColor, spectrumPosition, spectrumSegments, MIN_CYCLES, MAX_CYCLES } from "./planckRelation";
import { ENERGY_UNITS, energyJToFrequency, frequencyToEnergyJ, fromBase } from "../photon-energy-wavelength-frequency-converter/physics";
import { getPlanckRelationTestRows } from "./planckRelationTests";

describe("E = hν", () => {
  it("converts both ways", () => {
    expect(frequencyToEnergyJ(1)).toBeCloseTo(6.62607015e-34, 45);
    expect(fromBase(frequencyToEnergyJ(2.417989e14), ENERGY_UNITS, "eV")).toBeCloseTo(1, 4);
    expect(energyJToFrequency(frequencyToEnergyJ(5e14))).toBeCloseTo(5e14, -2);
  });

  it("passes every self-check shown on the page", () => {
    for (const row of getPlanckRelationTestRows()) expect(row.pass, row.test).toBe(true);
  });
});

describe("photon drawing", () => {
  it("packs more cycles into higher frequencies, within limits", () => {
    expect(packetCycles(1e6)).toBeLessThan(packetCycles(5e14));
    expect(packetCycles(5e14)).toBeLessThan(packetCycles(1e20));
    expect(packetCycles(1)).toBe(MIN_CYCLES);
    expect(packetCycles(1e30)).toBe(MAX_CYCLES);
  });

  it("clamps the spectrum position", () => {
    expect(spectrumPosition(1)).toBe(0);
    expect(spectrumPosition(1e14)).toBe(0.5);
    expect(spectrumPosition(1e30)).toBe(1);
  });

  it("uses the real colour for visible light and band colours elsewhere", () => {
    expect(photonColor(4.7e14)).toMatch(/^rgb\(255, /); // about 640 nm, red
    expect(photonColor(1e8)).toBe("#4fd0a0"); // radio
  });

  it("covers the whole bar with touching bands, radio first", () => {
    const s = spectrumSegments();
    expect(s[0]).toMatchObject({ name: "Radio", start: 0 });
    expect(s.at(-1)).toMatchObject({ name: "Gamma ray", end: 1 });
    s.slice(1).forEach((seg, i) => expect(seg.start).toBe(s[i].end));
  });
});
