// Exit pupil: the diameter of the beam of light leaving the eyepiece.
//
//   exit pupil = D / M          aperture over magnification
//              = f / N          eyepiece focal length over the scope's
//                               focal ratio (the same number, since M = F/f
//                               and N = F/D)
//   eyepiece for a target exit pupil:  f = exit pupil × N
//
// The magnification and exit-pupil arithmetic is shared with this site's
// Telescope Magnification Calculator (telescopeMagnification.js).
//
// Two pieces here are rules of thumb, not physical constants, and the page
// says so:
//
// * The eye's dark-adapted pupil shrinks with age. Commonly quoted: about
//   7 mm in your twenties, losing roughly half a millimetre per decade
//   after that. Individuals vary by a millimetre or more either way, so the
//   calculator lets you type your own value.
// * The "what each exit pupil is good for" bands are the usual observing-
//   guide advice (wide fields at large exit pupils, planets and doubles at
//   small ones), with the boundaries rounded.

import { magnification, exitPupilMm } from "../telescope-magnification-calculator/telescopeMagnification";

export { magnification, exitPupilMm };

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

const YOUNG_PUPIL_MM = 7;
const YOUNG_UNTIL_AGE = 20;
const SHRINK_MM_PER_YEAR = 0.05; // half a millimetre per decade
const MIN_PUPIL_MM = 3;

/** Approximate dark-adapted pupil (mm) for an age in years. */
export function eyePupilForAge(age) {
  if (!positive(age)) return null;
  const years = Math.max(0, age - YOUNG_UNTIL_AGE);
  return Math.max(MIN_PUPIL_MM, YOUNG_PUPIL_MM - SHRINK_MM_PER_YEAR * years);
}

/** Eyepiece focal length (mm) that gives a target exit pupil in a scope of focal ratio N. */
export function eyepieceForExitPupil(exitPupil, N) {
  if (!positive(exitPupil) || !positive(N)) return null;
  return exitPupil * N;
}

/**
 * When the exit pupil is wider than the eye's pupil, the eye only accepts
 * the central part of the beam: the scope behaves like a smaller one.
 * Effective aperture = eye pupil × magnification (never more than D).
 */
export function effectiveAperture(D, M, eyePupil) {
  if (!positive(D) || !positive(M) || !positive(eyePupil)) return null;
  return Math.min(D, eyePupil * M);
}

// Use bands, widest exit pupil first. `min` is inclusive.
export const BANDS = [
  { key: "wide", min: 5, label: "Widest fields", use: "Large nebulae, star clouds and the Milky Way at the lowest power; nebula filters work well here." },
  { key: "deepsky", min: 2.5, label: "Most deep-sky objects", use: "Galaxies, star clusters and most nebulae: enough magnification to darken the sky background, still bright." },
  { key: "planetary", min: 1, label: "Moon, planets, globulars", use: "The Moon, planets, small planetary nebulae and resolving globular clusters." },
  { key: "fine", min: 0.5, label: "Fine detail in steady air", use: "Splitting close double stars and pushing planetary detail on nights of very steady air." },
  { key: "empty", min: 0, label: "Empty magnification", use: "Below about 0.5 mm the image just gets dimmer and softer, and floaters in the eye become distracting." },
];

/**
 * Classifies an exit pupil. Returns { key, label, use } for one of the
 * bands, or { key: "wasted" } when it's wider than the given eye pupil.
 */
export function classifyExitPupil(exitPupil, eyePupil) {
  if (!positive(exitPupil)) return null;
  if (positive(eyePupil) && exitPupil > eyePupil) {
    return { key: "wasted", label: "Wider than your eye's pupil", use: null };
  }
  return BANDS.find((b) => exitPupil >= b.min) ?? BANDS[BANDS.length - 1];
}

/** Suggested eyepieces for a scope: one row per typical target exit pupil. */
export function eyepieceTable(D, F, eyePupil) {
  if (!positive(D) || !positive(F)) return null;
  const N = F / D;
  const top = positive(eyePupil) ? Math.min(eyePupil, 7) : 7;
  const targets = [top, 4, 2, 1, 0.5].filter((t, i, arr) => t <= top && arr.indexOf(t) === i);
  return targets.map((ep) => {
    const f = eyepieceForExitPupil(ep, N);
    return { exitPupil: ep, eyepiece: f, magnification: D / ep, band: classifyExitPupil(ep, eyePupil) };
  });
}
