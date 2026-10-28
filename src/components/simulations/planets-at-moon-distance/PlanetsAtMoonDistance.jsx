import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { prepareScene, addSaturn } from '../lib/threeCore.js';
import { BODIES, MOON_DISTANCE_KM, describe, formatDeg } from './skyData.js';

/**
 * The evening sky with the Moon swapped for each planet, at true angular size.
 *
 * The camera stands on the ground with a fixed, real field of view, so a body
 * looks exactly as big as it would to your eye: the Moon a small disc, Jupiter
 * a fifth of the view. Bodies sit at the Moon's distance (units: thousands of
 * km); a dashed circle keeps the real Moon's size beside them for scale.
 *
 * Planets are drawn with additive blending: their night side shows the sky
 * behind it, as the Moon's does at dusk (the sky's glow is in front of it).
 */

const FOV = 50; // vertical, degrees
const PITCH = THREE.MathUtils.degToRad(16); // camera tilt above the horizon
const ELEVATION = THREE.MathUtils.degToRad(26); // the body's height in the sky
const AZIMUTH = THREE.MathUtils.degToRad(4);
const MOON_MARK = { az: THREE.MathUtils.degToRad(-29), el: THREE.MathUtils.degToRad(27) };
const D = MOON_DISTANCE_KM / 1000;
const TOUR_SECONDS = 4;
const GROW_SECONDS = 1.3;
// Sunlight from low behind the viewer on the right, so the body is mostly lit.
const SUN_DIR = new THREE.Vector3(0.45, 0.08, 0.89).normalize();

const skyDirection = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// Late dusk: warm near the horizon, deepening to night blue overhead, a little
// brighter towards the set Sun (behind and to the right).
const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 zenith = vec3(0.004, 0.007, 0.022);
    vec3 mid = vec3(0.016, 0.03, 0.08);
    vec3 horizon = vec3(0.42, 0.2, 0.12);
    vec3 col = mix(mid, zenith, smoothstep(0.05, 0.6, h));
    col = mix(horizon, col, smoothstep(0.0, 0.14, h));
    float sunSide = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 3.0);
    col += vec3(0.2, 0.09, 0.04) * sunSide * (1.0 - smoothstep(0.0, 0.25, h));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// The ground: rolling hills and a few trees, as a silhouette in camera space
// (x in -1..1 across the view, y in the camera's z = -1 plane).
function buildSilhouette(horizonY) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, -2);
  const hill = (x) => horizonY + 0.035 + 0.03 * Math.sin(x * 3.1 + 0.4) + 0.018 * Math.sin(x * 7.3 + 1.7) + 0.008 * Math.sin(x * 19.0);
  const trees = [-0.86, -0.8, -0.52, 0.31, 0.36, 0.72, 0.9];
  const pts = [];
  for (let i = 0; i <= 240; i += 1) {
    const x = -1.1 + (2.2 * i) / 240;
    pts.push([x, hill(x)]);
  }
  pts.forEach(([x, y]) => {
    shape.lineTo(x, y);
    // A pointed conifer where a tree stands.
    trees.forEach((tx, k) => {
      if (Math.abs(x - tx) < 0.0046) {
        const hgt = 0.05 + 0.025 * ((k * 37) % 3);
        const w = hgt * 0.32;
        shape.lineTo(tx - w, y + hgt * 0.1);
        for (let s = 0; s < 4; s += 1) {
          const f = s / 4;
          shape.lineTo(tx - w * (1 - f) * 0.5, y + hgt * (0.1 + f * 0.9));
          shape.lineTo(tx - w * (1 - f - 0.2) * 0.9, y + hgt * (0.1 + (f + 0.18) * 0.9));
        }
        shape.lineTo(tx, y + hgt * 1.05);
        for (let s = 3; s >= 0; s -= 1) {
          const f = s / 4;
          shape.lineTo(tx + w * (1 - f - 0.2) * 0.9, y + hgt * (0.1 + (f + 0.18) * 0.9));
          shape.lineTo(tx + w * (1 - f) * 0.5, y + hgt * (0.1 + f * 0.9));
        }
        shape.lineTo(tx + w, y + hgt * 0.1);
      }
    });
  });
  shape.lineTo(1.1, -2);
  shape.lineTo(-1.1, -2);
  return new THREE.ShapeGeometry(shape);
}

export default function PlanetsAtMoonDistance({ id = 'planets-at-moon-distance', aspect = '16 / 9', dprCap = 1.5 }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const moonLabelRef = useRef(null);
  const [index, setIndex] = useState(BODIES.length - 1);
  const [playing, setPlaying] = useState(false);
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.05, 3000);
    camera.rotation.x = PITCH;
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
    const { scene, renderer, textureLoader, start, stop, dispose: disposeCore } = core;
    scene.add(camera);

    const disposables = [];
    const track = (...items) => {
      disposables.push(...items);
      return items[0];
    };

    // ---------- Sky ----------
    const sky = new THREE.Mesh(
      track(new THREE.SphereGeometry(2000, 64, 32)),
      track(new THREE.ShaderMaterial({ vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, uniforms: { uSun: { value: SUN_DIR } }, side: THREE.BackSide, depthWrite: false })),
    );
    sky.renderOrder = -2;
    scene.add(sky);

    const sunLight = new THREE.DirectionalLight(0xfff4e8, 3);
    sunLight.position.copy(SUN_DIR).multiplyScalar(1000);
    scene.add(sunLight);

    // ---------- Bodies ----------
    const skyPos = skyDirection(AZIMUTH, ELEVATION).multiplyScalar(D);
    const bodies = BODIES.map((body) => {
      const r = body.radiusKm / 1000;
      const group = new THREE.Group();
      group.position.copy(skyPos);
      let spinner;
      if (body.ringOuterKm) {
        const saturn = addSaturn(group, {
          textureUrl: body.texture,
          ringTextureUrl: '/textures/saturns_rings_texture.webp',
          radius: r,
          spinSpeed: 0.05,
          tiltDeg: [46, 0, 14], // looking up at 26°, this shows the rings from ~20° above their plane
          ringInnerScale: body.ringInnerKm / body.radiusKm,
          ringOuterScale: body.ringOuterKm / body.radiusKm,
          segments: 96,
          textureLoader,
          renderer,
          ringMaterialOptions: { color: new THREE.Color(0xf3e6d0) },
        });
        disposables.push({ dispose: saturn.dispose });
        saturn.planetMaterial.blending = THREE.AdditiveBlending;
        saturn.planetMaterial.transparent = true;
        saturn.planetMesh.renderOrder = 1;
        saturn.ringMesh.renderOrder = 2;
        saturn.ringMaterial.blending = THREE.AdditiveBlending; // translucent and bright against the sky, like the planet
        spinner = { update: saturn.update };
      } else {
        const tex = track(textureLoader.load(body.texture));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const mesh = new THREE.Mesh(
          track(new THREE.SphereGeometry(r, 96, 48)),
          track(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, blending: THREE.AdditiveBlending, transparent: true })),
        );
        mesh.rotation.z = THREE.MathUtils.degToRad(body.key === 'uranus' ? 82 : 8);
        mesh.renderOrder = 1;
        group.add(mesh);
        spinner = { update: (dt) => { mesh.rotation.y += dt * 0.05; } };
      }
      group.visible = false;
      scene.add(group);
      return { body, group, spinner, deg: describe(body).deg };
    });

    // The real Moon's size, as a dashed circle facing the viewer.
    const moonR = BODIES[0].radiusKm / 1000;
    const moonMarkPos = skyDirection(MOON_MARK.az, MOON_MARK.el).multiplyScalar(D);
    const ringPts = Array.from({ length: 64 }, (_, i) => {
      const t = (i / 64) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(t) * moonR, Math.sin(t) * moonR, 0);
    });
    const moonMark = new THREE.LineLoop(
      track(new THREE.BufferGeometry().setFromPoints(ringPts)),
      track(new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, dashSize: moonR * 0.35, gapSize: moonR * 0.25, depthTest: false })),
    );
    moonMark.computeLineDistances();
    moonMark.position.copy(moonMarkPos);
    moonMark.lookAt(0, 0, 0);
    scene.add(moonMark);

    // ---------- Ground ----------
    const silhouette = new THREE.Mesh(
      track(buildSilhouette(-Math.tan(PITCH))),
      track(new THREE.MeshBasicMaterial({ color: 0x03050a, depthTest: false, depthWrite: false })),
    );
    silhouette.position.z = -1;
    silhouette.renderOrder = 10;
    camera.add(silhouette);

    // ---------- Frame ----------
    let shown = -1;
    let growFrom = 1;
    let growT = 1;
    let last = performance.now();
    const projected = new THREE.Vector3();
    const animate = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = indexRef.current;
      if (current !== shown) {
        // Grow (or shrink) from the previous body's size to the new one's.
        growFrom = shown < 0 ? 1 : bodies[shown].deg / bodies[current].deg;
        growT = shown < 0 ? 1 : 0;
        bodies.forEach((b, i) => { b.group.visible = i === current; });
        shown = current;
      }
      growT = Math.min(1, growT + dt / GROW_SECONDS);
      const e = 1 - (1 - growT) ** 3;
      bodies[current].group.scale.setScalar(Math.exp(Math.log(growFrom) * (1 - e)));
      bodies[current].spinner.update(dt);

      const w = container.clientWidth;
      const h = container.clientHeight;
      // The silhouette spans the view's width at z = -1.
      silhouette.scale.x = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camera.aspect;
      const isMoon = BODIES[current].key === 'moon';
      moonMark.visible = !isMoon;
      const label = moonLabelRef.current;
      if (label) {
        label.style.opacity = isMoon ? '0' : '1';
        projected.copy(moonMarkPos).project(camera);
        label.style.transform = `translate(${((projected.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((0.5 - projected.y * 0.5) * h).toFixed(1)}px)`;
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
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

  // Tour: from the Moon up to Jupiter, then stop.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      setIndex((i) => {
        if (i >= BODIES.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, TOUR_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [playing]);

  const body = BODIES[index];
  const info = describe(body);
  const goTo = (i) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(BODIES.length - 1, i)));
  };
  const togglePlay = () => {
    if (!playing && index >= BODIES.length - 1) setIndex(0);
    setPlaying((p) => !p);
  };
  const wider = info.timesWider < 10 ? info.timesWider.toFixed(1) : Math.round(info.timesWider);

  return (
    <div className="pmd" id={id}>
      <div className="pmd-view" ref={containerRef} style={{ aspectRatio: aspect }}>
        <canvas ref={canvasRef} aria-label={`The evening sky with ${body.name} at the Moon's distance, at true size`} />
        <span ref={moonLabelRef} className="pmd-moon-label" aria-hidden="true">The Moon, to scale</span>
        <div className="pmd-hud" aria-live="polite">
          <span className="pmd-hud-name">{body.name}</span>
          <span className="pmd-hud-size">
            {formatDeg(info.deg)} across{body.key !== 'moon' && ` · ${wider} times the Moon`}
          </span>
        </div>
      </div>

      <div className="pmd-controls">
        <button type="button" className="pmd-round" onClick={togglePlay} aria-label={playing ? 'Pause the tour' : 'Play the tour'} aria-pressed={playing}>
          {playing ? <Pause size={16} strokeWidth={1.8} /> : <Play size={16} strokeWidth={1.8} />}
        </button>
        <button type="button" className="pmd-round" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Smaller">
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <div className="pmd-chips" role="tablist" aria-label="Bodies">
          {BODIES.map((b, i) => (
            <button key={b.key} type="button" role="tab" aria-selected={i === index} className={i === index ? 'is-active' : ''} onClick={() => goTo(i)}>
              {b.short}
            </button>
          ))}
        </div>
        <button type="button" className="pmd-round" onClick={() => goTo(index + 1)} disabled={index === BODIES.length - 1} aria-label="Bigger">
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="pmd-info" aria-live="polite">
        <p className="pmd-fact">{body.fact}</p>
        {body.key !== 'moon' && (
          <div className="pmd-stats">
            <span><b>{Math.round(info.timesArea).toLocaleString('en-US')}×</b> the Moon’s area in the sky</span>
            {info.ringDeg && <span>Rings <b>{formatDeg(info.ringDeg)}</b> across</span>}
            <span><b>{Math.round(info.timesTide).toLocaleString('en-US')}×</b> the Moon’s tidal pull</span>
          </div>
        )}
      </div>

      <style>{`
        .pmd { width: 100%; display: flex; flex-direction: column; gap: 0.8rem; }
        .pmd-view { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden; background: #000; }
        .pmd-view canvas { width: 100%; height: 100%; display: block; }
        .pmd-moon-label { position: absolute; top: 0; left: 0; white-space: nowrap; pointer-events: none; font-size: clamp(0.55rem, 1.05vw, 0.72rem);
          letter-spacing: 0.04em; color: rgba(255,255,255,0.75); translate: -50% calc(-100% - 12px); transition: opacity 0.3s ease; opacity: 0; }
        .pmd-hud { position: absolute; left: 0.85rem; bottom: 0.7rem; display: flex; flex-direction: column; gap: 0.1rem; padding: 0.35rem 0.6rem;
          border-radius: 8px; pointer-events: none; font-variant-numeric: tabular-nums; }
        .pmd-hud-name { color: #fff; font-size: clamp(0.85rem, 1.8vw, 1.2rem); }
        .pmd-hud-size { color: rgba(255,255,255,0.7); font-size: clamp(0.6rem, 1.1vw, 0.8rem); }
        .pmd-controls { display: flex; align-items: center; gap: 0.5rem; }
        .pmd-round { flex: none; width: 34px; height: 34px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
        .pmd-round:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
        .pmd-round:disabled { opacity: 0.35; cursor: default; }
        .pmd-chips { flex: 1; display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center; }
        .pmd-chips button { padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: none;
          color: rgba(255,255,255,0.65); font-size: 0.78rem; cursor: pointer; }
        .pmd-chips button:hover { color: #fff; border-color: rgba(255,255,255,0.35); }
        .pmd-chips button.is-active { background: rgba(255,255,255,0.92); color: #111; border-color: transparent; }
        .pmd-info { border-left: 2px solid rgba(226,185,138,0.6); padding: 0.2rem 0 0.2rem 0.85rem; display: flex; flex-direction: column; gap: 0.35rem; }
        .pmd .pmd-fact { margin: 0; padding: 0; width: auto; max-width: none; font-size: 0.92rem; line-height: 1.5; color: rgba(255,255,255,0.8); text-align: left; }
        .pmd-stats { display: flex; flex-wrap: wrap; gap: 0.3rem 1.2rem; font-size: 0.82rem; color: rgba(255,255,255,0.6); font-variant-numeric: tabular-nums; }
        .pmd-stats b { color: #f3dcbc; font-weight: 500; }
        @media (max-width: 640px) {
          .pmd-chips button { padding: 0.25rem 0.55rem; font-size: 0.7rem; }
        }
      `}</style>
    </div>
  );
}
