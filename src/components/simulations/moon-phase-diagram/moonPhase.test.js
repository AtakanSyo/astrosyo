import { describe, it, expect } from "vitest";
import {
  SYNODIC_MONTH_DAYS,
  normalizeDeg,
  illuminatedFraction,
  daysIntoCycle,
  phaseName,
} from "./moonPhase";

describe("moon-phase-diagram", () => {
  it("wraps angles into 0–360", () => {
    expect(normalizeDeg(370)).toBeCloseTo(10, 10);
    expect(normalizeDeg(-90)).toBeCloseTo(270, 10);
    expect(normalizeDeg(720)).toBeCloseTo(0, 10);
  });

  it("gives 0% lit at new moon, 50% at the quarters and 100% at full moon", () => {
    expect(illuminatedFraction(0)).toBeCloseTo(0, 10);
    expect(illuminatedFraction(90)).toBeCloseTo(0.5, 10);
    expect(illuminatedFraction(180)).toBeCloseTo(1, 10);
    expect(illuminatedFraction(270)).toBeCloseTo(0.5, 10);
  });

  it("is symmetric between the waxing and waning halves of the cycle", () => {
    for (const deg of [20, 45, 110, 160]) {
      expect(illuminatedFraction(deg)).toBeCloseTo(illuminatedFraction(360 - deg), 10);
    }
  });

  it("maps a full turn onto one synodic month", () => {
    expect(daysIntoCycle(0)).toBeCloseTo(0, 10);
    expect(daysIntoCycle(90)).toBeCloseTo(SYNODIC_MONTH_DAYS / 4, 10);
    expect(daysIntoCycle(180)).toBeCloseTo(SYNODIC_MONTH_DAYS / 2, 10);
  });

  it("names the four principal phases at their alignments", () => {
    expect(phaseName(0)).toBe("New Moon");
    expect(phaseName(358)).toBe("New Moon");
    expect(phaseName(90)).toBe("First Quarter");
    expect(phaseName(180)).toBe("Full Moon");
    expect(phaseName(270)).toBe("Last Quarter");
  });

  it("names the four in-between phases in order", () => {
    expect(phaseName(45)).toBe("Waxing Crescent");
    expect(phaseName(135)).toBe("Waxing Gibbous");
    expect(phaseName(225)).toBe("Waning Gibbous");
    expect(phaseName(315)).toBe("Waning Crescent");
  });
});
