import { useEffect, useMemo, useState } from "react";
import { MM_PER_INCH, solve, withMultiplier, classifySpeed } from "./focalLength";
import { FOCAL_LENGTH_TEST_COLUMNS, FOCAL_LENGTH_TEST_SOURCES, getFocalLengthTestRows } from "./focalLengthTests";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import CalculatorVote from "../../CalculatorVote.jsx";
import CalculatorTests from "../../CalculatorTests.jsx";
import { trackEvent } from "../../../lib/analytics/trackEvent";
import Katex from "../../Katex.jsx";

// Real, widely sold telescopes (manufacturer specs).
const PRESETS = [
  { label: "8\" Dobsonian (203 / 1200 mm)", D: "203", F: "1200" },
  { label: "102 mm refractor (102 / 660 mm)", D: "102", F: "660" },
  { label: "Celestron C8 SCT (203 / 2032 mm)", D: "203", F: "2032" },
  { label: "90 mm Maksutov (90 / 1250 mm)", D: "90", F: "1250" },
];

const MULTIPLIERS = [
  { value: "1", label: "None" },
  { value: "0.63", label: "0.63× reducer" },
  { value: "2", label: "2× Barlow" },
  { value: "3", label: "3× Barlow" },
];

const SPEED = {
  fast: {
    tone: "warn",
    title: "Fast",
    text: "A fast scope packs a wide field into the eyepiece, which suits large deep-sky targets and astrophotography. The trade-offs: collimation has to be more precise, coma shows at the edge of the field in Newtonians, and cheap eyepieces look worse.",
  },
  medium: {
    tone: "good",
    title: "Medium",
    text: "The all-rounder range most beginner Dobsonians and refractors sit in: wide enough for most deep-sky objects, slow enough that collimation and budget eyepieces are forgiving.",
  },
  slow: {
    tone: "good",
    title: "Slow",
    text: "A slow scope reaches high magnification with comfortable, longer eyepieces and keeps images sharp across the field, which suits the Moon, planets and double stars. The field of view is narrower, so the largest deep-sky objects won't fit.",
  },
};

const FIELD_LABEL = { F: "Focal length", D: "Aperture", N: "Focal ratio" };

function trimTrailingZeros(s) {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
function fmt(n) {
  if (!Number.isFinite(n) || n < 0) return "—";
  const decimals = n >= 1000 ? 0 : n >= 100 ? 1 : n >= 10 ? 1 : 2;
  return trimTrailingZeros(n.toFixed(decimals));
}

function readInitialFromUrl() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const solveFor = p.get("solve");
  if (!["F", "D", "N"].includes(solveFor)) return null;
  const val = (k) => (p.get(k) !== null && Number.isFinite(parseFloat(p.get(k))) ? p.get(k) : "");
  return { solveFor, D: val("d"), F: val("fl"), N: val("n"), unit: p.get("u") === "in" ? "in" : "mm", mult: val("x") || "1" };
}

export default function TelescopeFocalLengthCalculator() {
  const [solveFor, setSolveFor] = useState("N");
  const [unit, setUnit] = useState("mm");
  const [D, setD] = useState("203");
  const [F, setF] = useState("1200");
  const [N, setN] = useState("5.9");
  const [mult, setMult] = useState("1");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = readInitialFromUrl();
    if (initial) {
      setSolveFor(initial.solveFor);
      setUnit(initial.unit);
      if (initial.D) setD(initial.D);
      if (initial.F) setF(initial.F);
      if (initial.N) setN(initial.N);
      setMult(initial.mult);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      const p = new URLSearchParams({ solve: solveFor, d: D, fl: F, n: N, u: unit, x: mult });
      window.history.replaceState(null, "", `${window.location.pathname}?${p}${window.location.hash}`);
    }, 300);
    return () => window.clearTimeout(id);
  }, [hydrated, solveFor, D, F, N, unit, mult]);

  const toMm = (v) => (unit === "in" ? v * MM_PER_INCH : v);
  const fromMm = (v) => (unit === "in" ? v / MM_PER_INCH : v);

  const result = useMemo(() => {
    const inputs = { F: toMm(parseFloat(F)), D: toMm(parseFloat(D)), N: parseFloat(N) };
    const solved = solve(solveFor, inputs);
    if (!solved) {
      const need = ["F", "D", "N"].filter((k) => k !== solveFor).map((k) => FIELD_LABEL[k].toLowerCase()).join(" and ");
      return { valid: false, reason: `Enter a positive ${need}.` };
    }
    const factor = parseFloat(mult);
    const eff = factor !== 1 ? withMultiplier(solved.F, solved.D, factor) : null;
    const shownN = eff ? eff.N : solved.N;
    return { valid: true, ...solved, factor, eff, speed: classifySpeed(shownN), shownN };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solveFor, D, F, N, mult, unit]);

  // light cone drawn to scale: aperture as the open end, focal length as the cone's length
  const cone = useMemo(() => {
    if (!result.valid) return null;
    const Fdraw = result.eff ? result.eff.F : result.F;
    const width = 640;
    const height = 170;
    const left = 20;
    const maxLen = width - 2 * left - 30;
    const ratio = result.D / Fdraw;
    // fit the long axis; keep the opening at least visible
    let len = maxLen;
    let open = len * ratio;
    const maxOpen = 120;
    if (open > maxOpen) {
      len = len * (maxOpen / open);
      open = maxOpen;
    }
    open = Math.max(open, 4);
    const cy = 78;
    return { width, height, left, len, open, cy, focusX: left + len, Fdraw };
  }, [result]);

  const unitLabel = unit === "in" ? "in" : "mm";
  const applyPreset = (p) => {
    setUnit("mm");
    setSolveFor("N");
    setD(p.D);
    setF(p.F);
    setMult("1");
  };

  const testRows = useMemo(() => getFocalLengthTestRows(), []);

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

  const speed = result.valid ? SPEED[result.speed] : null;

  const field = (key, value, setter, unitText) => (
    <div className="tmc-field" key={key}>
      <label htmlFor={`tfl-${key}`}>
        {FIELD_LABEL[key]} {key === "N" ? <>(<Katex tex="N" />)</> : <>(<Katex tex={key} />)</>}
      </label>
      <div className="tmc-input-row">
        <input
          id={`tfl-${key}`}
          className="tmc-input"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={(e) => setter(e.target.value)}
        />
        <span className="tmc-static-unit">{unitText}</span>
      </div>
    </div>
  );

  return (
    <div className="tmc" aria-label="Telescope focal length and focal ratio calculator">
      <div className="tmc-header">
        <p className="tmc-title">Telescope focal length &amp; focal ratio calculator</p>
        <div className="tmc-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="tmc-preset-btn" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="tmc-explainer">
        <Katex tex="N = F / D" /> — focal length over aperture. Enter any two and the third is
        worked out for you.
      </p>

      <div className="tt-row">
        <div className="tt-seg" role="radiogroup" aria-label="Solve for">
          <span className="tt-seg-label">Solve for</span>
          {["N", "F", "D"].map((k) => (
            <button key={k} type="button" role="radio" aria-checked={solveFor === k} className={`tt-seg-btn${solveFor === k ? " is-on" : ""}`} onClick={() => setSolveFor(k)}>
              {FIELD_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="tt-seg" role="radiogroup" aria-label="Length unit">
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
                const conv = (s) => {
                  const v = parseFloat(s);
                  if (!Number.isFinite(v)) return s;
                  const out = u === "in" ? v / MM_PER_INCH : v * MM_PER_INCH;
                  return trimTrailingZeros(out.toFixed(u === "in" ? 2 : 1));
                };
                setD(conv(D));
                setF(conv(F));
                setUnit(u);
              }}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="tmc-fields">
        {solveFor !== "D" && field("D", D, setD, unitLabel)}
        {solveFor !== "F" && field("F", F, setF, unitLabel)}
        {solveFor !== "N" && field("N", N, setN, "f/")}
        <div className="tmc-field">
          <label htmlFor="tfl-mult">Barlow or focal reducer</label>
          <select id="tfl-mult" className="tmc-input" value={mult} onChange={(e) => setMult(e.target.value)}>
            {MULTIPLIERS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {!result.valid ? (
        <p className="tmc-note tmc-note--warn" role="alert">{result.reason}</p>
      ) : (
        <>
          <div className={`tmc-headline-card tmc-tone-${speed.tone}`}>
            <div className="tmc-headline">
              {solveFor === "N" && <>f/{fmt(result.N)}</>}
              {solveFor === "F" && <><Katex tex="F" /> = {fmt(fromMm(result.F))} {unitLabel}</>}
              {solveFor === "D" && <><Katex tex="D" /> = {fmt(fromMm(result.D))} {unitLabel}</>}
            </div>
            <div className="tmc-headline-sub">
              Aperture {fmt(fromMm(result.D))} {unitLabel} · Focal length {fmt(fromMm(result.F))} {unitLabel} · f/{fmt(result.N)}
              {result.eff && (
                <> · With the {result.factor < 1 ? `${result.factor}× reducer` : `${result.factor}× Barlow`}: {fmt(fromMm(result.eff.F))} {unitLabel}, f/{fmt(result.eff.N)}</>
              )}
            </div>
            <div className="tmc-verdict">
              <span className="tmc-verdict-title">{speed.title} (f/{fmt(result.shownN)}).</span> {speed.text}
            </div>
          </div>

          {cone && (
            <div className="chart-wrap">
              <svg className="tmc-gauge-svg" viewBox={`0 0 ${cone.width} ${cone.height}`} role="img" aria-label={`Light cone drawn to scale: aperture ${fmt(result.D)} millimetres converging over ${fmt(cone.Fdraw)} millimetres, f/${fmt(result.shownN)}`}>
                <polygon
                  points={`${cone.left},${cone.cy - cone.open / 2} ${cone.left},${cone.cy + cone.open / 2} ${cone.focusX},${cone.cy}`}
                  className="tt-cone"
                />
                <line x1={cone.left} x2={cone.left} y1={cone.cy - cone.open / 2} y2={cone.cy + cone.open / 2} className="tt-cone-aperture" />
                <circle cx={cone.focusX} cy={cone.cy} r="3.5" className="tmc-gauge-marker" />
                <line x1={cone.left} x2={cone.focusX} y1={cone.cy + 66} y2={cone.cy + 66} className="tt-dim" />
                <text x={(cone.left + cone.focusX) / 2} y={cone.cy + 82} className="tmc-gauge-label" textAnchor="middle">
                  focal length {fmt(fromMm(cone.Fdraw))} {unitLabel}
                </text>
                <text x={cone.left + 6} y={cone.cy - cone.open / 2 - 6} className="tmc-gauge-label">
                  aperture {fmt(fromMm(result.D))} {unitLabel}
                </text>
                <text x={cone.focusX + 8} y={cone.cy + 4} className="tmc-gauge-label">focus</text>
              </svg>
              <p className="tmc-chart-caption">
                The light cone to scale. A short, steep cone is a fast scope; a long, narrow one is a slow scope.
              </p>
            </div>
          )}

          <p className="tmc-note">
            Next: see what magnification an eyepiece gives in this scope with the{" "}
            <a href="/posts/telescope-magnification-calculator">Telescope Magnification Calculator</a>, or which eyepieces
            suit it with the <a href="/posts/exit-pupil-calculator">Exit Pupil Calculator</a>.
          </p>
        </>
      )}

      <div className="tmc-footer-row">
        <CalculatorVote slug="telescope-focal-length-calculator" />
        <CalculatorTests
          title="Telescope Focal Length &amp; Focal Ratio Calculator — Tests"
          columns={FOCAL_LENGTH_TEST_COLUMNS}
          rows={testRows}
          sources={FOCAL_LENGTH_TEST_SOURCES}
        />
        <button type="button" className="tmc-copy-btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy shareable link"}
        </button>
      </div>
    </div>
  );
}
