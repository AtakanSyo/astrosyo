// Black hole calculator: everything this site computes about a black hole,
// from one mass (and optionally a spin).
//
// The individual formulas live in this site's single-purpose calculators
// and are imported from there, so each number here matches its dedicated
// page exactly:
//
//   Schwarzschild radius     r_s = 2GM/c²             schwarzschild.js
//   horizon & ISCO (Kerr)    in units of r_g = GM/c²  kerr.js
//   accretion efficiency     η = 1 − E_isco           kerr.js
//   Hawking temperature      T = ħc³ / 8πGMk_B        hawkingTemperature.js
//   evaporation time         t = 5120πG²M³ / ħc⁴      evaporationTime.js
//   tidal disruption radius  r_t = R★ (M/M★)^(1/3)    tidalDisruption.js
//
// New here:
//   equatorial photon orbit (Kerr)   r = 2 r_g [1 + cos(⅔ arccos(−a*))]
//     (Bardeen, Press & Teukolsky 1972; 1.5 r_s with no spin, r_g at a* = 1
//     prograde, 4 r_g at a* = −1)
//   mean density inside r_s          ρ = M / (4/3 π r_s³)
//   Eddington luminosity             L = 4πGMm_p c / σ_T ≈ 1.26 × 10³¹ W per M☉
//   tidal stretch on a person        Δa ≈ 2GM·L / r³  (head-to-foot, length L)
//
// The Hawking temperature and evaporation time use the non-spinning
// formulas whatever the spin, as the dedicated pages do.

import {
  G,
  C,
  M_SUN,
  M_EARTH,
  M_JUPITER,
  schwarzschildRadiusM,
  closestSizeComparison,
} from "../schwarzschild-radius-calculator/schwarzschild";
import { iscoRadiusRg, horizonRadiusRg, accretionEfficiency } from "../black-hole-isco-calculator/kerr";
import { hawkingTemperature, CMB_TEMPERATURE_K } from "../hawking-temperature-calculator/hawkingTemperature";
import { evaporationTimeYears, AGE_OF_UNIVERSE_YEARS } from "../black-hole-evaporation-time-calculator/evaporationTime";
import { tidalDisruptionRadiusM, R_SUN_M } from "../tidal-disruption-radius-calculator/tidalDisruption";

export { G, C, M_SUN, CMB_TEMPERATURE_K, AGE_OF_UNIVERSE_YEARS, closestSizeComparison };

export const MASS_UNITS = {
  msun: { label: "Solar masses (M☉)", toKg: M_SUN },
  mearth: { label: "Earth masses (M⊕)", toKg: M_EARTH },
  mjupiter: { label: "Jupiter masses", toKg: M_JUPITER },
  kg: { label: "Kilograms", toKg: 1 },
};

const M_PROTON = 1.67262192369e-27; // kg
const SIGMA_T = 6.6524587321e-29; // m², Thomson cross-section
export const L_SUN = 3.828e26; // W, IAU nominal
export const G_EARTH = 9.80665; // m/s²
export const PERSON_HEIGHT_M = 2;
// Head-to-foot acceleration difference people are generally taken to
// survive briefly (~10 g, the order of fighter-pilot and ejection limits).
export const SURVIVABLE_STRETCH = 10 * G_EARTH;

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Equatorial circular photon orbit in units of r_g, for signed spin a*. */
export function photonOrbitRg(aStar) {
  const a = Math.max(-1, Math.min(1, aStar));
  return 2 * (1 + Math.cos((2 / 3) * Math.acos(-a)));
}

/** Mean density (kg/m³) of the mass spread over the Schwarzschild sphere. */
export function meanDensity(massKg) {
  const r = schwarzschildRadiusM(massKg);
  return massKg / ((4 / 3) * Math.PI * r ** 3);
}

export function eddingtonLuminosityW(massKg) {
  return (4 * Math.PI * G * massKg * M_PROTON * C) / SIGMA_T;
}

/** Head-to-foot tidal acceleration (m/s²) on a body of length L at radius r. */
export function tidalStretch(massKg, rM, L = PERSON_HEIGHT_M) {
  return (2 * G * massKg * L) / rM ** 3;
}

/** Radius at which the tidal stretch on a person reaches `limit` m/s². */
export function spaghettificationRadiusM(massKg, limit = SURVIVABLE_STRETCH, L = PERSON_HEIGHT_M) {
  return Math.cbrt((2 * G * massKg * L) / limit);
}

/** Everything, for one mass (kg) and dimensionless spin a* in [−1, 1]. */
export function blackHoleProperties(massKg, spin = 0) {
  if (!positive(massKg) || !Number.isFinite(spin)) return null;
  const a = Math.max(-0.998, Math.min(0.998, spin));
  const rs = schwarzschildRadiusM(massKg);
  const rg = rs / 2;
  const horizon = horizonRadiusRg(a) * rg;
  const sunRt = tidalDisruptionRadiusM(R_SUN_M, massKg, M_SUN);
  const spag = spaghettificationRadiusM(massKg);
  return {
    massKg,
    spin: a,
    rs,
    horizon,
    isco: iscoRadiusRg(a) * rg,
    photonSphere: photonOrbitRg(a) * rg,
    efficiency: accretionEfficiency(a),
    density: meanDensity(massKg),
    hawkingK: hawkingTemperature(massKg),
    evaporationYears: evaporationTimeYears(massKg),
    eddingtonW: eddingtonLuminosityW(massKg),
    stretchAtHorizon: tidalStretch(massKg, horizon),
    spaghettificationM: spag,
    spaghettifiedOutside: spag > horizon,
    sunTidalRadius: sunRt,
    sunSwallowedWhole: sunRt < horizon,
    lightCrossingS: (2 * rs) / C,
  };
}

// Real black holes and a few reference masses.
export const PRESETS = [
  { label: "Primordial (asteroid mass)", mass: "1e12", unit: "kg", spin: "0" },
  { label: "Earth mass", mass: "1", unit: "mearth", spin: "0" },
  { label: "Cygnus X-1", mass: "21.2", unit: "msun", spin: "0.95" },
  { label: "GW150914 remnant", mass: "62", unit: "msun", spin: "0.67" },
  { label: "Sagittarius A*", mass: "4.297e6", unit: "msun", spin: "0" },
  { label: "M87*", mass: "6.5e9", unit: "msun", spin: "0" },
  { label: "TON 618", mass: "4.07e10", unit: "msun", spin: "0" },
];
