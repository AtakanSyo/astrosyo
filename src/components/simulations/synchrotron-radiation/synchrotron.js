// Synchrotron radiation: light from relativistic electrons spiralling in a
// magnetic field.
//
//   gyrofrequency (non-relativistic)   ν_g = eB / (2π mₑ)          ≈ 2.8 MHz per gauss
//   orbital frequency of the electron  ν_g / γ
//   critical frequency                 ν_c = (3/2) γ² ν_g sin α
//   the single-electron spectrum       P(ν) ∝ F(ν/ν_c), F(x) = x ∫ₓ^∞ K₅/₃(t) dt,
//                                      which peaks at ν ≈ 0.29 ν_c
//   Larmor (gyro) radius               r = γ β mₑ c sin α / (eB)
//   power radiated                     P = 2 σ_T c β² γ² U_B sin² α,  U_B = B² / 2μ₀
//   cooling time                       t = γ mₑ c² / P
//                                      (≈ 7.7 × 10⁸ s / (B[G]² γ) averaged over pitch angles)
//
// α is the pitch angle between the electron's velocity and the field. B is
// taken in gauss (1 T = 10⁴ G), the unit astronomers usually quote.
//
// F(x) uses the analytic approximation of Aharonian, Kelner & Prosekin
// (2010, Phys. Rev. D 82, 043002, eq. D7), accurate to about 0.2%.

export const E_CHARGE = 1.602176634e-19; // C
export const M_E = 9.1093837015e-31; // kg
export const C = 299792458; // m/s
export const H = 6.62607015e-34; // J s
export const SIGMA_T = 6.6524587321e-29; // m²
export const MU0 = 1.25663706212e-6; // N/A²
export const ME_C2_EV = 510998.95;
export const GAUSS_TO_TESLA = 1e-4;
const SECONDS_PER_YEAR = 365.25 * 86400;

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
const betaOf = (g) => Math.sqrt(Math.max(0, 1 - 1 / (g * g)));

/** Non-relativistic gyrofrequency eB/(2π mₑ), Hz, for B in gauss. */
export function gyroFrequency(bGauss) {
  if (!positive(bGauss)) return null;
  return (E_CHARGE * bGauss * GAUSS_TO_TESLA) / (2 * Math.PI * M_E);
}

/** How often the electron actually goes round: ν_g / γ. */
export function orbitalFrequency(gamma, bGauss) {
  const g = gyroFrequency(bGauss);
  return g === null || !(gamma >= 1) ? null : g / gamma;
}

/** Critical frequency (3/2) γ² ν_g sin α, Hz. */
export function criticalFrequency(gamma, bGauss, pitchRad = Math.PI / 2) {
  const g = gyroFrequency(bGauss);
  if (g === null || !(gamma >= 1)) return null;
  return 1.5 * gamma * gamma * g * Math.sin(pitchRad);
}

export const PEAK_X = 0.2858; // where F(x) peaks

/** Synchrotron function F(x) = x ∫ₓ^∞ K₅/₃(t) dt (approximation, see header). */
export function synchrotronF(x) {
  if (!positive(x)) return 0;
  const x13 = Math.cbrt(x);
  const x23 = x13 * x13;
  const x43 = x23 * x23;
  return (
    2.15 *
    x13 *
    (1 + 3.06 * x) ** (1 / 6) *
    ((1 + 0.884 * x23 + 0.471 * x43) / (1 + 1.64 * x23 + 0.974 * x43)) *
    Math.exp(-x)
  );
}

/** Radius of the helix, metres. */
export function larmorRadius(gamma, bGauss, pitchRad = Math.PI / 2) {
  if (!(gamma >= 1) || !positive(bGauss)) return null;
  return (gamma * betaOf(gamma) * M_E * C * Math.sin(pitchRad)) / (E_CHARGE * bGauss * GAUSS_TO_TESLA);
}

/** Power radiated by one electron, W. */
export function power(gamma, bGauss, pitchRad = Math.PI / 2) {
  if (!(gamma >= 1) || !positive(bGauss)) return null;
  const bT = bGauss * GAUSS_TO_TESLA;
  const uB = (bT * bT) / (2 * MU0);
  const b = betaOf(gamma);
  return 2 * SIGMA_T * C * b * b * gamma * gamma * uB * Math.sin(pitchRad) ** 2;
}

/** Time for the electron to radiate away its energy, seconds. */
export function coolingTime(gamma, bGauss, pitchRad = Math.PI / 2) {
  const p = power(gamma, bGauss, pitchRad);
  if (!positive(p)) return null;
  return (gamma * M_E * C * C) / p;
}

/** Half-angle of the beam, ≈ 1/γ (radians), capped at 90° for slow electrons. */
export const beamAngle = (gamma) => (gamma >= 1 ? Math.min(Math.PI / 2, 1 / gamma) : null);

export const hzToEv = (hz) => (H * hz) / E_CHARGE;
export const evToHz = (ev) => (ev * E_CHARGE) / H;
export const electronEnergyEv = (gamma) => gamma * ME_C2_EV;
export const yearsFromSeconds = (s) => s / SECONDS_PER_YEAR;

export function formatFrequency(hz) {
  if (!Number.isFinite(hz)) return "—";
  const units = [
    [1e12, "THz"],
    [1e9, "GHz"],
    [1e6, "MHz"],
    [1e3, "kHz"],
    [1, "Hz"],
  ];
  if (hz >= 1e15) {
    const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
    const exp = Math.floor(Math.log10(hz));
    return `${(hz / 10 ** exp).toFixed(1)} × 10${String(exp).split("").map((ch) => SUP[ch]).join("")} Hz`;
  }
  const [div, u] = units.find(([d]) => hz >= d) ?? units[units.length - 1];
  const v = hz / div;
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${u}`;
}

export function formatDuration(s) {
  if (!Number.isFinite(s)) return "—";
  const y = yearsFromSeconds(s);
  if (y >= 1e9) return `${(y / 1e9).toFixed(1)} billion years`;
  if (y >= 1e6) return `${(y / 1e6).toFixed(y >= 1e8 ? 0 : 1)} million years`;
  if (y >= 1) return `${y >= 100 ? y.toLocaleString("en-US", { maximumSignificantDigits: 3 }) : y.toFixed(1)} years`;
  if (s >= 86400) return `${(s / 86400).toFixed(1)} days`;
  if (s >= 3600) return `${(s / 3600).toFixed(1)} hours`;
  if (s >= 60) return `${(s / 60).toFixed(1)} minutes`;
  if (s >= 1) return `${s.toFixed(1)} s`;
  if (s >= 1e-3) return `${(s * 1e3).toFixed(1)} ms`;
  if (s >= 1e-6) return `${(s * 1e6).toFixed(1)} µs`;
  return `${(s * 1e9).toFixed(2)} ns`;
}

export function formatLength(m) {
  if (!Number.isFinite(m)) return "—";
  const AU = 1.495978707e11;
  if (m >= 0.1 * AU) return `${(m / AU).toFixed(m / AU >= 10 ? 0 : 2)} AU`;
  if (m >= 1e3) return `${(m / 1e3).toLocaleString("en-US", { maximumFractionDigits: m >= 1e5 ? 0 : 1 })} km`;
  if (m >= 1) return `${m.toFixed(m >= 100 ? 0 : 1)} m`;
  if (m >= 1e-2) return `${(m * 100).toFixed(1)} cm`;
  if (m >= 1e-3) return `${(m * 1e3).toFixed(1)} mm`;
  return `${(m * 1e6).toFixed(1)} µm`;
}

export function formatField(bGauss) {
  if (!Number.isFinite(bGauss)) return "—";
  if (bGauss >= 1e4) return `${(bGauss / 1e4).toLocaleString("en-US", { maximumSignificantDigits: 3 })} T`;
  if (bGauss >= 1) return `${bGauss.toLocaleString("en-US", { maximumSignificantDigits: 3 })} G`;
  if (bGauss >= 1e-3) return `${(bGauss * 1e3).toPrecision(3)} mG`;
  return `${(bGauss * 1e6).toPrecision(3)} µG`;
}
