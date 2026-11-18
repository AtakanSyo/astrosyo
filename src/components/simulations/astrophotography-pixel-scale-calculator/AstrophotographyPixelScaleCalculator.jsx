import { useEffect, useMemo, useState } from "react";
import {
  pixelScale,
  sensorMm,
  fieldDeg,
  samplingRatio,
  classifySampling,
  suggestedBinning,
  cropFactor,
  rule500,
  npfRule,
  TARGETS,
} from "./pixelScale";
import { PIXEL_SCALE_TEST_COLUMNS, PIXEL_SCALE_TEST_SOURCES, getPixelScaleTestRows } from "./pixelScaleTests";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import CalculatorVote from "../../CalculatorVote.jsx";
import CalculatorTests from "../../CalculatorTests.jsx";
import { trackEvent } from "../../../lib/analytics/trackEvent";
import Katex from "../../Katex.jsx";

// Manufacturer specs.
const OPTICS = [
  { label: "RedCat 51 (250 mm f/4.9)", F: "250", N: "4.9" },
  { label: "80 mm f/6 refractor (480 mm)", F: "480", N: "6" },
  { label: "8\" f/5 Newtonian (1000 mm)", F: "1000", N: "5" },
  { label: "C8 + 0.63× reducer (1280 mm f/6.3)", F: "1280", N: "6.3" },
  { label: "C8 (2032 mm f/10)", F: "2032", N: "10" },
  { label: "24 mm f/1.4 lens", F: "24", N: "1.4" },
];

const CAMERAS = [
  { key: "asi2600", label: "ZWO ASI2600MC/MM Pro (APS-C)", p: 3.76, w: 6248, h: 4176 },
  { key: "asi533", label: "ZWO ASI533MC Pro (square)", p: 3.76, w: 3008, h: 3008 },
  { key: "asi294", label: "ZWO ASI294MC Pro (4/3\")", p: 4.63, w: 4144, h: 2822 },
  { key: "asi585", label: "ZWO ASI585MC (planetary/EAA)", p: 2.9, w: 3840, h: 2160 },
  { key: "asi462", label: "ZWO ASI462MC (planetary)", p: 2.9, w: 1936, h: 1096 },
  { key: "ff24", label: "Full-frame 24 MP DSLR/mirrorless", p: 5.93, w: 6000, h: 4000 },
  { key: "apsc24", label: "APS-C 24 MP DSLR/mirrorless", p: 3.72, w: 6000, h: 4000 },
  { key: "custom", label: "Custom…" },
];

const SEEING = [
  { value: "1.5", label: "Excellent (1.5″)" },
  { value: "2", label: "Good (2″)" },
  { value: "3", label: "Average (3″)" },
  { value: "4", label: "Poor (4″)" },
];

const VERDICT = {
  under: { tone: "warn", title: "Undersampled", text: "Fewer than 2 pixels across a star: stars can look square and fine detail is lost. Fine for wide fields; drizzle integration in stacking software can recover some resolution." },
  good: { tone: "good", title: "Well sampled", text: "2–3 pixels across a star, which matches the camera to the sky: round stars with no light wasted on extra pixels." },
  over: { tone: "warn", title: "Oversampled", text: "More pixels across each star than the seeing can use: the same detail spread thinner, so a noisier image for the same exposure time." },
};

function fmt(n, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return Number(n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
}
function fmtAngle(deg) {
  if (!Number.isFinite(deg)) return "—";
  if (deg >= 1) return `${fmt(deg, 2)}°`;
  return `${fmt(deg * 60, 1)}′`;
}

function readInitialFromUrl() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  if (!p.has("fl")) return null;
  const val = (k) => (p.get(k) !== null && Number.isFinite(parseFloat(p.get(k))) ? p.get(k) : "");
  const cam = CAMERAS.some((c) => c.key === p.get("cam")) ? p.get("cam") : "asi2600";
  return { F: val("fl"), N: val("n"), cam, p: val("px"), w: val("w"), h: val("h"), bin: val("bin") || "1", seeing: val("see") || "3", target: TARGETS.some((t) => t.key === p.get("t")) ? p.get("t") : "m31" };
}

export default function AstrophotographyPixelScaleCalculator() {
  const [F, setF] = useState("250");
  const [N, setN] = useState("4.9");
  const [cam, setCam] = useState("asi2600");
  const [px, setPx] = useState("3.76");
  const [w, setW] = useState("6248");
  const [h, setH] = useState("4176");
  const [bin, setBin] = useState("1");
  const [seeing, setSeeing] = useState("3");
  const [target, setTarget] = useState("m31");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const init = readInitialFromUrl();
    if (init) {
      if (init.F) setF(init.F);
      if (init.N) setN(init.N);
      setCam(init.cam);
      if (init.cam === "custom") {
        if (init.p) setPx(init.p);
        if (init.w) setW(init.w);
        if (init.h) setH(init.h);
      }
      setBin(init.bin);
      setSeeing(init.seeing);
      setTarget(init.target);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      const p = new URLSearchParams({ fl: F, n: N, cam, bin, see: seeing, t: target });
      if (cam === "custom") {
        p.set("px", px);
        p.set("w", w);
        p.set("h", h);
      }
      window.history.replaceState(null, "", `${window.location.pathname}?${p}${window.location.hash}`);
    }, 300);
    return () => window.clearTimeout(id);
  }, [hydrated, F, N, cam, px, w, h, bin, seeing, target]);

  const camera = CAMERAS.find((c) => c.key === cam);
  const pixel = cam === "custom" ? parseFloat(px) : camera.p;
  const width = cam === "custom" ? parseFloat(w) : camera.w;
  const height = cam === "custom" ? parseFloat(h) : camera.h;

  const result = useMemo(() => {
    const Fn = parseFloat(F);
    const b = parseInt(bin, 10);
    const scale = pixelScale(pixel, Fn, b);
    if (scale === null) return { valid: false, reason: "Enter a positive focal length and pixel size." };
    const wMm = sensorMm(width, pixel);
    const hMm = sensorMm(height, pixel);
    if (wMm === null || hMm === null) return { valid: false, reason: "Enter the sensor's width and height in pixels." };
    const fovW = fieldDeg(wMm, Fn);
    const fovH = fieldDeg(hMm, Fn);
    const ratio = samplingRatio(parseFloat(seeing), scale);
    const cls = classifySampling(ratio);
    const crop = cropFactor(wMm, hMm);
    const Nn = parseFloat(N);
    return {
      valid: true,
      F: Fn,
      bin: b,
      scale,
      wMm,
      hMm,
      fovW,
      fovH,
      ratio,
      cls,
      suggestBin: cls === "over" ? suggestedBinning(samplingRatio(parseFloat(seeing), pixelScale(pixel, Fn, 1))) : 1,
      crop,
      t500: rule500(Fn, crop),
      tNpf: npfRule(Nn, pixel, Fn),
    };
  }, [F, N, pixel, width, height, bin, seeing]);

  // Framing preview: sensor rectangle and target to scale, fitted to the box.
  const frame = useMemo(() => {
    if (!result.valid) return null;
    const t = TARGETS.find((x) => x.key === target);
    const W = 640;
    const H = 300;
    const sw = result.fovW * 60;
    const sh = result.fovH * 60;
    const k = Math.min((W * 0.86) / Math.max(sw, t.w), (H * 0.8) / Math.max(sh, t.h));
    return { W, H, sw: sw * k, sh: sh * k, tw: t.w * k, th: t.h * k, t, fits: t.w <= sw && t.h <= sh };
  }, [result, target]);

  const testRows = useMemo(() => getPixelScaleTestRows(), []);

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

  const num = (id, label, value, setter, unit) => (
    <div className="tmc-field">
      <label htmlFor={id}>{label}</label>
      <div className="tmc-input-row">
        <input id={id} className="tmc-input" type="number" min="0" step="any" inputMode="decimal" value={value} onChange={(e) => setter(e.target.value)} />
        <span className="tmc-static-unit">{unit}</span>
      </div>
    </div>
  );

  const v = result.valid ? VERDICT[result.cls] : null;

  return (
    <div className="tmc" aria-label="Astrophotography pixel scale and field of view calculator">
      <div className="tmc-header">
        <p className="tmc-title">Astrophotography pixel scale &amp; field of view</p>
        <div className="tmc-presets">
          {OPTICS.map((o) => (
            <button
              key={o.label}
              type="button"
              className="tmc-preset-btn"
              onClick={() => {
                setF(o.F);
                setN(o.N);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className="tmc-explainer">
        <Katex tex={'\\text{scale} = 206.265 \\times \\dfrac{\\text{pixel size } (\\mu\\text{m})}{F \\text{ (mm)}} \\ {}^{\\prime\\prime}/\\text{px}'} />
      </p>

      <div className="tmc-fields">
        {num("aps-f", <>Focal length (<Katex tex="F" />)</>, F, setF, "mm")}
        {num("aps-n", <>Focal ratio (<Katex tex="N" />)</>, N, setN, "f/")}
        <div className="tmc-field">
          <label htmlFor="aps-cam">Camera</label>
          <select id="aps-cam" className="tmc-input" value={cam} onChange={(e) => setCam(e.target.value)}>
            {CAMERAS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
                {c.p ? ` — ${c.p} µm` : ""}
              </option>
            ))}
          </select>
        </div>
        {cam === "custom" && (
          <>
            {num("aps-px", "Pixel size", px, setPx, "µm")}
            {num("aps-w", "Sensor width", w, setW, "px")}
            {num("aps-h", "Sensor height", h, setH, "px")}
          </>
        )}
        <div className="tmc-field">
          <label htmlFor="aps-bin">Binning</label>
          <select id="aps-bin" className="tmc-input" value={bin} onChange={(e) => setBin(e.target.value)}>
            {["1", "2", "3", "4"].map((b) => (
              <option key={b} value={b}>{b}×{b}</option>
            ))}
          </select>
        </div>
        <div className="tmc-field">
          <label htmlFor="aps-see">Seeing (star FWHM)</label>
          <select id="aps-see" className="tmc-input" value={seeing} onChange={(e) => setSeeing(e.target.value)}>
            {SEEING.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {!result.valid ? (
        <p className="tmc-note tmc-note--warn" role="alert">{result.reason}</p>
      ) : (
        <>
          <div className={`tmc-headline-card tmc-tone-${v.tone}`}>
            <div className="tmc-headline">{fmt(result.scale, 2)}″ per pixel</div>
            <div className="tmc-headline-sub">
              Field of view {fmtAngle(result.fovW)} × {fmtAngle(result.fovH)} · Sensor {fmt(result.wMm, 1)} × {fmt(result.hMm, 1)} mm
              {result.bin > 1 && ` · binned ${result.bin}×${result.bin}`}
            </div>
            <div className="tmc-verdict">
              <span className="tmc-verdict-title">
                {v.title}: {fmt(result.ratio, 1)} px across a {seeing}″ star.
              </span>{" "}
              {v.text}
              {result.cls === "over" && result.suggestBin > result.bin && ` Binning ${result.suggestBin}×${result.suggestBin} brings it to ${fmt(result.ratio * (result.bin / result.suggestBin), 1)} px.`}
              {result.cls === "under" && " A longer focal length or smaller pixels would fix it, at the cost of field of view."}
            </div>
          </div>

          <div className="tt-row">
            <div className="tt-seg" role="radiogroup" aria-label="Framing target">
              <span className="tt-seg-label">Frame</span>
              {TARGETS.map((t) => (
                <button key={t.key} type="button" role="radio" aria-checked={target === t.key} className={`tt-seg-btn${target === t.key ? " is-on" : ""}`} onClick={() => setTarget(t.key)}>
                  {t.name.replace(/ \(.*\)/, "")}
                </button>
              ))}
            </div>
          </div>

          {frame && (
            <div className="chart-wrap">
              <svg className="tmc-gauge-svg" viewBox={`0 0 ${frame.W} ${frame.H}`} role="img" aria-label={`${frame.t.name} drawn to scale inside a ${fmtAngle(result.fovW)} by ${fmtAngle(result.fovH)} field of view`}>
                <rect x={(frame.W - frame.sw) / 2} y={(frame.H - 20 - frame.sh) / 2} width={frame.sw} height={frame.sh} className="tt-cone" rx="2" />
                <ellipse
                  cx={frame.W / 2}
                  cy={(frame.H - 20) / 2}
                  rx={Math.max(frame.tw / 2, 1.5)}
                  ry={Math.max(frame.th / 2, 1.5)}
                  className={frame.t.key === "moon" ? "tt-scale-dot" : "tt-scale-reach"}
                  style={frame.t.key === "moon" ? { fill: "#d9d4c7" } : { opacity: 0.45 }}
                />
                <text x={frame.W / 2} y={frame.H - 6} className="tmc-gauge-label" textAnchor="middle">
                  {frame.t.name}, {fmt(frame.t.w, 1)}′ × {fmt(frame.t.h, 1)}′ · {frame.fits ? "fits in the frame" : "larger than the frame"}
                </text>
              </svg>
              <p className="tmc-chart-caption">The camera's field (the rectangle) and the target, to the same scale. Sizes are approximate visual extents.</p>
            </div>
          )}

          <div className="tt-table-wrap">
            <table className="tt-table">
              <thead>
                <tr>
                  <th>Untracked tripod exposure</th>
                  <th>Longest exposure</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>NPF rule</td>
                  <td className="num">{Number.isFinite(result.tNpf) ? `${fmt(result.tNpf, 1)} s` : "Enter the f-number"}</td>
                  <td>Pinpoint stars on modern sensors (stars at the celestial equator; closer to the pole allows longer)</td>
                </tr>
                <tr>
                  <td>500 rule</td>
                  <td className="num">{fmt(result.t500, 1)} s</td>
                  <td>Crop factor {fmt(result.crop, 2)}; older rule, shows slight trailing on high-resolution sensors</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="tmc-note">
            Related: the <a href="/posts/telescope-focal-length-calculator">Focal Length &amp; Focal Ratio Calculator</a> (for
            reducers and Barlows) and the <a href="/posts/true-field-of-view-calculator">True Field of View Calculator</a> for
            the same framing question at the eyepiece.
          </p>
        </>
      )}

      <div className="tmc-footer-row">
        <CalculatorVote slug="astrophotography-pixel-scale-calculator" />
        <CalculatorTests
          title="Astrophotography Pixel Scale Calculator — Tests"
          columns={PIXEL_SCALE_TEST_COLUMNS}
          rows={testRows}
          sources={PIXEL_SCALE_TEST_SOURCES}
        />
        <button type="button" className="tmc-copy-btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy shareable link"}
        </button>
      </div>
    </div>
  );
}
