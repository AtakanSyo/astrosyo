import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/**
 * One pass through a diffusion U-Net, drawn as a real "U".
 *
 * The input is a noisy image x_t. Each encoder level halves the resolution and
 * doubles the channels (the stacked tiles behind each map), down to a small
 * bottleneck. The decoder mirrors it, upsampling back to full resolution, and
 * outputs the predicted noise ε̂. Skip connections copy each encoder level's
 * features straight across to the matching decoder level, so fine detail
 * isn't lost at the bottleneck.
 *
 * The tiles show actual pixels at each level's resolution: the noisy image on
 * the way down, the (known) noise on the way up, standing in for what a trained
 * model would predict.
 */

const BASE_RES = 64;
const BASE_CH = 64;
const PASS_SECONDS = 6;
const REST_SECONDS = 1.2;
const ABAR = 0.55; // signal fraction in the input x_t
const WARM = [255, 196, 140]; // main path
const COOL = [130, 190, 255]; // skip connections

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal samples via Box–Muller.
function gaussianNoise(count, seed) {
  const rand = mulberry32(seed);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 2) {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    out[i] = r * Math.cos(2 * Math.PI * v);
    if (i + 1 < count) out[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
  return out;
}

// Box-average an n×n×3 buffer down to r×r×3.
function downsample(buf, n, r) {
  const f = n / r;
  const out = new Float32Array(r * r * 3);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const o = (Math.floor(y / f) * r + Math.floor(x / f)) * 3;
      const i = (y * n + x) * 3;
      out[o] += buf[i];
      out[o + 1] += buf[i + 1];
      out[o + 2] += buf[i + 2];
    }
  }
  const k = 1 / (f * f);
  for (let i = 0; i < out.length; i += 1) out[i] *= k;
  return out;
}

// Render an r×r×3 buffer into a small canvas. `gain` maps values to ±1 before display.
function tileCanvas(buf, r, gain) {
  const c = document.createElement("canvas");
  c.width = r;
  c.height = r;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(r, r);
  for (let i = 0, j = 0; j < buf.length; i += 4, j += 3) {
    img.data[i] = Math.max(0, Math.min(255, (buf[j] * gain * 0.5 + 0.5) * 255));
    img.data[i + 1] = Math.max(0, Math.min(255, (buf[j + 1] * gain * 0.5 + 0.5) * 255));
    img.data[i + 2] = Math.max(0, Math.min(255, (buf[j + 2] * gain * 0.5 + 0.5) * 255));
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Square-crop an image to n×n and return its pixels scaled to [-1, 1].
function imagePixels(img, n) {
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = c.getContext("2d");
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, n, n);
  const data = ctx.getImageData(0, 0, n, n).data;
  const out = new Float32Array(n * n * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    out[j] = (data[i] / 255) * 2 - 1;
    out[j + 1] = (data[i + 1] / 255) * 2 - 1;
    out[j + 2] = (data[i + 2] / 255) * 2 - 1;
  }
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

// Stages along the U: encoder levels, bottleneck, decoder levels (deepest first).
function buildStages(depth) {
  const stages = [];
  for (let i = 0; i < depth; i += 1) stages.push({ kind: "enc", level: i });
  stages.push({ kind: "mid", level: depth });
  for (let i = depth - 1; i >= 0; i -= 1) stages.push({ kind: "dec", level: i });
  return stages.map((s) => ({
    ...s,
    res: BASE_RES / 2 ** s.level,
    ch: BASE_CH * 2 ** Math.min(s.level, depth - 1),
  }));
}

function describe(stage, depth) {
  const size = `${stage.res}×${stage.res}`;
  if (stage.kind === "enc" && stage.level === 0) return { title: "Input x_t", sub: `${size} · noisy image + timestep` };
  if (stage.kind === "enc") return { title: `Encoder ${stage.level + 1}`, sub: `${size} · ${stage.ch} ch · downsample, widen` };
  if (stage.kind === "mid") return { title: "Bottleneck", sub: `${size} · ${stage.ch} ch · global context` };
  if (stage.level === 0) return { title: "Output ε̂", sub: `${size} · predicted noise` };
  return { title: `Decoder ${depth - stage.level}`, sub: `${size} · upsample + skip features` };
}

export default function UNetExplainer({
  id = "unet-explainer",
  aspect = "16 / 9",
  depth = 4, // encoder levels
  imageUrl = "/images/jupiter/thumbnail.webp",
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const stages = buildStages(depth);
  const total = stages.length - 1;
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const current = stages[Math.round(progress * total)];
  const info = describe(current, depth);

  // Start playing once on mount unless the viewer prefers reduced motion.
  useEffect(() => {
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setProgress(0);
      setPlaying(true);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    const ctx = canvas.getContext("2d");
    const n = BASE_RES;
    const noise = gaussianNoise(n * n * 3, 7);
    let tiles = null;

    const image = new Image();
    image.onload = () => {
      const x0 = imagePixels(image, n);
      const a = Math.sqrt(ABAR);
      const b = Math.sqrt(1 - ABAR);
      const xt = x0.map((v, i) => a * v + b * noise[i]);
      tiles = stages.map((s) => {
        if (s.kind === "dec") {
          // Averaging noise shrinks its spread by the block width; scale it back up.
          const f = n / s.res;
          return tileCanvas(downsample(noise, n, s.res), s.res, 0.35 * f);
        }
        return tileCanvas(downsample(xt, n, s.res), s.res, 1);
      });
      draw(performance.now() / 1000);
    };
    image.src = imageUrl;

    let size = { w: 1, h: 1, dpr: 1 };
    let pos = [];

    const layout = () => {
      const { w, h } = size;
      const stepX = Math.min(w * 0.4 / depth, h * 0.19);
      const stepY = h * 0.68 / depth;
      const top = h * 0.2;
      return stages.map((s) => {
        const side = s.kind === "enc" ? -1 : s.kind === "dec" ? 1 : 0;
        const x = w / 2 + side * (depth - s.level) * stepX;
        const y = top + s.level * stepY;
        const t = h * (0.19 - (0.11 * s.level) / depth);
        return { x, y, s: Math.min(t, stepX * 0.82) };
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
      draw(performance.now() / 1000);
    };

    // The main path between two consecutive stages, as an elbow: down then
    // across on the encoder side, across then up on the decoder side.
    const elbow = (k) => {
      const a = pos[k];
      const b = pos[k + 1];
      if (stages[k + 1].kind !== "dec") {
        return [
          { x: a.x, y: a.y + a.s / 2 },
          { x: a.x, y: b.y },
          { x: b.x - b.s / 2, y: b.y },
        ];
      }
      return [
        { x: a.x + a.s / 2, y: a.y },
        { x: b.x, y: a.y },
        { x: b.x, y: b.y + b.s / 2 },
      ];
    };

    // Point at fraction t along a polyline, plus the partial polyline up to it.
    const along = (pts, t) => {
      const lens = [];
      let L = 0;
      for (let i = 1; i < pts.length; i += 1) {
        const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        lens.push(l);
        L += l;
      }
      let d = t * L;
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i += 1) {
        if (d <= lens[i - 1]) {
          const k = lens[i - 1] ? d / lens[i - 1] : 0;
          const p = { x: lerp(pts[i - 1].x, pts[i].x, k), y: lerp(pts[i - 1].y, pts[i].y, k) };
          out.push(p);
          return { p, partial: out };
        }
        d -= lens[i - 1];
        out.push(pts[i]);
      }
      return { p: pts[pts.length - 1], partial: out };
    };

    const strokePath = (pts, r) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i += 1) ctx.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, r);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    };

    function draw(time) {
      if (!pos.length) return;
      const { w, h, dpr } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const unit = Math.min(w, h) / 400;
      const at = progressRef.current * total; // 0..total along the stages
      const corner = 10 * unit;

      // Skip connections: a copy leaves an encoder level as the signal passes it
      // and lands at the matching decoder level just as the signal gets there.
      ctx.setLineDash([4 * unit, 5 * unit]);
      for (let i = 0; i < depth; i += 1) {
        const from = i;
        const to = total - i;
        const a = { x: pos[from].x + pos[from].s / 2 + 4 * unit, y: pos[from].y };
        const b = { x: pos[to].x - pos[to].s / 2 - 4 * unit, y: pos[to].y };
        const t = clamp01((at - from) / (to - from));
        ctx.strokeStyle = rgba(COOL, 0.2);
        ctx.lineWidth = 1.2 * unit;
        strokePath([a, b], 0);
        if (t > 0) {
          const fx = lerp(a.x, b.x, smooth(t));
          ctx.strokeStyle = rgba(COOL, 0.75);
          ctx.lineWidth = 1.6 * unit;
          strokePath([a, { x: fx, y: a.y }], 0);
          if (t < 1) {
            ctx.setLineDash([]);
            ctx.fillStyle = rgba(COOL, 0.95);
            ctx.beginPath();
            ctx.arc(fx, a.y, 2.6 * unit, 0, Math.PI * 2);
            ctx.fill();
            ctx.setLineDash([4 * unit, 5 * unit]);
          }
        }
      }
      ctx.setLineDash([]);

      // Main path, lit up to the signal front.
      for (let k = 0; k < total; k += 1) {
        const pts = elbow(k);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
        ctx.lineWidth = 1.5 * unit;
        strokePath(pts, corner);
        const t = clamp01(at - k);
        if (t <= 0) continue;
        const { p, partial } = along(pts, smooth(t));
        ctx.strokeStyle = rgba(WARM, 0.85);
        ctx.lineWidth = 2.2 * unit;
        strokePath(partial, corner);
        if (t < 1) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10 * unit);
          g.addColorStop(0, rgba([255, 236, 214], 0.95));
          g.addColorStop(1, rgba(WARM, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 10 * unit, 0, Math.PI * 2);
          ctx.fill();
        }
        // Arrowhead at the end of each segment.
        const end = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
        const ah = 5 * unit;
        ctx.fillStyle = t >= 1 ? rgba(WARM, 0.9) : "rgba(255, 255, 255, 0.25)";
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - ah * Math.cos(ang - 0.45), end.y - ah * Math.sin(ang - 0.45));
        ctx.lineTo(end.x - ah * Math.cos(ang + 0.45), end.y - ah * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fill();
      }

      // Feature maps: the image at this level's resolution, with stacked
      // channel sheets behind it (more sheets = more channels).
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = `500 ${Math.max(9, 10.5 * unit)}px Inter, system-ui, sans-serif`;
      stages.forEach((s, k) => {
        const { x, y, s: side } = pos[k];
        const reached = at >= k - 0.02;
        const active = Math.abs(at - k) < 0.5;
        const sheets = 1 + Math.min(s.level, depth - 1) + (s.kind === "mid" ? 2 : 1);
        const off = Math.max(1.5, side * 0.055);
        const r = Math.max(3, side * 0.06);
        ctx.globalAlpha = reached ? 1 : 0.32;

        for (let j = sheets - 1; j >= 1; j -= 1) {
          ctx.fillStyle = "#0e0e14";
          ctx.strokeStyle = s.kind === "dec" ? rgba(WARM, 0.22) : "rgba(255, 255, 255, 0.2)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x - side / 2 + j * off, y - side / 2 - j * off, side, side, r);
          ctx.fill();
          ctx.stroke();
        }

        ctx.save();
        if (active) {
          ctx.shadowColor = rgba(WARM, 0.9);
          ctx.shadowBlur = (14 + pulse * 10) * unit;
        }
        ctx.beginPath();
        ctx.roundRect(x - side / 2, y - side / 2, side, side, r);
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x - side / 2, y - side / 2, side, side, r);
        ctx.clip();
        if (tiles) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tiles[k], x - side / 2, y - side / 2, side, side);
        }
        ctx.restore();
        ctx.strokeStyle = active ? "#fff" : "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = active ? 1.6 : 1;
        ctx.beginPath();
        ctx.roundRect(x - side / 2, y - side / 2, side, side, r);
        ctx.stroke();

        ctx.fillStyle = active ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.55)";
        ctx.fillText(`${s.res}×${s.res}`, x + ((sheets - 1) * off) / 2, y - side / 2 - (sheets - 1) * off - 5 * unit);
        ctx.globalAlpha = 1;
      });
    }

    // Animation loop: advance progress while playing; always redraw while visible.
    let raf = 0;
    let visible = false;
    let last = performance.now();
    let rest = 0;
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        let p = progressRef.current;
        if (p >= 1) {
          rest += dt;
          if (rest > REST_SECONDS) {
            rest = 0;
            p = 0;
          }
        } else {
          p = Math.min(1, p + dt / PASS_SECONDS);
        }
        if (p !== progressRef.current) {
          progressRef.current = p;
          setProgress(p);
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
    container.addEventListener("un:update", redraw);

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
      container.removeEventListener("un:update", redraw);
    };
  }, [depth, imageUrl]);

  // Redraw on slider moves even when the loop is off-screen or paused.
  useEffect(() => {
    if (!playing) containerRef.current?.dispatchEvent(new Event("un:update"));
  }, [progress, playing]);

  return (
    <div className="un-explainer">
      <div className="un-view-wrap" ref={containerRef} style={{ aspectRatio: aspect }}>
        <canvas ref={canvasRef} aria-label={`U-Net pass, currently at ${info.title}`} />
        <div className="un-side un-side-left" aria-hidden="true">Encoder</div>
        <div className="un-side un-side-right" aria-hidden="true">Decoder</div>
        <div className="un-hud" aria-live="polite">
          <span className="un-hud-title">{info.title}</span>
          <span className="un-hud-sub">{info.sub}</span>
        </div>
        <div className="un-key" aria-hidden="true">
          <span><i style={{ background: rgba(WARM, 1) }} />main path</span>
          <span><i className="un-key-dash" style={{ color: rgba(COOL, 1) }} />skip connection</span>
        </div>
      </div>

      <div className="un-controls">
        <button
          type="button"
          className="un-play"
          onClick={() => {
            if (!playing && progress >= 1) {
              progressRef.current = 0;
              setProgress(0);
            }
            playingRef.current = !playing;
            setPlaying(!playing);
          }}
          aria-label={playing ? "Pause the pass" : "Play the pass"}
          aria-pressed={playing}
        >
          {playing ? <Pause size={16} strokeWidth={1.8} /> : <Play size={16} strokeWidth={1.8} />}
        </button>
        <div className="un-slider">
          <input
            id={`${id}-progress`}
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            aria-label="Position in the U-Net pass"
            onChange={(e) => {
              // Update the refs now so the animation loop can't overwrite the drag before React re-renders.
              const p = Number(e.target.value);
              playingRef.current = false;
              progressRef.current = p;
              setPlaying(false);
              setProgress(p);
            }}
          />
          <div className="un-legend">
            <span>Input</span>
            <span>Bottleneck</span>
            <span>Output</span>
          </div>
        </div>
      </div>

      <style>{`
        .un-explainer { width: 100%; display: flex; flex-direction: column; gap: 0.9rem; }
        .un-view-wrap { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden;
          background: radial-gradient(ellipse at 50% 85%, #120e0c 0%, #000 70%); }
        .un-view-wrap canvas { width: 100%; height: 100%; display: block; }
        .un-side { position: absolute; top: 0.7rem; font-size: clamp(0.58rem, 1.2vw, 0.75rem); letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,255,255,0.8); pointer-events: none; }
        .un-side-left { left: 0.9rem; }
        .un-side-right { right: 0.9rem; }
        .un-hud { position: absolute; left: 0.75rem; bottom: 0.6rem; display: flex; flex-direction: column; gap: 0.1rem;
          padding: 0.3rem 0.55rem; border-radius: 8px; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
          color: #fff; font-size: clamp(0.62rem, 1.2vw, 0.8rem); line-height: 1.25; pointer-events: none; }
        .un-hud-sub { color: rgba(255,255,255,0.55); font-size: clamp(0.55rem, 1vw, 0.72rem); font-variant-numeric: tabular-nums; }
        .un-key { position: absolute; right: 0.75rem; bottom: 0.6rem; display: flex; gap: 0.9rem; font-size: clamp(0.5rem, 1vw, 0.66rem);
          color: rgba(255,255,255,0.5); pointer-events: none; }
        .un-key span { display: inline-flex; align-items: center; gap: 0.35rem; }
        .un-key i { display: inline-block; width: 14px; height: 2px; border-radius: 2px; }
        .un-key i.un-key-dash { background: repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 6px); }
        .un-controls { display: flex; align-items: center; gap: 0.75rem; }
        .un-play { flex: none; width: 36px; height: 36px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
        .un-play:hover { background: rgba(255,255,255,0.14); }
        .un-slider { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
        .un-slider input[type="range"] { width: 100%; -webkit-appearance: none; appearance: none; background: transparent; height: 18px; }
        .un-slider input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 999px;
          background: linear-gradient(90deg, #8a8a8a 0%, #3a2a22 50%, #e8c9a0 100%); }
        .un-slider input[type="range"]::-moz-range-track { height: 6px; border-radius: 999px;
          background: linear-gradient(90deg, #8a8a8a 0%, #3a2a22 50%, #e8c9a0 100%); }
        .un-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -6px;
          border-radius: 50%; background: #fff; border: none; box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .un-slider input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: none;
          box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .un-legend { display: flex; justify-content: space-between; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        @media (max-width: 520px) { .un-key, .un-hud-sub, .un-side { display: none; } }
      `}</style>
    </div>
  );
}
