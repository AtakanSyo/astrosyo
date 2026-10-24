import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from '../lib/simStage.jsx';
import { prepareScene } from '../lib/threeCore.js';
import {
  createAtmosphereShell,
  createOrthoTopDownCamera,
  computeBinaryPositions,
  computeEllipticalPosition,
} from '../lib/starSystemCore.js';
import { createGlowSprite, makeGlowTexture } from '../lib/glow.js';

const EMPTY_OPTS = Object.freeze({});

const DEFAULT_BINARY = Object.freeze({
  separation: 8,
  binaryDays: 40,
  starA: {
    name: 'Helios',
    radius: 1.1,
    color: 0xffd398,
    intensity: 300,
    mass: 1,
  },
  starB: {
    name: 'Nyx',
    radius: 1.7,
    color: 0x7dc9ff,
    intensity: 400,
    mass: 0.65,
  },
  planet: {
    name: 'Eclipse',
    semiMajor: 18,
    eccentricity: 0.08,
    orbitDays: 220,
    rotationHours: 19,
    tiltDegrees: 9,
    radiusEarth: 1.2,
  },
});

export default function PTypeSystem({
  id = 'p-type-system',
  aspect = '3 / 2',
  showPause = true,
  dprCap = 1.5,
  options,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(true);
  const hasPlayedRef = useRef(false);
  const coreHandleRef = useRef(null);
  const [paused, setPaused] = useState(true);
  const opts = useMemo(() => options ?? EMPTY_OPTS, [options]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const merged = {
      separation: opts.separation ?? DEFAULT_BINARY.separation,
      binaryDays: opts.binaryDays ?? DEFAULT_BINARY.binaryDays,
      starA: { ...DEFAULT_BINARY.starA, ...(opts.starA ?? EMPTY_OPTS) },
      starB: { ...DEFAULT_BINARY.starB, ...(opts.starB ?? EMPTY_OPTS) },
      planet: { ...DEFAULT_BINARY.planet, ...(opts.planet ?? EMPTY_OPTS) },
    };

    const cfg = {
      backgroundColor: opts.backgroundColor ?? 0x000000,
      daysPerSecond: opts.daysPerSecond ?? 5,
      orbitSegments: opts.orbitSegments ?? 256,
      planetScale: opts.planetScale ?? 1.0,
      planetTexture: opts.planetTexture ?? '/textures/mars_texture.webp',
      atmosphereColor: opts.atmosphereColor ?? 0xff8a6a,
      ambientIntensity: opts.ambientIntensity ?? 0.06,
      starARadius: opts.starARadius ?? merged.starA.radius ?? 2.2,
      starBRadius: opts.starBRadius ?? merged.starB.radius ?? 1.7,
      trailSpan: opts.trailSpan ?? Math.PI * 0.6, // radians of orbit the planet's fading trail covers
      lightBoost: opts.lightBoost ?? 3, // scales the stars' light so it reaches the planet's orbit
      spinScale: opts.spinScale ?? 0.01, // slows the planet's day relative to its orbit, so the spin reads calmly
    };

    // Derived binary properties
    const totalMass = Math.max(1e-6, (merged.starA.mass ?? 1) + (merged.starB.mass ?? 1));
    const sep = Math.max(1, merged.separation ?? DEFAULT_BINARY.separation);
    const radiusA = (sep * (merged.starB.mass ?? 1)) / totalMass;
    const radiusB = (sep * (merged.starA.mass ?? 1)) / totalMass;

    const planetSemiMajor =
      opts.orbitSemiMajor ??
      merged.planet.semiMajor ??
      DEFAULT_BINARY.planet.semiMajor;
    const planetEcc = THREE.MathUtils.clamp(
      opts.orbitEccentricity ?? merged.planet.eccentricity ?? 0,
      0,
      0.8,
    );
    const semiMajor = Math.max(sep * 1.2, planetSemiMajor);
    const semiMinor = semiMajor * Math.sqrt(1 - planetEcc * planetEcc);
    const planetFocus = Math.sqrt(Math.max(0, semiMajor * semiMajor - semiMinor * semiMinor));
    const planetRadius = Math.max(
      (cfg.starARadius + cfg.starBRadius) * 0.08,
      Math.max(cfg.starARadius, cfg.starBRadius) * cfg.planetScale * (merged.planet.radiusEarth ?? 1),
    );

    // Fit the planet's whole orbit (plus the planet itself) with a little room.
    const frustumExtent = semiMajor + planetFocus + planetRadius * 1.5;

    const core = prepareScene({
      canvas,
      container,
      background: cfg.backgroundColor,
      dprCap,
      alpha: true,
      antialias: true,
      cameraFactory: () =>
        createOrthoTopDownCamera({
          extent: () => frustumExtent,
          height: 60,
          margin: 1.08,
          up: [0, 0, -1],
        }),
    });

    const { scene, textureLoader, renderer, start, stop, renderOnce, dispose: disposeCore } = core;
    const disposables = [];
    const track = (...items) => {
      disposables.push(...items);
      return items[0];
    };

    const loadTexture = (url) => {
      const tex = textureLoader.load(url, () => {
        if (pausedRef.current) renderOnce();
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return track(tex);
    };

    if (cfg.ambientIntensity > 0) {
      scene.add(new THREE.AmbientLight(0xffffff, cfg.ambientIntensity));
    }

    // ---------- Stars ----------
    // Over-bright, unlit discs (so their colour survives tone mapping), a corona
    // each, and a point light in the star's colour.
    const glowTexture = track(makeGlowTexture());
    const makeStar = ({ radius, color, intensity }) => {
      const tint = new THREE.Color(color);
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        track(new THREE.SphereGeometry(radius, 48, 24)),
        track(new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(1.6), toneMapped: false })),
      );
      const inner = createGlowSprite(glowTexture, { color: tint, scale: radius * 4, opacity: 0.55 });
      const outer = createGlowSprite(glowTexture, { color: tint, scale: radius * 10, opacity: 0.14 });
      track(inner.material, outer.material);
      const light = new THREE.PointLight(tint, intensity * cfg.lightBoost, 0, 2);
      group.add(body, inner, outer, light);
      scene.add(group);
      return group;
    };
    const starA = makeStar({ radius: cfg.starARadius, color: merged.starA.color, intensity: merged.starA.intensity ?? 12 });
    const starB = makeStar({ radius: cfg.starBRadius, color: merged.starB.color, intensity: merged.starB.intensity ?? 12 });

    // ---------- Orbit paths ----------
    const ellipsePoint = (angle) =>
      computeEllipticalPosition({ angle, semiMajor, semiMinor, focusOffset: planetFocus });
    const makeLoop = (pointAt, color, opacity) => {
      const pts = [];
      for (let i = 0; i < cfg.orbitSegments; i += 1) {
        const p = pointAt((i / cfg.orbitSegments) * Math.PI * 2);
        pts.push(new THREE.Vector3(p.x, 0, p.z));
      }
      const line = new THREE.LineLoop(
        track(new THREE.BufferGeometry().setFromPoints(pts)),
        track(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })),
      );
      scene.add(line);
      return line;
    };
    const circle = (r) => (t) => ({ x: Math.cos(t) * r, z: Math.sin(t) * r });
    makeLoop(circle(radiusA), merged.starA.color, 0.28);
    makeLoop(circle(radiusB), merged.starB.color, 0.28);
    makeLoop(ellipsePoint, 0xffffff, 0.14);

    // Barycentre marker: a small faint cross at the centre of mass.
    {
      const s = Math.min(radiusA, radiusB) * 0.18;
      const cross = new THREE.LineSegments(
        track(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-s, 0, 0), new THREE.Vector3(s, 0, 0),
          new THREE.Vector3(0, 0, -s), new THREE.Vector3(0, 0, s),
        ])),
        track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })),
      );
      scene.add(cross);
    }

    // Planet trail: an arc of the orbit behind the planet that fades out,
    // rebuilt each frame because the orbit is an ellipse.
    const trailSegments = 72;
    const trailPositions = new Float32Array((trailSegments + 1) * 3);
    const trailColors = new Float32Array((trailSegments + 1) * 3);
    const trailTint = new THREE.Color(cfg.atmosphereColor).lerp(new THREE.Color(0xffffff), 0.4);
    for (let i = 0; i <= trailSegments; i += 1) {
      const fade = Math.pow(1 - i / trailSegments, 1.6) * 0.9;
      trailColors[i * 3] = trailTint.r * fade;
      trailColors[i * 3 + 1] = trailTint.g * fade;
      trailColors[i * 3 + 2] = trailTint.b * fade;
    }
    const trailGeo = track(new THREE.BufferGeometry());
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    const trail = new THREE.Line(
      trailGeo,
      track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    scene.add(trail);

    // ---------- Planet ----------
    const planetMat = track(new THREE.MeshStandardMaterial({ map: loadTexture(cfg.planetTexture), roughness: 1, metalness: 0 }));
    const planetMesh = new THREE.Mesh(track(new THREE.SphereGeometry(planetRadius, 64, 32)), planetMat);
    const atmosphereEntry = createAtmosphereShell({
      radius: planetRadius * 1.06,
      color: cfg.atmosphereColor,
      opacity: 0.14,
    });
    track(atmosphereEntry.geometry, atmosphereEntry.material);
    planetMesh.add(atmosphereEntry.mesh);
    scene.add(planetMesh);

    planetMesh.rotation.z = THREE.MathUtils.degToRad(merged.planet.tiltDegrees ?? 0);

    const rotationPeriodDays =
      merged.planet.rotationHours && merged.planet.rotationHours !== 0
        ? merged.planet.rotationHours / 24
        : 1;
    const rotationSpeed =
      ((Math.PI * 2) / Math.abs(rotationPeriodDays || 1)) * Math.sign(rotationPeriodDays || 1);

    const binaryAngularSpeed = (Math.PI * 2) / (merged.binaryDays || 1);
    const planetAngularSpeed = (Math.PI * 2) / (merged.planet.orbitDays || 1);

    const state = {
      binaryAngle: 0,
      planetAngle: 0,
    };

    const updateTransforms = () => {
      const { starA: posA, starB: posB } = computeBinaryPositions({
        angle: state.binaryAngle,
        radiusA,
        radiusB,
      });
      starA.position.copy(posA);
      starB.position.copy(posB);

      const planetPos = ellipsePoint(state.planetAngle);
      planetMesh.position.set(planetPos.x, 0, planetPos.z);

      for (let i = 0; i <= trailSegments; i += 1) {
        const p = ellipsePoint(state.planetAngle - (i / trailSegments) * cfg.trailSpan);
        trailPositions[i * 3] = p.x;
        trailPositions[i * 3 + 2] = p.z;
      }
      trailGeo.attributes.position.needsUpdate = true;
    };

    updateTransforms();

    const tick = (delta) => {
      if (pausedRef.current) return;
      const dt = Math.min(delta ?? 0, 0.05);
      const deltaDays = dt * cfg.daysPerSecond;

      state.binaryAngle += binaryAngularSpeed * deltaDays;
      state.planetAngle += planetAngularSpeed * deltaDays;

      planetMesh.rotation.y += rotationSpeed * cfg.spinScale * deltaDays;
      updateTransforms();
    };

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
      disposables.forEach((item) => item?.dispose?.());
    };
  }, [dprCap, opts]);

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
      const el = containerRef.current?.closest('.sim-stage') ?? containerRef.current;
      if (el && !el.classList.contains('is-visible')) el.classList.add('is-visible');
    }
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
    />
  );
}
