// Compton scattering and inverse Compton scattering.
//
// Compton (photon hits an electron at rest):
//   E' = E / (1 + (E / mₑc²)(1 − cos θ))        scattered photon energy
//   λ' − λ = (h / mₑc)(1 − cos θ)               the same thing in wavelength;
//                                               h/mₑc = 2.426 pm, the Compton wavelength
//   cot φ = (1 + E / mₑc²) tan(θ / 2)           electron recoil angle
//   Klein–Nishina cross-section, per solid angle, relative to its value at θ = 0:
//   dσ/dΩ ∝ ½ (E'/E)² (E'/E + E/E' − sin²θ)
//
// Inverse Compton (a fast electron with Lorentz factor γ hits a low-energy photon):
//   average energy after scattering off isotropic photons, Thomson regime (γE ≪ mₑc²):
//     ⟨E₁⟩ = E [1 + (4/3)(γ² − 1)]  ≈ (4/3) γ² E for γ ≫ 1
//   most energetic, head-on and straight back (exact, with recoil):
//     E₁,max = E γ²(1 + β)² / (1 + 2γ(1 + β) E / mₑc²)  ≈ 4γ²E / (1 + 4γE / mₑc²) for γ ≫ 1
//   the scattered photons are beamed into a cone of half-angle ≈ 1/γ around the electron's motion.
// When γE approaches mₑc² (the Klein–Nishina regime) the electron can't hand
// over more than its own energy, γmₑc², and the Thomson formula overestimates.

export const ME_C2_KEV = 510.99895; // electron rest energy, keV (CODATA 2018)
export const ME_C2_EV = ME_C2_KEV * 1000;
export const HC_KEV_PM = 1239.84198; // hc in keV·pm, so λ[pm] = 1239.84 / E[keV]
export const COMPTON_WAVELENGTH_PM = HC_KEV_PM / ME_C2_KEV; // 2.4263 pm

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

export const wavelengthPm = (eKeV) => (positive(eKeV) ? HC_KEV_PM / eKeV : null);

/** Scattered photon energy (keV) for incoming energy eKeV at scattering angle θ (radians). */
export function scatteredEnergy(eKeV, theta) {
  if (!positive(eKeV) || !Number.isFinite(theta)) return null;
  return eKeV / (1 + (eKeV / ME_C2_KEV) * (1 - Math.cos(theta)));
}

/** Wavelength shift λ' − λ in picometres. */
export const wavelengthShiftPm = (theta) => COMPTON_WAVELENGTH_PM * (1 - Math.cos(theta));

/** Electron recoil angle φ (radians, measured from the incoming photon's direction). */
export function recoilAngle(eKeV, theta) {
  if (!positive(eKeV) || !Number.isFinite(theta)) return null;
  if (theta <= 0) return Math.PI / 2;
  if (theta >= Math.PI) return 0;
  return Math.atan(1 / ((1 + eKeV / ME_C2_KEV) * Math.tan(theta / 2)));
}

/** Klein–Nishina dσ/dΩ relative to its forward (θ = 0) value. */
export function kleinNishinaRelative(eKeV, theta) {
  const e1 = scatteredEnergy(eKeV, theta);
  if (e1 === null) return null;
  const P = e1 / eKeV;
  const s = Math.sin(theta);
  return 0.5 * P * P * (P + 1 / P - s * s);
}

// Inverse Compton

export const betaOf = (gamma) => Math.sqrt(Math.max(0, 1 - 1 / (gamma * gamma)));

export function thomsonAverage(gamma, eEv) {
  if (!(gamma >= 1) || !positive(eEv)) return null;
  return eEv * (1 + (4 / 3) * (gamma * gamma - 1));
}

export function headOnMaximum(gamma, eEv) {
  if (!(gamma >= 1) || !positive(eEv)) return null;
  const b = betaOf(gamma);
  return (eEv * gamma * gamma * (1 + b) ** 2) / (1 + (2 * gamma * (1 + b) * eEv) / ME_C2_EV);
}

/** γE / mₑc²: ≪ 1 is the Thomson regime, ≳ 1 Klein–Nishina. */
export function kleinNishinaParameter(gamma, eEv) {
  if (!positive(gamma) || !positive(eEv)) return null;
  return (gamma * eEv) / ME_C2_EV;
}

/** Electron energy (eV) for a Lorentz factor. */
export const electronEnergyEv = (gamma) => gamma * ME_C2_EV;

/** Beaming half-angle ≈ 1/γ (radians), capped at 90° for slow electrons. */
export const beamingAngle = (gamma) => (positive(gamma) ? Math.min(Math.PI / 2, 1 / gamma) : null);

// Bands of the electromagnetic spectrum by photon energy (eV).
export const BANDS = [
  { key: "radio", label: "Radio", min: 0, max: 1.24e-5 },
  { key: "microwave", label: "Microwave", min: 1.24e-5, max: 1.24e-3 },
  { key: "ir", label: "Infrared", min: 1.24e-3, max: 1.65 },
  { key: "visible", label: "Visible", min: 1.65, max: 3.26 },
  { key: "uv", label: "Ultraviolet", min: 3.26, max: 124 },
  { key: "xray", label: "X-ray", min: 124, max: 1e5 },
  { key: "gamma", label: "Gamma ray", min: 1e5, max: Infinity },
];

export function bandOf(eEv) {
  if (!positive(eEv)) return null;
  return BANDS.find((b) => eEv >= b.min && eEv < b.max) ?? BANDS[BANDS.length - 1];
}

/** Energy in eV formatted with a sensible unit. */
export function formatEnergy(eEv) {
  if (!Number.isFinite(eEv)) return "—";
  const units = [
    [1e12, "TeV"],
    [1e9, "GeV"],
    [1e6, "MeV"],
    [1e3, "keV"],
    [1, "eV"],
    [1e-3, "meV"],
    [1e-6, "µeV"],
  ];
  const [div, u] = units.find(([d]) => eEv >= d) ?? units[units.length - 1];
  const v = eEv / div;
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${u}`;
}
