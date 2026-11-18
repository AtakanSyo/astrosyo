// Test cases for the "Tests" popup on the Exit Pupil Calculator. These run
// the calculator's real exitPupil.js functions. See
// telescope-magnification-calculator's telescopeMagnificationTests.js for
// the pattern this follows.

import {
  magnification,
  exitPupilMm,
  eyePupilForAge,
  eyepieceForExitPupil,
  effectiveAperture,
  classifyExitPupil,
  eyepieceTable,
} from "./exitPupil";

export const EXIT_PUPIL_TEST_COLUMNS = [
  { key: "test", label: "Test" },
  { key: "inputs", label: "Inputs" },
  { key: "expected", label: "Expected" },
  { key: "computed", label: "Computed" },
  { key: "result", label: "Result" },
];

export const EXIT_PUPIL_TEST_SOURCES = [
  {
    title: "Where the numbers come from",
    text: "Exit pupil = aperture / magnification = eyepiece focal length / focal ratio; both forms are checked against each other. The scope is a Sky-Watcher 8\" Dobsonian (203 mm, 1200 mm). The eye-pupil-by-age values follow the common rule of thumb of about 7 mm at age 20, shrinking about half a millimetre per decade; real eyes vary by a millimetre or more, which is why the calculator lets you enter your own. The use bands are rounded observing-guide advice, not a standard.",
  },
];

const TOLERANCE_PCT = 0.01;

function percentDiff(a, b) {
  if (b === 0) return a === 0 ? 0 : Infinity;
  return Math.abs((a - b) / b) * 100;
}
function fmt(n, digits = 3) {
  if (!Number.isFinite(n)) return String(n);
  return Number(n.toFixed(digits)).toString();
}

function formulaRows() {
  const D = 203;
  const F = 1200;
  const f = 25;
  const M = magnification(F, f);
  const viaM = exitPupilMm(D, M);
  const viaN = f / (F / D);
  return [
    {
      test: "8\" Dobsonian + 25 mm eyepiece: magnification",
      inputs: `F=${F} mm, f=${f} mm`,
      expected: "48×",
      computed: `${fmt(M, 2)}×`,
      pass: percentDiff(M, 48) < TOLERANCE_PCT,
    },
    {
      test: "Exit pupil via D/M equals f/N",
      inputs: `D=${D}, M=${fmt(M, 1)}; f=${f}, N=${fmt(F / D, 3)}`,
      expected: `${fmt(viaN, 3)} mm`,
      computed: `${fmt(viaM, 3)} mm`,
      pass: percentDiff(viaM, viaN) < TOLERANCE_PCT,
    },
    {
      test: "Eyepiece for a 7 mm exit pupil at f/5.91",
      inputs: `exit pupil 7 mm, N=${fmt(F / D, 3)}`,
      expected: `${fmt(7 * (F / D), 2)} mm`,
      computed: `${fmt(eyepieceForExitPupil(7, F / D), 2)} mm`,
      pass: percentDiff(eyepieceForExitPupil(7, F / D), 7 * (F / D)) < TOLERANCE_PCT,
    },
    {
      test: "Effective aperture when the exit pupil is too wide",
      inputs: "80 mm f/5 + 40 mm eyepiece (M=10×, exit pupil 8 mm), eye 7 mm",
      expected: "70 mm",
      computed: `${fmt(effectiveAperture(80, 10, 7), 2)} mm`,
      pass: percentDiff(effectiveAperture(80, 10, 7), 70) < TOLERANCE_PCT,
    },
  ];
}

function eyeRows() {
  return [
    { test: "Eye pupil at age 20", inputs: "age 20", expected: "7 mm", computed: `${fmt(eyePupilForAge(20), 2)} mm`, pass: percentDiff(eyePupilForAge(20), 7) < TOLERANCE_PCT },
    { test: "Eye pupil at age 60", inputs: "age 60", expected: "5 mm", computed: `${fmt(eyePupilForAge(60), 2)} mm`, pass: percentDiff(eyePupilForAge(60), 5) < TOLERANCE_PCT },
    { test: "Eye pupil never below 3 mm", inputs: "age 120", expected: "3 mm", computed: `${fmt(eyePupilForAge(120), 2)} mm`, pass: eyePupilForAge(120) === 3 },
  ];
}

function bandRows() {
  return [
    { test: "8 mm with a 7 mm eye: wasted light", inputs: "8 mm, eye 7 mm", expected: "wasted", computed: classifyExitPupil(8, 7)?.key, pass: classifyExitPupil(8, 7)?.key === "wasted" },
    { test: "4.2 mm: deep-sky", inputs: "4.2 mm, eye 7 mm", expected: "deepsky", computed: classifyExitPupil(4.2, 7)?.key, pass: classifyExitPupil(4.2, 7)?.key === "deepsky" },
    { test: "1.5 mm: planetary", inputs: "1.5 mm, eye 7 mm", expected: "planetary", computed: classifyExitPupil(1.5, 7)?.key, pass: classifyExitPupil(1.5, 7)?.key === "planetary" },
    { test: "0.3 mm: empty magnification", inputs: "0.3 mm, eye 7 mm", expected: "empty", computed: classifyExitPupil(0.3, 7)?.key, pass: classifyExitPupil(0.3, 7)?.key === "empty" },
  ];
}

function tableRows() {
  const rows = eyepieceTable(203, 1200, 6);
  const first = rows[0];
  return [
    {
      test: "Eyepiece table starts at the eye's own pupil",
      inputs: "203 mm, 1200 mm, eye 6 mm",
      expected: "6 mm → 35.5 mm eyepiece, 33.8×",
      computed: `${fmt(first.exitPupil, 2)} mm → ${fmt(first.eyepiece, 1)} mm eyepiece, ${fmt(first.magnification, 1)}×`,
      pass: first.exitPupil === 6 && percentDiff(first.eyepiece, 6 * (1200 / 203)) < TOLERANCE_PCT,
    },
    {
      test: "Eyepiece table ends at 0.5 mm",
      inputs: "203 mm, 1200 mm, eye 6 mm",
      expected: "0.5 mm → 406×",
      computed: `${fmt(rows[rows.length - 1].exitPupil, 2)} mm → ${fmt(rows[rows.length - 1].magnification, 1)}×`,
      pass: rows[rows.length - 1].exitPupil === 0.5 && percentDiff(rows[rows.length - 1].magnification, 406) < TOLERANCE_PCT,
    },
  ];
}

function edgeRows() {
  return [
    { test: "Zero magnification", inputs: "D=200, M=0", expected: "null", computed: String(exitPupilMm(200, 0)), pass: exitPupilMm(200, 0) === null },
    { test: "Negative age", inputs: "age -5", expected: "null", computed: String(eyePupilForAge(-5)), pass: eyePupilForAge(-5) === null },
    { test: "Eyepiece table with no aperture", inputs: "D=0", expected: "null", computed: String(eyepieceTable(0, 1200, 7)), pass: eyepieceTable(0, 1200, 7) === null },
  ];
}

/** Computes the full Tests table for this calculator, live, on every call. */
export function getExitPupilTestRows() {
  return [...formulaRows(), ...eyeRows(), ...bandRows(), ...tableRows(), ...edgeRows()];
}
