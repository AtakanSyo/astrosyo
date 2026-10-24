import { useEffect, useRef, useState } from "react";

/**
 * Self-attention over the patches of a real image.
 *
 * The image is cut into a gridSize × gridSize set of patches (the "pixels" a
 * diffusion U-Net attends over). One patch is the query. Every patch gets a
 * weight softmax(−d² / 2σ²), where d is its distance to the query, so nearby
 * patches matter most and σ sets how far attention reaches.
 *
 * Left: the image, with each patch lit by its weight and glowing arcs carrying
 * values from the keys back into the query. Right: the same weights as a heat
 * map. Hover, click or use the arrow keys to move the query.
 */

const WARM = [255, 196, 140];
// Heat ramp for the weight map, dark → ember → amber → cream.
const RAMP = [
  [0, [14, 14, 20]],
  [0.3, [92, 38, 22]],
  [0.65, [224, 137, 58]],
  [1, [255, 236, 210]],
];

const lerp = (a, b, t) => a + (b - a) * t;
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

// Normalised Gaussian weights around the query: softmax(−d² / 2σ²).
function attentionWeights(gridSize, qx, qy, sigma) {
  const out = new Float32Array(gridSize * gridSize);
  let total = 0;
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const d2 = (x - qx) ** 2 + (y - qy) ** 2;
      const v = Math.exp(-d2 / (2 * sigma * sigma));
      out[y * gridSize + x] = v;
      total += v;
    }
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= total;
  return out;
}

// Point on a quadratic Bézier.
function bezier(a, c, b, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

export default function SelfPixelAttentionExplainer({
  id = "self-pixel-attention",
  aspect = "16 / 9",
  gridSize = 7,
  imageUrl = "/images/jupiter/thumbnail.webp",
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRefs = useRef([]);
  const center = Math.floor(gridSize / 2);
  const [spread, setSpread] = useState(1.4);
  const [query, setQuery] = useState({ x: center, y: center });
  const stateRef = useRef({ spread, query });
  stateRef.current = { spread, query };

  const weights = attentionWeights(gridSize, query.x, query.y, spread);
  const selfPct = (weights[query.y * gridSize + query.x] * 100).toFixed(1);
  let reach = 0; // patches carrying at least 1% of the attention
  weights.forEach((w) => (reach += w >= 0.01 ? 1 : 0));

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    const ctx = canvas.getContext("2d");
    const n = gridSize * gridSize;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    let img = null;
    const image = new Image();
    image.onload = () => {
      img = image;
      draw(performance.now() / 1000);
    };
    image.src = imageUrl;

    // Displayed weights ease toward the target so query/σ changes animate.
    let shown = attentionWeights(gridSize, stateRef.current.query.x, stateRef.current.query.y, stateRef.current.spread);
    let shownQuery = { ...stateRef.current.query };

    let size = { w: 1, h: 1, dpr: 1 };
    let panels = null;

    const layout = () => {
      const { w, h } = size;
      const s = Math.min(h * 0.66, w * 0.4);
      const top = (h - s) / 2 + h * 0.01;
      return {
        s,
        cell: s / gridSize,
        left: { x: w * 0.27 - s / 2, y: top },
        right: { x: w * 0.73 - s / 2, y: top },
      };
    };

    const placeLabels = () => {
      [panels.left, panels.right].forEach((p, i) => {
        const el = labelRefs.current[i];
        if (!el) return;
        el.style.transform = `translate(${(p.x + panels.s / 2).toFixed(1)}px, ${(p.y - size.h * 0.1).toFixed(1)}px) translate(-50%, 0)`;
      });
    };

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      panels = layout();
      placeLabels();
      draw(performance.now() / 1000);
    };

    const cellCenter = (p, x, y) => ({ x: p.x + (x + 0.5) * panels.cell, y: p.y + (y + 0.5) * panels.cell });

    function draw(time) {
      if (!panels) return;
      const { w, h, dpr } = size;
      const { s, cell, left, right } = panels;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Soft vignette behind each panel.
      [left, right].forEach((p) => {
        const g = ctx.createRadialGradient(p.x + s / 2, p.y + s / 2, s * 0.2, p.x + s / 2, p.y + s / 2, s * 0.9);
        g.addColorStop(0, "rgba(255, 196, 140, 0.06)");
        g.addColorStop(1, "rgba(255, 196, 140, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(p.x - s * 0.4, p.y - s * 0.4, s * 1.8, s * 1.8);
      });

      let max = 0;
      for (let i = 0; i < n; i += 1) max = Math.max(max, shown[i]);
      const norm = (i) => shown[i] / (max || 1);
      const qIdx = shownQuery.y * gridSize + shownQuery.x;
      const radius = Math.max(4, s * 0.03);

      // ---- Left: the image, lit by attention ----
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(left.x, left.y, s, s, radius);
      ctx.clip();
      ctx.fillStyle = "#0b0b10";
      ctx.fillRect(left.x, left.y, s, s);
      if (img) {
        // Cover-crop to a square.
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, left.x, left.y, s, s);
      }
      for (let y = 0; y < gridSize; y += 1) {
        for (let x = 0; x < gridSize; x += 1) {
          const i = y * gridSize + x;
          const k = norm(i);
          ctx.fillStyle = `rgba(4, 4, 8, ${0.82 * (1 - Math.pow(k, 0.55))})`;
          ctx.fillRect(left.x + x * cell, left.y + y * cell, cell, cell);
          if (k > 0.08 && i !== qIdx) {
            ctx.fillStyle = rgba(WARM, 0.18 * k);
            ctx.fillRect(left.x + x * cell, left.y + y * cell, cell, cell);
          }
        }
      }
      // Patch grid.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < gridSize; i += 1) {
        ctx.moveTo(left.x + i * cell, left.y);
        ctx.lineTo(left.x + i * cell, left.y + s);
        ctx.moveTo(left.x, left.y + i * cell);
        ctx.lineTo(left.x + s, left.y + i * cell);
      }
      ctx.stroke();
      ctx.restore();

      // Arcs from each key into the query, with values flowing along them.
      const q = cellCenter(left, shownQuery.x, shownQuery.y);
      const unit = s / 300;
      for (let i = 0; i < n; i += 1) {
        if (i === qIdx) continue;
        const k = norm(i);
        if (k < 0.05) continue;
        const kx = i % gridSize;
        const ky = Math.floor(i / gridSize);
        const a = cellCenter(left, kx, ky);
        const dx = q.x - a.x;
        const dy = q.y - a.y;
        const c = { x: (a.x + q.x) / 2 - dy * 0.22, y: (a.y + q.y) / 2 + dx * 0.22 };
        ctx.strokeStyle = rgba(WARM, 0.12 + k * 0.55);
        ctx.lineWidth = (0.6 + k * 2.4) * unit;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(c.x, c.y, q.x, q.y);
        ctx.stroke();

        if (!reduceMotion) {
          const phase = (time * 0.55 + i * 0.137) % 1;
          const p = bezier(a, c, q, phase);
          const fade = Math.sin(phase * Math.PI);
          ctx.fillStyle = rgba([255, 236, 214], Math.min(1, k * 1.2) * fade);
          ctx.beginPath();
          ctx.arc(p.x, p.y, (1 + k * 2.2) * unit, 0, Math.PI * 2);
          ctx.fill();
        }
        // Key dot.
        ctx.fillStyle = rgba(WARM, 0.35 + k * 0.6);
        ctx.beginPath();
        ctx.arc(a.x, a.y, (1.2 + k * 1.8) * unit, 0, Math.PI * 2);
        ctx.fill();
      }

      // Query patch: bright outline with a slow pulse.
      const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3);
      const qx0 = left.x + shownQuery.x * cell;
      const qy0 = left.y + shownQuery.y * cell;
      ctx.save();
      ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
      ctx.shadowBlur = 8 + pulse * 10;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(qx0 + 1, qy0 + 1, cell - 2, cell - 2);
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(q.x, q.y, 3 * unit + pulse * unit, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(left.x, left.y, s, s, radius);
      ctx.stroke();

      // ---- Right: heat map of the weights ----
      const gap = Math.max(1.5, cell * 0.06);
      const showText = cell > 30;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `500 ${Math.max(9, cell * 0.22)}px Inter, system-ui, sans-serif`;
      for (let y = 0; y < gridSize; y += 1) {
        for (let x = 0; x < gridSize; x += 1) {
          const i = y * gridSize + x;
          const k = norm(i);
          const col = heat(Math.pow(k, 0.7));
          const cx = right.x + x * cell + gap / 2;
          const cy = right.y + y * cell + gap / 2;
          const cs = cell - gap;
          ctx.fillStyle = rgba(col, 1);
          ctx.beginPath();
          ctx.roundRect(cx, cy, cs, cs, Math.min(6, cs * 0.18));
          ctx.fill();
          if (showText && shown[i] >= 0.005) {
            ctx.fillStyle = k > 0.55 ? "rgba(20, 12, 6, 0.85)" : "rgba(255, 255, 255, 0.7)";
            ctx.fillText(`${(shown[i] * 100).toFixed(shown[i] >= 0.1 ? 0 : 1)}`, cx + cs / 2, cy + cs / 2);
          }
        }
      }
      // Query cell outline on the map too.
      ctx.save();
      ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
      ctx.shadowBlur = 6 + pulse * 8;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(
        right.x + shownQuery.x * cell + gap / 2 - 1,
        right.y + shownQuery.y * cell + gap / 2 - 1,
        cell - gap + 2,
        cell - gap + 2,
        Math.min(7, (cell - gap) * 0.2),
      );
      ctx.stroke();
      ctx.restore();
    }

    // Ease the shown weights toward the target; animate only while visible.
    let raf = 0;
    let visible = false;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { query: tq, spread: ts } = stateRef.current;
      const target = attentionWeights(gridSize, tq.x, tq.y, ts);
      const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 12);
      for (let i = 0; i < n; i += 1) shown[i] = lerp(shown[i], target[i], k);
      shownQuery = tq;
      draw(now / 1000);
      if (visible && !reduceMotion) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (reduceMotion) {
        shown = attentionWeights(gridSize, stateRef.current.query.x, stateRef.current.query.y, stateRef.current.spread);
        shownQuery = stateRef.current.query;
        draw(0);
      }
    };
    container.addEventListener("spa:update", kick);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(container);

    // Pointer → grid cell on either panel.
    const cellAt = (e) => {
      if (!panels) return null;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      for (const p of [panels.left, panels.right]) {
        const gx = Math.floor((px - p.x) / panels.cell);
        const gy = Math.floor((py - p.y) / panels.cell);
        if (gx >= 0 && gx < gridSize && gy >= 0 && gy < gridSize) return { x: gx, y: gy };
      }
      return null;
    };
    const pick = (e) => {
      const c = cellAt(e);
      canvas.style.cursor = c ? "pointer" : "default";
      if (!c) return;
      const cur = stateRef.current.query;
      if (c.x !== cur.x || c.y !== cur.y) setQuery(c);
    };
    const onMove = (e) => {
      if (e.pointerType === "mouse") pick(e);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", pick);

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", pick);
      container.removeEventListener("spa:update", kick);
    };
  }, [gridSize, imageUrl]);

  // Redraw immediately under reduced motion (there is no animation loop then).
  useEffect(() => {
    containerRef.current?.dispatchEvent(new Event("spa:update"));
  }, [query, spread]);

  const onKeyDown = (e) => {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setQuery((q) => ({
      x: Math.max(0, Math.min(gridSize - 1, q.x + m[0])),
      y: Math.max(0, Math.min(gridSize - 1, q.y + m[1])),
    }));
  };

  return (
    <div className="spa-explainer">
      <div
        className="spa-view-wrap"
        ref={containerRef}
        style={{ aspectRatio: aspect }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        role="application"
        aria-label={`Self-attention map. Query patch at row ${query.y + 1}, column ${query.x + 1}. Use arrow keys to move it.`}
      >
        <canvas ref={canvasRef} />
        <div ref={(el) => (labelRefs.current[0] = el)} className="spa-label" aria-hidden="true">
          <span className="spa-label-title">Image patches</span>
          <span className="spa-label-sub">values flow into the query</span>
        </div>
        <div ref={(el) => (labelRefs.current[1] = el)} className="spa-label" aria-hidden="true">
          <span className="spa-label-title">Attention weights</span>
          <span className="spa-label-sub">% of the query's attention</span>
        </div>
        <div className="spa-hud" aria-hidden="true">
          <span className="spa-hud-main">query ({query.y + 1}, {query.x + 1})</span>
          <span className="spa-hud-sub">{selfPct}% on itself · {reach} patches ≥ 1%</span>
        </div>
        <div className="spa-formula" aria-hidden="true">
          w = softmax(−d² / 2σ²)
        </div>
      </div>

      <div className="spa-controls">
        <label htmlFor={`${id}-spread`}>
          Attention spread <span className="spa-sigma">σ = {spread.toFixed(1)}</span>
        </label>
        <input
          id={`${id}-spread`}
          type="range"
          min={0.6}
          max={3}
          step={0.1}
          value={spread}
          onChange={(e) => setSpread(Number(e.target.value))}
        />
        <div className="spa-legend">
          <span>Local</span>
          <span>Global</span>
        </div>
      </div>

      <style>{`
        .spa-explainer { width: 100%; display: flex; flex-direction: column; gap: 0.9rem; }
        .spa-view-wrap { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden;
          background: radial-gradient(ellipse at 50% 40%, #0c0b10 0%, #000 75%); outline: none; }
        .spa-view-wrap:focus-visible { border-color: rgba(255,255,255,0.6); }
        .spa-view-wrap canvas { width: 100%; height: 100%; display: block; touch-action: manipulation; }
        .spa-label { position: absolute; top: 0; left: 0; display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
          white-space: nowrap; pointer-events: none; will-change: transform; }
        .spa-label-title { font-size: clamp(0.58rem, 1.2vw, 0.75rem); letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.8); }
        .spa-label-sub { font-size: clamp(0.52rem, 1vw, 0.68rem); color: rgba(255,255,255,0.45); }
        .spa-hud { position: absolute; left: 0.75rem; bottom: 0.6rem; display: flex; flex-direction: column; gap: 0.1rem;
          padding: 0.3rem 0.55rem; border-radius: 8px; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
          color: #fff; font-size: clamp(0.6rem, 1.2vw, 0.78rem); line-height: 1.25; pointer-events: none; font-variant-numeric: tabular-nums; }
        .spa-hud-sub { color: rgba(255,255,255,0.55); font-size: clamp(0.55rem, 1vw, 0.7rem); }
        .spa-formula { position: absolute; right: 0.75rem; bottom: 0.6rem; font-size: clamp(0.55rem, 1vw, 0.7rem); color: rgba(255,255,255,0.5);
          font-family: "Iowan Old Style", Georgia, serif; font-style: italic; pointer-events: none; }
        .spa-controls { display: flex; flex-direction: column; gap: 0.3rem; }
        .spa-controls label { font-size: 0.85rem; color: rgba(255,255,255,0.75); display: flex; justify-content: space-between; }
        .spa-sigma { font-variant-numeric: tabular-nums; color: #fff; }
        .spa-controls input[type="range"] { width: 100%; -webkit-appearance: none; appearance: none; background: transparent; height: 18px; }
        .spa-controls input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 999px;
          background: linear-gradient(90deg, #5c2616 0%, #e0893a 55%, #ffecd2 100%); }
        .spa-controls input[type="range"]::-moz-range-track { height: 6px; border-radius: 999px;
          background: linear-gradient(90deg, #5c2616 0%, #e0893a 55%, #ffecd2 100%); }
        .spa-controls input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -6px;
          border-radius: 50%; background: #fff; border: none; box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .spa-controls input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: none;
          box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .spa-legend { display: flex; justify-content: space-between; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        @media (max-width: 520px) { .spa-label-sub, .spa-formula { display: none; } .spa-hud-sub { display: none; } }
      `}</style>
    </div>
  );
}
