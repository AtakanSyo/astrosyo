// Telescope limiting magnitude: the faintest star a telescope shows.
//
// Two estimates, and the page explains both:
//
// * The classic rule of thumb, independent of sky conditions:
//       m = 2.5 + 5·log10(D_mm)          (≡ 7.5 + 5·log10(D_cm))
//   It assumes a fairly dark sky and an experienced observer.
//
// * The sky-adjusted estimate. A telescope gathers (D / pupil)² times more
//   light than the naked eye, i.e. 5·log10(D / pupil) magnitudes, added to
//   the faintest star you can see without it (naked-eye limiting magnitude,
//   NELM):
//       m = NELM + 5·log10(D / eye pupil)
//
// Real limits vary by a magnitude or more either way with magnification,
// seeing, optics, experience and averted vision. These are point-source
// limits: galaxies and nebulae spread their light out and are much harder
// than their catalogue magnitude suggests.

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Classic rule-of-thumb limiting magnitude for an aperture in mm. */
export function classicLimit(Dmm) {
  if (!positive(Dmm)) return null;
  return 2.5 + 5 * Math.log10(Dmm);
}

/** Magnitude gain of an aperture over the eye: 5·log10(D / pupil). */
export function gainOverEye(Dmm, pupilMm) {
  if (!positive(Dmm) || !positive(pupilMm)) return null;
  return 5 * Math.log10(Dmm / pupilMm);
}

/** Light-gathering ratio over the eye: (D / pupil)². */
export function lightGrasp(Dmm, pupilMm) {
  if (!positive(Dmm) || !positive(pupilMm)) return null;
  return (Dmm / pupilMm) ** 2;
}

/** Sky-adjusted limiting magnitude: NELM + 5·log10(D / pupil). */
export function skyLimit(Dmm, nelm, pupilMm) {
  const g = gainOverEye(Dmm, pupilMm);
  if (g === null || typeof nelm !== "number" || !Number.isFinite(nelm)) return null;
  return nelm + g;
}

// Typical naked-eye limiting magnitude for each Bortle class (rounded
// mid-range values from Bortle's 2001 Sky & Telescope description).
export const BORTLE_NELM = {
  1: 7.8,
  2: 7.3,
  3: 6.8,
  4: 6.3,
  5: 5.8,
  6: 5.3,
  7: 4.8,
  8: 4.3,
  9: 4.0,
};

export const BORTLE_LABEL = {
  1: "Excellent dark site",
  2: "Truly dark site",
  3: "Rural sky",
  4: "Rural / suburban transition",
  5: "Suburban sky",
  6: "Bright suburban sky",
  7: "Suburban / urban transition",
  8: "City sky",
  9: "Inner-city sky",
};

export function nelmForBortle(b) {
  return BORTLE_NELM[b] ?? null;
}

// Point-like targets with well-known visual magnitudes (approximate; the
// planets and dwarf planet vary a little through the year).
export const TARGETS = [
  { name: "Uranus", mag: 5.7, note: "planet" },
  { name: "Neptune", mag: 7.8, note: "planet" },
  { name: "Titan", mag: 8.4, note: "Saturn's largest moon" },
  { name: "Barnard's Star", mag: 9.5, note: "fastest-moving star in the sky" },
  { name: "Proxima Centauri", mag: 11.1, note: "nearest star to the Sun" },
  { name: "3C 273", mag: 12.9, note: "brightest quasar, ~2.4 billion light-years" },
  { name: "Triton", mag: 13.5, note: "Neptune's largest moon" },
  { name: "Pluto", mag: 14.4, note: "dwarf planet" },
];

/** Targets with a `reachable` flag for a limiting magnitude. */
export function reachableTargets(limit) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return null;
  return TARGETS.map((t) => ({ ...t, reachable: t.mag <= limit, margin: limit - t.mag }));
}

/** Smallest aperture (mm) that reaches magnitude `mag` from a sky with this NELM. */
export function apertureForMagnitude(mag, nelm, pupilMm) {
  if (!positive(pupilMm) || !Number.isFinite(mag) || !Number.isFinite(nelm)) return null;
  return pupilMm * 10 ** ((mag - nelm) / 5);
}
