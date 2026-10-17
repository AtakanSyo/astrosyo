import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from '../lib/simStage.jsx';
import { prepareScene } from '../lib/threeCore.js';
import { createAtmosphereShell, createOrbitRing, createOrthoTopDownCamera, createStar } from '../lib/starSystemCore.js';
import {
  EARTH_RATE,
  MARS_RATE,
  apparentPosition,
  earthPosition,
  isRetrograde,
  marsPosition,
} from './retrograde.js';

/**
 * Why Mars seems to move backwards.
 *
 * The Solar System seen from above the north pole. Earth and Mars go round the
 * Sun counter-clockwise at their real periods and relative distances. A line
 * runs from Earth through Mars: our line of sight.
 *
 * The ring of stars is Earth's sky, so it is centred on Earth and travels with
 * it. (Real stars are so far away that Earth's motion doesn't shift them; a
 * ring centred on Earth keeps every direction correct even though it is drawn
 * close.) A dashed line continues the line of sight out to the ring, where
 * Mars's position against the stars leaves a trail. The trail turns red while
 * Mars is moving backwards (retrograde).
 *
 * Mars's orbit is tilted by 1.85°, so it also drifts a little north or south of
 * Earth's orbital plane. The trail is pushed outward or inward by that amount
 * (exaggerated), which is why the backward stretch opens into a small loop
 * instead of retracing the same line.
 *
 * Planet sizes are exaggerated, and the star ring is drawn far closer than any
 * real star.
 */

const DEG = Math.PI / 180;

// Scene sizes in world units (1 AU = AU units). Planet sizes are not to scale.
const AU = 4;
const SUN_RADIUS = 1.0;
const EARTH_RADIUS = 0.55;
const MARS_RADIUS = 0.42;
const MARS_ORBIT = 1.524 * AU;
// Earth-centred ring, just wider than Mars's farthest distance from Earth (2.52 AU).
const STAR_RING = 2.6 * AU;
const TRAIL_RADIUS = STAR_RING + 0.6;
const LAT_SCALE = 0.32; // world units per degree of Mars's apparent latitude
// The ring moves with Earth, so the view must fit Earth's orbit plus the ring and the trail's swing.
const VERTICAL_EXTENT = AU + TRAIL_RADIUS + 1.9;

const HISTORY_DAYS = 300; // trail length
const PREFILL_DAYS = 120; // trail already drawn when the page loads

const RETRO_COLOR = new THREE.Color(0xff6b4a);
const PRO_COLOR = new THREE.Color(0xffffff);

// Ecliptic (x, y) to world: x right, y "up" on screen (which is −z for a top-down camera).
const toWorld = (p, target) => target.set(p.x * AU, 0, -p.y * AU);

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function MarsRetrogradeSim({
  id = 'mars-retrograde',
  aspect = '4 / 3',
  dprCap = 1.5,
  showPause = true,
  daysPerSecond = 30,
  // About 120 days before an opposition, so the first loop comes a few seconds in.
  startEarthDeg = 310,
  startMarsDeg = 5,
  earthTextureUrl = '/textures/earth_daytime_texture.webp',
  marsTextureUrl = '/textures/mars_texture.webp',
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(true);
  const hasPlayedRef = useRef(false);
  const coreHandleRef = useRef(null);
  const [paused, setPaused] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  // Overlay elements are updated directly each frame instead of through React state.
  const sunLabelRef = useRef(null);
  const earthLabelRef = useRef(null);
  const marsLabelRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    let update = () => {};
    const core = prepareScene({
      canvas,
      container,
      background: 0x000000,
      dprCap,
      alpha: true,
      antialias: true,
      cameraFactory: () => {
        const base = createOrthoTopDownCamera({ extent: VERTICAL_EXTENT, height: 60, margin: 1 });
        return {
          camera: base.camera,
          onResize: (size) => {
            base.onResize(size);
            update();
          },
        };
      },
    });
    const { scene, camera, textureLoader, start, stop, renderOnce, dispose: disposeCore } = core;
    const renderIfPaused = () => {
      if (pausedRef.current) renderOnce();
    };

    // ---------- Sun and light ----------
    const sunEntry = createStar({ radius: SUN_RADIUS, color: 0xffd398, intensity: 3, glowStrength: 1.6 });
    sunEntry.light.decay = 0; // keep both orbits evenly lit
    scene.add(sunEntry.mesh);
    scene.add(new THREE.AmbientLight(0xffffff, 0.08));

    // ---------- Orbits ----------
    const earthOrbit = createOrbitRing({ radius: AU, segments: 256, dashSize: 0.35, gapSize: 0.3, opacity: 0.5 });
    const marsOrbit = createOrbitRing({ radius: MARS_ORBIT, segments: 256, dashSize: 0.35, gapSize: 0.3, opacity: 0.5 });
    scene.add(earthOrbit.line, marsOrbit.line);

    // ---------- Ring of distant stars (centred on Earth) ----------
    const rand = seededRandom(1877); // the year Schiaparelli mapped Mars's "canals"
    const ringCount = 420;
    const ringPositions = new Float32Array(ringCount * 3);
    for (let i = 0; i < ringCount; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = STAR_RING + (rand() - 0.5) * 0.8;
      ringPositions.set([Math.cos(a) * r, 0, -Math.sin(a) * r], i * 3);
    }
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3));
    const ringMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.55,
    });
    // Earth's sky: the star ring, the trail and the marker all ride along with Earth.
    const sky = new THREE.Group();
    scene.add(sky);
    sky.add(new THREE.Points(ringGeo, ringMat));

    // ---------- Earth and Mars ----------
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 48, 24);
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x4aa8ff, roughness: 0.6, metalness: 0 });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    const atmosphereEntry = createAtmosphereShell({ radius: EARTH_RADIUS * 1.06, color: 0x74d2ff, opacity: 0.2 });
    earthMesh.add(atmosphereEntry.mesh);
    scene.add(earthMesh);

    const marsGeo = new THREE.SphereGeometry(MARS_RADIUS, 48, 24);
    const marsMat = new THREE.MeshStandardMaterial({ color: 0xd0896d, roughness: 0.9, metalness: 0 });
    const marsMesh = new THREE.Mesh(marsGeo, marsMat);
    scene.add(marsMesh);

    const textures = [];
    const loadTexture = (url, material) => {
      if (!url) return;
      const texture = textureLoader.load(url, () => {
        texture.colorSpace = THREE.SRGBColorSpace;
        material.color.set(0xffffff);
        material.map = texture;
        material.needsUpdate = true;
        renderIfPaused();
      });
      textures.push(texture);
    };
    loadTexture(earthTextureUrl, earthMat);
    loadTexture(marsTextureUrl, marsMat);

    // ---------- Line of sight: Earth → Mars, continued (dashed) out to the star ring ----------
    const sightPositions = new Float32Array(6);
    const sightGeo = new THREE.BufferGeometry();
    sightGeo.setAttribute('position', new THREE.BufferAttribute(sightPositions, 3));
    const sightMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    scene.add(new THREE.Line(sightGeo, sightMat));

    const pointerPositions = new Float32Array(6);
    const pointerGeo = new THREE.BufferGeometry();
    pointerGeo.setAttribute('position', new THREE.BufferAttribute(pointerPositions, 3));
    const pointerMat = new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 0.25,
      gapSize: 0.2,
      transparent: true,
      opacity: 0.6,
    });
    const pointer = new THREE.Line(pointerGeo, pointerMat);
    scene.add(pointer);

    const hitGeo = new THREE.SphereGeometry(0.16, 16, 8);
    const hitMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    sky.add(hitMesh);

    // ---------- Trail of where Mars has appeared against the stars ----------
    const trailPositions = new Float32Array(HISTORY_DAYS * 3);
    const trailColors = new Float32Array(HISTORY_DAYS * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
    sky.add(new THREE.Line(trailGeo, trailMat));

    // ---------- State ----------
    const state = {
      earth: startEarthDeg * DEG,
      mars: startMarsDeg * DEG,
      trail: [], // { lon, lat, retro }: lon and lat in radians
      sinceSample: 0,
    };

    const refreshTrail = () => {
      const n = state.trail.length;
      const tmp = new THREE.Color();
      for (let i = 0; i < n; i += 1) {
        const p = state.trail[i];
        // Out- or inward offset by latitude turns the back-and-forth into a visible loop.
        const r = TRAIL_RADIUS + (p.lat / DEG) * LAT_SCALE;
        trailPositions.set([Math.cos(p.lon) * r, 0, -Math.sin(p.lon) * r], i * 3);
        // Older points fade toward black.
        tmp.copy(p.retro ? RETRO_COLOR : PRO_COLOR).multiplyScalar(0.15 + 0.85 * (i / Math.max(1, n - 1)));
        trailColors.set([tmp.r, tmp.g, tmp.b], i * 3);
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
      trailGeo.setDrawRange(0, n);
      trailGeo.computeBoundingSphere();
    };

    const sample = () => {
      const app = apparentPosition(state.earth, state.mars);
      state.trail.push({ lon: app.longitude, lat: app.latitude, retro: isRetrograde(state.earth, state.mars) });
      if (state.trail.length > HISTORY_DAYS) state.trail.shift();
    };

    // Pre-fill some history so the first frame already shows a trail.
    state.earth -= EARTH_RATE * PREFILL_DAYS;
    state.mars -= MARS_RATE * PREFILL_DAYS;
    for (let d = 0; d < PREFILL_DAYS; d += 1) {
      sample();
      state.earth += EARTH_RATE;
      state.mars += MARS_RATE;
    }
    sample();
    refreshTrail();

    // ---------- Per-frame update ----------
    const earthWorld = new THREE.Vector3();
    const marsWorld = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const origin = new THREE.Vector3();

    const placeLabel = (el, world, offsetPx) => {
      if (!el) return;
      projected.copy(world).project(camera);
      const left = ((projected.x + 1) / 2) * container.clientWidth;
      const top = ((1 - projected.y) / 2) * container.clientHeight + offsetPx;
      el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, -50%)`;
    };

    update = () => {
      const e = earthPosition(state.earth);
      const m = marsPosition(state.mars);
      toWorld(e, earthWorld);
      toWorld({ x: m.x, y: m.y }, marsWorld);
      earthMesh.position.copy(earthWorld);
      marsMesh.position.copy(marsWorld);

      // Line of sight: from Earth to Mars.
      const dx = marsWorld.x - earthWorld.x;
      const dz = marsWorld.z - earthWorld.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      sightPositions.set([earthWorld.x, 0, earthWorld.z, marsWorld.x, 0, marsWorld.z]);
      sightGeo.attributes.position.needsUpdate = true;
      sightGeo.computeBoundingSphere();

      // Continue it to Earth's star ring, which is centred on Earth.
      sky.position.copy(earthWorld);
      const hitX = ux * STAR_RING;
      const hitZ = uz * STAR_RING;
      pointerPositions.set([
        marsWorld.x + ux * (MARS_RADIUS + 0.2), 0, marsWorld.z + uz * (MARS_RADIUS + 0.2),
        earthWorld.x + hitX, 0, earthWorld.z + hitZ,
      ]);
      pointerGeo.attributes.position.needsUpdate = true;
      pointerGeo.computeBoundingSphere();
      pointer.computeLineDistances();
      hitMesh.position.set(hitX, 0, hitZ);

      const retro = isRetrograde(state.earth, state.mars);
      const color = retro ? RETRO_COLOR : PRO_COLOR;
      sightMat.color.copy(color);
      pointerMat.color.copy(color);
      hitMat.color.copy(color);

      const pxPerUnit = container.clientHeight / (2 * VERTICAL_EXTENT);
      placeLabel(sunLabelRef.current, origin, (SUN_RADIUS + 0.75) * pxPerUnit);
      placeLabel(earthLabelRef.current, earthWorld, (EARTH_RADIUS + 0.65) * pxPerUnit);
      placeLabel(marsLabelRef.current, marsWorld, (MARS_RADIUS + 0.65) * pxPerUnit);
    };

    const tick = (delta) => {
      if (pausedRef.current) return;
      const dt = Math.min(delta ?? 0, 0.05);
      const days = dt * daysPerSecond;
      state.earth += EARTH_RATE * days;
      state.mars += MARS_RATE * days;
      state.sinceSample += days;
      let sampled = false;
      while (state.sinceSample >= 1) {
        state.sinceSample -= 1;
        sample();
        sampled = true;
      }
      if (sampled) refreshTrail();
      // Spins are slowed right down; at true rate each planet would turn hundreds of times per lap.
      earthMesh.rotation.y += dt * 0.6;
      marsMesh.rotation.y += dt * 0.6;
      update();
    };

    update();
    coreHandleRef.current = { api: core, tick };
    if (pausedRef.current) {
      renderOnce();
    } else {
      start(tick);
    }

    return () => {
      stop();
      disposeCore();
      coreHandleRef.current = null;
      textures.forEach((texture) => texture.dispose());
      sunEntry.dispose();
      earthOrbit.geometry.dispose();
      earthOrbit.material.dispose();
      marsOrbit.geometry.dispose();
      marsOrbit.material.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      atmosphereEntry.geometry.dispose();
      atmosphereEntry.material.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      marsGeo.dispose();
      marsMat.dispose();
      sightGeo.dispose();
      sightMat.dispose();
      pointerGeo.dispose();
      pointerMat.dispose();
      hitGeo.dispose();
      hitMat.dispose();
      trailGeo.dispose();
      trailMat.dispose();
    };
  }, [daysPerSecond, dprCap, earthTextureUrl, marsTextureUrl, startEarthDeg, startMarsDeg]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const handle = coreHandleRef.current;
    if (!handle) return;
    if (paused) {
      handle.api.stop();
      handle.api.renderOnce();
    } else {
      handle.api.start(handle.tick);
    }
  }, [paused]);

  const onToggle = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    if (!pausedRef.current && !hasPlayedRef.current) {
      hasPlayedRef.current = true;
      setHasStarted(true);
      const el = containerRef.current?.closest('.sim-stage') ?? containerRef.current;
      if (el && !el.classList.contains('is-visible')) el.classList.add('is-visible');
    }
  };

  // The canvas fades in on first play (see simGlobal.css); the overlay follows it.
  const overlayStyle = {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    pointerEvents: 'none',
    opacity: hasStarted ? 1 : 0,
    transition: 'opacity 0.8s ease',
    color: '#fff',
  };
  const bodyLabelStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 'clamp(0.55rem, 1.2vw, 0.75rem)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.7)',
    whiteSpace: 'nowrap',
    willChange: 'transform',
  };

  return (
    <SimStage
      id={id}
      aspect={aspect}
      containerRef={containerRef}
      canvasRef={canvasRef}
      paused={paused}
      onToggle={onToggle}
      showPause={showPause}
      style={{ width: '100%', position: 'relative' }}
    >
      <div style={overlayStyle} aria-hidden="true">
        <span ref={sunLabelRef} style={bodyLabelStyle}>Sun</span>
        <span ref={earthLabelRef} style={bodyLabelStyle}>Earth</span>
        <span ref={marsLabelRef} style={bodyLabelStyle}>Mars</span>
      </div>
    </SimStage>
  );
}
