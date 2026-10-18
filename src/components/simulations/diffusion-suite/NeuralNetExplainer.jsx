import { useEffect, useRef } from "react";

/**
 * A dense network doing forward passes, one layer at a time.
 *
 * Every connection has a fixed weight: warm lines are positive, cool lines are
 * negative, and thicker lines are stronger. Each pass, a wave travels left to
 * right: the lines into the next layer light up as the signal crosses them, and
 * each node glows by how strongly it was activated (ReLU of its weighted input).
 * Then a fresh input arrives and the next pass begins.
 */

const PASS_SECONDS = 3.2; // one full input → output pass
const REST_SECONDS = 0.9; // pause with the output lit before the next input
const WARM = [255, 196, 140]; // positive weights
const COOL = [130, 190, 255]; // negative weights

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

export default function NeuralNetExplainer({
  layers = [4, 7, 7, 3],
  aspect = "16 / 9",
  inputLabel = "Noisy image + step t",
  outputLabel = "Predicted noise",
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRefs = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    const ctx = canvas.getContext("2d");
    const rand = mulberry32(42);

    // Fixed weights, one matrix per gap between layers.
    const weights = layers.slice(0, -1).map((n, li) =>
      Array.from({ length: n }, () =>
        Array.from({ length: layers[li + 1] }, () => (rand() * 2 - 1) * (0.4 + rand() * 0.6)),
      ),
    );

    // Run one forward pass on a random input; activations normalised to 0..1 per layer.
    const forward = () => {
      const acts = [Array.from({ length: layers[0] }, () => rand())];
      for (let li = 0; li < weights.length; li += 1) {
        const prev = acts[li];
        const next = Array.from({ length: layers[li + 1] }, (_, j) =>
          Math.max(0, prev.reduce((sum, a, i) => sum + a * weights[li][i][j], 0)),
        );
        const max = Math.max(...next, 1e-6);
        acts.push(next.map((v) => v / max));
      }
      return acts;
    };

    let acts = forward();
    let size = { w: 1, h: 1, dpr: 1 };
    const maxCount = Math.max(...layers);

    const layout = () => {
      const { w, h } = size;
      const padX = w * 0.1;
      const top = h * 0.2;
      const bottom = h * 0.9;
      return layers.map((count, li) => {
        const x = lerp(padX, w - padX, li / (layers.length - 1));
        const span = (bottom - top) * (count / maxCount);
        const y0 = (top + bottom) / 2 - span / 2;
        return Array.from({ length: count }, (_, j) => ({ x, y: y0 + (j + 0.5) * (span / count) }));
      });
    };
    let pos = layout();

    const placeLabels = () => {
      labelRefs.current.forEach((el, li) => {
        if (!el || !pos[li]) return;
        el.style.transform = `translate(${pos[li][0].x.toFixed(1)}px, ${(size.h * 0.07).toFixed(1)}px) translate(-50%, 0)`;
      });
    };

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      pos = layout();
      placeLabels();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const gaps = layers.length - 1;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const draw = (time) => {
      const { w, h, dpr } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Wave position: 0 = at the input layer, `gaps` = at the output layer.
      const cycle = PASS_SECONDS + REST_SECONDS;
      const local = reduceMotion ? PASS_SECONDS : time % cycle;
      const wave = Math.min(1, local / PASS_SECONDS) * gaps;
      const unit = Math.min(w, h);

      // Connections.
      for (let li = 0; li < gaps; li += 1) {
        const crossing = Math.min(1, Math.max(0, wave - li)); // 0..1 progress across this gap
        for (let i = 0; i < layers[li]; i += 1) {
          for (let j = 0; j < layers[li + 1]; j += 1) {
            const wgt = weights[li][i][j];
            const a = pos[li][i];
            const b = pos[li + 1][j];
            const color = wgt >= 0 ? WARM : COOL;
            const strength = Math.abs(wgt);
            const signal = acts[li][i] * strength;
            // Faint base line, brighter once the wave has passed with signal on it.
            const lit = crossing > 0 ? Math.min(1, signal * 1.6) * (crossing < 1 ? 1 : 0.6) : 0;
            ctx.strokeStyle = rgba(color, 0.13 + lit * 0.8);
            ctx.lineWidth = (0.5 + strength * 1.3) * (unit / 400);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            if (crossing > 0 && crossing < 1) {
              // Draw the lit part only up to the wave front.
              const fx = lerp(a.x, b.x, smooth(crossing));
              const fy = lerp(a.y, b.y, smooth(crossing));
              ctx.lineTo(fx, fy);
              ctx.stroke();
              ctx.strokeStyle = rgba(color, 0.13);
              ctx.beginPath();
              ctx.moveTo(fx, fy);
            }
            ctx.lineTo(b.x, b.y);
            ctx.stroke();

            // Spark at the wave front on the strongest signals.
            if (crossing > 0 && crossing < 1 && signal > 0.25) {
              const fx = lerp(a.x, b.x, smooth(crossing));
              const fy = lerp(a.y, b.y, smooth(crossing));
              ctx.fillStyle = rgba(color, Math.min(1, signal * 1.4));
              ctx.beginPath();
              ctx.arc(fx, fy, (1 + signal * 2) * (unit / 400), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // Nodes: dim until the wave reaches their layer, then glow by activation.
      const r = Math.max(5, unit * 0.024);
      for (let li = 0; li < layers.length; li += 1) {
        const reached = wave >= li - 0.02;
        const fresh = Math.max(0, 1 - Math.abs(wave - li) * 1.5); // extra glow right as the wave arrives
        for (let j = 0; j < layers[li]; j += 1) {
          const { x, y } = pos[li][j];
          const act = reached ? acts[li][j] : 0;
          if (act > 0.05) {
            const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * (2.6 + fresh));
            glow.addColorStop(0, `rgba(255, 236, 214, ${0.25 + act * 0.35})`);
            glow.addColorStop(1, "rgba(255, 236, 214, 0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, r * (2.6 + fresh), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = `rgba(${Math.round(lerp(22, 255, act))}, ${Math.round(lerp(24, 240, act))}, ${Math.round(lerp(30, 225, act))}, 1)`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    };

    // Animate only while visible; start a new input at the start of each pass.
    let raf = 0;
    let visible = false;
    let start = performance.now();
    let lastPass = 0;
    const loop = (now) => {
      const time = (now - start) / 1000;
      const pass = Math.floor(time / (PASS_SECONDS + REST_SECONDS));
      if (pass !== lastPass) {
        lastPass = pass;
        acts = forward();
      }
      draw(time);
      if (visible && !reduceMotion) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(container);
    draw(PASS_SECONDS); // a fully lit first frame

    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [aspect, layers]);

  const labelFor = (li) => (li === 0 ? "Input" : li === layers.length - 1 ? "Output" : "Hidden");
  const subFor = (li) => (li === 0 ? inputLabel : li === layers.length - 1 ? outputLabel : null);

  return (
    <div className="nn-explainer">
      <div className="nn-canvas-wrap" ref={containerRef} style={{ aspectRatio: aspect, position: "relative" }}>
        <canvas ref={canvasRef} aria-label="Animated neural network forward pass" />
        {layers.map((_, li) => (
          <div
            key={li}
            ref={(el) => (labelRefs.current[li] = el)}
            className="nn-label"
            aria-hidden="true"
          >
            <span className="nn-label-title">{labelFor(li)}</span>
            {subFor(li) && <span className="nn-label-sub">{subFor(li)}</span>}
          </div>
        ))}
        <div className="nn-key" aria-hidden="true">
          <span><i style={{ background: rgba(WARM, 1) }} />positive weight</span>
          <span><i style={{ background: rgba(COOL, 1) }} />negative weight</span>
        </div>
      </div>
    </div>
  );
}
