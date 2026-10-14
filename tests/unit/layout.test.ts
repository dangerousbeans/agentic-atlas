import { describe, it, expect } from 'vitest';
import { layoutDiagram } from '../../src/lib/diagram/layout';
import type { DiagramSpec } from '../../src/lib/diagram/types';
import { first, last, attached } from './diagram-helpers';

const loop: DiagramSpec = {
  nodes: [{ id: 'in', description: 'A fixture node.', kind: 'io', label: 'In' }, { id: 'gen', description: 'A fixture node.', kind: 'llm', label: 'Gen' }, { id: 'eval', description: 'A fixture node.', kind: 'evaluator', label: 'Eval' }, { id: 'out', description: 'A fixture node.', kind: 'io', label: 'Out' }],
  edges: [{ id: 'task', description: 'A fixture edge.', example: 'A sample payload', from: 'in', to: 'gen' }, { id: 'draft', description: 'A fixture edge.', example: 'A sample payload', from: 'gen', to: 'eval' }, { id: 'revise', description: 'A fixture edge.', example: 'A sample payload', from: 'eval', to: 'gen', style: 'loop', label: 'revise' }, { id: 'accept', description: 'A fixture edge.', example: 'A sample payload', from: 'eval', to: 'out' }],
  scenarios: [{ id: 's', label: 'S', steps: [{ id: 'a', caption: 'A', events: [{ type: 'send', edge: 'task', token: { kind: 'prompt' } }] }] }],
};
const fan: DiagramSpec = {
  nodes: [{ id: 'o', description: 'A fixture node.', kind: 'llm', label: 'Orch' }, ...[1, 2, 3, 4, 5].map(i => ({ id: `w${i}`, description: 'A fixture node.', kind: 'llm' as const, label: `W${i}` })), { id: 'out', description: 'A fixture node.', kind: 'io', label: 'Out' }],
  edges: [...[1, 2, 3, 4, 5].flatMap(i => [{ id: `d${i}`, description: 'A fixture edge.', example: 'A sample payload', from: 'o', to: `w${i}` }, { id: `r${i}`, description: 'A fixture edge.', example: 'A sample payload', from: `w${i}`, to: 'out' }])],
  scenarios: loop.scenarios.map(s => ({ ...s, steps: [{ id: 'a', caption: 'A', events: [{ type: 'send' as const, edge: 'd1', token: { kind: 'prompt' as const } }] }] })),
};
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layoutDiagram', () => {
  for (const dir of ['RIGHT', 'DOWN'] as const) {
    it(`${dir}: boxes for every node, no overlaps, all inside the canvas (Review Focus 4)`, async () => {
      for (const spec of [loop, fan]) {
        const L = await layoutDiagram(spec, dir);
        const boxes = spec.nodes.map(n => L.nodes[n.id]);
        boxes.forEach(b => { expect(b).toBeDefined(); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(L.width); expect(b.y + b.h).toBeLessThanOrEqual(L.height); });
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
        spec.edges.forEach(e => expect(L.edges[e.id].d).toMatch(/^M/));
      }
    });
  }
  it('loop edges are drawn as cubic arcs', async () => {
    const L = await layoutDiagram(loop, 'RIGHT');
    expect(L.edges.revise.d).toMatch(/ C/);
  });
  it('RIGHT layout is wider than tall; DOWN is taller than wide (for a chain)', async () => {
    const r = await layoutDiagram(loop, 'RIGHT'); const d = await layoutDiagram(loop, 'DOWN');
    expect(r.width).toBeGreaterThan(r.height); expect(d.height).toBeGreaterThan(d.width);
  });
  it('pos overrides keep relative placement', async () => {
    const spec: DiagramSpec = { ...loop, nodes: loop.nodes.map(n => n.id === 'in' ? { ...n, pos: { x: 0, y: 0 } } : n.id === 'out' ? { ...n, pos: { x: 600, y: 0 } } : n) };
    const L = await layoutDiagram(spec, 'RIGHT');
    expect(L.nodes.out.x - L.nodes.in.x).toBe(600);
    expect(L.nodes.out.y - L.nodes.in.y).toBe(0);
  });
  it('groups get a bounding box around their children', async () => {
    const spec: DiagramSpec = { ...loop, groups: [{ id: 'team', label: 'Team', children: ['gen', 'eval'] }] };
    const L = await layoutDiagram(spec, 'RIGHT');
    const g = L.groups.team, a = L.nodes.gen;
    expect(a.x).toBeGreaterThanOrEqual(g.x); expect(a.x + a.w).toBeLessThanOrEqual(g.x + g.w);
  });

  // Edges end at the glyph (within 2px of its boundary), not at the edge of the wider label box.
  const kind = (spec: DiagramSpec, id: string) => spec.nodes.find(n => n.id === id)!.kind;
  const expectEdgesOnBorders = (spec: DiagramSpec, L: Awaited<ReturnType<typeof layoutDiagram>>, dir: 'RIGHT' | 'DOWN', only?: Set<string>) => {
    for (const e of spec.edges) {
      if (e.style === 'loop') continue;
      if (only && !only.has(e.id)) continue;
      const d = L.edges[e.id].d;
      expect(attached(kind(spec, e.from), L.nodes[e.from], first(d), dir), `${e.id} start ${d}`).toBe(true);
      expect(attached(kind(spec, e.to), L.nodes[e.to], last(d), dir), `${e.id} end ${d}`).toBe(true);
    }
  };
  for (const dir of ['RIGHT', 'DOWN'] as const) {
    it(`${dir}: with a group, edge endpoints lie on their node glyph boundaries`, async () => {
      const spec: DiagramSpec = { ...loop, groups: [{ id: 'team', label: 'Team', children: ['gen', 'eval'] }] };
      expectEdgesOnBorders(spec, await layoutDiagram(spec, dir), dir);
    });
  }
  it('bidirectional pair gets visibly separate paths', async () => {
    const spec: DiagramSpec = {
      nodes: [{ id: 'a', description: 'A fixture node.', kind: 'llm', label: 'A' }, { id: 'b', description: 'A fixture node.', kind: 'llm', label: 'B' }],
      edges: [{ id: 'ab', description: 'A fixture edge.', example: 'A sample payload', from: 'a', to: 'b' }, { id: 'ba', description: 'A fixture edge.', example: 'A sample payload', from: 'b', to: 'a' }],
      scenarios: loop.scenarios.map(s => ({ ...s, steps: [{ id: 'a', caption: 'A', events: [{ type: 'send' as const, edge: 'ab', token: { kind: 'prompt' as const } }] }] })),
    };
    const L = await layoutDiagram(spec, 'RIGHT');
    expect(L.edges.ab.d).not.toBe(L.edges.ba.d);
    const p = first(L.edges.ab.d), q = first(L.edges.ba.d);
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(8);
  });
  it('edges touching pinned nodes start and end on the pinned glyph boundaries', async () => {
    const spec: DiagramSpec = { ...loop, nodes: loop.nodes.map(n => n.id === 'in' ? { ...n, pos: { x: 0, y: 0 } } : n.id === 'out' ? { ...n, pos: { x: 600, y: 0 } } : n) };
    const L = await layoutDiagram(spec, 'RIGHT');
    expectEdgesOnBorders(spec, L, 'RIGHT', new Set(['task', 'accept']));
  });
});
