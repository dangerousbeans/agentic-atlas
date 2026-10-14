import type { DiagramSpec, TokenKind, ActivateStatus, CodeRef } from './types';
import type { Timeline } from './compile';

export type NodeState = 'idle' | 'active' | 'thinking' | 'calling' | 'waiting' | 'done' | 'error' | 'dim' | 'hidden';
export type EdgeState = 'idle' | 'active' | 'traversed' | 'dim';
export interface TokenState { edge: string; kind: TokenKind; label?: string; progress: number }
export interface FrameState { t: number; stepIndex: number; nodes: Record<string, NodeState>; edges: Record<string, EdgeState>; tokens: TokenState[]; codeRef?: CodeRef }

const SETTLED: Record<ActivateStatus, NodeState> = { thinking: 'done', calling: 'done', waiting: 'done', done: 'done', error: 'error' };
const EPS = 1;

export function frameAt(d: DiagramSpec, tl: Timeline, tIn: number): FrameState {
  const t = Math.min(Math.max(tIn, 0), tl.duration);
  const nodes: Record<string, NodeState> = {};
  for (const n of d.nodes) nodes[n.id] = n.hidden ? 'hidden' : 'idle';
  const edges: Record<string, EdgeState> = {};
  for (const e of d.edges) edges[e.id] = 'idle';
  const target = new Map(d.edges.map(e => [e.id, e.to]));
  const kindOf = new Map(d.nodes.map(n => [n.id, n.kind]));
  const tokens: TokenState[] = [];

  for (const te of tl.events) {
    if (te.start > t) break;
    const live = t < te.end;
    const ev = te.event;
    switch (ev.type) {
      case 'send':
        if (live) {
          edges[ev.edge] = 'active';
          const tok: TokenState = { edge: ev.edge, kind: ev.token.kind, progress: (t - te.start) / (te.end - te.start) };
          if (ev.token.label) tok.label = ev.token.label;
          tokens.push(tok);
        } else {
          edges[ev.edge] = 'traversed';
          const to = target.get(ev.edge)!;
          if (kindOf.get(to) === 'io' && nodes[to] === 'idle') nodes[to] = 'done';
        }
        break;
      case 'activate':
        nodes[ev.node] = live ? ev.status : SETTLED[ev.status];
        break;
      case 'branch': {
        nodes[ev.node] = live ? 'thinking' : 'done';
        if (edges[ev.taken] === 'dim') edges[ev.taken] = 'idle';
        const to = target.get(ev.taken)!;
        if (nodes[to] === 'dim') nodes[to] = 'idle';
        for (const id of ev.notTaken ?? []) {
          edges[id] = 'dim';
          const nt = target.get(id)!;
          if (nodes[nt] === 'idle') nodes[nt] = 'dim';
        }
        break;
      }
      case 'appear':
        if (nodes[ev.node] === 'hidden') nodes[ev.node] = 'idle';
        break;
      case 'read': case 'write':
        nodes[ev.node] = live ? 'active' : 'done';
        break;
    }
  }

  let stepIndex = 0;
  for (const s of tl.steps) { if (s.start <= t) stepIndex = s.index; else break; }
  const f: FrameState = { t, stepIndex, nodes, edges, tokens };
  const ref = tl.steps[stepIndex]?.codeRef;
  if (ref) f.codeRef = ref;
  return f;
}

export function nextStepEnd(tl: Timeline, t: number): number {
  const s = tl.steps.find(st => st.end > t + EPS);
  return s ? s.end : tl.duration;
}

export function prevStepStart(tl: Timeline, t: number): number {
  let r = 0;
  for (const s of tl.steps) if (s.start < t - EPS) r = s.start;
  return r;
}
