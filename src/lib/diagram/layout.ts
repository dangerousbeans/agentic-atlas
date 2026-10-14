import ELK from 'elkjs/lib/elk.bundled.js';
import type { DiagramSpec, NodeSize } from './types';
import { DEFAULT_SIZE } from './types';
import { roundedPath, cubicPath, loopArc, borderPoint, polylineMid, offsetPolyline, type Pt, type Box } from './geometry';

export const NODE_DIMS: Record<NodeSize, { w: number; h: number }> = { sm: { w: 96, h: 72 }, md: { w: 136, h: 72 }, lg: { w: 176, h: 72 } };
export interface EdgeGeom { d: string; mid: Pt }
export interface DiagramLayout { width: number; height: number; nodes: Record<string, Box>; edges: Record<string, EdgeGeom>; groups: Record<string, Box & { label: string }> }

type Raw = { kind: 'poly'; pts: Pt[] } | { kind: 'arc'; s: Pt; c1: Pt; c2: Pt; e: Pt };
const elk = new ELK();
const PAD = 28;

interface ElkNode { id: string; x?: number; y?: number; width?: number; height?: number; children?: ElkNode[]; layoutOptions?: Record<string, string>; edges?: ElkEdge[] }
interface ElkEdge { id: string; sources: string[]; targets: string[]; container?: string; sections?: { startPoint: Pt; endPoint: Pt; bendPoints?: Pt[] }[] }

export async function layoutDiagram(d: DiagramSpec, direction: 'RIGHT' | 'DOWN'): Promise<DiagramLayout> {
  const dims = (id: string) => { const n = d.nodes.find(x => x.id === id)!; return NODE_DIMS[n.size ?? DEFAULT_SIZE[n.kind]]; };
  const grouped = new Set((d.groups ?? []).flatMap(g => g.children));
  const leaf = (id: string): ElkNode => ({ id, width: dims(id).w, height: dims(id).h });
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': direction, 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64', 'elk.spacing.nodeNode': '36', 'elk.spacing.edgeNode': '20',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: [
      ...(d.groups ?? []).map(g => ({ id: g.id, layoutOptions: { 'elk.padding': '[top=34,left=18,bottom=18,right=18]' }, children: g.children.map(leaf) })),
      ...d.nodes.filter(n => !grouped.has(n.id)).map(n => leaf(n.id)),
    ],
    edges: d.edges.filter(e => e.style !== 'loop').map(e => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };
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
  const outEdges = new Map((out.edges ?? []).map(e => [e.id, e]));
  const pairs = new Set(d.edges.filter(e => e.style !== 'loop' && d.edges.some(o => o.style !== 'loop' && o.from === e.to && o.to === e.from)).map(e => e.id));
  for (const e of d.edges) {
    const a = nodes[e.from], b = nodes[e.to];
    if (e.style === 'loop') { raw[e.id] = { kind: 'arc', ...loopArc(a, b, direction) }; continue; }
    const oe = outEdges.get(e.id);
    let pts: Pt[];
    if (!oe?.sections?.length || moved.has(e.from) || moved.has(e.to)) {
      const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      pts = [borderPoint(a, cb), borderPoint(b, ca)];
    } else {
      const off = abs[oe.container ?? 'root'] ?? { x: 0, y: 0 };
      const s = oe.sections[0];
      pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(q => ({ x: q.x + off.x, y: q.y + off.y }));
    }
    if (pairs.has(e.id)) pts = offsetPolyline(pts, 6);
    raw[e.id] = { kind: 'poly', pts };
  }

  // normalize to a padded canvas
  const xs: number[] = [], ys: number[] = [];
  for (const b of [...Object.values(nodes), ...Object.values(groups)]) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); }
  for (const r of Object.values(raw)) for (const q of r.kind === 'poly' ? r.pts : [r.s, r.c1, r.c2, r.e]) { xs.push(q.x); ys.push(q.y); }
  const minX = Math.min(...xs) - PAD, minY = Math.min(...ys) - PAD;
  const sh = (q: Pt): Pt => ({ x: q.x - minX, y: q.y - minY });
  const shBox = <T extends Box>(b: T): T => ({ ...b, x: b.x - minX, y: b.y - minY });
  for (const k in nodes) nodes[k] = shBox(nodes[k]);
  for (const k in groups) groups[k] = shBox(groups[k]);
  const edges: Record<string, EdgeGeom> = {};
  for (const [k, r] of Object.entries(raw)) {
    if (r.kind === 'poly') { const pts = r.pts.map(sh); edges[k] = { d: roundedPath(pts, 10), mid: polylineMid(pts) }; }
    else {
      const [s, c1, c2, e] = [r.s, r.c1, r.c2, r.e].map(sh);
      edges[k] = { d: cubicPath(s, c1, c2, e), mid: { x: 0.125 * s.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * e.x, y: 0.125 * s.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * e.y } };
    }
  }
  return { width: Math.ceil(Math.max(...xs) - minX + PAD), height: Math.ceil(Math.max(...ys) - minY + PAD), nodes, edges, groups };
}
