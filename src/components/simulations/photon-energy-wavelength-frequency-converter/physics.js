// Photon energy ↔ wavelength ↔ frequency — SI constants, CODATA 2018 / SI 2019 values.
export const H = 6.62607015e-34; // Planck constant, J·s
export const C = 2.99792458e8; // speed of light in vacuum, m/s
export const EV_TO_J = 1.602176634e-19; // 1 eV in Joules (exact, SI 2019 redefinition)

/** Wavelength (m) -> frequency (Hz), via c = λf. */
export function wavelengthToFrequency(lambdaM) {
  return C / lambdaM;
}

/** Wavelength (m) -> photon energy (J), via E = hc/λ. */
export function wavelengthToEnergyJ(lambdaM) {
  return (H * C) / lambdaM;
}

/** Frequency (Hz) -> wavelength (m), via λ = c/f. */
export function frequencyToWavelength(freqHz) {
  return C / freqHz;
}

/** Frequency (Hz) -> photon energy (J), via E = hf. */
export function frequencyToEnergyJ(freqHz) {
  return H * freqHz;
}

/** Photon energy (J) -> wavelength (m), via λ = hc/E. */
export function energyJToWavelength(energyJ) {
  return (H * C) / energyJ;
}

/** Photon energy (J) -> frequency (Hz), via f = E/h. */
export function energyJToFrequency(energyJ) {
  return energyJ / H;
}

// --- unit tables: multiply a value in the named unit by this factor to get
// the SI base unit (Joules, metres, or Hertz); divide to go the other way.

export const ENERGY_UNITS = {
  eV: EV_TO_J,
  keV: EV_TO_J * 1e3,
  MeV: EV_TO_J * 1e6,
  J: 1,
};

export const WAVELENGTH_UNITS = {
  pm: 1e-12,
  "Å": 1e-10,
  nm: 1e-9,
  "µm": 1e-6,
  mm: 1e-3,
  m: 1,
};

export const FREQUENCY_UNITS = {
  Hz: 1,
  kHz: 1e3,
  MHz: 1e6,
  GHz: 1e9,
  THz: 1e12,
  PHz: 1e15,
  EHz: 1e18,
};

export function toBase(value, unitTable, unit) {
  return value * unitTable[unit];
}

export function fromBase(valueInBase, unitTable, unit) {
  return valueInBase / unitTable[unit];
}

// Simplified electromagnetic-spectrum band boundaries, by wavelength (m).
// These are the standard rounded textbook cut points — real astronomical
// band definitions vary by sub-field and overlap at the edges, but this is
// the conventional picture for a general-audience classifier.
export const BANDS = [
  { name: "Gamma ray", max: 1e-11, color: "#c65cff" },
  { name: "X-ray", max: 1e-8, color: "#7c6cff" },
  { name: "Ultraviolet", max: 3.8e-7, color: "#8a5cff" },
  { name: "Visible", max: 7.5e-7, color: null }, // rendered from the real wavelength instead
  { name: "Infrared", max: 1e-3, color: "#ff6a4f" },
  { name: "Microwave", max: 1, color: "#4fb8ff" },
  { name: "Radio", max: Infinity, color: "#4fd0a0" },
];

/** Which named region of the EM spectrum a wavelength (m) falls in. */
export function classifyBand(lambdaM) {
  for (const band of BANDS) {
    if (lambdaM <= band.max) return band;
  }
  return BANDS[BANDS.length - 1];
}

/**
 * Approximate perceived sRGB color of a single visible wavelength (nm),
 * after Dan Bruton's widely-used 1996 approximation ("Approximate RGB
 * values for visible wavelengths"). Not a full CIE colorimetric
 * integration like the blackbody generator's swatch — this is a
 * monochromatic-source approximation, which is the right model here since
 * a single wavelength is by definition monochromatic. Good enough for a
 * representative spectrum-band swatch. Returns { r, g, b } as 0–255 ints.
 */
export function visibleWavelengthToRgb(nm) {
  let r = 0;
  let g = 0;
  let b = 0;

  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / (440 - 380);
    b = 1;
  } else if (nm >= 440 && nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm >= 490 && nm < 510) {
    g = 1;
    b = -(nm - 510) / (510 - 490);
  } else if (nm >= 510 && nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
  } else if (nm >= 580 && nm < 645) {
    r = 1;
    g = -(nm - 645) / (645 - 580);
  } else if (nm >= 645 && nm <= 780) {
    r = 1;
  }

  // Taper intensity near the violet/red edges of vision instead of
  // clipping straight to full brightness right at 380/780 nm.
  let factor = 1;
  if (nm >= 380 && nm < 420) factor = 0.3 + (0.7 * (nm - 380)) / (420 - 380);
  else if (nm > 700 && nm <= 780) factor = 0.3 + (0.7 * (780 - nm)) / (780 - 700);

  const gamma = 0.8;
  const scale = (channel) => (channel === 0 ? 0 : Math.round(255 * Math.pow(channel * factor, gamma)));
  return { r: scale(r), g: scale(g), b: scale(b) };
}
