import { useEffect, useMemo, useRef, useState } from "react";
import {
  gyroFrequency,
  orbitalFrequency,
  criticalFrequency,
  synchrotronF,
  PEAK_X,
  larmorRadius,
  coolingTime,
  beamAngle,
  hzToEv,
  evToHz,
  electronEnergyEv,
  formatFrequency,
  formatDuration,
  formatLength,
  formatField,
} from "./synchrotron";
import { BANDS, bandOf, formatEnergy } from "../compton-scattering/compton";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import Katex from "../../Katex.jsx";

const PRESETS = [
  { label: "Milky Way radio glow", logB: Math.log10(5e-6), logGamma: 4, pitch: 60, note: "A 5 GeV cosmic-ray electron in the Galaxy's 5 µG field." },
  { label: "Jupiter's radiation belts", logB: 0, logGamma: Math.log10(40), pitch: 60, note: "20 MeV electrons trapped in Jupiter's roughly 1 G field near the planet." },
  { label: "Crab Nebula X-rays", logB: Math.log10(1.25e-4), logGamma: Math.log10(4e7), pitch: 60, note: "20 TeV electrons from the Crab pulsar in the nebula's 125 µG field." },
  { label: "Synchrotron light source", logB: Math.log10(8500), logGamma: Math.log10(6e9 / 510998.95), pitch: 90, note: "A 6 GeV electron in a 0.85 T bending magnet, like those at the big X-ray light sources." },
  { label: "Cyclotron (slow electron)", logB: 0, logGamma: Math.log10(1.001), pitch: 90, note: "Here a 0.5 keV electron in a 1 G field, about twice the strength of Earth's." },
];

const BAND_COLORS = {
  radio: "#ff6b5a",
  microwave: "#ff8a5c",
  ir: "#ffae6b",
  visible: "#ffe27a",
  uv: "#9fd8ff",
  xray: "#8fb7ff",
  gamma: "#c9a8ff",
};

const deg = (d) => (d * Math.PI) / 180;
const rad2deg = (r) => (r * 180) / Math.PI;
const mix = (a, b, t) => a + (b - a) * t;

function useCanvasLoop(canvasRef, draw, deps) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let visible = true;
    let size = { w: 1, h: 1 };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size = { w, h };
      if (reduce) draw(ctx, size, 1.2, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
    });
    io.observe(canvas);
    const t0 = performance.now();
    let last = t0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      draw(ctx, size, (now - t0) / 1000, dt);
    };
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function Sci({ n, unit = "" }) {
  if (!Number.isFinite(n)) return <>—</>;
  const exp = Math.floor(Math.log10(Math.abs(n)));
  if (exp >= -2 && exp < 5) return <>{Number(n.toPrecision(3)).toLocaleString("en-US")}{unit && ` ${unit}`}</>;
  return (
    <>
      {(n / 10 ** exp).toFixed(1)} × 10<sup>{exp}</sup>
      {unit && ` ${unit}`}
    </>
  );
}

function orbitRate(hz) {
  if (!Number.isFinite(hz)) return "—";
  if (hz < 1) return `once every ${formatDuration(1 / hz)}`;
  const words = [
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
    [1e3, "thousand"],
  ];
  const hit = words.find(([d]) => hz >= d);
  if (!hit) return `${hz.toFixed(hz < 10 ? 1 : 0)} times a second`;
  const v = hz / hit[0];
  return `${v.toFixed(v < 10 ? 1 : 0)} ${hit[1]} times a second`;
}

export default function SynchrotronRadiation() {
  const [logB, setLogB] = useState(Math.log10(5e-6));
  const [logGamma, setLogGamma] = useState(4);
  const [pitch, setPitch] = useState(60);
  const [note, setNote] = useState(PRESETS[0].note);
  const canvasRef = useRef(null);
  const traceRef = useRef([]);

  const B = 10 ** logB;
  const gamma = Math.max(1.0001, 10 ** logGamma);
  const alpha = deg(pitch);
  const cyclotron = gamma < 1.2;
  const nuG = gyroFrequency(B);
  const nuOrbit = orbitalFrequency(gamma, B);
  const nuC = criticalFrequency(gamma, B, alpha);
  const nuPeak = cyclotron ? nuG : PEAK_X * nuC;
  const ePeak = hzToEv(nuPeak);
  const band = bandOf(ePeak);
  const radius = larmorRadius(gamma, B, alpha);
  const tCool = coolingTime(gamma, B, alpha);
  const cone = beamAngle(gamma);
  const color = BAND_COLORS[band.key];

  useCanvasLoop(
    canvasRef,
    (ctx, { w, h }, time, dt) => {
      ctx.clearRect(0, 0, w, h);
      const sceneH = h * 0.74;
      const cx = w * 0.36;
      const cy = sceneH * 0.52;
      const R = sceneH * 0.33;
      const ox = w - 34;
      const oy = cy + R; // level with the bottom of the orbit, where the electron moves right

      // the magnetic field, pointing out of the screen
      ctx.fillStyle = "rgba(160,190,255,0.16)";
      for (let x = 22; x < w; x += 44) {
        for (let y = 20; y < sceneH; y += 44) {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(160,190,255,0.16)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = "rgba(180,200,255,0.5)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("magnetic field B, out of the screen", 12, sceneH - 8);

      // orbit
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // An electron in a field pointing out of the screen circles anticlockwise;
      // at the bottom of the orbit it moves right, towards the observer.
      const OMEGA = (Math.PI * 2) / 3.2;
      const th = time * OMEGA; // angle on the orbit, anticlockwise on screen
      const ex = cx + Math.cos(th) * R;
      const ey = cy - Math.sin(th) * R;
      // velocity direction (screen coords) for anticlockwise motion
      const vx = -Math.sin(th);
      const vy = -Math.cos(th);
      const vAng = Math.atan2(vy, vx);

      const visCone = cyclotron ? Math.PI / 2 : Math.max(cone, 0.06);
      // emission pattern
      if (cyclotron) {
        // dipole: broad lobes along the velocity, both directions
        [vAng, vAng + Math.PI].forEach((a) => {
          const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, R * 1.3);
          g.addColorStop(0, "rgba(255,140,110,0.32)");
          g.addColorStop(1, "rgba(255,140,110,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.arc(ex, ey, R * 1.3, a - 0.9, a + 0.9);
          ctx.closePath();
          ctx.fill();
        });
      } else {
        const L = w * 1.2;
        const g = ctx.createLinearGradient(ex, ey, ex + Math.cos(vAng) * L, ey + Math.sin(vAng) * L);
        g.addColorStop(0, `${color}cc`);
        g.addColorStop(1, `${color}00`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(vAng - visCone) * L, ey + Math.sin(vAng - visCone) * L);
        ctx.lineTo(ex + Math.cos(vAng + visCone) * L, ey + Math.sin(vAng + visCone) * L);
        ctx.closePath();
        ctx.fill();
      }

      // electron with a short trail
      for (let k = 12; k > 0; k -= 1) {
        const a = th - k * 0.05;
        ctx.fillStyle = `rgba(150,220,255,${0.05 * (12 - k) / 12 + 0.02})`;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * R, cy - Math.sin(a) * R, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 16);
      eg.addColorStop(0, "rgba(255,255,255,1)");
      eg.addColorStop(0.35, "rgba(150,220,255,0.9)");
      eg.addColorStop(1, "rgba(150,220,255,0)");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ex, ey, 16, 0, Math.PI * 2);
      ctx.fill();

      // what the observer receives: strong only when the beam points at them
      const toObs = Math.atan2(oy - ey, ox - ex);
      let diff = Math.abs(((toObs - vAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      let signal;
      if (cyclotron) {
        // dipole pattern: sin² of the angle from the acceleration, smooth
        signal = 0.25 + 0.75 * Math.cos(diff) ** 2;
      } else {
        signal = Math.exp(-((diff / visCone) ** 2) * 1.5);
      }
      const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, 30);
      og.addColorStop(0, `rgba(255,255,255,${0.25 + 0.75 * signal})`);
      og.addColorStop(0.4, `${color}${Math.round(40 + 180 * signal).toString(16).padStart(2, "0")}`);
      og.addColorStop(1, `${color}00`);
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(ox, oy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("observer", ox + 22, oy + 30);
      ctx.textAlign = "left";

      // trace of the received signal along the bottom
      const trace = traceRef.current;
      trace.push(signal);
      const N = Math.floor(w / 2);
      while (trace.length > N) trace.shift();
      const ty0 = sceneH + 8;
      const th0 = h - ty0 - 18;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(12, ty0 + th0);
      ctx.lineTo(w - 12, ty0 + th0);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      trace.forEach((s, i) => {
        const x = w - 12 - (trace.length - 1 - i) * 2;
        const y = ty0 + th0 - s * th0;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(cyclotron ? "signal at the observer: a smooth wave" : "signal at the observer: one sharp flash per orbit", 12, h - 5);
      if (!cyclotron && cone < 0.06) {
        ctx.textAlign = "right";
        ctx.fillText("beam drawn wider than real", w - 12, 16);
        ctx.textAlign = "left";
      }
    },
    [logB, logGamma, pitch],
  );

  // Spectrum: F(ν/ν_c) on a fixed log axis from 1 MHz to 10²⁴ Hz.
  const spec = useMemo(() => {
    const W = 640;
    const H = 190;
    const lo = 6;
    const hi = 24;
    const x = (nu) => 20 + ((Math.log10(nu) - lo) / (hi - lo)) * (W - 40);
    const yTop = 18;
    const yBase = 128;
    const bands = BANDS.map((b) => ({
      ...b,
      x1: x(Math.max(10 ** lo, evToHz(Math.max(b.min, 1e-30)))),
      x2: x(Math.min(10 ** hi, evToHz(Math.min(b.max, 1e30)))),
    })).filter((b) => b.x2 > b.x1);
    let path = "";
    if (cyclotron) {
      const xl = x(nuG);
      path = `M${xl},${yBase} L${xl},${yTop}`;
    } else {
      const pts = [];
      for (let i = 0; i <= 240; i += 1) {
        const lnu = lo + ((hi - lo) * i) / 240;
        const f = synchrotronF(10 ** lnu / nuC) / 0.918;
        pts.push(`${i ? "L" : "M"}${x(10 ** lnu).toFixed(1)},${(yBase - f * (yBase - yTop)).toFixed(1)}`);
      }
      path = pts.join(" ");
    }
    return { W, H, x, yTop, yBase, bands, path, xp: x(nuPeak) };
  }, [cyclotron, nuC, nuG, nuPeak]);

  const applyPreset = (p) => {
    setLogB(p.logB);
    setLogGamma(p.logGamma);
    setPitch(p.pitch);
    setNote(p.note);
  };

  const gammaText = gamma < 10 ? gamma.toFixed(3) : Math.round(gamma).toLocaleString("en-US");

  return (
    <div className="tmc" aria-label="Synchrotron radiation visualization">
      <div className="tmc-header">
        <p className="tmc-title">Synchrotron radiation</p>
        <div className="tmc-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="tmc-preset-btn" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="tmc-explainer">
        <Katex tex="\nu_c = \tfrac{3}{2}\,\gamma^2\,\dfrac{eB}{2\pi m_e}\,\sin\alpha" />
      </p>

      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="sy-b">Magnetic field B: {formatField(B)}</label>
          <input id="sy-b" type="range" min={-6} max={5} step={0.01} value={logB} onChange={(e) => { setLogB(Number(e.target.value)); setNote(""); }} />
        </div>
        <div className="tmc-field">
          <label htmlFor="sy-g">Electron Lorentz factor γ: {gammaText} (energy {formatEnergy(electronEnergyEv(gamma))})</label>
          <input id="sy-g" type="range" min={0} max={8} step={0.01} value={logGamma} onChange={(e) => { setLogGamma(Number(e.target.value)); setNote(""); }} />
        </div>
        <div className="tmc-field">
          <label htmlFor="sy-a">Pitch angle α (between path and field): {pitch}°</label>
          <input id="sy-a" type="range" min={5} max={90} step={1} value={pitch} onChange={(e) => { setPitch(Number(e.target.value)); setNote(""); }} />
        </div>
      </div>

      <div className="chart-wrap" style={{ padding: 0, overflow: "hidden", background: "#05060a" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", aspectRatio: "16 / 9", display: "block" }}
          aria-label={`Animation: an electron circles in a magnetic field, its radiation beamed forward like a lighthouse; the observer sees ${cyclotron ? "a smooth wave" : "a sharp flash once per orbit"}`}
        />
      </div>

      <div className="tmc-headline-card tmc-tone-good">
        <div className="tmc-headline">
          {cyclotron ? "Cyclotron line at " : "Peaks at "}
          {formatFrequency(nuPeak)} · {formatEnergy(ePeak)}
        </div>
        <div className="tmc-headline-sub">
          {band.label} · {cyclotron ? "" : `critical frequency ${formatFrequency(nuC)} · `}orbit radius {formatLength(radius)} · goes round {orbitRate(nuOrbit)}
        </div>
        <div className="tmc-verdict">
          <span className="tmc-verdict-title">
            {cyclotron
              ? "Too slow for synchrotron light."
              : `Beamed into ${rad2deg(cone) >= 1 ? `${rad2deg(cone).toFixed(1)}°` : rad2deg(cone) * 60 >= 1 ? `${(rad2deg(cone) * 60).toFixed(1)}′` : `${(rad2deg(cone) * 3600).toFixed(2)}″`}, so each flash lasts about 1/γ³ of an orbit.`}
          </span>{" "}
          {cyclotron
            ? "A slow electron radiates gently in all directions at exactly the frequency it goes round, so the observer sees a smooth wave and the spectrum is a single line."
            : <>That squeezes each orbit's light into a burst at frequencies about γ³ ≈ <Sci n={gamma ** 3} /> times the orbit frequency.</>}{" "}
          It radiates away its energy in about <b style={{ fontWeight: 500 }}>{formatDuration(tCool)}</b>.
          {note && <> {note}</>}
        </div>
      </div>

      <div className="chart-wrap">
        <svg viewBox={`0 0 ${spec.W} ${spec.H}`} className="tmc-gauge-svg" role="img" aria-label={`Spectrum of one electron, peaking in the ${band.label}`}>
          {spec.bands.map((b) => (
            <g key={b.key}>
              <rect x={b.x1} y={spec.yBase + 6} width={b.x2 - b.x1} height={12} fill={BAND_COLORS[b.key]} opacity={0.25} />
              {b.x2 - b.x1 > 44 && (
                <text x={(b.x1 + b.x2) / 2} y={spec.yBase + 34} className="tt-scale-tick" textAnchor="middle">
                  {b.label}
                </text>
              )}
            </g>
          ))}
          <line x1={20} x2={spec.W - 20} y1={spec.yBase} y2={spec.yBase} className="tt-scale-axis" />
          <path d={spec.path} fill="none" stroke={color} strokeWidth="2" />
          <line x1={spec.xp} x2={spec.xp} y1={spec.yTop - 6} y2={spec.yBase} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 4" />
          <text x={spec.xp} y={spec.yTop - 8} className="tt-scale-tick" textAnchor="middle">
            {cyclotron ? "gyrofrequency" : "peak, 0.29 ν_c"}
          </text>
          {[6, 9, 12, 15, 18, 21, 24].map((e) => (
            <text key={e} x={spec.x(10 ** e)} y={spec.yBase + 52} className="tt-scale-tick" textAnchor="middle">
              {{ 6: "1 MHz", 9: "1 GHz", 12: "1 THz", 15: "10¹⁵ Hz", 18: "10¹⁸ Hz", 21: "10²¹ Hz", 24: "10²⁴ Hz" }[e]}
            </text>
          ))}
        </svg>
        <p className="tmc-chart-caption">
          {cyclotron
            ? "A slow electron emits a single frequency."
            : "The spectrum of one electron: a slow rise and a sharp cut-off just above the critical frequency. A whole population of electrons with a range of energies adds up to a smooth power law."}
        </p>
      </div>
    </div>
  );
}
