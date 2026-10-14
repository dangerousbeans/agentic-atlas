import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { atlasLayout, TILE_W, TILE_H, type AtlasFamily, type Rect } from '../../src/lib/atlas-layout';

const real: AtlasFamily[] = readdirSync('src/content/families')
  .map(f => parse(readFileSync(`src/content/families/${f}`, 'utf8')))
  .map((f: { slug: string; name: string; rank: number; order: string[] }) => ({ slug: f.slug, name: f.name, rank: f.rank, patterns: f.order }));

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (inner: Rect, outer: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

const synthetic = (sizes: number[]): AtlasFamily[] =>
  sizes.map((n, i) => ({ slug: `f${i}`, name: `F${i}`, rank: sizes.length - i, patterns: Array.from({ length: n }, (_, j) => `f${i}-p${j}`) }));

describe('atlasLayout', () => {
  for (const [name, fams] of [['real catalog', real], ['synthetic 1..9', synthetic([1, 2, 3, 4, 5, 6, 7, 8, 9])], ['single family', synthetic([5])]] as const) {
    describe(name, () => {
      const L = atlasLayout(fams);
      const all = fams.flatMap(f => f.patterns);

      it('places every pattern exactly once', () => {
        expect(L.tiles.map(t => t.slug).sort()).toEqual([...all].sort());
        expect(new Set(L.tiles.map(t => t.slug)).size).toBe(all.length);
      });

      it('uses the fixed 220x170 tile size', () => {
        for (const t of L.tiles) { expect(t.w).toBe(TILE_W); expect(t.h).toBe(TILE_H); }
        expect([TILE_W, TILE_H]).toEqual([220, 170]);
      });

      it('never overlaps two tiles', () => {
        for (let i = 0; i < L.tiles.length; i++) for (let j = i + 1; j < L.tiles.length; j++)
          expect(overlap(L.tiles[i], L.tiles[j]), `${L.tiles[i].slug} vs ${L.tiles[j].slug}`).toBe(false);
      });

      it('never overlaps two islands, and keeps each tile inside its own island', () => {
        for (let i = 0; i < L.islands.length; i++) for (let j = i + 1; j < L.islands.length; j++)
          expect(overlap(L.islands[i], L.islands[j])).toBe(false);
        const isl = new Map(L.islands.map(i => [i.slug, i]));
        for (const t of L.tiles) expect(inside(t, isl.get(t.family)!), t.slug).toBe(true);
      });

      it('keeps tile coordinates relative to their island consistent with absolute ones', () => {
        const isl = new Map(L.islands.map(i => [i.slug, i]));
        for (const t of L.tiles) { const i = isl.get(t.family)!; expect([t.x - i.x, t.y - i.y]).toEqual([t.rx, t.ry]); }
      });

      it('fits everything inside the plane, with a margin', () => {
        const plane = { x: 0, y: 0, w: L.width, h: L.height };
        for (const i of L.islands) { expect(inside(i, plane)).toBe(true); expect(i.x).toBeGreaterThan(0); expect(i.y).toBeGreaterThan(0); }
      });

      it('lists islands by family rank and tiles in DOM order (family, then pattern)', () => {
        const ranked = [...fams].sort((a, b) => a.rank - b.rank);
        expect(L.islands.map(i => i.slug)).toEqual(ranked.map(f => f.slug));
        expect(L.tiles.map(t => t.slug)).toEqual(ranked.flatMap(f => f.patterns));
      });

      it('keeps at least 60px between vertically stacked islands, stagger included', () => {
        for (const a of L.islands) for (const b of L.islands) {
          if (a === b || !(a.x < b.x + b.w && b.x < a.x + a.w) || b.y <= a.y) continue;
          expect(b.y - (a.y + a.h), `${a.slug} above ${b.slug}`).toBeGreaterThanOrEqual(60);
        }
      });

      it('is deterministic', () => {
        expect(atlasLayout(fams)).toEqual(L);
        expect(atlasLayout([...fams].reverse())).toEqual(L);
      });
    });
  }

  it('lays the real catalog out wider than tall (a landscape map)', () => {
    const L = atlasLayout(real);
    expect(L.width).toBeGreaterThan(L.height);
  });
});
