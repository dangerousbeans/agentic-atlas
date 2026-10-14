import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { layoutDiagram, labelBox, boxesOverlap, shownLabelIds } from '../../src/lib/diagram/layout';
import type { DiagramSpec } from '../../src/lib/diagram/types';
import { first, last, attached } from './diagram-helpers';

// Every shipped diagram, in both the wide (RIGHT) and the phone (DOWN, narrow) layouts.
const root = 'src/content/patterns';
const specs = readdirSync(root).sort().map(slug => ({ slug, spec: parse(readFileSync(`${root}/${slug}/pattern.yaml`, 'utf8')).diagram as DiagramSpec }));
const layouts = [['RIGHT', 'wide'], ['DOWN', 'narrow']] as const;

describe('layout of every real pattern diagram', () => {
  it('covers all 21 patterns', () => expect(specs).toHaveLength(21));
  for (const { slug, spec } of specs) for (const [dir, variant] of layouts) {
    describe(`${slug} ${dir}`, async () => {
      const L = await layoutDiagram(spec, dir, variant);
      const kind = (id: string) => spec.nodes.find(n => n.id === id)!.kind;

      it('no two node boxes overlap', () => {
        const ids = spec.nodes.map(n => n.id);
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
          expect(boxesOverlap(L.nodes[ids[i]], L.nodes[ids[j]]), `${ids[i]} / ${ids[j]}`).toBe(false);
      });

      it('no edge label box overlaps a node box, and all fit on the canvas', () => {
        const shown = shownLabelIds(spec);
        for (const e of spec.edges) {
          if (!shown.has(e.id)) continue;
          const b = labelBox(L.edges[e.id].label, e.label!);
          for (const n of spec.nodes) expect(boxesOverlap(b, L.nodes[n.id]), `label ${e.id} over node ${n.id}`).toBe(false);
          expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(L.width); expect(b.y + b.h).toBeLessThanOrEqual(L.height);
        }
      });

      it('edge labels on one baseline keep a clear gap, so two never read as one phrase', () => {
        const boxes = spec.edges.filter(e => shownLabelIds(spec).has(e.id)).map(e => ({ id: e.id, b: labelBox(L.edges[e.id].label, e.label!) }));
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].b, b = boxes[j].b;
          if (Math.abs(a.y - b.y) >= 8) continue;
          const gap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
          expect(gap, `${boxes[i].id} / ${boxes[j].id}`).toBeGreaterThanOrEqual(60);
        }
      });

      if (variant === 'narrow') it('on a 390px phone, scrolled to the middle as the player starts, no edge label is cut off', () => {
        const view = 330 / 0.86; // stage content width / the narrow layout's minimum scale, in SVG units
        const lo = (L.width - view) / 2, hi = (L.width + view) / 2;
        if (lo <= 0) return; // fits without scrolling
        for (const e of spec.edges) {
          if (!shownLabelIds(spec).has(e.id)) continue;
          const b = labelBox(L.edges[e.id].label, e.label!);
          expect(b.x, `${e.id} left`).toBeGreaterThanOrEqual(lo);
          expect(b.x + b.w, `${e.id} right`).toBeLessThanOrEqual(hi);
        }
      });

      it('every edge starts and ends within 2px of its node glyph boundary', () => {
        for (const e of spec.edges) {
          const d = L.edges[e.id].d;
          expect(attached(kind(e.from), L.nodes[e.from], first(d), dir), `${e.id} start ${d}`).toBe(true);
          expect(attached(kind(e.to), L.nodes[e.to], last(d), dir), `${e.id} end ${d}`).toBe(true);
        }
      });
    });
  }
});
