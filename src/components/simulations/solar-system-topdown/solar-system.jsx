import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from '../lib/simStage.jsx';
import { applyRingShadow } from '../lib/ringShadow.js';
import { makeGlowTexture } from '../lib/glow.js';

const RING_INNER = 1.4; // Saturn's rings, in Saturn radii (same as the other Saturn views)
const RING_OUTER = 2.6;


const PLANET_DATA = [
  {
    name: 'Mercury',
    radiusEarth: 0.383,
    orbitDays: 87.969,
    distanceAU: 0.387,
    rotationHours: 1407.6,
    color: 0xc6c0b6,
  },
  {
    name: 'Venus',
    radiusEarth: 0.949,
    orbitDays: 224.701,
    distanceAU: 0.723,
    rotationHours: -5832.5, // retrograde
    color: 0xe0c485,
  },
  {
    name: 'Earth',
    radiusEarth: 1.0,
    orbitDays: 365.256,
    distanceAU: 1.0,
    rotationHours: 23.934,
    color: 0x2f8de6,
  },
  {
    name: 'Mars',
    radiusEarth: 0.532,
    orbitDays: 686.98,
    distanceAU: 1.524,
    rotationHours: 24.623,
    color: 0xd0896d,
  },
  {
    name: 'Jupiter',
    radiusEarth: 11.21,
    orbitDays: 4332.59,
    distanceAU: 5.203,
    rotationHours: 9.925,
    color: 0xeaac77,
  },
  {
    name: 'Saturn',
    radiusEarth: 9.45,
    orbitDays: 10759.22,
    distanceAU: 9.537,
    rotationHours: 10.656,
    color: 0xe5d0a6,
  },
  {
    name: 'Uranus',
    radiusEarth: 4.01,
    orbitDays: 30688.5,
    distanceAU: 19.191,
    rotationHours: -17.24,
    color: 0x7bc7f4,
  },
  {
    name: 'Neptune',
    radiusEarth: 3.88,
    orbitDays: 60182,
    distanceAU: 30.07,
    rotationHours: 16.11,
    color: 0x3553ff,
  },
];

const EMPTY_OPTS = Object.freeze({});
export default function SolarSystemTopDown({
  id = 'solar-system-topdown',
  aspect = '3 / 2',
  showPause = true,
  dprCap = 1.5,
  options,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pausedRef = useRef(true);
  const hasPlayedRef = useRef(false);
  const [paused, setPaused] = useState(true);
  const opts = useMemo(() => options ?? EMPTY_OPTS, [options]);

  // put this helper above useEffect
  function seededAngle(key) {
    // simple stable hash → [0, 1)
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const u = ((h >>> 0) % 1000003) / 1000003; // 0..1
    return u * Math.PI * 2;
  }

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const cfg = {
      backgroundColor: opts.backgroundColor ?? 0x000000,
      sunRadius: opts.sunRadius ?? 2.1,
      planetScale: opts.planetScale ?? 0.75, // Earth's display radius
      sizeExponent: opts.sizeExponent ?? 0.3, // compress real radii so all eight stay readable
      orbitGap: opts.orbitGap ?? 0.75, // clear space between neighbouring planets' orbits
      sunIntensity: opts.sunIntensity ?? 3.2,
      daysPerSecond: opts.daysPerSecond ?? 5,
      orbitSegments: opts.orbitSegments ?? 256,
      trailSpan: opts.trailSpan ?? Math.PI * 0.55, // length of each fading orbit trail, in radians
    };

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const texLoader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy?.() ?? 1;
    const loadTexture = (url) => {
      const tex = texLoader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };
    const texturePaths = {
      Sun: '/interactive/sun/sun_texture.jpg',
      Mercury: '/textures/mercury_texture.webp',
      Venus: '/textures/2k_venus_atmosphere.webp',
      Earth: '/textures/earth-texture-1.webp',
      Mars: '/textures/mars_texture.webp',
      Jupiter: '/textures/8k_jupiter.webp',
      Saturn: '/textures/saturn_texture.webp',
      Uranus: '/textures/uranus_texture.webp',
      Neptune: '/textures/neptune_texture.webp',
      Rings: '/textures/saturns_rings_texture.webp',
      Stars: '/textures/stars_texture.webp',
    };
    const textures = Object.fromEntries(
      Object.entries(texturePaths).map(([key, url]) => [key, loadTexture(url)])
    );
    textures.Rings.flipY = false;

    // ---------- Scene & Camera ----------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(cfg.backgroundColor);

    const camera = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, 200);
    camera.position.set(0, 80, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);

    // ---------- Layout ----------
    // Display radii follow the real ones, compressed; orbits are spaced by size
    // so every planet (and Saturn's rings) gets clear room.
    const sizes = PLANET_DATA.map((p) => cfg.planetScale * Math.pow(p.radiusEarth, cfg.sizeExponent));
    const reach = (i) => (PLANET_DATA[i].name === 'Saturn' ? sizes[i] * RING_OUTER : sizes[i]);
    const orbitRadii = [];
    PLANET_DATA.forEach((_, i) => {
      const inner = i === 0 ? cfg.sunRadius * 1.9 : orbitRadii[i - 1] + reach(i - 1);
      orbitRadii.push(inner + cfg.orbitGap * (i === 0 ? 0.6 : 1) + reach(i));
    });
    const maxDistance = orbitRadii[orbitRadii.length - 1] + reach(PLANET_DATA.length - 1);

    // ---------- Background ----------
    const stars = new THREE.Mesh(
      new THREE.PlaneGeometry(maxDistance * 6, maxDistance * 6),
      new THREE.MeshBasicMaterial({ map: textures.Stars, toneMapped: false }),
    );
    stars.material.color.setScalar(0.12);
    stars.rotation.x = -Math.PI / 2;
    stars.position.y = -10;
    scene.add(stars);

    // ---------- Sun ----------
    const sunGeo = new THREE.SphereGeometry(cfg.sunRadius, 64, 64);
    const sunMat = new THREE.MeshBasicMaterial({ map: textures.Sun, toneMapped: false });
    sunMat.color.setRGB(1.7, 1.25, 0.75); // over-bright warm tint, so the texture still shows
    const sun = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sun);

    // Corona: two additive sprites, a tight bright glow and a wide faint one.
    const glowTexture = makeGlowTexture();
    const coronas = [
      { scale: cfg.sunRadius * 3.4, color: 0xffc27a, opacity: 0.75 },
      { scale: cfg.sunRadius * 9, color: 0xff9a4a, opacity: 0.22 },
    ].map(({ scale, color, opacity }) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          opacity,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      sprite.scale.setScalar(scale);
      scene.add(sprite);
      return sprite;
    });

    const sunlight = new THREE.PointLight(0xfff1dc, cfg.sunIntensity, 0, 0); // no falloff: outer planets stay lit
    sun.add(sunlight);
    scene.add(new THREE.AmbientLight(0xffffff, opts.ambientIntensity ?? 0.14));

    // ---------- Planets ----------
    const planets = [];
    PLANET_DATA.forEach((planet, index) => {
      const radius = sizes[index];
      const orbitRadius = orbitRadii[index];
      const tint = new THREE.Color(planet.color);

      const geo = new THREE.SphereGeometry(radius, 48, 48);
      const mat = new THREE.MeshStandardMaterial({
        map: textures[planet.name],
        roughness: 1,
        metalness: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);

      // Faint full orbit in the planet's colour.
      const orbitPositions = new Float32Array(cfg.orbitSegments * 3);
      for (let i = 0; i < cfg.orbitSegments; i += 1) {
        const t = (i / cfg.orbitSegments) * Math.PI * 2;
        orbitPositions[i * 3] = Math.cos(t) * orbitRadius;
        orbitPositions[i * 3 + 1] = 0;
        orbitPositions[i * 3 + 2] = Math.sin(t) * orbitRadius;
      }
      const orbitGeo = new THREE.BufferGeometry();
      orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
      const orbitMat = new THREE.LineBasicMaterial({
        color: tint.clone().lerp(new THREE.Color(0xffffff), 0.35),
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      });
      const orbit = new THREE.LineLoop(orbitGeo, orbitMat);
      scene.add(orbit);

      // Trail: an arc behind the planet that fades out, rotated to follow it.
      const trailSegments = 64;
      const trailPositions = new Float32Array((trailSegments + 1) * 3);
      const trailColors = new Float32Array((trailSegments + 1) * 3);
      const trailTint = tint.clone().lerp(new THREE.Color(0xffffff), 0.25);
      for (let i = 0; i <= trailSegments; i += 1) {
        const k = i / trailSegments; // 0 at the planet, 1 at the tail
        const t = -k * cfg.trailSpan;
        trailPositions[i * 3] = Math.cos(t) * orbitRadius;
        trailPositions[i * 3 + 2] = Math.sin(t) * orbitRadius;
        const fade = Math.pow(1 - k, 1.6) * 0.85;
        trailColors[i * 3] = trailTint.r * fade;
        trailColors[i * 3 + 1] = trailTint.g * fade;
        trailColors[i * 3 + 2] = trailTint.b * fade;
      }
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
      const trailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const trail = new THREE.Line(trailGeo, trailMat);
      scene.add(trail);

      // Saturn's rings, tilted by its axial tilt, with the planet's shadow on them.
      let rings = null;
      let ringCenter = null;
      let ringLightDir = null;
      if (planet.name === 'Saturn') {
        const ringGeo = new THREE.RingGeometry(radius * RING_INNER, radius * RING_OUTER, 128, 1);
        // Map the ring texture radially (its u runs inner → outer edge).
        const pos = ringGeo.attributes.position;
        const uv = ringGeo.attributes.uv;
        const v3 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i += 1) {
          v3.fromBufferAttribute(pos, i);
          const u = (v3.length() - radius * RING_INNER) / (radius * (RING_OUTER - RING_INNER));
          uv.setXY(i, u, 0.5);
        }
        // Unlit: from above, the Sun grazes the rings almost edge-on and would leave them black.
        const ringMat = new THREE.MeshBasicMaterial({
          map: textures.Rings,
          color: new THREE.Color(0xf3e6d0).multiplyScalar(0.8),
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        ringCenter = new THREE.Vector3();
        ringLightDir = new THREE.Vector3(1, 0, 0);
        applyRingShadow(ringMat, { center: ringCenter, radius, lightDir: ringLightDir });
        rings = new THREE.Mesh(ringGeo, ringMat);
        rings.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(26.7);
        scene.add(rings);
      }

      const orbitAngularSpeed = (Math.PI * 2) / planet.orbitDays;
      const angle = seededAngle(planet.name); // stable per-planet

      planets.push({ name: planet.name, mesh, orbit, trail, rings, ringCenter, ringLightDir, orbitRadius, orbitAngularSpeed, angle });
    });

    // Position planets, trails and Saturn's rings for the current angles.
    const place = () => {
      planets.forEach((planet) => {
        const x = Math.cos(planet.angle) * planet.orbitRadius;
        const z = Math.sin(planet.angle) * planet.orbitRadius;
        planet.mesh.position.set(x, 0, z);
        planet.trail.rotation.y = -planet.angle;
        if (planet.rings) {
          planet.rings.position.set(x, 0, z);
          planet.ringCenter.set(x, 0, z);
          planet.ringLightDir.set(-x, 0, -z).normalize(); // toward the Sun
        }
      });
    };
    place(); // so paused frames are correct

    // ---------- Resize ----------
    const fit = () => {
      const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
      renderer.setPixelRatio(dpr);
      const width = Math.max(1, container.clientWidth | 0);
      const height = Math.max(1, container.clientHeight | 0);
      renderer.setSize(width, height, false);

      const frustumSize = maxDistance * 1.06;
      const aspectRatio = width / height || 1;
      camera.left = -frustumSize * aspectRatio;
      camera.right = frustumSize * aspectRatio;
      camera.top = frustumSize;
      camera.bottom = -frustumSize;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(fit);
    ro.observe(container);
    window.addEventListener('resize', fit, { passive: true });
    fit();

    // ---------- Animation ----------
    const clock = new THREE.Clock();
    let rafId = 0;

    const loop = () => {
      // Always tick the clock so time never accumulates
      const rawDt = clock.getDelta();      // seconds since last frame
      const dt = pausedRef.current ? 0 : Math.min(rawDt, 0.05);
      const deltaDays = dt * cfg.daysPerSecond;

      // Advance only when not paused
      if (dt > 0) {
        planets.forEach((planet) => {
          planet.angle += planet.orbitAngularSpeed * deltaDays;
        });
        place();
        sun.rotation.y += dt * 0.05;
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(loop);
    };

    clock.start();
    rafId = requestAnimationFrame(loop);

    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('resize', fit);
      if (rafId) cancelAnimationFrame(rafId);

      planets.forEach((planet) => {
        planet.mesh.geometry.dispose();
        planet.mesh.material.dispose();
        planet.orbit.geometry.dispose();
        planet.orbit.material.dispose();
        planet.trail.geometry.dispose();
        planet.trail.material.dispose();
        planet.rings?.geometry.dispose();
        planet.rings?.material.dispose();
      });

      sunGeo.dispose();
      sunMat.dispose();
      coronas.forEach((sprite) => sprite.material.dispose());
      glowTexture.dispose();
      stars.geometry.dispose();
      stars.material.dispose();

      renderer.dispose();
      Object.values(textures).forEach((tex) => tex?.dispose?.());
    };
  }, [dprCap, opts]);

  useEffect(() => {
    pausedRef.current = paused;
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
