import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

/**
 * The diffusion forward/reverse process on a real image.
 *
 * Each frame is x_t = √ᾱ_t · x_0 + √(1 − ᾱ_t) · ε, with Gaussian noise ε drawn
 * once per pixel and colour channel, and ᾱ_t from the cosine noise schedule
 * (Nichol & Dhariwal, 2021). Moving the slider right walks the reverse process
 * from pure noise back to the clean image; the strip below shows a few fixed
 * steps along the way. (A real model would *predict* the noise to remove; here
 * we know it, so the frames show what each step of a perfect denoiser looks like.)
 */

const GRID_WIDTH = 320; // noise "pixels" across the main view
const THUMB_WIDTH = 96;
const STRIP_FRACTIONS = [1, 0.8, 0.6, 0.4, 0.2, 0]; // t / T for the filmstrip, noisiest first
const PLAY_SECONDS = 5; // pure noise → clean image when playing

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

// Cosine schedule: fraction of the original signal's variance left at step t.
function alphaBar(t, T, s = 0.008) {
  const f = (x) => Math.cos(((x / T + s) / (1 + s)) * (Math.PI / 2)) ** 2;
  return Math.min(1, Math.max(0, f(t) / f(0)));
}

// Draw the image into a w×h buffer (fit inside, on black) and return its pixels scaled to [-1, 1].
function imagePixels(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    out[j] = (data[i] / 255) * 2 - 1;
    out[j + 1] = (data[i + 1] / 255) * 2 - 1;
    out[j + 2] = (data[i + 2] / 255) * 2 - 1;
  }
  return out;
}

// Render x_t into a w×h canvas.
function renderFrame(target, x0, noise, w, h, abar) {
  target.width = w;
  target.height = h;
  const ctx = target.getContext('2d');
  const img = ctx.createImageData(w, h);
  const a = Math.sqrt(abar);
  const b = Math.sqrt(1 - abar);
  for (let i = 0, j = 0; j < x0.length; i += 4, j += 3) {
    img.data[i] = ((a * x0[j] + b * noise[j]) * 0.5 + 0.5) * 255;
    img.data[i + 1] = ((a * x0[j + 1] + b * noise[j + 1]) * 0.5 + 0.5) * 255;
    img.data[i + 2] = ((a * x0[j + 2] + b * noise[j + 2]) * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function parseAspect(aspect) {
  const [w, h] = String(aspect).split('/').map((v) => parseFloat(v));
  return w > 0 && h > 0 ? w / h : 16 / 9;
}

export default function DiffusionExplainer({
  id = 'diffusion-explainer',
  aspect = '16 / 9',
  steps = 12,
  imageUrl = '/images/jupiter/thumbnail.webp',
}) {
  const T = Math.max(2, steps) - 1; // last timestep
  const ratio = parseAspect(aspect);
  const gridW = GRID_WIDTH;
  const gridH = Math.round(GRID_WIDTH / ratio);
  const thumbW = THUMB_WIDTH;
  const thumbH = Math.round(THUMB_WIDTH / ratio);

  const viewRef = useRef(null);
  const frameRef = useRef(null); // low-res x_t, upscaled into the view
  const thumbRefs = useRef([]);
  const dataRef = useRef(null); // { x0, noise, x0Small, noiseSmall }
  const rafRef = useRef(0);

  const [step, setStep] = useState(Math.floor(T / 2)); // reverse step: 0 = pure noise, T = clean
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  const t = T - step;
  const abar = alphaBar(t, T);

  // Load the image and draw the fixed noise once.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      dataRef.current = {
        x0: imagePixels(img, gridW, gridH),
        noise: gaussianNoise(gridW * gridH * 3, 1701),
        x0Small: imagePixels(img, thumbW, thumbH),
        noiseSmall: gaussianNoise(thumbW * thumbH * 3, 1701),
      };
      setReady(true);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [gridH, gridW, imageUrl, thumbH, thumbW]);

  // Filmstrip: fixed steps, drawn once the image is ready.
  useEffect(() => {
    const d = dataRef.current;
    if (!ready || !d) return;
    STRIP_FRACTIONS.forEach((fraction, i) => {
      const c = thumbRefs.current[i];
      if (c) renderFrame(c, d.x0Small, d.noiseSmall, thumbW, thumbH, alphaBar(Math.round(fraction * T), T));
    });
  }, [ready, T, thumbH, thumbW]);

  // Main view: render x_t at grid resolution, then scale up sharply to the device's pixel size.
  const drawView = useCallback(() => {
    const d = dataRef.current;
    const view = viewRef.current;
    if (!d || !view) return;
    if (!frameRef.current) frameRef.current = document.createElement('canvas');
    renderFrame(frameRef.current, d.x0, d.noise, gridW, gridH, abar);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(view.clientWidth * dpr));
    const h = Math.max(1, Math.round(view.clientHeight * dpr));
    if (view.width !== w || view.height !== h) {
      view.width = w;
      view.height = h;
    }
    const ctx = view.getContext('2d');
    // Keep the grain crisp while the image is noisy; smooth it as it resolves.
    ctx.imageSmoothingEnabled = abar > 0.85;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frameRef.current, 0, 0, w, h);
  }, [abar, gridH, gridW]);

  useEffect(() => {
    if (ready) drawView();
  }, [drawView, ready]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return undefined;
    const ro = new ResizeObserver(() => drawView());
    ro.observe(view);
    return () => ro.disconnect();
  }, [drawView]);

  // Play: run the reverse process from pure noise to the clean image.
  useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now();
    let current = step >= T ? 0 : step;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      current = Math.min(T, current + (dt / PLAY_SECONDS) * T);
      setStep(Math.round(current));
      if (current >= T) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // Only (re)start when play is toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, T]);

  const signalPct = Math.round(Math.sqrt(abar) * 100);
  const activeThumb = STRIP_FRACTIONS.reduce(
    (best, f, i) => (Math.abs(f * T - t) < Math.abs(STRIP_FRACTIONS[best] * T - t) ? i : best),
    0,
  );

  return (
    <div className="diffusion-explainer">
      <div className="dx-view-wrap" style={{ aspectRatio: aspect }}>
        <canvas ref={viewRef} className="dx-view" aria-label={`Image at diffusion step t = ${t}`} />
        <div className="dx-hud dx-hud-left">
          <span className="dx-hud-t">t = {t}</span>
          <span className="dx-hud-sub">{signalPct}% signal</span>
        </div>
        <div className="dx-hud dx-hud-right">{t === 0 ? 'Clean image' : t === T ? 'Pure noise' : 'Denoising'}</div>
      </div>

      <div className="dx-controls">
        <button
          type="button"
          className="dx-play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause denoising' : 'Play denoising'}
          aria-pressed={playing}
        >
          {playing ? <Pause size={16} strokeWidth={1.8} /> : <Play size={16} strokeWidth={1.8} />}
        </button>
        <div className="dx-slider">
          <input
            id={`${id}-slider`}
            type="range"
            min={0}
            max={T}
            step={1}
            value={step}
            aria-label="Reverse diffusion step"
            onChange={(e) => {
              setPlaying(false);
              setStep(Number(e.target.value));
            }}
          />
          <div className="dx-legend">
            <span>Pure noise</span>
            <span>Clean image</span>
          </div>
        </div>
      </div>

      <div className="dx-strip">
        {STRIP_FRACTIONS.map((fraction, i) => (
          <button
            key={fraction}
            type="button"
            className={`dx-thumb${i === activeThumb ? ' is-active' : ''}`}
            onClick={() => {
              setPlaying(false);
              setStep(T - Math.round(fraction * T));
            }}
            aria-label={`Jump to t = ${Math.round(fraction * T)}`}
          >
            <canvas ref={(el) => (thumbRefs.current[i] = el)} style={{ aspectRatio: aspect }} />
            <span>t = {Math.round(fraction * T)}</span>
          </button>
        ))}
      </div>

      <style>{`
        .diffusion-explainer { width: 100%; display: flex; flex-direction: column; gap: 0.9rem; }
        .dx-view-wrap { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden; background: #000; }
        .dx-view { width: 100%; height: 100%; display: block; }
        .dx-hud { position: absolute; bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.1rem;
          padding: 0.35rem 0.6rem; border-radius: 8px; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
          color: #fff; font-size: 0.8rem; line-height: 1.25; pointer-events: none; }
        .dx-hud-left { left: 0.75rem; }
        .dx-hud-right { right: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.7rem; color: rgba(255,255,255,0.8); }
        .dx-hud-t { font-variant-numeric: tabular-nums; }
        .dx-hud-sub { color: rgba(255,255,255,0.6); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
        .dx-controls { display: flex; align-items: center; gap: 0.75rem; }
        .dx-play { flex: none; width: 36px; height: 36px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
        .dx-play:hover { background: rgba(255,255,255,0.14); }
        .dx-slider { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
        .dx-slider input[type="range"] { width: 100%; -webkit-appearance: none; appearance: none; background: transparent; height: 18px; }
        .dx-slider input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 999px;
          background: linear-gradient(90deg, #3a3a3a 0%, #8a8a8a 50%, #e8c9a0 100%); }
        .dx-slider input[type="range"]::-moz-range-track { height: 6px; border-radius: 999px;
          background: linear-gradient(90deg, #3a3a3a 0%, #8a8a8a 50%, #e8c9a0 100%); }
        .dx-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -6px;
          border-radius: 50%; background: #fff; border: none; box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .dx-slider input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: none;
          box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .dx-legend { display: flex; justify-content: space-between; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .dx-strip { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem; }
        .dx-thumb { display: flex; flex-direction: column; gap: 0.3rem; align-items: center; padding: 0; background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.5); font-size: 0.68rem; font-variant-numeric: tabular-nums; }
        .dx-thumb canvas { width: 100%; height: auto; display: block; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12); image-rendering: pixelated; transition: border-color 0.2s ease, transform 0.2s ease; }
        .dx-thumb.is-active { color: #fff; }
        .dx-thumb.is-active canvas { border-color: rgba(255,255,255,0.8); transform: translateY(-2px); }
        @media (max-width: 520px) { .dx-thumb span { display: none; } .dx-strip { gap: 0.3rem; } }
      `}</style>
    </div>
  );
}
