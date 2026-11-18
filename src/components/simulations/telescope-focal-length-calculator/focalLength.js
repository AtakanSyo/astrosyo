// Telescope focal length, aperture and focal ratio.
//
//   N = F / D        focal ratio ("f-number"): focal length over aperture,
//                    both in the same unit
//   F = N × D        focal length from aperture and focal ratio
//   D = F / N        aperture from focal length and focal ratio
//
// A Barlow lens multiplies the effective focal length (2× Barlow → 2F);
// a focal reducer shrinks it (0.63× reducer → 0.63F). The aperture is
// unchanged, so the effective focal ratio scales by the same factor.
//
// "Fast" and "slow" are relative terms with no single official cut-off.
// The bands below are the common amateur-astronomy rule of thumb:
// below about f/5 is fast, about f/5 to f/8 is medium, above about f/8
// is slow.

export const MM_PER_INCH = 25.4;

const FAST_BELOW = 5;
const SLOW_ABOVE = 8;

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Focal ratio N = F / D. */
export function focalRatio(F, D) {
  if (!positive(F) || !positive(D)) return null;
  return F / D;
}

/** Focal length F = N × D. */
export function focalLengthFrom(D, N) {
  if (!positive(D) || !positive(N)) return null;
  return N * D;
}

/** Aperture D = F / N. */
export function apertureFrom(F, N) {
  if (!positive(F) || !positive(N)) return null;
  return F / N;
}

/**
 * Effective focal length and focal ratio with a Barlow (factor > 1) or a
 * focal reducer (factor < 1). The aperture doesn't change.
 */
export function withMultiplier(F, D, factor) {
  if (!positive(F) || !positive(D) || !positive(factor)) return null;
  const Feff = F * factor;
  return { F: Feff, N: Feff / D };
}

/**
 * Classifies a focal ratio as "fast", "medium" or "slow" using the
 * rule-of-thumb bands above. Returns null for an invalid ratio.
 */
export function classifySpeed(N) {
  if (!positive(N)) return null;
  if (N < FAST_BELOW) return "fast";
  if (N > SLOW_ABOVE) return "slow";
  return "medium";
}

/**
 * Solves for whichever of F (focal length), D (aperture) or N (focal
 * ratio) is missing. `solveFor` is "F", "D" or "N"; the other two must
 * be positive. Lengths in mm. Returns { F, D, N } or null.
 */
export function solve(solveFor, { F, D, N }) {
  if (solveFor === "N") {
    const n = focalRatio(F, D);
    return n === null ? null : { F, D, N: n };
  }
  if (solveFor === "F") {
    const f = focalLengthFrom(D, N);
    return f === null ? null : { F: f, D, N };
  }
  if (solveFor === "D") {
    const d = apertureFrom(F, N);
    return d === null ? null : { F, D: d, N };
  }
  return null;
}
