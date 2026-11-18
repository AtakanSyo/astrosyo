// Test cases for the "Tests" popup on the Planet Size Comparison
// Calculator. These run the calculator's real bodies.js functions.

import { BODY_BY_KEY as B, compare, densityGcc, surfaceGravity, pairPage, bySize } from "./bodies";

export const SIZE_TEST_COLUMNS = [
  { key: "test", label: "Test" },
  { key: "inputs", label: "Inputs" },
  { key: "expected", label: "Expected" },
  { key: "computed", label: "Computed" },
  { key: "result", label: "Result" },
];

export const SIZE_TEST_SOURCES = [
  {
    title: "Where the numbers come from",
    text: "Mean radii and masses are from the NASA/JPL planetary and satellite fact sheets (Sun: IAU 2015 nominal radius). Expected values are the commonly quoted figures: about 1,321 Earths fit inside Jupiter by volume, about 49 Moons inside Earth, Earth's surface gravity is about 9.8 m/s² and its mean density 5.51 g/cm³, and Mars is about 1.39 times Mercury's diameter.",
  },
];

const close = (a, b, pct) => Number.isFinite(a) && Math.abs((a - b) / b) * 100 < pct;
const fmt = (n, d = 3) => (Number.isFinite(n) ? Number(n.toFixed(d)).toString() : String(n));

/** Computes the full Tests table for this calculator, live, on every call. */
export function getSizeTestRows() {
  const je = compare(B.jupiter, B.earth);
  const em = compare(B.earth, B.moon);
  const mm = compare(B.mars, B.mercury);
  const se = compare(B.sun, B.earth);
  return [
    { test: "Earths inside Jupiter (volume)", inputs: "Jupiter, Earth", expected: "≈ 1,321", computed: fmt(je.volume, 0), pass: close(je.volume, 1321, 0.5) },
    { test: "Jupiter's diameter in Earths", inputs: "Jupiter, Earth", expected: "≈ 10.97", computed: fmt(je.diameter, 2), pass: close(je.diameter, 10.97, 0.1) },
    { test: "Moons inside Earth (volume)", inputs: "Earth, Moon", expected: "≈ 49.3", computed: fmt(em.volume, 1), pass: close(em.volume, 49.3, 0.5) },
    { test: "Earths inside the Sun (volume)", inputs: "Sun, Earth", expected: "≈ 1.3 million", computed: fmt(se.volume, 0), pass: close(se.volume, 1.3e6, 1) },
    { test: "Mars vs Mercury diameter", inputs: "Mars, Mercury", expected: "≈ 1.39", computed: fmt(mm.diameter, 3), pass: close(mm.diameter, 1.389, 0.1) },
    { test: "Earth surface gravity", inputs: "R=6371 km, M=5.9722e24 kg", expected: "≈ 9.82 m/s²", computed: `${fmt(surfaceGravity(6371, 5.9722e24), 3)} m/s²`, pass: close(surfaceGravity(6371, 5.9722e24), 9.82, 0.2) },
    { test: "Earth mean density", inputs: "R=6371 km, M=5.9722e24 kg", expected: "5.51 g/cm³", computed: `${fmt(densityGcc(6371, 5.9722e24), 3)} g/cm³`, pass: close(densityGcc(6371, 5.9722e24), 5.514, 0.1) },
    { test: "Saturn is less dense than water", inputs: "Saturn", expected: "< 1 g/cm³", computed: `${fmt(densityGcc(B.saturn.radiusKm, B.saturn.massKg), 3)} g/cm³`, pass: densityGcc(B.saturn.radiusKm, B.saturn.massKg) < 1 },
    { test: "Largest first, either order", inputs: "Moon, Earth", expected: "Earth", computed: bySize(B.moon, B.earth)[0].name, pass: bySize(B.moon, B.earth)[0].key === "earth" },
    { test: "Pair page found in either order", inputs: "mercury, mars", expected: "/posts/mercury-mars-size-comparison", computed: String(pairPage("mercury", "mars")), pass: pairPage("mercury", "mars") === "/posts/mercury-mars-size-comparison" },
    { test: "Zero radius rejected", inputs: "R=0", expected: "null", computed: String(densityGcc(0, 1e24)), pass: densityGcc(0, 1e24) === null },
  ];
}
