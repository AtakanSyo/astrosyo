// Thomson scattering: light bouncing off a free electron, in the low-energy
// limit where the photon keeps its energy (well below mₑc² = 511 keV; above
// that it becomes Compton scattering).
//
// The wave's electric field shakes the electron, and the shaking electron
// re-radiates like a tiny dipole antenna, brightest at right angles to its
// motion and dark along it.
//
//   classical electron radius   r_e = e² / (4π ε₀ mₑ c²) = 2.818 fm
//   Thomson cross-section       σ_T = (8π/3) r_e² = 6.652 × 10⁻²⁹ m²
//   angular pattern, scattering angle θ, in the plane of the screen:
//     E in the plane            ∝ cos²θ
//     E out of the plane        ∝ 1 (the same in every direction in the plane)
//     unpolarized               ∝ (1 + cos²θ) / 2
//   polarization of scattered unpolarized light:  Π = sin²θ / (1 + cos²θ)
//   (complete at 90°, with E perpendicular to the plane of scattering)
//
// Through a gas of electrons:
//   mean free path   λ = 1 / (n_e σ_T)
//   optical depth    τ = n_e σ_T L
//   straight-through fraction  e^(−τ)
//   when τ ≫ 1 a photon random-walks out: about τ² steps of λ, taking τ L / c.

export const SIGMA_T = 6.6524587321e-29; // m², CODATA 2018
export const R_E = 2.8179403262e-15; // m
export const C = 299792458; // m/s
export const ME_OVER_MP = 1 / 1836.15267343;
const SECONDS_PER_YEAR = 365.25 * 86400;

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Scattered intensity relative to the forward direction (θ in radians). */
export function pattern(theta, pol) {
  const c2 = Math.cos(theta) ** 2;
  if (pol === "in") return c2;
  if (pol === "out") return 1;
  return (1 + c2) / 2;
}

/** Degree of linear polarization of the scattered light (0 to 1). */
export function polarization(theta, pol) {
  if (pol === "in" || pol === "out") return 1;
  const c2 = Math.cos(theta) ** 2;
  return (1 - c2) / (1 + c2);
}

export const meanFreePath = (ne) => (positive(ne) ? 1 / (ne * SIGMA_T) : null);
export const opticalDepth = (ne, L) => (positive(ne) && positive(L) ? ne * SIGMA_T * L : null);

/** Time for a photon to random-walk out through optical depth τ over length L (s). */
export function escapeTime(ne, L) {
  const tau = opticalDepth(ne, L);
  if (tau === null) return null;
  return tau > 1 ? (tau * L) / C : L / C;
}

export const yearsFromSeconds = (s) => s / SECONDS_PER_YEAR;
