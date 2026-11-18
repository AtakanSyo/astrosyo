import { useEffect, useMemo, useState } from "react";
import {
  magnification,
  exitPupilMm,
  eyePupilForAge,
  effectiveAperture,
  classifyExitPupil,
  eyepieceTable,
  BANDS,
} from "./exitPupil";
import { EXIT_PUPIL_TEST_COLUMNS, EXIT_PUPIL_TEST_SOURCES, getExitPupilTestRows } from "./exitPupilTests";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import CalculatorVote from "../../CalculatorVote.jsx";
import CalculatorTests from "../../CalculatorTests.jsx";
import { trackEvent } from "../../../lib/analytics/trackEvent";
import Katex from "../../Katex.jsx";

// Real, widely sold telescopes (manufacturer specs) with a typical eyepiece.
const PRESETS = [
  { label: "8\" Dobsonian + 25 mm", D: "203", F: "1200", f: "25" },
  { label: "102 mm refractor + 32 mm", D: "102", F: "660", f: "32" },
  { label: "Celestron C8 + 9 mm", D: "203", F: "2032", f: "9" },
  { label: "90 mm Maksutov + 6 mm", D: "90", F: "1250", f: "6" },
];

const TONE = { wasted: "bad", wide: "good", deepsky: "good", planetary: "good", fine: "warn", empty: "bad" };

function trimTrailingZeros(s) {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
function fmt(n, d) {
  if (!Number.isFinite(n) || n < 0) return "—";
  const decimals = d ?? (n >= 100 ? 0 : n >= 10 ? 1 : 2);
  return trimTrailingZeros(n.toFixed(decimals));
}

function readInitialFromUrl() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  if (!p.has("d")) return null;
  const val = (k) => (p.get(k) !== null && Number.isFinite(parseFloat(p.get(k))) ? p.get(k) : "");
  return {
    mode: p.get("m") === "mag" ? "mag" : "eyepiece",
    D: val("d"),
    F: val("fl"),
    f: val("ep"),
    M: val("x"),
    age: val("age"),
    pupil: val("pupil"),
  };
}

export default function ExitPupilCalculator() {
  const [mode, setMode] = useState("eyepiece");
  const [D, setD] = useState("203");
  const [F, setF] = useState("1200");
  const [f, setF2] = useState("25");
  const [M, setM] = useState("100");
  const [age, setAge] = useState("35");
  const [pupil, setPupil] = useState("");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const init = readInitialFromUrl();
    if (init) {
      setMode(init.mode);
      if (init.D) setD(init.D);
      if (init.F) setF(init.F);
      if (init.f) setF2(init.f);
      if (init.M) setM(init.M);
      if (init.age) setAge(init.age);
      setPupil(init.pupil);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      const p = new URLSearchParams({ m: mode, d: D, fl: F, ep: f, x: M, age });
      if (pupil) p.set("pupil", pupil);
      window.history.replaceState(null, "", `${window.location.pathname}?${p}${window.location.hash}`);
    }, 300);
    return () => window.clearTimeout(id);
  }, [hydrated, mode, D, F, f, M, age, pupil]);

  const eye = useMemo(() => {
    const own = parseFloat(pupil);
    if (Number.isFinite(own) && own > 0) return { mm: own, fromAge: false };
    const byAge = eyePupilForAge(parseFloat(age));
    return byAge ? { mm: byAge, fromAge: true } : { mm: 7, fromAge: false };
  }, [age, pupil]);

  const result = useMemo(() => {
    const Dn = parseFloat(D);
    if (!(Dn > 0)) return { valid: false, reason: "Enter a positive aperture." };
    let Mn;
    let Fn = parseFloat(F);
    if (mode === "eyepiece") {
      const fn = parseFloat(f);
      if (!(Fn > 0) || !(fn > 0)) return { valid: false, reason: "Enter a positive focal length and eyepiece focal length." };
      Mn = magnification(Fn, fn);
    } else {
      Mn = parseFloat(M);
      if (!(Mn > 0)) return { valid: false, reason: "Enter a positive magnification." };
    }
    const ep = exitPupilMm(Dn, Mn);
    const band = classifyExitPupil(ep, eye.mm);
    const effD = effectiveAperture(Dn, Mn, eye.mm);
    const table = Fn > 0 ? eyepieceTable(Dn, Fn, eye.mm) : null;
    return { valid: true, D: Dn, F: Fn > 0 ? Fn : null, M: Mn, ep, band, effD, table };
  }, [mode, D, F, f, M, eye]);

  // circles to the same scale, the larger one capped at 64 px radius
  const circles = useMemo(() => {
    if (!result.valid) return null;
    const big = Math.max(result.ep, eye.mm);
    const k = 64 / big;
    return { eyeR: eye.mm * k, scopeR: Math.max(result.ep * k, 1.5) };
  }, [result, eye]);

  // horizontal gauge, 0–8 mm, with the use bands behind it
  const gauge = useMemo(() => {
    const width = 640;
    const left = 20;
    const right = width - 20;
    const maxMm = 8;
    const x = (mm) => right - (Math.min(mm, maxMm) / maxMm) * (right - left);
    const edges = [maxMm, ...BANDS.map((b) => b.min)];
    const bands = BANDS.map((b, i) => ({ key: b.key, label: b.label, x1: x(edges[i]), x2: x(edges[i + 1]), i }));
    return { width, left, right, x, bands, maxMm };
  }, []);

  const applyPreset = (p) => {
    setMode("eyepiece");
    setD(p.D);
    setF(p.F);
    setF2(p.f);
  };

  const testRows = useMemo(() => getExitPupilTestRows(), []);

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

  const input = (id, label, value, setter, unit, extra = {}) => (
    <div className="tmc-field">
      <label htmlFor={id}>{label}</label>
      <div className="tmc-input-row">
        <input
          id={id}
          className="tmc-input"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={(e) => setter(e.target.value)}
          {...extra}
        />
        <span className="tmc-static-unit">{unit}</span>
      </div>
    </div>
  );

  const tone = result.valid ? TONE[result.band.key] : null;

  return (
    <div className="tmc" aria-label="Exit pupil calculator">
      <div className="tmc-header">
        <p className="tmc-title">Exit pupil calculator</p>
        <div className="tmc-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="tmc-preset-btn" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="tmc-explainer">
        <Katex tex="\text{exit pupil} = D / M = f_{\text{eyepiece}} / N" /> — the width of the beam of light that leaves
        the eyepiece and enters your eye.
      </p>

      <div className="tt-row">
        <div className="tt-seg" role="radiogroup" aria-label="Input mode">
          <span className="tt-seg-label">I know the</span>
          {[
            ["eyepiece", "Eyepiece"],
            ["mag", "Magnification"],
          ].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} className={`tt-seg-btn${mode === k ? " is-on" : ""}`} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="tmc-fields">
        {input("ep-d", <>Aperture (<Katex tex="D" />)</>, D, setD, "mm")}
        {input("ep-fl", <>Telescope focal length (<Katex tex="F" />){mode === "mag" ? ", optional" : ""}</>, F, setF, "mm")}
        {mode === "eyepiece"
          ? input("ep-f", <>Eyepiece focal length (<Katex tex="f" />)</>, f, setF2, "mm")
          : input("ep-m", <>Magnification (<Katex tex="M" />)</>, M, setM, "×")}
        {input("ep-age", "Your age", age, setAge, "years")}
        {input("ep-pupil", "Your eye pupil, if known", pupil, setPupil, "mm", { placeholder: eye.fromAge ? `≈ ${fmt(eye.mm, 1)}` : "" })}
      </div>

      {!result.valid ? (
        <p className="tmc-note tmc-note--warn" role="alert">{result.reason}</p>
      ) : (
        <>
          <div className={`tmc-headline-card tmc-tone-${tone}`}>
            <div className="tmc-headline">Exit pupil {fmt(result.ep)} mm</div>
            <div className="tmc-headline-sub">
              {fmt(result.M, 1)}× in a {fmt(result.D, 0)} mm scope
              {result.F && <> (f/{fmt(result.F / result.D, 1)})</>} · Your eye ≈ {fmt(eye.mm, 1)} mm
              {eye.fromAge ? " (estimated from age)" : ""}
            </div>
            <div className="tmc-verdict">
              {result.band.key === "wasted" ? (
                <>
                  <span className="tmc-verdict-title">Wider than your eye's pupil.</span> Your eye only takes in the
                  central {fmt(eye.mm, 1)} mm of the beam, so the scope works like a {fmt(result.effD, 0)} mm one at this
                  magnification. Use a shorter eyepiece (or a little more power) to get all of the aperture back.
                </>
              ) : (
                <>
                  <span className="tmc-verdict-title">{result.band.label}.</span> {result.band.use}
                </>
              )}
            </div>
          </div>

          {circles && (
            <div className="chart-wrap">
              <svg className="tmc-pupil-svg" viewBox="0 0 640 160" role="img" aria-label={`Exit pupil ${fmt(result.ep)} millimetres compared to your eye's pupil of about ${fmt(eye.mm, 1)} millimetres`}>
                <circle cx="220" cy="72" r={circles.eyeR} className="tmc-eye-pupil" />
                <text x="220" y="152" className="tmc-pupil-label" textAnchor="middle">your eye ≈ {fmt(eye.mm, 1)} mm</text>
                <circle cx="420" cy="72" r={circles.scopeR} className="tmc-scope-pupil" />
                <text x="420" y="152" className="tmc-pupil-label" textAnchor="middle">exit pupil {fmt(result.ep)} mm</text>
              </svg>
              <p className="tmc-chart-caption">Both circles drawn to the same scale.</p>
            </div>
          )}

          <div className="chart-wrap">
            <svg className="tmc-gauge-svg" viewBox={`0 0 ${gauge.width} 96`} role="img" aria-label="Exit pupil scale from 8 millimetres down to zero, with what each range is good for">
              {gauge.bands.map((b) => (
                <rect key={b.key} x={b.x1} y="18" width={Math.max(0, b.x2 - b.x1)} height="30" className={`tt-band tt-band-${b.i}`} />
              ))}
              {[8, 7, 6, 5, 4, 3, 2, 1, 0].map((mm) => (
                <text key={mm} x={gauge.x(mm)} y="64" className="tt-scale-tick" textAnchor="middle">{mm}</text>
              ))}
              <line x1={gauge.x(eye.mm)} x2={gauge.x(eye.mm)} y1="10" y2="56" className="tmc-gauge-boundary" />
              <text x={gauge.x(eye.mm)} y="9" className="tmc-gauge-boundary-label" textAnchor="middle">your eye</text>
              <circle cx={gauge.x(result.ep)} cy="33" r="6" className="tmc-gauge-marker" />
              <text x={gauge.left} y="86" className="tmc-gauge-label">wide fields</text>
              <text x={(gauge.left + gauge.right) / 2} y="86" className="tmc-gauge-label" textAnchor="middle">deep-sky · planets</text>
              <text x={gauge.right} y="86" className="tmc-gauge-label" textAnchor="end">doubles · empty</text>
            </svg>
            <p className="tmc-chart-caption">
              Exit pupil in millimetres, large on the left (low power) to small on the right (high power).
              {result.ep > gauge.maxMm && " This setup is off the left end of the scale."}
            </p>
          </div>

          {result.table ? (
            <>
              <p className="tmc-note">Eyepieces that give each useful exit pupil in this scope (f/{fmt(result.F / result.D, 1)}):</p>
              <div className="tt-table-wrap">
                <table className="tt-table">
                  <thead>
                    <tr>
                      <th>Exit pupil</th>
                      <th>Eyepiece</th>
                      <th>Magnification</th>
                      <th>Good for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.table.map((r) => (
                      <tr key={r.exitPupil}>
                        <td className="num">{fmt(r.exitPupil, 1)} mm</td>
                        <td className="num">{fmt(r.eyepiece, 1)} mm</td>
                        <td className="num">{fmt(r.magnification, 0)}×</td>
                        <td>{r.band.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="tmc-note">Add the telescope's focal length to see which eyepieces give each useful exit pupil.</p>
          )}

          <p className="tmc-note">
            Related: the <a href="/posts/telescope-magnification-calculator">Telescope Magnification Calculator</a> and
            the <a href="/posts/telescope-focal-length-calculator">Focal Length &amp; Focal Ratio Calculator</a>.
          </p>
        </>
      )}

      <div className="tmc-footer-row">
        <CalculatorVote slug="exit-pupil-calculator" />
        <CalculatorTests
          title="Exit Pupil Calculator — Tests"
          columns={EXIT_PUPIL_TEST_COLUMNS}
          rows={testRows}
          sources={EXIT_PUPIL_TEST_SOURCES}
        />
        <button type="button" className="tmc-copy-btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy shareable link"}
        </button>
      </div>
    </div>
  );
}
