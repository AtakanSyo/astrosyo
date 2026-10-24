import { useEffect, useRef, useState } from "react";

/**
 * A single artificial neuron: a = f(w₁x₁ + w₂x₂ + b).
 *
 * Inputs sit on the left, each wire's thickness is its weight's size and its
 * colour the sign of what it contributes (warm adds, cool subtracts). Pulses
 * flow along the wires, brighter for bigger contributions. The neuron sums
 * them (Σ) and applies the activation f; the plot on the right shows f with
 * the current z marked. All five numbers are adjustable.
 */

const WARM = [255, 196, 140];
const COOL = [130, 190, 255];
const OFF = [120, 120, 130];

const ACTIVATIONS = {
  ReLU: { f: (z) => Math.max(0, z), range: [-0.6, 4], label: "max(0, z)" },
  Sigmoid: { f: (z) => 1 / (1 + Math.exp(-z)), range: [-0.15, 1.15], label: "1 / (1 + e⁻ᶻ)" },
  Tanh: { f: (z) => Math.tanh(z), range: [-1.2, 1.2], label: "tanh(z)" },
};
const Z_RANGE = 4;

const lerp = (a, b, t) => a + (b - a) * t;
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;
const fmt = (v) => (v < 0 ? `−${Math.abs(v).toFixed(2)}` : v.toFixed(2));
const term = (v) => (v < 0 ? `(${fmt(v)})` : fmt(v)); // wrap negatives inside the equation

function pickActivation(gate) {
  const key = Object.keys(ACTIVATIONS).find((k) => k.toLowerCase() === String(gate).toLowerCase());
  return key || "ReLU";
}

export default function GateExplainer({
  id = "gate-explainer",
  gate = "ReLU",
  inputs = [1, 0.6],
  weights = [0.8, -0.6],
  bias = 0.2,
  aspect = "16 / 9",
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [act, setAct] = useState(() => pickActivation(gate));
  const [x, setX] = useState([inputs[0] ?? 1, inputs[1] ?? 0]);
  const [w, setW] = useState([weights[0] ?? 1, weights[1] ?? 1]);
  const [b, setB] = useState(bias);
  const stateRef = useRef(null);

  const z = w[0] * x[0] + w[1] * x[1] + b;
  const a = ACTIVATIONS[act].f(z);
  stateRef.current = { act, x, w, b, z, a };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let size = { w: 1, h: 1, dpr: 1 };

    const layout = () => {
      const { w: W, h: H } = size;
      const r = Math.min(H * 0.13, W * 0.07);
      return {
        inputs: [
          { x: W * 0.1, y: H * 0.3 },
          { x: W * 0.1, y: H * 0.62 },
        ],
        bias: { x: W * 0.3, y: H * 0.84 },
        neuron: { x: W * 0.4, y: H * 0.46, r },
        out: { x: W * 0.6, y: H * 0.46 },
        plot: { x: W * 0.7, y: H * 0.16, w: W * 0.26, h: H * 0.58 },
      };
    };
    let L = null;

    const resize = () => {
      const W = container.clientWidth;
      const H = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w: W, h: H, dpr };
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      L = layout();
      draw(performance.now() / 1000);
    };

    // A wire as a quadratic curve, with pulses travelling along it.
    const wire = (p0, p1, bend, color, strength, width, time, unit) => {
      const c = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 + bend };
      ctx.strokeStyle = rgba(color, 0.18 + strength * 0.55);
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(c.x, c.y, p1.x, p1.y);
      ctx.stroke();
      if (strength < 0.02) return c;
      const count = 3;
      for (let k = 0; k < count; k += 1) {
        const t = reduceMotion ? (k + 0.5) / count : (time * 0.45 + k / count) % 1;
        const u = 1 - t;
        const px = u * u * p0.x + 2 * u * t * c.x + t * t * p1.x;
        const py = u * u * p0.y + 2 * u * t * c.y + t * t * p1.y;
        const fade = Math.sin(t * Math.PI);
        const g = ctx.createRadialGradient(px, py, 0, px, py, (4 + strength * 6) * unit);
        g.addColorStop(0, rgba([255, 240, 225], fade * Math.min(1, 0.4 + strength)));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, (4 + strength * 6) * unit, 0, Math.PI * 2);
        ctx.fill();
      }
      return c;
    };

    const node = (p, r, value, label, unit) => {
      const col = value > 0 ? WARM : value < 0 ? COOL : OFF;
      const k = Math.min(1, Math.abs(value) / 2);
      if (k > 0.05) {
        const g = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 2.4);
        g.addColorStop(0, rgba(col, 0.3 * k));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgb(${Math.round(lerp(18, col[0], k * 0.85))}, ${Math.round(lerp(18, col[1], k * 0.85))}, ${Math.round(lerp(24, col[2], k * 0.85))})`;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = k > 0.55 ? "rgba(20, 12, 6, 0.9)" : "rgba(255, 255, 255, 0.92)";
      ctx.font = `600 ${Math.max(9, r * 0.62)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, p.x, p.y + 0.5);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.font = `${Math.max(8, 10 * unit)}px Inter, system-ui, sans-serif`;
      ctx.fillText(fmt(value), p.x, p.y + r + 10 * unit);
    };

    function draw(time) {
      if (!L) return;
      const { w: W, h: H, dpr } = size;
      const s = stateRef.current;
      const fn = ACTIVATIONS[s.act];
      const unit = Math.min(W, H) / 400;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const { neuron, out, plot } = L;
      const inR = Math.max(10, neuron.r * 0.5);

      // Input wires: thickness = |w|, colour = sign of w·x, brightness = |w·x|.
      const entry = (i) => ({ x: neuron.x - neuron.r * 0.92, y: neuron.y + (i === 0 ? -0.35 : 0.35) * neuron.r });
      L.inputs.forEach((p, i) => {
        const contrib = s.w[i] * s.x[i];
        const color = contrib > 0 ? WARM : contrib < 0 ? COOL : OFF;
        const strength = Math.min(1, Math.abs(contrib) / 2);
        const c = wire({ x: p.x + inR, y: p.y }, entry(i), (i === 0 ? 1 : -1) * H * 0.03, color, strength, (1 + Math.abs(s.w[i]) * 3) * unit, time, unit);
        // Weight label near the middle of the wire.
        ctx.font = `${Math.max(8, 10.5 * unit)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = rgba(color === OFF ? [200, 200, 210] : color, 0.9);
        ctx.fillText(`w${i === 0 ? "₁" : "₂"} = ${fmt(s.w[i])}`, c.x, c.y + (i === 0 ? -6 : 20) * unit);
      });

      // Bias wire.
      {
        const color = s.b > 0 ? WARM : s.b < 0 ? COOL : OFF;
        wire({ x: L.bias.x, y: L.bias.y - inR * 0.7 }, { x: neuron.x - neuron.r * 0.3, y: neuron.y + neuron.r * 0.95 }, 0, color, Math.min(1, Math.abs(s.b) / 2), 1.4 * unit, time, unit);
      }

      // Output wire: brightness = activation.
      const outColor = s.a > 0.001 ? WARM : s.a < -0.001 ? COOL : OFF;
      const outStrength = Math.min(1, Math.abs(s.a) / (fn.range[1] * 0.75));
      wire({ x: neuron.x + neuron.r, y: neuron.y }, { x: out.x - inR, y: out.y }, 0, outColor, outStrength, (1.5 + outStrength * 2.5) * unit, time, unit);

      // Neuron: Σ on the left half, f on the right, glowing by its output.
      const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3);
      if (outStrength > 0.03) {
        const g = ctx.createRadialGradient(neuron.x, neuron.y, neuron.r * 0.8, neuron.x, neuron.y, neuron.r * (2 + pulse * 0.3));
        g.addColorStop(0, rgba(outColor, 0.32 * outStrength));
        g.addColorStop(1, rgba(outColor, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(neuron.x, neuron.y, neuron.r * (2 + pulse * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
      const body = ctx.createLinearGradient(neuron.x - neuron.r, neuron.y, neuron.x + neuron.r, neuron.y);
      body.addColorStop(0, "#15151c");
      body.addColorStop(1, `rgb(${Math.round(lerp(21, outColor[0], outStrength * 0.55))}, ${Math.round(lerp(21, outColor[1], outStrength * 0.55))}, ${Math.round(lerp(28, outColor[2], outStrength * 0.55))})`);
      ctx.fillStyle = body;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(neuron.x, neuron.y, neuron.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(neuron.x, neuron.y - neuron.r * 0.75);
      ctx.lineTo(neuron.x, neuron.y + neuron.r * 0.75);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `500 ${neuron.r * 0.62}px "Iowan Old Style", Georgia, serif`;
      ctx.fillText("Σ", neuron.x - neuron.r * 0.45, neuron.y);
      ctx.font = `italic 500 ${neuron.r * 0.58}px "Iowan Old Style", Georgia, serif`;
      ctx.fillText("f", neuron.x + neuron.r * 0.45, neuron.y);
      ctx.font = `${Math.max(8, 10 * unit)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fillText(`z = ${fmt(s.z)}`, neuron.x, neuron.y - neuron.r - 10 * unit);

      L.inputs.forEach((p, i) => node(p, inR, s.x[i], i === 0 ? "x₁" : "x₂", unit));
      node(L.bias, inR * 0.7, s.b, "b", unit);
      node(out, inR, s.a, "a", unit);

      // ---- Activation plot ----
      const [y0, y1] = fn.range;
      const px = (zv) => plot.x + ((zv + Z_RANGE) / (2 * Z_RANGE)) * plot.w;
      const py = (yv) => plot.y + plot.h - ((Math.max(y0, Math.min(y1, yv)) - y0) / (y1 - y0)) * plot.h;
      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(plot.x - 8 * unit, plot.y - 8 * unit, plot.w + 16 * unit, plot.h + 16 * unit, 8 * unit);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.beginPath();
      ctx.moveTo(plot.x, py(0));
      ctx.lineTo(plot.x + plot.w, py(0));
      ctx.moveTo(px(0), plot.y);
      ctx.lineTo(px(0), plot.y + plot.h);
      ctx.stroke();

      // Area under the curve up to z, then the curve itself.
      const zc = Math.max(-Z_RANGE, Math.min(Z_RANGE, s.z));
      const area = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
      area.addColorStop(0, rgba(WARM, 0.3));
      area.addColorStop(1, rgba(WARM, 0.02));
      ctx.fillStyle = area;
      ctx.beginPath();
      ctx.moveTo(px(-Z_RANGE), py(0));
      for (let i = 0; i <= 80; i += 1) {
        const zv = lerp(-Z_RANGE, zc, i / 80);
        ctx.lineTo(px(zv), py(fn.f(zv)));
      }
      ctx.lineTo(px(zc), py(0));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1.8 * unit;
      ctx.beginPath();
      for (let i = 0; i <= 120; i += 1) {
        const zv = lerp(-Z_RANGE, Z_RANGE, i / 120);
        if (i === 0) ctx.moveTo(px(zv), py(fn.f(zv)));
        else ctx.lineTo(px(zv), py(fn.f(zv)));
      }
      ctx.stroke();

      // Current point with guides.
      const mx = px(zc);
      const my = py(fn.f(zc));
      ctx.setLineDash([3 * unit, 3 * unit]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.beginPath();
      ctx.moveTo(mx, py(0));
      ctx.lineTo(mx, my);
      ctx.lineTo(plot.x, my);
      ctx.stroke();
      ctx.setLineDash([]);
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, (10 + pulse * 3) * unit);
      g.addColorStop(0, rgba([255, 240, 225], 0.8));
      g.addColorStop(1, rgba(WARM, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(mx, my, (10 + pulse * 3) * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(mx, my, 3.5 * unit, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = `${Math.max(8, 9.5 * unit)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("z", plot.x + plot.w, py(0) + 3 * unit);
      ctx.textAlign = "left";
      ctx.fillText(`f(z) = ${fn.label}`, plot.x, plot.y + plot.h + 12 * unit);
    }

    let raf = 0;
    let visible = false;
    const loop = (now) => {
      draw(now / 1000);
      if (visible && !reduceMotion) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(container);
    const redraw = () => draw(performance.now() / 1000);
    container.addEventListener("gt:update", redraw);

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
      container.removeEventListener("gt:update", redraw);
    };
  }, []);

  // Redraw on changes even when the loop isn't running (reduced motion).
  useEffect(() => {
    containerRef.current?.dispatchEvent(new Event("gt:update"));
  }, [act, x, w, b]);

  const sliders = [
    { key: "x1", label: "x₁", value: x[0], set: (v) => setX([v, x[1]]), kind: "input" },
    { key: "x2", label: "x₂", value: x[1], set: (v) => setX([x[0], v]), kind: "input" },
    { key: "w1", label: "w₁", value: w[0], set: (v) => setW([v, w[1]]), kind: "weight" },
    { key: "w2", label: "w₂", value: w[1], set: (v) => setW([w[0], v]), kind: "weight" },
    { key: "b", label: "b", value: b, set: setB, kind: "bias" },
  ];

  return (
    <div className="gt-explainer">
      <div className="gt-view-wrap" ref={containerRef} style={{ aspectRatio: aspect }}>
        <canvas ref={canvasRef} aria-label={`A neuron with ${act}: z = ${fmt(z)}, output ${fmt(a)}`} />
        <div className="gt-label gt-label-neuron" aria-hidden="true">Neuron</div>
        <div className="gt-label gt-label-plot" aria-hidden="true">Activation</div>
      </div>

      <div className="gt-bar">
        <div className="gt-hud" aria-live="polite">
          <span className="gt-hud-eq">
            z = <b className="w">{term(w[0])}</b>·<b className="x">{term(x[0])}</b> + <b className="w">{term(w[1])}</b>·<b className="x">{term(x[1])}</b> + <b className="b">{term(b)}</b> = {fmt(z)}
          </span>
          <span className="gt-hud-out">
            a = {act}(z) = <b>{fmt(a)}</b>
            {act === "ReLU" && z <= 0 ? <em> · inactive, z ≤ 0</em> : null}
          </span>
        </div>
        <div className="gt-tabs" role="tablist" aria-label="Activation function">
          {Object.keys(ACTIVATIONS).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === act} className={k === act ? "is-active" : ""} onClick={() => setAct(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="gt-controls">
        {sliders.map((sl) => (
          <label key={sl.key} className={`gt-slider gt-${sl.kind}`} htmlFor={`${id}-${sl.key}`}>
            <span className="gt-slider-head">
              <span>{sl.label}</span>
              <span className="gt-val">{fmt(sl.value)}</span>
            </span>
            <input
              id={`${id}-${sl.key}`}
              type="range"
              min={-2}
              max={2}
              step={0.05}
              value={sl.value}
              onChange={(e) => sl.set(Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      <style>{`
        .gt-explainer { width: 100%; display: flex; flex-direction: column; gap: 0.9rem; }
        .gt-view-wrap { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden;
          background: radial-gradient(ellipse at 40% 50%, #110d0b 0%, #000 70%); }
        .gt-view-wrap canvas { width: 100%; height: 100%; display: block; }
        .gt-label { position: absolute; top: 3.5%; transform: translateX(-50%); font-size: clamp(0.58rem, 1.2vw, 0.75rem); letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(255,255,255,0.8); white-space: nowrap; pointer-events: none; }
        .gt-label-neuron { left: 35%; }
        .gt-label-plot { left: 83%; }
        .gt-bar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
        .gt-tabs { display: flex; padding: 2px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
        .gt-tabs button { padding: 0.25rem 0.7rem; border-radius: 999px; border: none; background: none; color: rgba(255,255,255,0.6);
          font-size: 0.75rem; cursor: pointer; }
        .gt-tabs button:hover { color: #fff; }
        .gt-tabs button.is-active { background: rgba(255,255,255,0.9); color: #111; }
        .gt-hud { display: flex; flex-direction: column; gap: 0.1rem; color: rgba(255,255,255,0.7); font-size: 0.8rem; line-height: 1.35;
          font-variant-numeric: tabular-nums; }
        .gt-hud b { font-weight: 500; color: #fff; }
        .gt-hud b.x { color: #fff; }
        .gt-hud b.w { color: #ffc48c; }
        .gt-hud b.b { color: #c9c9d4; }
        .gt-hud-out { color: #fff; }
        .gt-hud em { font-style: normal; color: rgba(255,255,255,0.5); }
        .gt-controls { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.6rem 1rem; }
        .gt-slider { display: flex; flex-direction: column; gap: 0.25rem; }
        .gt-slider-head { display: flex; justify-content: space-between; font-size: 0.8rem; color: rgba(255,255,255,0.7); }
        .gt-val { font-variant-numeric: tabular-nums; color: #fff; }
        .gt-slider input[type="range"] { width: 100%; -webkit-appearance: none; appearance: none; background: transparent; height: 18px; margin: 0; }
        .gt-slider input[type="range"]::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: var(--gt-track); }
        .gt-slider input[type="range"]::-moz-range-track { height: 4px; border-radius: 999px; background: var(--gt-track); }
        .gt-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px;
          border-radius: 50%; background: #fff; border: none; box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .gt-slider input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: none;
          box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .gt-input { --gt-track: linear-gradient(90deg, #82beff, #2a2a33 50%, #ffc48c); }
        .gt-weight { --gt-track: linear-gradient(90deg, #82beff, #2a2a33 50%, #ffc48c); }
        .gt-bias { --gt-track: linear-gradient(90deg, #82beff, #2a2a33 50%, #ffc48c); }
        @media (max-width: 640px) {
          .gt-controls { grid-template-columns: repeat(2, 1fr); }
          .gt-label { display: none; }
        }
      `}</style>
    </div>
  );
}
