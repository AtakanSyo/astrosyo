// Sizes for the black hole / giant star scale tour, all in astronomical units.
//
// Black holes are drawn at their Schwarzschild radius (r_s = 2GM/c², the event
// horizon of a non-rotating black hole), computed with the same function as
// the Schwarzschild Radius Calculator so the two pages always agree. Stars are
// drawn at their photospheric radius.
//
// Sources (keep the post's numbers in sync with these):
// - Sun: IAU nominal solar radius, 695,700 km.
// - Sagittarius A*: 4.297 × 10⁶ M☉ (GRAVITY Collaboration 2022), the same
//   value as the Schwarzschild calculator's preset.
// - UY Scuti: 909 R☉ (Healy et al., photometry with the Gaia DR3 distance).
//   The long-quoted 1,708 R☉ (Arroyo-Torres et al. 2013) assumed a much larger
//   distance.
// - Stephenson 2-18: 1,840 (+310/−360) R☉ (Siebert et al. 2026). The older
//   2,150 R☉ figure is the one most often repeated; its distance alone may be
//   uncertain by up to ~50%.
// - M87*: 6.5 × 10⁹ M☉ (Event Horizon Telescope 2019).
// - TON 618: 4.07 × 10¹⁰ M☉ (Ge et al. 2019, C IV line). The older, still
//   widely cited 6.6 × 10¹⁰ M☉ (Hβ line) gives an event horizon of ~1,300 AU.
// - Orbits: semi-major axes from the NASA planetary fact sheets. Kuiper Belt
//   outer edge ~50 AU. Voyager 1 ~170 AU from the Sun in late 2026.

import { M_SUN, schwarzschildRadiusM } from '../schwarzschild-radius-calculator/schwarzschild.js';

export const AU_KM = 149597870.7;
export const R_SUN_KM = 695700;
export const R_EARTH_KM = 6371;

const kmToAu = (km) => km / AU_KM;
const blackHoleRadiusAu = (massSolar) => kmToAu(schwarzschildRadiusM(massSolar * M_SUN) / 1000);

export const R_EARTH_AU = kmToAu(R_EARTH_KM);

// In order of size: each stage zooms out to the next object.
export const OBJECTS = [
  {
    key: 'sun',
    name: 'The Sun',
    short: 'Sun',
    kind: 'star',
    color: 0xfff2e0,
    radiusAu: kmToAu(R_SUN_KM),
    detail: 'Our star, 1 solar mass',
    fact: '109 Earths would fit across its face. Earth is drawn beside it to scale.',
  },
  {
    key: 'sgra',
    name: 'Sagittarius A*',
    short: 'Sgr A*',
    kind: 'blackhole',
    massSolar: 4.297e6,
    radiusAu: blackHoleRadiusAu(4.297e6),
    detail: 'The Milky Way’s central black hole, 4.3 million solar masses',
    fact: 'Its event horizon is about 18 times the Sun’s radius, but it would still sit well inside Mercury’s orbit.',
  },
  {
    key: 'uyscuti',
    name: 'UY Scuti',
    short: 'UY Scuti',
    kind: 'star',
    color: 0xff6a40,
    radiusSolar: 909,
    radiusAu: kmToAu(909 * R_SUN_KM),
    detail: 'Red supergiant, about 909 times the Sun’s radius',
    fact: 'Placed where the Sun is, it would swallow Mercury, Venus, Earth and Mars and reach most of the way to Jupiter.',
  },
  {
    key: 'st218',
    name: 'Stephenson 2-18',
    short: 'Stephenson 2-18',
    kind: 'star',
    color: 0xff4a30,
    radiusSolar: 1840,
    radiusAu: kmToAu(1840 * R_SUN_KM),
    detail: 'Red supergiant, about 1,840 times the Sun’s radius',
    fact: 'Its surface would lie between the orbits of Jupiter and Saturn. Older estimates (2,150 R☉) put it just past Saturn.',
  },
  {
    key: 'm87',
    name: 'M87*',
    short: 'M87*',
    kind: 'blackhole',
    massSolar: 6.5e9,
    radiusAu: blackHoleRadiusAu(6.5e9),
    detail: 'The first black hole ever imaged, 6.5 billion solar masses',
    fact: 'Its event horizon is about four times wider than Neptune’s orbit.',
  },
  {
    key: 'ton618',
    name: 'TON 618',
    short: 'TON 618',
    kind: 'blackhole',
    massSolar: 4.07e10,
    radiusAu: blackHoleRadiusAu(4.07e10),
    detail: 'One of the most massive black holes known, about 40.7 billion solar masses',
    fact: 'Its event horizon is about 27 times wider than Neptune’s orbit. Voyager 1, the farthest spacecraft, would still be deep inside.',
  },
];

// Reference rings drawn around the object, which always sits where the Sun is.
export const ORBITS = [
  { name: 'Mercury', au: 0.387, color: 0xbfb8ad },
  { name: 'Venus', au: 0.723, color: 0xe6c98f },
  { name: 'Earth', au: 1.0, color: 0x6fb2ff },
  { name: 'Mars', au: 1.524, color: 0xe08a5e },
  { name: 'Jupiter', au: 5.203, color: 0xe2b98a },
  { name: 'Saturn', au: 9.537, color: 0xe8d6a8 },
  { name: 'Uranus', au: 19.19, color: 0x9fdde6 },
  { name: 'Neptune', au: 30.07, color: 0x6f8fff },
  { name: 'Kuiper Belt edge', au: 50, color: 0x9a9aa8, faint: true },
  { name: 'Voyager 1 (2026)', au: 170, color: 0xc8d2ff, faint: true },
];

// Readable distance for a value in AU: km below ~0.05 AU, AU above.
export function formatDistance(au) {
  if (au < 0.05) {
    const km = au * AU_KM;
    if (km >= 1e6) return `${(km / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} million km`;
    return `${Math.round(km).toLocaleString('en-US')} km`;
  }
  if (au < 10) return `${au.toLocaleString('en-US', { maximumFractionDigits: 2 })} AU`;
  return `${Math.round(au).toLocaleString('en-US')} AU`;
}
