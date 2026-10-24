import { useMemo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { prepareScene, addSpinningPlanet, addSaturn, createTopDownOrthoCamera } from '../lib/threeCore';
import SimStage from '../lib/simStage.jsx';
import { useScrollZoom } from '../lib/useScrollZoom.js';
import { applyRingShadow } from '../lib/ringShadow.js';
import { applyEarthSurface, createAtmosphere } from '../lib/earthEffects.js';

const PLANET_CONFIG = {
  mercury: {
    textureUrl: '/textures/mercury_texture.webp',
    spinDegPerSec: 5,
  },
  venus: {
    textureUrl: '/textures/2k_venus_atmosphere.webp',
    spinDegPerSec: -2,
  },
  mars: {
    textureUrl: '/textures/mars_texture.webp',
    spinDegPerSec: 10,
  },
  jupiter: {
    textureUrl: '/textures/8k_jupiter.webp',
    spinDegPerSec: 5,
  },
  saturn: {
    textureUrl: '/textures/saturn_texture.webp',
    ringTextureUrl: '/textures/saturns_rings_texture.webp',
    spinDegPerSec: 12,
    ringsSpin: true,
    ringInnerScale: 1.4,
    ringOuterScale: 2.6,
    tiltDeg: [0, 10.0, 26.7],
    spinAxis: [0, -0.9, 0],
  },
  uranus: {
    textureUrl: '/textures/uranus_texture.webp',
    spinDegPerSec: -24,
  },
  neptune: {
    textureUrl: '/textures/neptune_texture.webp',
    spinDegPerSec: 7,
  },
  moon: {
    textureUrl: '/textures/moon_texture.webp',
    spinDegPerSec: 7,
  },
  earth: {
    textureUrl: '/textures/earth-texture-nasa.webp',
    spinDegPerSec: 5,
  },
  pluto: {
    textureUrl: '/textures/plutomap2k.webp',
    spinDegPerSec: 5,
  },
};

const DEFAULT_LIGHT_POSITION = [3, 2, 4];

function applyContrastMaterial(material, contrast) {
  if (!material || typeof contrast !== 'number') return;
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

export default function SinglePlanetSim({
  id = 'single-planet',
  aspect = '16 / 9',
  dprCap = 1.5,
  planet = 'earth',
  radius = 1,
  showPause = true,
  extensions = [],
  ringsSpin = true,
  ringAngle = 0,
  spinDegPerSec,
  initialSpinDeg = 0,
  cameraPosition,
  cameraLookAt = { x: 0, y: 0, z: 0 },
  textureContrast,
  tiltDeg,
  lightIntensity = 1.7,
  lightPosition = DEFAULT_LIGHT_POSITION, // [x, y, z]; the default lights the planet mostly from the front
  ringColor, // optional tint multiplied into Saturn's ring texture
  ringShadow = false, // cast the planet's shadow onto Saturn's rings
  ambientIntensity = 0.6,
  scrollZoom = false,
  scrollZoomOptions = {},
  orthographic = false,
  orthographicExtent = 2,
  cameraUp, // optional {x, y, z} up vector for the orthographic camera (its default looks straight down)
  showStarBackground = false,
  nightLights = false, // Earth only: city lights on the night side and a glint on the oceans
  atmosphere, // true, a CSS colour, or { color, strength, haloScale }: a glowing atmosphere around the planet
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const pausedRef = useRef(showPause);
  const [paused, setPaused] = useState(showPause);
  const madeVisibleRef = useRef(false);

  const planetKey = planet.toLowerCase();
  const lightPositionKey = lightPosition.join(',');
  const config = useMemo(() => PLANET_CONFIG[planetKey], [planetKey]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !container || !config) return;

    const cameraPos = cameraPosition ?? { x: 0, y: 0, z: 4 };

    // Create camera factory for orthographic mode
    const cameraFactory = orthographic
      ? () => createTopDownOrthoCamera({
          extent: orthographicExtent,
          height: cameraPos.y ?? 0,
          position: cameraPos,
          lookAt: cameraLookAt ? (Array.isArray(cameraLookAt) ? cameraLookAt : [cameraLookAt.x, cameraLookAt.y, cameraLookAt.z]) : [0, 0, 0],
          ...(cameraUp ? { up: [cameraUp.x ?? 0, cameraUp.y ?? 1, cameraUp.z ?? 0] } : {}),
        })
      : undefined;

    const { scene, camera, renderer, textureLoader, start, stop, dispose } = prepareScene({
      canvas,
      container,
      dprCap,
      cameraConfig: orthographic ? undefined : {
        position: cameraPos,
        lookAt: cameraLookAt,
      },
      cameraFactory,
    });

    // Store camera ref for scroll zoom hook
    cameraRef.current = camera;

    const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity);
    const keyLight = new THREE.DirectionalLight(0xffffff, lightIntensity);
    keyLight.position.set(lightPosition[0] ?? 3, lightPosition[1] ?? 2, lightPosition[2] ?? 4);
    scene.add(ambient, keyLight);

    let stars = null;
    let starsTexture = null;
    if (showStarBackground) {
      starsTexture = textureLoader.load('/textures/stars_texture.webp');
      starsTexture.colorSpace = THREE.SRGBColorSpace;
      starsTexture.wrapS = THREE.RepeatWrapping;
      starsTexture.wrapT = THREE.RepeatWrapping;
      stars = new THREE.Mesh(
        new THREE.SphereGeometry(200, 64, 64),
        new THREE.MeshBasicMaterial({ map: starsTexture, side: THREE.BackSide }),
      );
      stars.material.color.setScalar(0.35);
      scene.add(stars);
    }

    const spinSpeed = THREE.MathUtils.degToRad(
      typeof spinDegPerSec === 'number' ? spinDegPerSec : config.spinDegPerSec,
    );

    const simHandle = planetKey === 'saturn'
      ? addSaturn(scene, {
          textureUrl: config.textureUrl,
          ringTextureUrl: config.ringTextureUrl,
          radius,
          position: [0, 0, 0],
          spinSpeed,
          initialSpinDeg,
          spinAxis: config.spinAxis,
          renderer,
          textureLoader,
          ringsSpin,
          ringAngle,
          ringInnerScale: config.ringInnerScale,
          ringOuterScale: config.ringOuterScale,
          ringMaterialOptions: ringColor !== undefined ? { color: new THREE.Color(ringColor) } : {},
          tiltDeg:
            tiltDeg ??
            (Array.isArray(config.tiltDeg) ? config.tiltDeg : [0, 0.0, 26.7]),
        })
      : addSpinningPlanet(scene, {
          textureUrl: config.textureUrl,
          radius,
          position: [0, 0, 0],
          spinSpeed,
          initialSpinDeg,
          renderer,
          textureLoader,
          tiltDeg: tiltDeg ?? config.tiltDeg ?? 0,
        });

    if (planetKey === 'saturn' && ringShadow && simHandle.ringMesh) {
      applyRingShadow(simHandle.ringMesh.material, {
        center: new THREE.Vector3(0, 0, 0),
        radius,
        lightDir: keyLight.position.clone().normalize(),
      });
    }

    if (typeof textureContrast === 'number') {
      const material =
        planetKey === 'saturn' ? simHandle.planetMaterial : simHandle.material;
      applyContrastMaterial(material, textureContrast);
    }

    // Night lights and the atmosphere shade by the sun's direction in view space;
    // the camera never rotates, so that direction is fixed.
    camera.updateMatrixWorld();
    const sunDirView = keyLight.position.clone().normalize().transformDirection(camera.matrixWorldInverse);
    let nightTexture = null;
    if (nightLights && planetKey === 'earth' && simHandle.material) {
      nightTexture = textureLoader.load('/textures/earth_nighttime_texture.webp');
      nightTexture.colorSpace = THREE.SRGBColorSpace;
      nightTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      applyEarthSurface(simHandle.material, { nightMap: nightTexture, lightDirView: sunDirView });
    }
    let atmosphereHandle = null;
    if (atmosphere) {
      atmosphereHandle = createAtmosphere({
        radius,
        lightDirView: sunDirView,
        ...(typeof atmosphere === 'string' ? { color: atmosphere } : {}),
        ...(typeof atmosphere === 'object' ? atmosphere : {}),
      });
      scene.add(atmosphereHandle.group);
    }

    const extensionFns = Array.isArray(extensions) ? extensions : [];
    const extensionHandles = extensionFns
      .filter(Boolean)
      .map((ext) => {
        if (typeof ext !== 'function') return null;
        try {
          return (
            ext({
              THREE,
              scene,
              camera,
              renderer,
              textureLoader,
              simHandle,
              planetKey,
              radius,
            }) ?? null
          );
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    start((delta, elapsed) => {
      if (pausedRef.current) return;
      simHandle.update(delta);
      if (stars) stars.rotation.y -= 0.003 * delta;
      for (const handle of extensionHandles) {
        try {
          handle?.update?.(delta, elapsed);
        } catch {
          // ignore extension errors
        }
      }
    });

    return () => {
      stop();
      for (const handle of extensionHandles) {
        try {
          handle?.dispose?.();
        } catch {
          // ignore extension errors
        }
      }
      simHandle.dispose();
      nightTexture?.dispose?.();
      if (atmosphereHandle) {
        scene.remove(atmosphereHandle.group);
        atmosphereHandle.dispose();
      }
      if (stars) {
        scene.remove(stars);
        stars.geometry.dispose();
        stars.material.dispose();
      }
      starsTexture?.dispose?.();
      dispose();
      cameraRef.current = null;
    };
  }, [
    cameraLookAt,
    cameraPosition,
    config,
    dprCap,
    extensions,
    initialSpinDeg,
    planetKey,
    radius,
    ringsSpin,
    ringAngle,
    spinDegPerSec,
    textureContrast,
    tiltDeg,
    lightIntensity,
    lightPositionKey,
    ringColor,
    ringShadow,
    ambientIntensity,
    orthographic,
    orthographicExtent,
    cameraUp,
    showStarBackground,
    nightLights,
    atmosphere,
  ]);

  // Enable scroll-based zoom if requested
  useScrollZoom(containerRef, cameraRef.current, {
    enabled: scrollZoom,
    ...scrollZoomOptions,
  });

  useEffect(() => {
    if (showPause) return;
    pausedRef.current = false;
    setPaused(false);
    const el = containerRef.current?.closest('.sim-stage') ?? containerRef.current;
    if (el && !el.classList.contains('is-visible')) el.classList.add('is-visible');
    madeVisibleRef.current = true;
  }, [showPause]);

  const onToggle = () => {
    pausedRef.current = !pausedRef.current;
    const nowPaused = pausedRef.current;
    setPaused(nowPaused);

    if (!nowPaused && !madeVisibleRef.current) {
      madeVisibleRef.current = true;
      const el = containerRef.current?.closest('.sim-stage') ?? containerRef.current;
      if (el && !el.classList.contains('is-visible')) el.classList.add('is-visible');
    }
  };

  if (!config) {
    return (
      <div className="sim-stage centered_flex" id={`stage-${id}`}>
        <p>Unknown planet: {planet}</p>
      </div>
    );
  }

  return (
    <SimStage
      id={id}
      aspect={aspect}
      containerRef={containerRef}
      canvasRef={canvasRef}
      paused={paused}
      onToggle={onToggle}
      showPause={showPause}
    />
  );
}
