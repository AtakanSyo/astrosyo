// Test cases for the "Tests" popup on the Astrophotography Pixel Scale
// Calculator. These run the calculator's real pixelScale.js functions.

import {
  pixelScale,
  sensorMm,
  fieldDeg,
  samplingRatio,
  classifySampling,
  suggestedBinning,
  cropFactor,
  rule500,
  npfRule,
} from "./pixelScale";

export const PIXEL_SCALE_TEST_COLUMNS = [
  { key: "test", label: "Test" },
  { key: "inputs", label: "Inputs" },
  { key: "expected", label: "Expected" },
  { key: "computed", label: "Computed" },
  { key: "result", label: "Result" },
];

export const PIXEL_SCALE_TEST_SOURCES = [
  {
    title: "Where the numbers come from",
    text: "Pixel scale = 206.265 × pixel size (µm) / focal length (mm), the standard formula used by astronomy.tools and camera makers. Camera specs are ZWO's published values (ASI2600MC Pro and ASI533MC Pro: 3.76 µm pixels) and the RedCat 51's 250 mm focal length. The NPF rule is Frédéric Michaud's simplified form, t = (35N + 30p) / f. Expected values were worked by hand.",
  },
];

const close = (a, b, pct = 0.1) => Number.isFinite(a) && Math.abs((a - b) / b) * 100 < pct;
const fmt = (n, d = 3) => (Number.isFinite(n) ? Number(n.toFixed(d)).toString() : String(n));

/** Computes the full Tests table for this calculator, live, on every call. */
export function getPixelScaleTestRows() {
  const redcat = pixelScale(3.76, 250);
  const c8 = pixelScale(3.76, 2032);
  const w2600 = sensorMm(6248, 3.76);
  const fovW = fieldDeg(w2600, 250);
  return [
    { test: "RedCat 51 + 3.76 µm camera", inputs: "3.76 µm, 250 mm", expected: "3.10″/px", computed: `${fmt(redcat, 2)}″/px`, pass: close(redcat, 3.102, 0.1) },
    { test: "Celestron C8 + 3.76 µm camera", inputs: "3.76 µm, 2032 mm", expected: "0.382″/px", computed: `${fmt(c8, 3)}″/px`, pass: close(c8, 0.3817, 0.1) },
    { test: "Binning 2×2 doubles the scale", inputs: "3.76 µm, 2032 mm, bin 2", expected: `${fmt(2 * c8, 3)}″/px`, computed: `${fmt(pixelScale(3.76, 2032, 2), 3)}″/px`, pass: close(pixelScale(3.76, 2032, 2), 2 * c8, 0.001) },
    { test: "ASI2600 sensor width", inputs: "6248 px × 3.76 µm", expected: "23.5 mm", computed: `${fmt(w2600, 2)} mm`, pass: close(w2600, 23.49, 0.1) },
    { test: "ASI2600 on a RedCat 51: field width", inputs: "23.49 mm, 250 mm", expected: "5.38°", computed: `${fmt(fovW, 2)}°`, pass: close(fovW, 5.38, 0.2) },
    { test: "C8 sampling in 3″ seeing", inputs: "3″ / 0.382″", expected: "7.86 px → oversampled", computed: `${fmt(samplingRatio(3, c8), 2)} px → ${classifySampling(samplingRatio(3, c8))}`, pass: classifySampling(samplingRatio(3, c8)) === "over" },
    { test: "C8 binning to fix it", inputs: "7.86 px per FWHM", expected: "bin 3", computed: `bin ${suggestedBinning(samplingRatio(3, c8))}`, pass: suggestedBinning(samplingRatio(3, c8)) === 3 },
    { test: "RedCat in 2″ seeing: undersampled", inputs: "2″ / 3.10″", expected: "under", computed: classifySampling(samplingRatio(2, redcat)), pass: classifySampling(samplingRatio(2, redcat)) === "under" },
    { test: "Full-frame crop factor", inputs: "36 × 24 mm", expected: "1.00", computed: fmt(cropFactor(36, 24), 3), pass: close(cropFactor(36, 24), 1, 0.1) },
    { test: "500 rule, 24 mm on full frame", inputs: "24 mm, crop 1", expected: "20.8 s", computed: `${fmt(rule500(24, 1), 1)} s`, pass: close(rule500(24, 1), 20.83, 0.1) },
    { test: "NPF rule, 24 mm f/1.4, 5.93 µm", inputs: "N=1.4, p=5.93, f=24", expected: "9.45 s", computed: `${fmt(npfRule(1.4, 5.93, 24), 2)} s`, pass: close(npfRule(1.4, 5.93, 24), (35 * 1.4 + 30 * 5.93) / 24, 0.001) && close(npfRule(1.4, 5.93, 24), 9.45, 0.1) },
    { test: "Zero focal length rejected", inputs: "F=0", expected: "null", computed: String(pixelScale(3.76, 0)), pass: pixelScale(3.76, 0) === null },
  ];
}
