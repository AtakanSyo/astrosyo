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
  stars: [
    {
      key: 'alpha',
      name: 'Alpha',
      radius: 1.1,
      color: 0xffd8a6,
      intensity: 180,
      orbitRadius: 4,
      orbitDays: 180,
      phaseOffset: 0,
      orbitShiftX: 0,
      orbitShiftZ: 3,
    },
    {
      key: 'beta',
      name: 'Beta',
      radius: 0.6,
      color: 0xaad3ff,
      intensity: 120,
      orbitRadius: 2.1,
      orbitDays: 260,
      phaseOffset: (Math.PI * 2) / 3,
      orbitShiftX: -1.5,
      orbitShiftZ: 0,
    },
    {
      key: 'gamma',
      name: 'Gamma',
      radius: 0.6,
      color: 0xff98c8,
      intensity: 100,
      orbitRadius: 4,
      orbitDays: 390,
      phaseOffset: ((Math.PI * 2) / 3) * 2,
      orbitShiftX: 0,
      orbitShiftZ: -2,
    },
  ],
  planet: {
    name: 'Trillia',
    hostKey: 'alpha',
    semiMajor: 9,
    eccentricity: 0.08,
    orbitDays: 210,
    rotationHours: 30,
    tiltDegrees: 19,
    radiusEarth: 1.15,
    color: 0xff3a3b,
  },
});

const CAMERA_DEFAULTS = Object.freeze({
  height: 100,
  up: [0, 0, -1],
  lookAt: [0, 0, 0],
  margin: 1.05,
});

export default function TripleStarSystem({
  id = 'triple-star-system',
  aspect = '3 / 2',
  showPause = true,
  showPlanet = true,
  cameraDistance = 1,
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

    const mergedStars = DEFAULT_SYSTEM.stars.map((star) => ({
      ...star,
      ...(opts.stars?.[star.key] ?? EMPTY_OPTS),
    }));

    const mergedPlanet = {
      ...DEFAULT_SYSTEM.planet,
      ...(opts.planet ?? EMPTY_OPTS),
    };

    const planetEnabled = (opts.showPlanet ?? showPlanet) !== false;

    const cfg = {
      backgroundColor: opts.backgroundColor ?? 0x000000,
      daysPerSecond: opts.daysPerSecond ?? 5,
      orbitSegments: opts.orbitSegments ?? 256,
      planetScale: opts.planetScale ?? 0.9,
      planetTexture: opts.planetTexture ?? '/textures/mars_texture.webp',
      ambientIntensity: opts.ambientIntensity ?? 0.06,
      atmosphereColor: opts.atmosphereColor ?? 0xff8a6a,
      trailSpan: opts.trailSpan ?? Math.PI * 0.6, // radians of orbit the planet's fading trail covers
      lightBoost: opts.lightBoost ?? 2, // scales the stars' light so it reaches the planet's orbit
      spinScale: opts.spinScale ?? 0.01, // slows the planet's day relative to its orbit, so the spin reads calmly
    };

    const distanceFactorRaw = opts.cameraDistance ?? cameraDistance ?? 1;
    const distanceFactor = Number.isFinite(distanceFactorRaw) ? Math.max(0.25, distanceFactorRaw) : 1;

    const starData = mergedStars.map((star) => {
      const orbitRadius =
        opts.starOrbitRadii?.[star.key] ??
        star.orbitRadius ??
        THREE.MathUtils.clamp(star.orbitRadius ?? 6, 0.5, 60);
      const orbitShiftConfig = opts.starOrbitShifts?.[star.key] ?? {};
      const orbitShift = {
        x: orbitShiftConfig.x ?? star.orbitShiftX ?? 0,
        z: orbitShiftConfig.z ?? star.orbitShiftZ ?? 0,
      };
      return {
        key: star.key,
        radius: star.radius ?? 1.2,
        color: star.color,
        intensity: star.intensity ?? 12,
        orbitRadius,
        orbitShift,
        angularSpeed: (Math.PI * 2) / Math.max(1, star.orbitDays ?? 240),
        angle: star.phaseOffset ?? 0,
      };
    });

    const hostIndex = Math.max(0, starData.findIndex((star) => star.key === mergedPlanet.hostKey));
    const hostStar = starData[hostIndex];

    // Planet orbit geometry (only used when the planet is shown).
    const planetSemiMajor =
      opts.orbitSemiMajor ?? mergedPlanet.semiMajor ?? DEFAULT_SYSTEM.planet.semiMajor;
    const planetEcc = THREE.MathUtils.clamp(
      opts.orbitEccentricity ?? mergedPlanet.eccentricity ?? DEFAULT_SYSTEM.planet.eccentricity ?? 0,
      0,
      0.85,
    );
    const semiMajor = Math.max(0.5, planetSemiMajor);
    const semiMinor = semiMajor * Math.sqrt(1 - planetEcc * planetEcc);
    const planetFocus = Math.sqrt(Math.max(0, semiMajor * semiMajor - semiMinor * semiMinor));
    const planetRadius = Math.max(hostStar.radius, hostStar.radius * cfg.planetScale * (mergedPlanet.radiusEarth ?? 1));

    // Fit every star's orbit, and the planet's orbit wherever its host carries it.
    const reach = (star) => Math.hypot(star.orbitShift.x, star.orbitShift.z) + star.orbitRadius;
    const frustumExtent = Math.max(
      ...starData.map((star) => reach(star) * 1.04 + star.radius * 4),
      planetEnabled ? reach(hostStar) + semiMajor + planetFocus + planetRadius * 1.5 : 0,
    );

    const core = prepareScene({
      canvas,
      container,
      background: cfg.backgroundColor,
      dprCap,
      alpha: true,
      antialias: true,
      cameraFactory: () =>
        createOrthoTopDownCamera({
          extent: () => frustumExtent * distanceFactor,
          height: CAMERA_DEFAULTS.height,
          margin: CAMERA_DEFAULTS.margin,
          up: CAMERA_DEFAULTS.up,
          lookAt: CAMERA_DEFAULTS.lookAt,
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
    // Over-bright, unlit discs (so their colour survives tone mapping), a soft
    // corona each, a point light in the star's colour, and a faint tinted orbit.
    const glowTexture = track(makeGlowTexture());
    const makeLoop = (pointAt, color, opacity, parent = scene) => {
      const pts = [];
      for (let i = 0; i < cfg.orbitSegments; i += 1) {
        const p = pointAt((i / cfg.orbitSegments) * Math.PI * 2);
        pts.push(new THREE.Vector3(p.x, 0, p.z));
      }
      const line = new THREE.LineLoop(
        track(new THREE.BufferGeometry().setFromPoints(pts)),
        track(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })),
      );
      parent.add(line);
      return line;
    };
    starData.forEach((star) => {
      const tint = new THREE.Color(star.color);
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        track(new THREE.SphereGeometry(star.radius, 48, 24)),
        track(new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(1.6), toneMapped: false })),
      );
      const inner = createGlowSprite(glowTexture, { color: tint, scale: star.radius * 4, opacity: 0.55 });
      const outer = createGlowSprite(glowTexture, { color: tint, scale: star.radius * 10, opacity: 0.14 });
      track(inner.material, outer.material);
      group.add(body, inner, outer, new THREE.PointLight(tint, star.intensity * cfg.lightBoost, 0, 2));
      scene.add(group);
      star.group = group;

      const orbit = makeLoop((t) => ({ x: Math.cos(t) * star.orbitRadius, z: Math.sin(t) * star.orbitRadius }), star.color, 0.28);
      orbit.position.set(star.orbitShift.x, 0, star.orbitShift.z);
    });

    // Barycentre marker: a small faint cross at the centre of mass.
    {
      const s = Math.min(...starData.map((star) => star.orbitRadius)) * 0.18;
      scene.add(
        new THREE.LineSegments(
          track(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-s, 0, 0), new THREE.Vector3(s, 0, 0),
            new THREE.Vector3(0, 0, -s), new THREE.Vector3(0, 0, s),
          ])),
          track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })),
        ),
      );
    }

    // ---------- Planet ----------
    // Its orbit and trail ride along with the host star.
    const orbitAnchor = new THREE.Object3D();
    scene.add(orbitAnchor);
    const ellipsePoint = (angle) =>
      computeEllipticalPosition({ angle, semiMajor, semiMinor, focusOffset: planetFocus });

    let planetMesh = null;
    let rotationSpeed = 0;
    let planetAngularSpeed = 0;
    const trailSegments = 72;
    const trailPositions = new Float32Array((trailSegments + 1) * 3);
    let trailGeo = null;

    if (planetEnabled) {
      makeLoop(ellipsePoint, 0xffffff, 0.14, orbitAnchor);

      const trailColors = new Float32Array((trailSegments + 1) * 3);
      const trailTint = new THREE.Color(cfg.atmosphereColor).lerp(new THREE.Color(0xffffff), 0.4);
      for (let i = 0; i <= trailSegments; i += 1) {
        const fade = Math.pow(1 - i / trailSegments, 1.6) * 0.9;
        trailColors[i * 3] = trailTint.r * fade;
        trailColors[i * 3 + 1] = trailTint.g * fade;
        trailColors[i * 3 + 2] = trailTint.b * fade;
      }
      trailGeo = track(new THREE.BufferGeometry());
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
      orbitAnchor.add(
        new THREE.Line(
          trailGeo,
          track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
        ),
      );

      const planetMat = track(new THREE.MeshStandardMaterial({ map: loadTexture(cfg.planetTexture), roughness: 1, metalness: 0 }));
      planetMesh = new THREE.Mesh(track(new THREE.SphereGeometry(planetRadius, 64, 32)), planetMat);
      const atmosphereEntry = createAtmosphereShell({
        radius: planetRadius * 1.06,
        color: cfg.atmosphereColor,
        opacity: 0.14,
      });
      track(atmosphereEntry.geometry, atmosphereEntry.material);
      planetMesh.add(atmosphereEntry.mesh);
      scene.add(planetMesh);

      planetMesh.rotation.z = THREE.MathUtils.degToRad(mergedPlanet.tiltDegrees ?? 0);

      const rotationPeriodDays =
        mergedPlanet.rotationHours && mergedPlanet.rotationHours !== 0
          ? mergedPlanet.rotationHours / 24
          : 1;
      rotationSpeed =
        ((Math.PI * 2) / Math.abs(rotationPeriodDays || 1)) * Math.sign(rotationPeriodDays || 1);
      planetAngularSpeed = (Math.PI * 2) / Math.max(1, mergedPlanet.orbitDays ?? 200);
    }

    const state = {
      starAngles: starData.map((star) => star.angle),
      planetAngle: 0,
    };

    const updateTransforms = () => {
      starData.forEach((star, idx) => {
        const angle = state.starAngles[idx];
        star.group.position.set(
          Math.cos(angle) * star.orbitRadius + star.orbitShift.x,
          0,
          Math.sin(angle) * star.orbitRadius + star.orbitShift.z,
        );
      });

      const hostPos = hostStar.group.position;
      orbitAnchor.position.copy(hostPos);

      if (planetMesh) {
        const planetPos = ellipsePoint(state.planetAngle);
        planetMesh.position.set(hostPos.x + planetPos.x, 0, hostPos.z + planetPos.z);
        for (let i = 0; i <= trailSegments; i += 1) {
          const p = ellipsePoint(state.planetAngle - (i / trailSegments) * cfg.trailSpan);
          trailPositions[i * 3] = p.x;
          trailPositions[i * 3 + 2] = p.z;
        }
        trailGeo.attributes.position.needsUpdate = true;
      }
    };

    const tick = (delta) => {
      if (pausedRef.current) return;
      const dt = Math.min(delta ?? 0, 0.05);
      const deltaDays = dt * cfg.daysPerSecond;
      starData.forEach((star, idx) => {
        state.starAngles[idx] += star.angularSpeed * deltaDays;
      });
      if (planetMesh) {
        state.planetAngle += planetAngularSpeed * deltaDays;
        planetMesh.rotation.y += rotationSpeed * cfg.spinScale * deltaDays;
      }
      updateTransforms();
    };

    updateTransforms();

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
