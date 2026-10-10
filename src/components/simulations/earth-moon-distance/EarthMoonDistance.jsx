import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from '../lib/simStage.jsx';
import { prepareScene } from '../lib/threeCore.js';

const EARTH_RADIUS_KM = 6371;
const MOON_RADIUS_KM = 1737.4;

// Scene layout in world units, with Earth's radius = 1. The two bodies are
// drawn at their true relative sizes, but the gap between them is NOT to
// scale: at true scale the Moon sits ~60 Earth radii away and both bodies
// would shrink to a few pixels.
const EARTH_RADIUS = 1;
const MOON_RADIUS = MOON_RADIUS_KM / EARTH_RADIUS_KM;
const EARTH_X = -1.5;
const MOON_X = 2.05;
const HALF_WIDTH = 2.75; // visible half-width the camera always keeps in frame
const MIN_HALF_HEIGHT = 1.25; // enough vertical room for Earth on very wide stages

export default function EarthMoonDistance({
  id = 'earth-moon-distance',
  aspect = '16 / 9',
  showPause = true,
  dprCap = 1.5,
  earthTexture = '/textures/earth-texture-nasa.webp',
  moonTexture = '/textures/moon_texture.webp',
  starsTexture = '/textures/stars_texture.jpg',
  distanceKm = 384400,
  // Seconds per full turn. Earth spins once a day; the real Moon turns once
  // every 27.3 days, which would look frozen here, so it is shown faster.
  earthRotationSeconds = 24,
  moonRotationSeconds = 72,
  directionalLightIntensity = 2.2,
  ambientLightIntensity = 0.32,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRef = useRef(null);
  const simControlsRef = useRef(null);

  const pausedRef = useRef(true);
  const [paused, setPaused] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const madeVisibleRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    // Orthographic side-on camera that always keeps the full Earth–Moon span
    // in view, and reports where the label should sit above the dashed line.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 500);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    const placeLabel = (halfWidth, halfHeight) => {
      const label = labelRef.current;
      if (!label) return;
      const earthEdge = EARTH_X + EARTH_RADIUS;
      const moonEdge = MOON_X - MOON_RADIUS;
      const midX = (earthEdge + moonEdge) / 2;
      label.style.left = `${((midX + halfWidth) / (2 * halfWidth)) * 100}%`;
      // never wider than the gap between the two bodies (minus a little air)
      label.style.width = `${((moonEdge - earthEdge - 0.2) / (2 * halfWidth)) * 100}%`;
      // sit just above the line, which runs through the vertical centre
      label.style.bottom = `${50 + (0.09 / halfHeight) * 50}%`;
    };

    const onResize = ({ width = 1, height = 1 }) => {
      const viewAspect = width / height || 1;
      const halfWidth = Math.max(HALF_WIDTH, MIN_HALF_HEIGHT * viewAspect);
      const halfHeight = halfWidth / viewAspect;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      placeLabel(halfWidth, halfHeight);
    };

    const { scene, renderer, textureLoader, start, stop, dispose } = prepareScene({
      canvas,
      container,
      dprCap,
      background: 0x000000,
      cameraFactory: () => ({ camera, onResize }),
    });

    function loadMap(url, { repeatWrap = false } = {}) {
      const t = textureLoader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (repeatWrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      return t;
    }

    function makeBody(radius, map, tiltDeg, x) {
      const material = new THREE.MeshStandardMaterial({ map, roughness: 1.0, metalness: 0.0 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 96), material);
      // tilt lives on a parent so the spin stays around the body's own axis
      const pivot = new THREE.Group();
      pivot.rotation.z = THREE.MathUtils.degToRad(tiltDeg);
      pivot.position.set(x, 0, 0);
      pivot.add(mesh);
      scene.add(pivot);
      return { mesh, material };
    }

    const mapEarth = loadMap(earthTexture);
    const mapMoon = loadMap(moonTexture);
    const mapStars = loadMap(starsTexture, { repeatWrap: true });

    const earth = makeBody(EARTH_RADIUS, mapEarth, -23.44, EARTH_X);
    const moon = makeBody(MOON_RADIUS, mapMoon, -6.68, MOON_X);

    // Dashed line from centre to centre; the parts inside the spheres are
    // hidden by them, so it appears to run surface to surface.
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(EARTH_X, 0, 0),
      new THREE.Vector3(MOON_X, 0, 0),
    ]);
    const lineMaterial = new THREE.LineDashedMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      dashSize: 0.06,
      gapSize: 0.05,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.computeLineDistances();
    scene.add(line);

    const stars = new THREE.Mesh(
      new THREE.SphereGeometry(200, 64, 64),
      new THREE.MeshBasicMaterial({ map: mapStars, side: THREE.BackSide }),
    );
    stars.material.color.setScalar(0.05);
    scene.add(stars);

    const sun = new THREE.DirectionalLight(0xffffff, directionalLightIntensity);
    // mostly from the viewer's side, so both discs read as lit globes
    sun.position.set(1.5, 1.2, 4).normalize();
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, ambientLightIntensity));

    const earthRadPerSec = (2 * Math.PI) / Math.max(earthRotationSeconds, 0.001);
    const moonRadPerSec = (2 * Math.PI) / Math.max(moonRotationSeconds, 0.001);

    let loopActive = false;
    const animate = (delta = 0) => {
      earth.mesh.rotation.y += earthRadPerSec * delta;
      moon.mesh.rotation.y += moonRadPerSec * delta;
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

      earth.mesh.geometry.dispose();
      moon.mesh.geometry.dispose();
      stars.geometry.dispose();
      lineGeometry.dispose();

      earth.material.dispose();
      moon.material.dispose();
      stars.material.dispose();
      lineMaterial.dispose();

      mapEarth?.dispose?.();
      mapMoon?.dispose?.();
      mapStars?.dispose?.();
      dispose();
    };
  }, [
    dprCap,
    earthTexture,
    moonTexture,
    starsTexture,
    earthRotationSeconds,
    moonRotationSeconds,
    directionalLightIntensity,
    ambientLightIntensity,
  ]);

  const onToggle = () => {
    pausedRef.current = !pausedRef.current;
    const nowPaused = pausedRef.current;
    setPaused(nowPaused);

    if (!nowPaused && !madeVisibleRef.current) {
      madeVisibleRef.current = true;
      setRevealed(true);
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
    >
      <div
        ref={labelRef}
        className={`emd-label${revealed ? ' is-revealed' : ''}`}
        aria-label={`Average Earth–Moon distance: ${distanceKm.toLocaleString('en-US')} kilometres. Not to scale.`}
      >
        <span className="emd-label-distance">{distanceKm.toLocaleString('en-US')} km</span>
        <span className="emd-label-note">Not to scale</span>
      </div>
    </SimStage>
  );
}
