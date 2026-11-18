import { describe, it, expect } from "vitest";
import { getLimitingMagnitudeTestRows } from "./limitingMagnitudeTests";

// Thin vitest wrapper around this calculator's reference-value test rows
// (the same data that powers its in-app "Tests" table) — see
// limitingMagnitudeTests.js for the row definitions, sources, and tolerances.
describe("telescope-limiting-magnitude-calculator reference test rows", () => {
  const rows = getLimitingMagnitudeTestRows();

  it("has reference test rows", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows)("$test", (row) => {
    expect(row.pass, `expected ${row.expected}, computed ${row.computed}`).toBe(true);
  });
});
