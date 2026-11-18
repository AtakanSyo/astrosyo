import { describe, it, expect } from "vitest";
import { getSizeTestRows } from "./bodiesTests";

// Thin vitest wrapper around this calculator's reference-value test rows
// (the same data that powers its in-app "Tests" table).
describe("planet-size-comparison-calculator reference test rows", () => {
  const rows = getSizeTestRows();
  it("has reference test rows", () => expect(rows.length).toBeGreaterThan(0));
  it.each(rows)("$test", (row) => {
    expect(row.pass, `expected ${row.expected}, computed ${row.computed}`).toBe(true);
  });
});
