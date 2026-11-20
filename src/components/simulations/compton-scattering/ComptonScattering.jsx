import { useEffect, useMemo, useRef, useState } from "react";
import {
  ME_C2_KEV,
  wavelengthPm,
  scatteredEnergy,
  recoilAngle,
  kleinNishinaRelative,
  thomsonAverage,
  headOnMaximum,
  kleinNishinaParameter,
  electronEnergyEv,
  beamingAngle,
  bandOf,
  formatEnergy,
  BANDS,
} from "./compton";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import Katex from "../../Katex.jsx";

const COMPTON_PRESETS = [
  { label: "Compton's X-rays (17.5 keV)", e: 17.48 },
  { label: "Medical X-ray (60 keV)", e: 60 },
  { label: "Cs-137 gamma ray (662 keV)", e: 661.657 },
  { label: "Co-60 gamma ray (1.33 MeV)", e: 1332.5 },
];

const SEEDS = [
  { key: "cmb", label: "Cosmic microwave background", e: 6.34e-4 },
  { key: "ir", label: "Infrared from dust", e: 0.03 },
  { key: "star", label: "Starlight", e: 2 },
  { key: "radio", label: "Radio (synchrotron)", e: 1e-6 },
];

const IC_SCENARIOS = [
  { label: "CMB + 5 GeV electron", seed: "cmb", logGamma: 4 },
  { label: "Starlight + 500 MeV electron", seed: "star", logGamma: 3 },
  { label: "Radio + TeV electron", seed: "radio", logGamma: Math.log10(2e6) },
  { label: "Hot cluster gas", seed: "cmb", logGamma: Math.log10(1.02) },
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
function lerpColor(c1, c2, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [a, b] = [p(c1), p(c2)];
  return `rgb(${a.map((v, i) => Math.round(mix(v, b[i], t))).join(",")})`;
}

// Deterministic pseudo-random numbers so the scene is the same every loop.
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A wave packet along a direction: `len` px long, wavelength `wl` px.
function drawWave(ctx, x, y, angle, len, wl, amp, color, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  const steps = Math.max(24, Math.ceil(len / 2));
  for (let i = 0; i <= steps; i += 1) {
    const s = (i / steps) * len;
    // fade the packet's ends so it reads as a photon, not a line
    const env = Math.sin((Math.PI * i) / steps);
    const yy = Math.sin((2 * Math.PI * s) / wl) * amp * env;
    if (i === 0) ctx.moveTo(-s, yy);
    else ctx.lineTo(-s, yy);
  }
  ctx.stroke();
  ctx.restore();
}

function drawElectron(ctx, x, y, r = 6) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(150,220,255,0.9)");
  g.addColorStop(1, "rgba(150,220,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();
}

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
      if (reduce) draw(ctx, size, 0.72);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
    });
    io.observe(canvas);
    const t0 = performance.now();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      draw(ctx, size, (now - t0) / 1000);
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

// ---------------------------------------------------------------- Compton

function ComptonPanel() {
  const [logE, setLogE] = useState(Math.log10(661.657));
  const [thetaDeg, setThetaDeg] = useState(110);
  const canvasRef = useRef(null);

  const E = 10 ** logE;
  const theta = deg(thetaDeg);
  const E1 = scatteredEnergy(E, theta);
  const lam = wavelengthPm(E);
  const lam1 = wavelengthPm(E1);
  const phi = recoilAngle(E, theta);
  const ke = E - E1;
  const loss = 1 - E1 / E;

  useCanvasLoop(
    canvasRef,
    (ctx, { w, h }, time) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.5;
      const cy = h * 0.52;
      const R = Math.min(w, h) * 0.42;

      // guides: incoming axis, scattered photon line, recoil line, angle arcs
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(24, cy);
      ctx.lineTo(w - 24, cy);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,190,120,0.35)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(theta) * R * 1.2, cy - Math.sin(theta) * R * 1.2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(150,220,255,0.35)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(phi) * R * 1.2, cy + Math.sin(phi) * R * 1.2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(255,190,120,0.7)";
      ctx.beginPath();
      ctx.arc(cx, cy, 34, -theta, 0);
      ctx.stroke();
      ctx.strokeStyle = "rgba(150,220,255,0.7)";
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, phi);
      ctx.stroke();
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,200,140,0.95)";
      ctx.fillText("θ", cx + Math.cos(-theta / 2) * 44 - 3, cy + Math.sin(-theta / 2) * 44 + 4);
      ctx.fillStyle = "rgba(160,225,255,0.95)";
      ctx.fillText("φ", cx + Math.cos(phi / 2) * 36 - 3, cy + Math.sin(phi / 2) * 36 + 5);

      // timeline: incoming photon, collision, then photon and electron fly apart
      const PERIOD = 3.4;
      const t = (time % PERIOD) / PERIOD;
      const HIT = 0.42;
      const wlIn = 18;
      const wlOut = Math.min(90, wlIn * (lam1 / lam));
      const cin = "#7fd6ff";
      const cout = lerpColor("#7fd6ff", "#ffb36b", Math.min(1, loss * 1.6 + 0.08));
      const packet = 110;
      if (t < HIT) {
        const x = mix(-packet * 0.2, cx, t / HIT);
        drawWave(ctx, x, cy, 0, packet, wlIn, 8, cin);
        drawElectron(ctx, cx, cy);
      } else {
        const u = (t - HIT) / (1 - HIT);
        if (u < 0.08) {
          ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - u / 0.08)})`;
          ctx.beginPath();
          ctx.arc(cx, cy, 26 * (u / 0.08) + 4, 0, Math.PI * 2);
          ctx.fill();
        }
        const d = u * R * 1.25;
        // The packet only exists past the collision point, so it never trails back through the electron.
        drawWave(ctx, cx + Math.cos(theta) * d, cy - Math.sin(theta) * d, -theta, Math.min(packet * (lam1 / lam), 220, d), wlOut, 8, cout, 1 - Math.max(0, u - 0.85) / 0.15);
        const de = u * R * mix(0.25, 0.95, Math.min(1, ke / E + 0.1));
        drawElectron(ctx, cx + Math.cos(phi) * de, cy + Math.sin(phi) * de);
      }
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText("incoming photon", 14, cy - 16);
      ctx.fillText("electron at rest", cx - 44, cy + 34);
    },
    [E, theta],
  );

  // Klein–Nishina polar plot (upper half: θ from 0 to 180°), with the
  // low-energy Thomson shape for comparison.
  const polar = useMemo(() => {
    const W = 640;
    const H = 300;
    const cx = W / 2;
    const cy = H - 26;
    const R = 250;
    const path = (fn) =>
      Array.from({ length: 91 }, (_, i) => {
        const th = (i / 90) * Math.PI;
        const r = fn(th) * R;
        return `${i ? "L" : "M"}${(cx + Math.cos(th) * r).toFixed(1)},${(cy - Math.sin(th) * r).toFixed(1)}`;
      }).join(" ");
    const kn = path((th) => kleinNishinaRelative(E, th));
    const th0 = path((th) => (1 + Math.cos(th) ** 2) / 2);
    const rNow = kleinNishinaRelative(E, theta) * R;
    return { W, H, cx, cy, R, kn, th0, mx: cx + Math.cos(theta) * rNow, my: cy - Math.sin(theta) * rNow };
  }, [E, theta]);

  return (
    <>
      <div className="tmc-presets" style={{ marginBottom: "0.8rem" }}>
        {COMPTON_PRESETS.map((p) => (
          <button key={p.label} type="button" className="tmc-preset-btn" onClick={() => setLogE(Math.log10(p.e))}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="cs-e">Photon energy: {formatEnergy(E * 1000)} ({lam.toFixed(lam < 10 ? 2 : 1)} pm)</label>
          <input id="cs-e" type="range" min={0} max={Math.log10(5000)} step={0.005} value={logE} onChange={(e) => setLogE(Number(e.target.value))} />
        </div>
        <div className="tmc-field">
          <label htmlFor="cs-t">Scattering angle θ: {thetaDeg}°</label>
          <input id="cs-t" type="range" min={0} max={180} step={1} value={thetaDeg} onChange={(e) => setThetaDeg(Number(e.target.value))} />
        </div>
      </div>

      <div className="chart-wrap" style={{ padding: 0, overflow: "hidden", background: "#05060a" }}>
        <canvas ref={canvasRef} style={{ width: "100%", aspectRatio: "16 / 8", display: "block" }} aria-label={`Animation: a ${formatEnergy(E * 1000)} photon scatters off an electron at ${thetaDeg} degrees and leaves with ${formatEnergy(E1 * 1000)}`} />
      </div>

      <div className="tmc-headline-card tmc-tone-good">
        <div className="tmc-headline">
          {formatEnergy(E * 1000)} → {formatEnergy(E1 * 1000)}
        </div>
        <div className="tmc-headline-sub">
          Wavelength {lam.toFixed(lam < 10 ? 3 : 2)} → {lam1.toFixed(lam1 < 10 ? 3 : 2)} pm (+{(lam1 - lam).toFixed(3)} pm) · Electron recoils at φ = {rad2deg(phi).toFixed(1)}° with {formatEnergy(ke * 1000)}
        </div>
        <div className="tmc-verdict">
          <span className="tmc-verdict-title">The photon keeps {(100 * (1 - loss)).toFixed(loss < 0.01 ? 2 : 1)}% of its energy.</span>{" "}
          {E < 30
            ? "At X-ray energies the shift is only a few picometres, a small fraction of the wavelength. It took careful measurement for Compton to see it in 1923."
            : E < ME_C2_KEV
              ? "The wavelength shift is the same few picometres at any energy, but against a gamma ray's short wavelength it is a big change."
              : "Above the electron's own rest energy (511 keV), a backscattered photon gives away most of its energy to the electron."}
        </div>
      </div>

      <div className="chart-wrap">
        <svg viewBox={`0 0 ${polar.W} ${polar.H}`} className="tmc-gauge-svg" role="img" aria-label="Polar plot of how likely each scattering angle is">
          <line x1={polar.cx - polar.R - 6} x2={polar.cx + polar.R + 6} y1={polar.cy} y2={polar.cy} className="tt-scale-axis" />
          <path d={polar.th0} fill="none" stroke="rgba(255,255,255,0.35)" strokeDasharray="3 4" />
          <path d={polar.kn} fill="rgba(127,214,255,0.12)" stroke="#7fd6ff" strokeWidth="1.6" />
          <line x1={polar.cx} y1={polar.cy} x2={polar.mx} y2={polar.my} stroke="#ffb36b" strokeWidth="1.2" />
          <circle cx={polar.mx} cy={polar.my} r="3.5" fill="#ffb36b" />
          <text x={polar.cx + polar.R} y={polar.cy + 18} className="tt-scale-tick" textAnchor="end">forward 0°</text>
          <text x={polar.cx - polar.R} y={polar.cy + 18} className="tt-scale-tick">back 180°</text>
        </svg>
        <p className="tmc-chart-caption">
          How likely each scattering angle is (the Klein–Nishina formula), as distance from the centre. The dashed curve is the
          low-energy limit, which scatters forward and backward equally; higher-energy photons mostly carry on forwards.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Inverse Compton

function formatAngle(r) {
  const d = rad2deg(r);
  if (d >= 1) return `${d.toFixed(1)}°`;
  if (d * 60 >= 1) return `${(d * 60).toFixed(1)}′`;
  const sec = d * 3600;
  return `${sec.toFixed(sec < 10 ? 2 : 0)}″`;
}

function Times({ n }) {
  if (n >= 1e4) {
    const exp = Math.floor(Math.log10(n));
    return (
      <>
        {(n / 10 ** exp).toFixed(1)} × 10<sup>{exp}</sup>
      </>
    );
  }
  return <>{n.toFixed(n < 10 ? 3 : 0)}</>;
}

function InversePanel() {
  const [seedKey, setSeedKey] = useState("cmb");
  const [logGamma, setLogGamma] = useState(4);
  const canvasRef = useRef(null);

  const seed = SEEDS.find((s) => s.key === seedKey);
  const gamma = 10 ** logGamma;
  const E0 = seed.e;
  const Eavg = thomsonAverage(gamma, E0);
  const Emax = headOnMaximum(gamma, E0);
  const knp = kleinNishinaParameter(gamma, E0);
  const cone = beamingAngle(gamma);
  // In the Klein–Nishina regime the Thomson average overshoots (it can exceed the
  // electron's own energy), so the corrected head-on maximum is what's shown.
  const kn = knp > 0.1;
  const Eshown = kn ? Emax : Eavg;
  const bandIn = bandOf(E0);
  const bandOut = bandOf(Eshown);

  const photons = useMemo(() => {
    const rand = makeRandom(11);
    return Array.from({ length: 34 }, () => ({
      hit: rand(),
      from: rand() * Math.PI * 2,
      out: rand() * 2 - 1,
      len: 0.85 + rand() * 0.3,
    }));
  }, []);

  useCanvasLoop(
    canvasRef,
    (ctx, { w, h }, time) => {
      ctx.clearRect(0, 0, w, h);
      const cy = h * 0.5;
      const PERIOD = 5;
      const t = (time % PERIOD) / PERIOD;
      const x0 = w * 0.06;
      const x1 = w * 0.94;
      const ex = mix(x0, x1, t);
      const MIN_CONE = 0.07; // narrower cones are drawn at this width so the photons don't merge
      const visCone = gamma < 1.5 ? Math.PI : Math.max(cone, MIN_CONE);
      const inColor = BAND_COLORS[bandIn.key];
      const outColor = BAND_COLORS[bandOut.key];
      const boost = Eshown / E0;
      const wlOut = Math.max(3.2, 16 / (1 + 0.55 * Math.log10(Math.max(boost, 1))));
      const SPEED_IN = w * 0.55; // px per period-fraction scale
      // Both the electron and the photons move at almost exactly c; scattered photons are drawn
      // faster than the electron only so they visibly leave it behind.
      const SPEED_OUT = w * 2.6;

      // beaming cone ahead of the electron
      if (gamma >= 1.5) {
        const L = w * 0.5;
        ctx.fillStyle = "rgba(201,168,255,0.07)";
        ctx.beginPath();
        ctx.moveTo(ex, cy);
        ctx.lineTo(ex + L, cy - Math.tan(visCone) * L);
        ctx.lineTo(ex + L, cy + Math.tan(visCone) * L);
        ctx.closePath();
        ctx.fill();
      }

      // electron trail
      const trail = ctx.createLinearGradient(ex - 120, cy, ex, cy);
      trail.addColorStop(0, "rgba(150,220,255,0)");
      trail.addColorStop(1, "rgba(150,220,255,0.6)");
      ctx.strokeStyle = trail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.max(x0, ex - 120), cy);
      ctx.lineTo(ex, cy);
      ctx.stroke();

      photons.forEach((p) => {
        const hx = mix(x0, x1, p.hit);
        // time since this photon's collision, wrapped so the stream never pauses at the loop seam
        const dt = ((t - p.hit + 1.5) % 1) - 0.5;
        if (dt < 0) {
          // incoming: travelling toward where the electron will be
          const d = -dt * SPEED_IN;
          if (d > w) return;
          const px = hx - Math.cos(p.from) * d;
          const py = cy - Math.sin(p.from) * d;
          drawWave(ctx, px, py, p.from, 46 * p.len, 15, 5, inColor, 0.85);
        } else {
          const ang = p.out * visCone;
          const d = dt * SPEED_OUT;
          if (d > w * 1.2) return;
          if (dt < 0.02) {
            ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - dt / 0.02)})`;
            ctx.beginPath();
            ctx.arc(hx, cy, 10, 0, Math.PI * 2);
            ctx.fill();
          }
          drawWave(ctx, hx + Math.cos(ang) * d, cy + Math.sin(ang) * d, ang, Math.min(30 * p.len, d), wlOut, 2.6, outColor, 1);
        }
      });
      drawElectron(ctx, ex, cy, 5);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "11px system-ui, sans-serif";
      if (gamma >= 1.5 && cone < MIN_CONE) ctx.fillText("beam drawn wider than real so the photons stay visible", 14, h - 14);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`electron, γ = ${gamma < 10 ? gamma.toFixed(2) : Math.round(gamma).toLocaleString("en-US")}`, Math.min(ex + 10, w - 150), cy + 26);
    },
    [seedKey, logGamma],
  );

  // Log energy axis from radio to very-high-energy gamma rays.
  const ladder = useMemo(() => {
    const W = 640;
    const lo = -7;
    const hi = 14;
    const x = (e) => 20 + ((Math.log10(e) - lo) / (hi - lo)) * (W - 40);
    const segs = BANDS.map((b) => ({ ...b, x1: x(Math.max(b.min, 10 ** lo)), x2: x(Math.min(b.max, 10 ** hi)) }));
    return { W, x, segs };
  }, []);
  const xin = ladder.x(E0);
  const xout = ladder.x(Math.min(Eshown, 1e14));

  return (
    <>
      <div className="tmc-presets" style={{ marginBottom: "0.8rem" }}>
        {IC_SCENARIOS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="tmc-preset-btn"
            onClick={() => {
              setSeedKey(s.seed);
              setLogGamma(s.logGamma);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="ic-seed">Low-energy photons</label>
          <select id="ic-seed" className="tmc-input" value={seedKey} onChange={(e) => setSeedKey(e.target.value)}>
            {SEEDS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} ({formatEnergy(s.e)})
              </option>
            ))}
          </select>
        </div>
        <div className="tmc-field">
          <label htmlFor="ic-g">
            Electron Lorentz factor γ: {gamma < 10 ? gamma.toFixed(2) : Math.round(gamma).toLocaleString("en-US")} (electron energy {formatEnergy(electronEnergyEv(gamma))})
          </label>
          <input id="ic-g" type="range" min={0} max={7} step={0.01} value={logGamma} onChange={(e) => setLogGamma(Number(e.target.value))} />
        </div>
      </div>

      <div className="chart-wrap" style={{ padding: 0, overflow: "hidden", background: "#05060a" }}>
        <canvas ref={canvasRef} style={{ width: "100%", aspectRatio: "16 / 8", display: "block" }} aria-label={`Animation: a fast electron scatters ${seed.label.toLowerCase()} photons forward into a narrow cone, raising them to about ${formatEnergy(Eshown)}`} />
      </div>

      <div className={`tmc-headline-card tmc-tone-${kn ? "warn" : "good"}`}>
        <div className="tmc-headline">
          {formatEnergy(E0)} → {kn ? "up to " : ""}{formatEnergy(Eshown)}
        </div>
        <div className="tmc-headline-sub">
          {bandIn.label} → {bandOut.label} ·{" "}
          {kn ? <>head-on, straight back · the Thomson estimate, {formatEnergy(Eavg)}, overshoots</> : <>on average ×<Times n={Eavg / E0} /> · head-on up to {formatEnergy(Emax)}</>}
          {gamma >= 1.5 && <> · beamed into a cone of about {formatAngle(cone)}</>}
        </div>
        <div className="tmc-verdict">
          {kn ? (
            <>
              <span className="tmc-verdict-title">Klein–Nishina regime (γE/mₑc² = {knp.toFixed(knp < 10 ? 2 : 0)}).</span> The electron is
              handing over a large share of its own energy, so the simple ×(4/3)γ² rule overestimates the average; the head-on value
              above includes the correction and can never exceed the electron's {formatEnergy(electronEnergyEv(gamma))}.
            </>
          ) : gamma < 1.5 ? (
            <>
              <span className="tmc-verdict-title">Slow electrons give a tiny boost.</span> This is the Sunyaev–Zel'dovich effect: hot gas
              in galaxy clusters nudges a small share of CMB photons to slightly higher energy, leaving a measurable dip in the CMB
              behind the cluster.
            </>
          ) : (
            <>
              <span className="tmc-verdict-title">Each photon gains about (4/3)γ² times its energy.</span> One factor of γ comes from
              the electron seeing the photon blueshifted, the second from the scattered photon being blueshifted again on its way out.
            </>
          )}
        </div>
      </div>

      <div className="chart-wrap">
        <svg viewBox={`0 0 ${ladder.W} 92`} className="tmc-gauge-svg" role="img" aria-label={`Energy scale: ${bandIn.label} photons raised to ${bandOut.label}`}>
          <defs>
            <marker id="ic-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,0.8)" />
            </marker>
          </defs>
          {ladder.segs.map((b) => (
            <g key={b.key}>
              <rect x={b.x1} y={40} width={Math.max(1, b.x2 - b.x1)} height={14} fill={BAND_COLORS[b.key]} opacity={0.22} />
              {b.x2 - b.x1 > 40 && (
                <text x={(b.x1 + b.x2) / 2} y={70} className="tt-scale-tick" textAnchor="middle">{b.label}</text>
              )}
            </g>
          ))}
          <path d={`M${xin},38 Q${(xin + xout) / 2},${8} ${xout},38`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.3" markerEnd="url(#ic-arrow)" />
          <circle cx={xin} cy={47} r={5} fill={BAND_COLORS[bandIn.key]} />
          <circle cx={xout} cy={47} r={5} fill={BAND_COLORS[bandOut.key]} />
          <text x={xin} y={86} className="tt-scale-tick" textAnchor="middle">{formatEnergy(E0)}</text>
          <text x={xout} y={86} className="tt-scale-tick" textAnchor="middle">{formatEnergy(Eshown)}</text>
        </svg>
        <p className="tmc-chart-caption">Photon energy on a logarithmic scale, from radio waves to gamma rays.</p>
      </div>
    </>
  );
}

export default function ComptonScattering() {
  const [mode, setMode] = useState("compton");
  return (
    <div className="tmc" aria-label="Compton and inverse Compton scattering visualization">
      <div className="tmc-header">
        <p className="tmc-title">{mode === "compton" ? "Compton scattering" : "Inverse Compton scattering"}</p>
      </div>
      <div className="tt-row">
        <div className="tt-seg" role="radiogroup" aria-label="Process">
          {[
            ["compton", "Compton: photon hits a resting electron"],
            ["inverse", "Inverse Compton: fast electron hits a photon"],
          ].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} className={`tt-seg-btn${mode === k ? " is-on" : ""}`} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="tmc-explainer">
        {mode === "compton" ? (
          <Katex tex="E' = \dfrac{E}{1 + \frac{E}{m_e c^2}(1 - \cos\theta)}" />
        ) : (
          <Katex tex="\langle E_1 \rangle \approx \tfrac{4}{3}\,\gamma^2 E" />
        )}
      </p>
      {mode === "compton" ? <ComptonPanel /> : <InversePanel />}
    </div>
  );
}
