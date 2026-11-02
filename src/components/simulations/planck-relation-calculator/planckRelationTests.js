// Rows for the "Tests" popup: runs the real conversions live against known
// values (same pattern as the other calculators' *Tests.js modules).
import {
  EV_TO_J,
  H,
  energyJToFrequency,
  frequencyToEnergyJ,
} from "../photon-energy-wavelength-frequency-converter/physics";

export const PLANCK_RELATION_TEST_COLUMNS = [
  { key: "test", label: "Test" },
  { key: "inputs", label: "Inputs" },
  { key: "expected", label: "Expected" },
  { key: "computed", label: "Computed" },
  { key: "result", label: "Result" },
];

export const PLANCK_RELATION_TEST_SOURCES = [
  {
    title: "Planck constant and the electronvolt",
    text: "h = 6.62607015 × 10⁻³⁴ J·s and 1 eV = 1.602176634 × 10⁻¹⁹ J are exact by definition in the SI since 2019.",
    url: "https://physics.nist.gov/cuu/Constants/",
    urlLabel: "NIST Fundamental Physical Constants",
  },
  {
    title: "21 cm hydrogen line",
    text: "1420.405751 MHz corresponds to about 5.874 µeV, the commonly quoted energy of neutral hydrogen's spin-flip transition.",
    url: "https://www.cv.nrao.edu/course/astr534/HILine.html",
    urlLabel: "NRAO: Essential Radio Astronomy, the HI Line",
  },
  {
    title: "Electron rest energy",
    text: "A 511 keV gamma ray, from electron–positron annihilation, has a frequency of about 1.236 × 10²⁰ Hz, the electron's Compton frequency.",
    url: "https://physics.nist.gov/cuu/Constants/",
    urlLabel: "NIST Fundamental Physical Constants",
  },
];

const close = (a, b, pct) => Math.abs((a - b) / b) * 100 < pct;
const sci = (n) => n.toExponential(4);

export function getPlanckRelationTestRows() {
  const eHI = frequencyToEnergyJ(1420.405751e6) / EV_TO_J;
  const fAnn = energyJToFrequency(511e3 * EV_TO_J);
  const fEv = energyJToFrequency(EV_TO_J);
  const back = energyJToFrequency(frequencyToEnergyJ(5.45e14));
  const ratio = frequencyToEnergyJ(2e15) / frequencyToEnergyJ(1e15);
  return [
    {
      test: "21 cm hydrogen line: frequency to energy",
      inputs: "ν = 1420.405751 MHz",
      expected: "≈ 5.874 × 10⁻⁶ eV",
      computed: `${sci(eHI)} eV`,
      pass: close(eHI, 5.874e-6, 0.05),
    },
    {
      test: "Annihilation gamma ray: energy to frequency",
      inputs: "E = 511 keV",
      expected: "≈ 1.236 × 10²⁰ Hz",
      computed: `${sci(fAnn)} Hz`,
      pass: close(fAnn, 1.236e20, 0.05),
    },
    {
      test: "1 eV: energy to frequency",
      inputs: "E = 1 eV",
      expected: "≈ 2.418 × 10¹⁴ Hz",
      computed: `${sci(fEv)} Hz`,
      pass: close(fEv, 2.418e14, 0.05),
    },
    {
      test: "Frequency 1 Hz gives exactly h",
      inputs: "ν = 1 Hz",
      expected: `${H} J`,
      computed: `${frequencyToEnergyJ(1)} J`,
      pass: frequencyToEnergyJ(1) === H,
    },
    {
      test: "Doubling frequency doubles energy",
      inputs: "ν = 10¹⁵ Hz and 2 × 10¹⁵ Hz",
      expected: "ratio = 2",
      computed: `ratio = ${ratio}`,
      pass: close(ratio, 2, 1e-9),
    },
    {
      test: "Round trip: frequency → energy → frequency",
      inputs: "ν = 5.45 × 10¹⁴ Hz",
      expected: "5.45 × 10¹⁴ Hz recovered",
      computed: `${sci(back)} Hz`,
      pass: close(back, 5.45e14, 1e-9),
    },
  ];
}
