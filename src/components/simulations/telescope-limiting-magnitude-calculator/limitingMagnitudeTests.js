// Test cases for the "Tests" popup on the Telescope Limiting Magnitude
// Calculator. These run the calculator's real limitingMagnitude.js functions.

import {
  classicLimit,
  gainOverEye,
  lightGrasp,
  skyLimit,
  nelmForBortle,
  reachableTargets,
  apertureForMagnitude,
} from "./limitingMagnitude";

export const LIMITING_MAGNITUDE_TEST_COLUMNS = [
  { key: "test", label: "Test" },
  { key: "inputs", label: "Inputs" },
  { key: "expected", label: "Expected" },
  { key: "computed", label: "Computed" },
  { key: "result", label: "Result" },
];

export const LIMITING_MAGNITUDE_TEST_SOURCES = [
  {
    title: "Where the numbers come from",
    text: "The classic rule m = 2.5 + 5·log10(D in mm) is the same formula usually written as 7.5 + 5·log10(D in cm); both are checked. The sky-adjusted estimate adds the aperture's gain over the eye, 5·log10(D / eye pupil), to the naked-eye limiting magnitude. Bortle-class naked-eye limits are rounded values from John Bortle's 2001 Sky & Telescope scale. Expected values were worked by hand.",
  },
];

const TOL = 0.001; // magnitudes

function fmt(n, digits = 3) {
  if (!Number.isFinite(n)) return String(n);
  return Number(n.toFixed(digits)).toString();
}
const close = (a, b, tol = TOL) => Number.isFinite(a) && Math.abs(a - b) < tol;

function classicRows() {
  const cm = (D) => 7.5 + 5 * Math.log10(D / 10);
  return [
    { test: "Classic limit, 100 mm", inputs: "D=100 mm", expected: "12.5", computed: fmt(classicLimit(100)), pass: close(classicLimit(100), 12.5) },
    { test: "Classic limit, 8\" (203 mm)", inputs: "D=203 mm", expected: "14.04", computed: fmt(classicLimit(203), 2), pass: close(classicLimit(203), 14.0377, 0.001) },
    { test: "mm and cm forms agree", inputs: "D=254 mm", expected: fmt(cm(254)), computed: fmt(classicLimit(254)), pass: close(classicLimit(254), cm(254)) },
  ];
}

function skyRows() {
  return [
    { test: "Gain over a 7 mm eye, 70 mm scope", inputs: "D=70, pupil 7", expected: "5 mag", computed: `${fmt(gainOverEye(70, 7))} mag`, pass: close(gainOverEye(70, 7), 5) },
    { test: "Light grasp, 70 mm vs 7 mm eye", inputs: "D=70, pupil 7", expected: "100×", computed: `${fmt(lightGrasp(70, 7))}×`, pass: close(lightGrasp(70, 7), 100) },
    { test: "Sky-adjusted, 200 mm under NELM 6.0", inputs: "D=200, NELM 6.0, pupil 6.5", expected: "13.44", computed: fmt(skyLimit(200, 6.0, 6.5), 2), pass: close(skyLimit(200, 6.0, 6.5), 6 + 5 * Math.log10(200 / 6.5)) && close(skyLimit(200, 6.0, 6.5), 13.44, 0.01) },
    { test: "Bortle 5 naked-eye limit", inputs: "Bortle 5", expected: "5.8", computed: String(nelmForBortle(5)), pass: nelmForBortle(5) === 5.8 },
    { test: "Aperture needed to reach mag 14.4 (Pluto) from NELM 6.3, 7 mm pupil", inputs: "m=14.4, NELM 6.3, pupil 7", expected: "292 mm", computed: `${fmt(apertureForMagnitude(14.4, 6.3, 7), 0)} mm`, pass: close(apertureForMagnitude(14.4, 6.3, 7), 7 * 10 ** (8.1 / 5), 0.01) },
  ];
}

function targetRows() {
  const t = reachableTargets(12);
  const proxima = t.find((x) => x.name === "Proxima Centauri");
  const pluto = t.find((x) => x.name === "Pluto");
  return [
    { test: "Limit 12: Proxima Centauri reachable", inputs: "limit 12.0, mag 11.1", expected: "yes", computed: proxima.reachable ? "yes" : "no", pass: proxima.reachable === true },
    { test: "Limit 12: Pluto not reachable", inputs: "limit 12.0, mag 14.4", expected: "no", computed: pluto.reachable ? "yes" : "no", pass: pluto.reachable === false },
  ];
}

function edgeRows() {
  return [
    { test: "Zero aperture", inputs: "D=0", expected: "null", computed: String(classicLimit(0)), pass: classicLimit(0) === null },
    { test: "Missing sky brightness", inputs: "NELM = NaN", expected: "null", computed: String(skyLimit(200, NaN, 7)), pass: skyLimit(200, NaN, 7) === null },
  ];
}

/** Computes the full Tests table for this calculator, live, on every call. */
export function getLimitingMagnitudeTestRows() {
  return [...classicRows(), ...skyRows(), ...targetRows(), ...edgeRows()];
}
