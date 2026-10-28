import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Minus, Pause, Play, Plus } from 'lucide-react';
import { prepareScene } from '../lib/threeCore.js';
import {
  DT,
  G,
  GALAXIES,
  KPC_LY,
  SCENARIOS,
  STEPS,
  T_MAX,
  buildStars,
  integrateCores,
} from './collisionModel.js';
import { StarIntegrator, supportsStarIntegrator } from './starIntegrator.js';

/**
 * The Milky Way and Andromeda, from today to 10 billion years from now.
 *
 * Restricted N-body: the two galaxy cores follow precomputed orbits (with
 * dynamical friction, see collisionModel.js) and the stars, as massless test
 * particles, are moved on the GPU (starIntegrator.js). Scrubbing backwards
 * restores the nearest checkpoint and re-runs forward.
 *
 * Drag to rotate, buttons to zoom.
 */

const PLAY_GYR_PER_SEC = 0.35; // 10 billion years in about half a minute
const CHECKPOINT_STEPS = 500; // a checkpoint every billion years
const SEEK_STEPS_PER_FRAME = 360;
const STAR_SIZE = 0.22; // kpc: each particle stands for many stars, so it has a physical size

const PARTICLE_VERTEX = /* glsl */ `
  uniform sampler2D uPositions;
  uniform float uPxScale;     // pixels per unit of (size / distance)
  uniform float uBrightness;
  uniform float uMaxSize;     // largest dot, in pixels
  uniform float uMinFlux;     // floor on sub-pixel dimming (0 = physical; >0 keeps distant galaxies visible)
  attribute vec2 aRef;
  attribute float aGalaxy;
  attribute float aRadius;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = texture2D(uPositions, aRef).xyz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(-mv.z, 1e-3);
    // Physical size: apparent size falls as 1/distance, so a galaxy's surface
    // brightness stays the same however far away it is. Sub-pixel stars keep
    // their light by trading size for opacity.
    float size = ${STAR_SIZE.toFixed(3)} * uPxScale / dist;
    float alpha = uBrightness;
    if (size < 1.6) { alpha *= max((size * size) / (1.6 * 1.6), uMinFlux); size = 1.6; }
    size = min(size, uMaxSize);
    // Warm cores fading to cooler outskirts; Andromeda a touch warmer than the Milky Way.
    float t = clamp(aRadius / 3.2, 0.0, 1.0);
    vec3 core = aGalaxy < 0.5 ? vec3(1.0, 0.86, 0.66) : vec3(1.0, 0.78, 0.55);
    vec3 outer = aGalaxy < 0.5 ? vec3(0.6, 0.76, 1.0) : vec3(1.0, 0.68, 0.6);
    vColor = mix(core, outer, t);
    vAlpha = alpha;
    gl_PointSize = size;
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = vAlpha * (1.0 - smoothstep(0.12, 0.5, d));
    gl_FragColor = vec4(vColor, a);
  }
`;

const phaseLabel = (t, events) => {
  const fp = events.firstPass;
  const mg = events.merger;
  if (mg && t >= mg.time) return 'Merged into one galaxy';
  if (fp && t < fp.time - 0.25) return 'Approaching';
  if (fp && t <= fp.time + 0.25) return fp.distance > 200 ? 'Closest approach' : 'First close pass';
  if (mg) return 'Falling back together';
  return 'Drifting apart';
};

const formatGyr = (t) => (t < 0.005 ? 'Today' : `${t.toFixed(t < 1 ? 2 : 1)} billion years from now`);

export default function GalaxyCollision({ id = 'galaxy-collision', aspect = '16 / 10', dprCap = 1.5 }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const labelRefs = useRef({});
  const [scenarioKey, setScenarioKey] = useState(SCENARIOS[0].key);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState({ time: 0, target: 0, separation: 785, sunDistance: 8.2, seeking: false });
  const [events, setEvents] = useState(null);
  const [unsupported, setUnsupported] = useState(false);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const camera = new THREE.PerspectiveCamera(45, 16 / 10, 0.01, 20000);
    camera.up.set(0, 0, 1);
    const core = prepareScene({
      canvas,
      container,
      dprCap,
      background: 0x000000,
      cameraFactory: () => ({
        camera,
        onResize: ({ width, height }) => {
          camera.aspect = width / height || 1;
          camera.updateProjectionMatrix();
        },
      }),
    });
    const { scene, renderer, start, stop, dispose: disposeCore } = core;

    if (!supportsStarIntegrator(renderer)) {
      setUnsupported(true);
      return () => disposeCore();
    }

    // Star budget by screen size: ~98k on desktop, ~33k on phones.
    const small = container.clientWidth < 640;
    const texW = small ? 128 : 256;
    const texH = small ? 256 : 384;
    const count = texW * texH;
    const integrator = new StarIntegrator(renderer, { width: texW, height: texH, galaxies: GALAXIES, G });
    // Fewer particles each stand for more stars, so they shine brighter.
    const countBoost = Math.min(2.5, (256 * 384 / count) ** 0.7);

    // Particles: one vertex per star, reading its position from the GPU state.
    const refs = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      refs[i * 2] = ((i % texW) + 0.5) / texW;
      refs[i * 2 + 1] = (Math.floor(i / texW) + 0.5) / texH;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aRef', new THREE.Float32BufferAttribute(refs, 2));
    const galaxyAttr = new THREE.Float32BufferAttribute(new Float32Array(count), 1);
    const radiusAttr = new THREE.Float32BufferAttribute(new Float32Array(count), 1);
    geometry.setAttribute('aGalaxy', galaxyAttr);
    geometry.setAttribute('aRadius', radiusAttr);
    const material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      uniforms: {
        uPositions: { value: null },
        uPxScale: { value: 1 },
        uBrightness: { value: 0.3 * countBoost },
        uMaxSize: { value: 6 },
        uMinFlux: { value: 0.12 }, // keep far-away galaxies visible when zoomed out
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

    // ---------- Simulation state ----------
    let track = null;
    let separation = null;
    let simStep = 0;
    let targetStep = 0;
    let sunIndex = 0;
    const coresAt = (step) => {
      const o = Math.min(step, STEPS) * 6;
      return [
        [track[o], track[o + 1], track[o + 2]],
        [track[o + 3], track[o + 4], track[o + 5]],
      ];
    };

    const loadScenario = (key) => {
      const scenario = SCENARIOS.find((s) => s.key === key) ?? SCENARIOS[0];
      const result = integrateCores(scenario);
      track = result.track;
      separation = result.separation;
      const stars = buildStars(count, track);
      integrator.load(stars.positions, stars.velocities);
      integrator.saveCheckpoint(0);
      galaxyAttr.array.set(stars.galaxyOf);
      galaxyAttr.needsUpdate = true;
      radiusAttr.array.set(stars.radiusOf);
      radiusAttr.needsUpdate = true;
      sunIndex = stars.sunIndex;
      simStep = 0;
      setEvents(result.events);
    };

    // ---------- Camera: drag to rotate, buttons to zoom ----------
    const orbit = { theta: -Math.PI / 2, phi: 0.95, zoom: 1 };
    const centre = new THREE.Vector3();
    let dragging = null;
    const onDown = (e) => {
      dragging = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.x;
      const dy = e.clientY - dragging.y;
      dragging = { x: e.clientX, y: e.clientY };
      orbit.theta -= dx * 0.006;
      // Touch drags only rotate sideways, so vertical swipes still scroll the page.
      if (e.pointerType !== 'touch') orbit.phi = Math.min(1.5, Math.max(0.08, orbit.phi - dy * 0.005));
    };
    const onUp = () => { dragging = null; };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // ---------- Frame ----------
    const projected = new THREE.Vector3();
    const placeLabel = (key, world, show, w, h) => {
      const el = labelRefs.current[key];
      if (!el) return;
      projected.copy(world).project(camera);
      const visible = show && projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
      el.style.opacity = visible ? '1' : '0';
      if (visible) {
        el.style.transform = `translate(${((projected.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((0.5 - projected.y * 0.5) * h).toFixed(1)}px)`;
      }
    };

    let frameCount = 0;
    let sunPos = new THREE.Vector3();
    const m31Pos = new THREE.Vector3();
    const mwPos = new THREE.Vector3();
    const animate = (delta) => {
      frameCount += 1;
      if (playingRef.current) {
        targetStep = Math.min(STEPS, targetStep + (Math.min(delta, 0.1) * PLAY_GYR_PER_SEC) / DT);
        if (targetStep >= STEPS) setPlaying(false);
      }
      const target = Math.round(targetStep);
      if (target < simStep) simStep = Math.max(0, integrator.restoreBefore(target));
      const n = Math.min(target - simStep, SEEK_STEPS_PER_FRAME);
      for (let i = 0; i < n; i += 1) {
        const [c0, c1] = coresAt(simStep);
        integrator.step(c0, c1, DT);
        simStep += 1;
        if (simStep % CHECKPOINT_STEPS === 0) integrator.saveCheckpoint(simStep);
      }
      material.uniforms.uPositions.value = integrator.positionTexture;

      const [c0, c1] = coresAt(simStep);
      mwPos.set(...c0);
      m31Pos.set(...c1);
      const mt = GALAXIES[0].mass + GALAXIES[1].mass;
      centre.set(
        (c0[0] * GALAXIES[0].mass + c1[0] * GALAXIES[1].mass) / mt,
        (c0[1] * GALAXIES[0].mass + c1[1] * GALAXIES[1].mass) / mt,
        (c0[2] * GALAXIES[0].mass + c1[2] * GALAXIES[1].mass) / mt,
      );
      const sep = separation[Math.min(simStep, STEPS)];
      if (frameCount % 12 === 1) {
        const p = integrator.readPosition(sunIndex);
        sunPos = new THREE.Vector3(p[0], p[1], p[2]);
      }

      const w = container.clientWidth;
      const h = container.clientHeight;
      // Frame both galaxies around the centre of mass (the lighter one sits
      // farther out); zoom buttons scale the distance.
      const reach = Math.max(mwPos.distanceTo(centre), m31Pos.distanceTo(centre)) + 45;
      const dist = Math.min(2600, Math.max(70, reach / Math.tan(THREE.MathUtils.degToRad(22.5)))) * orbit.zoom;
      const goal = new THREE.Vector3(
        centre.x + dist * Math.cos(orbit.phi) * Math.cos(orbit.theta),
        centre.y + dist * Math.cos(orbit.phi) * Math.sin(orbit.theta),
        centre.z + dist * Math.sin(orbit.phi),
      );
      camera.position.lerp(goal, frameCount < 3 ? 1 : 0.12);
      camera.lookAt(centre);
      material.uniforms.uPxScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

      placeLabel('mw', mwPos, sep > 25, w, h);
      placeLabel('m31', m31Pos, sep > 25, w, h);

      if (frameCount % 4 === 0) {
        setStatus({
          time: simStep * DT,
          target: targetStep * DT,
          separation: sep,
          sunDistance: sunPos.distanceTo(centre),
          seeking: target - simStep > 0,
        });
      }
    };

    engineRef.current = {
      setScenario: (key) => loadScenario(key),
      seek: (t) => { targetStep = Math.max(0, Math.min(STEPS, t / DT)); },
      time: () => targetStep * DT,
      zoom: (f) => { orbit.zoom = Math.min(4, Math.max(0.2, orbit.zoom * f)); },
    };
    loadScenario(SCENARIOS[0].key);

    // Animate only while visible; start the clock playing the first time it is seen.
    let autoplayed = false;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        start(animate);
        if (!autoplayed && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
          autoplayed = true;
          setPlaying(true);
        }
      } else {
        stop();
      }
    }, { threshold: 0.3 });
    io.observe(container);
    animate(0);
    core.renderOnce();

    return () => {
      io.disconnect();
      stop();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      integrator.dispose();
      geometry.dispose();
      material.dispose();
      disposeCore();
      engineRef.current = null;
    };
  }, [dprCap]);

  const scenario = SCENARIOS.find((s) => s.key === scenarioKey);
  const chooseScenario = (key) => {
    setScenarioKey(key);
    engineRef.current?.setScenario(key);
  };
  const togglePlay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!playing && engine.time() >= T_MAX - 1e-3) engine.seek(0);
    setPlaying((p) => !p);
  };
  const onScrub = (e) => {
    setPlaying(false);
    engineRef.current?.seek(Number(e.target.value));
  };

  const eventsText = events
    ? [
        events.firstPass &&
          `${events.firstPass.distance > 200 ? 'Closest approach' : 'First pass'}: ${events.firstPass.time.toFixed(1)} billion years from now, ${Math.round(events.firstPass.distance)} kpc apart.`,
        events.merger ? `Merged: about ${events.merger.time.toFixed(1)} billion years from now.` : 'No merger within 10 billion years.',
      ].filter(Boolean)
    : [];
  const sepLy = (status.separation * KPC_LY) / 1e6;

  return (
    <div className="gcx" id={id}>
      <div className="gcx-view" ref={containerRef} style={{ aspectRatio: aspect }}>
        <canvas ref={canvasRef} aria-label="Simulation of the Milky Way and Andromeda galaxies colliding" />
        <span ref={(el) => (labelRefs.current.mw = el)} className="gcx-label gcx-label-mw" aria-hidden="true">Milky Way</span>
        <span ref={(el) => (labelRefs.current.m31 = el)} className="gcx-label gcx-label-m31" aria-hidden="true">Andromeda</span>
        <div className="gcx-hud gcx-hud-time" aria-live="polite">
          <span className="gcx-hud-main">{formatGyr(status.time)}</span>
          <span className="gcx-hud-sub">{events ? phaseLabel(status.time, events) : ''}</span>
        </div>
        <div className="gcx-hud gcx-hud-stats" aria-hidden="true">
          <span>Separation <b>{Math.round(status.separation)} kpc</b></span>
          <span>{sepLy.toFixed(sepLy < 1 ? 2 : 1)} million light-years</span>
        </div>
        {status.seeking && <div className="gcx-seeking" aria-hidden="true">Simulating…</div>}
        <div className="gcx-zoom">
          <button type="button" onClick={() => engineRef.current?.zoom(0.75)} aria-label="Zoom in"><Plus size={15} strokeWidth={1.8} /></button>
          <button type="button" onClick={() => engineRef.current?.zoom(1 / 0.75)} aria-label="Zoom out"><Minus size={15} strokeWidth={1.8} /></button>
        </div>
        {unsupported && (
          <div className="gcx-unsupported">This simulation needs WebGL2 with floating-point render targets, which this browser does not support.</div>
        )}
      </div>

      <div className="gcx-controls">
        <button type="button" className="gcx-round" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing}>
          {playing ? <Pause size={16} strokeWidth={1.8} /> : <Play size={16} strokeWidth={1.8} />}
        </button>
        <div className="gcx-slider">
          <input
            id={`${id}-time`}
            type="range"
            min={0}
            max={T_MAX}
            step={0.01}
            value={status.target}
            onChange={onScrub}
            aria-label="Billions of years from now"
          />
          <div className="gcx-legend"><span>Today</span><span>5 billion years</span><span>10 billion years</span></div>
        </div>
      </div>

      <div className="gcx-options">
        <div className="gcx-chips" role="tablist" aria-label="Scenario">
          {SCENARIOS.map((s) => (
            <button key={s.key} type="button" role="tab" aria-selected={s.key === scenarioKey} className={s.key === scenarioKey ? 'is-active' : ''} onClick={() => chooseScenario(s.key)}>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="gcx-info" aria-live="polite">
        <span className="gcx-info-name">{scenario.name}</span>
        <p className="gcx-info-text">{scenario.summary}</p>
        {eventsText.map((t) => (
          <p key={t} className="gcx-info-event">{t}</p>
        ))}
        <p className="gcx-info-event">
          The Sun: <b>{status.sunDistance.toFixed(1)} kpc</b> from the centre of mass.
        </p>
      </div>

      <style>{`
        .gcx { width: 100%; display: flex; flex-direction: column; gap: 0.8rem; }
        .gcx-view { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden; background: #000; touch-action: pan-y; }
        .gcx-view canvas { width: 100%; height: 100%; display: block; cursor: grab; }
        .gcx-view canvas:active { cursor: grabbing; }
        .gcx-label { position: absolute; top: 0; left: 0; pointer-events: none; white-space: nowrap; font-size: clamp(0.6rem, 1.1vw, 0.75rem);
          letter-spacing: 0.08em; text-transform: uppercase; translate: -50% calc(-100% - 14px); transition: opacity 0.3s ease; opacity: 0; }
        .gcx-label-mw { color: #a9c8ff; }
        .gcx-label-m31 { color: #ffc3a0; }
        .gcx-hud { position: absolute; display: flex; flex-direction: column; gap: 0.1rem; padding: 0.3rem 0.55rem; border-radius: 8px;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); pointer-events: none; font-variant-numeric: tabular-nums; }
        .gcx-hud-time { left: 0.75rem; top: 0.7rem; color: #fff; font-size: clamp(0.7rem, 1.3vw, 0.9rem); }
        .gcx-hud-sub { color: rgba(255,255,255,0.6); font-size: clamp(0.6rem, 1.05vw, 0.75rem); }
        .gcx-hud-stats { right: 0.75rem; top: 0.7rem; align-items: flex-end; color: rgba(255,255,255,0.6); font-size: clamp(0.6rem, 1.05vw, 0.75rem); }
        .gcx-hud-stats b { color: #fff; font-weight: 500; }
        .gcx-seeking { position: absolute; left: 50%; bottom: 0.8rem; translate: -50% 0; font-size: 0.75rem; color: rgba(255,255,255,0.7);
          background: rgba(0,0,0,0.5); padding: 0.25rem 0.6rem; border-radius: 999px; pointer-events: none; }
        .gcx-zoom { position: absolute; right: 0.75rem; bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.3rem; }
        .gcx-zoom button { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
        .gcx-unsupported { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem; text-align: center;
          color: rgba(255,255,255,0.75); font-size: 0.9rem; }
        .gcx-controls { display: flex; align-items: center; gap: 0.75rem; }
        .gcx-round { flex: none; width: 36px; height: 36px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
        .gcx-round:hover { background: rgba(255,255,255,0.14); }
        .gcx-slider { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
        .gcx-slider input[type="range"] { width: 100%; -webkit-appearance: none; appearance: none; background: transparent; height: 18px; margin: 0; }
        .gcx-slider input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: linear-gradient(90deg, #6f8fd8, #e8b48a); }
        .gcx-slider input[type="range"]::-moz-range-track { height: 6px; border-radius: 999px; background: linear-gradient(90deg, #6f8fd8, #e8b48a); }
        .gcx-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -6px; border-radius: 50%;
          background: #fff; border: none; box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .gcx-slider input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: none; box-shadow: 0 0 0 4px rgba(255,255,255,0.12); cursor: pointer; }
        .gcx-legend { display: flex; justify-content: space-between; font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .gcx-options { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 1rem; }
        .gcx-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .gcx-chips button { padding: 0.3rem 0.75rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: none;
          color: rgba(255,255,255,0.65); font-size: 0.78rem; cursor: pointer; }
        .gcx-chips button:hover { color: #fff; border-color: rgba(255,255,255,0.35); }
        .gcx-chips button.is-active { background: rgba(255,255,255,0.92); color: #111; border-color: transparent; }
        .gcx-info { border-left: 2px solid rgba(232,180,138,0.6); padding: 0.2rem 0 0.2rem 0.85rem; display: flex; flex-direction: column; gap: 0.25rem; }
        .gcx-info-name { font-size: 1.05rem; color: #fff; }
        .gcx .gcx-info-text, .gcx .gcx-info-event { margin: 0; padding: 0; width: auto; max-width: none; text-align: left; font-size: 0.88rem; line-height: 1.5; }
        .gcx .gcx-info-text { color: rgba(255,255,255,0.8); }
        .gcx .gcx-info-event { color: rgba(255,255,255,0.6); font-variant-numeric: tabular-nums; }
        .gcx-info-event b { color: #ffd76a; font-weight: 500; }
        @media (max-width: 640px) {
          .gcx-chips button { padding: 0.25rem 0.55rem; font-size: 0.7rem; }
          .gcx-legend span:nth-child(2) { display: none; }
        }
      `}</style>
    </div>
  );
}
