import { describe, it, expect } from "vitest";
import { getPixelScaleTestRows } from "./pixelScaleTests";

// Thin vitest wrapper around this calculator's reference-value test rows
// (the same data that powers its in-app "Tests" table).
describe("astrophotography-pixel-scale-calculator reference test rows", () => {
  const rows = getPixelScaleTestRows();
  it("has reference test rows", () => expect(rows.length).toBeGreaterThan(0));
  it.each(rows)("$test", (row) => {
    expect(row.pass, `expected ${row.expected}, computed ${row.computed}`).toBe(true);
  });
});
