import { describe, it, expect } from "vitest";
import {
  SYNODIC_PERIOD_DAYS,
  MARS_RATE,
  EARTH_RATE,
  angleDiff,
  apparentPosition,
  apparentRate,
  daysToOpposition,
  isRetrograde,
  longitudesAt,
  wrapAngle,
} from "./retrograde";

const DEG = Math.PI / 180;

describe("mars-retrograde", () => {
  it("wraps and differences angles", () => {
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 10);
    expect(angleDiff(10 * DEG, 350 * DEG)).toBeCloseTo(20 * DEG, 10);
    expect(angleDiff(350 * DEG, 10 * DEG)).toBeCloseTo(-20 * DEG, 10);
  });

  it("has Mars's real synodic period of about 780 days", () => {
    expect(SYNODIC_PERIOD_DAYS).toBeGreaterThan(775);
    expect(SYNODIC_PERIOD_DAYS).toBeLessThan(785);
  });

  it("is retrograde at opposition and prograde at conjunction", () => {
    expect(isRetrograde(100 * DEG, 100 * DEG)).toBe(true);
    expect(isRetrograde(100 * DEG, 280 * DEG)).toBe(false);
  });

  it("puts Mars opposite the Sun in the sky at opposition", () => {
    const { longitude } = apparentPosition(30 * DEG, 30 * DEG);
    expect(longitude).toBeCloseTo(30 * DEG, 2);
  });

  it("counts down to opposition and repeats every synodic period", () => {
    expect(daysToOpposition(50 * DEG, 50 * DEG)).toBeCloseTo(0, 10);
    const earth0 = 0;
    const mars0 = 40 * DEG;
    const days = daysToOpposition(earth0, mars0);
    const { earth, mars } = longitudesAt(days, earth0, mars0);
    expect(angleDiff(earth, mars)).toBeCloseTo(0, 8);
    expect(daysToOpposition(earth, mars + 1e-9)).toBeLessThan(1e-3);
  });

  it("stays retrograde for roughly 70–80 days each synodic period", () => {
    let retroDays = 0;
    for (let d = 0; d < SYNODIC_PERIOD_DAYS; d += 0.25) {
      if (apparentRate(EARTH_RATE * d, MARS_RATE * d + 3) < 0) retroDays += 0.25;
    }
    expect(retroDays).toBeGreaterThan(65);
    expect(retroDays).toBeLessThan(85);
  });

  it("keeps Mars within a few degrees of the ecliptic", () => {
    for (let d = 0; d < SYNODIC_PERIOD_DAYS * 3; d += 5) {
      const { latitude } = apparentPosition(EARTH_RATE * d, MARS_RATE * d + 1);
      expect(Math.abs(latitude)).toBeLessThan(7 * DEG);
    }
  });
});
