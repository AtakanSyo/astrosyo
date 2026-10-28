import { describe, expect, it } from 'vitest';
import { splitQuickSpecs } from './quickSpecs.js';

describe('splitQuickSpecs', () => {
  it('pulls the key numbers out of a typical spec list', () => {
    const { stats, tags } = splitQuickSpecs([
      '203mm (8 in) aperture',
      '2032mm focal length',
      'f/10 Schmidt-Cassegrain optics',
      'HyperStar compatible',
      'GoTo',
    ]);
    expect(stats).toEqual([
      { key: 'aperture', label: 'Aperture', value: '203', unit: 'mm', alt: '8″' },
      { key: 'focal', label: 'Focal length', value: '2032', unit: 'mm', alt: null },
      { key: 'ratio', label: 'Focal ratio', value: 'f/10', unit: '', alt: null },
    ]);
    expect(tags).toEqual(['Schmidt-Cassegrain optics', 'HyperStar compatible', 'GoTo']);
  });

  it('handles the spelling variants used across reviews', () => {
    const { stats } = splitQuickSpecs([
      '100mm (4”) Aperture',
      '1000 mm Focal Length (via corrector lens)',
      'f/4.5',
      '6.2 lb (2.8 kg) total weight',
    ]);
    expect(stats.map((s) => [s.value, s.unit, s.alt])).toEqual([
      ['100', 'mm', '4″'],
      ['1000', 'mm', 'via corrector lens'],
      ['f/4.5', '', null],
      ['6.2', 'lb', '2.8 kg'],
    ]);
    expect(splitQuickSpecs(['61mm (2.4) Aperture']).stats[0].alt).toBe('2.4″');
    expect(splitQuickSpecs(['5.5 lbs']).stats[0]).toMatchObject({ value: '5.5', unit: 'lb' });
  });

  it('keeps anything unclear as a tag, unchanged', () => {
    const items = ['1.25” helical focuser', '38 lb (17 kg) Dobsonian base', '8x50 right-angle finder', '140× Highest Magnification'];
    expect(splitQuickSpecs(items)).toEqual({ stats: [], tags: items });
  });

  it('promotes only the first match of each kind', () => {
    const { stats, tags } = splitQuickSpecs(['f/5', 'f/10 Schmidt-Cassegrain']);
    expect(stats).toHaveLength(1);
    expect(tags).toEqual(['f/10 Schmidt-Cassegrain']);
  });
});
