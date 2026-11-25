// Tells re-framed cover images apart from older ones, at build time.
//
// Re-framed covers (see TTB/telescope-image-gradients.txt) are exactly
// 1600 x 1600, with the telescope centred at about 45% of the frame on a
// gradient. The review header shows those zoomed in, so the telescope fills
// the photo area instead of floating small in its padding. Older covers come
// in other sizes and keep the regular header styling.
//
// A review can force either look with `coverFraming: framed` or
// `coverFraming: classic` in its frontmatter.

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

const FRAMED_SIZE = 1600;
const cache = new Map();

/** Returns 'framed' for a re-framed cover, else 'classic'. */
export async function coverFraming(coverPath, override) {
  if (override === 'framed' || override === 'classic') return override;
  if (!coverPath) return 'classic';
  if (cache.has(coverPath)) return cache.get(coverPath);

  let result = 'classic';
  try {
    const file = path.join(process.cwd(), 'public', coverPath);
    if (fs.existsSync(file)) {
      const { width, height } = await sharp(file).metadata();
      if (width === FRAMED_SIZE && height === FRAMED_SIZE) result = 'framed';
    }
  } catch {
    result = 'classic';
  }
  cache.set(coverPath, result);
  return result;
}
