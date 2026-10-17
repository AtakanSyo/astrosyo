// Geometry behind Mars's retrograde loop, kept free of Three.js so it can be tested.
//
// Both planets move on circular orbits around the Sun at their real periods and
// distances. Earth's orbit defines the ecliptic plane; Mars's orbit is tilted by
// its real inclination, which is what turns the back-and-forth into a loop.
// Angles are in radians unless a name says otherwise.

export const EARTH_PERIOD_DAYS = 365.256;
export const MARS_PERIOD_DAYS = 686.98;
export const MARS_DISTANCE_AU = 1.524;
export const MARS_INCLINATION_DEG = 1.85;
export const MARS_NODE_DEG = 49.56; // longitude of the ascending node

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const EARTH_RATE = TAU / EARTH_PERIOD_DAYS; // rad/day
export const MARS_RATE = TAU / MARS_PERIOD_DAYS;
export const SYNODIC_PERIOD_DAYS = TAU / (EARTH_RATE - MARS_RATE);

export const wrapAngle = (a) => ((a % TAU) + TAU) % TAU;

/** Signed difference a − b, wrapped into (−π, π]. */
export const angleDiff = (a, b) => {
  const d = wrapAngle(a - b);
  return d > Math.PI ? d - TAU : d;
};

/** Heliocentric ecliptic position of Earth (AU). */
export function earthPosition(longitude) {
  return { x: Math.cos(longitude), y: Math.sin(longitude), z: 0 };
}

/** Heliocentric ecliptic position of Mars (AU) on its slightly tilted circular orbit. */
export function marsPosition(longitude) {
  const node = MARS_NODE_DEG * DEG;
  const inc = MARS_INCLINATION_DEG * DEG;
  const u = longitude - node; // angle travelled from the ascending node
  const r = MARS_DISTANCE_AU;
  return {
    x: r * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(inc)),
    y: r * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(inc)),
    z: r * Math.sin(u) * Math.sin(inc),
  };
}

/** Planet longitudes after `days`, starting from the given longitudes. */
export function longitudesAt(days, earth0 = 0, mars0 = 0) {
  return {
    earth: wrapAngle(earth0 + EARTH_RATE * days),
    mars: wrapAngle(mars0 + MARS_RATE * days),
  };
}

/** Where Mars appears on the sky from Earth: ecliptic longitude and latitude. */
export function apparentPosition(earthLongitude, marsLongitude) {
  const e = earthPosition(earthLongitude);
  const m = marsPosition(marsLongitude);
  const dx = m.x - e.x;
  const dy = m.y - e.y;
  const dz = m.z - e.z;
  return {
    longitude: wrapAngle(Math.atan2(dy, dx)),
    latitude: Math.atan2(dz, Math.hypot(dx, dy)),
    distanceAU: Math.hypot(dx, dy, dz),
  };
}

/** Rate of change of Mars's apparent longitude (rad/day). Negative means retrograde. */
export function apparentRate(earthLongitude, marsLongitude, stepDays = 0.5) {
  const before = apparentPosition(earthLongitude - EARTH_RATE * stepDays, marsLongitude - MARS_RATE * stepDays);
  const after = apparentPosition(earthLongitude + EARTH_RATE * stepDays, marsLongitude + MARS_RATE * stepDays);
  return angleDiff(after.longitude, before.longitude) / (2 * stepDays);
}

export const isRetrograde = (earthLongitude, marsLongitude) => apparentRate(earthLongitude, marsLongitude) < 0;

/** Days until Earth next passes between the Sun and Mars (opposition). */
export function daysToOpposition(earthLongitude, marsLongitude) {
  return wrapAngle(marsLongitude - earthLongitude) / (EARTH_RATE - MARS_RATE);
}
