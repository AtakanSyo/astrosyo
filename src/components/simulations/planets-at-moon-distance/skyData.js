// How big each planet would look if it were where the Moon is.
//
// Every body sits at the Moon's mean distance, 384,400 km, centre to centre.
// (Standing on Earth you are about 6,400 km closer when it is overhead, which
// makes it about 1.7% larger; the page ignores that, as the Moon's own size
// is usually quoted the same way.)
//
// Sources: NASA planetary fact sheets (mean or equatorial radii, masses).
// Saturn's rings: the main rings run from the inner C ring (74,658 km) to the
// outer edge of the A ring (136,775 km).

export const MOON_DISTANCE_KM = 384400;
export const M_MOON = 7.342e22; // kg

export const BODIES = [
  {
    key: 'moon',
    name: 'The Moon',
    short: 'Moon',
    radiusKm: 1737.4,
    massKg: M_MOON,
    texture: '/textures/moon_texture.webp',
    fact: 'Our Moon, as it really looks: about half a degree across, roughly the width of a fingernail at arm’s length.',
  },
  {
    key: 'mercury',
    name: 'Mercury',
    short: 'Mercury',
    radiusKm: 2439.7,
    massKg: 3.301e23,
    texture: '/textures/mercury_texture.webp',
    fact: 'Only a little bigger than the Moon, with a similar grey, cratered face. Most people would not notice the swap at first.',
  },
  {
    key: 'mars',
    name: 'Mars',
    short: 'Mars',
    radiusKm: 3389.5,
    massKg: 6.417e23,
    texture: '/textures/mars_texture.webp',
    fact: 'Twice the Moon’s width and rust red, with its dark plains and ice caps easy to see without a telescope.',
  },
  {
    key: 'venus',
    name: 'Venus',
    short: 'Venus',
    radiusKm: 6051.8,
    massKg: 4.867e24,
    texture: '/textures/2k_venus_atmosphere.webp',
    fact: 'Almost Earth’s size, so about 3.5 times wider than the Moon. Its bright, unbroken clouds would make it dazzling.',
  },
  {
    key: 'neptune',
    name: 'Neptune',
    short: 'Neptune',
    radiusKm: 24622,
    massKg: 1.024e26,
    texture: '/textures/neptune_texture.webp',
    fact: 'A deep blue disc about 14 times wider than the Moon, covering nearly 200 times as much sky.',
  },
  {
    key: 'uranus',
    name: 'Uranus',
    short: 'Uranus',
    radiusKm: 25362,
    massKg: 8.681e25,
    texture: '/textures/uranus_texture.webp',
    fact: 'Slightly larger than Neptune in the sky: a pale cyan ball about 15 times wider than the Moon.',
  },
  {
    key: 'saturn',
    name: 'Saturn',
    short: 'Saturn',
    radiusKm: 58232,
    ringOuterKm: 136775,
    ringInnerKm: 74658,
    massKg: 5.683e26,
    texture: '/textures/saturn_texture.webp',
    fact: 'The planet alone would be about 17 degrees across. Its rings would stretch about 39 degrees, more than twice that, spanning a big slice of the sky.',
  },
  {
    key: 'jupiter',
    name: 'Jupiter',
    short: 'Jupiter',
    radiusKm: 69911,
    massKg: 1.898e27,
    texture: '/textures/jupiter_texture.webp',
    fact: 'About 21 degrees across, 40 times wider than the Moon, covering as much sky as about 1,600 full Moons. Its cloud bands and storms would be clearly visible.',
  },
];

const MOON = BODIES[0];

// Apparent (angular) diameter in degrees of something `radiusKm` in radius at
// the Moon's distance.
export const angularDiameterDeg = (radiusKm, distanceKm = MOON_DISTANCE_KM) => (2 * Math.atan(radiusKm / distanceKm) * 180) / Math.PI;

export function describe(body) {
  const deg = angularDiameterDeg(body.radiusKm);
  const moonDeg = angularDiameterDeg(MOON.radiusKm);
  return {
    deg,
    ringDeg: body.ringOuterKm ? angularDiameterDeg(body.ringOuterKm) : null,
    timesWider: deg / moonDeg,
    timesArea: (deg / moonDeg) ** 2,
    // Tidal pull scales with mass at a fixed distance.
    timesTide: body.massKg / MOON.massKg,
  };
}

// Readable degrees: one decimal below 10°, whole degrees above.
export const formatDeg = (deg) => `${deg < 10 ? deg.toFixed(1) : Math.round(deg)}°`;
