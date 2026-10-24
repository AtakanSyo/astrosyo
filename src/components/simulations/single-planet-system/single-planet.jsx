import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from '../lib/simStage.jsx';
import { prepareScene } from '../lib/threeCore.js';
import {
  createAtmosphereShell,
  createOrthoTopDownCamera,
  computeEllipticalPosition,
} from '../lib/starSystemCore.js';
import { createGlowSprite, makeGlowTexture } from '../lib/glow.js';

const EMPTY_OPTS = Object.freeze({});
const DEFAULT_SYSTEM = Object.freeze({
  name: 'Aurora',
  orbitDays: 142.3,
  rotationHours: 28.6,
  tiltDegrees: 18,
  color: 0x4aa8ff,
  semiMajor: 14, // scene units
  eccentricity: 0.18,
  radiusEarth: 1.1,
});

export default function SinglePlanetSystem({
  id = 'single-planet-system',
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

    const system = { ...DEFAULT_SYSTEM, ...(opts.planet ?? EMPTY_OPTS) };
    const cfg = {
      backgroundColor: opts.backgroundColor ?? 0x000000,
      starRadius: opts.starRadius ?? 1.2,
      starColor: opts.starColor ?? 0xffd398,
      starIntensity: opts.starIntensity ?? 520,
      orbitSegments: opts.orbitSegments ?? 256,
      daysPerSecond: opts.daysPerSecond ?? 6,
      planetScale: opts.planetScale ?? 1.2,
      planetTexture: opts.planetTexture ?? '/textures/mars_texture.webp',
      atmosphereColor: opts.atmosphereColor ?? 0xff8a6a,
      ambientIntensity: opts.ambientIntensity ?? 0.06,
      trailSpan: opts.trailSpan ?? Math.PI * 0.6, // radians of orbit the planet's fading trail covers
      lightBoost: opts.lightBoost ?? 1.5, // scales the star's light so it reaches the planet's orbit
      spinScale: opts.spinScale ?? 0.01, // slows the planet's day relative to its orbit, so the spin reads calmly
      orbitSemiMajor: Math.max(
        0.1,
        opts.orbitSemiMajor ?? system.semiMajor ?? DEFAULT_SYSTEM.semiMajor,
      ),
      orbitEccentricity: THREE.MathUtils.clamp(
        opts.orbitEccentricity ?? system.eccentricity ?? DEFAULT_SYSTEM.eccentricity ?? 0,
        0,
        0.92,
      ),
    };

    const ecc = cfg.orbitEccentricity;
    const semiMajor = cfg.orbitSemiMajor;
    const semiMinor = semiMajor * Math.sqrt(1 - ecc * ecc);
    const focusOffset = Math.sqrt(Math.max(0, semiMajor * semiMajor - semiMinor * semiMinor));
    const planetRadius = Math.max(
      cfg.starRadius * 0.1,
      cfg.starRadius * cfg.planetScale * (system.radiusEarth ?? 1),
    );

    // Fit the planet's whole orbit (plus the planet itself) with a little room.
    const frustumExtent = semiMajor + focusOffset + planetRadius * 1.5;
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
          height: 40,
          margin: 1.08,
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

    // ---------- Star ----------
    // Over-bright, unlit disc (so its colour survives tone mapping), a soft
    // corona, and a point light in the star's colour.
    const glowTexture = track(makeGlowTexture());
    {
      const tint = new THREE.Color(cfg.starColor);
      const star = new THREE.Group();
      const body = new THREE.Mesh(
        track(new THREE.SphereGeometry(cfg.starRadius, 48, 24)),
        track(new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(1.6), toneMapped: false })),
      );
      const inner = createGlowSprite(glowTexture, { color: tint, scale: cfg.starRadius * 4, opacity: 0.55 });
      const outer = createGlowSprite(glowTexture, { color: tint, scale: cfg.starRadius * 10, opacity: 0.14 });
      track(inner.material, outer.material);
      star.add(body, inner, outer, new THREE.PointLight(tint, cfg.starIntensity * cfg.lightBoost, 0, 2));
      scene.add(star);
    }

    // ---------- Orbit path and trail ----------
    const ellipsePoint = (angle) =>
      computeEllipticalPosition({ angle, semiMajor, semiMinor, focusOffset });
    {
      const pts = [];
      for (let i = 0; i < cfg.orbitSegments; i += 1) {
        const p = ellipsePoint((i / cfg.orbitSegments) * Math.PI * 2);
        pts.push(new THREE.Vector3(p.x, 0, p.z));
      }
      scene.add(
        new THREE.LineLoop(
          track(new THREE.BufferGeometry().setFromPoints(pts)),
          track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false })),
        ),
      );
    }

    // An arc of the orbit behind the planet that fades out, rebuilt each frame
    // because the orbit is an ellipse.
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
    scene.add(
      new THREE.Line(
        trailGeo,
        track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
      ),
    );

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

    const tiltRad = THREE.MathUtils.degToRad(system.tiltDegrees ?? 0);
    planetMesh.rotation.z = tiltRad;

    const rotationPeriodDays =
      system.rotationHours && system.rotationHours !== 0
        ? system.rotationHours / 24
        : 1;
    const rotationSpeed =
      (Math.PI * 2) / Math.abs(rotationPeriodDays || 1) * Math.sign(rotationPeriodDays);

    const planetState = {
      angle: 0,
      orbitSpeed: (Math.PI * 2) / system.orbitDays,
    };

    const updatePlanet = () => {
      const { x, z } = ellipsePoint(planetState.angle);
      planetMesh.position.set(x, 0, z);
      for (let i = 0; i <= trailSegments; i += 1) {
        const p = ellipsePoint(planetState.angle - (i / trailSegments) * cfg.trailSpan);
        trailPositions[i * 3] = p.x;
        trailPositions[i * 3 + 2] = p.z;
      }
      trailGeo.attributes.position.needsUpdate = true;
    };

    const tick = (delta) => {
      if (pausedRef.current) return;
      const dt = Math.min(delta ?? 0, 0.05);
      const deltaDays = dt * cfg.daysPerSecond;
      planetState.angle += planetState.orbitSpeed * deltaDays;
      planetMesh.rotation.y += rotationSpeed * cfg.spinScale * deltaDays;
      updatePlanet();
    };

    updatePlanet();

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
