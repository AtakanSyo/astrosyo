export function jupiterMoonsAtScaleExtension({
  // Multiplier applied to real moon distances (in Jupiter radii).
  distanceScale = 1,
  // Multiplier applied to moon radii relative to Jupiter.
  sizeScale = 1,
  // 'line' places moons along +X; 'orbit' distributes on a ring at their scaled distance.
  layout = 'line',
  // Number of moons to show (default: the 4 Galilean moons).
  moons = ['io', 'europa', 'ganymede', 'callisto'],
  opacity = 1,
  // Show a small name (and distance) label under Jupiter and each moon.
  labels = false,
} = {}) {
  return ({ THREE, scene, camera, renderer, planetKey, radius: planetRadiusScene }) => {
    if (planetKey !== 'jupiter') return null;

    // Mean radii (km) and semi-major axes (km) from Jupiter center.
    // Source: commonly cited NASA fact sheets / standard astronomical references.
    const JUPITER_RADIUS_KM = 69911;
    const MOONS = {
      io: { name: 'Io', radiusKm: 1821.6, aKm: 421700, color: 0xf2d16b },
      europa: { name: 'Europa', radiusKm: 1560.8, aKm: 671034, color: 0xcfd8e6 },
      ganymede: { name: 'Ganymede', radiusKm: 2634.1, aKm: 1070400, color: 0xb9b0a3 },
      callisto: { name: 'Callisto', radiusKm: 2410.3, aKm: 1882700, color: 0x7f6d5c },
    };

    const group = new THREE.Group();
    group.name = 'jupiter-moons';

    const geometries = [];
    const materials = [];
    const meshes = [];

    // Labels are real HTML text laid over the canvas (sharp at any pixel ratio),
    // positioned by projecting each body's position through the camera.
    const anchors = []; // { el, world: Vector3 }
    let overlay = null;
    const container = renderer?.domElement?.parentElement ?? null;
    if (labels && container) {
      overlay = document.createElement('div');
      overlay.className = 'sim-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      Object.assign(overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1' });
      container.appendChild(overlay);
    }

    const addLabel = (title, detail, world) => {
      if (!overlay) return;
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        willChange: 'transform',
      });
      const name = document.createElement('div');
      name.textContent = title;
      Object.assign(name.style, {
        fontSize: 'clamp(0.55rem, 1.2vw, 0.75rem)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'rgba(255, 255, 255, 0.75)',
      });
      el.appendChild(name);
      if (detail) {
        const sub = document.createElement('div');
        sub.className = 'moon-label-detail';
        sub.textContent = detail;
        Object.assign(sub.style, {
          marginTop: '0.15em',
          fontSize: 'clamp(0.5rem, 1vw, 0.65rem)',
          color: 'rgba(255, 255, 255, 0.45)',
          fontVariantNumeric: 'tabular-nums',
        });
        el.appendChild(sub);
      }
      overlay.appendChild(el);
      anchors.push({ el, world });
    };

    const projected = new THREE.Vector3();
    const placeLabels = () => {
      if (!overlay || !camera) return;
      camera.updateMatrixWorld();
      const width = container.clientWidth;
      const height = container.clientHeight;
      // On narrow stages the distance lines would overlap, so show names only.
      const compact = width < 560;
      for (const { el, world } of anchors) {
        const detailEl = el.querySelector('.moon-label-detail');
        if (detailEl) detailEl.style.display = compact ? 'none' : '';
        projected.copy(world).project(camera);
        const half = el.offsetWidth / 2;
        // Keep labels inside the stage (Callisto sits close to the right edge).
        const left = Math.min(Math.max(((projected.x + 1) / 2) * width, half + 4), width - half - 4);
        const top = ((1 - projected.y) / 2) * height;
        // Anchor the label's top-centre just below the body.
        el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, 0)`;
      }
    };

    const formatKm = (km) => `${Math.round(km / 1000).toLocaleString('en-US')},000 km`;
    const labelGap = planetRadiusScene * 0.35;

    if (labels) addLabel('Jupiter', null, new THREE.Vector3(0, -planetRadiusScene - labelGap, 0));

    const ids = Array.isArray(moons) ? moons : [];
    for (let i = 0; i < ids.length; i += 1) {
      const id = String(ids[i] ?? '').toLowerCase();
      const data = MOONS[id];
      if (!data) continue;

      const moonRadiusScene =
        planetRadiusScene * (data.radiusKm / JUPITER_RADIUS_KM) * sizeScale;
      const aScene =
        planetRadiusScene * (data.aKm / JUPITER_RADIUS_KM) * distanceScale;

      const geometry = new THREE.SphereGeometry(moonRadiusScene, 32, 32);
      geometries.push(geometry);

      const material = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 1,
        metalness: 0,
        transparent: opacity < 1,
        opacity,
      });
      materials.push(material);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `moon-${id}`;

      if (layout === 'orbit') {
        const angle = (i / Math.max(1, ids.length)) * Math.PI * 2;
        mesh.position.set(Math.cos(angle) * aScene, 0, Math.sin(angle) * aScene);
      } else {
        mesh.position.set(aScene, 0, 0);
      }

      meshes.push(mesh);
      group.add(mesh);

      if (labels) {
        const below = mesh.position.clone();
        below.y -= Math.max(moonRadiusScene, planetRadiusScene * 0.25) + labelGap;
        addLabel(data.name, formatKm(data.aKm), below);
      }
    }

    scene.add(group);

    // The camera's size changes with the stage, so re-place labels on every resize
    // (one frame later, after the renderer has updated the camera).
    let resizeObserver = null;
    let raf = 0;
    if (overlay) {
      const schedule = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(placeLabels);
      };
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(container);
      schedule();
    }

    return {
      dispose() {
        resizeObserver?.disconnect();
        cancelAnimationFrame(raf);
        overlay?.remove();
        scene.remove(group);
        for (const m of meshes) group.remove(m);
        for (const g of geometries) g.dispose();
        for (const mat of materials) mat.dispose();
      },
    };
  };
}

