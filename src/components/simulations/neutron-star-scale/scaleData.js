// Sizes for the neutron star scale tour, all in kilometres.
//
// Black holes are drawn at their Schwarzschild radius (r_s = 2GM/c², the event
// horizon of a non-rotating black hole), computed with the same function as
// the Schwarzschild Radius Calculator. Everything else at its mean radius.
//
// Sources (keep the post's numbers in sync with these):
// - Neutron star: 1.4 M☉ and about 12 km radius, in line with NICER's X-ray
//   measurements of PSR J0030+0451 (~1.4 M☉, ~12.7 km; Riley et al. 2019,
//   Miller et al. 2019) and PSR J0740+6620 (~2.1 M☉, ~12.4 km; Riley et al.
//   2021; Miller et al. 2021 find ~13.7 km). Most estimates fall between about
//   11 and 14 km.
// - Cygnus X-1: 21.2 M☉ (Miller-Jones et al. 2021).
// - Moon: 1,737.4 km. Earth: 6,371 km (NASA fact sheets).
// - Sirius B: 0.0081 R☉, about 5,630 km, and 1.02 M☉ (Bond et al. 2017).
// - Sun: IAU nominal solar radius, 695,700 km.
// - Mount Everest: 8.849 km above sea level (2020 survey).

import { C, G, M_SUN, schwarzschildRadiusM } from '../schwarzschild-radius-calculator/schwarzschild.js';

export const R_SUN_KM = 695700;
export const EVEREST_KM = 8.849;
export const MANHATTAN_KM = 21.6;

export const NEUTRON_STAR = { massSolar: 1.4, radiusKm: 12 };

const blackHoleRadiusKm = (massSolar) => schwarzschildRadiusM(massSolar * M_SUN) / 1000;

// In order of size: each stage zooms out to the next object.
export const OBJECTS = [
  {
    key: 'neutron',
    name: 'Neutron star',
    short: 'Neutron star',
    kind: 'neutron',
    radiusKm: NEUTRON_STAR.radiusKm,
    detail: '1.4 times the Sun’s mass, the collapsed core of a massive star',
    fact: 'About 24 km across, a little more than the length of Manhattan (21.6 km). Mount Everest is drawn beside it to scale.',
  },
  {
    key: 'cygx1',
    name: 'Cygnus X-1',
    short: 'Cygnus X-1',
    kind: 'blackhole',
    massSolar: 21.2,
    radiusKm: blackHoleRadiusKm(21.2),
    detail: 'A stellar black hole, 21 times the Sun’s mass',
    fact: 'Heavier black holes are bigger: its event horizon is about five times the neutron star’s radius. A black hole with the neutron star’s mass would be only about 4 km in radius.',
  },
  {
    key: 'moon',
    name: 'The Moon',
    short: 'Moon',
    kind: 'moon',
    radiusKm: 1737.4,
    detail: 'Earth’s Moon, for scale',
    fact: 'About 145 neutron stars would fit side by side across the Moon’s face.',
  },
  {
    key: 'siriusb',
    name: 'Sirius B',
    short: 'Sirius B',
    kind: 'whitedwarf',
    massSolar: 1.02,
    radiusKm: 0.0081 * R_SUN_KM,
    detail: 'A white dwarf, about the Sun’s mass squeezed into a planet-sized ball',
    fact: 'A white dwarf is the other way a star can end, for stars too light to make a neutron star. With about the Sun’s mass, it is still almost 500 times wider than a neutron star.',
  },
  {
    key: 'earth',
    name: 'Earth',
    short: 'Earth',
    kind: 'earth',
    radiusKm: 6371,
    detail: 'Our planet, for scale',
    fact: 'Earth is about 530 times wider than a neutron star, yet a neutron star holds about 470,000 times Earth’s mass.',
  },
  {
    key: 'sun',
    name: 'The Sun',
    short: 'Sun',
    kind: 'star',
    radiusKm: R_SUN_KM,
    detail: 'Our star, 1 solar mass',
    fact: 'The neutron star has 1.4 times the Sun’s mass in a ball about 58,000 times smaller across. At this scale it is far smaller than a pixel.',
  },
];

// Physical properties of the neutron star, from its mass and radius (Newtonian
// surface gravity; relativity makes it stronger still).
export function neutronStarFacts({ massSolar, radiusKm } = NEUTRON_STAR) {
  const m = massSolar * M_SUN;
  const r = radiusKm * 1000;
  const density = m / ((4 / 3) * Math.PI * r ** 3); // kg/m³
  return {
    density,
    teaspoonTonnes: (density * 5e-6) / 1000, // a 5 ml teaspoon
    surfaceGravityG: (G * m) / r ** 2 / 9.80665,
    escapeFractionC: Math.sqrt((2 * G * m) / r) / C,
    sameMassBlackHoleKm: blackHoleRadiusKm(massSolar),
  };
}

// Readable distance in km.
export function formatKm(km) {
  if (km >= 1e6) return `${(km / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} million km`;
  if (km >= 100) return `${Math.round(km).toLocaleString('en-US')} km`;
  return `${km.toLocaleString('en-US', { maximumFractionDigits: 1 })} km`;
}
