import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '../src/data/types';
import { ELEMENT_GLYPHS } from '../src/ui/elementIcons';

describe('Element symbols', () => {
  it('every element (and Neutral) has a symbol that fits its 14px canvas with an outline', () => {
    for (const el of [...ELEMENTS, 'Neutral' as const]) {
      const rows = ELEMENT_GLYPHS[el];
      expect(rows, el).toBeDefined();
      expect(rows.length, el).toBeLessThanOrEqual(12);
      for (const r of rows) {
        expect(r.length, el).toBeLessThanOrEqual(12);
        expect(r, el).toMatch(/^[.XWxd]+$/);
      }
    }
  });

  it('no two symbols are the same shape', () => {
    const shapes = Object.values(ELEMENT_GLYPHS).map((rows) => rows.map((r) => r.replace(/[XWxd]/g, '#')).join('/'));
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
