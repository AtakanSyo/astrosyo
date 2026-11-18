// Test cases for the "Tests" popup on the Telescope Focal Length & Focal
// Ratio Calculator. These run the calculator's real focalLength.js
// functions. See telescope-magnification-calculator's
// telescopeMagnificationTests.js for the pattern this follows.

import { focalRatio, focalLengthFrom, apertureFrom, withMultiplier, classifySpeed, solve } from "./focalLength";

export const FOCAL_LENGTH_TEST_COLUMNS = [
  { key: "test", label: "Test" },
  { key: "inputs", label: "Inputs" },
  { key: "expected", label: "Expected" },
  { key: "computed", label: "Computed" },
  { key: "result", label: "Result" },
];

export const FOCAL_LENGTH_TEST_SOURCES = [
  {
    title: "Where the numbers come from",
    text: "Apertures, focal lengths and focal ratios are the manufacturers' published specs: the Sky-Watcher 8\" Dobsonian (203 mm, 1200 mm, f/5.9), the Celestron C8 Schmidt-Cassegrain (203 mm, 2032 mm, f/10) and the Celestron NexStar 90 SLT Maksutov (90 mm, 1250 mm, f/14). Celestron's f/6.3 reducer for the C8 is a 0.63× reducer. The fast/medium/slow bands (below f/5, f/5–f/8, above f/8) are a rule of thumb, not a standard.",
  },
];

const TOLERANCE_PCT = 0.5;

function percentDiff(a, b) {
  if (b === 0) return a === 0 ? 0 : Infinity;
  return Math.abs((a - b) / b) * 100;
}
function fmt(n, digits = 3) {
  if (!Number.isFinite(n)) return String(n);
  return Number(n.toFixed(digits)).toString();
}

function realScopeRows() {
  const dob = focalRatio(1200, 203);
  const c8 = focalRatio(2032, 203);
  const mak = focalRatio(1250, 90);
  const reduced = withMultiplier(2032, 203, 0.63);
  return [
    {
      test: "Sky-Watcher 8\" Dobsonian focal ratio",
      inputs: "F=1200 mm, D=203 mm",
      expected: "f/5.9",
      computed: `f/${fmt(dob, 2)}`,
      pass: percentDiff(dob, 5.9) < 1,
    },
    {
      test: "Celestron C8 focal ratio",
      inputs: "F=2032 mm, D=203 mm",
      expected: "f/10",
      computed: `f/${fmt(c8, 2)}`,
      pass: percentDiff(c8, 10) < TOLERANCE_PCT,
    },
    {
      test: "NexStar 90 SLT focal ratio",
      inputs: "F=1250 mm, D=90 mm",
      expected: "f/13.9",
      computed: `f/${fmt(mak, 2)}`,
      pass: percentDiff(mak, 13.9) < TOLERANCE_PCT,
    },
    {
      test: "C8 with a 0.63× reducer becomes f/6.3",
      inputs: "F=2032 mm, D=203 mm, factor 0.63",
      expected: "1280 mm, f/6.3",
      computed: `${fmt(reduced.F, 0)} mm, f/${fmt(reduced.N, 2)}`,
      pass: percentDiff(reduced.F, 1280) < TOLERANCE_PCT && percentDiff(reduced.N, 6.3) < TOLERANCE_PCT,
    },
  ];
}

function solverRows() {
  const fromDN = solve("F", { D: 254, N: 4.7 });
  const fromFN = solve("D", { F: 1250, N: 5 });
  const barlow = withMultiplier(1200, 203, 2);
  return [
    {
      test: "Focal length from aperture and ratio",
      inputs: "D=254 mm, N=4.7",
      expected: "1193.8 mm",
      computed: `${fmt(fromDN.F, 1)} mm`,
      pass: percentDiff(fromDN.F, 1193.8) < TOLERANCE_PCT,
    },
    {
      test: "Aperture from focal length and ratio",
      inputs: "F=1250 mm, N=5",
      expected: "250 mm",
      computed: `${fmt(fromFN.D, 1)} mm`,
      pass: percentDiff(fromFN.D, 250) < TOLERANCE_PCT,
    },
    {
      test: "2× Barlow doubles focal length and ratio",
      inputs: "F=1200 mm, D=203 mm, factor 2",
      expected: "2400 mm, f/11.82",
      computed: `${fmt(barlow.F, 0)} mm, f/${fmt(barlow.N, 2)}`,
      pass: percentDiff(barlow.F, 2400) < TOLERANCE_PCT && percentDiff(barlow.N, 2400 / 203) < TOLERANCE_PCT,
    },
    {
      test: "Round trip: N from F and D, then F from D and N",
      inputs: "F=900 mm, D=114 mm",
      expected: "900 mm",
      computed: `${fmt(focalLengthFrom(114, focalRatio(900, 114)), 3)} mm`,
      pass: percentDiff(focalLengthFrom(114, focalRatio(900, 114)), 900) < 0.001,
    },
  ];
}

function speedRows() {
  return [
    { test: "f/4 is fast", inputs: "N=4", expected: "fast", computed: classifySpeed(4), pass: classifySpeed(4) === "fast" },
    { test: "f/6 is medium", inputs: "N=6", expected: "medium", computed: classifySpeed(6), pass: classifySpeed(6) === "medium" },
    { test: "f/10 is slow", inputs: "N=10", expected: "slow", computed: classifySpeed(10), pass: classifySpeed(10) === "slow" },
  ];
}

function edgeRows() {
  return [
    {
      test: "Zero aperture",
      inputs: "F=1000 mm, D=0",
      expected: "null",
      computed: String(focalRatio(1000, 0)),
      pass: focalRatio(1000, 0) === null,
    },
    {
      test: "Negative focal ratio",
      inputs: "F=1000 mm, N=-5",
      expected: "null",
      computed: String(apertureFrom(1000, -5)),
      pass: apertureFrom(1000, -5) === null,
    },
    {
      test: "Unknown solve target",
      inputs: "solveFor=\"X\"",
      expected: "null",
      computed: String(solve("X", { F: 1000, D: 100, N: 10 })),
      pass: solve("X", { F: 1000, D: 100, N: 10 }) === null,
    },
  ];
}

/** Computes the full Tests table for this calculator, live, on every call. */
export function getFocalLengthTestRows() {
  return [...realScopeRows(), ...solverRows(), ...speedRows(), ...edgeRows()];
}
