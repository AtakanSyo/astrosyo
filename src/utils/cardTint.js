// A post's `postColor` (e.g. "rgba(18, 92, 102, 1)") as an "rgb(r, g, b)"
// string for tinting its card, or null when it is missing or not an rgba()
// colour. Used by AprilPostCard.astro and SearchPosts.jsx.
export function cardTint(postColor) {
  if (typeof postColor !== 'string') return null;
  const m = postColor.trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i);
  if (!m) return null;
  const [r, g, b] = m.slice(1, 4).map(Number);
  if (![r, g, b].every((v) => v <= 255)) return null;
  return `rgb(${r}, ${g}, ${b})`;
}
