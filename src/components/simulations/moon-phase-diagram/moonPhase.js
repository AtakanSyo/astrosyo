// Pure phase maths for the Moon phase diagram. Kept separate from the
// three.js component so it can be unit tested.
//
// `elongationDeg` is the Sun–Earth–Moon angle measured at Earth, in the
// direction the Moon travels: 0° = new moon, 90° = first quarter,
// 180° = full moon, 270° = last quarter.

export const SYNODIC_MONTH_DAYS = 29.53;

// How close (in degrees) the Moon has to be to an exact alignment for the
// phase to be named "New Moon", "First Quarter", etc. rather than one of the
// in-between phases. About one day of the Moon's motion either side.
const PRINCIPAL_PHASE_WINDOW_DEG = 6;

export function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

// Fraction of the Moon's Earth-facing disc that is sunlit, 0–1. Assumes the
// Sun is far enough away that its rays arrive parallel (it is ~400× farther
// than the Moon), so the phase angle at the Moon is 180° − elongation.
export function illuminatedFraction(elongationDeg) {
  const rad = (normalizeDeg(elongationDeg) * Math.PI) / 180;
  return (1 - Math.cos(rad)) / 2;
}

export function daysIntoCycle(elongationDeg) {
  return (normalizeDeg(elongationDeg) / 360) * SYNODIC_MONTH_DAYS;
}

export function phaseName(elongationDeg) {
  const deg = normalizeDeg(elongationDeg);
  const near = (target) => {
    const diff = Math.abs(deg - target);
    return Math.min(diff, 360 - diff) <= PRINCIPAL_PHASE_WINDOW_DEG;
  };
  if (near(0)) return 'New Moon';
  if (near(90)) return 'First Quarter';
  if (near(180)) return 'Full Moon';
  if (near(270)) return 'Last Quarter';
  if (deg < 90) return 'Waxing Crescent';
  if (deg < 180) return 'Waxing Gibbous';
  if (deg < 270) return 'Waning Gibbous';
  return 'Waning Crescent';
}
