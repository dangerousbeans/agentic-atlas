import ELK from 'elkjs/lib/elk.bundled.js';
import type { DiagramSpec, NodeSize } from './types';
import { DEFAULT_SIZE } from './types';
import { roundedPath, cubicPath, loopArc, borderPoint, polylineMid, offsetPath, type Pt, type Box } from './geometry';

export const NODE_DIMS: Record<NodeSize, { w: number; h: number }> = { sm: { w: 96, h: 72 }, md: { w: 136, h: 72 }, lg: { w: 176, h: 72 } };
/** Vertical centre of the node glyph inside its box (see NodeShape.astro). */
export const SHAPE_CY = 26;
export interface EdgeLabelPos { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
export interface EdgeGeom { d: string; mid: Pt; label: EdgeLabelPos }
export interface DiagramLayout { width: number; height: number; nodes: Record<string, Box>; edges: Record<string, EdgeGeom>; groups: Record<string, Box & { label: string }> }

type Raw = { kind: 'poly'; pts: Pt[]; side: number } | { kind: 'arc'; s: Pt; c1: Pt; c2: Pt; e: Pt };
const elk = new ELK();
const PAD = 28;
/** Half the gap between a forward edge and its parallel return edge. */
const LANE = 5;

interface ElkPort { id: string; x: number; y: number; width: number; height: number; layoutOptions: Record<string, string> }
interface ElkNode { id: string; x?: number; y?: number; width?: number; height?: number; children?: ElkNode[]; ports?: ElkPort[]; layoutOptions?: Record<string, string>; edges?: ElkEdge[] }
interface ElkEdge { id: string; sources: string[]; targets: string[]; container?: string; sections?: { startPoint: Pt; endPoint: Pt; bendPoints?: Pt[] }[] }

/**
 * Edges whose reverse edge was declared earlier ("return" edges, e.g. a worker's result flowing back to its hub).
 * They are left out of ELK, so the layering is driven by the forward flow only, and are drawn as a parallel of
 * their forward edge instead. Maps return edge id -> forward edge id.
 */
export function returnEdges(d: DiagramSpec): Map<string, string> {
  const m = new Map<string, string>();
  d.edges.forEach((e, i) => {
    if (e.style === 'loop') return;
    const fwd = d.edges.slice(0, i).find(o => o.style !== 'loop' && o.from === e.to && o.to === e.from && !m.has(o.id));
    if (fwd) m.set(e.id, fwd.id);
  });
  return m;
}

export async function layoutDiagram(d: DiagramSpec, direction: 'RIGHT' | 'DOWN'): Promise<DiagramLayout> {
  const dims = (id: string) => { const n = d.nodes.find(x => x.id === id)!; return NODE_DIMS[n.size ?? DEFAULT_SIZE[n.kind]]; };
  const grouped = new Set((d.groups ?? []).flatMap(g => g.children));
  const returns = returnEdges(d);
  const forwards = new Set(returns.values());
  // One fixed port per side, aligned with the glyph, so edges meet the shape head-on instead of anywhere on the box.
  const inPort = (id: string) => `${id}__in`, outPort = (id: string) => `${id}__out`;
  const leaf = (id: string): ElkNode => {
    const { w, h } = dims(id);
    const ports: ElkPort[] = direction === 'RIGHT'
      ? [{ id: inPort(id), x: 0, y: SHAPE_CY, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'WEST' } },
         { id: outPort(id), x: w, y: SHAPE_CY, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'EAST' } }]
      : [{ id: inPort(id), x: w / 2, y: 0, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'NORTH' } },
         { id: outPort(id), x: w / 2, y: h, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'SOUTH' } }];
    return { id, width: w, height: h, ports, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' } };
  };
  const order = new Map(d.nodes.map((n, i) => [n.id, i]));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': direction, 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.spacing.nodeNodeBetweenLayers': direction === 'RIGHT' ? '72' : '56',
      'elk.spacing.nodeNode': direction === 'RIGHT' ? '32' : '24',
      'elk.spacing.edgeNode': '20', 'elk.spacing.edgeEdge': '16',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '16', 'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    },
    children: [
      ...(d.groups ?? []).map(g => ({ id: g.id, layoutOptions: { 'elk.padding': '[top=34,left=18,bottom=18,right=18]' }, children: g.children.map(leaf) })),
      ...d.nodes.filter(n => !grouped.has(n.id)).map(n => leaf(n.id)),
    ],
    edges: d.edges.filter(e => e.style !== 'loop' && !returns.has(e.id)).map(e => ({ id: e.id, sources: [outPort(e.from)], targets: [inPort(e.to)] })),
  };
  // keep groups in model order relative to the nodes around them
  graph.children!.sort((a, b) => (order.get(a.id) ?? Math.min(...(a.children ?? []).map(c => order.get(c.id) ?? 0))) - (order.get(b.id) ?? Math.min(...(b.children ?? []).map(c => order.get(c.id) ?? 0))));
  const out = (await elk.layout(graph as never)) as unknown as ElkNode;

  const abs: Record<string, Pt> = { root: { x: 0, y: 0 } };
  const nodes: Record<string, Box> = {};
  const groups: Record<string, Box & { label: string }> = {};
  const walk = (n: ElkNode, off: Pt) => {
    for (const c of n.children ?? []) {
      const pos = { x: off.x + (c.x ?? 0), y: off.y + (c.y ?? 0) };
      abs[c.id] = pos;
      const box = { ...pos, w: c.width ?? 0, h: c.height ?? 0 };
      const g = d.groups?.find(x => x.id === c.id);
      if (g) groups[g.id] = { ...box, label: g.label }; else nodes[c.id] = box;
      walk(c, pos);
    }
  };
  walk(out, { x: 0, y: 0 });

  // pos overrides (relative to the first pinned node's ELK position, so relative offsets are exact)
  const pinned = d.nodes.filter(n => n.pos);
  const moved = new Set<string>();
  if (pinned.length) {
    const anchor = nodes[pinned[0].id];
    const ox = anchor.x - pinned[0].pos!.x, oy = anchor.y - pinned[0].pos!.y;
    for (const n of pinned) { nodes[n.id] = { ...nodes[n.id], x: n.pos!.x + ox, y: n.pos!.y + oy }; moved.add(n.id); }
  }

  const raw: Record<string, Raw> = {};
  const outEdges = new Map<string, ElkEdge>();
  const collect = (n: ElkNode) => { for (const e of n.edges ?? []) outEdges.set(e.id, e); for (const c of n.children ?? []) collect(c); };
  collect(out);
  const pairs = new Set(d.edges.filter(e => e.style !== 'loop' && d.edges.some(o => o.style !== 'loop' && o.from === e.to && o.to === e.from)).map(e => e.id));
  const route = (id: string): Pt[] => {
    const e = d.edges.find(x => x.id === id)!;
    const a = nodes[e.from], b = nodes[e.to];
    const oe = outEdges.get(id);
    if (!oe?.sections?.length || moved.has(e.from) || moved.has(e.to)) {
      const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      return [borderPoint(a, cb), borderPoint(b, ca)];
    }
    const off = abs[oe.container ?? 'root'] ?? { x: 0, y: 0 };
    const s = oe.sections[0];
    return [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(q => ({ x: q.x + off.x, y: q.y + off.y }));
  };
  for (const e of d.edges) {
    if (e.style === 'loop') { raw[e.id] = { kind: 'arc', ...loopArc(nodes[e.from], nodes[e.to], direction) }; continue; }
    const fwd = returns.get(e.id);
    let pts = fwd ? route(fwd).reverse() : route(e.id);
    let side = 0;
    if (pairs.has(e.id) || forwards.has(e.id)) { pts = offsetPath(pts, LANE); side = 1; }
    raw[e.id] = { kind: 'poly', pts, side };
  }

  // normalize to a padded canvas
  const xs: number[] = [], ys: number[] = [];
  for (const b of [...Object.values(nodes), ...Object.values(groups)]) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h + 6); }
  for (const r of Object.values(raw)) for (const q of r.kind === 'poly' ? r.pts : [r.s, r.c1, r.c2, r.e]) { xs.push(q.x); ys.push(q.y); }
  const minX = Math.min(...xs) - PAD, minY = Math.min(...ys) - PAD;
  const sh = (q: Pt): Pt => ({ x: q.x - minX, y: q.y - minY });
  const shBox = <T extends Box>(b: T): T => ({ ...b, x: b.x - minX, y: b.y - minY });
  for (const k in nodes) nodes[k] = shBox(nodes[k]);
  for (const k in groups) groups[k] = shBox(groups[k]);
  const polys: Record<string, Pt[]> = {};
  for (const [k, r] of Object.entries(raw)) if (r.kind === 'poly') polys[k] = r.pts.map(sh);
  const edges: Record<string, EdgeGeom> = {};
  for (const [k, r] of Object.entries(raw)) {
    if (r.kind === 'poly') {
      const pts = polys[k];
      const partner = returns.get(k) ?? [...returns].find(([, f]) => f === k)?.[0];
      const others = Object.entries(polys).filter(([o]) => o !== k && o !== partner).map(([, v]) => v);
      edges[k] = { d: roundedPath(pts, 10), mid: polylineMid(pts), label: labelPos(pts, others, direction, r.side, returns.has(k)) };
    } else {
      const [s, c1, c2, e] = [r.s, r.c1, r.c2, r.e].map(sh);
      const mid = { x: 0.125 * s.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * e.x, y: 0.125 * s.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * e.y };
      edges[k] = { d: cubicPath(s, c1, c2, e), mid, label: direction === 'RIGHT' ? { x: mid.x, y: mid.y - 8, anchor: 'middle' } : { x: mid.x + 8, y: mid.y + 5, anchor: 'start' } };
    }
  }
  return { width: Math.ceil(Math.max(...xs) - minX + PAD), height: Math.ceil(Math.max(...ys) - minY + PAD), nodes, edges, groups };
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
/** Does segment a-b run along (and overlap) a segment of one of the other polylines? */
function shared(a: Pt, b: Pt, others: Pt[][]): boolean {
  const horiz = near(a.y, b.y, 0.5);
  const lo = horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y), hi = horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  for (const o of others) for (let i = 0; i < o.length - 1; i++) {
    const c = o[i], d = o[i + 1];
    if (horiz ? !(near(c.y, d.y, 0.5) && near(c.y, a.y, 7)) : !(near(c.x, d.x, 0.5) && near(c.x, a.x, 7))) continue;
    const lo2 = horiz ? Math.min(c.x, d.x) : Math.min(c.y, d.y), hi2 = horiz ? Math.max(c.x, d.x) : Math.max(c.y, d.y);
    if (Math.min(hi, hi2) - Math.max(lo, lo2) > 12) return true;
  }
  return false;
}

/**
 * Pick where an edge label goes: the longest run of the edge that it does not share with another edge, preferring
 * runs along the flow direction (horizontal for RIGHT, vertical for DOWN). Labels sit above horizontal runs and to
 * the right of vertical ones; the two edges of a forward/return pair (side=1) put theirs on opposite sides of the
 * pair. A return edge scores its reversed points, so it picks the same run as its forward partner.
 */
function labelPos(input: Pt[], others: Pt[][], direction: 'RIGHT' | 'DOWN', side: number, isReturn: boolean): EdgeLabelPos {
  const pts = isReturn ? [...input].reverse() : input;
  let best = -1, bestScore = -Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const along = (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) === (direction === 'RIGHT');
    const score = len + (along ? 60 : 0) - (shared(a, b, others) ? 1000 : 0) + i * 0.01;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0) return { x: pts[0].x, y: pts[0].y - 8, anchor: 'middle' };
  let a = pts[best], b = pts[best + 1];
  if (isReturn) [a, b] = [b, a]; // back to this edge's own direction of travel
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
    // the lane normal of a left-to-right run points down, of a right-to-left run up
    const below = side ? b.x > a.x : false;
    return below ? { x: mid.x, y: mid.y + 17, anchor: 'middle' } : { x: mid.x, y: mid.y - 8, anchor: 'middle' };
  }
  const left = side ? b.y > a.y : false;
  return left ? { x: mid.x - 8, y: mid.y + 5, anchor: 'end' } : { x: mid.x + 8, y: mid.y + 5, anchor: 'start' };
}

