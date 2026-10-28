import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { prepareScene } from '../lib/threeCore.js';
import { createGlowSprite, makeGlowTexture } from '../lib/glow.js';
import { applyEarthSurface, createAtmosphere } from '../lib/earthEffects.js';
import { createStarSurfaceMaterial } from '../black-hole-scale/shaders.js';
import {
  GALAXY_SPEED,
  KM_PER_AU,
  MOTIONS,
  SECONDS_PER_YEAR,
  UNITS,
  formatDistance,
  formatSpeed,
  spinSpeedAt,
} from './speedData.js';

/**
 * How fast Earth moves, one motion at a time, from its spin to the Milky Way's
 * motion through the universe.
 *
 * Four stages, each its own little scene in one canvas:
 * - Spin: Earth turning, with a marker at the viewer's chosen latitude.
 * - Orbit: a year around the Sun (sizes enlarged).
 * - Galaxy: the Sun moving at ~250 km/s with the planets around it. The paths
 *   are at true scale: the Sun covers ~52 AU a year, so the orbits stretch
 *   into long, gentle spirals.
 * - Cosmos: the Milky Way moving at ~560 km/s against the cosmic microwave
 *   background, which looks slightly hotter ahead and cooler behind (hugely
 *   exaggerated here; the real difference is about 0.1%).
 *
 * The counters below the view show how far each motion has carried you since
 * the page opened.
 */

const SPIN_SECONDS = 20; // one day on screen
const ORBIT_SECONDS = 12; // one year on screen
const GALAXY_SECONDS_PER_YEAR = 2.5;
const TRAIL_YEARS = 2.6; // how much of the planets' paths to draw behind the Sun
const AU_PER_YEAR = (GALAXY_SPEED * SECONDS_PER_YEAR) / KM_PER_AU;
const AXIAL_TILT = THREE.MathUtils.degToRad(23.44);
// The Sun's motion through the galaxy is about 60° from the planets' orbital
// plane, i.e. ~30° from the plane's axis.
const ORBIT_AXIS_TILT = THREE.MathUtils.degToRad(30);

const PLANETS = [
  { name: 'Mercury', au: 0.387, years: 0.241, color: 0xbfb8ad },
  { name: 'Venus', au: 0.723, years: 0.615, color: 0xe6c98f },
  { name: 'Earth', au: 1.0, years: 1.0, color: 0x6fb2ff },
  { name: 'Mars', au: 1.524, years: 1.881, color: 0xe08a5e },
  { name: 'Jupiter', au: 5.203, years: 11.86, color: 0xe2b98a },
];

const STAGE_CAMERAS = {
  spin: { pos: [0.5, 0.9, 4.3], look: [0, 0, 0], fov: 40, near: 0.01, far: 100 },
  orbit: { pos: [0, 1.35, 2.35], look: [0, -0.1, 0], fov: 40, near: 0.01, far: 100 },
  galaxy: { pos: [5, 2.6, 8.5], look: [-6, -2.2, -2.5], fov: 55, near: 0.1, far: 3000 },
  cosmos: { pos: [0, 22, 46], look: [0, -2, 0], fov: 45, near: 0.5, far: 5000 },
};

// Spiral of lines with fading colour, for trails: fills `positions` and
// `colors` from a list of points, brightest at the end.
const writeTrail = (geometry, points, color) => {
  const pos = geometry.attributes.position.array;
  const col = geometry.attributes.color.array;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    const f = (i / (n - 1)) ** 1.6;
    col[i * 3] = color.r * f;
    col[i * 3 + 1] = color.g * f;
    col[i * 3 + 2] = color.b * f;
  }
  geometry.setDrawRange(0, n);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
};

const CMB_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// The cosmic background: a dipole (bluer ahead, redder behind) over faint
// mottling like the real anisotropies.
const CMB_FRAGMENT = /* glsl */ `
  uniform vec3 uMotion;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec3 d = normalize(vDir);
    float m = noise(d * 7.0) * 0.6 + noise(d * 17.0) * 0.4;
    float dip = dot(d, uMotion);
    vec3 ahead = vec3(0.28, 0.45, 1.0);
    vec3 behind = vec3(1.0, 0.42, 0.22);
    vec3 col = mix(behind, ahead, 0.5 + 0.5 * dip);
    float glow = 0.07 + 0.09 * abs(dip);
    gl_FragColor = vec4(col * glow * (0.55 + 0.9 * m), 1.0);
  }
`;

export default function EarthSpeed({ id = 'earth-speed', aspect = '16 / 9', dprCap = 1.5 }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRefs = useRef({});
  const [stage, setStage] = useState(0);
  const [latitude, setLatitude] = useState(40);
  const [unit, setUnit] = useState('kmh');
  const [elapsed, setElapsed] = useState(0);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const latitudeRef = useRef(latitude);
  latitudeRef.current = latitude;

  // Seconds since the page opened, for the distance counters.
  useEffect(() => {
    const t0 = performance.now();
    const timer = setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 100);
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

    const disposables = [];
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
    const trailLine = (count) => {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      const line = new THREE.Line(geo, track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      line.frustumCulled = false;
      return line;
    };
    const sunSphere = (r) => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(track(new THREE.SphereGeometry(r, 64, 32)), track(createStarSurfaceMaterial({ deep: 0xd4561a, bright: 0xfff1c8, limb: 0.9 })));
      const inner = createGlowSprite(glowTexture, { color: 0xffd9a0, scale: r * 2.8, opacity: 0.5 });
      const outer = createGlowSprite(glowTexture, { color: 0xffd9a0, scale: r * 5.5, opacity: 0.12 });
      track(inner.material, outer.material);
      group.add(outer, inner, body);
      return group;
    };
    const stages = {};

    // ---------- Spin ----------
    {
      const group = new THREE.Group();
      // From the left, so the glint sits near the limb and city lights show on the right.
      const lightDir = new THREE.Vector3(-0.9, 0.22, 0.38).normalize(); // world
      const lightDirView = new THREE.Vector3();
      const light = new THREE.DirectionalLight(0xffffff, 3);
      light.position.copy(lightDir).multiplyScalar(10);
      const tilt = new THREE.Group();
      tilt.rotation.z = -AXIAL_TILT;
      const spin = new THREE.Group();
      const material = track(new THREE.MeshStandardMaterial({
        map: loadTexture('/textures/earth_daytime_texture.webp'),
        roughness: 0.85,
        metalness: 0,
        emissive: 0xffffff,
        emissiveIntensity: 0,
      }));
      applyEarthSurface(material, { nightMap: loadTexture('/textures/earth_nighttime_texture.webp'), lightDirView });
      // A rougher ocean than the shared default: a softer glint, not a hot spot at this size.
      const withEarthSurface = material.onBeforeCompile;
      material.onBeforeCompile = (shader, r) => {
        withEarthSurface(shader, r);
        shader.fragmentShader = shader.fragmentShader.replace('mix(roughnessFactor, 0.38, ocean)', 'mix(roughnessFactor, 0.72, ocean)');
      };
      const earth = new THREE.Mesh(track(new THREE.SphereGeometry(1, 128, 64)), material);
      spin.add(earth);
      // The marker sits on the spinning surface; its circle of latitude does not spin.
      const marker = new THREE.Group();
      const dot = new THREE.Mesh(track(new THREE.SphereGeometry(0.018, 16, 8)), track(new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false })));
      const halo = createGlowSprite(glowTexture, { color: 0xffd36a, scale: 0.14, opacity: 0.9 });
      track(halo.material);
      marker.add(halo, dot);
      spin.add(marker);
      const ringGeo = track(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, i) => {
        const t = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
      })));
      const ring = new THREE.Line(ringGeo, track(new THREE.LineBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.55 })));
      const axisGeo = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.35, 0), new THREE.Vector3(0, 1.35, 0)]));
      const axis = new THREE.Line(axisGeo, track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 })));
      tilt.add(spin, ring, axis);
      const atmosphere = createAtmosphere({ radius: 1, lightDirView, strength: 0.85 });
      disposables.push({ dispose: atmosphere.dispose });
      group.add(light, new THREE.AmbientLight(0xffffff, 0.03), tilt, atmosphere.group);
      const markerWorld = new THREE.Vector3();
      const toCamera = new THREE.Vector3();
      stages.spin = {
        group,
        update: (t) => {
          const lat = THREE.MathUtils.degToRad(latitudeRef.current);
          marker.position.set(Math.cos(lat) * 1.004, Math.sin(lat) * 1.004, 0);
          ring.position.y = Math.sin(lat) * 1.002;
          ring.scale.setScalar(Math.max(Math.cos(lat) * 1.002, 0.001));
          ring.visible = latitudeRef.current < 89.5;
          spin.rotation.y = (t / SPIN_SECONDS) * Math.PI * 2 - 1.4;
          lightDirView.copy(lightDir).transformDirection(camera.matrixWorldInverse);
          marker.getWorldPosition(markerWorld);
          toCamera.copy(camera.position).sub(markerWorld);
          const facing = markerWorld.clone().normalize().dot(toCamera.normalize()) > 0.05;
          return [{ key: 'you', pos: markerWorld, show: facing }];
        },
      };
    }

    // ---------- Orbit ----------
    {
      const group = new THREE.Group();
      const sun = sunSphere(0.11);
      const light = new THREE.PointLight(0xffffff, 3, 0, 0);
      const earth = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.045, 48, 24)),
        track(new THREE.MeshStandardMaterial({ map: loadTexture('/textures/earth_daytime_texture.webp'), roughness: 0.9, metalness: 0 })),
      );
      const orbitGeo = track(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 257 }, (_, i) => {
        const t = (i / 256) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
      })));
      const orbitLine = new THREE.Line(orbitGeo, track(new THREE.LineBasicMaterial({ color: 0x6fb2ff, transparent: true, opacity: 0.22 })));
      const trail = trailLine(120);
      const earthGlow = createGlowSprite(glowTexture, { color: 0x6fb2ff, scale: 0.22, opacity: 0.6 });
      track(earthGlow.material);
      group.add(sun, light, new THREE.AmbientLight(0xffffff, 0.05), earth, earthGlow, orbitLine, trail);
      const trailColor = new THREE.Color(0x8fc3ff).multiplyScalar(1.6);
      const pts = Array.from({ length: 120 }, () => new THREE.Vector3());
      const sunPos = new THREE.Vector3();
      stages.orbit = {
        group,
        update: (t) => {
          const angle = -(t / ORBIT_SECONDS) * Math.PI * 2; // anticlockwise seen from the north
          earth.position.set(Math.cos(angle), 0, Math.sin(angle));
          earth.rotation.y += 0.05;
          earthGlow.position.copy(earth.position);
          pts.forEach((p, i) => {
            const a = angle + (1 - i / (pts.length - 1)) * Math.PI * 0.5;
            p.set(Math.cos(a), 0, Math.sin(a));
          });
          writeTrail(trail.geometry, pts, trailColor);
          return [
            { key: 'sun', pos: sunPos, show: true },
            { key: 'earth', pos: earth.position, show: true },
          ];
        },
      };
    }

    // ---------- Galaxy: the Sun's motion, at true scale ----------
    {
      const group = new THREE.Group();
      const sunGlow = createGlowSprite(glowTexture, { color: 0xffe2b0, scale: 1.6, opacity: 0.95 });
      const sunHalo = createGlowSprite(glowTexture, { color: 0xffd9a0, scale: 4.5, opacity: 0.18 });
      track(sunGlow.material, sunHalo.material);
      group.add(sunHalo, sunGlow);
      // The orbital plane's axis, tilted from the direction of travel (+x).
      const axisN = new THREE.Vector3(Math.cos(ORBIT_AXIS_TILT), 0, Math.sin(ORBIT_AXIS_TILT));
      const e1 = new THREE.Vector3(0, 1, 0);
      const e2 = new THREE.Vector3().crossVectors(axisN, e1);
      const samples = 900;
      const planets = PLANETS.map((p) => {
        const trail = trailLine(samples);
        const color = new THREE.Color(p.color);
        const dot = createGlowSprite(glowTexture, { color, scale: p.name === 'Jupiter' ? 1.1 : 0.7, opacity: 1 });
        track(dot.material);
        group.add(trail, dot);
        return { ...p, trail, dot, color, pts: Array.from({ length: samples }, () => new THREE.Vector3()) };
      });
      // The Sun's path, with a tick every 10 AU.
      const pathGeo = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-AU_PER_YEAR * TRAIL_YEARS, 0, 0)]));
      const path = new THREE.Line(pathGeo, track(new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.3 })));
      const tickPts = [];
      for (let x = 10; x < AU_PER_YEAR * TRAIL_YEARS; x += 10) tickPts.push(new THREE.Vector3(-x, -0.6, 0), new THREE.Vector3(-x, 0.6, 0));
      const ticks = new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(tickPts)), track(new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.3 })));
      group.add(path, ticks);
      const orbitPos = (p, years, out) => {
        const a = (years / p.years) * Math.PI * 2;
        return out.copy(e1).multiplyScalar(Math.cos(a) * p.au).addScaledVector(e2, Math.sin(a) * p.au);
      };
      const sunPos = new THREE.Vector3();
      const ahead = new THREE.Vector3(2.4, 1.7, 0);
      stages.galaxy = {
        group,
        update: (t) => {
          const years = t / GALAXY_SECONDS_PER_YEAR;
          const labels = [{ key: 'gsun', pos: sunPos, show: true }, { key: 'ahead', pos: ahead, show: true }];
          planets.forEach((p) => {
            // Sun-centred frame: earlier positions fall behind by the distance travelled since.
            p.pts.forEach((pt, i) => {
              const back = TRAIL_YEARS * (1 - i / (samples - 1));
              orbitPos(p, years - back, pt);
              pt.x -= back * AU_PER_YEAR;
            });
            writeTrail(p.trail.geometry, p.pts, p.color);
            p.dot.position.copy(p.pts[samples - 1]);
            if (p.name === 'Earth' || p.name === 'Jupiter') labels.push({ key: `g${p.name}`, pos: p.dot.position, show: true });
          });
          return labels;
        },
      };
    }

    // ---------- Cosmos: the Milky Way against the cosmic background ----------
    {
      const group = new THREE.Group();
      // Direction of motion on screen: up and to the right, clear of the readout.
      const motion = new THREE.Vector3(0.8, 0.3, -0.5).normalize();
      const cmb = new THREE.Mesh(
        track(new THREE.SphereGeometry(2000, 64, 32)),
        track(new THREE.ShaderMaterial({ vertexShader: CMB_VERTEX, fragmentShader: CMB_FRAGMENT, uniforms: { uMotion: { value: motion } }, side: THREE.BackSide, depthWrite: false })),
      );
      // A simple Milky Way: bulge plus two main arms, as glowing points.
      const count = 26000;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      let seed = 3;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
      const warm = new THREE.Color(0xffe0b8);
      const cool = new THREE.Color(0x9fbfff);
      const c = new THREE.Color();
      for (let i = 0; i < count; i += 1) {
        let x;
        let y;
        let z;
        let r;
        if (i < count * 0.22) {
          r = Math.abs(gauss()) * 2.2;
          const th = rand() * Math.PI * 2;
          const ph = Math.acos(2 * rand() - 1);
          x = r * Math.sin(ph) * Math.cos(th);
          z = r * Math.sin(ph) * Math.sin(th);
          y = r * Math.cos(ph) * 0.55;
        } else {
          r = 2 + (-Math.log(rand() + 1e-9)) * 4.2;
          const arm = Math.floor(rand() * 2) * Math.PI;
          const th = arm + Math.log(r / 2) / 0.26 + gauss() * 0.28;
          x = r * Math.cos(th) + gauss() * 0.4;
          z = r * Math.sin(th) + gauss() * 0.4;
          y = gauss() * 0.22;
        }
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        c.copy(warm).lerp(cool, Math.min(1, r / 9));
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      const mwGeo = track(new THREE.BufferGeometry());
      mwGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      mwGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const milkyWay = new THREE.Points(mwGeo, track(new THREE.PointsMaterial({
        size: 0.32, map: glowTexture, vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
      })));
      const tiltGroup = new THREE.Group();
      tiltGroup.rotation.set(0.35, 0, 0.18);
      tiltGroup.add(milkyWay);
      // Faint specks drifting past the other way, to show the motion.
      const specks = 700;
      const speckPos = new Float32Array(specks * 3);
      const spread = 90;
      for (let i = 0; i < specks * 3; i += 1) speckPos[i] = (rand() - 0.5) * spread * 2;
      const speckGeo = track(new THREE.BufferGeometry());
      speckGeo.setAttribute('position', new THREE.BufferAttribute(speckPos, 3));
      const speckPoints = new THREE.Points(speckGeo, track(new THREE.PointsMaterial({ size: 0.25, color: 0xaab4cc, transparent: true, opacity: 0.5, depthWrite: false })));
      speckPoints.frustumCulled = false;
      // Arrow showing the direction of motion.
      const arrowEnd = motion.clone().multiplyScalar(26);
      const arrowGeo = track(new THREE.BufferGeometry().setFromPoints([motion.clone().multiplyScalar(17), arrowEnd]));
      const arrow = new THREE.Line(arrowGeo, track(new THREE.LineBasicMaterial({ color: 0xbcd0ff, transparent: true, opacity: 0.7 })));
      const head = new THREE.Mesh(track(new THREE.ConeGeometry(0.7, 2, 16)), track(new THREE.MeshBasicMaterial({ color: 0xbcd0ff, transparent: true, opacity: 0.8 })));
      head.position.copy(arrowEnd);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), motion);
      group.add(cmb, tiltGroup, speckPoints, arrow, head);
      const centre = new THREE.Vector3();
      const labelAhead = motion.clone().multiplyScalar(31);
      let last = 0;
      stages.cosmos = {
        group,
        update: (t) => {
          const dt = Math.min(0.1, Math.max(0, t - last));
          last = t;
          milkyWay.rotation.y -= dt * 0.02;
          const arr = speckGeo.attributes.position.array;
          for (let i = 0; i < specks; i += 1) {
            for (let k = 0; k < 3; k += 1) {
              const v = arr[i * 3 + k] - motion.getComponent(k) * dt * 9;
              arr[i * 3 + k] = v < -spread ? v + spread * 2 : v > spread ? v - spread * 2 : v;
            }
          }
          speckGeo.attributes.position.needsUpdate = true;
          return [
            { key: 'mw', pos: centre, show: true },
            { key: 'hydra', pos: labelAhead, show: true },
          ];
        },
      };
    }

    Object.values(stages).forEach((s) => scene.add(s.group));

    // ---------- Frame ----------
    const projected = new THREE.Vector3();
    let shownStage = -1;
    const t0 = performance.now();
    const animate = () => {
      const t = (performance.now() - t0) / 1000;
      const key = MOTIONS[stageRef.current].key;
      if (shownStage !== stageRef.current) {
        shownStage = stageRef.current;
        const cam = STAGE_CAMERAS[key];
        camera.position.set(...cam.pos);
        camera.fov = cam.fov;
        camera.near = cam.near;
        camera.far = cam.far;
        camera.updateProjectionMatrix();
        camera.lookAt(...cam.look);
        camera.updateMatrixWorld();
        Object.entries(stages).forEach(([k, s]) => { s.group.visible = k === key; });
      }
      const labels = stages[key].update(t);
      const w = container.clientWidth;
      const h = container.clientHeight;
      const shown = new Set();
      labels.forEach(({ key: lk, pos, show }) => {
        const el = labelRefs.current[lk];
        if (!el) return;
        projected.copy(pos).project(camera);
        const visible = show && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
        if (!visible) return;
        shown.add(lk);
        el.style.transform = `translate(${((projected.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((0.5 - projected.y * 0.5) * h).toFixed(1)}px)`;
      });
      Object.entries(labelRefs.current).forEach(([lk, el]) => {
        if (el) el.style.opacity = shown.has(lk) ? '1' : '0';
      });
    };

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) start(animate);
      else stop();
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

  const motion = MOTIONS[stage];
  const stageSpeed = motion.key === 'spin' ? spinSpeedAt(latitude) : motion.speed;
  const goTo = (i) => setStage(Math.max(0, Math.min(MOTIONS.length - 1, i)));
  const setLabel = (key) => (el) => { labelRefs.current[key] = el; };

  return (
    <div className="esp" id={id}>
      <div className="esp-view" ref={containerRef} style={{ aspectRatio: aspect }}>
        <canvas ref={canvasRef} aria-label={`Earth's motion: ${motion.name}`} />
        <span ref={setLabel('you')} className="esp-label esp-label-you" aria-hidden="true">You · {latitude}°</span>
        <span ref={setLabel('sun')} className="esp-label esp-label-sun" aria-hidden="true">Sun</span>
        <span ref={setLabel('earth')} className="esp-label esp-label-earth" aria-hidden="true">Earth</span>
        <span ref={setLabel('gsun')} className="esp-label esp-label-sun" aria-hidden="true">Sun</span>
        <span ref={setLabel('gEarth')} className="esp-label esp-label-earth" aria-hidden="true">Earth</span>
        <span ref={setLabel('gJupiter')} className="esp-label esp-label-jupiter" aria-hidden="true">Jupiter</span>
        <span ref={setLabel('ahead')} className="esp-label esp-label-dir" aria-hidden="true">Towards Cygnus →</span>
        <span ref={setLabel('mw')} className="esp-label esp-label-mw" aria-hidden="true">Milky Way</span>
        <span ref={setLabel('hydra')} className="esp-label esp-label-dir" aria-hidden="true">Towards Hydra</span>
        <div className="esp-hud" aria-live="polite">
          <span className="esp-hud-name">{motion.name}</span>
          <span className="esp-hud-speed">{formatSpeed(stageSpeed, unit)}</span>
        </div>
        <div className="esp-time" aria-hidden="true">{motion.timeLabel}</div>
      </div>

      <div className="esp-controls">
        <button type="button" className="esp-round" onClick={() => goTo(stage - 1)} disabled={stage === 0} aria-label="Previous motion">
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <div className="esp-chips" role="tablist" aria-label="Motions">
          {MOTIONS.map((m, i) => (
            <button key={m.key} type="button" role="tab" aria-selected={i === stage} className={i === stage ? 'is-active' : ''} onClick={() => goTo(i)}>
              {m.short}
            </button>
          ))}
        </div>
        <button type="button" className="esp-round" onClick={() => goTo(stage + 1)} disabled={stage === MOTIONS.length - 1} aria-label="Next motion">
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="esp-info">
        <p className="esp-fact">{motion.fact}</p>
        {motion.key === 'spin' && (
          <label className="esp-lat">
            <span>Your latitude <b>{latitude}°</b></span>
            <input type="range" min={0} max={90} step={1} value={latitude} onChange={(e) => setLatitude(Number(e.target.value))} aria-label="Your latitude in degrees" />
          </label>
        )}
        <div className="esp-table" role="table" aria-label="Earth's speeds and distance travelled since you opened this page">
          <div className="esp-row esp-row-head" role="row">
            <span role="columnheader">Motion</span>
            <span role="columnheader">Speed</span>
            <span role="columnheader">Since you opened this page</span>
          </div>
          {MOTIONS.map((m, i) => {
            const speed = m.key === 'spin' ? spinSpeedAt(latitude) : m.speed;
            return (
              <button key={m.key} type="button" role="row" className={`esp-row${i === stage ? ' is-active' : ''}`} onClick={() => goTo(i)}>
                <span role="cell">{m.short}</span>
                <span role="cell">{formatSpeed(speed, unit)}</span>
                <span role="cell">{formatDistance(speed * elapsed, unit)}</span>
              </button>
            );
          })}
        </div>
        <div className="esp-units" role="radiogroup" aria-label="Units">
          {Object.entries(UNITS).map(([k, u]) => (
            <button key={k} type="button" role="radio" aria-checked={unit === k} className={unit === k ? 'is-active' : ''} onClick={() => setUnit(k)}>
              {u.label}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .esp { width: 100%; display: flex; flex-direction: column; gap: 0.8rem; }
        .esp-view { position: relative; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden; background: #000; }
        .esp-view canvas { width: 100%; height: 100%; display: block; }
        .esp-label { position: absolute; top: 0; left: 0; white-space: nowrap; pointer-events: none; font-size: clamp(0.55rem, 1.05vw, 0.72rem);
          letter-spacing: 0.06em; transition: opacity 0.25s ease; opacity: 0; will-change: transform; translate: -50% calc(-100% - 10px);
          padding: 0.1rem 0.4rem; border-radius: 999px; background: rgba(0,0,0,0.45); }
        .esp-label-you { color: #ffe08a; }
        .esp-label-sun { color: #ffd9a0; translate: -50% calc(-100% - 28px); }
        .esp-label-earth { color: #9fcbff; }
        .esp-label-jupiter { color: #e2b98a; }
        .esp-label-mw { color: #e4ebff; translate: -50% calc(-100% - 40px); }
        .esp-label-dir { color: #bcd0ff; translate: -50% -50%; background: none; }
        .esp-hud { position: absolute; left: 0.85rem; top: 0.7rem; display: flex; flex-direction: column; gap: 0.1rem; padding: 0.35rem 0.6rem;
          border-radius: 8px; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); pointer-events: none; font-variant-numeric: tabular-nums; }
        .esp-hud-name { color: rgba(255,255,255,0.65); font-size: clamp(0.6rem, 1.1vw, 0.78rem); }
        .esp-hud-speed { color: #fff; font-size: clamp(0.9rem, 2vw, 1.35rem); }
        .esp-time { position: absolute; left: 0.9rem; bottom: 0.7rem; right: 0.9rem; font-size: clamp(0.55rem, 1vw, 0.7rem); color: rgba(255,255,255,0.5); pointer-events: none; }
        .esp-controls { display: flex; align-items: center; gap: 0.5rem; }
        .esp-round { flex: none; width: 34px; height: 34px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
        .esp-round:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
        .esp-round:disabled { opacity: 0.35; cursor: default; }
        .esp-chips { flex: 1; display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center; }
        .esp-chips button, .esp-units button { padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: none;
          color: rgba(255,255,255,0.65); font-size: 0.78rem; cursor: pointer; }
        .esp-chips button:hover, .esp-units button:hover { color: #fff; border-color: rgba(255,255,255,0.35); }
        .esp-chips button.is-active, .esp-units button.is-active { background: rgba(255,255,255,0.92); color: #111; border-color: transparent; }
        .esp-info { display: flex; flex-direction: column; gap: 0.6rem; }
        .esp .esp-fact { margin: 0; padding: 0 0 0 0.85rem; border-left: 2px solid rgba(143,195,255,0.6); width: auto; max-width: none; font-size: 0.92rem; line-height: 1.5; color: rgba(255,255,255,0.8); text-align: left; }
        .esp-lat { display: flex; align-items: center; gap: 0.8rem; font-size: 0.85rem; color: rgba(255,255,255,0.7); }
        .esp-lat b { color: #ffe08a; font-weight: 500; font-variant-numeric: tabular-nums; }
        .esp-lat input { flex: 1; accent-color: #ffd36a; }
        .esp-table { display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; }
        .esp-row { display: grid; grid-template-columns: 1.1fr 1fr 1.3fr; gap: 0.6rem; padding: 0.45rem 0.75rem; background: none; border: none;
          border-top: 1px solid rgba(255,255,255,0.07); color: rgba(255,255,255,0.75); font-size: 0.85rem; text-align: left; cursor: pointer;
          font-variant-numeric: tabular-nums; font-family: inherit; }
        .esp-row:hover { background: rgba(255,255,255,0.04); }
        .esp-row.is-active { background: rgba(143,195,255,0.1); color: #fff; }
        .esp-row-head { border-top: none; cursor: default; color: rgba(255,255,255,0.45); font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; }
        .esp-row-head:hover { background: none; }
        .esp-units { display: flex; gap: 0.35rem; justify-content: flex-end; }
        @media (max-width: 640px) {
          .esp-chips button, .esp-units button { padding: 0.25rem 0.55rem; font-size: 0.7rem; }
          .esp-row { font-size: 0.75rem; gap: 0.4rem; padding: 0.4rem 0.55rem; }
          .esp-label-mw { translate: -50% calc(-100% - 22px); }
        }
      `}</style>
    </div>
  );
}
