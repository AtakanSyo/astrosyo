import { useEffect, useRef, useState } from "react";
import {
  K_B_EV,
  b0,
  deflection,
  photonEnergy,
  duaneHunt,
  tubeEfficiency,
  relativeBrightness,
  emissivity,
  coolingTime,
  spectrum,
  band,
  bandColor,
  formatEnergy,
  formatTiny,
} from "./bremsstrahlung";
import { formatDuration } from "../synchrotron-radiation/synchrotron";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import Katex from "../../Katex.jsx";

const NUCLEI = [
  { Z: 1, name: "Hydrogen" },
  { Z: 6, name: "Carbon" },
  { Z: 26, name: "Iron" },
  { Z: 74, name: "Tungsten" },
];

const ELECTRON_PRESETS = [
  { label: "Galaxy-cluster gas", keV: 8, Z: 1, note: "A typical electron in the 70-million-degree gas between the galaxies of a cluster." },
  { label: "Solar flare", keV: 20, Z: 1, note: "Electrons fired down a flaring magnetic loop smash into the Sun's denser lower atmosphere, and their bremsstrahlung lights up the loop's feet in hard X-rays." },
  { label: "Old TV tube", keV: 25, Z: 26, note: "The electron beam of an old picture tube made faint X-rays where it hit the screen, which is why the glass contained lead." },
  { label: "Dental X-ray", keV: 70, Z: 74, note: "Dental X-ray machines run at 60 to 70 kilovolts, firing electrons into a tungsten target." },
];

const GAS_PRESETS = [
  { label: "Orion Nebula", logT: 4, logN: 9, note: "At 10,000 K this glow would peak in the infrared, but there the gas cools mostly through atoms' spectral lines. Its bremsstrahlung shows up instead as a smooth radio glow, which radio telescopes see right through the surrounding dust." },
  { label: "Sun's corona", logT: Math.log10(1.5e6), logN: 15, note: "The million-degree corona shines in soft X-rays, with lines from highly ionised iron adding more light. Something keeps reheating it: without that, it would fade within days." },
  { label: "Solar flare", logT: Math.log10(2e7), logN: 17, note: "A flare heats magnetic loops to tens of millions of degrees, and they glow in X-rays for minutes to hours." },
  { label: "Galaxy cluster", logT: Math.log10(7e7), logN: 3, note: "The gas between a cluster's galaxies holds several times more mass than all its stars and glows in X-rays by bremsstrahlung. Outside the densest cores it is so thin that it can't cool in the age of the universe." },
  { label: "Fusion reactor", logT: Math.log10(1.5e8), logN: 20, note: "Bremsstrahlung is one of the main ways a fusion plasma loses heat. Below about 50 million degrees a deuterium–tritium plasma radiates energy faster than fusion makes it, so reactors have to run hotter." },
];

const deg = (r) => (r * 180) / Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

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

const pct = (x) => (x >= 0.01 ? `${(x * 100).toFixed(1)}%` : `${(x * 100).toPrecision(2)}%`);

/* ───────────────────────── one electron, one nucleus ───────────────────────── */

// The electron's path on screen. The real bend is often tiny, so the angle is
// exaggerated (but still grows with the real one) so the swing is visible.
function computeTrack(realDefl, normB, normK, W, H, s) {
  const q = Math.log10(Math.max(1e-3, deg(realDefl)));
  const shown = (lerp(14, 100, clamp01((q + 1.5) / 3.4)) * Math.PI) / 180;
  const bS = s * lerp(26, 95, normB);
  const B0 = bS * Math.tan(shown / 2);
  const V = s * lerp(150, 290, normK);
  const k = B0 * V * V;
  let x = -W * 0.62;
  let y = -bS;
  let vx = V;
  let vy = 0;
  let t = 0;
  const pts = [];
  let aMax = 0;
  let tPeak = 0;
  let iPeak = 0;
  const far = Math.max(W, H) * 0.72;
  for (let i = 0; i < 40000; i += 1) {
    const r = Math.hypot(x, y);
    const a = k / (r * r);
    if (a > aMax) {
      aMax = a;
      tPeak = t;
      iPeak = pts.length;
    }
    pts.push([x, y, t, a, vx, vy]);
    const dt = Math.min(1 / 300, (0.01 * r) / Math.hypot(vx, vy));
    // velocity Verlet with the pull towards the nucleus at the centre
    const ax = (-k * x) / (r * r * r);
    const ay = (-k * y) / (r * r * r);
    x += vx * dt + 0.5 * ax * dt * dt;
    y += vy * dt + 0.5 * ay * dt * dt;
    const r2 = Math.hypot(x, y);
    const ax2 = (-k * x) / (r2 * r2 * r2);
    const ay2 = (-k * y) / (r2 * r2 * r2);
    vx += 0.5 * (ax + ax2) * dt;
    vy += 0.5 * (ay + ay2) * dt;
    t += dt;
    if (r2 > far && x * vx + y * vy > 0 && t > 0.3) break;
  }
  return { pts, aMax, tPeak, peak: pts[iPeak], tEnd: t, V };
}

function ElectronPanel() {
  const [logK, setLogK] = useState(Math.log10(20));
  const [Z, setZ] = useState(1);
  const [logB, setLogB] = useState(Math.log10(10));
  const [note, setNote] = useState(ELECTRON_PRESETS[1].note);
  const canvasRef = useRef(null);
  const stillRef = useRef(null);

  const K = 10 ** logK * 1e3; // eV
  const b = 10 ** logB * 1e-12; // m
  const bb0 = b0(K, Z);
  const theta = deflection(b / bb0);
  const Eg = photonEnergy(K, Z, b);
  const capped = Eg >= K * 0.999;
  const lambdaMin = duaneHunt(K);
  const eta = tubeEfficiency(Z, K);
  const element = NUCLEI.find((n) => n.Z === Z)?.name ?? `Z = ${Z}`;
  const normB = clamp01(logB / 2); // 1 pm … 100 pm
  const normK = clamp01(logK / Math.log10(150));

  const stateRef = useRef({});
  stateRef.current = { theta, normB, normK, Z, Eg };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let visible = true;
    let W = 1;
    let H = 1;
    let track = null;
    let trackKey = "";
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trackKey = "";
      if (reduce) draw(null);
    };

    function draw(now) {
      const st = stateRef.current;
      const s = Math.min(W / 640, H / 360);
      const key = `${st.theta}|${st.normB}|${st.normK}|${W}|${H}`;
      if (key !== trackKey) {
        track = computeTrack(st.theta, st.normB, st.normK, W, H, s);
        trackKey = key;
      }
      const { pts, aMax, tPeak, peak, tEnd, V } = track;
      const cycle = tEnd + 1.4;
      // still frame: just after the photon leaves
      const t = now === null ? Math.min(tEnd, tPeak + 0.45) : ((now - t0) / 1000) % cycle;
      const cx = W * 0.5;
      const cy = H * 0.54;
      const col = bandColor(st.Eg);

      ctx.clearRect(0, 0, W, H);

      // the nucleus
      const nr = s * (6 + 2.2 * Math.log(st.Z + 1));
      const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, nr * 3.2);
      ng.addColorStop(0, "rgba(255,240,220,1)");
      ng.addColorStop(0.3, "rgba(255,150,90,0.85)");
      ng.addColorStop(1, "rgba(255,120,60,0)");
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(cx, cy, nr * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(40,20,10,0.9)";
      ctx.font = `600 ${Math.round(11 * Math.max(0.8, s))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`+${st.Z}`, cx, cy + 4);
      ctx.textAlign = "left";

      // the whole path, faint
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = "rgba(127,214,255,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(cx + x, cy + y) : ctx.lineTo(cx + x, cy + y)));
      ctx.stroke();
      ctx.setLineDash([]);

      // the trail so far: brightest where the pull, and so the radiation, is strongest
      let idx = 0;
      while (idx < pts.length - 1 && pts[idx + 1][2] <= t) idx += 1;
      ctx.lineWidth = 2;
      for (let i = Math.max(1, idx - 260); i <= idx; i += 1) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1, , a] = pts[i];
        const glow = Math.min(1, a / aMax) ** 0.6;
        const age = (idx - i) / 260;
        ctx.strokeStyle = `rgba(${Math.round(lerp(127, 255, glow))},${Math.round(lerp(214, 240, glow))},255,${(0.85 * (1 - age)).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(cx + x0, cy + y0);
        ctx.lineTo(cx + x1, cy + y1);
        ctx.stroke();
      }

      // the photon, born where the swing is sharpest
      const since = t - tPeak;
      if (since > 0) {
        const [px, py, , , pvx, pvy] = peak;
        const sp = Math.hypot(pvx, pvy);
        const ux = pvx / sp;
        const uy = pvy / sp;
        // an expanding shell, brightest at right angles to the pull (a dipole)
        const shellR = since * V * 3.2;
        const fade = Math.max(0, 1 - shellR / (W * 0.7));
        if (fade > 0) {
          const pull = Math.atan2(-py, -px);
          for (let kk = 0; kk < 90; kk += 1) {
            const a0 = (kk / 90) * Math.PI * 2;
            const a1 = ((kk + 1) / 90) * Math.PI * 2;
            const w = Math.sin((a0 + a1) / 2 - pull) ** 2;
            if (w < 0.03) continue;
            ctx.strokeStyle = col;
            ctx.globalAlpha = 0.35 * w * fade;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx + px, cy + py, shellR, a0, a1);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        // the photon itself, a wiggle heading off along the electron's motion
        const dist = since * V * 3.2;
        const lam = s * lerp(22, 6, clamp01(Math.log10(Math.max(10, st.Eg) / 10) / 4.2));
        const len = lam * 3;
        const hx = cx + px + ux * dist;
        const hy = cy + py + uy * dist;
        if (hx > -len && hx < W + len && hy > -len && hy < H + len) {
          ctx.strokeStyle = col;
          ctx.shadowColor = col;
          ctx.shadowBlur = 10;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let d = 0; d <= len; d += 1) {
            const off = Math.sin((d / lam) * Math.PI * 2) * 5 * s * Math.sin((Math.PI * d) / len);
            const xx = hx - ux * d - uy * off;
            const yy = hy - uy * d + ux * off;
            if (d === 0) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.font = "11px system-ui, sans-serif";
          const single = { "X-rays": "X-ray", "gamma rays": "gamma-ray", "visible light": "visible-light" };
          ctx.fillText(`${single[band(st.Eg)] ?? band(st.Eg)} photon`, hx + 8, hy - 10);
        }
      }

      // the electron
      const [ex, ey] = pts[idx];
      if (t <= tEnd) {
        const eg = ctx.createRadialGradient(cx + ex, cy + ey, 0, cx + ex, cy + ey, 15 * s);
        eg.addColorStop(0, "rgba(255,255,255,1)");
        eg.addColorStop(0.35, "rgba(127,214,255,0.9)");
        eg.addColorStop(1, "rgba(127,214,255,0)");
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(cx + ex, cy + ey, 15 * s, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("electron", 10, cy - s * lerp(26, 95, st.normB) - 10);
      ctx.textAlign = "center";
      ctx.fillText(`nucleus (+${st.Z})`, cx, cy + nr * 3.2 + 12);
      ctx.textAlign = "left";
      ctx.fillText("the bend is exaggerated so you can see it", 10, H - 8);
    }

    resize();
    if (reduce) stillRef.current = () => draw(null);
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

  useEffect(() => {
    stillRef.current?.();
  }, [logK, Z, logB]);

  // the spectrum from many such electrons stopped in a thick target: Kramers' law,
  // brightness per photon energy ∝ Z (K − E), ending at E = K
  const sx = (E) => 40 + (E / K) * 540;
  const egX = sx(Math.min(Eg, K));

  return (
    <>
      <div className="tmc-presets" style={{ marginBottom: "0.8rem" }}>
        {ELECTRON_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="tmc-preset-btn"
            onClick={() => {
              setLogK(Math.log10(p.keV));
              setZ(p.Z);
              setNote(p.note);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="tt-row">
        <div className="tt-seg" role="radiogroup" aria-label="Nucleus">
          <span className="tt-seg-label">Nucleus</span>
          {NUCLEI.map((n) => (
            <button key={n.Z} type="button" role="radio" aria-checked={Z === n.Z} className={`tt-seg-btn${Z === n.Z ? " is-on" : ""}`} onClick={() => { setZ(n.Z); setNote(""); }}>
              {n.name}
            </button>
          ))}
        </div>
      </div>
      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="br-k">Electron energy: {formatEnergy(K)}</label>
          <input id="br-k" type="range" min={0} max={Math.log10(150)} step={0.01} value={logK} onChange={(e) => { setLogK(Number(e.target.value)); setNote(""); }} />
        </div>
        <div className="tmc-field">
          <label htmlFor="br-b">How close it passes: {formatTiny(b)}</label>
          <input id="br-b" type="range" min={0} max={2} step={0.01} value={logB} onChange={(e) => setLogB(Number(e.target.value))} />
        </div>
      </div>
      <div className="chart-wrap" style={{ padding: 0, overflow: "hidden", background: "#05060a" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", aspectRatio: "16 / 9", display: "block" }}
          aria-label={`Animation: an electron swings past a nucleus of charge ${Z} and gives off a ${band(Eg)} photon of about ${formatEnergy(Eg)}`}
        />
      </div>
      <div className="tmc-headline-card tmc-tone-good">
        <div className="tmc-headline">
          Gives off a photon of about {formatEnergy(Eg)} · {band(Eg)}
        </div>
        <div className="tmc-headline-sub">
          Bent by {deg(theta) >= 1 ? deg(theta).toFixed(1) : deg(theta).toPrecision(2)}° · never more than {formatEnergy(K)}, the electron's whole energy (shortest wavelength {formatTiny(lambdaMin)})
        </div>
        <div className="tmc-verdict">
          <span className="tmc-verdict-title">
            {capped
              ? "This close, it can hand over all its energy in a single photon."
              : logB > 1.5
                ? "A distant pass is a gentle nudge, so the photon is softer."
                : "The sharper the swing, the more energetic the photon."}
          </span>{" "}
          {Z > 1 ? (
            <>
              A +{Z} nucleus pulls {Z} times harder than hydrogen's, so it shines {relativeBrightness(Z).toLocaleString("en-US")}× as bright. Stop a beam of these electrons in solid {element.toLowerCase()} and only {pct(eta)} of their energy comes out as X-rays; the rest is heat.
            </>
          ) : (
            <>Heavier nuclei pull harder and shine brighter, as the square of their charge: try tungsten.</>
          )}
          {note && <> {note}</>}
        </div>
      </div>
      <div className="chart-wrap">
        <svg viewBox="0 0 600 190" className="tmc-gauge-svg" style={{ maxHeight: 230 }} role="img" aria-label={`X-ray tube spectrum, falling in a straight line to zero at ${formatEnergy(K)}`}>
          <polygon points={`40,30 580,160 40,160`} fill="rgba(159,227,255,0.12)" stroke="rgba(159,227,255,0.7)" strokeWidth="1.5" />
          <line x1="40" y1="160" x2="585" y2="160" stroke="rgba(255,255,255,0.35)" />
          <line x1={egX} y1="22" x2={egX} y2="160" stroke={bandColor(Eg)} strokeDasharray="3 4" />
          <circle cx={egX} cy={30 + (130 * Math.min(Eg, K)) / K} r="4" fill={bandColor(Eg)} />
          <text x={Math.min(egX + 6, 470)} y="20" fill="rgba(255,255,255,0.75)" fontSize="12">this pass</text>
          <text x="40" y="178" fill="rgba(255,255,255,0.55)" fontSize="11">0</text>
          <text x="580" y="178" fill="rgba(255,255,255,0.55)" fontSize="11" textAnchor="end">{formatEnergy(K)}</text>
          <text x="310" y="178" fill="rgba(255,255,255,0.55)" fontSize="11" textAnchor="middle">photon energy</text>
        </svg>
        <p className="tmc-chart-caption">
          Many electrons, all stopped in a thick target as in an X-ray tube: plenty of soft photons, fewer hard ones, and none above the electrons' own energy.
        </p>
      </div>
    </>
  );
}

/* ───────────────────────── a hot gas ───────────────────────── */

function GasPanel() {
  const [logT, setLogT] = useState(GAS_PRESETS[3].logT);
  const [logN, setLogN] = useState(GAS_PRESETS[3].logN);
  const [note, setNote] = useState(GAS_PRESETS[3].note);
  const canvasRef = useRef(null);
  const stillRef = useRef(null);

  const T = 10 ** logT;
  const n = 10 ** logN;
  const kT = K_B_EV * T;
  const eps = emissivity(T, n);
  const tCool = coolingTime(T, n);
  const normT = clamp01((logT - 3.5) / 5.5);
  const normN = clamp01(logN / 22);

  const stateRef = useRef({});
  stateRef.current = { normT, normN, color: bandColor(kT) };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let visible = true;
    let W = 1;
    let H = 1;
    let last = performance.now();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const ions = Array.from({ length: 14 }, () => [rand(), rand()]);
    const electrons = Array.from({ length: 48 }, () => {
      const a = rand() * Math.PI * 2;
      return { x: rand(), y: rand(), dx: Math.cos(a), dy: Math.sin(a), cool: 0 };
    });
    let flashes = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw(performance.now(), 0);
    };

    function draw(now, dt) {
      const { normT: nt, normN: nn, color } = stateRef.current;
      const s = Math.min(W / 640, H / 300);
      const count = Math.round(lerp(14, 48, nn));
      const speed = s * lerp(40, 330, nt);
      ctx.clearRect(0, 0, W, H);

      const ip = ions.map(([x, y]) => [x * W, y * H]);
      ip.forEach(([x, y]) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 7 * s);
        g.addColorStop(0, "rgba(255,190,140,0.9)");
        g.addColorStop(1, "rgba(255,150,90,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 7 * s, 0, Math.PI * 2);
        ctx.fill();
      });

      for (let i = 0; i < count; i += 1) {
        const e = electrons[i];
        e.x += (e.dx * speed * dt) / W;
        e.y += (e.dy * speed * dt) / H;
        if (e.x < 0 || e.x > 1) { e.dx *= -1; e.x = Math.max(0, Math.min(1, e.x)); }
        if (e.y < 0 || e.y > 1) { e.dy *= -1; e.y = Math.max(0, Math.min(1, e.y)); }
        e.cool -= dt;
        const ex = e.x * W;
        const ey = e.y * H;
        for (const [ix, iy] of ip) {
          const d = Math.hypot(ex - ix, ey - iy);
          if (d < 16 * s && e.cool <= 0) {
            // swung round by the ion: a flash of bremsstrahlung, and a new direction
            flashes.push({ x: ex, y: ey, t: now });
            const a = Math.atan2(e.dy, e.dx) + (rand() - 0.5) * 2.2;
            e.dx = Math.cos(a);
            e.dy = Math.sin(a);
            e.cool = 0.35;
            break;
          }
        }
        const er = 6 * Math.max(0.8, s);
        const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
        eg.addColorStop(0, "rgba(235,248,255,1)");
        eg.addColorStop(0.35, "rgba(127,214,255,0.85)");
        eg.addColorStop(1, "rgba(127,214,255,0)");
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.fill();
      }

      flashes = flashes.filter((f) => now - f.t < 650);
      flashes.forEach((f) => {
        const age = (now - f.t) / 650;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = (1 - age) * 0.9;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 3 + age * 18 * s, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("orange: ions · blue: electrons · rings: photons, coloured by the light they're mostly in", 10, H - 8);
    }

    resize();
    if (reduce) {
      stillRef.current = () => {
        // a few steps so some flashes show in the still frame
        for (let i = 0; i < 40; i += 1) draw(performance.now(), 1 / 30);
      };
      stillRef.current();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
    });
    io.observe(canvas);
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible) draw(now, dt);
    };
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    stillRef.current?.();
  }, [logT, logN]);

  // spectrum: ν ε_ν against photon energy, 0.1 meV to 1 MeV, log–log
  const X0 = -4;
  const X1 = 6;
  const px = (le) => 40 + ((le - X0) / (X1 - X0)) * 540;
  const py = (y) => 20 + ((0 - Math.log10(Math.max(1e-3, y))) / 3) * 140;
  const curve = [];
  for (let le = X0; le <= X1 + 1e-9; le += 0.04) {
    const y = spectrum(10 ** le, T);
    if (y >= 1e-3) curve.push(`${px(le).toFixed(1)},${py(y).toFixed(1)}`);
  }
  const BANDS = [
    [X0, Math.log10(1.24e-3), "radio", "#ffb46b"],
    [Math.log10(1.24e-3), Math.log10(1.65), "infrared", "#ff6b6b"],
    [Math.log10(1.65), Math.log10(3.26), "visible", "#9be37a"],
    [Math.log10(3.26), 2, "UV", "#b18cff"],
    [2, 5, "X-rays", "#9fe3ff"],
    [5, X1, "gamma", "#f3b8ff"],
  ];
  const lkT = Math.log10(kT);

  return (
    <>
      <div className="tmc-presets" style={{ marginBottom: "0.8rem" }}>
        {GAS_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="tmc-preset-btn"
            onClick={() => {
              setLogT(p.logT);
              setLogN(p.logN);
              setNote(p.note);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="br-t">
            Temperature: <Sci n={T} unit="K" />
          </label>
          <input id="br-t" type="range" min={3.5} max={9} step={0.01} value={logT} onChange={(e) => { setLogT(Number(e.target.value)); setNote(""); }} />
        </div>
        <div className="tmc-field">
          <label htmlFor="br-n">
            Electrons per m³: <Sci n={n} />
          </label>
          <input id="br-n" type="range" min={0} max={22} step={0.05} value={logN} onChange={(e) => { setLogN(Number(e.target.value)); setNote(""); }} />
        </div>
      </div>
      <div className="chart-wrap" style={{ padding: 0, overflow: "hidden", background: "#05060a" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", aspectRatio: "16 / 7.5", display: "block" }}
          aria-label={`Animation: electrons in a gas at ${Math.round(T).toLocaleString("en-US")} K swing past ions and give off flashes of ${band(kT)}`}
        />
      </div>
      <div className="tmc-headline-card tmc-tone-good">
        <div className="tmc-headline">Glows brightest in {band(kT)}</div>
        <div className="tmc-headline-sub">
          Peak photon energy {formatEnergy(kT)} · <Sci n={eps} unit="W" /> from every cubic metre
        </div>
        <div className="tmc-verdict">
          <span className="tmc-verdict-title">On bremsstrahlung alone, it would cool down in {formatDuration(tCool)}.</span>
          {note && <> {note}</>}
        </div>
      </div>
      <div className="chart-wrap">
        <svg viewBox="0 0 600 205" className="tmc-gauge-svg" style={{ maxHeight: 250 }} role="img" aria-label={`Spectrum of a gas at ${Math.round(T).toLocaleString("en-US")} K, peaking at ${formatEnergy(kT)}`}>
          {BANDS.map(([a, z, label, c]) => (
            <g key={label}>
              <rect x={px(a)} y="168" width={Math.max(0, px(z) - px(a))} height="14" fill={c} opacity="0.18" />
              <text x={(px(a) + px(z)) / 2} y="179" fill="rgba(255,255,255,0.7)" fontSize="10" textAnchor="middle">{label}</text>
            </g>
          ))}
          <polyline points={curve.join(" ")} fill="none" stroke={bandColor(kT)} strokeWidth="2" />
          {lkT >= X0 && lkT <= X1 && (
            <>
              <line x1={px(lkT)} y1="16" x2={px(lkT)} y2="166" stroke="rgba(255,255,255,0.35)" strokeDasharray="3 4" />
              <text x={Math.min(px(lkT) + 6, 520)} y="14" fill="rgba(255,255,255,0.75)" fontSize="11">peak, E = kT</text>
            </>
          )}
          {[[-3, "1 meV"], [0, "1 eV"], [3, "1 keV"], [6, "1 MeV"]].map(([le, l]) => (
            <text key={l} x={px(le)} y="198" fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor={le === 6 ? "end" : "middle"}>{l}</text>
          ))}
        </svg>
        <p className="tmc-chart-caption">
          The gas's light (energy per log interval) against photon energy. Hotter gas shifts it all to the right; the brightness falls off sharply above kT.
        </p>
      </div>
    </>
  );
}

export default function Bremsstrahlung() {
  return (
    <div className="tmc" aria-label="Bremsstrahlung visualization">
      <div className="tmc-header">
        <p className="tmc-title">One electron, one nucleus</p>
      </div>
      <p className="tmc-explainer">
        <Katex tex="E_\gamma \approx \frac{\hbar v}{b} \le K" /> — the closer the pass, the harder the photon, up to the electron's whole energy.
      </p>
      <ElectronPanel />
      <p className="tmc-title" style={{ marginTop: "1.6rem" }}>A hot gas glowing</p>
      <p className="tmc-explainer">
        <Katex tex="\varepsilon \propto n_e n_i \sqrt{T}, \quad \nu\varepsilon_\nu \propto E\, e^{-E/kT}" />
      </p>
      <GasPanel />
    </div>
  );
}
