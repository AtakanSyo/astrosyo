// Astrophotography: image scale, field of view, sampling, and how long you
// can expose on a fixed tripod before stars trail.
//
//   pixel scale (″/px) = 206.265 × pixel size (µm) × binning / focal length (mm)
//     (206,265 arcseconds per radian; the µm/mm units give the factor 1/1000)
//   field of view      = 2·atan(sensor side / 2F)
//   sampling           = seeing FWHM / pixel scale  (pixels across a star)
//
// Sampling targets: the usual guidance (e.g. astronomy.tools, Nyquist
// arguments applied to a star's FWHM) is to put roughly 2–3 pixels across
// a star's FWHM. Fewer gives blocky, undersampled stars; more spreads the
// light over extra pixels for no extra detail, which costs signal-to-noise
// (binning fixes it).
//
// Untracked exposure limits (camera on a fixed tripod):
//   500 rule:       t = 500 / (focal length × crop factor)
//   NPF rule:       t = (35·N + 30·p) / f
//     simplified NPF (Frédéric Michaud, Société Astronomique de France),
//     N = f-number, p = pixel pitch in µm, f = focal length in mm, for
//     stars on the celestial equator (the worst case). The 500 rule
//     predates high-resolution sensors and allows visible trailing on
//     them; NPF is stricter.

export const ARCSEC_PER_RAD = 206264.806;
export const FULL_FRAME_DIAGONAL_MM = 43.27;

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Image scale in arcseconds per pixel. */
export function pixelScale(pixelUm, focalMm, bin = 1) {
  if (!positive(pixelUm) || !positive(focalMm) || !positive(bin)) return null;
  return (ARCSEC_PER_RAD * pixelUm * bin) / (focalMm * 1000);
}

/** Sensor side length in mm from pixel count and pitch. */
export function sensorMm(pixels, pixelUm) {
  if (!positive(pixels) || !positive(pixelUm)) return null;
  return (pixels * pixelUm) / 1000;
}

/** Angular field (degrees) covered by a sensor side of `mm` at focal length F. */
export function fieldDeg(mm, focalMm) {
  if (!positive(mm) || !positive(focalMm)) return null;
  return (2 * Math.atan(mm / (2 * focalMm)) * 180) / Math.PI;
}

/** Pixels across a star's FWHM. */
export function samplingRatio(seeingArcsec, scale) {
  if (!positive(seeingArcsec) || !positive(scale)) return null;
  return seeingArcsec / scale;
}

export const SAMPLING_LOW = 2;
export const SAMPLING_HIGH = 3;

export function classifySampling(ratio) {
  if (!positive(ratio)) return null;
  if (ratio < SAMPLING_LOW) return "under";
  if (ratio > SAMPLING_HIGH) return "over";
  return "good";
}

/** Smallest binning (1–4) that brings an oversampled setup to ≤ 3 px per FWHM. */
export function suggestedBinning(ratio) {
  if (!positive(ratio) || ratio <= SAMPLING_HIGH) return 1;
  for (let b = 2; b <= 4; b++) if (ratio / b <= SAMPLING_HIGH) return b;
  return 4;
}

/** Crop factor relative to a full-frame (36 × 24 mm) sensor. */
export function cropFactor(widthMm, heightMm) {
  if (!positive(widthMm) || !positive(heightMm)) return null;
  return FULL_FRAME_DIAGONAL_MM / Math.hypot(widthMm, heightMm);
}

/** 500 rule, seconds. */
export function rule500(focalMm, crop = 1) {
  if (!positive(focalMm) || !positive(crop)) return null;
  return 500 / (focalMm * crop);
}

/** Simplified NPF rule, seconds. */
export function npfRule(fNumber, pixelUm, focalMm) {
  if (!positive(fNumber) || !positive(pixelUm) || !positive(focalMm)) return null;
  return (35 * fNumber + 30 * pixelUm) / focalMm;
}

// Targets for the framing preview (angular size in arcminutes).
export const TARGETS = [
  { key: "moon", name: "Full Moon", w: 31, h: 31 },
  { key: "m31", name: "Andromeda Galaxy (M31)", w: 190, h: 60 },
  { key: "m42", name: "Orion Nebula (M42)", w: 85, h: 60 },
  { key: "m45", name: "Pleiades (M45)", w: 110, h: 110 },
  { key: "m51", name: "Whirlpool Galaxy (M51)", w: 11, h: 7 },
  { key: "m57", name: "Ring Nebula (M57)", w: 1.4, h: 1 },
];
