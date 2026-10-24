import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from '../lib/simStage.jsx';
import {
  prepareScene,
  createTopDownOrthoCamera,
  addSaturn,
} from '../lib/threeCore.js';
import { applyRingShadow } from '../lib/ringShadow.js';

function applyContrastMaterial(material, contrast = 1) {
  if (!material) return;
  material.userData.uContrast = { value: contrast };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uContrast = material.userData.uContrast;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
        #include <common>
        uniform float uContrast;
        `,
      )
      .replace(
        '#include <map_fragment>',
        `
        #include <map_fragment>
        vec3 c = diffuseColor.rgb;
        c = (c - 0.5) * uContrast + 0.5;
        diffuseColor.rgb = clamp(c, 0.0, 1.0);
        `,
      );
  };
  material.needsUpdate = true;
}

export default function SaturnComparison({
  id = 'saturn-comparison',
  aspect = '16 / 9',
  showPause = true,
  dprCap = 1.5,
  saturnTexture,
  saturnRingTexture,
  secondaryTexture,
  saturnRadius,
  secondaryRadius,
  saturnContrast = 1.0,
  secondaryContrast = 1.0,
  saturnTiltDeg,
  planetDistance,
  orthoExtent,
  lightPosition = [5, 2, 3], // [x, y, z] direction of the sunlight
  lightIntensity = 2.1,
  ambientIntensity = 0.28,
  ringColor, // optional tint multiplied into Saturn's ring texture
  ringShadow = false, // cast Saturn's shadow onto its rings
  ringInnerScale, // ring radii in Saturn radii; addSaturn's defaults when omitted
  ringOuterScale,
  options = {},
}) {
  const lightPositionKey = lightPosition.join(',');
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const simControlsRef = useRef(null);

  const pausedRef = useRef(true);
  const [paused, setPaused] = useState(true);
  const madeVisibleRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    if (
      !saturnTexture ||
      !saturnRingTexture ||
      !secondaryTexture ||
      typeof saturnRadius !== 'number' ||
      typeof secondaryRadius !== 'number'
    ) {
      console.warn('SaturnComparison requires textures and numeric radii.');
      return undefined;
    }

    const timeScale = options.timeScale ?? 2000;
    const saturnRotHours = options.saturnRotationHours ?? 10.7;
    const secondaryRotHours = options.secondaryRotationHours ?? 16.11;
    const saturnSpinRad =
      THREE.MathUtils.degToRad(360 / (saturnRotHours * 3600)) * timeScale;
    const secondarySpinRad =
      THREE.MathUtils.degToRad(360 / (secondaryRotHours * 3600)) * timeScale;

    const saturnRadiusNorm = 1;
    const secRadiusNorm =
      Math.max(secondaryRadius, Number.EPSILON) / Math.max(saturnRadius, Number.EPSILON);

    const padding = options.distancePadding ?? 0.3;
    const explicitDistance = Number.isFinite(planetDistance)
      ? planetDistance
      : Number.isFinite(options.planetDistance)
        ? options.planetDistance
        : undefined;
    const baseDistance = explicitDistance ?? saturnRadiusNorm + secRadiusNorm + padding;
    const saturnPosition = options.saturnPosition ?? [-baseDistance / 2, 0, 0];
    const secondaryPosition = options.secondaryPosition ?? [baseDistance / 2, 0, 0];

    const halfSpan = Math.max(
      Math.abs(saturnPosition[0]) + saturnRadiusNorm * 1.5,
      Math.abs(secondaryPosition[0]) + secRadiusNorm * 1.5,
    );
    const orthoExtentValue =
      options.orthoExtent ?? orthoExtent ?? Math.max(halfSpan * 1.15, 2.2);

    const sceneCtx = prepareScene({
      canvas,
      container,
      dprCap,
      background: 0x000000,
      cameraFactory: () =>
        createTopDownOrthoCamera({
          extent: () => orthoExtentValue,
          margin: options.orthoMargin ?? 1.05,
          position: options.cameraPosition ?? [0, 0, 6],
          lookAt: options.cameraLookAt ?? [0, 0, 0],
          up: options.cameraUp ?? [0, 1, 0],
          near: options.cameraNear ?? 0.01,
          far: options.cameraFar ?? 80,
        }),
    });

    const { scene, textureLoader, renderer, start, stop, dispose } = sceneCtx;

    const loadTexture = (url, opts = {}) => {
      const tex = textureLoader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (opts.repeatWrap) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      }
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };

    const starsTexture = loadTexture(options.starsTexture ?? '/textures/stars_texture.jpg', {
      repeatWrap: true,
    });
    const secondaryMap = loadTexture(secondaryTexture);

    const secondaryMaterial = new THREE.MeshStandardMaterial({
      map: secondaryMap,
      roughness: 1,
      metalness: 0,
    });
    applyContrastMaterial(secondaryMaterial, secondaryContrast);

    const secondaryPlanet = new THREE.Mesh(
      new THREE.SphereGeometry(secRadiusNorm, 96, 96),
      secondaryMaterial,
    );
    secondaryPlanet.position.set(...secondaryPosition);
    scene.add(secondaryPlanet);

    const saturn = addSaturn(scene, {
      textureUrl: saturnTexture,
      ringTextureUrl: saturnRingTexture ?? options.ringTexture ?? '/textures/saturns_rings_texture.webp',
      position: saturnPosition,
      radius: saturnRadiusNorm,
      spinSpeed: saturnSpinRad,
      spinAxis: options.saturnSpinAxis ?? [0, 1, 0],
      tiltDeg: saturnTiltDeg ?? options.tiltDeg ?? [0, 10, 26.7],
      textureLoader,
      renderer,
      materialOptions: {},
      ...(ringInnerScale !== undefined ? { ringInnerScale } : {}),
      ...(ringOuterScale !== undefined ? { ringOuterScale } : {}),
      ringMaterialOptions: ringColor !== undefined ? { color: new THREE.Color(ringColor) } : {},
    });
    applyContrastMaterial(saturn.planetMaterial, saturnContrast);

    const stars = new THREE.Mesh(
      new THREE.SphereGeometry(options.starRadius ?? 200, 64, 64),
      new THREE.MeshBasicMaterial({ map: starsTexture, side: THREE.BackSide }),
    );
    stars.material.color.setScalar(options.starDim ?? 0.05);
    scene.add(stars);

    const sun = new THREE.DirectionalLight(0xffffff, lightIntensity);
    sun.position.set(lightPosition[0] ?? 5, lightPosition[1] ?? 2, lightPosition[2] ?? 3).normalize();
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, ambientIntensity));

    if (ringShadow && saturn.ringMesh) {
      applyRingShadow(saturn.ringMesh.material, {
        center: new THREE.Vector3(...saturnPosition),
        radius: saturnRadiusNorm,
        lightDir: sun.position.clone().normalize(),
      });
    }

    const animate = (delta = 0) => {
      saturn.update(delta);
      secondaryPlanet.rotation.y += secondarySpinRad * delta;
      stars.rotation.y -= 0.003 * delta;
    };

    const startLoop = () => start(animate);
    const stopLoop = () => stop();

    simControlsRef.current = { startLoop, stopLoop };
    if (!pausedRef.current) {
      startLoop();
    }

    return () => {
      simControlsRef.current = null;
      stopLoop();

      secondaryPlanet.geometry.dispose();
      secondaryMaterial.dispose();
      saturn.dispose();
      stars.geometry.dispose();
      stars.material.dispose();
      starsTexture?.dispose?.();
      secondaryMap?.dispose?.();

      dispose();
    };
  }, [
    dprCap,
    options,
    saturnTexture,
    saturnRingTexture,
    secondaryTexture,
    saturnRadius,
    secondaryRadius,
    saturnContrast,
    secondaryContrast,
    saturnTiltDeg,
    planetDistance,
    orthoExtent,
    lightPositionKey,
    lightIntensity,
    ambientIntensity,
    ringColor,
    ringShadow,
    ringInnerScale,
    ringOuterScale,
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
