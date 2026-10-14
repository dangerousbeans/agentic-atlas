import ELK from 'elkjs/lib/elk.bundled.js';
import type { DiagramSpec, NodeSize } from './types';
import { DEFAULT_SIZE } from './types';
import { roundedPath, cubicPath, boxArc, borderPoint, polylineMid, offsetPath, type Pt, type Box } from './geometry';

export const NODE_DIMS: Record<NodeSize, { w: number; h: number }> = { sm: { w: 96, h: 72 }, md: { w: 136, h: 72 }, lg: { w: 176, h: 72 } };
/** Vertical centre of the node glyph inside its box (see NodeShape.astro). */
export const SHAPE_CY = 26;
export interface EdgeLabelPos { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
export interface EdgeGeom { d: string; mid: Pt; label: EdgeLabelPos }
export interface DiagramLayout { width: number; height: number; nodes: Record<string, Box>; edges: Record<string, EdgeGeom>; groups: Record<string, Box & { label: string }> }

type Raw = { kind: 'poly'; pts: Pt[]; side: number } | { kind: 'arc'; s: Pt; c1: Pt; c2: Pt; e: Pt };
const elk = new ELK();

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

/**
 * Non-loop edges that close a cycle by pointing back to a node declared earlier (e.g. a tool result flowing back
 * to the agent, or a reply going back to the user). They are left out of ELK and routed around the outside of
 * the diagram, so they never drag the layering backwards or merge into a forward edge's port.
 */
export function backEdges(d: DiagramSpec, returns: Map<string, string>): Set<string> {
  const order = new Map(d.nodes.map((n, i) => [n.id, i]));
  const fwd = d.edges.filter(e => e.style !== 'loop' && !returns.has(e.id));
  const reaches = (from: string, to: string) => {
    const seen = new Set([from]), stack = [from];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === to) return true;
      for (const e of fwd) if (e.from === n && !seen.has(e.to) && order.get(e.from)! < order.get(e.to)!) { seen.add(e.to); stack.push(e.to); }
    }
    return false;
  };
  return new Set(fwd.filter(e => order.get(e.from)! > order.get(e.to)! && reaches(e.to, e.from)).map(e => e.id));
}

/**
 * Layout variants: `wide` is the full diagram; `narrow` (phones) uses slimmer boxes with labels wrapped onto two
 * lines; `compact` (thumbnails) draws no text at all, so boxes shrink to the glyph.
 */
export type LayoutVariant = 'wide' | 'narrow' | 'compact';
export const NARROW_DIMS: Record<NodeSize, { w: number; h: number }> = { sm: { w: 80, h: 72 }, md: { w: 104, h: 72 }, lg: { w: 128, h: 72 } };
const COMPACT_DIMS = { w: 60, h: 54 };
const LINE = 12;
/** Wide RIGHT layouts wider than this wrap onto more rows (about 1.35x a desktop stage). */
const WRAP_WIDTH = 1450;
/** Node label lines: narrow layouts break labels longer than 11 characters at the space nearest the middle. */
export function labelLines(label: string, variant: LayoutVariant): string[] {
  if (variant !== 'narrow' || label.length <= 11 || !label.includes(' ')) return [label];
  let best = -1;
  for (let i = 0; i < label.length; i++) if (label[i] === ' ' && (best < 0 || Math.abs(i - label.length / 2) < Math.abs(best - label.length / 2))) best = i;
  return [label.slice(0, best), label.slice(best + 1)];
}

export async function layoutDiagram(d: DiagramSpec, direction: 'RIGHT' | 'DOWN', variant: LayoutVariant = 'wide'): Promise<DiagramLayout> {
  const dims = (id: string) => {
    const n = d.nodes.find(x => x.id === id)!;
    if (variant === 'compact') return COMPACT_DIMS;
    const size = n.size ?? DEFAULT_SIZE[n.kind];
    if (variant === 'wide') return NODE_DIMS[size];
    return { w: NARROW_DIMS[size].w, h: NARROW_DIMS[size].h + LINE * (labelLines(n.label, variant).length - 1) };
  };
  const compact = variant === 'compact';
  const PAD = compact ? 10 : variant === 'narrow' ? 16 : 28;
  const grouped = new Set((d.groups ?? []).flatMap(g => g.children));
  const returns = returnEdges(d);
  const forwards = new Set(returns.values());
  // One fixed port per side, aligned with the glyph, so edges meet the shape head-on instead of anywhere on the box.
  // The box is 6px taller than the node so the bottom port clears a sublabel.
  const inPort = (id: string) => `${id}__in`, outPort = (id: string) => `${id}__out`;
  const order = new Map(d.nodes.map((n, i) => [n.id, i]));
  const back = backEdges(d, returns);
  const port = (id: string, x: number, y: number, side: string): ElkPort => ({ id, x, y, width: 0, height: 0, layoutOptions: { 'elk.port.side': side } });
  const leaf = (id: string): ElkNode => {
    const { w, h } = dims(id);
    const ports: ElkPort[] = direction === 'RIGHT'
      ? [port(inPort(id), 0, SHAPE_CY, 'WEST'), port(outPort(id), w, SHAPE_CY, 'EAST')]
      : [port(inPort(id), w / 2, 0, 'NORTH'), port(outPort(id), w / 2, h + 6, 'SOUTH')];
    return { id, width: w, height: h + 6, ports, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' } };
  };
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': direction, 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // siblings of a fan-out share a column, rather than being pulled towards their successors
      'elk.layered.layering.strategy': 'LONGEST_PATH_SOURCE',
      'elk.layered.spacing.nodeNodeBetweenLayers': compact ? '36' : direction === 'RIGHT' ? (d.edges.some(e => e.label) ? '100' : '72') : d.edges.some(e => e.label) ? '112' : '56',
      'elk.spacing.nodeNode': compact ? '14' : direction === 'RIGHT' ? '32' : variant === 'narrow' ? '12' : '24',
      'elk.spacing.edgeNode': '20', 'elk.spacing.edgeEdge': '16',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '16', 'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    },
    children: [
      ...(d.groups ?? []).map(g => ({ id: g.id, layoutOptions: { 'elk.padding': compact ? '[top=10,left=10,bottom=10,right=10]' : '[top=34,left=18,bottom=18,right=18]' }, children: g.children.map(leaf) })),
      ...d.nodes.filter(n => !grouped.has(n.id)).map(n => leaf(n.id)),
    ],
    edges: d.edges.filter(e => e.style !== 'loop' && !returns.has(e.id) && !back.has(e.id))
      .map(e => ({ id: e.id, sources: [outPort(e.from)], targets: [inPort(e.to)] })),
  };
  // keep groups in model order relative to the nodes around them
  graph.children!.sort((a, b) => (order.get(a.id) ?? Math.min(...(a.children ?? []).map(c => order.get(c.id) ?? 0))) - (order.get(b.id) ?? Math.min(...(b.children ?? []).map(c => order.get(c.id) ?? 0))));
  let out = (await elk.layout(structuredClone(graph) as never)) as unknown as ElkNode;
  // Thumbnails of long chains wrap onto a second row so they keep a card-friendly shape.
  if (compact && !d.nodes.some(n => n.pos) && !d.edges.some(e => e.style === 'loop') && (out.width ?? 0) > 4.5 * (out.height ?? 1)) {
    graph.layoutOptions = { ...graph.layoutOptions, 'elk.layered.wrapping.strategy': 'MULTI_EDGE', 'elk.aspectRatio': '2.2', 'elk.layered.wrapping.additionalEdgeSpacing': '8' };
    out = (await elk.layout(graph as never)) as unknown as ElkNode;
  }
  // Very long left-to-right chains would shrink their text below legibility on a desktop stage; wrap them too.
  if (variant === 'wide' && direction === 'RIGHT' && !d.nodes.some(n => n.pos) && (out.width ?? 0) > WRAP_WIDTH) {
    // Wrap into rows; try a few target aspect ratios and keep the first that leaves every loop arc's ends on one row.
    for (const [strategy, ratio] of [['SINGLE_EDGE', '3.2'], ['MULTI_EDGE', '3.2'], ['MULTI_EDGE', '2.6'], ['MULTI_EDGE', '4'], ['SINGLE_EDGE', '2.2'], ['MULTI_EDGE', '2.2']]) {
      const wrapped = (await elk.layout({ ...structuredClone(graph), layoutOptions: { ...graph.layoutOptions, 'elk.layered.wrapping.strategy': strategy, 'elk.aspectRatio': ratio, 'elk.layered.wrapping.additionalEdgeSpacing': '16' } } as never)) as unknown as ElkNode;
      const ys = new Map<string, number>();
      const walkY = (n: ElkNode, oy: number) => { for (const c of n.children ?? []) { ys.set(c.id, oy + (c.y ?? 0)); walkY(c, oy + (c.y ?? 0)); } };
      walkY(wrapped, 0);
      if ((wrapped.width ?? 0) < (out.width ?? 0) * 0.8 && d.edges.every(e => e.style !== 'loop' || Math.abs(ys.get(e.from)! - ys.get(e.to)!) < 60)) { out = wrapped; break; }
    }
  }

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

  // pos overrides (relative to the first pinned node's ELK position, so relative offsets are exact). A pin places
  // the node's glyph centre, so pinned nodes of different sizes still line up. Pins are authored for the RIGHT
  // layout; the DOWN layout uses them transposed.
  const pinned = d.nodes.filter(n => n.pos);
  const pinOf = (n: (typeof pinned)[number]) => direction === 'RIGHT' ? n.pos! : { x: n.pos!.y, y: n.pos!.x };
  const moved = new Set<string>();
  if (pinned.length) {
    const anchor = nodes[pinned[0].id], p0 = pinOf(pinned[0]);
    const ox = anchor.x + anchor.w / 2 - p0.x, oy = anchor.y + SHAPE_CY - p0.y;
    for (const n of pinned) { const p = pinOf(n), b = nodes[n.id]; nodes[n.id] = { ...b, x: p.x + ox - b.w / 2, y: p.y + oy - SHAPE_CY }; moved.add(n.id); }
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
      // straight line between the glyphs, clipped to the boxes
      const ga = { x: a.x + a.w / 2, y: a.y + SHAPE_CY }, gb = { x: b.x + b.w / 2, y: b.y + SHAPE_CY };
      return [clipToBox(a, ga, gb), clipToBox(b, gb, ga)];
    }
    const off = abs[oe.container ?? 'root'] ?? { x: 0, y: 0 };
    const s = oe.sections[0];
    return [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(q => ({ x: q.x + off.x, y: q.y + off.y }));
  };
  const crossesNode = (p: Pt, q: Pt, from: string, to: string) => Object.entries(nodes).some(([id, b]) => {
    if (id === from || id === to) return false;
    for (let i = 1; i < 30; i++) {
      const x = p.x + (q.x - p.x) * i / 30, y = p.y + (q.y - p.y) * i / 30;
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
    return false;
  });
  // Loop arcs go over the row (or beside the column); if another node is in the way, try the other side, then
  // a wider bulge, and keep whichever crosses the fewest other nodes.
  const routed = d.edges.filter(e => outEdges.get(e.id)?.sections?.length && !moved.has(e.from) && !moved.has(e.to)).map(e => route(e.id));
  const clearArc = (from: string, to: string) => {
    const others = Object.entries(nodes).filter(([id]) => id !== from && id !== to).map(([, b]) => b);
    const cost = (a: ReturnType<typeof boxArc>) => {
      let n = 0;
      for (let i = 1; i < 40; i++) {
        const t = i / 40, u = 1 - t;
        const x = u * u * u * a.s.x + 3 * u * u * t * a.c1.x + 3 * u * t * t * a.c2.x + t * t * t * a.e.x;
        const y = u * u * u * a.s.y + 3 * u * u * t * a.c1.y + 3 * u * t * t * a.c2.y + t * t * t * a.e.y;
        if (others.some(b => x > b.x - 4 && x < b.x + b.w + 4 && y > b.y - 4 && y < b.y + b.h + 4)) n++;
        // running along (or across) a routed edge, or where its label would sit, also counts against a side
        if (routed.some(p => p.some((q, j) => j > 0 && segHitsBox(p[j - 1], q, { x: x - 6, y: y - 22, w: 12, h: 28 })))) n += 0.5;
      }
      return n;
    };
    const a = nodes[from], b = nodes[to];
    // nodes side by side get arcs over/under; nodes stacked get arcs out to one side
    const stacked = Math.abs(a.y - b.y) > Math.abs(a.x - b.x);
    const sides = stacked ? ['right', 'left'] as const : ['top', 'bottom'] as const;
    let best = boxArc(a, b, sides[0]), bestCost = cost(best);
    for (const extra of [0, 60, 140]) for (const side of sides) {
      if (!bestCost) break;
      const arc = boxArc(a, b, side, extra), c = cost(arc);
      if (c < bestCost) { best = arc; bestCost = c; }
    }
    return best;
  };
  // Back edges: out of the source's far side into the gap after its layer, along a channel outside the diagram,
  // and into the target from the outside (or, if another node sits outside it, from the gap before its layer).
  // Worked out in a flow frame where flow runs along +u and the outside is +v; for DOWN that is the transpose.
  const T = direction === 'RIGHT' ? (p: Pt) => ({ u: p.x, v: p.y }) : (p: Pt) => ({ u: p.y, v: p.x });
  const B = direction === 'RIGHT' ? (q: { u: number; v: number }): Pt => ({ x: q.u, y: q.v }) : (q: { u: number; v: number }): Pt => ({ x: q.v, y: q.u });
  const fb = (b: Box) => { const p = T(b); return direction === 'RIGHT' ? { u: p.u, v: p.v, du: b.w, dv: b.h } : { u: p.u, v: p.v, du: b.h, dv: b.w }; };
  const exitV = (b: Box) => direction === 'RIGHT' ? b.y + SHAPE_CY + 12 : b.x + b.w / 2 + 14;
  const sideV = (b: Box) => direction === 'RIGHT' ? b.y + SHAPE_CY + 12 : b.x + b.w / 2 + 14;
  const entryU = (b: Box) => direction === 'RIGHT' ? b.x + b.w / 2 : b.y + SHAPE_CY;
  const backRoutes: Record<string, Pt[]> = {};
  {
    const list = d.edges.filter(e => back.has(e.id) && !moved.has(e.from) && !moved.has(e.to));
    const all = [...Object.values(nodes), ...Object.values(groups)].map(fb);
    let outer = Math.max(...all.map(b => b.v + b.dv));
    for (const oe of outEdges.values()) for (const s of oe.sections ?? []) for (const q of [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]) {
      const off = abs[oe.container ?? 'root'] ?? { x: 0, y: 0 };
      outer = Math.max(outer, T({ x: q.x + off.x, y: q.y + off.y }).v);
    }
    // outermost first: sources further along the flow, then sources nearer the inside
    const sorted = [...list].sort((a, b) => {
      const sa = fb(nodes[a.from]), sb = fb(nodes[b.from]);
      return (sb.u + sb.du) - (sa.u + sa.du) || sa.v - sb.v;
    });
    sorted.forEach((e, i) => {
      const k = (sorted.length - 1 - i) * 10;
      const s = fb(nodes[e.from]), t = fb(nodes[e.to]);
      const layerEnd = Math.max(...Object.values(nodes).map(fb).filter(b => b.u < s.u + s.du && s.u < b.u + b.du).map(b => b.u + b.du));
      const gapU = layerEnd + 16 + k, chan = outer + 24 + k;
      const pts: { u: number; v: number }[] = [{ u: s.u + s.du, v: exitV(nodes[e.from]) }, { u: gapU, v: exitV(nodes[e.from]) }, { u: gapU, v: chan }];
      const blocked = Object.entries(nodes).some(([id, b]) => { const o = fb(b); return id !== e.to && o.v > t.v && o.u < t.u + t.du && t.u < o.u + o.du; });
      if (!blocked) pts.push({ u: entryU(nodes[e.to]), v: chan }, { u: entryU(nodes[e.to]), v: t.v + t.dv });
      else {
        const layerStart = Math.min(...Object.values(nodes).map(fb).filter(b => b.u < t.u + t.du && t.u < b.u + b.du).map(b => b.u));
        const a = layerStart - 16 - k;
        pts.push({ u: a, v: chan }, { u: a, v: sideV(nodes[e.to]) }, { u: t.u, v: sideV(nodes[e.to]) });
      }
      backRoutes[e.id] = pts.map(B);
    });
  }
  for (const e of d.edges) {
    if (backRoutes[e.id]) { raw[e.id] = { kind: 'poly', pts: backRoutes[e.id], side: 0 }; continue; }
    if (e.style === 'loop') { raw[e.id] = { kind: 'arc', ...clearArc(e.from, e.to) }; continue; }
    const fwd = returns.get(e.id);
    let pts = fwd ? route(fwd).reverse() : route(e.id);
    if ((moved.has(e.from) || moved.has(e.to)) && !fwd && !forwards.has(e.id) && crossesNode(pts[0], pts[pts.length - 1], e.from, e.to)) {
      raw[e.id] = { kind: 'arc', ...clearArc(e.from, e.to) }; continue;
    }
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
  // converging edges with the same label show it once (see DiagramSvg)
  const shownLabel = (id: string) => { const i = d.edges.findIndex(x => x.id === id), e = d.edges[i]; return e.label && !d.edges.slice(0, i).some(o => o.to === e.to && o.label === e.label) ? e.label : undefined; };
  const geo: Record<string, { pts?: Pt[]; arc?: Pt[]; mid?: Pt; label: EdgeLabelPos; text?: string }> = {};
  // Labels are placed greedily in edge order; each takes its best candidate spot that clears the nodes and the
  // labels already placed.
  const taken: Box[] = Object.values(nodes).map(b => ({ x: b.x + 6, y: b.y, w: b.w - 12, h: b.h }));
  const labelBox = (p: EdgeLabelPos, text: string): Box => {
    const w = text.length * 7 + 6;
    const x = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'start' ? p.x : p.x - w;
    return { x, y: p.y - 13, w, h: 17 };
  };
  const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [k, r] of Object.entries(raw)) {
    if (r.kind === 'poly') {
      const pts = polys[k];
      const partner = returns.get(k) ?? [...returns].find(([, f]) => f === k)?.[0];
      const others = Object.entries(polys).filter(([o]) => o !== k && o !== partner).map(([, v]) => v);
      const cands = labelCandidates(pts, others, direction, r.side, returns.has(k));
      const text = shownLabel(k);
      let label = cands[0];
      if (text) {
        const free = (c: EdgeLabelPos) => !taken.some(t => hits(t, labelBox(c, text)));
        const clear = (c: EdgeLabelPos) => { const b = labelBox(c, text); return !others.some(o => o.some((q, i) => i > 0 && segHitsBox(o[i - 1], q, b))); };
        label = cands.find(c => free(c) && clear(c)) ?? cands.find(free) ?? cands[0];
        taken.push(labelBox(label, text));
      }
      geo[k] = { pts, label, text };
    } else {
      const [s, c1, c2, e] = [r.s, r.c1, r.c2, r.e].map(sh);
      const mid = { x: 0.125 * s.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * e.x, y: 0.125 * s.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * e.y };
      const label: EdgeLabelPos = direction === 'RIGHT'
        ? (mid.y > s.y ? { x: mid.x, y: mid.y + 17, anchor: 'middle' } : { x: mid.x, y: mid.y - 8, anchor: 'middle' })
        : (mid.x < s.x ? { x: mid.x - 8, y: mid.y + 5, anchor: 'end' } : { x: mid.x + 8, y: mid.y + 5, anchor: 'start' });
      const text = d.edges.find(x => x.id === k)!.label;
      if (text) taken.push(labelBox(label, text));
      geo[k] = { arc: [s, c1, c2, e], mid, label, text };
    }
  }
  // grow the canvas so that no edge label hangs off it
  let width = Math.max(...xs) - minX + PAD, height = Math.max(...ys) - minY + PAD, dx = 0, dy = 0;
  for (const g of Object.values(geo)) if (g.text) {
    const b = labelBox(g.label, g.text);
    dx = Math.max(dx, 8 - b.x); dy = Math.max(dy, 8 - b.y);
    width = Math.max(width, b.x + b.w + 8); height = Math.max(height, b.y + b.h + 8);
  }
  const mv = (q: Pt): Pt => ({ x: q.x + dx, y: q.y + dy });
  for (const k in nodes) nodes[k] = { ...nodes[k], x: nodes[k].x + dx, y: nodes[k].y + dy };
  for (const k in groups) groups[k] = { ...groups[k], x: groups[k].x + dx, y: groups[k].y + dy };
  const edges: Record<string, EdgeGeom> = {};
  for (const [k, g] of Object.entries(geo)) {
    const label = { ...g.label, x: g.label.x + dx, y: g.label.y + dy };
    if (g.pts) { const pts = g.pts.map(mv); edges[k] = { d: roundedPath(pts, 10), mid: polylineMid(pts), label }; }
    else { const [s, c1, c2, e] = g.arc!.map(mv); edges[k] = { d: cubicPath(s, c1, c2, e), mid: mv(g.mid!), label }; }
  }
  return { width: Math.ceil(width + dx), height: Math.ceil(height + dy), nodes, edges, groups };
}

/** Does the axis-aligned (or any) segment p-q pass through box b? Sampled, which is plenty at label scale. */
function segHitsBox(p: Pt, q: Pt, b: Box): boolean {
  const n = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 4));
  for (let i = 0; i <= n; i++) {
    const x = p.x + (q.x - p.x) * i / n, y = p.y + (q.y - p.y) * i / n;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

/** Where the ray from `from` (inside the box) towards `toward` leaves the box. */
function clipToBox(box: Box, from: Pt, toward: Pt): Pt {
  const dx = toward.x - from.x, dy = toward.y - from.y;
  if (!dx && !dy) return borderPoint(box, toward);
  const tx = dx > 0 ? (box.x + box.w - from.x) / dx : dx < 0 ? (box.x - from.x) / dx : Infinity;
  const ty = dy > 0 ? (box.y + box.h - from.y) / dy : dy < 0 ? (box.y - from.y) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: from.x + dx * t, y: from.y + dy * t };
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
 * Candidate label spots for an edge, best first. Runs are scored by length, by running along the flow direction
 * (horizontal for RIGHT, vertical for DOWN) and by not being shared with another edge. Labels sit above horizontal
 * runs and to the right of vertical ones; the two edges of a forward/return pair (side=1) keep to their own side of
 * the pair. A return edge scores its reversed points, so it picks the same run as its forward partner.
 */
function labelCandidates(input: Pt[], others: Pt[][], direction: 'RIGHT' | 'DOWN', side: number, isReturn: boolean): EdgeLabelPos[] {
  const pts = isReturn ? [...input].reverse() : input;
  const out: { p: EdgeLabelPos; score: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const horiz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const base = len + (horiz === (direction === 'RIGHT') && len >= 40 ? 150 : 0) - (shared(a, b, others) ? 1000 : 0) + i * 0.01;
    if (isReturn) [a, b] = [b, a]; // back to this edge's own direction of travel
    for (const [t, pen] of [[0.5, 0], [0.3, 25], [0.7, 25]] as const) {
      if (t !== 0.5 && len < 80) continue;
      const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const above: EdgeLabelPos = { x: m.x, y: m.y - 8, anchor: 'middle' }, below: EdgeLabelPos = { x: m.x, y: m.y + 17, anchor: 'middle' };
      const right: EdgeLabelPos = { x: m.x + 8, y: m.y + 5, anchor: 'start' }, left: EdgeLabelPos = { x: m.x - 8, y: m.y + 5, anchor: 'end' };
      if (horiz) {
        // the lane normal of a left-to-right run points down, of a right-to-left run up
        if (side) out.push({ p: b.x > a.x ? below : above, score: base - pen });
        else { out.push({ p: above, score: base - pen }); out.push({ p: below, score: base - pen - 30 }); }
      } else {
        if (side) out.push({ p: b.y > a.y ? left : right, score: base - pen });
        else { out.push({ p: right, score: base - pen }); out.push({ p: left, score: base - pen - 30 }); }
      }
    }
  }
  if (!out.length) return [{ x: pts[0].x, y: pts[0].y - 8, anchor: 'middle' }];
  return out.sort((x, y) => y.score - x.score).map(c => c.p);
}

