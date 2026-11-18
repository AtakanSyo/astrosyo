import { useEffect, useMemo, useState } from "react";
import {
  classicLimit,
  gainOverEye,
  lightGrasp,
  skyLimit,
  nelmForBortle,
  reachableTargets,
  BORTLE_LABEL,
} from "./limitingMagnitude";
import {
  LIMITING_MAGNITUDE_TEST_COLUMNS,
  LIMITING_MAGNITUDE_TEST_SOURCES,
  getLimitingMagnitudeTestRows,
} from "./limitingMagnitudeTests";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import CalculatorVote from "../../CalculatorVote.jsx";
import CalculatorTests from "../../CalculatorTests.jsx";
import { trackEvent } from "../../../lib/analytics/trackEvent";
import Katex from "../../Katex.jsx";

const MM_PER_INCH = 25.4;

const PRESETS = [
  { label: "70 mm refractor", D: "70" },
  { label: "130 mm reflector", D: "130" },
  { label: "8\" Dobsonian", D: "203" },
  { label: "12\" Dobsonian", D: "305" },
];

const SCALE_MIN = 0;
const SCALE_MAX = 16;

function fmt(n, d = 1) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}
function fmtGrasp(n) {
  if (!Number.isFinite(n)) return "—";
  return n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(0);
}

function readInitialFromUrl() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  if (!p.has("d")) return null;
  const val = (k) => (p.get(k) !== null && Number.isFinite(parseFloat(p.get(k))) ? p.get(k) : "");
  const b = p.get("bortle");
  return {
    D: val("d"),
    unit: p.get("u") === "in" ? "in" : "mm",
    sky: b === "nelm" || (b && BORTLE_LABEL[b]) ? b : "4",
    nelm: val("nelm"),
    pupil: val("pupil"),
  };
}

export default function TelescopeLimitingMagnitudeCalculator() {
  const [D, setD] = useState("203");
  const [unit, setUnit] = useState("mm");
  const [sky, setSky] = useState("4");
  const [nelm, setNelm] = useState("6.0");
  const [pupil, setPupil] = useState("7");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const init = readInitialFromUrl();
    if (init) {
      if (init.D) setD(init.D);
      setUnit(init.unit);
      setSky(init.sky);
      if (init.nelm) setNelm(init.nelm);
      if (init.pupil) setPupil(init.pupil);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      const p = new URLSearchParams({ d: D, u: unit, bortle: sky, pupil });
      if (sky === "nelm") p.set("nelm", nelm);
      window.history.replaceState(null, "", `${window.location.pathname}?${p}${window.location.hash}`);
    }, 300);
    return () => window.clearTimeout(id);
  }, [hydrated, D, unit, sky, nelm, pupil]);

  const result = useMemo(() => {
    const Dmm = parseFloat(D) * (unit === "in" ? MM_PER_INCH : 1);
    if (!(Dmm > 0)) return { valid: false, reason: "Enter a positive aperture." };
    const p = parseFloat(pupil);
    if (!(p > 0)) return { valid: false, reason: "Enter your eye's pupil size (7 mm is typical for a young, dark-adapted eye)." };
    const n = sky === "nelm" ? parseFloat(nelm) : nelmForBortle(Number(sky));
    if (!Number.isFinite(n)) return { valid: false, reason: "Enter the faintest star you can see with the naked eye." };
    const limit = skyLimit(Dmm, n, p);
    return {
      valid: true,
      Dmm,
      nelm: n,
      pupil: p,
      limit,
      classic: classicLimit(Dmm),
      gain: gainOverEye(Dmm, p),
      grasp: lightGrasp(Dmm, p),
      targets: reachableTargets(limit),
    };
  }, [D, unit, sky, nelm, pupil]);

  const scale = useMemo(() => {
    const width = 640;
    const left = 24;
    const right = width - 24;
    const x = (m) => left + ((Math.min(Math.max(m, SCALE_MIN), SCALE_MAX) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * (right - left);
    return { width, left, right, x };
  }, []);

  const applyPreset = (p) => {
    setUnit("mm");
    setD(p.D);
  };

  const testRows = useMemo(() => getLimitingMagnitudeTestRows(), []);

  const copyLink = async () => {
    trackEvent("calculator-copy-link");
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API can fail silently — no-op.
    }
  };

  const reachedCount = result.valid ? result.targets.filter((t) => t.reachable).length : 0;

  return (
    <div className="tmc" aria-label="Telescope limiting magnitude calculator">
      <div className="tmc-header">
        <p className="tmc-title">Telescope limiting magnitude calculator</p>
        <div className="tmc-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="tmc-preset-btn" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="tmc-explainer">
        <Katex tex="m = m_{\text{eye}} + 5\log_{10}(D / d_{\text{pupil}})" /> — the faintest star your naked eye
        can see, plus the telescope's light-gathering gain over your eye.
      </p>

      <div className="tt-row">
        <div className="tt-seg" role="radiogroup" aria-label="Aperture unit">
          <span className="tt-seg-label">Units</span>
          {["mm", "in"].map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              className={`tt-seg-btn${unit === u ? " is-on" : ""}`}
              onClick={() => {
                if (u === unit) return;
                const v = parseFloat(D);
                if (Number.isFinite(v)) {
                  const out = u === "in" ? v / MM_PER_INCH : v * MM_PER_INCH;
                  setD(String(Number(out.toFixed(u === "in" ? 2 : 0))));
                }
                setUnit(u);
              }}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="lm-d">Aperture (<Katex tex="D" />)</label>
          <div className="tmc-input-row">
            <input id="lm-d" className="tmc-input" type="number" min="0" step="any" inputMode="decimal" value={D} onChange={(e) => setD(e.target.value)} />
            <span className="tmc-static-unit">{unit}</span>
          </div>
        </div>
        <div className="tmc-field">
          <label htmlFor="lm-sky">Sky darkness</label>
          <select id="lm-sky" className="tmc-input" value={sky} onChange={(e) => setSky(e.target.value)}>
            {Object.entries(BORTLE_LABEL).map(([b, label]) => (
              <option key={b} value={b}>
                Bortle {b}: {label} (naked eye {fmt(nelmForBortle(Number(b)))})
              </option>
            ))}
            <option value="nelm">I know my naked-eye limit</option>
          </select>
        </div>
        {sky === "nelm" && (
          <div className="tmc-field">
            <label htmlFor="lm-nelm">Naked-eye limiting magnitude</label>
            <div className="tmc-input-row">
              <input id="lm-nelm" className="tmc-input" type="number" step="0.1" inputMode="decimal" value={nelm} onChange={(e) => setNelm(e.target.value)} />
              <span className="tmc-static-unit">mag</span>
            </div>
          </div>
        )}
        <div className="tmc-field">
          <label htmlFor="lm-pupil">Eye pupil (<Katex tex="d_{\text{pupil}}" />)</label>
          <div className="tmc-input-row">
            <input id="lm-pupil" className="tmc-input" type="number" min="0" step="0.1" inputMode="decimal" value={pupil} onChange={(e) => setPupil(e.target.value)} />
            <span className="tmc-static-unit">mm</span>
          </div>
        </div>
      </div>

      {!result.valid ? (
        <p className="tmc-note tmc-note--warn" role="alert">{result.reason}</p>
      ) : (
        <>
          <div className="tmc-headline-card tmc-tone-good">
            <div className="tmc-headline">Magnitude {fmt(result.limit)}</div>
            <div className="tmc-headline-sub">
              Naked eye {fmt(result.nelm)} + {fmt(result.gain)} mag from the aperture ({fmtGrasp(result.grasp)}× the light
              of your eye) · Classic rule of thumb for {Math.round(result.Dmm)} mm: {fmt(result.classic)}
            </div>
            <div className="tmc-verdict">
              <span className="tmc-verdict-title">
                {reachedCount} of {result.targets.length} test targets below are within reach.
              </span>{" "}
              Experienced observers using averted vision and high magnification often go about half a magnitude
              deeper; haze, poor seeing or a dusty mirror take some of that back.
            </div>
          </div>

          <div className="chart-wrap">
            <svg className="tmc-gauge-svg" viewBox={`0 0 ${scale.width} 154`} role="img" aria-label={`Magnitude scale: naked eye to ${fmt(result.nelm)}, telescope to ${fmt(result.limit)}`}>
              <rect x={scale.x(SCALE_MIN)} y="54" width={scale.x(result.nelm) - scale.x(SCALE_MIN)} height="16" className="tt-scale-eye" />
              <rect x={scale.x(result.nelm)} y="54" width={Math.max(0, scale.x(result.limit) - scale.x(result.nelm))} height="16" className="tt-scale-reach" />
              <line x1={scale.left} x2={scale.right} y1="70" y2="70" className="tt-scale-axis" />
              {Array.from({ length: (SCALE_MAX - SCALE_MIN) / 2 + 1 }, (_, i) => SCALE_MIN + i * 2).map((m) => (
                <text key={m} x={scale.x(m)} y="84" className="tt-scale-tick" textAnchor="middle">{m}</text>
              ))}
              <line x1={scale.x(result.limit)} x2={scale.x(result.limit)} y1="44" y2="74" className="tt-scale-limit" />
              <text x={scale.x(result.limit)} y="38" className="tmc-gauge-boundary-label" textAnchor="middle">
                limit {fmt(result.limit)}
              </text>
              <text x={scale.x(result.nelm / 2)} y="48" className="tmc-gauge-label" textAnchor="middle">naked eye</text>
              {result.targets.map((t, i) => (
                <g key={t.name}>
                  <circle cx={scale.x(t.mag)} cy={i % 2 ? 128 : 100} r="4" className={`tt-scale-dot${t.reachable ? "" : " is-out"}`} />
                  <text x={scale.x(t.mag)} y={i % 2 ? 144 : 116} className="tt-scale-tick" textAnchor="middle">{t.name}</text>
                </g>
              ))}
            </svg>
            <p className="tmc-chart-caption">
              Brighter to the left, fainter to the right. Filled dots are within reach of this telescope under this sky.
            </p>
          </div>

          <div className="tt-table-wrap">
            <table className="tt-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Magnitude</th>
                  <th>Visible?</th>
                </tr>
              </thead>
              <tbody>
                {result.targets.map((t) => (
                  <tr key={t.name}>
                    <td>
                      {t.name} <span className="tt-no">· {t.note}</span>
                    </td>
                    <td className="num">{fmt(t.mag)}</td>
                    <td className={t.reachable ? "tt-yes" : "tt-no"}>
                      {t.reachable ? `Yes (${fmt(t.margin)} mag to spare)` : `No (${fmt(-t.margin)} mag too faint)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="tmc-note">
            These limits are for stars and other point-like targets. Galaxies and nebulae spread their light over an area,
            so one listed at magnitude {Math.floor(result.limit - 1)} can still be invisible in this scope. Related: the{" "}
            <a href="/posts/exit-pupil-calculator">Exit Pupil Calculator</a> and the{" "}
            <a href="/posts/telescope-angular-resolution-calculator">Telescope Angular Resolution Calculator</a>.
          </p>
        </>
      )}

      <div className="tmc-footer-row">
        <CalculatorVote slug="telescope-limiting-magnitude-calculator" />
        <CalculatorTests
          title="Telescope Limiting Magnitude Calculator — Tests"
          columns={LIMITING_MAGNITUDE_TEST_COLUMNS}
          rows={testRows}
          sources={LIMITING_MAGNITUDE_TEST_SOURCES}
        />
        <button type="button" className="tmc-copy-btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy shareable link"}
        </button>
      </div>
    </div>
  );
}
