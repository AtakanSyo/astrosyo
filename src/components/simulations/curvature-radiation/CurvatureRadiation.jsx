import { useEffect, useMemo, useRef, useState } from "react";
import { criticalFrequency, power, lossTime, formatDistance } from "./curvature";
import { synchrotronF, PEAK_X, hzToEv, evToHz, electronEnergyEv, formatFrequency, C } from "../synchrotron-radiation/synchrotron";
import { BANDS, bandOf, formatEnergy } from "../compton-scattering/compton";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import Katex from "../../Katex.jsx";

const PRESETS = [
  { label: "Pulsar gamma rays", logGamma: Math.log10(2e7), logRho: 6, note: "Electrons and positrons near the radiation-reaction limit, sliding along field lines curved over about 1,000 km: the GeV gamma rays the Fermi telescope sees from pulsars." },
  { label: "Straighter field line", logGamma: Math.log10(2e7), logRho: 8, note: "The same particle on a field line curved over 100,000 km, a hundred times gentler: a hundred times lower in frequency." },
  { label: "Pulsar radio (coherent)", logGamma: Math.log10(300), logRho: 6, note: "Here particles with γ = 300 on a field line curved over 1,000 km." },
  { label: "Magnetar burst idea", logGamma: Math.log10(140), logRho: 5, note: "Coherent curvature radiation near a magnetar is one of the proposed explanations for fast radio bursts, still debated." },
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

export default function CurvatureRadiation() {
  const [logGamma, setLogGamma] = useState(Math.log10(2e7));
  const [logRho, setLogRho] = useState(6);
  const [note, setNote] = useState(PRESETS[0].note);
  const canvasRef = useRef(null);

  const gamma = 10 ** logGamma;
  const rho = 10 ** logRho;
  const nuC = criticalFrequency(gamma, rho);
  const nuPeak = PEAK_X * nuC;
  const ePeak = hzToEv(nuPeak);
  const band = bandOf(ePeak);
  const color = BAND_COLORS[band.key];
  const P = power(gamma, rho);
  const tLoss = lossTime(gamma, rho);
  const cone = 1 / gamma;

  // Animation: dipole field around a neutron star, particles sliding out
  // along one open field line, photons leaving along the local tangent.
  const colorRef = useRef(color);
  colorRef.current = color;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let visible = true;
    let W = 1;
    let Hh = 1;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const photons = [];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      Hh = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(Hh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
    });
    io.observe(canvas);

    const TILT = deg(-12); // magnetic axis leans slightly right of vertical
    const geom = () => {
      const s = Math.min(W / 640, Hh / 360);
      return { sx: W * 0.2, sy: Hh * 0.78, R: 13 * s, s };
    };
    // point on a dipole field line r = L sin²θ, θ from the magnetic axis
    const point = (L, th, side, g) => {
      const r = L * Math.sin(th) ** 2;
      const mx = side * r * Math.sin(th);
      const my = r * Math.cos(th);
      const x = mx * Math.cos(TILT) - my * Math.sin(TILT);
      const y = mx * Math.sin(TILT) + my * Math.cos(TILT);
      return [g.sx + x, g.sy - y];
    };
    const th0 = (L, g) => Math.asin(Math.min(1, Math.sqrt(g.R / L)));
    const LP = 470; // the particles' field line, in px at s = 1 (tightly curved so the photon fan shows)
    const PERIOD = 2.8;
    const N_PART = 3;
    const TH_END = 1.3;

    const drawLine = (L, side, g, alpha, thMax = Math.PI - th0(L, g)) => {
      ctx.strokeStyle = `rgba(140,170,255,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const a = th0(L, g);
      for (let i = 0; i <= 120; i += 1) {
        const th = a + ((thMax - a) * i) / 120;
        const [x, y] = point(L, th, side, g);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    let last = performance.now();
    let emitAcc = 0;
    const t0 = last;
    const draw = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = (now - t0) / 1000;
      const g = geom();
      const col = colorRef.current;
      ctx.clearRect(0, 0, W, Hh);

      // field lines: closed loops and open lines from the polar cap
      [60, 105, 170, 270].forEach((L, i) => {
        [1, -1].forEach((side) => drawLine(L * g.s, side, g, 0.28 - i * 0.04));
      });
      [600, 2200].forEach((L) => [1, -1].forEach((side) => drawLine(L * g.s, side, g, 0.16, 1.25)));
      drawLine(LP * g.s, 1, g, 0.5, 1.35);
      drawLine(LP * g.s, -1, g, 0.16, 1.35);

      // the neutron star
      const sg = ctx.createRadialGradient(g.sx, g.sy, 0, g.sx, g.sy, g.R * 3);
      sg.addColorStop(0, "rgba(255,255,255,1)");
      sg.addColorStop(0.3, "rgba(190,215,255,0.95)");
      sg.addColorStop(1, "rgba(150,190,255,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(g.sx, g.sy, g.R * 3, 0, Math.PI * 2);
      ctx.fill();

      // particles
      const L = LP * g.s;
      const a0 = th0(L, g);
      const parts = Array.from({ length: N_PART }, (_, k) => {
        const u = ((time / PERIOD + k / N_PART) % 1);
        const th = a0 + (TH_END - a0) * u;
        const [x, y] = point(L, th, 1, g);
        const [x2, y2] = point(L, th + 1e-3, 1, g);
        const d = Math.hypot(x2 - x, y2 - y);
        return { th, x, y, dx: (x2 - x) / d, dy: (y2 - y) / d, u };
      });

      // emit photons along each particle's current direction of motion
      emitAcc += dt;
      while (emitAcc > 0.045) {
        emitAcc -= 0.045;
        parts.forEach((p) => {
          if (p.u > 0.04) photons.push({ x: p.x, y: p.y, dx: p.dx, dy: p.dy, age: 0 });
        });
      }
      // Particles and photons both move at almost exactly c; the photons are drawn
      // faster so they visibly stream off along the tangents and form the fan.
      const speed = 950 * g.s;
      for (let i = photons.length - 1; i >= 0; i -= 1) {
        const ph = photons[i];
        ph.x += ph.dx * speed * dt;
        ph.y += ph.dy * speed * dt;
        ph.age += dt;
        if (ph.x < -20 || ph.x > W + 20 || ph.y < -20 || ph.y > Hh + 20) photons.splice(i, 1);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 6;
      photons.forEach((ph) => {
        ctx.globalAlpha = Math.max(0.2, 1 - ph.age * 0.9);
        ctx.beginPath();
        ctx.moveTo(ph.x, ph.y);
        ctx.lineTo(ph.x - ph.dx * 16 * g.s, ph.y - ph.dy * 16 * g.s);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // osculating circle at the lead particle: the radius of curvature ρ
      const lead = parts.reduce((a, b) => (Math.abs(b.u - 0.55) < Math.abs(a.u - 0.55) ? b : a));
      const [ax, ay] = point(L, lead.th - 0.03, 1, g);
      const [bx, by] = [lead.x, lead.y];
      const [cx2, cy2] = point(L, lead.th + 0.03, 1, g);
      const dd = 2 * (ax * (by - cy2) + bx * (cy2 - ay) + cx2 * (ay - by));
      if (Math.abs(dd) > 1e-6) {
        const ux = ((ax * ax + ay * ay) * (by - cy2) + (bx * bx + by * by) * (cy2 - ay) + (cx2 * cx2 + cy2 * cy2) * (ay - by)) / dd;
        const uy = ((ax * ax + ay * ay) * (cx2 - bx) + (bx * bx + by * by) * (ax - cx2) + (cx2 * cx2 + cy2 * cy2) * (bx - ax)) / dd;
        const rr = Math.hypot(bx - ux, by - uy);
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ux, uy, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ux, uy);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = `${Math.round(12 * Math.max(0.85, g.s))}px system-ui, sans-serif`;
        ctx.fillText("ρ", (ux + bx) / 2 + 5, (uy + by) / 2 - 4);
      }

      parts.forEach((p) => {
        const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
        pg.addColorStop(0, "rgba(255,255,255,1)");
        pg.addColorStop(0.35, "rgba(150,220,255,0.9)");
        pg.addColorStop(1, "rgba(150,220,255,0)");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("neutron star", g.sx + g.R * 2.4, g.sy + g.R * 2.6);
      ctx.fillText("photons leave along the field line's direction at each point", 12, Hh - 8);
      ctx.fillText("dashed circle: the field line's radius of curvature ρ", 12, 18);
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (visible) draw(now);
    };
    if (reduce) {
      // a still frame with the photon fan already formed
      last = performance.now();
      for (let k = 0; k < 120; k += 1) draw(last + k * 25);
    } else raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const spec = useMemo(() => {
    const W = 640;
    const lo = 6;
    const hi = 26;
    const x = (nu) => 20 + ((Math.log10(nu) - lo) / (hi - lo)) * (W - 40);
    const yTop = 18;
    const yBase = 128;
    const bands = BANDS.map((b) => ({
      ...b,
      x1: x(Math.max(10 ** lo, evToHz(Math.max(b.min, 1e-30)))),
      x2: x(Math.min(10 ** hi, evToHz(Math.min(b.max, 1e30)))),
    })).filter((b) => b.x2 > b.x1);
    const pts = [];
    for (let i = 0; i <= 260; i += 1) {
      const lnu = lo + ((hi - lo) * i) / 260;
      const f = synchrotronF(10 ** lnu / nuC) / 0.918;
      pts.push(`${i ? "L" : "M"}${x(10 ** lnu).toFixed(1)},${(yBase - f * (yBase - yTop)).toFixed(1)}`);
    }
    return { W, x, yTop, yBase, bands, path: pts.join(" "), xp: x(nuPeak) };
  }, [nuC, nuPeak]);

  const applyPreset = (p) => {
    setLogGamma(p.logGamma);
    setLogRho(p.logRho);
    setNote(p.note);
  };

  return (
    <div className="tmc" aria-label="Curvature radiation visualization">
      <div className="tmc-header">
        <p className="tmc-title">Curvature radiation</p>
        <div className="tmc-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="tmc-preset-btn" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="tmc-explainer">
        <Katex tex="\nu_c = \dfrac{3}{4\pi}\,\gamma^3\,\dfrac{c}{\rho}" />
      </p>

      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="cv-g">
            Lorentz factor γ: {gamma < 1e4 ? Math.round(gamma).toLocaleString("en-US") : <Sci n={gamma} />} (energy {formatEnergy(electronEnergyEv(gamma))})
          </label>
          <input id="cv-g" type="range" min={1} max={8} step={0.01} value={logGamma} onChange={(e) => { setLogGamma(Number(e.target.value)); setNote(""); }} />
        </div>
        <div className="tmc-field">
          <label htmlFor="cv-r">Field line's radius of curvature ρ: {formatDistance(rho)}</label>
          <input id="cv-r" type="range" min={4} max={8} step={0.01} value={logRho} onChange={(e) => { setLogRho(Number(e.target.value)); setNote(""); }} />
        </div>
      </div>

      <div className="chart-wrap" style={{ padding: 0, overflow: "hidden", background: "#05060a" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", aspectRatio: "16 / 9", display: "block" }}
          aria-label="Animation: particles slide outward along a curved magnetic field line from a neutron star, shedding photons along the line's direction, which fan out into a beam"
        />
      </div>

      <div className="tmc-headline-card tmc-tone-good">
        <div className="tmc-headline">
          Peaks at {formatFrequency(nuPeak)} · {formatEnergy(ePeak)}
        </div>
        <div className="tmc-headline-sub">
          {band.label} · critical frequency {formatFrequency(nuC)} · each particle radiates <Sci n={P} unit="W" /> · beamed within{" "}
          {cone * 206265 >= 60 ? `${((cone * 180) / Math.PI).toFixed(2)}°` : `${(cone * 206265).toFixed(cone * 206265 < 1 ? 3 : 1)}″`}
        </div>
        <div className="tmc-verdict">
          <span className="tmc-verdict-title">
            At this rate it would radiate away all its energy within {formatDistance(tLoss * C)}.
          </span>{" "}
          {band.key === "radio"
            ? "At radio frequencies a single particle's glow is hopelessly faint; what we see from pulsars needs huge numbers of particles radiating in step (coherently), which multiplies the power."
            : "Losses grow as γ⁴, so in a pulsar's electric field the particles stop gaining energy near γ ≈ 10⁷, where acceleration and radiation balance."}
          {note && <> {note}</>}
        </div>
      </div>

      <div className="chart-wrap">
        <svg viewBox={`0 0 ${spec.W} 190`} className="tmc-gauge-svg" role="img" aria-label={`Spectrum of one particle, peaking in the ${band.label}`}>
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
          <text x={spec.xp} y={spec.yTop - 8} className="tt-scale-tick" textAnchor="middle">peak, 0.29 ν_c</text>
          {[
            [6, "1 MHz"],
            [9, "1 GHz"],
            [12, "1 THz"],
            [15, "10¹⁵ Hz"],
            [18, "10¹⁸ Hz"],
            [21, "10²¹ Hz"],
            [24, "10²⁴ Hz"],
          ].map(([e, l]) => (
            <text key={e} x={spec.x(10 ** e)} y={spec.yBase + 52} className="tt-scale-tick" textAnchor="middle">
              {l}
            </text>
          ))}
        </svg>
        <p className="tmc-chart-caption">
          The spectrum of one particle has exactly the synchrotron shape, with the field line's curvature taking the place of
          the gyration radius.
        </p>
      </div>
    </div>
  );
}
