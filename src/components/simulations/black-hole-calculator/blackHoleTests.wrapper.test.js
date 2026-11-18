import { describe, it, expect } from "vitest";
import { getBlackHoleTestRows } from "./blackHoleTests";

// Thin vitest wrapper around this calculator's reference-value test rows
// (the same data that powers its in-app "Tests" table).
describe("black-hole-calculator reference test rows", () => {
  const rows = getBlackHoleTestRows();
  it("has reference test rows", () => expect(rows.length).toBeGreaterThan(0));
  it.each(rows)("$test", (row) => {
    expect(row.pass, `expected ${row.expected}, computed ${row.computed}`).toBe(true);
  });
});
