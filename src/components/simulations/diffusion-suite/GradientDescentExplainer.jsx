import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

/**
 * Gradient descent on a 2D quadratic loss f(w) = ½ wᵀ H w.
 *
 * Left: the loss landscape as a heat map with contour lines; a ball takes
 * `steps` updates w ← w − η ∇f(w), leaving a trail, with a blue arrow showing
 * the next step. Right: the loss after each step on a log scale.
 *
 * H has eigenvalues λ_min ≈ 0.24 and λ_max ≈ 1.27, which sets the regimes:
 * η < 1/λ_max moves smoothly, 1/λ_max < η < 2/λ_max zig-zags across the
 * valley but still converges, and η > 2/λ_max diverges.
 */

const H = { a: 1.0, b: 0.45, c: 0.5 };
const START = { x: -4.2, y: 3.4 };
const STEPS_PER_SECOND = 4;
const X_RANGE = 6; // world units from the centre to the left/right edge
const LOSS_FLOOR = 1e-4;

const trace = H.a + H.c;
const disc = Math.sqrt(((H.a - H.c) / 2) ** 2 + H.b * H.b);
const LAMBDA_MAX = trace / 2 + disc;
const LR_OSCILLATE = 1 / LAMBDA_MAX;
const LR_DIVERGE = 2 / LAMBDA_MAX;
const LR_MIN = 0.02;
const LR_MAX = 1.8;

const WARM = [255, 196, 140];
const COOL = [130, 190, 255];
const RAMP = [
  [0, [10, 10, 16]],
  [0.35, [70, 30, 20]],
  [0.7, [176, 102, 44]],
  [1, [255, 226, 190]],
];

const loss = (x, y) => 0.5 * (H.a * x * x + 2 * H.b * x * y + H.c * y * y);
const grad = (x, y) => ({ x: H.a * x + H.b * y, y: H.b * x + H.c * y });
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

function heat(t) {
  for (let i = 1; i < RAMP.length; i += 1) {
    const [t1, c1] = RAMP[i];
    const [t0, c0] = RAMP[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(lerp(c0[j], c1[j], k)));
    }
  }
  return RAMP[RAMP.length - 1][1];
}

function regime(lr) {
  if (lr >= LR_DIVERGE) return { name: "Diverging", note: "each step overshoots further", color: "#ff8a78" };
  if (lr >= LR_OSCILLATE) return { name: "Oscillating", note: "zig-zags across the valley", color: "#f2b56b" };
  if (lr < 0.15) return { name: "Creeping", note: "stable but slow", color: "#9cc4ff" };
  return { name: "Smooth", note: "steady descent", color: "#ffe2be" };
}

function descend(lr, steps) {
  const pts = [{ ...START, f: loss(START.x, START.y) }];
  let { x, y } = START;
  for (let i = 0; i < steps; i += 1) {
    const g = grad(x, y);
    x -= lr * g.x;
    y -= lr * g.y;
    pts.push({ x, y, f: loss(x, y) });
  }
  return pts;
}

// Last step worth drawing: a diverging path is cut where it leaves the map.
function escapeIndex(pts) {
  const i = pts.findIndex((p) => Math.abs(p.x) > X_RANGE * 1.1 || Math.abs(p.y) > X_RANGE * 0.9);
  return i < 0 ? pts.length - 1 : i;
}

// Slider track coloured by regime.
const pct = (lr) => `${(((lr - LR_MIN) / (LR_MAX - LR_MIN)) * 100).toFixed(1)}%`;
const TRACK = `linear-gradient(90deg, #4d6488 0%, #9cc4ff ${pct(0.15)}, #ffe2be ${pct(LR_OSCILLATE)}, #f2b56b ${pct(LR_OSCILLATE)}, #c9773a ${pct(LR_DIVERGE)}, #ff8a78 ${pct(LR_DIVERGE)}, #a8382c 100%)`;

export default function GradientDescentExplainer({
  id = "gradient-descent-explainer",
  aspect = "16 / 9",
  steps = 18,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [lr, setLr] = useState(0.3);
  const [shown, setShown] = useState(steps); // steps revealed so far (float while animating)
  const [playing, setPlaying] = useState(false);
  const stateRef = useRef({ lr, shown });
  stateRef.current = { lr, shown };
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const path = descend(lr, steps);
  const limit = escapeIndex(path);
  const at = Math.min(limit, Math.floor(shown));
  const escaped = limit < steps && shown >= limit;
  const r = regime(lr);
  const f = path[at].f;
  const fText = f >= 1000 ? f.toExponential(1) : f >= 0.01 ? f.toFixed(3) : f.toExponential(1);

  // Play once on first view unless the viewer prefers reduced motion.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        stateRef.current.shown = 0;
        playingRef.current = true;
        setShown(0);
        setPlaying(true);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    const ctx = canvas.getContext("2d");
    let size = { w: 1, h: 1, dpr: 1 };
    let L = null; // layout
    let field = null; // pre-rendered heat map of the landscape

    const layout = () => {
      const { w, h } = size;
      const land = { x: w * 0.035, y: h * 0.12, w: w * 0.57, h: h * 0.83 };
      const chart = { x: w * 0.68, y: h * 0.12, w: w * 0.29, h: h * 0.7 };
      const scale = land.w / 2 / X_RANGE; // px per world unit
      return { land, chart, scale };
    };

    const toScreen = (wx, wy) => ({
      x: L.land.x + L.land.w / 2 + wx * L.scale,
      y: L.land.y + L.land.h / 2 - wy * L.scale,
    });

    const renderField = () => {
      const { land, scale } = L;
      const res = 3; // screen px per field pixel
      const fw = Math.max(1, Math.round(land.w / res));
      const fh = Math.max(1, Math.round(land.h / res));
      const c = document.createElement("canvas");
      c.width = fw;
      c.height = fh;
      const fctx = c.getContext("2d");
      const img = fctx.createImageData(fw, fh);
      const corner = loss(X_RANGE, (land.h / 2) / scale);
      const vmin = Math.log(LOSS_FLOOR * 10);
      const vmax = Math.log(Math.max(corner, loss(-X_RANGE, (land.h / 2) / scale)));
      for (let j = 0; j < fh; j += 1) {
        for (let i = 0; i < fw; i += 1) {
          const wx = ((i + 0.5) * res - land.w / 2) / scale;
          const wy = (land.h / 2 - (j + 0.5) * res) / scale;
          const t = (Math.log(loss(wx, wy) + LOSS_FLOOR) - vmin) / (vmax - vmin);
          const col = heat(Math.max(0, Math.min(1, 1 - t)) ** 1.6);
          const o = (j * fw + i) * 4;
          img.data[o] = col[0];
          img.data[o + 1] = col[1];
          img.data[o + 2] = col[2];
          img.data[o + 3] = 255;
        }
      }
      fctx.putImageData(img, 0, 0);
      return c;
    };

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      L = layout();
      field = renderField();
      draw(performance.now() / 1000);
    };

    const arrow = (x0, y0, x1, y1, head, color, width) => {
      const ang = Math.atan2(y1 - y0, x1 - x0);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - head * 0.6 * Math.cos(ang), y1 - head * 0.6 * Math.sin(ang));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(ang - 0.45), y1 - head * Math.sin(ang - 0.45));
      ctx.lineTo(x1 - head * Math.cos(ang + 0.45), y1 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    };

    function draw(time) {
      if (!L) return;
      const { w, h, dpr } = size;
      const { land, chart } = L;
      const { lr: curLr, shown: curShown } = stateRef.current;
      const pts = descend(curLr, steps);
      const unit = Math.min(w, h) / 400;
      const radius = Math.max(4, unit * 10);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // ---- Landscape ----
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(land.x, land.y, land.w, land.h, radius);
      ctx.clip();
      if (field) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(field, land.x, land.y, land.w, land.h);
      }

      // Contour lines at log-spaced loss levels (ellipses, drawn in polar form).
      [0.02, 0.08, 0.25, 0.7, 1.8, 4, 8, 15].forEach((lvl, li) => {
        ctx.strokeStyle = `rgba(255, 236, 214, ${0.32 - li * 0.025})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 96; i += 1) {
          const th = (i / 96) * Math.PI * 2;
          const cs = Math.cos(th);
          const sn = Math.sin(th);
          const rr = Math.sqrt((2 * lvl) / (H.a * cs * cs + 2 * H.b * sn * cs + H.c * sn * sn));
          const p = toScreen(rr * cs, rr * sn);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      });

      // Minimum marker.
      const m = toScreen(0, 0);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(m.x - 5 * unit, m.y);
      ctx.lineTo(m.x + 5 * unit, m.y);
      ctx.moveTo(m.x, m.y - 5 * unit);
      ctx.lineTo(m.x, m.y + 5 * unit);
      ctx.stroke();

      // Trail up to the current (fractional) step.
      const limit = escapeIndex(pts);
      const reveal = Math.min(curShown, limit);
      const whole = Math.min(limit, Math.floor(reveal));
      const frac = reveal - whole;
      const sp = pts.map((p) => toScreen(p.x, p.y));
      const ball = whole < limit ? { x: lerp(sp[whole].x, sp[whole + 1].x, smooth(frac)), y: lerp(sp[whole].y, sp[whole + 1].y, smooth(frac)) } : sp[steps];
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.8 * unit;
      ctx.beginPath();
      ctx.moveTo(sp[0].x, sp[0].y);
      for (let i = 1; i <= whole; i += 1) ctx.lineTo(sp[i].x, sp[i].y);
      ctx.lineTo(ball.x, ball.y);
      ctx.stroke();
      for (let i = 0; i <= whole; i += 1) {
        const fade = 0.35 + 0.65 * (i / Math.max(1, whole));
        ctx.fillStyle = rgba(WARM, fade);
        ctx.beginPath();
        ctx.arc(sp[i].x, sp[i].y, (i === 0 ? 3.2 : 2.2) * unit, 0, Math.PI * 2);
        ctx.fill();
      }

      // Next step: −η∇f from the ball's last resting point.
      if (whole < limit && frac < 0.05) {
        const a = sp[whole];
        const b = sp[whole + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) > 6 * unit) arrow(a.x, a.y, b.x, b.y, 6 * unit, rgba(COOL, 0.9), 1.6 * unit);
      }

      // Ball with glow.
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      const glow = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, (14 + pulse * 4) * unit);
      glow.addColorStop(0, "rgba(255, 255, 255, 0.55)");
      glow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, (14 + pulse * 4) * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 4.2 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(land.x, land.y, land.w, land.h, radius);
      ctx.stroke();

      // ---- Loss curve ----
      const lo = Math.log10(LOSS_FLOOR);
      const hi = Math.log10(pts[0].f) + 0.6;
      const cx = (i) => chart.x + (i / steps) * chart.w;
      const cy = (fv) => chart.y + chart.h - ((Math.max(lo, Math.min(hi, Math.log10(Math.max(fv, LOSS_FLOOR)))) - lo) / (hi - lo)) * chart.h;

      ctx.font = `${Math.max(8, 9.5 * unit)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let e = Math.ceil(lo); e <= Math.floor(hi); e += 1) {
        const y = cy(10 ** e);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chart.x, y);
        ctx.lineTo(chart.x + chart.w, y);
        ctx.stroke();
        if (e % 2 === 0) ctx.fillText(e === 0 ? "1" : `1e${e}`, chart.x - 4 * unit, y);
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.moveTo(chart.x, chart.y);
      ctx.lineTo(chart.x, chart.y + chart.h);
      ctx.lineTo(chart.x + chart.w, chart.y + chart.h);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("0", cx(0), chart.y + chart.h + 4 * unit);
      ctx.fillText(`${steps}`, cx(steps), chart.y + chart.h + 4 * unit);
      ctx.fillText("step", cx(steps / 2), chart.y + chart.h + 4 * unit);

      // Area + line up to the current step.
      const end = { x: lerp(cx(whole), cx(Math.min(steps, whole + 1)), frac), y: whole < limit ? lerp(cy(pts[whole].f), cy(pts[whole + 1].f), frac) : cy(pts[whole].f) };
      const area = ctx.createLinearGradient(0, chart.y, 0, chart.y + chart.h);
      area.addColorStop(0, rgba(WARM, 0.28));
      area.addColorStop(1, rgba(WARM, 0));
      ctx.fillStyle = area;
      ctx.beginPath();
      ctx.moveTo(cx(0), chart.y + chart.h);
      for (let i = 0; i <= whole; i += 1) ctx.lineTo(cx(i), cy(pts[i].f));
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(end.x, chart.y + chart.h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(WARM, 0.95);
      ctx.lineWidth = 1.8 * unit;
      ctx.beginPath();
      for (let i = 0; i <= whole; i += 1) {
        if (i === 0) ctx.moveTo(cx(i), cy(pts[i].f));
        else ctx.lineTo(cx(i), cy(pts[i].f));
      }
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.fillStyle = rgba(WARM, 0.8);
      for (let i = 0; i <= whole; i += 1) {
        ctx.beginPath();
        ctx.arc(cx(i), cy(pts[i].f), 1.8 * unit, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(end.x, end.y, 3.4 * unit, 0, Math.PI * 2);
      ctx.fill();
    }

    // Advance the reveal while playing; keep the ball glowing while visible.
    let raf = 0;
    let visible = false;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        const limit = escapeIndex(descend(stateRef.current.lr, steps));
        const next = Math.min(limit, stateRef.current.shown + dt * STEPS_PER_SECOND);
        stateRef.current.shown = next >= limit ? steps : next;
        setShown(stateRef.current.shown);
        if (next >= limit) {
          playingRef.current = false;
          setPlaying(false);
        }
      }
      draw(now / 1000);
      if (visible) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(container);

    const redraw = () => draw(performance.now() / 1000);
    container.addEventListener("gd:update", redraw);

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
      container.removeEventListener("gd:update", redraw);
    };
  }, [steps]);

  useEffect(() => {
    if (!playing) containerRef.current?.dispatchEvent(new Event("gd:update"));
  }, [lr, shown, playing]);

  const replay = () => {
    stateRef.current.shown = 0;
    playingRef.current = true;
    setShown(0);
    setPlaying(true);
  };
  const done = shown >= steps;

  return (
    <div className="gd-explainer">
      <div className="gd-view-wrap" ref={containerRef} style={{ aspectRatio: aspect }}>
        <canvas ref={canvasRef} aria-label={`Gradient descent with learning rate ${lr.toFixed(2)}: ${r.name.toLowerCase()}`} />
        <div className="gd-label gd-label-land" aria-hidden="true">Loss landscape</div>
        <div className="gd-label gd-label-chart" aria-hidden="true">Loss per step</div>
        <div className="gd-badge" style={{ color: r.color, borderColor: r.color }} aria-live="polite">
          {r.name}
          <span>{r.note}</span>
        </div>
        <div className="gd-hud" aria-hidden="true">
          <span className="gd-hud-main">{escaped ? `left the map at step ${limit}` : `step ${at} / ${steps}`}</span>
          <span className="gd-hud-sub">loss {fText}</span>
        </div>
        <div className="gd-key" aria-hidden="true">
          <span><i style={{ background: "#fff" }} />path</span>
          <span><i style={{ background: rgba(COOL, 1) }} />next step −η∇f</span>
        </div>
      </div>

      <div className="gd-controls">
        <button
          type="button"
          className="gd-play"
          onClick={replay}
          disabled={playing}
          aria-label={done ? "Replay the descent" : "Play the descent"}
        >
          {done ? <RotateCcw size={16} strokeWidth={1.8} /> : <Play size={16} strokeWidth={1.8} />}
        </button>
        <div className="gd-slider">
          <label htmlFor={`${id}-lr`}>
            Learning rate <span className="gd-lr">η = {lr.toFixed(2)}</span>
          </label>
          <input
            id={`${id}-lr`}
            type="range"
            min={LR_MIN}
            max={LR_MAX}
            step={0.02}
            value={lr}
            style={{ "--gd-track": TRACK }}
            onChange={(e) => {
              // Show the whole path while dragging; Play replays it step by step.
              const v = Number(e.target.value);
              playingRef.current = false;
              stateRef.current = { lr: v, shown: steps };
              setPlaying(false);
              setShown(steps);
              setLr(v);
            }}
          />
          <div className="gd-legend">
            <span>Slow</span>
            <span style={{ left: pct(LR_OSCILLATE) }}>Oscillates</span>
            <span style={{ right: 0 }}>Diverges</span>
          </div>
        </div>
      </div>

      <style>{`
        .gd-explainer { width: 100%; display: flex; flex-direction: column; gap: 0.9rem; }
        .gd-view-wrap { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden;
          background: radial-gradient(ellipse at 35% 55%, #110d0b 0%, #000 70%); }
        .gd-view-wrap canvas { width: 100%; height: 100%; display: block; }
        .gd-label { position: absolute; top: 3.2%; transform: translateX(-50%); font-size: clamp(0.58rem, 1.2vw, 0.75rem); letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(255,255,255,0.8); white-space: nowrap; pointer-events: none; }
        .gd-label-land { left: 32%; }
        .gd-label-chart { left: 82.5%; }
        .gd-badge { position: absolute; top: 15%; right: 40.5%; display: flex; flex-direction: column; align-items: flex-end; gap: 0.05rem;
          padding: 0.25rem 0.55rem; border: 1px solid; border-radius: 8px; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
          font-size: clamp(0.6rem, 1.2vw, 0.78rem); letter-spacing: 0.06em; text-transform: uppercase; pointer-events: none; }
        .gd-badge span { text-transform: none; letter-spacing: 0; color: rgba(255,255,255,0.55); font-size: clamp(0.52rem, 1vw, 0.68rem); }
        .gd-hud { position: absolute; left: 5%; bottom: 7%; display: flex; flex-direction: column; gap: 0.1rem;
          padding: 0.3rem 0.55rem; border-radius: 8px; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
          color: #fff; font-size: clamp(0.6rem, 1.2vw, 0.78rem); line-height: 1.25; pointer-events: none; font-variant-numeric: tabular-nums; }
        .gd-hud-sub { color: rgba(255,255,255,0.55); font-size: clamp(0.55rem, 1vw, 0.7rem); }
        .gd-key { position: absolute; right: 0.75rem; bottom: 0.6rem; display: flex; gap: 0.9rem; font-size: clamp(0.5rem, 1vw, 0.66rem);
          color: rgba(255,255,255,0.5); pointer-events: none; }
        .gd-key span { display: inline-flex; align-items: center; gap: 0.35rem; }
        .gd-key i { display: inline-block; width: 14px; height: 2px; border-radius: 2px; }
        .gd-controls { display: flex; align-items: center; gap: 0.75rem; }
        .gd-play { flex: none; width: 36px; height: 36px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
        .gd-play:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
        .gd-play:disabled { opacity: 0.4; cursor: default; }
        .gd-slider { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
        .gd-slider label { font-size: 0.85rem; color: rgba(255,255,255,0.75); display: flex; justify-content: space-between; }
        .gd-lr { font-variant-numeric: tabular-nums; color: #fff; }
        .gd-slider input[type="range"] { width: 100%; -webkit-appearance: none; appearance: none; background: transparent; height: 18px; margin: 0; }
        .gd-slider input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: var(--gd-track); }
        .gd-slider input[type="range"]::-moz-range-track { height: 6px; border-radius: 999px; background: var(--gd-track); }
        .gd-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -6px;
          border-radius: 50%; background: #fff; border: none; box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .gd-slider input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: none;
          box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .gd-legend { position: relative; height: 1rem; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .gd-legend span { position: absolute; top: 0; white-space: nowrap; }
        .gd-legend span:first-child { left: 0; }
        @media (max-width: 520px) { .gd-key, .gd-hud-sub, .gd-badge span { display: none; } .gd-legend { font-size: 0.62rem; } }
      `}</style>
    </div>
  );
}
