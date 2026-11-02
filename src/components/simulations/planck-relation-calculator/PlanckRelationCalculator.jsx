import { useEffect, useMemo, useRef, useState } from "react";
import {
  ENERGY_UNITS,
  FREQUENCY_UNITS,
  classifyBand,
  energyJToFrequency,
  frequencyToEnergyJ,
  frequencyToWavelength,
  fromBase,
  toBase,
} from "../photon-energy-wavelength-frequency-converter/physics";
import { packetCycles, photonColor, spectrumPosition, spectrumSegments } from "./planckRelation";
import {
  PLANCK_RELATION_TEST_COLUMNS,
  PLANCK_RELATION_TEST_SOURCES,
  getPlanckRelationTestRows,
} from "./planckRelationTests";
import "../../../styles/photonConverter.css";
import "../../../styles/planckRelationCalculator.css";
import CalculatorVote from "../../CalculatorVote.jsx";
import CalculatorTests from "../../CalculatorTests.jsx";
import { trackEvent } from "../../../lib/analytics/trackEvent";

const DEFAULT_FREQUENCY_HZ = 5.45e14; // green light

const PRESETS = [
  { label: "FM radio", freqHz: 100e6 },
  { label: "21 cm hydrogen line", freqHz: 1420.405751e6 },
  { label: "Green light", freqHz: DEFAULT_FREQUENCY_HZ },
  { label: "X-ray (1 keV)", freqHz: energyJToFrequency(1e3 * ENERGY_UNITS.eV) },
  { label: "Gamma ray (511 keV)", freqHz: energyJToFrequency(511e3 * ENERGY_UNITS.eV) },
];

// Frequency is the one stored value; each field converts to and from it.
const FIELDS = {
  energy: {
    label: "Photon energy (E)",
    id: "prc-energy",
    units: ENERGY_UNITS,
    toFrequency: (value, unit) => energyJToFrequency(toBase(value, ENERGY_UNITS, unit)),
    fromFrequency: (freqHz, unit) => fromBase(frequencyToEnergyJ(freqHz), ENERGY_UNITS, unit),
  },
  frequency: {
    label: "Frequency (ν)",
    id: "prc-frequency",
    units: FREQUENCY_UNITS,
    toFrequency: (value, unit) => toBase(value, FREQUENCY_UNITS, unit),
    fromFrequency: (freqHz, unit) => fromBase(freqHz, FREQUENCY_UNITS, unit),
  },
};

const trim = (s) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);

function formatValue(n) {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e6 || n < 1e-4) {
    const exp = Math.floor(Math.log10(n));
    return `${trim((n / 10 ** exp).toFixed(4))}e${exp}`;
  }
  return trim(n.toFixed(n >= 100 ? 2 : n >= 1 ? 4 : 6));
}

const SUPERSCRIPT = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };

function formatWavelength(m) {
  const [unit, factor] = m >= 1 ? ["m", 1] : m >= 1e-3 ? ["mm", 1e-3] : m >= 1e-6 ? ["µm", 1e-6] : m >= 1e-9 ? ["nm", 1e-9] : ["pm", 1e-12];
  const v = m / factor;
  if (v >= 1e4 || v < 0.01) {
    const exp = Math.floor(Math.log10(v));
    return `${trim((v / 10 ** exp).toFixed(2))} × 10${String(exp).split("").map((c) => SUPERSCRIPT[c]).join("")} ${unit}`;
  }
  return `${trim(v.toFixed(v >= 100 ? 1 : 3))} ${unit}`;
}

function readInitialFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const freqHz = Number(params.get("f"));
  if (!params.get("f") || !Number.isFinite(freqHz) || freqHz <= 0) return null;
  return {
    freqHz,
    units: {
      energy: ENERGY_UNITS[params.get("eu")] ? params.get("eu") : "eV",
      frequency: FREQUENCY_UNITS[params.get("fu")] ? params.get("fu") : "THz",
    },
  };
}

// The photon as a wave packet crossing the view: a sine wave inside a smooth
// envelope. Schematic: cycle count is log-mapped from frequency, and height
// stays the same because a photon's energy is set by frequency, not amplitude.
function PhotonCanvas({ freqHz, color, label }) {
  const canvasRef = useRef(null);
  const latest = useRef({ freqHz, color });
  latest.current = { freqHz, color };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    const start = performance.now();

    const draw = (now) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const mid = h / 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();

      const packet = Math.min(w * 0.62, 420);
      const span = w + packet;
      const t = (now - start) / 1000;
      // Still (reduced motion): the packet rests at the centre of the view.
      const centre = still ? w / 2 : ((t * 90) % span) - packet / 2;
      const cycles = packetCycles(latest.current.freqHz);
      const amp = h * 0.36;
      const sigma = packet / 4.4;

      ctx.beginPath();
      for (let x = Math.max(0, centre - packet / 2); x <= Math.min(w, centre + packet / 2); x += 0.75) {
        const u = x - centre;
        const y = mid - amp * Math.exp(-(u * u) / (2 * sigma * sigma)) * Math.sin((2 * Math.PI * cycles * u) / packet);
        if (x === Math.max(0, centre - packet / 2)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = latest.current.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.shadowColor = latest.current.color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (!still && visible) raf = requestAnimationFrame(draw);
    };

    const redraw = () => {
      if (still) draw(performance.now());
    };
    canvas.addEventListener("prc-redraw", redraw);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    return () => {
      io.disconnect();
      canvas.removeEventListener("prc-redraw", redraw);
      cancelAnimationFrame(raf);
    };
  }, []);

  // With motion off nothing loops, so redraw the still frame on changes.
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event("prc-redraw"));
  }, [freqHz, color]);

  return <canvas ref={canvasRef} className="prc-canvas" role="img" aria-label={label} />;
}

export default function PlanckRelationCalculator() {
  const [freqHz, setFreqHz] = useState(DEFAULT_FREQUENCY_HZ);
  const [units, setUnits] = useState({ energy: "eV", frequency: "THz" });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // The page is static, so URL state is applied after mount.
  useEffect(() => {
    const initial = readInitialFromUrl();
    if (initial) {
      setFreqHz(initial.freqHz);
      setUnits(initial.units);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    const id = window.setTimeout(() => {
      const params = new URLSearchParams({ f: freqHz.toExponential(6), eu: units.energy, fu: units.frequency });
      window.history.replaceState(null, "", `${window.location.pathname}?${params}${window.location.hash}`);
    }, 300);
    return () => window.clearTimeout(id);
  }, [hydrated, freqHz, units]);

  const parsedDraft = Number(draft);
  const invalid = editing !== null && !(draft.trim() !== "" && Number.isFinite(parsedDraft) && parsedDraft > 0);

  const handleChange = (key, raw) => {
    setDraft(raw);
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value) || value <= 0) return;
    const next = FIELDS[key].toFrequency(value, units[key]);
    if (Number.isFinite(next) && next > 0) setFreqHz(next);
  };

  const copyLink = async () => {
    trackEvent("calculator-copy-link");
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context).
    }
  };

  const lambdaM = frequencyToWavelength(freqHz);
  const band = classifyBand(lambdaM);
  const color = photonColor(freqHz);
  const segments = useMemo(() => spectrumSegments(), []);
  const testRows = useMemo(() => getPlanckRelationTestRows(), []);

  return (
    <div className="pwf prc" aria-label="E = hν calculator">
      <div className="pwf-header">
        <p className="pwf-title">E = hν</p>
        <div className="pwf-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="pwf-preset-btn"
              onClick={() => {
                setFreqHz(preset.freqHz);
                setEditing(null);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pwf-fields">
        {Object.entries(FIELDS).map(([key, field]) => (
          <div className="pwf-field" key={key}>
            <label htmlFor={field.id}>{field.label}</label>
            <div className="pwf-field-row">
              <input
                id={field.id}
                className="pwf-input"
                type="text"
                inputMode="decimal"
                value={editing === key ? draft : formatValue(field.fromFrequency(freqHz, units[key]))}
                aria-invalid={editing === key && invalid}
                onFocus={() => {
                  setDraft(formatValue(field.fromFrequency(freqHz, units[key])));
                  setEditing(key);
                }}
                onChange={(e) => handleChange(key, e.target.value)}
                onBlur={() => setEditing(null)}
              />
              <select
                className="pwf-unit-select"
                value={units[key]}
                aria-label={`${field.label} unit`}
                onChange={(e) => setUnits((u) => ({ ...u, [key]: e.target.value }))}
              >
                {Object.keys(field.units).map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {invalid && <p className="prc-error" role="alert">Enter a number above zero, such as 2.25 or 5.45e14.</p>}
      </div>

      <div className="pwf-wave-card">
        <PhotonCanvas
          freqHz={freqHz}
          color={color}
          label={`Schematic photon wave packet, currently ${band.name.toLowerCase()}`}
        />
        <div className="prc-spectrum" aria-hidden="true">
          <div className="prc-spectrum-bar">
            {segments.map((seg) => (
              <span
                key={seg.name}
                className="prc-spectrum-seg"
                style={{ left: `${seg.start * 100}%`, width: `${(seg.end - seg.start) * 100}%`, background: seg.background }}
                title={seg.name}
              />
            ))}
            <span className="prc-spectrum-marker" style={{ left: `${spectrumPosition(freqHz) * 100}%` }} />
          </div>
          <div className="prc-spectrum-ends"><span>Lower energy</span><span>Higher energy</span></div>
        </div>
        <p className="pwf-wave-caption">
          Schematic: more energy means more tightly packed waves, but the number of waves drawn is
          illustrative, not to scale. Height doesn't change, because a photon's energy depends on
          its frequency alone.
        </p>
      </div>

      <div className="pwf-band-card">
        <span className="pwf-band-swatch" style={{ background: color, boxShadow: `0 0 18px 3px ${color}` }} aria-hidden="true" />
        <div className="pwf-band-info">
          <span className="pwf-band-label">Region of the spectrum</span>
          <span className="pwf-band-value">{band.name}</span>
        </div>
        <div className="pwf-band-info prc-wavelength">
          <span className="pwf-band-label">Wavelength</span>
          <span className="pwf-band-value">{formatWavelength(lambdaM)}</span>
        </div>
      </div>

      <div className="pwf-footer-row">
        <CalculatorVote slug="planck-relation-calculator" />
        <CalculatorTests
          title="E = hν Calculator: Tests"
          columns={PLANCK_RELATION_TEST_COLUMNS}
          rows={testRows}
          sources={PLANCK_RELATION_TEST_SOURCES}
        />
        <button type="button" className="pwf-copy-btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy shareable link"}
        </button>
      </div>
    </div>
  );
}
