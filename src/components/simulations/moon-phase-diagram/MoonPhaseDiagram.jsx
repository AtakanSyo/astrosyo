import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from '../lib/simStage.jsx';
import { prepareScene } from '../lib/threeCore.js';
import {
  createAtmosphereShell,
  createBarycentricDisc,
  createOrbitRing,
  createOrthoTopDownCamera,
  createStar,
} from '../lib/starSystemCore.js';
import { daysIntoCycle, illuminatedFraction, phaseName, SYNODIC_MONTH_DAYS } from './moonPhase.js';

/**
 * Top-down diagram of why the Moon has phases.
 *
 * Earth sits at the centre of a dashed orbit, the Moon goes round it
 * counter-clockwise (the view is from above the north pole), and the Sun sits
 * off to the right. A triangle joins the three. An inset in the corner shows
 * the Moon as it looks from Earth at that moment.
 *
 * Sunlight is modelled as parallel rays (a directional light), because the
 * real Sun is ~400× farther away than the Moon. The Sun drawn in the scene is
 * a marker for the direction of the light, not its true distance.
 *
 * The inset is not a separate drawing: it is the same Moon in the same light,
 * rendered by a second camera placed at Earth and pointed at the Moon. So the
 * phase it shows follows from the geometry on screen.
 */

// Scene sizes, in world units. Not to scale: at true scale the Moon would be
// 30 Earth-diameters away and the Sun ~12,000.
const ORBIT_RADIUS = 6;
const EARTH_RADIUS = 1.3;
const MOON_RADIUS = 0.75;
const SUN_RADIUS = 1.5;
const VERTICAL_EXTENT = ORBIT_RADIUS + MOON_RADIUS + 0.6;
const CAMERA_MARGIN = 1.12;
const EDGE_GAP = 0.9;
// Extra room on the left so the Moon's label still fits when the Moon is at its leftmost point.
const MOON_LABEL_GAP = 2.6;

// The inset camera only renders objects on this layer (the Moon and the lights).
const INSET_LAYER = 1;
// Inset square: side and gap from the top-right corner, as fractions of stage height.
const INSET_SIZE = 0.32;
const INSET_PAD = 0.04;

export default function MoonPhaseDiagram({
  id = 'moon-phase-diagram',
  aspect = '16 / 9',
  dprCap = 1.5,
  showPause = true,
  cycleSeconds = 24,
  startElongationDeg = 40,
  earthTextureUrl = '/textures/earth_daytime_texture.webp',
  moonTextureUrl = '/textures/moon_texture.webp',
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(true);
  const hasPlayedRef = useRef(false);
  const coreHandleRef = useRef(null);
  const [paused, setPaused] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  // Overlay elements are updated directly each frame instead of through React state.
  const insetFrameRef = useRef(null);
  const phaseNameRef = useRef(null);
  const phaseDetailRef = useRef(null);
  const sunLabelRef = useRef(null);
  const earthLabelRef = useRef(null);
  const moonLabelRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    // ---------- Cameras ----------
    const insetCamera = new THREE.PerspectiveCamera(
      // Field of view chosen so the Moon fills about 70% of the inset.
      THREE.MathUtils.radToDeg(2 * Math.asin(MOON_RADIUS / ORBIT_RADIUS)) / 0.7,
      1,
      0.1,
      100,
    );
    insetCamera.up.set(0, 1, 0); // north up, as seen from Earth's northern hemisphere
    insetCamera.layers.set(INSET_LAYER);

    // Positions that depend on the stage's shape; filled in by applyLayout().
    const layout = { earthX: 0, sunX: 0, halfWidth: 0 };
    let applyLayout = () => {};

    const viewportSize = new THREE.Vector2();
    const renderOverride = ({ renderer, scene, camera }) => {
      renderer.getSize(viewportSize);
      const { x: width, y: height } = viewportSize;

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.render(scene, camera);

      // Inset: the Moon as seen from Earth, top-right corner.
      const side = Math.round(height * INSET_SIZE);
      const pad = Math.round(height * INSET_PAD);
      const insetX = width - side - pad;
      const insetY = height - side - pad; // WebGL viewports are measured from the bottom
      renderer.setViewport(insetX, insetY, side, side);
      renderer.setScissor(insetX, insetY, side, side);
      renderer.setScissorTest(true);
      renderer.render(scene, insetCamera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);

      const frame = insetFrameRef.current;
      if (frame) {
        frame.style.width = `${side}px`;
        frame.style.height = `${side}px`;
        frame.style.top = `${pad}px`;
        frame.style.right = `${pad}px`;
      }
    };

    const core = prepareScene({
      canvas,
      container,
      background: 0x000000,
      dprCap,
      alpha: true,
      antialias: true,
      renderOverride,
      cameraFactory: () => {
        const base = createOrthoTopDownCamera({
          extent: () => VERTICAL_EXTENT,
          height: 40,
          margin: CAMERA_MARGIN,
        });
        return {
          camera: base.camera,
          onResize: (size) => {
            base.onResize(size);
            applyLayout(base.camera.right);
          },
        };
      },
    });
    const { scene, camera, textureLoader, start, stop, renderOnce, dispose: disposeCore } = core;

    const renderIfPaused = () => {
      if (pausedRef.current) renderOnce();
    };

    // ---------- Light: parallel rays from the Sun's direction ----------
    const sunlight = new THREE.DirectionalLight(0xffffff, 3.2);
    sunlight.layers.enable(INSET_LAYER);
    scene.add(sunlight);
    scene.add(sunlight.target);
    // A little fill so the night side of the Moon stays faintly visible.
    const fill = new THREE.AmbientLight(0xffffff, 0.05);
    fill.layers.enable(INSET_LAYER);
    scene.add(fill);

    // ---------- Sun (a marker; the light itself is the directional light) ----------
    const sunEntry = createStar({
      radius: SUN_RADIUS,
      color: 0xffd398,
      intensity: 0,
      glowStrength: 1.6,
    });
    scene.add(sunEntry.mesh);

    // ---------- Earth, its orbit ring and the faint disc ----------
    const earthSystem = new THREE.Group();
    scene.add(earthSystem);

    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 32);
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x4aa8ff, roughness: 0.6, metalness: 0 });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    const atmosphereEntry = createAtmosphereShell({
      radius: EARTH_RADIUS * 1.04,
      color: 0x74d2ff,
      opacity: 0.18,
    });
    earthMesh.add(atmosphereEntry.mesh);
    earthSystem.add(earthMesh);

    const discEntry = createBarycentricDisc({
      inner: 0,
      outer: ORBIT_RADIUS + MOON_RADIUS,
      opacity: 0.06,
    });
    earthSystem.add(discEntry.mesh);

    const orbitEntry = createOrbitRing({
      radius: ORBIT_RADIUS,
      segments: 256,
      dashSize: 0.5,
      gapSize: 0.4,
      opacity: 0.6,
    });
    earthSystem.add(orbitEntry.line);

    // ---------- Moon ----------
    const moonGeo = new THREE.SphereGeometry(MOON_RADIUS, 64, 32);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 1, metalness: 0 });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.layers.enable(INSET_LAYER);
    scene.add(moonMesh);

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
    loadTexture(moonTextureUrl, moonMat);

    // ---------- Sun–Earth–Moon triangle ----------
    const trianglePositions = new Float32Array(9);
    const triangleGeo = new THREE.BufferGeometry();
    triangleGeo.setAttribute('position', new THREE.BufferAttribute(trianglePositions, 3));
    const triangleMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    const triangle = new THREE.LineLoop(triangleGeo, triangleMat);
    scene.add(triangle);

    // ---------- State and per-frame update ----------
    const state = { elongation: THREE.MathUtils.degToRad(startElongationDeg) };
    const projected = new THREE.Vector3();
    let lastPhaseName = '';
    let lastDetail = '';

    const placeLabel = (el, x, z, offsetY) => {
      if (!el) return;
      projected.set(x, 0, z).project(camera);
      const width = container.clientWidth;
      const height = container.clientHeight;
      const left = ((projected.x + 1) / 2) * width;
      const top = ((1 - projected.y) / 2) * height + offsetY;
      el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, -50%)`;
    };

    const update = () => {
      // Counter-clockwise on screen: +x is right, and "up" on screen is −z.
      const moonX = layout.earthX + Math.cos(state.elongation) * ORBIT_RADIUS;
      const moonZ = -Math.sin(state.elongation) * ORBIT_RADIUS;
      moonMesh.position.set(moonX, 0, moonZ);
      // Tidally locked: the texture's near side (its +x) always faces Earth.
      moonMesh.rotation.y = state.elongation + Math.PI;

      insetCamera.position.set(layout.earthX, 0, 0);
      insetCamera.lookAt(moonMesh.position);

      trianglePositions.set([layout.sunX, 0, 0, layout.earthX, 0, 0, moonX, 0, moonZ]);
      triangleGeo.attributes.position.needsUpdate = true;
      triangleGeo.computeBoundingSphere();

      const pxPerUnit = container.clientHeight / (2 * VERTICAL_EXTENT * CAMERA_MARGIN);
      placeLabel(sunLabelRef.current, layout.sunX, 0, (SUN_RADIUS + 0.9) * pxPerUnit);
      placeLabel(earthLabelRef.current, layout.earthX, 0, (EARTH_RADIUS + 0.9) * pxPerUnit);
      // Push the Moon's label outward, away from Earth, so it never sits on the orbit line.
      const outward = MOON_RADIUS + 1.1;
      placeLabel(
        moonLabelRef.current,
        moonX + Math.cos(state.elongation) * outward,
        moonZ - Math.sin(state.elongation) * outward,
        0,
      );

      const deg = THREE.MathUtils.radToDeg(state.elongation);
      const name = phaseName(deg);
      if (name !== lastPhaseName && phaseNameRef.current) {
        phaseNameRef.current.textContent = name;
        lastPhaseName = name;
      }
      const detail = `Day ${daysIntoCycle(deg).toFixed(1)} of ${SYNODIC_MONTH_DAYS.toFixed(1)} · ${Math.round(
        illuminatedFraction(deg) * 100,
      )}% lit`;
      if (detail !== lastDetail && phaseDetailRef.current) {
        phaseDetailRef.current.textContent = detail;
        lastDetail = detail;
      }
    };

    applyLayout = (halfWidth) => {
      layout.halfWidth = halfWidth;
      // Earth and its orbit hug the left edge; the Sun hugs the right edge.
      layout.earthX = -halfWidth + ORBIT_RADIUS + MOON_RADIUS + MOON_LABEL_GAP;
      layout.sunX = halfWidth - SUN_RADIUS - EDGE_GAP;
      earthSystem.position.set(layout.earthX, 0, 0);
      sunEntry.mesh.position.set(layout.sunX, 0, 0);
      // Direction only: every object is lit from the Sun's side by parallel rays.
      sunlight.position.set(layout.sunX, 0, 0);
      sunlight.target.position.set(layout.earthX, 0, 0);
      sunlight.target.updateMatrixWorld();
      update();
      renderIfPaused();
    };

    const angularSpeed = (Math.PI * 2) / Math.max(1, cycleSeconds);
    const tick = (delta) => {
      if (pausedRef.current) return;
      const dt = Math.min(delta ?? 0, 0.05);
      state.elongation = (state.elongation + angularSpeed * dt) % (Math.PI * 2);
      // Earth's spin is slowed right down; at true rate it would turn ~29 times per lap.
      earthMesh.rotation.y += dt * 0.5;
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
      atmosphereEntry.geometry.dispose();
      atmosphereEntry.material.dispose();
      discEntry.geometry.dispose();
      discEntry.material.dispose();
      orbitEntry.geometry.dispose();
      orbitEntry.material.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      moonGeo.dispose();
      moonMat.dispose();
      triangleGeo.dispose();
      triangleMat.dispose();
    };
  }, [cycleSeconds, dprCap, earthTextureUrl, moonTextureUrl, startElongationDeg]);

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
    fontSize: 'clamp(0.6rem, 1.3vw, 0.8rem)',
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
        <span ref={moonLabelRef} style={bodyLabelStyle}>Moon</span>

        <div
          ref={insetFrameRef}
          style={{
            position: 'absolute',
            boxSizing: 'border-box',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '10px',
          }}
        >
          {/* Caption sits beside the frame, not inside it: on phones the frame is too small to hold it */}
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: '100%',
              marginRight: '0.6em',
              whiteSpace: 'nowrap',
              textAlign: 'right',
              fontSize: 'clamp(0.55rem, 1.2vw, 0.75rem)',
              lineHeight: 1.6,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            Seen from Earth
          </span>
        </div>

        {/* Bottom-right: the bottom-left corner is under the Moon's orbit */}
        <div style={{ position: 'absolute', right: '4%', bottom: '6%', textAlign: 'right' }}>
          <div
            ref={phaseNameRef}
            style={{
              fontFamily: 'var(--font-secondary)',
              fontSize: 'clamp(1rem, 2.6vw, 1.6rem)',
              lineHeight: 1.2,
            }}
          />
          <div
            ref={phaseDetailRef}
            style={{
              marginTop: '0.2em',
              fontSize: 'clamp(0.65rem, 1.4vw, 0.85rem)',
              color: 'rgba(255, 255, 255, 0.7)',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
        </div>
      </div>
    </SimStage>
  );
}
