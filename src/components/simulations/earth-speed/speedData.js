// How fast Earth moves, motion by motion.
//
// Sources (keep the post's numbers in sync with these):
// - Spin: equatorial radius 6,378.137 km (WGS 84), sidereal day 86,164.09 s.
// - Orbit: mean orbital speed 29.78 km/s; 30.29 km/s at perihelion, 29.29 at
//   aphelion (NASA Earth fact sheet).
// - Around the galaxy: the Sun's speed around the Galactic Centre, about
//   248 km/s, from the proper motion of Sgr A* (Reid & Brunthaler 2020,
//   30.32 km/s/kpc) and its distance, 8.178 kpc (GRAVITY Collaboration 2019).
//   Includes the Sun's own motion relative to circular rotation (Schönrich
//   et al. 2010: U, V, W = 11.1, 12.24, 7.25 km/s).
// - Against the cosmic microwave background: the Sun moves at 369.82 km/s
//   towards galactic longitude 264.02°, latitude 48.25° (Planck 2018). The
//   Milky Way's own speed is that minus the Sun's motion around the galaxy.

export const KM_PER_AU = 149597870.7;
export const SECONDS_PER_YEAR = 365.25 * 86400;
export const KMS_TO_KMH = 3600;
export const KMS_TO_MPH = 3600 / 1.609344;

const R_EQUATOR_KM = 6378.137;
const SIDEREAL_DAY_S = 86164.0905;
export const EQUATOR_SPEED = (2 * Math.PI * R_EQUATOR_KM) / SIDEREAL_DAY_S; // km/s
export const spinSpeedAt = (latitudeDeg) => EQUATOR_SPEED * Math.cos((latitudeDeg * Math.PI) / 180);

export const ORBIT_SPEED = 29.78;
export const R0_KPC = 8.178;
export const KM_PER_KPC = 3.0857e16;

// Galactic coordinates: x towards the Galactic Centre, y along the rotation
// (longitude 90°), z towards the north galactic pole.
export const SUN_GALACTIC_VELOCITY = [11.1, 30.32 * R0_KPC, 7.25]; // km/s; 30.32 km/s/kpc × R0 already includes V
const len = (v) => Math.hypot(...v);
export const GALAXY_SPEED = len(SUN_GALACTIC_VELOCITY);
export const GALACTIC_YEAR_MYR = (2 * Math.PI * R0_KPC * KM_PER_KPC) / (SUN_GALACTIC_VELOCITY[1] * SECONDS_PER_YEAR) / 1e6;

export const galacticVector = (lDeg, bDeg, speed) => {
  const l = (lDeg * Math.PI) / 180;
  const b = (bDeg * Math.PI) / 180;
  return [speed * Math.cos(b) * Math.cos(l), speed * Math.cos(b) * Math.sin(l), speed * Math.sin(b)];
};

export const SUN_CMB_SPEED = 369.82;
export const SUN_CMB_VELOCITY = galacticVector(264.02, 48.25, SUN_CMB_SPEED);
export const MILKY_WAY_CMB_VELOCITY = SUN_CMB_VELOCITY.map((v, i) => v - SUN_GALACTIC_VELOCITY[i]);
export const MILKY_WAY_CMB_SPEED = len(MILKY_WAY_CMB_VELOCITY);
// Direction of the Milky Way's motion, as galactic longitude and latitude.
export const MILKY_WAY_CMB_DIRECTION = (() => {
  const [x, y, z] = MILKY_WAY_CMB_VELOCITY;
  const l = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const b = (Math.asin(z / MILKY_WAY_CMB_SPEED) * 180) / Math.PI;
  return { l, b };
})();

// The four motions, nested from smallest to largest.
export const MOTIONS = [
  {
    key: 'spin',
    name: 'Spinning on its axis',
    short: 'Spin',
    speed: EQUATOR_SPEED,
    note: 'at the equator',
    fact: 'Earth turns once a day, so the ground under you moves fastest at the equator and not at all at the poles.',
    timeLabel: 'One day in 20 seconds',
  },
  {
    key: 'orbit',
    name: 'Orbiting the Sun',
    short: 'Around the Sun',
    speed: ORBIT_SPEED,
    note: 'on average',
    fact: 'One lap of about 940 million km a year. Earth is a little faster in early January, when it is closest to the Sun.',
    timeLabel: 'One year in 12 seconds · sizes enlarged',
  },
  {
    key: 'galaxy',
    name: 'Circling the Milky Way',
    short: 'Through the galaxy',
    speed: GALAXY_SPEED,
    note: 'with the Sun',
    fact: 'The Sun carries the planets around the galaxy. In one year it moves about 52 times the Earth–Sun distance, so the planets trace stretched spirals. Shown at true scale.',
    timeLabel: 'One year in 2.5 seconds · true scale',
  },
  {
    key: 'cosmos',
    name: 'Moving through the universe',
    short: 'Through the universe',
    speed: MILKY_WAY_CMB_SPEED,
    note: 'the Milky Way, against the cosmic background',
    fact: 'Measured against the afterglow of the Big Bang, the whole Milky Way is moving towards the constellation Hydra, pulled by the mass of nearby galaxy clusters.',
    timeLabel: 'The afterglow ahead looks slightly hotter, behind slightly cooler (exaggerated)',
  },
];

export const UNITS = {
  kms: { label: 'km/s', factor: 1, digits: 2 },
  kmh: { label: 'km/h', factor: KMS_TO_KMH, digits: 0 },
  mph: { label: 'mph', factor: KMS_TO_MPH, digits: 0 },
};

export function formatSpeed(kms, unit) {
  const { factor, digits, label } = UNITS[unit];
  const v = kms * factor;
  const d = unit === 'kms' && v >= 100 ? 0 : digits;
  const rounded = unit === 'kms' ? v : Math.round(v / (v >= 10000 ? 100 : 10)) * (v >= 10000 ? 100 : 10);
  return `${rounded.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })} ${label}`;
}

// Distance in km or miles, for the "since you opened this page" counters.
export function formatDistance(km, unit) {
  const miles = unit === 'mph';
  const v = miles ? km / 1.609344 : km;
  const label = miles ? 'miles' : 'km';
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} million ${label}`;
  return `${Math.round(v).toLocaleString('en-US')} ${label}`;
}
