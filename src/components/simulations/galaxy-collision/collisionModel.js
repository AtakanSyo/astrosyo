// Milky Way–Andromeda collision: a restricted N-body model.
//
// Only the two galaxy cores have gravity. Each is a Hernquist halo (standing
// in for its dark matter, which dominates the mass), and the two pull on each
// other. Their orbits are integrated here on the CPU, with Chandrasekhar
// dynamical friction so the halos can drag on each other and merge. The stars
// are massless test particles: each feels both cores but not each other, so
// they can be moved in parallel on the GPU (see GalaxyCollision.jsx). This is
// the approach Toomre & Toomre (1972) used to explain tidal tails and bridges.
//
// Units: kpc, Gyr, and 10¹⁰ solar masses.
//
// Sources for the set-up (keep the post in sync):
// - Andromeda's distance ~785 kpc and radial approach speed ~110 km/s
//   (van der Marel et al. 2012, 2019).
// - Masses: Milky Way ~1.0 × 10¹² M☉, Andromeda ~1.3 × 10¹² M☉ (within the
//   published range; Andromeda is usually found to be somewhat heavier).
// - The sideways (tangential) speed is poorly measured: ~17 km/s from Hubble
//   (2012), larger from Gaia (2019), and the 2025 Hubble + Gaia study (Sawala
//   et al., Nature Astronomy) finds roughly even odds of a merger within 10
//   billion years once the uncertainties and the Large Magellanic Cloud are
//   included. The three scenarios below are illustrative paths across that
//   range, not predictions.

export const G = 4.4985e4; // kpc³ Gyr⁻² (10¹⁰ M☉)⁻¹
export const KMS = 1.02271; // kpc/Gyr per km/s
export const KPC_LY = 3261.56; // light-years per kpc

export const T_MAX = 10; // Gyr
export const DT = 0.002; // Gyr per step (fine enough for inner disk orbits)
export const STEPS = Math.round(T_MAX / DT);

const LN_LAMBDA = 0.5; // Coulomb logarithm for the dynamical friction
const FRICTION_SOFTENING = 0.6; // halo density is softened inside this many scale radii

export const GALAXIES = [
  {
    key: 'mw',
    name: 'Milky Way',
    mass: 100,
    scale: 30, // Hernquist scale radius of the halo, kpc
    diskScale: 3.0, // exponential disk scale length, kpc
    diskRadius: 16,
    bulgeFraction: 0.14,
    bulgeScale: 0.8,
    arms: 4,
    share: 0.45, // fraction of the star particles
  },
  {
    key: 'm31',
    name: 'Andromeda',
    mass: 130,
    scale: 35,
    diskScale: 5.3,
    diskRadius: 26,
    bulgeFraction: 0.18,
    bulgeScale: 1.2,
    arms: 2,
    share: 0.55,
  },
];

export const START_DISTANCE = 785; // kpc
export const APPROACH_SPEED = 110; // km/s, radial

export const SCENARIOS = [
  {
    key: 'direct',
    name: 'Direct hit',
    tangentialKms: 17,
    summary: 'A nearly head-on encounter, as the 2012 Hubble measurements suggested.',
  },
  {
    key: 'pass',
    name: 'Close pass, later merger',
    tangentialKms: 35,
    summary: 'A wider first pass, a long swing back out, then a merger.',
  },
  {
    key: 'miss',
    name: 'Near miss',
    tangentialKms: 110,
    summary: 'A faster sideways drift: the galaxies pass hundreds of kpc apart and do not merge within 10 billion years.',
  },
];

// Hernquist enclosed-mass acceleration magnitude per unit distance, so
// a = -factor · (x − centre).
export const hernquistFactor = (mass, scale, r) => (G * mass) / (Math.max(r, 1e-6) * (r + scale) ** 2);
export const circularSpeed = (mass, scale, r) => Math.sqrt(G * mass * r) / (r + scale);

const softenedDensity = (mass, scale, r) => {
  const rr = Math.sqrt(r * r + (FRICTION_SOFTENING * scale) ** 2);
  return (mass * scale) / (2 * Math.PI * rr * (rr + scale) ** 3);
};

// erf, accurate to ~1e-7 (Abramowitz & Stegun 7.1.26).
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

// Integrate the two cores for a scenario. Returns their positions at every
// step (Float32Array, STEPS + 1 entries of 6 numbers: x, y, z of each core),
// plus the times of key events for the captions.
export function integrateCores(scenario) {
  const [mw, m31] = GALAXIES;
  const mt = mw.mass + m31.mass;
  const vt = scenario.tangentialKms * KMS;
  const vr = -APPROACH_SPEED * KMS;
  // Relative position/velocity of Andromeda, split about the barycentre.
  const x = [
    [(-START_DISTANCE * m31.mass) / mt, 0, 0],
    [(START_DISTANCE * mw.mass) / mt, 0, 0],
  ];
  const v = [
    [(-vr * m31.mass) / mt, (-vt * m31.mass) / mt, 0],
    [(vr * mw.mass) / mt, (vt * mw.mass) / mt, 0],
  ];
  const masses = [mw.mass, m31.mass];
  const scales = [mw.scale, m31.scale];

  const track = new Float32Array((STEPS + 1) * 6);
  const separation = new Float32Array(STEPS + 1);
  const write = (step) => {
    track.set([...x[0], ...x[1]], step * 6);
    separation[step] = Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1], x[1][2] - x[0][2]);
  };
  write(0);

  for (let step = 1; step <= STEPS; step += 1) {
    const acc = [0, 1].map((i) => {
      const j = 1 - i;
      const d = [0, 1, 2].map((k) => x[j][k] - x[i][k]);
      const r = Math.hypot(...d);
      const f = hernquistFactor(masses[j], scales[j], r);
      const rel = [0, 1, 2].map((k) => v[i][k] - v[j][k]);
      const speed = Math.hypot(...rel) || 1e-9;
      const sigma = circularSpeed(masses[j], scales[j], Math.max(r, 1)) / Math.SQRT2;
      const X = speed / (Math.SQRT2 * sigma);
      const chandra = erf(X) - ((2 * X) / Math.sqrt(Math.PI)) * Math.exp(-X * X);
      const friction = (-4 * Math.PI * G * G * masses[i] * LN_LAMBDA * softenedDensity(masses[j], scales[j], r) * chandra) / speed ** 3;
      return [0, 1, 2].map((k) => f * d[k] + friction * rel[k]);
    });
    for (let i = 0; i < 2; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        v[i][k] += acc[i][k] * DT;
        x[i][k] += v[i][k] * DT;
      }
    }
    write(step);
  }

  return { track, separation, events: findEvents(separation) };
}

// First closest approach, and the merger (separation below 3 kpc for good).
export function findEvents(separation) {
  let firstPass = null;
  for (let s = 1; s < separation.length - 1; s += 1) {
    if (separation[s] < separation[s - 1] && separation[s] <= separation[s + 1]) {
      firstPass = { step: s, time: s * DT, distance: separation[s] };
      break;
    }
  }
  let merger = null;
  for (let s = 0; s < separation.length; s += 1) {
    if (separation[s] < 3) {
      let stays = true;
      for (let k = s; k < separation.length; k += 1) if (separation[k] > 6) { stays = false; break; }
      if (stays) { merger = { step: s, time: s * DT }; break; }
    }
  }
  return { firstPass, merger };
}

// Seeded random numbers (mulberry32) so every visitor sees the same galaxies.
export function makeRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gaussian = (rand) => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());

// Each galaxy's disk orientation, as a rotation of the z-up disk (radians).
// The Milky Way's disk lies in the orbital plane; Andromeda's is tilted.
// Illustrative, chosen to show tails clearly rather than the exact geometry.
export const ORIENTATIONS = [
  { x: 0, z: 0 },
  { x: 1.05, z: 0.6 },
];

// Build the initial star particles. Each star starts on a circular orbit in
// its own galaxy's potential (plus a little random motion), arranged in an
// exponential disk with spiral arms and a central bulge. Returns flat arrays
// of positions, velocities, and per-star attributes, and the index of the
// star picked to stand for the Sun (8.2 kpc from the Milky Way's centre).
export function buildStars(count, coreTrack, seed = 7) {
  const rand = makeRandom(seed);
  const positions = new Float32Array(count * 4);
  const velocities = new Float32Array(count * 4);
  const galaxyOf = new Float32Array(count);
  const radiusOf = new Float32Array(count); // initial radius in disk-scale units, for colour
  let sunIndex = 0;

  const coreVel = (g) => [0, 1, 2].map((k) => (coreTrack[6 + g * 3 + k] - coreTrack[g * 3 + k]) / DT);
  let index = 0;
  GALAXIES.forEach((gal, g) => {
    const n = g === GALAXIES.length - 1 ? count - index : Math.round(count * gal.share);
    const rot = new (class {
      constructor({ x: ax, z: az }) {
        this.cx = Math.cos(ax); this.sx = Math.sin(ax); this.cz = Math.cos(az); this.sz = Math.sin(az);
      }
      apply([px, py, pz]) {
        // rotate about x, then about z
        const y1 = py * this.cx - pz * this.sx;
        const z1 = py * this.sx + pz * this.cx;
        return [px * this.cz - y1 * this.sz, px * this.sz + y1 * this.cz, z1];
      }
    })(ORIENTATIONS[g]);
    const centre = [coreTrack[g * 3], coreTrack[g * 3 + 1], coreTrack[g * 3 + 2]];
    const cv = coreVel(g);
    const pitch = Math.tan(0.24); // ~14° spiral pitch

    for (let i = 0; i < n; i += 1, index += 1) {
      let p;
      let vel;
      let radius;
      const isSun = g === 0 && i === 0;
      if (!isSun && rand() < gal.bulgeFraction) {
        // Bulge: a compact, roughly spherical cloud on random orbits.
        radius = gal.bulgeScale * Math.sqrt(rand() / (1 - rand() * 0.999));
        radius = Math.min(radius, gal.bulgeScale * 4);
        const u = rand() * 2 - 1;
        const phi = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        p = [radius * s * Math.cos(phi), radius * s * Math.sin(phi), radius * u * 0.7];
        const vc = circularSpeed(gal.mass, gal.scale, Math.max(radius, 0.3));
        vel = [gaussian(rand) * vc * 0.45, gaussian(rand) * vc * 0.45, gaussian(rand) * vc * 0.3];
      } else {
        // Disk: exponential surface density (radius ~ Gamma(2)), cut at diskRadius.
        do {
          radius = -gal.diskScale * Math.log(Math.max(rand() * rand(), 1e-9));
        } while (radius > gal.diskRadius || radius < 0.4);
        let theta = rand() * Math.PI * 2;
        if (rand() < 0.55) {
          // Concentrate about half the stars along logarithmic spiral arms.
          const arm = Math.floor(rand() * gal.arms);
          theta = (arm / gal.arms) * Math.PI * 2 + Math.log(radius / gal.diskScale) / pitch + gaussian(rand) * 0.22;
        }
        if (isSun) { radius = 8.2; theta = 0; }
        const z = gaussian(rand) * 0.12 * (0.6 + radius / gal.diskRadius);
        p = [radius * Math.cos(theta), radius * Math.sin(theta), z];
        const vc = circularSpeed(gal.mass, gal.scale, radius);
        const disp = isSun ? 0 : 0.06 * vc;
        vel = [-Math.sin(theta) * vc + gaussian(rand) * disp, Math.cos(theta) * vc + gaussian(rand) * disp, gaussian(rand) * disp * 0.5];
      }
      if (isSun) sunIndex = index;
      const wp = rot.apply(p);
      const wv = rot.apply(vel);
      positions.set([centre[0] + wp[0], centre[1] + wp[1], centre[2] + wp[2], 1], index * 4);
      velocities.set([cv[0] + wv[0], cv[1] + wv[1], cv[2] + wv[2], 0], index * 4);
      galaxyOf[index] = g;
      radiusOf[index] = radius / gal.diskScale;
    }
  });

  return { positions, velocities, galaxyOf, radiusOf, sunIndex };
}
