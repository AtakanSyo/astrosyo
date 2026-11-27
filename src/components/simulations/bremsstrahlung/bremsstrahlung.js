// Bremsstrahlung ("braking radiation"): light given off by an electron as it
// is swung round by the electric pull of an atomic nucleus. Any accelerating
// charge radiates, and the sharper the swing, the more energetic the light.
//
// One electron passing one nucleus (charge Ze), at impact parameter b:
//   b₀ = Z e² / (4π ε₀ γ mₑ v²)          the length scale of the encounter
//   deflection        θ = 2 arctan(b₀ / b)                (Rutherford)
//   closest approach  r_min = √(b² + b₀²) − b₀            (attracted, so closer than b)
//   typical photon    E ≈ ħ v / r_min (the encounter lasts about r_min / v),
//                     never more than the electron's kinetic energy K
//   brightness        ∝ Z² (heavier nuclei pull harder)
//   shortest wavelength (Duane–Hunt limit)  λ_min = h c / K
//   X-ray tube efficiency (electrons stopped in a thick target at voltage V)
//                     η ≈ 9 × 10⁻¹⁰ Z V  (the rest becomes heat)
//
// A hot, ionised gas of hydrogen (thermal, or "free-free", bremsstrahlung):
//   power per volume  ε = 1.42 × 10⁻⁴⁰ g √T nₑ nᵢ  W m⁻³   (n in m⁻³, g ≈ 1.2)
//   spectrum          ν ε_ν ∝ E e^(−E/kT), peaking at E = kT
//   cooling time      t = 3 nₑ k T / ε  (thermal energy of electrons and protons)

export const C = 299792458; // m/s
export const ME_C2 = 510998.95; // eV
export const HBAR = 6.582119569e-16; // eV s
export const HC = 1.23984198e-6; // eV m
export const COULOMB = 1.43996448e-9; // e² / (4π ε₀), eV m
export const K_B = 1.380649e-23; // J/K
export const K_B_EV = 8.617333262e-5; // eV/K
export const GAUNT = 1.2;
const SECONDS_PER_YEAR = 365.25 * 86400;

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Speed and Lorentz factor of an electron with kinetic energy K (eV). */
export function electron(K) {
  if (!positive(K)) return null;
  const gamma = 1 + K / ME_C2;
  const beta = Math.sqrt(1 - 1 / (gamma * gamma));
  return { gamma, beta, v: beta * C };
}

/** The encounter's length scale b₀ (m). */
export function b0(K, Z) {
  const e = electron(K);
  if (!e || !positive(Z)) return null;
  return (Z * COULOMB) / (e.gamma * ME_C2 * e.beta * e.beta);
}

/** Deflection angle (radians) for impact parameter b = ratio × b₀. */
export const deflection = (ratio) => (positive(ratio) ? 2 * Math.atan(1 / ratio) : null);

/** Closest approach (m) for impact parameter b and length scale b₀. */
export const closestApproach = (b, bb0) => Math.sqrt(b * b + bb0 * bb0) - bb0;

/** Typical photon energy (eV) for a pass at distance b (m), capped at the
 *  electron's energy. (At these energies the electron is a quantum wave about a
 *  picometre across, so b means "how close", from ~1 pm to the atom's ~100 pm
 *  edge, beyond which the atom's own electrons hide the nucleus.) */
export function photonEnergy(K, Z, b) {
  const e = electron(K);
  const bb0 = b0(K, Z);
  if (!e || bb0 === null || !positive(b)) return null;
  return Math.min(K, (HBAR * e.v) / closestApproach(b, bb0));
}

/** How much brighter a nucleus of charge Z shines than hydrogen (∝ Z²). */
export const relativeBrightness = (Z) => (positive(Z) ? Z * Z : null);

/** Shortest wavelength an electron of energy K can make (m). */
export const duaneHunt = (K) => (positive(K) ? HC / K : null);

/** Fraction of the beam's energy turned into X-rays in a thick target. */
export const tubeEfficiency = (Z, K) => (positive(Z) && positive(K) ? 9e-10 * Z * K : null);

/** Free-free power per cubic metre of ionised hydrogen (W m⁻³). */
export const emissivity = (T, n) => (positive(T) && positive(n) ? 1.42e-40 * GAUNT * Math.sqrt(T) * n * n : null);

/** Time for a hot hydrogen gas to radiate away its heat by bremsstrahlung (s). */
export function coolingTime(T, n) {
  const eps = emissivity(T, n);
  return eps === null ? null : (3 * n * K_B * T) / eps;
}

/** ν ε_ν at photon energy E, relative to its peak (which is at E = kT). */
export function spectrum(E, T) {
  const x = E / (K_B_EV * T);
  return x * Math.exp(1 - x);
}

export const yearsFromSeconds = (s) => s / SECONDS_PER_YEAR;

/** The part of the spectrum a photon of energy E (eV) belongs to. */
export function band(E) {
  if (!Number.isFinite(E)) return "—";
  if (E < 1.24e-3) return "radio";
  if (E < 1.65) return "infrared";
  if (E < 3.26) return "visible light";
  if (E < 100) return "ultraviolet";
  if (E < 1e5) return "X-rays";
  return "gamma rays";
}

/** A colour to draw a photon of energy E (eV) with. */
export function bandColor(E) {
  if (E < 1.24e-3) return "#ffb46b";
  if (E < 1.65) return "#ff6b6b";
  if (E < 3.26) {
    // visible: red at 1.65 eV through to violet at 3.26 eV
    const t = (E - 1.65) / (3.26 - 1.65);
    return `hsl(${Math.round(t * 270)}, 95%, 65%)`;
  }
  if (E < 100) return "#b18cff";
  if (E < 1e5) return "#9fe3ff";
  return "#f3b8ff";
}

/** Photon energy in friendly units. */
export function formatEnergy(eV) {
  if (!Number.isFinite(eV)) return "—";
  const sig = (v) => Number(v.toPrecision(3)).toLocaleString("en-US");
  if (eV >= 1e6) return `${sig(eV / 1e6)} MeV`;
  if (eV >= 1e3) return `${sig(eV / 1e3)} keV`;
  if (eV >= 1) return `${sig(eV)} eV`;
  if (eV >= 1e-3) return `${sig(eV * 1e3)} meV`;
  return `${sig(eV * 1e6)} µeV`;
}

/** Atom-sized and smaller lengths in friendly units. */
export function formatTiny(m) {
  if (!Number.isFinite(m)) return "—";
  const sig = (v) => Number(v.toPrecision(3)).toLocaleString("en-US");
  if (m >= 1e-6) return `${sig(m * 1e6)} µm`;
  if (m >= 1e-9) return `${sig(m * 1e9)} nm`;
  if (m >= 1e-12) return `${sig(m * 1e12)} pm`;
  return `${sig(m * 1e15)} fm`;
}
