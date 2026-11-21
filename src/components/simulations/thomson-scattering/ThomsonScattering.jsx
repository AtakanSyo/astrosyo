import { useEffect, useMemo, useRef, useState } from "react";
import { SIGMA_T, pattern, polarization, meanFreePath, opticalDepth, escapeTime } from "./thomson";
import { formatDistance } from "../curvature-radiation/curvature";
import { formatDuration } from "../synchrotron-radiation/synchrotron";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import Katex from "../../Katex.jsx";

const POLS = [
  ["unpol", "Unpolarized (sunlight)"],
  ["in", "Polarized in the screen"],
  ["out", "Polarized out of the screen"],
];

const GAS_PRESETS = [
  { label: "Sun (core density throughout)", logN: Math.log10(6e31), logL: Math.log10(6.96e8), note: "Electron scattering alone, with the core's density everywhere. Real estimates, which include other kinds of absorption and the Sun's falling density, range from about ten thousand to a few hundred thousand years." },
  { label: "Solar corona", logN: 15, logL: Math.log10(6.96e8), note: "The corona scatters only a few millionths of the Sun's light towards us, which is why it's only visible during a total eclipse." },
  { label: "Universe before the CMB", logN: Math.log10(2.9e8), logL: Math.log10(6.6e21), note: "Fully ionised gas just before recombination, across the 700,000 light-years light could have crossed by then (ignoring expansion). That random walk would take far longer than the universe had existed: light never got out. Instead the fog itself cleared when electrons joined atoms, and the light released then is the cosmic microwave background." },
  { label: "Intergalactic gas today", logN: Math.log10(0.2), logL: Math.log10(1.37e26), note: "Across the whole observable universe today, only about 0.2% of photons are scattered by the thin intergalactic gas." },
  { label: "Earth's ionosphere", logN: 12, logL: Math.log10(3e5), note: "Earth's ionosphere bends and reflects radio waves, but Thomson scattering in it is minute." },
];

const deg = (d) => (d * Math.PI) / 180;

function Sci({ n, unit = "" }) {
  if (!Number.isFinite(n)) return <>—</>;
  if (n === 0) return <>0</>;
  const exp = Math.floor(Math.log10(Math.abs(n)));
  if (exp >= -2 && exp < 5) return <>{Number(n.toPrecision(3)).toLocaleString("en-US")}{unit && ` ${unit}`}</>;
  return (
    <>
      {(n / 10 ** exp).toFixed(1)} × 10<sup>{exp}</sup>
      {unit && ` ${unit}`}
    </>
  );
}

function ScatterPanel() {
  const [pol, setPol] = useState("unpol");
  const [obsDeg, setObsDeg] = useState(90);
  const canvasRef = useRef(null);
  const stateRef = useRef({ pol, obsDeg });
  stateRef.current = { pol, obsDeg };
  const stillRef = useRef(null); // redraws the still frame under reduced motion

  const theta = deg(obsDeg);
  const I = pattern(theta, pol);
  const P = polarization(theta, pol);
  const dir =
    pol === "out" ? "out of the screen" : pol === "in" ? "in the screen" : P < 0.005 ? "none" : "out of the screen (across the scattering plane)";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let visible = true;
    let W = 1;
    let H = 1;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw(performance.now() + 1500);
    };
    const t0 = performance.now();
    const PERIOD = 0.9; // seconds per wave cycle on screen

    function draw(now) {
      const { pol: p, obsDeg: od } = stateRef.current;
      const t = (now - t0) / 1000;
      const ph = (2 * Math.PI * t) / PERIOD;
      ctx.clearRect(0, 0, W, H);
      const cx = W * 0.42;
      const cy = H * 0.52;
      const s = Math.min(W / 640, H / 360);
      const lam = 46 * s; // wavelength on screen
      const amp = 22 * s;

      // the electron's motion direction: unpolarized light keeps changing its
      // polarization, so the shaking direction wanders round.
      const wander = p === "unpol" ? Math.sin(t * 0.7) * Math.PI * 0.5 + Math.sin(t * 1.9) * 0.6 : 0;
      const inPlane = p === "in" ? 1 : p === "out" ? 0 : Math.cos(wander);
      const outPlane = p === "out" ? 1 : p === "in" ? 0 : Math.sin(wander);

      // radiation pattern for this polarization (the time average)
      const pat = (th) => pattern(th, p);

      // expanding wavefronts, brightness following the pattern
      const ringGap = lam;
      const maxR = Math.hypot(W, H);
      const offset = ((t / PERIOD) % 1) * ringGap;
      for (let r = offset + 14 * s; r < maxR; r += ringGap) {
        const fade = Math.max(0, 1 - r / (W * 0.62));
        if (fade <= 0) continue;
        for (let k = 0; k < 120; k += 1) {
          const a0 = (k / 120) * Math.PI * 2;
          const a1 = ((k + 1) / 120) * Math.PI * 2;
          const th = -(a0 + a1) / 2; // screen angle → scattering angle (y flipped)
          const v = pat(th);
          if (v < 0.01) continue;
          ctx.strokeStyle = `rgba(255,214,140,${(0.55 * v * fade).toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, a0, a1);
          ctx.stroke();
        }
      }

      // the pattern's outline
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = "rgba(255,214,140,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k <= 180; k += 1) {
        const th = (k / 180) * Math.PI * 2;
        const r = 70 * s * pat(th);
        const x = cx + Math.cos(th) * r;
        const y = cy - Math.sin(th) * r;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // incoming wave from the left
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#7fd6ff";
      ctx.shadowColor = "#7fd6ff";
      ctx.shadowBlur = 6;
      if (inPlane > 0.05) {
        ctx.globalAlpha = Math.max(0.25, inPlane);
        ctx.beginPath();
        for (let x = 8; x <= cx - 16 * s; x += 2) {
          const y = cy - Math.sin(ph - (2 * Math.PI * x) / lam) * amp * inPlane;
          if (x === 8) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      if (outPlane > 0.05) {
        // out-of-screen field: dots and crosses growing and shrinking along the beam
        ctx.globalAlpha = Math.max(0.25, Math.abs(outPlane));
        for (let x = 20; x <= cx - 22 * s; x += lam / 4) {
          const e = Math.sin(ph - (2 * Math.PI * x) / lam) * outPlane;
          const r = 2 + Math.abs(e) * 6 * s;
          ctx.strokeStyle = "#7fd6ff";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(x, cy, r, 0, Math.PI * 2);
          ctx.stroke();
          if (e > 0) {
            ctx.fillStyle = "#7fd6ff";
            ctx.beginPath();
            ctx.arc(x, cy, 1.6, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(x - r * 0.6, cy - r * 0.6);
            ctx.lineTo(x + r * 0.6, cy + r * 0.6);
            ctx.moveTo(x + r * 0.6, cy - r * 0.6);
            ctx.lineTo(x - r * 0.6, cy + r * 0.6);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // the electron, shaken by the wave's electric field
      const shake = Math.sin(ph - (2 * Math.PI * cx) / lam);
      const ey = cy - shake * 9 * s * inPlane;
      const er = 7 * s * (1 + 0.35 * shake * outPlane);
      const eg = ctx.createRadialGradient(cx, ey, 0, cx, ey, er * 2.6);
      eg.addColorStop(0, "rgba(255,255,255,1)");
      eg.addColorStop(0.35, "rgba(150,220,255,0.9)");
      eg.addColorStop(1, "rgba(150,220,255,0)");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(cx, ey, er * 2.6, 0, Math.PI * 2);
      ctx.fill();

      // observer
      const obsTh = deg(od);
      const R = Math.min(W * 0.4, H * 0.42);
      const ox = cx + Math.cos(obsTh) * R;
      const oy = cy - Math.sin(obsTh) * R;
      const v = pat(obsTh);
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
      ctx.setLineDash([]);
      const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, 22 * s);
      og.addColorStop(0, `rgba(255,230,180,${0.25 + 0.75 * v})`);
      og.addColorStop(1, "rgba(255,230,180,0)");
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(ox, oy, 22 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(`observer at ${od}°`, ox + 14, oy - 12);

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText("incoming light", 10, cy - amp - 10);
      ctx.fillText("free electron", cx - 32, cy + 32 * s);
      ctx.fillText("dashed: brightness in each direction", 10, H - 8);
    }

    resize();
    if (reduce) stillRef.current = () => draw(performance.now() + 1500);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
    });
    io.observe(canvas);
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (visible) draw(now);
    };
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // redraw the still frame when settings change under reduced motion
  useEffect(() => {
    stillRef.current?.();
  }, [pol, obsDeg]);

  return (
    <>
      <div className="tt-row">
        <div className="tt-seg" role="radiogroup" aria-label="Incoming light">
          <span className="tt-seg-label">Incoming light</span>
          {POLS.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={pol === k} className={`tt-seg-btn${pol === k ? " is-on" : ""}`} onClick={() => setPol(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="th-obs">Observer's angle from the beam: {obsDeg}°</label>
          <input id="th-obs" type="range" min={0} max={180} step={1} value={obsDeg} onChange={(e) => setObsDeg(Number(e.target.value))} />
        </div>
      </div>
      <div className="chart-wrap" style={{ padding: 0, overflow: "hidden", background: "#05060a" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", aspectRatio: "16 / 9", display: "block" }}
          aria-label={`Animation: light hits an electron, which shakes and re-radiates; at ${obsDeg} degrees the scattered light is ${Math.round(I * 100)} percent as bright as straight ahead`}
        />
      </div>
      <div className={`tmc-headline-card tmc-tone-${I < 0.02 ? "warn" : "good"}`}>
        <div className="tmc-headline">
          {Math.round(I * 100)}% as bright as straight ahead{I >= 0.005 && <> · {Math.round(P * 100)}% polarized</>}
        </div>
        <div className="tmc-headline-sub">Seen at {obsDeg}°{I >= 0.005 && <> · polarization {dir}</>}</div>
        <div className="tmc-verdict">
          <span className="tmc-verdict-title">
            {pol === "in" && I < 0.02
              ? "Dark: the electron is shaking straight towards and away from you."
              : pol === "unpol" && obsDeg >= 80 && obsDeg <= 100
                ? "Sideways scattering polarizes the light completely."
                : "The colour doesn't change: Thomson scattering keeps every photon's energy."}
          </span>{" "}
          {pol === "in" && I < 0.02
            ? "An oscillating charge sends no light along its line of motion, only sideways."
            : pol === "unpol" && obsDeg >= 80 && obsDeg <= 100
              ? "Only the part of the shaking you can see side-on reaches you, so the light arrives vibrating in one direction. Polarized sunlight in the corona and the polarization pattern of the cosmic microwave background both come from this."
              : "Every wavelength scatters equally, which is why light scattered by electrons keeps the colour of its source, unlike the blue of the sky."}
        </div>
      </div>
    </>
  );
}

function GasPanel() {
  const [logN, setLogN] = useState(GAS_PRESETS[0].logN);
  const [logL, setLogL] = useState(GAS_PRESETS[0].logL);
  const [note, setNote] = useState(GAS_PRESETS[0].note);
  const n = 10 ** logN;
  const L = 10 ** logL;
  const lambda = meanFreePath(n);
  const tau = opticalDepth(n, L);
  const tEsc = escapeTime(n, L);
  const straight = Math.exp(-tau);

  // a random walk to draw: about τ² steps when thick, capped for drawing
  const walk = useMemo(() => {
    let a = 12345;
    const rand = () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
    const R = 70;
    const steps = Math.max(1, Math.min(700, Math.round(tau > 1 ? tau * tau : 1)));
    const stepLen = tau > 1 ? R / Math.max(1, tau) : 2 * R;
    const pts = [[0, 0]];
    let x = 0;
    let y = 0;
    for (let i = 0; i < steps; i += 1) {
      const ang = rand() * Math.PI * 2;
      x += Math.cos(ang) * stepLen;
      y += Math.sin(ang) * stepLen;
      pts.push([x, y]);
      if (Math.hypot(x, y) > R) break;
    }
    return { pts, R, capped: tau * tau > 700 };
  }, [tau]);

  return (
    <>
      <div className="tmc-presets" style={{ marginBottom: "0.8rem" }}>
        {GAS_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="tmc-preset-btn"
            onClick={() => {
              setLogN(p.logN);
              setLogL(p.logL);
              setNote(p.note);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="th-n">
            Electron density: <Sci n={n} /> per m³
          </label>
          <input id="th-n" type="range" min={-2} max={32} step={0.05} value={logN} onChange={(e) => { setLogN(Number(e.target.value)); setNote(""); }} />
        </div>
        <div className="tmc-field">
          <label htmlFor="th-l">Distance to cross: {formatDistance(L)}</label>
          <input id="th-l" type="range" min={0} max={27} step={0.05} value={logL} onChange={(e) => { setLogL(Number(e.target.value)); setNote(""); }} />
        </div>
      </div>
      <div className={`tmc-headline-card tmc-tone-${tau > 1 ? "warn" : "good"}`}>
        <div className="tmc-headline">
          Optical depth τ = <Sci n={tau} /> · {tau > 1 ? "opaque" : tau > 0.1 ? "hazy" : "transparent"}
        </div>
        <div className="tmc-headline-sub">
          Mean free path {formatDistance(lambda)} · {tau > 50 ? "almost no light goes" : tau < 1e-3 ? "practically all light goes" : `${(straight * 100).toPrecision(3)}% of light goes`} straight through
        </div>
        <div className="tmc-verdict">
          <span className="tmc-verdict-title">
            {tau > 1 ? (
              <>A photon bounces about <Sci n={tau * tau} /> times and takes {formatDuration(tEsc)} to get out,</>
            ) : (
              <>Light crosses in {formatDuration(tEsc)}, with a chance of about <Sci n={Math.min(1, tau) * 100} />% of being scattered,</>
            )}
          </span>{" "}
          {tau > 1 ? "instead of the straight-line crossing time." : "so most of it goes straight through."}
          {note && <> {note}</>}
        </div>
      </div>
      <div className="chart-wrap">
        <svg viewBox="-110 -90 220 180" className="tmc-gauge-svg" style={{ maxHeight: 260 }} role="img" aria-label={`A photon's random walk through the gas, optical depth ${tau.toPrecision(2)}`}>
          <circle cx="0" cy="0" r={walk.R} fill="rgba(127,214,255,0.06)" stroke="rgba(127,214,255,0.35)" />
          <polyline points={walk.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke="#ffd68c" strokeWidth="0.9" strokeLinejoin="round" />
          <circle cx="0" cy="0" r="2.2" fill="#fff" />
        </svg>
        <p className="tmc-chart-caption">
          One photon's path, starting at the centre, drawn to scale with the mean free path.
          {walk.capped && " Only the first 700 steps are drawn; the real walk is far longer."}
        </p>
      </div>
    </>
  );
}

export default function ThomsonScattering() {
  return (
    <div className="tmc" aria-label="Thomson scattering visualization">
      <div className="tmc-header">
        <p className="tmc-title">Thomson scattering</p>
      </div>
      <p className="tmc-explainer">
        <Katex tex="\sigma_T = \tfrac{8\pi}{3}\,r_e^2 = 6.65\times10^{-29}\ \text{m}^2" />
      </p>
      <ScatterPanel />
      <p className="tmc-title" style={{ marginTop: "1.6rem" }}>Through a cloud of electrons</p>
      <p className="tmc-explainer">
        <Katex tex="\tau = n_e\,\sigma_T\,L" /> — how many mean free paths the light has to cross.
      </p>
      <GasPanel />
      <p className="tmc-note" style={{ marginTop: "0.6rem" }}>
        σ_T = <Sci n={SIGMA_T} unit="m²" />, the same for every wavelength from radio to X-rays.
      </p>
    </div>
  );
}
