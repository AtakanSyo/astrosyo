import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from '../lib/simStage.jsx';
import { prepareScene } from '../lib/threeCore.js';

// Scene layout in world units, with the body's radius = 1.
// The body sits left of centre with a dashed dimension line under it
// (drawing-style: two extension lines dropping from its limbs), and the
// facts column sits to its right.
const BODY_RADIUS = 1;
const BODY_X = -1.15;
const BODY_Y = 0.24;
const DIM_Y = BODY_Y - BODY_RADIUS - 0.2; // height of the dimension line
const FACTS_X = 0.45; // left edge of the facts column
const HALF_WIDTH = 2.667; // visible half-width the camera always keeps in frame
const MIN_HALF_HEIGHT = 1.5; // vertical room for the body plus the dimension label

// The display font has no superscript glyphs, so "10²²" would fall back to a
// heavier system font. Turn runs of Unicode superscripts into real <sup> tags
// set in the display font's ordinary digits.
const SUPERSCRIPTS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−', '⁺': '+' };
function renderValue(value) {
  return String(value)
    .split(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)/)
    .filter(Boolean)
    .map((part, i) =>
      SUPERSCRIPTS[part[0]] !== undefined
        ? <sup key={i}>{[...part].map((ch) => SUPERSCRIPTS[ch]).join('')}</sup>
        : part,
    );
}

export default function BodyDimensions({
  id = 'body-dimensions',
  aspect = '16 / 9',
  showPause = true,
  dprCap = 1.5,
  texture = '/textures/moon_texture.webp',
  starsTexture = '/textures/stars_texture.jpg',
  diameterKm = 3474,
  diameterLabel = 'Diameter',
  // Extra labelled figures shown beside the body, e.g. mass and gravity.
  facts = [],
  tiltDeg = -6.68,
  rotationSeconds = 72,
  directionalLightIntensity = 2.2,
  ambientLightIntensity = 0.32,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const dimLabelRef = useRef(null);
  const factsRef = useRef(null);
  const simControlsRef = useRef(null);

  const pausedRef = useRef(true);
  const [paused, setPaused] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const madeVisibleRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 500);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    // Keep the HTML labels pinned to their spots in the 3D scene.
    const placeLabels = (halfWidth, halfHeight) => {
      const leftPct = (x) => ((x + halfWidth) / (2 * halfWidth)) * 100;
      const topPct = (y) => ((halfHeight - y) / (2 * halfHeight)) * 100;

      const dimLabel = dimLabelRef.current;
      if (dimLabel) {
        dimLabel.style.left = `${leftPct(BODY_X)}%`;
        dimLabel.style.top = `${topPct(DIM_Y - 0.07)}%`;
      }

      const factsEl = factsRef.current;
      if (factsEl) {
        factsEl.style.left = `${leftPct(FACTS_X)}%`;
        factsEl.style.top = `${topPct(BODY_Y)}%`;
        factsEl.style.width = `${100 - leftPct(FACTS_X) - 3}%`;
      }
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
      placeLabels(halfWidth, halfHeight);
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

    const mapBody = loadMap(texture);
    const mapStars = loadMap(starsTexture, { repeatWrap: true });

    const bodyMaterial = new THREE.MeshStandardMaterial({ map: mapBody, roughness: 1.0, metalness: 0.0 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(BODY_RADIUS, 96, 96), bodyMaterial);
    // tilt lives on a parent so the spin stays around the body's own axis
    const pivot = new THREE.Group();
    pivot.rotation.z = THREE.MathUtils.degToRad(tiltDeg);
    pivot.position.set(BODY_X, BODY_Y, 0);
    pivot.add(body);
    scene.add(pivot);

    // Dashed dimension line under the body, plus the two extension lines that
    // drop from its left and right limbs down to it.
    const left = BODY_X - BODY_RADIUS;
    const right = BODY_X + BODY_RADIUS;
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(left, DIM_Y, 0),
      new THREE.Vector3(right, DIM_Y, 0),
      new THREE.Vector3(left, BODY_Y, 0),
      new THREE.Vector3(left, DIM_Y - 0.06, 0),
      new THREE.Vector3(right, BODY_Y, 0),
      new THREE.Vector3(right, DIM_Y - 0.06, 0),
    ]);
    const lineMaterial = new THREE.LineDashedMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      dashSize: 0.06,
      gapSize: 0.05,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    lines.computeLineDistances();
    scene.add(lines);

    const stars = new THREE.Mesh(
      new THREE.SphereGeometry(200, 64, 64),
      new THREE.MeshBasicMaterial({ map: mapStars, side: THREE.BackSide }),
    );
    stars.material.color.setScalar(0.05);
    scene.add(stars);

    const sun = new THREE.DirectionalLight(0xffffff, directionalLightIntensity);
    // mostly from the viewer's side, so the disc reads as a lit globe
    sun.position.set(1.5, 1.2, 4).normalize();
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, ambientLightIntensity));

    const radPerSec = (2 * Math.PI) / Math.max(rotationSeconds, 0.001);

    let loopActive = false;
    const animate = (delta = 0) => {
      body.rotation.y += radPerSec * delta;
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

      body.geometry.dispose();
      stars.geometry.dispose();
      lineGeometry.dispose();

      bodyMaterial.dispose();
      stars.material.dispose();
      lineMaterial.dispose();

      mapBody?.dispose?.();
      mapStars?.dispose?.();
      dispose();
    };
  }, [
    dprCap,
    texture,
    starsTexture,
    tiltDeg,
    rotationSeconds,
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

  const revealClass = revealed ? ' is-revealed' : '';

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
      <div ref={dimLabelRef} className={`bd-dimension${revealClass}`}>
        <span className="bd-value">{diameterKm.toLocaleString('en-US')} km</span>
        <span className="bd-caption">{diameterLabel}</span>
      </div>

      {facts.length > 0 && (
        <dl ref={factsRef} className={`bd-facts${revealClass}`}>
          {facts.map((fact) => (
            <div className="bd-fact" key={fact.label}>
              <dd className="bd-value">{renderValue(fact.value)}</dd>
              <dt className="bd-caption">{fact.label}</dt>
              {fact.note && <dd className="bd-note">{fact.note}</dd>}
            </div>
          ))}
        </dl>
      )}
    </SimStage>
  );
}
