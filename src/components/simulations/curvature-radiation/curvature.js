// Curvature radiation: light from a relativistic charge sliding along a
// curved magnetic field line.
//
// In the 10⁸–10¹² gauss fields near a pulsar, any motion across the field is
// radiated away almost instantly as synchrotron light, so electrons and
// positrons end up sliding along the field lines like beads on a wire. The
// field lines curve, so the particle is still accelerated sideways, and it
// radiates exactly as in synchrotron radiation with the gyroradius replaced
// by the field line's radius of curvature ρ:
//
//   critical frequency   ν_c = (3 / 4π) γ³ c / ρ
//   spectrum             P(ν) ∝ F(ν/ν_c), the same synchrotron function
//   power                P = e² c γ⁴ / (6π ε₀ ρ²)
//   energy-loss time     t = γ mₑ c² / P
//
// Because the loss grows as γ⁴, a particle pushed along by an electric field
// E∥ stops gaining energy once P = e E∥ c, at
//   γ_max = (6π ε₀ ρ² E∥ / e)^(1/4)
// the "radiation-reaction limit", around 10⁷ for pulsar conditions.

import { E_CHARGE, M_E, C } from "../synchrotron-radiation/synchrotron";

export const EPS0 = 8.8541878128e-12; // F/m

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

export function criticalFrequency(gamma, rhoM) {
  if (!(gamma >= 1) || !positive(rhoM)) return null;
  return (3 / (4 * Math.PI)) * gamma ** 3 * (C / rhoM);
}

/** Power radiated by one electron or positron, W. */
export function power(gamma, rhoM) {
  if (!(gamma >= 1) || !positive(rhoM)) return null;
  return (E_CHARGE * E_CHARGE * C * gamma ** 4) / (6 * Math.PI * EPS0 * rhoM * rhoM);
}

/** Time to radiate away its whole energy at the current rate, s. */
export function lossTime(gamma, rhoM) {
  const p = power(gamma, rhoM);
  return positive(p) ? (gamma * M_E * C * C) / p : null;
}

/** Lorentz factor where curvature losses balance acceleration by E∥ (V/m). */
export function radiationReactionGamma(eField, rhoM) {
  if (!positive(eField) || !positive(rhoM)) return null;
  return ((6 * Math.PI * EPS0 * rhoM * rhoM * eField) / E_CHARGE) ** 0.25;
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return "—";
  const LY = 9.4607304725808e15;
  const ly = m / LY;
  const sig = (v) => v.toLocaleString("en-US", { maximumSignificantDigits: 3 });
  if (ly >= 1e12) return `${sig(ly / 1e12)} trillion light-years`;
  if (ly >= 1e9) return `${sig(ly / 1e9)} billion light-years`;
  if (ly >= 1e6) return `${sig(ly / 1e6)} million light-years`;
  if (m >= 0.01 * LY) return `${sig(ly)} light-years`;
  if (m >= 1e9) return `${(m / 1e9).toLocaleString("en-US", { maximumSignificantDigits: 3 })} million km`;
  if (m >= 1e3) return `${(m / 1e3).toLocaleString("en-US", { maximumSignificantDigits: 3 })} km`;
  if (m >= 1) return `${m.toPrecision(3)} m`;
  if (m >= 1e-2) return `${(m * 100).toPrecision(3)} cm`;
  return `${(m * 1e3).toPrecision(3)} mm`;
}
