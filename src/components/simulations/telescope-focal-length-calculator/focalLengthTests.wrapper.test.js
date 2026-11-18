import { describe, it, expect } from "vitest";
import { getFocalLengthTestRows } from "./focalLengthTests";

// Thin vitest wrapper around this calculator's reference-value test rows
// (the same data that powers its in-app "Tests" table) — see
// focalLengthTests.js for the row definitions, sources, and tolerances.
describe("telescope-focal-length-calculator reference test rows", () => {
  const rows = getFocalLengthTestRows();

  it("has reference test rows", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows)("$test", (row) => {
    expect(row.pass, `expected ${row.expected}, computed ${row.computed}`).toBe(true);
  });
});
