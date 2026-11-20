// Size, mass and the comparisons people search for ("how many Earths fit
// in Jupiter", "how big is Mars compared to Mercury") for any two bodies
// in the Solar System.
//
// Radii are volumetric mean radii and masses are from the NASA/JPL
// planetary and satellite fact sheets (Sun: IAU 2015 nominal radius).
// Surface gravity is derived here as g = GM/R² so all bodies are treated
// the same way; for the giant planets that's at the 1-bar level of the
// mean radius, which differs slightly from the fact sheets' equatorial
// values.

export const G = 6.6743e-11; // m^3 kg^-1 s^-2, CODATA 2018

// texture: an equirectangular map in /public/textures, or null for a flat colour.
export const BODIES = [
  { key: "sun", name: "Sun", kind: "star", radiusKm: 695700, massKg: 1.98847e30, color: "#ffb84d", texture: null },
  { key: "mercury", name: "Mercury", kind: "planet", radiusKm: 2439.7, massKg: 3.3011e23, color: "#9c958d", texture: "/textures/mercury_texture.webp" },
  { key: "venus", name: "Venus", kind: "planet", radiusKm: 6051.8, massKg: 4.8675e24, color: "#e3c48a", texture: "/textures/2k_venus_atmosphere.webp" },
  { key: "earth", name: "Earth", kind: "planet", radiusKm: 6371.0, massKg: 5.9722e24, color: "#4a7fc1", texture: "/textures/earth_daytime_texture.webp" },
  { key: "moon", name: "Moon", kind: "moon", parent: "Earth", radiusKm: 1737.4, massKg: 7.342e22, color: "#aaa59e", texture: "/textures/moon_texture.webp" },
  { key: "mars", name: "Mars", kind: "planet", radiusKm: 3389.5, massKg: 6.4171e23, color: "#c1653a", texture: "/textures/mars_texture.webp" },
  { key: "ceres", name: "Ceres", kind: "dwarf planet", radiusKm: 469.7, massKg: 9.38e20, color: "#8e8a85", texture: null },
  { key: "jupiter", name: "Jupiter", kind: "planet", radiusKm: 69911, massKg: 1.89813e27, color: "#c9a27a", texture: "/textures/jupiter_texture.webp" },
  { key: "io", name: "Io", kind: "moon", parent: "Jupiter", radiusKm: 1821.6, massKg: 8.932e22, color: "#d9c25a", texture: null },
  { key: "europa", name: "Europa", kind: "moon", parent: "Jupiter", radiusKm: 1560.8, massKg: 4.8e22, color: "#c8b9a0", texture: null },
  { key: "ganymede", name: "Ganymede", kind: "moon", parent: "Jupiter", radiusKm: 2634.1, massKg: 1.4819e23, color: "#9b8f80", texture: null },
  { key: "callisto", name: "Callisto", kind: "moon", parent: "Jupiter", radiusKm: 2410.3, massKg: 1.0759e23, color: "#6f665c", texture: null },
  { key: "saturn", name: "Saturn", kind: "planet", radiusKm: 58232, massKg: 5.6834e26, color: "#d8c08e", texture: "/textures/saturn_texture.webp" },
  { key: "titan", name: "Titan", kind: "moon", parent: "Saturn", radiusKm: 2574.7, massKg: 1.3452e23, color: "#d49a4a", texture: null },
  { key: "uranus", name: "Uranus", kind: "planet", radiusKm: 25362, massKg: 8.681e25, color: "#9fd6dc", texture: "/textures/uranus_texture.webp" },
  { key: "neptune", name: "Neptune", kind: "planet", radiusKm: 24622, massKg: 1.02413e26, color: "#4b70dd", texture: "/textures/neptune_texture.webp" },
  { key: "triton", name: "Triton", kind: "moon", parent: "Neptune", radiusKm: 1353.4, massKg: 2.139e22, color: "#c9bcb4", texture: null },
  { key: "pluto", name: "Pluto", kind: "dwarf planet", radiusKm: 1188.3, massKg: 1.303e22, color: "#c7a98a", texture: "/textures/pluto_natural.webp" },
  { key: "charon", name: "Charon", kind: "moon", parent: "Pluto", radiusKm: 606, massKg: 1.586e21, color: "#9a948e", texture: null },
];

export const BODY_BY_KEY = Object.fromEntries(BODIES.map((b) => [b.key, b]));

// Existing true-scale 3D comparison pages on this site, keyed by pair
// (order-independent).
const PAIR_PAGES = {
  "earth|moon": "/posts/earth-moon-size-comparison",
  "earth|neptune": "/posts/earth-neptune-size-comparison",
  "earth|jupiter": "/posts/jupiter-earth-size-comparison",
  "jupiter|neptune": "/posts/jupiter-neptune-size-comparison",
  "jupiter|venus": "/posts/jupiter-venus-size-comparison",
  "earth|mars": "/posts/mars-earth-size-comparison",
  "jupiter|mercury": "/posts/mercury-jupiter-size-comparison",
  "mars|mercury": "/posts/mercury-mars-size-comparison",
  "jupiter|saturn": "/posts/saturn-jupiter-size-comparison",
  "neptune|saturn": "/posts/saturn-neptune-size-comparison",
  "saturn|uranus": "/posts/saturn-uranus-size-comparison",
  "moon|pluto": "/posts/pluto-moon-size-comparison",
};

export function pairPage(a, b) {
  return PAIR_PAGES[[a, b].sort().join("|")] ?? null;
}

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Mean density in g/cm³. */
export function densityGcc(radiusKm, massKg) {
  if (!positive(radiusKm) || !positive(massKg)) return null;
  const rCm = radiusKm * 1e5;
  return (massKg * 1000) / ((4 / 3) * Math.PI * rCm ** 3);
}

/** Surface gravity in m/s², g = GM/R². */
export function surfaceGravity(radiusKm, massKg) {
  if (!positive(radiusKm) || !positive(massKg)) return null;
  const r = radiusKm * 1000;
  return (G * massKg) / (r * r);
}

/**
 * All the ratios of `big` to `small`. "fit inside" is the volume ratio,
 * i.e. how many small bodies' worth of volume the big one has; packing
 * real spheres would leave gaps, so `fitPacked` also gives the count at
 * random close packing (~64% filled).
 */
export const RANDOM_CLOSE_PACKING = 0.64;

export function compare(big, small) {
  if (!big || !small || !positive(big.radiusKm) || !positive(small.radiusKm)) return null;
  const diameter = big.radiusKm / small.radiusKm;
  const volume = diameter ** 3;
  return {
    diameter,
    surface: diameter ** 2,
    volume,
    fitPacked: volume * RANDOM_CLOSE_PACKING,
    mass: positive(big.massKg) && positive(small.massKg) ? big.massKg / small.massKg : null,
    gravity: surfaceGravity(big.radiusKm, big.massKg) / surfaceGravity(small.radiusKm, small.massKg),
    percentSmaller: (1 - 1 / diameter) * 100,
  };
}

/** Orders two bodies largest first. */
export function bySize(a, b) {
  return a.radiusKm >= b.radiusKm ? [a, b] : [b, a];
}
