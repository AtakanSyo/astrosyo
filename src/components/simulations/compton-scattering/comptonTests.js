// Reference checks for the Compton scattering visualization, run against
// the real compton.js functions.

import {
  scatteredEnergy,
  wavelengthPm,
  wavelengthShiftPm,
  recoilAngle,
  kleinNishinaRelative,
  thomsonAverage,
  headOnMaximum,
  kleinNishinaParameter,
  bandOf,
  COMPTON_WAVELENGTH_PM,
} from "./compton";

const close = (a, b, pct) => Number.isFinite(a) && Math.abs((a - b) / b) * 100 < pct;
const fmt = (n, d = 3) => (Number.isFinite(n) ? Number(n.toFixed(d)).toString() : String(n));
const deg = (d) => (d * Math.PI) / 180;

export function getComptonTestRows() {
  const moKa = 17.48; // molybdenum Kα, the X-rays Compton used in 1923
  const lam = wavelengthPm(moKa);
  const e90 = scatteredEnergy(moKa, deg(90));
  const cs = 661.657; // caesium-137 gamma line
  const back = scatteredEnergy(cs, Math.PI);
  return [
    { test: "Compton wavelength h/mₑc", expected: "2.4263 pm", computed: `${fmt(COMPTON_WAVELENGTH_PM, 4)} pm`, pass: close(COMPTON_WAVELENGTH_PM, 2.42631, 0.01) },
    { test: "Mo Kα wavelength", expected: "70.9 pm", computed: `${fmt(lam, 1)} pm`, pass: close(lam, 70.93, 0.1) },
    { test: "Shift at 90° equals one Compton wavelength", expected: "2.4263 pm", computed: `${fmt(wavelengthPm(e90) - lam, 4)} pm`, pass: close(wavelengthPm(e90) - lam, 2.42631, 0.05) },
    { test: "Shift formula agrees", expected: "4.853 pm at 180°", computed: `${fmt(wavelengthShiftPm(Math.PI), 3)} pm`, pass: close(wavelengthShiftPm(Math.PI), 4.8526, 0.01) },
    { test: "Cs-137 backscatter peak", expected: "184.3 keV", computed: `${fmt(back, 1)} keV`, pass: close(back, 184.3, 0.1) },
    { test: "Cs-137 Compton edge", expected: "477.3 keV", computed: `${fmt(cs - back, 1)} keV`, pass: close(cs - back, 477.3, 0.1) },
    { test: "Recoil straight ahead on backscatter", expected: "0°", computed: `${fmt((recoilAngle(cs, Math.PI) * 180) / Math.PI, 2)}°`, pass: recoilAngle(cs, Math.PI) === 0 },
    { test: "Low energy: Klein–Nishina → Thomson, (1 + cos²θ)/2", expected: "0.5 at 90°", computed: fmt(kleinNishinaRelative(0.001, deg(90)), 4), pass: close(kleinNishinaRelative(0.001, deg(90)), 0.5, 0.1) },
    { test: "High energy: forward-peaked", expected: "< 0.1 at 90°, 10 MeV", computed: fmt(kleinNishinaRelative(10000, deg(90)), 4), pass: kleinNishinaRelative(10000, deg(90)) < 0.1 },
    { test: "Inverse Compton: CMB photon, γ = 10⁴", expected: "≈ 84 keV", computed: `${fmt(thomsonAverage(1e4, 6.34e-4) / 1e3, 1)} keV`, pass: close(thomsonAverage(1e4, 6.34e-4), 84533, 0.1) },
    { test: "Head-on maximum is 3× the average (Thomson)", expected: "3.00", computed: fmt(headOnMaximum(1000, 1e-6) / thomsonAverage(1000, 1e-6), 3), pass: close(headOnMaximum(1000, 1e-6) / thomsonAverage(1000, 1e-6), 3, 0.01) },
    { test: "Klein–Nishina caps the energy below γmₑc²", expected: "< 5.11 TeV", computed: `${fmt(headOnMaximum(1e7, 10) / 1e12, 3)} TeV`, pass: headOnMaximum(1e7, 10) < 1e7 * 510998.95 && kleinNishinaParameter(1e7, 10) > 1 },
    { test: "Electron at rest: head-on formula reduces to Compton backscatter", expected: `${fmt(scatteredEnergy(661.657, Math.PI), 2)} keV`, computed: `${fmt(headOnMaximum(1, 661657) / 1e3, 2)} keV`, pass: close(headOnMaximum(1, 661657) / 1e3, scatteredEnergy(661.657, Math.PI), 0.01) },
    { test: "Electron at rest: no average gain", expected: "1.000", computed: fmt(thomsonAverage(1, 2) / 2, 3), pass: thomsonAverage(1, 2) === 2 },
    { test: "84 keV is an X-ray", expected: "X-ray", computed: bandOf(84000).label, pass: bandOf(84000).key === "xray" },
  ];
}
