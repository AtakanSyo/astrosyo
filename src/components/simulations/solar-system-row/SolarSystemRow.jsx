import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { prepareScene, addSpinningPlanet, addSaturn, createTopDownOrthoCamera } from '../lib/threeCore';
import { applyRingShadow } from '../lib/ringShadow.js';
import SimStage from '../lib/simStage.jsx';

// tiltDeg rolls each planet's spin axis in the picture plane by its real axial
// tilt (Venus and Uranus spin backwards, so their tilt is given for that spin).
const PLANET_DATA = [
  {
    name: 'Mercury',
    diameterKm: 4879,
    radiusRelativeToEarth: 0.383,
    textureUrl: '/textures/mercury_texture.webp',
    spinDegPerSec: 5,
    tiltDeg: 0.03,
  },
  {
    name: 'Venus',
    diameterKm: 12104,
    radiusRelativeToEarth: 0.949,
    textureUrl: '/textures/2k_venus_atmosphere.webp',
    spinDegPerSec: -2, // retrograde
    tiltDeg: 2.6,
  },
  {
    name: 'Earth',
    diameterKm: 12742,
    radiusRelativeToEarth: 1,
    textureUrl: '/textures/earth_daytime_texture.webp',
    spinDegPerSec: 12,
    tiltDeg: 23.4,
  },
  {
    name: 'Mars',
    diameterKm: 6779,
    radiusRelativeToEarth: 0.532,
    textureUrl: '/textures/mars_texture.webp',
    spinDegPerSec: 10,
    tiltDeg: 25.2,
  },
  {
    name: 'Jupiter',
    diameterKm: 139820,
    radiusRelativeToEarth: 11.21,
    textureUrl: '/textures/8k_jupiter.webp',
    spinDegPerSec: 14,
    tiltDeg: 3.1,
  },
  {
    name: 'Saturn',
    diameterKm: 116460,
    radiusRelativeToEarth: 9.45,
    textureUrl: '/textures/saturn_texture.webp',
    ringTextureUrl: '/textures/saturns_rings_texture.webp',
    spinDegPerSec: 26,
    ringInnerScale: 1.4,
    ringOuterScale: 2.6,
    tiltDeg: [18, 0, 8], // the same view of the rings as the Saturn post
    spinAxis: [0, 1.0, 0],
    ringsSpin: false,
    ringAngle: 0,
  },
  {
    name: 'Uranus',
    diameterKm: 50724,
    radiusRelativeToEarth: 4.01,
    textureUrl: '/textures/uranus_texture.webp',
    spinDegPerSec: -24,
    tiltDeg: 97.8,
  },
  {
    name: 'Neptune',
    diameterKm: 49244,
    radiusRelativeToEarth: 3.88,
    textureUrl: '/textures/neptune_texture.webp',
    spinDegPerSec: 20,
    tiltDeg: 28.3,
  },
];

const INNER = 4; // Mercury–Mars, labelled as a group when there's no room for each
const LIGHT_POSITION = [-6, 1.5, 2.5]; // sunlight from the left, beyond Mercury
const FILL = 0.88; // fraction of the canvas width the row spans
const TILT_DEG = 50; // inner-planet labels rise up and to the right at this angle
const TILT_RAD = (TILT_DEG * Math.PI) / 180;

export default function SolarSystemRow({
  id = 'solar-system-row',
  aspect = '21 / 9',
  dprCap = 1.5,
  sizeScale = 0.085,
  showPause = true,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRefs = useRef([]);
  const groupLabelRef = useRef(null);
  const pausedRef = useRef(true);
  const [paused, setPaused] = useState(true);
  const madeVisibleRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !container) return;

    const gap = sizeScale * 0.9;

    // Horizontal room each planet needs: its radius, or Saturn's ring reach.
    const halfWidth = (planet, radius) =>
      planet.ringTextureUrl ? radius * planet.ringOuterScale : radius;

    let cursor = 0;
    const placements = PLANET_DATA.map((planet) => {
      const radius = planet.radiusRelativeToEarth * sizeScale;
      const half = halfWidth(planet, radius);
      const x = cursor + half;
      cursor = x + half + gap;
      return { ...planet, radius, position: [x, 0, 0] };
    });
    const totalWidth = cursor - gap;
    placements.forEach((p) => {
      p.position[0] -= totalWidth / 2;
    });
    const maxRadius = Math.max(...placements.map((p) => p.radius));

    // Fit the row to the canvas width (the camera extent is half the view height).
    const margin = 1.1;
    const extent = () => {
      const ratio = container.clientWidth / Math.max(1, container.clientHeight) || 21 / 9;
      return Math.max(totalWidth / 2 / FILL / ratio / margin, maxRadius * 1.9);
    };

    const core = prepareScene({
      canvas,
      container,
      dprCap,
      background: 0x000000,
      cameraFactory: () =>
        createTopDownOrthoCamera({
          extent,
          height: 8,
          margin,
          position: [0, 0, 8],
          up: [0, 1, 0],
          lookAt: [0, 0, 0],
        }),
    });

    const { scene, camera, renderer, textureLoader, start, stop, dispose } = core;

    const ambient = new THREE.AmbientLight(0xffffff, 0.08);
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(...LIGHT_POSITION);
    scene.add(ambient, sun);

    const createdPlanets = placements.map((placement) => {
      if (placement.ringTextureUrl) {
        const saturn = addSaturn(scene, {
          textureUrl: placement.textureUrl,
          ringTextureUrl: placement.ringTextureUrl,
          position: placement.position,
          radius: placement.radius,
          spinSpeed: THREE.MathUtils.degToRad(placement.spinDegPerSec),
          spinAxis: placement.spinAxis,
          renderer,
          textureLoader,
          ringInnerScale: placement.ringInnerScale,
          ringOuterScale: placement.ringOuterScale,
          ringAngle: placement.ringAngle ?? 0,
          tiltDeg: placement.tiltDeg,
          ringsSpin: placement.ringsSpin ?? false,
          ringMaterialOptions: { color: new THREE.Color('#f3e6d0') },
        });
        if (saturn.ringMesh) {
          applyRingShadow(saturn.ringMesh.material, {
            center: new THREE.Vector3(...placement.position),
            radius: placement.radius,
            lightDir: sun.position.clone().normalize(),
          });
        }
        return saturn;
      }

      return addSpinningPlanet(scene, {
        textureUrl: placement.textureUrl,
        position: placement.position,
        radius: placement.radius,
        spinSpeed: THREE.MathUtils.degToRad(placement.spinDegPerSec),
        tiltDeg: [0, 0, -placement.tiltDeg],
        renderer,
        textureLoader,
      });
    });

    // Labels sit on two rails just outside the largest planet, alternating
    // below/above so neighbours never collide; a hairline joins each to its planet.
    // The crowded inner planets all go on the top rail with tilted one-line labels;
    // if those would clip or overlap, they fall back to one group label.
    let lastKey = '';
    const placeLabels = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const span = camera.right - camera.left;
      const vSpan = camera.top - camera.bottom;
      if (!span || !vSpan) return;
      const toX = (x) => ((x - camera.left) / span) * w;
      const toY = (y) => ((camera.top - y) / vSpan) * h;
      const key = `${w}x${h}:${span.toFixed(4)}`;
      if (key === lastKey) return;
      lastKey = key;

      const rail = maxRadius * 1.12;
      const layout = (compact) => {
        placements.forEach((p, i) => {
          const el = labelRefs.current[i];
          if (!el) return;
          const inner = i < INNER;
          const hidden = compact && inner;
          el.style.display = hidden ? 'none' : '';
          if (hidden) return;
          const below = !inner && i % 2 === 0;
          const edge = toY(below ? -p.radius : p.radius);
          const railY = toY(below ? -rail : rail);
          el.style.left = `${toX(p.position[0]).toFixed(1)}px`;
          el.style.top = `${Math.min(edge, railY).toFixed(1)}px`;
          el.style.height = `${Math.abs(railY - edge).toFixed(1)}px`;
          el.classList.toggle('is-below', below);
          el.classList.toggle('is-above', !below);
          el.classList.toggle('is-tilted', inner);
        });
        const group = groupLabelRef.current;
        if (group) {
          group.style.display = compact ? '' : 'none';
          if (compact) {
            // On the top rail (Jupiter's label is below), left-aligned with the cluster.
            const x0 = toX(placements[0].position[0] - placements[0].radius);
            group.style.left = `${Math.max(10, x0).toFixed(1)}px`;
            group.style.top = `${toY(rail).toFixed(1)}px`;
          }
        }
      };

      layout(false);
      const box = container.getBoundingClientRect();
      const tags = labelRefs.current.slice(0, INNER).map((el) => el?.querySelector('.ssr-tag'));
      const clipped = tags.some((t) => {
        const r = t?.getBoundingClientRect();
        return !r || r.top < box.top + 4 || r.right > box.right - 4;
      });
      // Parallel tilted lines need their perpendicular gap to clear the text height.
      const nameEl = tags[0]?.querySelector('.ssr-name');
      const lineHeight = (nameEl ? parseFloat(getComputedStyle(nameEl).fontSize) : 11) * 1.15;
      const crowded = placements.slice(1, INNER).some(
        (p, k) => (toX(p.position[0]) - toX(placements[k].position[0])) * Math.sin(TILT_RAD) < lineHeight + 1,
      );
      if (clipped || crowded) layout(true);
    };

    start((delta) => {
      placeLabels();
      if (pausedRef.current) return;
      createdPlanets.forEach((planet) => planet.update(delta));
    });

    return () => {
      stop();
      createdPlanets.forEach((planet) => planet.dispose());
      dispose();
    };
  }, [dprCap, sizeScale]);

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

  return (
    <SimStage
      id={id}
      aspect={aspect}
      containerRef={containerRef}
      canvasRef={canvasRef}
      paused={paused}
      onToggle={onToggle}
      showPause={showPause}
      style={{ position: 'relative' }}
    >
      <div className="ssr-sunglow" aria-hidden="true" />
      {PLANET_DATA.map((p, i) => (
        <div key={p.name} ref={(el) => (labelRefs.current[i] = el)} className="ssr-label" aria-hidden="true">
          <span className="ssr-tag">
            <span className="ssr-name">{p.name}</span>
            <span className="ssr-km">{p.diameterKm.toLocaleString('en-US')} km</span>
          </span>
        </div>
      ))}
      <div ref={groupLabelRef} className="ssr-group" aria-hidden="true" style={{ display: 'none' }}>
        <span className="ssr-name ssr-group-long">Mercury · Venus · Earth · Mars</span>
        <span className="ssr-name ssr-group-short">Mercury – Mars</span>
      </div>
      <style>{`
        .ssr-sunglow { position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 28% 70% at 0% 50%, rgba(255, 196, 140, 0.16), rgba(255, 196, 140, 0) 70%); }
        .ssr-label { position: absolute; width: 0; pointer-events: none; border-left: 1px solid rgba(255, 255, 255, 0.18); }
        .ssr-tag { position: absolute; left: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;
          gap: 0.05rem; white-space: nowrap; }
        .ssr-label.is-below .ssr-tag { top: calc(100% + 0.25rem); }
        .ssr-label.is-above .ssr-tag { bottom: calc(100% + 0.25rem); flex-direction: column-reverse; }
        .ssr-label.is-tilted .ssr-tag { bottom: calc(100% + 0.2rem); flex-direction: row; align-items: baseline; gap: 0.4rem; line-height: 1.1;
          transform: rotate(-${TILT_DEG}deg); transform-origin: 0 100%; }
        .ssr-label.is-tilted .ssr-km::before { content: '·'; margin-right: 0.4rem; color: rgba(255, 255, 255, 0.3); }
        .ssr-name { font-size: clamp(0.55rem, 1.1vw, 0.75rem); letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 255, 255, 0.85); }
        .ssr-km { font-size: clamp(0.5rem, 0.95vw, 0.66rem); color: rgba(255, 255, 255, 0.45); font-variant-numeric: tabular-nums; }
        .ssr-group { position: absolute; transform: translateY(calc(-100% - 0.25rem)); white-space: nowrap; pointer-events: none; }
        .ssr-group-short { display: none; }
        @media (max-width: 640px) { .ssr-km, .ssr-group-long { display: none; } .ssr-group-short { display: inline; } }
      `}</style>
    </SimStage>
  );
}
