import { describe, it, expect } from "vitest";
import { getComptonTestRows } from "./comptonTests";

describe("compton-scattering reference rows", () => {
  const rows = getComptonTestRows();
  it("has rows", () => expect(rows.length).toBeGreaterThan(0));
  it.each(rows)("$test", (row) => {
    expect(row.pass, `expected ${row.expected}, computed ${row.computed}`).toBe(true);
  });
});
