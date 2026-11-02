// E = hν: helpers for the photon drawing. The physics itself (constants, unit
// tables, conversions) lives in the photon converter's physics.js, so the two
// calculators can't disagree.
import {
  BANDS,
  classifyBand,
  frequencyToWavelength,
  visibleWavelengthToRgb,
} from "../photon-energy-wavelength-frequency-converter/physics";

// The drawing and the spectrum bar span radio (10 kHz) to hard gamma rays (10²⁴ Hz).
export const LOG_F_MIN = 4;
export const LOG_F_MAX = 24;
export const MIN_CYCLES = 3;
export const MAX_CYCLES = 24;

/** Position of a frequency on the log spectrum bar: 0 (left) to 1 (right), clamped. */
export function spectrumPosition(freqHz) {
  const t = (Math.log10(freqHz) - LOG_F_MIN) / (LOG_F_MAX - LOG_F_MIN);
  return Math.min(1, Math.max(0, t));
}

/**
 * Wave cycles drawn inside the packet, log-mapped from frequency. Real photons
 * span far too many orders of magnitude to draw literally, so this only shows
 * the direction of the relation: more energy, more tightly packed waves.
 */
export function packetCycles(freqHz) {
  return MIN_CYCLES + spectrumPosition(freqHz) * (MAX_CYCLES - MIN_CYCLES);
}

/** The photon's colour: its true colour if visible, else its spectrum band's. */
export function photonColor(freqHz) {
  const lambdaM = frequencyToWavelength(freqHz);
  const band = classifyBand(lambdaM);
  if (band.color) return band.color;
  const { r, g, b } = visibleWavelengthToRgb(lambdaM * 1e9);
  return `rgb(${r}, ${g}, ${b})`;
}

const VISIBLE_RAINBOW = "linear-gradient(90deg, #d0342c, #f28c28, #f5e050, #4cc35a, #3f7fe0, #7a4fd0)";

/** Spectrum bar segments, low frequency to high: { name, start, end, background }, positions 0–1. */
export function spectrumSegments() {
  const segments = [];
  let end = 1;
  // BANDS runs short wavelength (high frequency) to long.
  BANDS.forEach((band) => {
    const start = Number.isFinite(band.max) ? spectrumPosition(frequencyToWavelength(band.max)) : 0;
    segments.unshift({ name: band.name, start, end, background: band.color ?? VISIBLE_RAINBOW });
    end = start;
  });
  return segments;
}
