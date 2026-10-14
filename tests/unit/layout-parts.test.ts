import { describe, it, expect } from 'vitest';
import { layoutDiagram, returnEdges, backEdges, labelLines, shownLabelIds, snapToGlyph, glyphCentre, labelBox, boxesOverlap, SHAPE_CY } from '../../src/lib/diagram/layout';
import { offsetPath } from '../../src/lib/diagram/geometry';
import type { DiagramSpec, DiagramNode, DiagramEdge } from '../../src/lib/diagram/types';
import { first, last } from './diagram-helpers';

const scenarios: DiagramSpec['scenarios'] = [{ id: 's', label: 'S', steps: [{ id: 'a', caption: 'A step', events: [{ type: 'activate', node: 'a', status: 'thinking' }] }] }];
const spec = (nodes: DiagramNode[], edges: DiagramEdge[], extra: Partial<DiagramSpec> = {}): DiagramSpec => ({ nodes, edges, scenarios, ...extra });
const llm = (id: string, label = id.toUpperCase()): DiagramNode => ({ id, kind: 'llm', label });
const e = (id: string, from: string, to: string, more: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, from, to, ...more });

// A hub with three workers that report back, plus an output: the shape of orchestrator-workers and supervisor.
const hub = spec([{ id: 'in', kind: 'io', label: 'In' }, llm('hub'), llm('w1'), llm('w2'), llm('w3'), { id: 'out', kind: 'io', label: 'Out' }], [
  e('task', 'in', 'hub'), e('d1', 'hub', 'w1'), e('d2', 'hub', 'w2'), e('d3', 'hub', 'w3'),
  e('r1', 'w1', 'hub', { style: 'dashed' }), e('r2', 'w2', 'hub', { style: 'dashed' }), e('r3', 'w3', 'hub', { style: 'dashed' }), e('done', 'hub', 'out'),
]);

describe('returnEdges', () => {
  it('maps each edge whose reverse was declared earlier to that forward edge', () => {
    expect([...returnEdges(hub)]).toEqual([['r1', 'd1'], ['r2', 'd2'], ['r3', 'd3']]);
  });
  it('ignores loop edges and pairs each forward edge at most once', () => {
    const s = spec([llm('a'), llm('b')], [e('ab', 'a', 'b'), e('ba', 'b', 'a'), e('ba2', 'b', 'a'), e('loop', 'b', 'a', { style: 'loop' })]);
    expect([...returnEdges(s)]).toEqual([['ba', 'ab']]);
  });
});

describe('backEdges', () => {
  it('finds edges back to an earlier node that close a cycle (handoff replies)', () => {
    const s = spec([{ id: 'user', kind: 'io', label: 'User' }, llm('triage'), llm('billing')], [e('in', 'user', 'triage'), e('to-billing', 'triage', 'billing'), e('reply', 'billing', 'user')]);
    expect([...backEdges(s, returnEdges(s))]).toEqual(['reply']);
  });
  it('does not count an edge to an earlier node when there is no cycle, nor return edges', () => {
    const s = spec([llm('a'), llm('b'), llm('c')], [e('ca', 'c', 'a'), e('ab', 'a', 'b')]);
    expect(backEdges(s, returnEdges(s)).size).toBe(0);
    expect(backEdges(hub, returnEdges(hub)).size).toBe(0);
  });
});

describe('offsetPath', () => {
  it('moves every segment of an L-shaped path by exactly d (miter join)', () => {
    const out = offsetPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 5);
    // first segment heads +x, normal (-dy, dx) is +y; second heads +y, normal is -x
    expect(out[0]).toEqual({ x: 0, y: 5 });
    expect(out[1].x).toBeCloseTo(95); expect(out[1].y).toBeCloseTo(5);
    expect(out[2].x).toBeCloseTo(95); expect(out[2].y).toBeCloseTo(50);
  });
  it('drops repeated points rather than producing NaN', () => {
    const out = offsetPath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }], 2);
    expect(out.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('labelLines', () => {
  it('wraps long narrow labels at the space nearest the middle', () => {
    expect(labelLines('Source router', 'narrow')).toEqual(['Source', 'router']);
    expect(labelLines('Output guard', 'narrow')).toEqual(['Output', 'guard']);
  });
  it('keeps short labels, single words and wide layouts on one line', () => {
    expect(labelLines('Planner', 'narrow')).toEqual(['Planner']);
    expect(labelLines('Orchestrator', 'narrow')).toEqual(['Orchestrator']);
    expect(labelLines('Source router', 'wide')).toEqual(['Source router']);
  });
});

describe('shownLabelIds', () => {
  it('shows a label repeated on edges converging on one node only once', () => {
    const s = spec([llm('a'), llm('b'), llm('c'), llm('j')], [e('aj', 'a', 'j', { label: 'rate?' }), e('bj', 'b', 'j', { label: 'rate?' }), e('cj', 'c', 'j', { label: 'other' }), e('ab', 'a', 'b', { label: 'rate?' })]);
    expect([...shownLabelIds(s)]).toEqual(['aj', 'cj', 'ab']);
  });
});

describe('snapToGlyph', () => {
  const box = { x: 0, y: 0, w: 136, h: 78 }, r = 21, g = glyphCentre(box);
  it('slides a horizontal end along its row onto the glyph circle', () => {
    const p = snapToGlyph({ x: 136, y: SHAPE_CY }, { x: 200, y: SHAPE_CY }, box, r);
    expect(p).toEqual({ x: g.x + r, y: SHAPE_CY });
    const q = snapToGlyph({ x: 0, y: SHAPE_CY + 5 }, { x: -50, y: SHAPE_CY + 5 }, box, r);
    expect(Math.hypot(q.x - g.x, q.y - g.y)).toBeCloseTo(r);
    expect(q.x).toBeLessThan(g.x);
  });
  it('slides an end arriving from above down to the glyph top, and leaves ends from below on the box bottom', () => {
    expect(snapToGlyph({ x: g.x, y: 0 }, { x: g.x, y: -40 }, box, r)).toEqual({ x: g.x, y: SHAPE_CY - r });
    expect(snapToGlyph({ x: g.x, y: 78 }, { x: g.x, y: 120 }, box, r)).toEqual({ x: g.x, y: 78 });
  });
});

describe('layoutDiagram behaviour', () => {
  it('hub: every out-edge leaves from its own point, and return lanes run beside their dispatch', async () => {
    for (const dir of ['RIGHT', 'DOWN'] as const) {
      const L = await layoutDiagram(hub, dir);
      const starts = ['d1', 'd2', 'd3', 'done'].map(id => first(L.edges[id].d));
      for (let i = 0; i < starts.length; i++) for (let j = i + 1; j < starts.length; j++)
        expect(Math.hypot(starts[i].x - starts[j].x, starts[i].y - starts[j].y), `${dir} ${i}/${j}`).toBeGreaterThanOrEqual(6);
      // a return edge ends where its dispatch starts, one lane (10px) over
      const d1 = first(L.edges.d1.d), r1 = last(L.edges.r1.d);
      expect(Math.hypot(d1.x - r1.x, d1.y - r1.y), `${dir} ${L.edges.d1.d} | ${L.edges.r1.d}`).toBeGreaterThan(6);
      expect(Math.hypot(d1.x - r1.x, d1.y - r1.y)).toBeLessThan(14);
    }
  });
  it('hub: a return lane never runs on top of the neighbouring pair\'s dispatch (ReAct shape)', async () => {
    // agent -> two tools with observation returns, plus a final answer: three out-ports on one hub
    const s = spec([{ id: 'q', kind: 'io', label: 'Q' }, llm('agent'), { id: 't1', kind: 'tool', label: 'Search' }, { id: 't2', kind: 'tool', label: 'Calculator' }, { id: 'out', kind: 'io', label: 'Answer' }],
      [e('ask', 'q', 'agent'), e('a1', 'agent', 't1', { label: 'action' }), e('o1', 't1', 'agent', { style: 'dashed', label: 'observation' }),
       e('a2', 'agent', 't2', { label: 'action' }), e('o2', 't2', 'agent', { style: 'dashed', label: 'observation' }), e('fin', 'agent', 'out', { label: 'final' })]);
    const L = await layoutDiagram(s, 'RIGHT');
    const pts = (d: string) => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => ({ x: +m[1], y: +m[2] }));
    const horiz = (d: string) => { const p = pts(d); return p.slice(1).map((q, i) => [p[i], q]).filter(([a, b]) => Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 4); };
    // every horizontal run of one pair keeps >= 8px from any overlapping horizontal run of another pair
    const pairs = [['a1', 'o1'], ['a2', 'o2'], ['fin']];
    for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++)
      for (const p of pairs[i]) for (const q of pairs[j]) for (const [a, b] of horiz(L.edges[p].d)) for (const [c, d] of horiz(L.edges[q].d)) {
        const overlap = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
        if (overlap > 4) expect(Math.abs(a.y - c.y), `${p} / ${q}`).toBeGreaterThanOrEqual(8);
      }
    // and each return lane carries its own label
    expect(L.edges.o2.label).toBeDefined();
    expect(shownLabelIds(s).has('o2')).toBe(true);
  });
  it('hub: lays out input, then hub, then workers (the forward flow wins cycle breaking)', async () => {
    const L = await layoutDiagram(hub, 'RIGHT');
    expect(L.nodes.in.x).toBeLessThan(L.nodes.hub.x);
    for (const w of ['w1', 'w2', 'w3']) expect(L.nodes.hub.x).toBeLessThan(L.nodes[w].x);
  });
  it('forward/return pair labels sit on opposite sides of the pair', async () => {
    const s = spec([llm('a'), llm('b'), llm('c')], [e('go', 'a', 'b', { label: 'action' }), e('back', 'b', 'a', { label: 'observation' }), e('next', 'a', 'c')]);
    const L = await layoutDiagram(s, 'RIGHT');

    expect(Math.abs(L.edges.go.label.y - L.edges.back.label.y)).toBeGreaterThanOrEqual(25);
    expect(boxesOverlap(labelBox(L.edges.go.label, 'action'), labelBox(L.edges.back.label, 'observation'))).toBe(false);
  });
  it('wraps a very long left-to-right chain onto a second row', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const s = spec(ids.map(id => llm(id)), ids.slice(1).map((id, i) => e(`e${i}`, ids[i], id)));
    const L = await layoutDiagram(s, 'RIGHT');
    expect(L.width).toBeLessThan(1450);
    expect(new Set(ids.map(id => Math.round(L.nodes[id].y))).size).toBeGreaterThan(1);
  });
  it('does not wrap when a loop arc would then span two rows', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const s = spec(ids.map(id => llm(id)), [...ids.slice(1).map((id, i) => e(`e${i}`, ids[i], id)), e('again', 'n10', 'n1', { style: 'loop' })]);
    const L = await layoutDiagram(s, 'RIGHT');
    expect(Math.abs(L.nodes.n10.y - L.nodes.n1.y)).toBeLessThan(60);
  });
  it('pins place glyph centres in RIGHT and are used transposed in DOWN', async () => {
    const s = spec([{ ...llm('a'), pos: { x: 0, y: 0 } }, { ...llm('b'), pos: { x: 200, y: 80 } }, { id: 'c', kind: 'io', label: 'C', pos: { x: 400, y: 0 } }], [e('ab', 'a', 'b'), e('bc', 'b', 'c')]);
    const R = await layoutDiagram(s, 'RIGHT'), D = await layoutDiagram(s, 'DOWN');
    const gr = (id: string) => glyphCentre(R.nodes[id]), gd = (id: string) => glyphCentre(D.nodes[id]);
    expect(gr('b').x - gr('a').x).toBeCloseTo(200); expect(gr('b').y - gr('a').y).toBeCloseTo(80);
    expect(gr('c').x - gr('a').x).toBeCloseTo(400); expect(gr('c').y - gr('a').y).toBeCloseTo(0);
    expect(gd('b').x - gd('a').x).toBeCloseTo(80); expect(gd('b').y - gd('a').y).toBeCloseTo(200);
    expect(gd('c').y - gd('a').y).toBeCloseTo(400);
  });
  it('narrow layouts are slimmer than wide ones and grow boxes for wrapped labels', async () => {
    const s = spec([llm('a', 'Source router'), llm('b', 'Planner')], [e('ab', 'a', 'b')]);
    const W = await layoutDiagram(s, 'DOWN', 'wide'), N = await layoutDiagram(s, 'DOWN', 'narrow');
    expect(N.nodes.a.w).toBeLessThan(W.nodes.a.w);
    expect(N.nodes.a.h - N.nodes.b.h).toBe(12);
  });
});
