import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { prepareScene, createTopDownOrthoCamera } from '../lib/threeCore.js';
import { createGlowSprite, makeGlowTexture } from '../lib/glow.js';
import { OBJECTS, ORBITS, AU_KM, R_EARTH_AU, formatDistance } from './scaleData.js';

/**
 * A true-scale tour from the Sun to TON 618.
 *
 * Every object sits where the Sun is, seen from above, with the planets'
 * orbits drawn around it, so its size reads directly against the Solar
 * System. Each stage zooms out to the next object; smaller objects stay as
 * outlines inside it. Nothing is exaggerated: radii come from scaleData.js,
 * black holes at their Schwarzschild radius.
 */

const TOUR_SECONDS = 4.5; // per stage while the tour plays
const EARTH_OFFSET = 1.45; // Earth's distance from the Sun's centre on the first stage, in Sun radii (not its real orbit)

// Half-height of the view for a stage: the object fills about two thirds of
// it. Sagittarius A* zooms out further so Mercury's orbit is in frame.
const stageExtent = (index) => {
  const { key, radiusAu: r } = OBJECTS[index];
  if (key === 'sun') return r * 1.75;
  if (key === 'sgra') return 0.3;
  return r * 1.5;
};

const circlePoints = (radius, segments = 256) => {
  const pts = [];
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(t) * radius, Math.sin(t) * radius, 0));
  }
  return pts;
};

// A 1, 2 or 5 times a power of ten, close to `value`.
const niceNumber = (value) => {
  const p = 10 ** Math.floor(Math.log10(value));
  const m = value / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
};

export default function BlackHoleScale({ id = 'black-hole-scale', aspect = '16 / 9', dprCap = 1.5 }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const orbitLabelRefs = useRef([]);
  const outlineLabelRefs = useRef([]);
  const earthLabelRef = useRef(null);
  const scaleBarRef = useRef(null);
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    let extent = stageExtent(stageRef.current);
    let camHandle = null;
    const core = prepareScene({
      canvas,
      container,
      dprCap,
      background: 0x000000,
      cameraFactory: () => {
        camHandle = createTopDownOrthoCamera({
          extent: () => extent,
          margin: 1,
          position: [0, 0, 10],
          up: [0, 1, 0],
          lookAt: [0, 0, 0],
          near: 0.1,
          far: 100,
        });
        return camHandle;
      },
    });
    const { scene, textureLoader, start, stop, dispose: disposeCore } = core;

    const disposables = [];
    const track = (...items) => {
      disposables.push(...items);
      return items[0];
    };
    const sunTexture = track(textureLoader.load('/interactive/sun/sun_texture.jpg'));
    sunTexture.colorSpace = THREE.SRGBColorSpace;
    const glowTexture = track(makeGlowTexture());

    const lineLoop = (radius, color, opacity, order, dashed = false) => {
      const geo = track(new THREE.BufferGeometry().setFromPoints(circlePoints(radius)));
      const mat = track(
        dashed
          ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, depthTest: false, dashSize: radius * 0.04, gapSize: radius * 0.03 })
          : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
      );
      const line = new THREE.LineLoop(geo, mat);
      if (dashed) line.computeLineDistances();
      line.renderOrder = order;
      scene.add(line);
      return line;
    };

    // ---------- Objects ----------
    // Each has a filled look (when it is the current stage) and an outline
    // (when a bigger object is on screen).
    const objects = OBJECTS.map((obj) => {
      const r = obj.radiusAu;
      const fill = new THREE.Group();
      let outlineColor;
      if (obj.kind === 'star') {
        const tint = new THREE.Color(obj.color);
        const body = new THREE.Mesh(
          track(new THREE.SphereGeometry(r, 64, 32)),
          track(new THREE.MeshBasicMaterial({ map: sunTexture, color: tint.clone().multiplyScalar(1.35), toneMapped: false })),
        );
        body.renderOrder = 1;
        const inner = createGlowSprite(glowTexture, { color: tint, scale: r * 2.7, opacity: 0.5 });
        const outer = createGlowSprite(glowTexture, { color: tint, scale: r * 5, opacity: 0.12 });
        track(inner.material, outer.material);
        fill.add(outer, inner, body);
        outlineColor = tint;
      } else {
        // Black hole: the event horizon as a black disc with a thin bright
        // photon ring and a faint warm glow around it.
        const glow = createGlowSprite(glowTexture, { color: 0xff9a4a, scale: r * 3.2, opacity: 0.28 });
        const disc = new THREE.Mesh(
          track(new THREE.CircleGeometry(r, 160)),
          // Transparent (at full opacity) so it is drawn after the glow sprite and hides it.
          track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, depthTest: false })),
        );
        disc.renderOrder = 1;
        const ring = new THREE.Mesh(
          track(new THREE.RingGeometry(r, r * 1.02, 160)),
          track(new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.9, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false })),
        );
        ring.renderOrder = 2;
        const haze = new THREE.Mesh(
          track(new THREE.RingGeometry(r * 1.02, r * 1.09, 160)),
          track(new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.1, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false })),
        );
        haze.renderOrder = 2;
        track(glow.material);
        fill.add(glow, disc, ring, haze);
        outlineColor = new THREE.Color(0xffc18a);
      }
      scene.add(fill);
      const outline = lineLoop(r, outlineColor, 0.85, 5);
      return { obj, fill, outline };
    });

    // Earth beside the Sun on the first stage, to scale.
    const earth = new THREE.Mesh(
      track(new THREE.SphereGeometry(R_EARTH_AU, 24, 12)),
      track(new THREE.MeshBasicMaterial({ color: 0x6fb2ff, toneMapped: false })),
    );
    earth.position.x = OBJECTS[0].radiusAu * EARTH_OFFSET;
    earth.renderOrder = 6;
    scene.add(earth);

    // ---------- Orbits and planets ----------
    const orbits = ORBITS.map((orbit, i) => {
      const tint = new THREE.Color(orbit.color).lerp(new THREE.Color(0xffffff), 0.3);
      const line = lineLoop(orbit.au, tint, orbit.faint ? 0.3 : 0.32, 3, orbit.faint);
      let dot = null;
      if (!orbit.faint) {
        const geo = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]));
        const mat = track(new THREE.PointsMaterial({ color: orbit.color, size: 5, sizeAttenuation: false, transparent: true, depthTest: false }));
        dot = new THREE.Points(geo, mat);
        dot.renderOrder = 6;
        scene.add(dot);
      }
      return {
        ...orbit,
        line,
        dot,
        angle: (i * 2.399) % (Math.PI * 2), // golden-angle spread so dots don't line up
        speed: (Math.PI * 2) / (24 * orbit.au ** 1.5), // Earth laps every 24 s; Kepler's third law for the rest
      };
    });

    // ---------- Per-frame update ----------
    const placeLabels = (w, h, scale, current) => {
      const toScreen = (x, y) => [w / 2 + x * scale, h / 2 - y * scale];
      const currentRadius = OBJECTS[current].radiusAu;

      // Orbit labels sit up and to the right on each ring; skip rings that are
      // too small, off screen, or too close to the last labelled one.
      let lastShown = -Infinity;
      const angle = THREE.MathUtils.degToRad(38);
      orbits.forEach((orbit, i) => {
        const el = orbitLabelRefs.current[i];
        if (!el) return;
        const rPx = orbit.au * scale;
        const [x, y] = toScreen(Math.cos(angle) * orbit.au, Math.sin(angle) * orbit.au);
        const show = rPx > 30 && rPx - lastShown > 32 && x < w - 40 && y > 14;
        el.style.opacity = show ? '1' : '0';
        if (show) {
          lastShown = rPx;
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          el.classList.toggle('is-inside', orbit.au < currentRadius);
        }
      });

      // Smaller objects' outline labels, just above each outline.
      objects.forEach(({ obj }, i) => {
        const el = outlineLabelRefs.current[i];
        if (!el) return;
        const rPx = obj.radiusAu * scale;
        const show = i < current && rPx > 20; // tiny outlines get no label, so it can't sit on the orbit labels
        el.style.opacity = show ? '1' : '0';
        if (show) {
          const [x, y] = toScreen(0, obj.radiusAu);
          el.style.transform = `translate(${x.toFixed(1)}px, ${(y - 4).toFixed(1)}px)`;
        }
      });

      const earthEl = earthLabelRef.current;
      if (earthEl) {
        const show = current === 0;
        earthEl.style.opacity = show ? '1' : '0';
        if (show) {
          const [x, y] = toScreen(earth.position.x, 0);
          earthEl.style.transform = `translate(${x.toFixed(1)}px, ${(y + 10).toFixed(1)}px)`;
        }
      }

      // Scale bar: a round distance about 110 px long.
      const bar = scaleBarRef.current;
      if (bar) {
        const rawAu = 110 / scale;
        let au;
        let text;
        if (rawAu < 0.05) {
          const km = niceNumber(rawAu * AU_KM);
          au = km / AU_KM;
          text = km >= 1e6 ? `${(km / 1e6).toLocaleString('en-US')} million km` : `${km.toLocaleString('en-US')} km`;
        } else {
          au = niceNumber(rawAu);
          text = `${au.toLocaleString('en-US')} AU`;
        }
        bar.style.setProperty('--bar', `${(au * scale).toFixed(1)}px`);
        bar.querySelector('span').textContent = text;
      }
    };

    let visible = false;
    let last = performance.now();
    const animate = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = stageRef.current;

      // Ease the zoom in log space so each order of magnitude takes equal time.
      const target = stageExtent(current);
      const k = 1 - Math.exp(-dt * 3.2);
      extent = Math.exp(Math.log(extent) + (Math.log(target) - Math.log(extent)) * k);
      const w = container.clientWidth;
      const h = container.clientHeight;
      camHandle.onResize({ width: w, height: h });
      const scale = h / (2 * extent); // px per AU

      objects.forEach(({ fill, outline }, i) => {
        fill.visible = i === current;
        outline.visible = i < current;
      });
      earth.visible = current === 0;

      const currentRadius = OBJECTS[current].radiusAu;
      orbits.forEach((orbit) => {
        orbit.line.material.opacity = (orbit.faint ? 0.3 : 0.32) * (orbit.au < currentRadius ? 0.55 : 1);
        if (orbit.dot) {
          orbit.angle += orbit.speed * dt;
          orbit.dot.position.set(Math.cos(orbit.angle) * orbit.au, Math.sin(orbit.angle) * orbit.au, 0);
          orbit.dot.material.opacity = orbit.au < currentRadius ? 0.35 : 1;
          orbit.dot.visible = current > 0;
        }
      });

      placeLabels(w, h, scale, current);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        last = performance.now();
        start(animate);
      } else {
        stop();
      }
    });
    io.observe(container);
    animate();
    core.renderOnce();

    return () => {
      io.disconnect();
      stop();
      disposeCore();
      disposables.forEach((item) => item?.dispose?.());
    };
  }, [dprCap]);

  // Guided tour: step through the stages, then stop on the last one.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      setStage((s) => {
        if (s >= OBJECTS.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, TOUR_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [playing]);

  const obj = OBJECTS[stage];
  const goTo = (i) => {
    setPlaying(false);
    setStage(Math.max(0, Math.min(OBJECTS.length - 1, i)));
  };
  const togglePlay = () => {
    if (!playing && stage >= OBJECTS.length - 1) setStage(0);
    setPlaying((p) => !p);
  };
  const radiusKm = obj.radiusAu * AU_KM;
  const kmText = radiusKm >= 1e9
    ? `${(radiusKm / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 })} billion km`
    : `${(radiusKm / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} million km`;
  const radiusText = obj.radiusAu >= 0.05 ? `${formatDistance(obj.radiusAu)} (${kmText})` : formatDistance(obj.radiusAu);

  return (
    <div className="bhs" id={id}>
      <div className="bhs-view" ref={containerRef} style={{ aspectRatio: aspect }}>
        <canvas ref={canvasRef} aria-label={`True-scale view of ${obj.name} with the Solar System's orbits`} />
        {ORBITS.map((orbit, i) => (
          <span key={orbit.name} ref={(el) => (orbitLabelRefs.current[i] = el)} className="bhs-orbit-label" aria-hidden="true">
            {orbit.name}
          </span>
        ))}
        {OBJECTS.map((o, i) => (
          <span key={o.key} ref={(el) => (outlineLabelRefs.current[i] = el)} className="bhs-outline-label" aria-hidden="true">
            {o.short}
          </span>
        ))}
        <span ref={earthLabelRef} className="bhs-earth-label" aria-hidden="true">Earth</span>
        <div ref={scaleBarRef} className="bhs-scale" aria-hidden="true">
          <i />
          <span />
        </div>
        <div className="bhs-step" aria-hidden="true">{stage + 1} / {OBJECTS.length}</div>
      </div>

      <div className="bhs-controls">
        <button type="button" className="bhs-round" onClick={togglePlay} aria-label={playing ? 'Pause the tour' : 'Play the tour'} aria-pressed={playing}>
          {playing ? <Pause size={16} strokeWidth={1.8} /> : <Play size={16} strokeWidth={1.8} />}
        </button>
        <button type="button" className="bhs-round" onClick={() => goTo(stage - 1)} disabled={stage === 0} aria-label="Previous object">
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <div className="bhs-chips" role="tablist" aria-label="Objects">
          {OBJECTS.map((o, i) => (
            <button key={o.key} type="button" role="tab" aria-selected={i === stage} className={i === stage ? 'is-active' : ''} onClick={() => goTo(i)}>
              {o.short}
            </button>
          ))}
        </div>
        <button type="button" className="bhs-round" onClick={() => goTo(stage + 1)} disabled={stage === OBJECTS.length - 1} aria-label="Next object">
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="bhs-info" aria-live="polite">
        <div className="bhs-info-head">
          <span className="bhs-info-name">{obj.name}</span>
          <span className="bhs-info-detail">{obj.detail}</span>
        </div>
        <div className="bhs-info-size">
          {obj.kind === 'blackhole' ? 'Event horizon radius' : 'Radius'}: <b>{radiusText}</b>
        </div>
        <p className="bhs-info-fact">{obj.fact}</p>
      </div>

      <style>{`
        .bhs { width: 100%; display: flex; flex-direction: column; gap: 0.8rem; }
        .bhs-view { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden; background: #000; }
        .bhs-view canvas { width: 100%; height: 100%; display: block; }
        .bhs-orbit-label, .bhs-outline-label, .bhs-earth-label { position: absolute; top: 0; left: 0; white-space: nowrap; pointer-events: none;
          font-size: clamp(0.55rem, 1.05vw, 0.72rem); letter-spacing: 0.04em; transition: opacity 0.25s ease; opacity: 0; will-change: transform; }
        .bhs-orbit-label { color: rgba(255,255,255,0.6); transform-origin: 0 0; margin: -0.6em 0 0 0.35em; }
        .bhs-orbit-label.is-inside { color: rgba(255,255,255,0.35); }
        .bhs-outline-label { color: #ffd9b0; translate: -50% -100%; text-transform: uppercase; letter-spacing: 0.08em; }
        .bhs-earth-label { color: #9fcbff; translate: -50% 0; }
        .bhs-scale { position: absolute; left: 0.9rem; bottom: 0.7rem; display: flex; flex-direction: column; gap: 0.25rem; pointer-events: none; }
        .bhs-scale i { display: block; width: var(--bar, 100px); height: 6px; border: 1px solid rgba(255,255,255,0.6); border-top: none; }
        .bhs-scale span { font-size: clamp(0.55rem, 1vw, 0.7rem); color: rgba(255,255,255,0.65); font-variant-numeric: tabular-nums; }
        .bhs-step { position: absolute; right: 0.9rem; top: 0.7rem; font-size: 0.7rem; letter-spacing: 0.08em; color: rgba(255,255,255,0.45); font-variant-numeric: tabular-nums; }
        .bhs-controls { display: flex; align-items: center; gap: 0.5rem; }
        .bhs-round { flex: none; width: 34px; height: 34px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
        .bhs-round:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
        .bhs-round:disabled { opacity: 0.35; cursor: default; }
        .bhs-chips { flex: 1; display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center; }
        .bhs-chips button { padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: none;
          color: rgba(255,255,255,0.65); font-size: 0.78rem; cursor: pointer; }
        .bhs-chips button:hover { color: #fff; border-color: rgba(255,255,255,0.35); }
        .bhs-chips button.is-active { background: rgba(255,255,255,0.92); color: #111; border-color: transparent; }
        .bhs-info { border-left: 2px solid rgba(255,193,138,0.6); padding: 0.2rem 0 0.2rem 0.85rem; display: flex; flex-direction: column; gap: 0.3rem; }
        .bhs-info-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.7rem; }
        .bhs-info-name { font-size: 1.15rem; color: #fff; }
        .bhs-info-detail { font-size: 0.85rem; color: rgba(255,255,255,0.55); }
        .bhs-info-size { font-size: 0.9rem; color: rgba(255,255,255,0.75); font-variant-numeric: tabular-nums; }
        .bhs-info-size b { color: #ffd9b0; font-weight: 500; }
        .bhs .bhs-info-fact { margin: 0; padding: 0; width: auto; max-width: none; font-size: 0.92rem; line-height: 1.5; color: rgba(255,255,255,0.8); text-align: left; }
        @media (max-width: 640px) {
          .bhs-chips button { padding: 0.25rem 0.55rem; font-size: 0.7rem; }
          .bhs-step { display: none; }
        }
      `}</style>
    </div>
  );
}
