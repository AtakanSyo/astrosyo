// Test cases for the "Tests" popup on the Black Hole Calculator. These run
// the calculator's real blackHole.js functions (which reuse this site's
// single-purpose black hole calculators' formulas).

import { blackHoleProperties, eddingtonLuminosityW, meanDensity, M_SUN } from "./blackHole";

export const BLACK_HOLE_TEST_COLUMNS = [
  { key: "test", label: "Test" },
  { key: "inputs", label: "Inputs" },
  { key: "expected", label: "Expected" },
  { key: "computed", label: "Computed" },
  { key: "result", label: "Result" },
];

export const BLACK_HOLE_TEST_SOURCES = [
  {
    title: "Where the numbers come from",
    text: "Textbook values for a one-solar-mass black hole: Schwarzschild radius 2.95 km, Hawking temperature 6.2 × 10⁻⁸ K, evaporation time about 2 × 10⁶⁷ years, Eddington luminosity 1.26 × 10³¹ W. For a non-spinning black hole the ISCO is 3 r_s and the photon sphere 1.5 r_s; with spin, the equatorial photon orbit follows Bardeen, Press & Teukolsky (1972). Sagittarius A* (4.297 million M☉, GRAVITY Collaboration) has r_s ≈ 1.27 × 10¹⁰ m. The mean density inside r_s falls as 1/M², reaching water's density near 1.4 × 10⁸ M☉, and a Sun-like star is swallowed whole rather than torn apart above roughly 10⁸ M☉.",
  },
];

const close = (a, b, pct) => Number.isFinite(a) && Math.abs((a - b) / b) * 100 < pct;
const sci = (n, d = 3) => (Number.isFinite(n) ? n.toExponential(d) : String(n));

/** Computes the full Tests table for this calculator, live, on every call. */
export function getBlackHoleTestRows() {
  const sun = blackHoleProperties(M_SUN, 0);
  const sgr = blackHoleProperties(4.297e6 * M_SUN, 0);
  const small = blackHoleProperties(10 * M_SUN, 0);
  const fast = blackHoleProperties(10 * M_SUN, 0.998);
  return [
    { test: "1 M☉: Schwarzschild radius", inputs: "M = 1 M☉", expected: "2,953 m", computed: `${sun.rs.toFixed(0)} m`, pass: close(sun.rs, 2953, 0.1) },
    { test: "1 M☉: Hawking temperature", inputs: "M = 1 M☉", expected: "6.17e-8 K", computed: `${sci(sun.hawkingK)} K`, pass: close(sun.hawkingK, 6.17e-8, 0.5) },
    { test: "1 M☉: evaporation time", inputs: "M = 1 M☉", expected: "≈ 2.1e67 yr", computed: `${sci(sun.evaporationYears, 2)} yr`, pass: close(sun.evaporationYears, 2.1e67, 5) },
    { test: "1 M☉: Eddington luminosity", inputs: "M = 1 M☉", expected: "1.26e31 W", computed: `${sci(eddingtonLuminosityW(M_SUN))} W`, pass: close(eddingtonLuminosityW(M_SUN), 1.257e31, 0.5) },
    { test: "Non-spinning ISCO = 3 r_s", inputs: "a* = 0", expected: "3.000", computed: (sun.isco / sun.rs).toFixed(3), pass: close(sun.isco / sun.rs, 3, 0.01) },
    { test: "Photon sphere = 1.5 r_s", inputs: "a* = 0", expected: "1.500", computed: (sun.photonSphere / sun.rs).toFixed(3), pass: close(sun.photonSphere / sun.rs, 1.5, 0.01) },
    { test: "Fast spin: photon orbit inside the ISCO", inputs: "a* = 0.998", expected: "photon orbit < ISCO", computed: `photon ${(fast.photonSphere / fast.rs).toFixed(3)} r_s, ISCO ${(fast.isco / fast.rs).toFixed(3)} r_s`, pass: fast.photonSphere < fast.isco && fast.photonSphere > fast.horizon },
    { test: "Fast spin shrinks horizon and ISCO", inputs: "a* = 0.998", expected: "horizon < r_s, ISCO < 1 r_s", computed: `horizon ${(fast.horizon / fast.rs).toFixed(3)} r_s, ISCO ${(fast.isco / fast.rs).toFixed(3)} r_s`, pass: fast.horizon < fast.rs && fast.isco < fast.rs },
    { test: "Sagittarius A*: Schwarzschild radius", inputs: "4.297e6 M☉", expected: "1.27e10 m", computed: `${sci(sgr.rs)} m`, pass: close(sgr.rs, 1.269e10, 0.5) },
    { test: "Density of water near 1.36e8 M☉", inputs: "1.36e8 M☉", expected: "≈ 1,000 kg/m³", computed: `${meanDensity(1.36e8 * M_SUN).toFixed(0)} kg/m³`, pass: close(meanDensity(1.36e8 * M_SUN), 1000, 2) },
    { test: "10 M☉: lethal stretch outside the horizon", inputs: "10 M☉", expected: "spaghettified outside", computed: small.spaghettifiedOutside ? "outside" : "inside", pass: small.spaghettifiedOutside === true },
    { test: "Sagittarius A*: cross the horizon intact", inputs: "4.297e6 M☉", expected: "stretch < 0.01 m/s²", computed: `${sci(sgr.stretchAtHorizon, 2)} m/s²`, pass: sgr.stretchAtHorizon < 0.01 && !sgr.spaghettifiedOutside },
    { test: "Sun-like star torn apart at 10⁷ M☉", inputs: "1e7 M☉", expected: "disrupted outside", computed: blackHoleProperties(1e7 * M_SUN).sunSwallowedWhole ? "swallowed" : "disrupted", pass: !blackHoleProperties(1e7 * M_SUN).sunSwallowedWhole },
    { test: "Sun-like star swallowed whole at 10⁹ M☉", inputs: "1e9 M☉", expected: "swallowed", computed: blackHoleProperties(1e9 * M_SUN).sunSwallowedWhole ? "swallowed" : "disrupted", pass: blackHoleProperties(1e9 * M_SUN).sunSwallowedWhole },
    { test: "Zero mass rejected", inputs: "M = 0", expected: "null", computed: String(blackHoleProperties(0)), pass: blackHoleProperties(0) === null },
  ];
}
