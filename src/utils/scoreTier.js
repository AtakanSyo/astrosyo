// How a review score is shown on a card's rating ring: the number, how much
// of the ring is filled, and its colour tier. Accepts the score as a number
// or text ("8.5", "N/A"); anything that isn't 0–10 counts as unrated.
export function scoreTier(score) {
  const value = typeof score === 'number' ? score : Number.parseFloat(score);
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    return { text: null, fill: 0, tier: 'none', label: 'Not rated' };
  }
  const tier = value >= 9 ? 'top' : value >= 8 ? 'great' : value >= 6 ? 'good' : 'low';
  return { text: value.toFixed(1), fill: value / 10, tier, label: `Rated ${value.toFixed(1)} out of 10` };
}
