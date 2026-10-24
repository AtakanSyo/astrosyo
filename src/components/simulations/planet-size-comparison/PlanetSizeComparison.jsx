import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from '../lib/simStage.jsx';
import { prepareScene, createTopDownOrthoCamera } from '../lib/threeCore.js';
import { applyEarthSurface, createAtmosphere } from '../lib/earthEffects.js';

const DEFAULT_LIGHT_POSITION = [5, 2, 3];

export default function PlanetSizeComparison({
  id = 'planet-size-comparison',
  aspect = '16 / 9',
  showPause = true,
  dprCap = 1.5,
  primaryTexture,
  secondaryTexture,
  primaryRadius,
  secondaryRadius,
  planetDistance,
  primaryContrast,
  secondaryContrast,
  orthoExtent,
  options = {},
  directionalLightIntensity = 2.2,
  ambientLightIntensity = 0.32,
  lightPosition = DEFAULT_LIGHT_POSITION, // [x, y, z] direction the light comes from
  primaryTiltDeg, // per-planet axial tilt (degrees); both default to options.axialTiltDeg
  secondaryTiltDeg,
  primaryInitialSpinDeg = 0,
  secondaryInitialSpinDeg = 0,
  primaryAtmosphere, // true, a CSS colour, or { color, strength, haloScale }
  secondaryAtmosphere,
  primaryNightLights = false, // Earth texture only: city lights on the night side and an ocean glint
  secondaryNightLights = false,
}) {
  const atmosKey = JSON.stringify([primaryAtmosphere ?? null, secondaryAtmosphere ?? null]);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const simControlsRef = useRef(null);
  const lightKey = lightPosition.join(',');

  // Memoize options so re-renders (e.g. play/pause) don't recreate the scene unless a field actually changed.
  const memoOptions = useMemo(() => options ?? {}, [
    options?.planetRadius,
    options?.axialTiltDeg,
    options?.rotationHours,
    options?.timeScale,
    options?.starDim,
    options?.secondRadiusScale,
    options?.atmosScale,
    options?.starRadius,
    options?.atmosIntensity,
    options?.planetTexture,
    options?.secondTexture,
    options?.starsTexture,
    options?.planetPosition,
    options?.secondPosition,
    options?.planetSat,
    options?.planetContrast,
    options?.planetBrightness,
    options?.secondSat,
    options?.secondContrast,
    options?.secondBrightness,
    options?.planetDistance,
    options?.distancePadding,
    options?.orthoExtent,
    options?.orthoMargin,
    options?.cameraPosition,
    options?.cameraLookAt,
    options?.cameraUp,
    options?.cameraNear,
    options?.cameraFar,
  ]);

  const pausedRef = useRef(true);
  const [paused, setPaused] = useState(true);
  const madeVisibleRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    if (
      typeof primaryRadius !== 'number' ||
      typeof secondaryRadius !== 'number' ||
      !primaryTexture ||
      !secondaryTexture
    ) {
      console.warn('PlanetSizeComparison requires valid textures and radius values.');
      return undefined;
    }

    const radiusRatio =
      Math.max(secondaryRadius, Number.EPSILON) / Math.max(primaryRadius, Number.EPSILON);

    const planetRadius = memoOptions.planetRadius ?? 1;
    const cfgBase = {
      axialTiltDeg: memoOptions.axialTiltDeg ?? -28.32,
      rotationHours: memoOptions.rotationHours ?? 16.11,
      timeScale: memoOptions.timeScale ?? 2000,
      starDim: memoOptions.starDim ?? 0.05,
      planetRadius,
      secondRadiusScale: memoOptions.secondRadiusScale ?? radiusRatio,
      atmosScale: memoOptions.atmosScale ?? 1.015,
      starRadius: memoOptions.starRadius ?? 200,
      atmosIntensity: memoOptions.atmosIntensity ?? 0.2,
      planetTexture: memoOptions.planetTexture ?? primaryTexture,
      secondTexture: memoOptions.secondTexture ?? secondaryTexture,
      starsTexture: memoOptions.starsTexture ?? '/textures/stars_texture.jpg',
      planetPosition: memoOptions.planetPosition ?? [-1, 0, 0],
      secondPosition: memoOptions.secondPosition ?? [1, 0, 0],
      planetSat: memoOptions.planetSat ?? 1.2,
      planetContrast: memoOptions.planetContrast ?? primaryContrast ?? 1.0,
      planetBrightness: memoOptions.planetBrightness ?? 0.007,
      secondSat: memoOptions.secondSat ?? 1.1,
      secondContrast: memoOptions.secondContrast ?? secondaryContrast ?? 0.6,
      secondBrightness: memoOptions.secondBrightness ?? 0.0,
    };

    const R_PLANET = cfgBase.planetRadius;
    const R_PLANET_2 = R_PLANET * cfgBase.secondRadiusScale;

    const explicitDistance =
      Number.isFinite(memoOptions.planetDistance) && !Number.isNaN(memoOptions.planetDistance)
        ? memoOptions.planetDistance
        : Number.isFinite(planetDistance) && !Number.isNaN(planetDistance)
          ? planetDistance
          : undefined;
    const minDistance =
      R_PLANET * cfgBase.atmosScale +
      R_PLANET_2 * cfgBase.atmosScale +
      (memoOptions.distancePadding ?? 0.25);
    const centerDistance = Math.max(explicitDistance ?? minDistance, minDistance);
    const defaultPositions = {
      a: [-centerDistance / 2, 0, 0],
      b: [centerDistance / 2, 0, 0],
    };

    const planetPosition = memoOptions.planetPosition ?? defaultPositions.a;
    const secondPosition = memoOptions.secondPosition ?? defaultPositions.b;

    const cfg = {
      ...cfgBase,
      planetPosition,
      secondPosition,
    };

    const halfSpan = Math.max(
      Math.abs(cfg.planetPosition[0]) + R_PLANET * cfg.atmosScale,
      Math.abs(cfg.secondPosition[0]) + R_PLANET_2 * cfg.atmosScale,
    );
    const orthoExtentValue =
      memoOptions.orthoExtent ?? orthoExtent ?? Math.max(halfSpan * 1.2, 1.5);

    const sceneCtx = prepareScene({
      canvas,
      container,
      dprCap,
      background: 0x000000,
      cameraFactory: () =>
        createTopDownOrthoCamera({
          extent: () => orthoExtentValue,
          margin: memoOptions.orthoMargin ?? 1.05,
          position: memoOptions.cameraPosition ?? [0, 0, 5],
          lookAt: memoOptions.cameraLookAt ?? [0, 0, 0],
          up: memoOptions.cameraUp ?? [0, 1, 0],
          near: memoOptions.cameraNear ?? 0.01,
          far: memoOptions.cameraFar ?? 50,
        }),
    });

    const { scene, renderer, textureLoader, start, stop, dispose } = sceneCtx;

    function loadMap(url, opts = {}) {
      const t = textureLoader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (opts.repeatWrap) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
      }
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      return t;
    }

    function makeSTDMaterial(map, { sat = 1.0, contrast = 1.0, brightness = 0.0 } = {}) {
      const mat = new THREE.MeshStandardMaterial({
        map,
        roughness: 1.0,
        metalness: 0.0,
      });

      mat.userData.uSat = { value: sat };
      mat.userData.uContrast = { value: contrast };
      mat.userData.uBrightness = { value: brightness };

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSat = mat.userData.uSat;
        shader.uniforms.uContrast = mat.userData.uContrast;
        shader.uniforms.uBrightness = mat.userData.uBrightness;

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `
            #include <common>
            uniform float uSat;
            uniform float uContrast;
            uniform float uBrightness;
            `
          )
          .replace(
            '#include <map_fragment>',
            `
            #include <map_fragment>
            vec3 c = diffuseColor.rgb;
            float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(vec3(luma), c, uSat);
            c = (c - 0.5) * uContrast + 0.5;
            c += uBrightness;
            diffuseColor.rgb = clamp(c, 0.0, 1.0);
            `
          );
      };

      mat.needsUpdate = true;
      return mat;
    }

    function makePlanet(radius, material, tiltDeg, position, initialSpinDeg = 0) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 96), material);
      mesh.rotation.z = THREE.MathUtils.degToRad(tiltDeg);
      mesh.rotation.y = THREE.MathUtils.degToRad(initialSpinDeg);
      mesh.position.set(...position);
      scene.add(mesh);
      return mesh;
    }

    const mapPlanet = loadMap(cfg.planetTexture);
    const mapSecond = loadMap(cfg.secondTexture);
    const mapStars = loadMap(cfg.starsTexture, { repeatWrap: true });

    const matPlanet = makeSTDMaterial(mapPlanet, {
      sat: cfg.planetSat,
      contrast: cfg.planetContrast,
      brightness: cfg.planetBrightness,
    });
    const matSecond = makeSTDMaterial(mapSecond, {
      sat: cfg.secondSat,
      contrast: cfg.secondContrast,
      brightness: cfg.secondBrightness,
    });

    const planetA = makePlanet(R_PLANET, matPlanet, primaryTiltDeg ?? cfg.axialTiltDeg, cfg.planetPosition, primaryInitialSpinDeg);
    const planetB = makePlanet(R_PLANET_2, matSecond, secondaryTiltDeg ?? cfg.axialTiltDeg, cfg.secondPosition, secondaryInitialSpinDeg);

    const stars = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.starRadius, 64, 64),
      new THREE.MeshBasicMaterial({ map: mapStars, side: THREE.BackSide })
    );
    stars.material.color.setScalar(cfg.starDim);
    scene.add(stars);

    const sun = new THREE.DirectionalLight(0xffffff, directionalLightIntensity);
    sun.position.set(lightPosition[0] ?? 5, lightPosition[1] ?? 2, lightPosition[2] ?? 3).normalize();
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, ambientLightIntensity));

    // Night lights and atmospheres shade by the sun's direction in view space
    // (the camera never moves, so it is fixed).
    sceneCtx.camera.updateMatrixWorld();
    const sunDirView = sun.position.clone().transformDirection(sceneCtx.camera.matrixWorldInverse);
    const extras = [];
    [
      { material: matPlanet, night: primaryNightLights, atmosphere: primaryAtmosphere, radius: R_PLANET, position: cfg.planetPosition },
      { material: matSecond, night: secondaryNightLights, atmosphere: secondaryAtmosphere, radius: R_PLANET_2, position: cfg.secondPosition },
    ].forEach(({ material, night, atmosphere, radius, position }) => {
      if (night) {
        const nightMap = loadMap('/textures/earth_nighttime_texture.webp');
        applyEarthSurface(material, { nightMap, lightDirView: sunDirView });
        extras.push({ dispose: () => nightMap.dispose() });
      }
      if (atmosphere) {
        const atmo = createAtmosphere({
          radius,
          lightDirView: sunDirView,
          ...(typeof atmosphere === 'string' ? { color: atmosphere } : {}),
          ...(typeof atmosphere === 'object' ? atmosphere : {}),
        });
        atmo.group.position.set(...position);
        scene.add(atmo.group);
        extras.push({ dispose: () => { scene.remove(atmo.group); atmo.dispose(); } });
      }
    });

    const degPerSec = 360.0 / (cfg.rotationHours * 3600.0);

    let loopActive = false;
    const animate = (delta = 0) => {
      const spinDeg = degPerSec * cfg.timeScale * delta;

      planetA.rotation.y += THREE.MathUtils.degToRad(spinDeg);
      planetB.rotation.y += THREE.MathUtils.degToRad(spinDeg);

      stars.rotation.y -= 0.003 * delta;
    };

    const startLoop = () => {
      if (loopActive) return;
      loopActive = true;
      start(animate);
    };

    const stopLoop = () => {
      if (!loopActive) return;
      loopActive = false;
      stop();
    };

    simControlsRef.current = { startLoop, stopLoop };

    if (!pausedRef.current) {
      startLoop();
    }

    return () => {
      simControlsRef.current = null;
      stopLoop();

      planetA.geometry.dispose();
      planetB.geometry.dispose();
      stars.geometry.dispose();

      matPlanet.dispose();
      matSecond.dispose();

      mapPlanet?.dispose?.();
      mapSecond?.dispose?.();
      mapStars?.dispose?.();
      extras.forEach((extra) => extra.dispose());
      dispose();
    };
  }, [
    dprCap,
    memoOptions,
    primaryRadius,
    secondaryRadius,
    primaryTexture,
    secondaryTexture,
    planetDistance,
    primaryContrast,
    secondaryContrast,
    orthoExtent,
    directionalLightIntensity,
    ambientLightIntensity,
    lightKey,
    primaryTiltDeg,
    secondaryTiltDeg,
    primaryInitialSpinDeg,
    secondaryInitialSpinDeg,
    atmosKey,
    primaryNightLights,
    secondaryNightLights,
  ]);

  const onToggle = () => {
    pausedRef.current = !pausedRef.current;
    const nowPaused = pausedRef.current;
    setPaused(nowPaused);

    if (!nowPaused && !madeVisibleRef.current) {
      madeVisibleRef.current = true;
      const el = containerRef.current?.closest('.sim-stage') ?? containerRef.current;
      if (el && !el.classList.contains('is-visible')) el.classList.add('is-visible');
    }

    if (nowPaused) {
      simControlsRef.current?.stopLoop?.();
    } else {
      simControlsRef.current?.startLoop?.();
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
      style={{ width: '100%' }}
    />
  );
}
