import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { prepareScene, createTopDownOrthoCamera } from '../lib/threeCore.js';
import { createGlowSprite, makeGlowTexture } from '../lib/glow.js';
import { applyEarthSurface, createAtmosphere } from '../lib/earthEffects.js';
import { LENS_QUAD_SCALE, createBlackHoleMaterial, createStarSurfaceMaterial } from '../black-hole-scale/shaders.js';
import { OBJECTS, EVEREST_KM, NEUTRON_STAR, formatKm, neutronStarFacts } from './scaleData.js';

/**
 * A true-scale tour from a neutron star to the Sun.
 *
 * Every object sits at the centre, seen straight on; each stage zooms out to
 * the next one and the smaller objects stay as outlines inside it, so sizes
 * read directly against each other. Nothing is exaggerated: radii come from
 * scaleData.js, black holes at their Schwarzschild radius.
 *
 * The neutron star is a pulsar: two beams along its magnetic axis, tilted from
 * the spin axis, sweep around as it turns (slowed down enormously; real
 * pulsars spin up to hundreds of times a second). Mount Everest stands beside
 * it to scale on the first stage.
 */

const TOUR_SECONDS = 4.5; // per stage while the tour plays
const BACKGROUND_LAYER = 1; // the star field, rendered separately for lensing
const SPIN_SECONDS = 5; // one pulsar turn on screen
const MAGNETIC_TILT = THREE.MathUtils.degToRad(35);
const BEAM_LENGTH = 7; // in neutron star radii
const BEAM_HALF_ANGLE = THREE.MathUtils.degToRad(11);
const CAMERA_Z = 3e6; // km; everything sits at z ≈ 0
// Towards the light (view space = world space for this fixed camera): front
// left, so the Moon and Earth show a lit face with a visible terminator.
const LIGHT_DIR = new THREE.Vector3(-0.62, 0.32, 0.72).normalize();

const NS_R = NEUTRON_STAR.radiusKm;
const EVEREST_PEAK_X = NS_R + EVEREST_KM * 1.1; // peak's distance from the neutron star's centre

// Half-height of the view for a stage: the object fills about two thirds of it.
const stageExtent = (index) => {
  const { key, radiusKm: r } = OBJECTS[index];
  if (key === 'neutron') return r * 2.3; // room for the beams and Mount Everest
  if (key === 'sun') return r * 1.7;
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

// Pulsar beam: a hollow cone from the star's centre, brightest along its axis
// (where we look through the most of it) and fading with distance.
const BEAM_VERTEX = /* glsl */ `
  uniform float uLength;
  varying float vT;
  varying float vFacing;
  void main() {
    vT = position.y / uLength;
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(n.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vT;
  varying float vFacing;
  void main() {
    // Starts just outside the surface (at 1/BEAM_LENGTH of the way out).
    float along = pow(1.0 - clamp(vT, 0.0, 1.0), 1.6) * smoothstep(0.15, 0.3, vT);
    float a = along * pow(vFacing, 1.4) * uOpacity;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

// Dipole field line r = L sin²θ, in the plane at azimuth `phi` around the
// magnetic axis (+y), from the star's surface out and back.
const fieldLinePoints = (L, phi, radius) => {
  const pts = [];
  const th0 = Math.asin(Math.sqrt(radius / L));
  const n = 64;
  for (let i = 0; i <= n; i += 1) {
    const th = th0 + ((Math.PI - 2 * th0) * i) / n;
    const r = L * Math.sin(th) ** 2;
    const x = r * Math.sin(th);
    pts.push(new THREE.Vector3(x * Math.cos(phi), r * Math.cos(th), x * Math.sin(phi)));
  }
  return pts;
};

export default function NeutronStarScale({ id = 'neutron-star-scale', aspect = '16 / 9', dprCap = 1.5 }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const outlineLabelRefs = useRef([]);
  const everestLabelRef = useRef(null);
  const scaleBarRef = useRef(null);
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    // Background render target the black hole samples for lensing; sized to
    // the drawing buffer on each frame.
    const backgroundTarget = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.LinearSRGBColorSpace });
    const bufferSize = new THREE.Vector2();
    let lensing = false; // true while the black hole is on screen

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
          position: [0, 0, CAMERA_Z],
          up: [0, 1, 0],
          lookAt: [0, 0, 0],
          near: 1,
          far: CAMERA_Z * 2,
        });
        return camHandle;
      },
      // Two passes when the black hole is on screen: the star field alone into
      // the background target, then the full scene (whose black hole samples it).
      renderOverride: ({ renderer, scene: s, camera }) => {
        if (lensing) {
          renderer.getDrawingBufferSize(bufferSize);
          if (backgroundTarget.width !== bufferSize.x || backgroundTarget.height !== bufferSize.y) {
            backgroundTarget.setSize(bufferSize.x, bufferSize.y);
          }
          camera.layers.set(BACKGROUND_LAYER);
          renderer.setRenderTarget(backgroundTarget);
          renderer.clear();
          renderer.render(s, camera);
          renderer.setRenderTarget(null);
          camera.layers.set(0);
        }
        renderer.render(s, camera);
      },
    });
    const { scene, camera, renderer, textureLoader, start, stop, dispose: disposeCore } = core;

    const disposables = [backgroundTarget];
    const track = (...items) => {
      disposables.push(...items);
      return items[0];
    };
    const glowTexture = track(makeGlowTexture());
    const loadTexture = (url) => {
      const tex = track(textureLoader.load(url));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return tex;
    };

    // Light for the Moon and Earth (the stars and the black hole are unlit).
    const sunLight = new THREE.DirectionalLight(0xffffff, 3);
    sunLight.position.copy(LIGHT_DIR).multiplyScalar(CAMERA_Z);
    scene.add(sunLight, new THREE.AmbientLight(0xffffff, 0.04));

    const lineLoop = (radius, color, opacity, order) => {
      const geo = track(new THREE.BufferGeometry().setFromPoints(circlePoints(radius)));
      const mat = track(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
      const line = new THREE.LineLoop(geo, mat);
      line.position.z = CAMERA_Z * 0.5; // in front of every sphere
      line.renderOrder = order;
      scene.add(line);
      return line;
    };

    // ---------- Star field (only behind the black hole, where it is lensed) ----------
    const starsTexture = loadTexture('/textures/stars_texture.webp');
    starsTexture.wrapS = starsTexture.wrapT = THREE.RepeatWrapping;
    const starsMat = track(new THREE.MeshBasicMaterial({ map: starsTexture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    starsMat.color.setScalar(0.9);
    const stars = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), starsMat);
    stars.position.z = -CAMERA_Z * 0.5; // far behind everything
    stars.layers.enable(BACKGROUND_LAYER);
    stars.renderOrder = -1;
    scene.add(stars);

    // A plain glowing sphere with a soft glow around it.
    const glowingSphere = (r, { deep, bright, limb, glow, glowScale = [2.4, 4.6], glowOpacity = [0.5, 0.12] }) => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(track(new THREE.SphereGeometry(r, 96, 48)), track(createStarSurfaceMaterial({ deep, bright, limb })));
      body.renderOrder = 1;
      const inner = createGlowSprite(glowTexture, { color: glow, scale: r * glowScale[0], opacity: glowOpacity[0] });
      const outer = createGlowSprite(glowTexture, { color: glow, scale: r * glowScale[1], opacity: glowOpacity[1] });
      track(inner.material, outer.material);
      group.add(outer, inner, body);
      return group;
    };

    // ---------- Objects ----------
    // Each has a filled look (when it is the current stage) and an outline at
    // its true radius (when a bigger object is on screen).
    let pulsar = null;
    let earthBody = null;
    let blackHoleMaterial = null;
    const objects = OBJECTS.map((obj) => {
      const r = obj.radiusKm;
      let fill;
      let outlineColor;
      if (obj.kind === 'neutron') {
        // Hot (about a million degrees at the surface), so blue-white.
        fill = glowingSphere(r, { deep: 0x22379a, bright: 0xdde6ff, limb: 1.3, glow: new THREE.Color(0x8faaff), glowOpacity: [0.45, 0.12] });
        // Beams and field lines turn with the magnetic axis, which is tilted
        // from the spin axis (+y) and carried around it.
        const spin = new THREE.Group();
        const magnetic = new THREE.Group();
        magnetic.rotation.z = MAGNETIC_TILT;
        const length = r * BEAM_LENGTH;
        const beamGeo = track(new THREE.ConeGeometry(length * Math.tan(BEAM_HALF_ANGLE), length, 48, 1, true));
        beamGeo.translate(0, -length / 2, 0);
        beamGeo.rotateZ(Math.PI); // apex at the centre, opening along +y
        const beamMat = track(new THREE.ShaderMaterial({
          vertexShader: BEAM_VERTEX,
          fragmentShader: BEAM_FRAGMENT,
          uniforms: { uLength: { value: length }, uColor: { value: new THREE.Color(0xb8ccff) }, uOpacity: { value: 0.55 } },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }));
        const north = new THREE.Mesh(beamGeo, beamMat);
        const south = new THREE.Mesh(beamGeo, beamMat);
        south.rotation.z = Math.PI;
        north.renderOrder = south.renderOrder = 2;
        const fieldMat = track(new THREE.LineBasicMaterial({ color: 0x8fa8ff, transparent: true, opacity: 0.22, depthWrite: false }));
        [2.2, 3.4].forEach((L) => {
          for (let k = 0; k < 4; k += 1) {
            const geo = track(new THREE.BufferGeometry().setFromPoints(fieldLinePoints(L * r, (k / 4) * Math.PI * 2 + L, r)));
            magnetic.add(new THREE.Line(geo, fieldMat));
          }
        });
        magnetic.add(north, south);
        spin.add(magnetic);
        fill.add(spin);
        pulsar = spin;
        outlineColor = new THREE.Color(0xa9bfff);
      } else if (obj.kind === 'blackhole') {
        // One camera-facing quad; the shader draws the lensed sky, the event
        // horizon and the photon ring at its edge.
        fill = new THREE.Group();
        blackHoleMaterial = track(createBlackHoleMaterial(backgroundTarget.texture));
        const size = r * LENS_QUAD_SCALE * 2;
        const quad = new THREE.Mesh(track(new THREE.PlaneGeometry(size, size)), blackHoleMaterial);
        quad.renderOrder = 2;
        fill.add(quad);
        outlineColor = new THREE.Color(0xffc18a);
      } else if (obj.kind === 'moon') {
        fill = new THREE.Mesh(
          track(new THREE.SphereGeometry(r, 128, 64)),
          track(new THREE.MeshStandardMaterial({ map: loadTexture('/textures/moon_texture.webp'), roughness: 1, metalness: 0 })),
        );
        outlineColor = new THREE.Color(0xd6d2c8);
      } else if (obj.kind === 'whitedwarf') {
        fill = glowingSphere(r, { deep: 0x4a5fb0, bright: 0xf1f4ff, limb: 1.2, glow: new THREE.Color(0xc8d6ff), glowOpacity: [0.4, 0.1] });
        outlineColor = new THREE.Color(0xd8e2ff);
      } else if (obj.kind === 'earth') {
        fill = new THREE.Group();
        const material = track(new THREE.MeshStandardMaterial({
          map: loadTexture('/textures/earth_daytime_texture.webp'),
          roughness: 0.85,
          metalness: 0,
          emissive: 0xffffff,
          emissiveIntensity: 0,
        }));
        applyEarthSurface(material, { nightMap: loadTexture('/textures/earth_nighttime_texture.webp'), lightDirView: LIGHT_DIR });
        earthBody = new THREE.Mesh(track(new THREE.SphereGeometry(r, 128, 64)), material);
        earthBody.rotation.z = THREE.MathUtils.degToRad(23.4);
        const atmosphere = createAtmosphere({ radius: r, lightDirView: LIGHT_DIR, strength: 0.8 });
        disposables.push({ dispose: atmosphere.dispose });
        fill.add(earthBody, atmosphere.group);
        outlineColor = new THREE.Color(0x8fc3ff);
      } else {
        fill = glowingSphere(r, { deep: 0xd4561a, bright: 0xfff1c8, limb: 0.9, glow: new THREE.Color(0xffd9a0), glowScale: [2.7, 5], glowOpacity: [0.5, 0.12] });
        outlineColor = new THREE.Color(0xffd9a0);
      }
      scene.add(fill);
      const outline = lineLoop(r, outlineColor, 0.85, 5);
      return { obj, fill, outline };
    });

    // ---------- Mount Everest, beside the neutron star on the first stage ----------
    const everest = new THREE.Group();
    const h = EVEREST_KM;
    const profile = [[-0.85, 0], [-0.55, 0.3], [-0.38, 0.27], [-0.16, 0.7], [0, 1], [0.12, 0.84], [0.24, 0.9], [0.5, 0.42], [0.62, 0.46], [0.9, 0]];
    const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x * h, y * h)));
    const mountain = new THREE.Mesh(track(new THREE.ShapeGeometry(shape)), track(new THREE.MeshBasicMaterial({ color: 0x1c2433, toneMapped: false })));
    const ridge = new THREE.Line(
      track(new THREE.BufferGeometry().setFromPoints(profile.map(([x, y]) => new THREE.Vector3(x * h, y * h, 0)))),
      track(new THREE.LineBasicMaterial({ color: 0xc9d6ea, transparent: true, opacity: 0.8 })),
    );
    const ground = new THREE.Line(
      track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-EVEREST_KM * 1.6, 0, 0), new THREE.Vector3(EVEREST_KM * 1.6, 0, 0)])),
      track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })),
    );
    everest.add(mountain, ridge, ground);
    everest.position.set(EVEREST_PEAK_X, -NS_R, NS_R * 2); // standing level with the star's base, in front of its glow
    scene.add(everest);

    // ---------- Per-frame update ----------
    const projected = new THREE.Vector3();
    const toScreen = (x, y, w, hgt) => {
      projected.set(x, y, 0).project(camera);
      return [(projected.x * 0.5 + 0.5) * w, (0.5 - projected.y * 0.5) * hgt];
    };
    const placeLabels = (w, hgt, scale, current) => {
      // Smaller objects' labels, just above each outline. The one just before
      // the current object stays labelled even when it is tiny.
      objects.forEach(({ obj }, i) => {
        const el = outlineLabelRefs.current[i];
        if (!el) return;
        const rPx = obj.radiusKm * scale;
        const show = i < current && (rPx > 20 || i === current - 1);
        el.style.opacity = show ? '1' : '0';
        if (show) el.style.transform = `translate(${(w / 2).toFixed(1)}px, ${(hgt / 2 - rPx - 5).toFixed(1)}px)`;
      });

      const ev = everestLabelRef.current;
      if (ev) {
        ev.style.opacity = current === 0 ? '1' : '0';
        const [x, y] = toScreen(EVEREST_PEAK_X, -NS_R + EVEREST_KM, w, hgt);
        ev.style.transform = `translate(${x.toFixed(1)}px, ${(y - 6).toFixed(1)}px)`;
      }

      // Scale bar: a round distance about 110 px long.
      const bar = scaleBarRef.current;
      if (bar) {
        const km = niceNumber(110 / scale);
        bar.style.setProperty('--bar', `${(km * scale).toFixed(1)}px`);
        bar.querySelector('span').textContent = km >= 1e6 ? `${(km / 1e6).toLocaleString('en-US')} million km` : `${km.toLocaleString('en-US')} km`;
      }
    };

    let last = performance.now();
    let starsOpacity = 0;
    const animate = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = stageRef.current;
      const currentObj = OBJECTS[current];

      // Ease the zoom in log space so each order of magnitude takes equal time.
      const target = stageExtent(current);
      const k = 1 - Math.exp(-dt * 3.2);
      extent = Math.exp(Math.log(extent) + (Math.log(target) - Math.log(extent)) * k);
      const w = container.clientWidth;
      const hgt = container.clientHeight;
      camHandle.onResize({ width: w, height: hgt });
      camera.updateMatrixWorld();
      const scale = hgt / (2 * extent); // px per km
      const dpr = renderer.getPixelRatio();

      // Star field: fills the view at any zoom with constant star density, and
      // fades in only for the black hole.
      stars.scale.set(2 * extent * (w / hgt) * 1.1, 2 * extent * 1.1, 1);
      starsTexture.repeat.set((w * 1.1) / 900, (hgt * 1.1) / 900);
      const isHole = currentObj.kind === 'blackhole';
      starsOpacity += ((isHole ? 1 : 0) - starsOpacity) * (1 - Math.exp(-dt * 4));
      starsMat.opacity = starsOpacity;
      stars.visible = starsOpacity > 0.01;
      lensing = isHole;

      renderer.getDrawingBufferSize(bufferSize);
      objects.forEach(({ obj, fill, outline }, i) => {
        fill.visible = i === current;
        outline.visible = i < current;
        if (obj.kind === 'blackhole' && fill.visible) {
          const u = blackHoleMaterial.uniforms;
          u.uResolution.value.copy(bufferSize);
          u.uCenter.value.set(bufferSize.x / 2, bufferSize.y / 2);
          u.uHorizonPx.value = obj.radiusKm * scale * dpr;
          u.uDpr.value = dpr;
          u.uTime.value = now / 1000;
        }
      });
      everest.visible = current === 0;
      pulsar.rotation.y += (dt * Math.PI * 2) / SPIN_SECONDS;
      earthBody.rotation.y += dt * 0.08;

      placeLabels(w, hgt, scale, current);
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
  const ratio = obj.radiusKm / NS_R;
  const ratioText = ratio < 100 ? ratio.toFixed(1) : Math.round(ratio).toLocaleString('en-US');
  const facts = neutronStarFacts();

  return (
    <div className="nss" id={id}>
      <div className="nss-view" ref={containerRef} style={{ aspectRatio: aspect }}>
        <canvas ref={canvasRef} aria-label={`True-scale view of ${obj.name} compared with a neutron star`} />
        {OBJECTS.map((o, i) => (
          <span key={o.key} ref={(el) => (outlineLabelRefs.current[i] = el)} className="nss-outline-label" aria-hidden="true">
            {o.short}
          </span>
        ))}
        <span ref={everestLabelRef} className="nss-everest-label" aria-hidden="true">Mount Everest · 8.8 km</span>
        <div ref={scaleBarRef} className="nss-scale" aria-hidden="true">
          <i />
          <span />
        </div>
        <div className="nss-step" aria-hidden="true">{stage + 1} / {OBJECTS.length}</div>
      </div>

      <div className="nss-controls">
        <button type="button" className="nss-round" onClick={togglePlay} aria-label={playing ? 'Pause the tour' : 'Play the tour'} aria-pressed={playing}>
          {playing ? <Pause size={16} strokeWidth={1.8} /> : <Play size={16} strokeWidth={1.8} />}
        </button>
        <button type="button" className="nss-round" onClick={() => goTo(stage - 1)} disabled={stage === 0} aria-label="Previous object">
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <div className="nss-chips" role="tablist" aria-label="Objects">
          {OBJECTS.map((o, i) => (
            <button key={o.key} type="button" role="tab" aria-selected={i === stage} className={i === stage ? 'is-active' : ''} onClick={() => goTo(i)}>
              {o.short}
            </button>
          ))}
        </div>
        <button type="button" className="nss-round" onClick={() => goTo(stage + 1)} disabled={stage === OBJECTS.length - 1} aria-label="Next object">
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="nss-info" aria-live="polite">
        <div className="nss-info-head">
          <span className="nss-info-name">{obj.name}</span>
          <span className="nss-info-detail">{obj.detail}</span>
        </div>
        <div className="nss-info-size">
          {obj.kind === 'blackhole' ? 'Event horizon radius' : 'Radius'}: <b>{obj.kind === 'neutron' ? 'about 12 km' : formatKm(obj.radiusKm)}</b>
          {stage > 0 && <span className="nss-info-ratio"> · {ratioText} times the neutron star’s</span>}
        </div>
        <p className="nss-info-fact">{obj.fact}</p>
        {obj.kind === 'neutron' && (
          <div className="nss-facts">
            <span><b>{(facts.teaspoonTonnes / 1e9).toFixed(0)} billion tonnes</b> per teaspoon</span>
            <span><b>{(facts.surfaceGravityG / 1e9).toFixed(0)} billion g</b> surface gravity</span>
            <span><b>{Math.round(facts.escapeFractionC * 100)}%</b> of light speed to escape</span>
          </div>
        )}
        {obj.kind === 'neutron' && (
          <p className="nss-info-legend">The beams sweep around as it spins, like a lighthouse; this is what makes it a pulsar. Shown slowed down: real pulsars turn up to hundreds of times a second.</p>
        )}
        {obj.kind === 'blackhole' && (
          <p className="nss-info-legend">The dark disc is the event horizon, the black hole’s true size. Starlight behind it is bent around the disc.</p>
        )}
      </div>

      <style>{`
        .nss { width: 100%; display: flex; flex-direction: column; gap: 0.8rem; }
        .nss-view { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden; background: #000; }
        .nss-view canvas { width: 100%; height: 100%; display: block; }
        .nss-outline-label, .nss-everest-label { position: absolute; top: 0; left: 0; white-space: nowrap; pointer-events: none;
          font-size: clamp(0.55rem, 1.05vw, 0.72rem); letter-spacing: 0.08em; transition: opacity 0.25s ease; opacity: 0; will-change: transform;
          translate: -50% -100%; padding: 0.1rem 0.4rem; border-radius: 999px; background: rgba(0,0,0,0.5); }
        .nss-outline-label { color: #e4ebff; text-transform: uppercase; }
        .nss-everest-label { color: #c9d6ea; letter-spacing: 0.04em; }
        .nss-scale { position: absolute; left: 0.9rem; bottom: 0.7rem; display: flex; flex-direction: column; gap: 0.25rem; pointer-events: none; }
        .nss-scale i { display: block; width: var(--bar, 100px); height: 6px; border: 1px solid rgba(255,255,255,0.6); border-top: none; }
        .nss-scale span { font-size: clamp(0.55rem, 1vw, 0.7rem); color: rgba(255,255,255,0.65); font-variant-numeric: tabular-nums; }
        .nss-step { position: absolute; right: 0.9rem; top: 0.7rem; font-size: 0.7rem; letter-spacing: 0.08em; color: rgba(255,255,255,0.45); font-variant-numeric: tabular-nums; }
        .nss-controls { display: flex; align-items: center; gap: 0.5rem; }
        .nss-round { flex: none; width: 34px; height: 34px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
        .nss-round:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
        .nss-round:disabled { opacity: 0.35; cursor: default; }
        .nss-chips { flex: 1; display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center; }
        .nss-chips button { padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: none;
          color: rgba(255,255,255,0.65); font-size: 0.78rem; cursor: pointer; }
        .nss-chips button:hover { color: #fff; border-color: rgba(255,255,255,0.35); }
        .nss-chips button.is-active { background: rgba(255,255,255,0.92); color: #111; border-color: transparent; }
        .nss-info { border-left: 2px solid rgba(169,191,255,0.6); padding: 0.2rem 0 0.2rem 0.85rem; display: flex; flex-direction: column; gap: 0.3rem; }
        .nss-info-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.7rem; }
        .nss-info-name { font-size: 1.15rem; color: #fff; }
        .nss-info-detail { font-size: 0.85rem; color: rgba(255,255,255,0.55); }
        .nss-info-size { font-size: 0.9rem; color: rgba(255,255,255,0.75); font-variant-numeric: tabular-nums; }
        .nss-info-size b { color: #c9d6ff; font-weight: 500; }
        .nss-info-ratio { color: rgba(255,255,255,0.5); }
        .nss-facts { display: flex; flex-wrap: wrap; gap: 0.3rem 1.2rem; font-size: 0.82rem; color: rgba(255,255,255,0.6); }
        .nss-facts b { color: #c9d6ff; font-weight: 500; }
        .nss .nss-info-fact { margin: 0; padding: 0; width: auto; max-width: none; font-size: 0.92rem; line-height: 1.5; color: rgba(255,255,255,0.8); text-align: left; }
        .nss .nss-info-legend { margin: 0; padding: 0; width: auto; max-width: none; font-size: 0.8rem; line-height: 1.5; color: rgba(255,255,255,0.5); text-align: left; }
        @media (max-width: 640px) {
          .nss-chips button { padding: 0.25rem 0.55rem; font-size: 0.7rem; }
          .nss-step { display: none; }
        }
      `}</style>
    </div>
  );
}
