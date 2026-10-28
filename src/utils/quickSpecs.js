// Splits a review's free-text quick specs into key numbers (shown as stat
// blocks) and everything else (shown as tags). Only clear matches become
// stats; an item that doesn't match stays a tag exactly as written.
//
//   "203mm (8 in) aperture"            → Aperture 203 mm (8″)
//   "1000 mm Focal Length (via ...)"   → Focal length 1000 mm, note "via ..."
//   "f/10 Schmidt-Cassegrain optics"   → Focal ratio f/10, plus tag "Schmidt-Cassegrain optics"
//   "6.2 lb (2.8 kg) total weight"     → Weight 6.2 lb (2.8 kg)

const INCH = /^([\d.]+)\s*(?:in|inch|inches|"|”|″)?$/i;

// "8 in", "8”", "4.49 in", "2.4" → "8″"
const inches = (text) => {
  const m = text?.trim().match(INCH);
  return m ? `${m[1]}″` : text?.trim() || null;
};

const PATTERNS = [
  {
    key: 'aperture',
    label: 'Aperture',
    re: /^([\d.]+)\s?mm\s*(?:\(([^)]*)\))?\s*aperture$/i,
    build: (m) => ({ value: m[1], unit: 'mm', alt: m[2] ? inches(m[2]) : null }),
  },
  {
    key: 'focal',
    label: 'Focal length',
    re: /^([\d.]+)\s?mm\s+focal length\s*(?:\(([^)]*)\))?$/i,
    build: (m) => ({ value: m[1], unit: 'mm', alt: m[2]?.trim() || null }),
  },
  {
    key: 'ratio',
    label: 'Focal ratio',
    re: /^f\/([\d.]+)\b\s*(.*)$/i,
    build: (m) => ({ value: `f/${m[1]}`, unit: '', alt: null, rest: m[2].trim() }),
  },
  {
    key: 'weight',
    label: 'Weight',
    re: /^([\d.]+)\s?(lbs?|kg)\s*(?:\(([\d.]+\s?(?:kg|lbs?))\))?\s*(?:total\s+)?(?:weight)?$/i,
    build: (m) => ({ value: m[1], unit: m[2].toLowerCase().startsWith('lb') ? 'lb' : 'kg', alt: m[3] ?? null }),
  },
];

export function splitQuickSpecs(items = []) {
  const stats = [];
  const tags = [];
  const taken = new Set();
  for (const raw of items) {
    const text = `${raw ?? ''}`.trim();
    if (!text) continue;
    let matched = false;
    for (const p of PATTERNS) {
      if (taken.has(p.key)) continue;
      const m = text.match(p.re);
      if (!m) continue;
      const { rest, ...stat } = p.build(m);
      stats.push({ key: p.key, label: p.label, ...stat });
      taken.add(p.key);
      if (rest) tags.push(rest);
      matched = true;
      break;
    }
    if (!matched) tags.push(text);
  }
  const order = PATTERNS.map((p) => p.key);
  stats.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return { stats, tags };
}
