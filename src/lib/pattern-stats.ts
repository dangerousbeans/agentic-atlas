import type { DiagramSpec } from './diagram/types';
import { isModelNode } from './diagram/kinds';
import { compileScenario } from './diagram/compile';

export interface PatternStats {
  nodes: number;
  llmCalls: number;
  toolCalls: number;
  steps: number;
  scenarios: number;
  loop: boolean;
  parallel: boolean;
  branch: boolean;
  humanInLoop: boolean;
}

/** Computed over the first scenario's compiled timeline (addendum §3). */
export function patternStats(d: DiagramSpec): PatternStats {
  const kind = new Map(d.nodes.map(n => [n.id, n.kind]));
  const model = new Map(d.nodes.map(n => [n.id, isModelNode(n)]));
  const edgeTo = new Map(d.edges.map(e => [e.id, e.to]));
  const first = d.scenarios[0];
  const tl = first ? compileScenario(first) : undefined;
  const steps = tl?.steps ?? [];
  const events = tl?.events ?? [];

  let llmCalls = 0;
  let toolCalls = 0;
  let branch = false;
  for (const { event } of events) {
    if (event.type === 'activate' && event.status === 'thinking' && model.get(event.node)) llmCalls++;
    else if (event.type === 'branch') {
      branch = true;
      if (model.get(event.node)) llmCalls++;
    } else if (event.type === 'send') {
      const to = edgeTo.get(event.edge);
      if (to !== undefined && kind.get(to) === 'tool') toolCalls++;
    }
  }

  const parallel = steps.some(st => {
    const sends = st.events.filter(e => e.event.type === 'send');
    return sends.some((a, i) => sends.slice(i + 1).some(b => a.start < b.end && b.start < a.end));
  });

  return {
    nodes: d.nodes.length,
    llmCalls,
    toolCalls,
    steps: steps.length,
    scenarios: d.scenarios.length,
    loop: d.edges.some(e => e.style === 'loop') || (first?.steps.some(s => (s.repeat ?? 1) > 1) ?? false),
    parallel,
    branch,
    humanInLoop: d.nodes.some(n => n.kind === 'human'),
  };
}

export function statsLine(s: PatternStats): string {
  const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
  const parts = [n(s.nodes, 'node', 'nodes'), n(s.llmCalls, 'LLM call', 'LLM calls')];
  if (s.loop) parts.push('loop');
  if (s.parallel) parts.push('parallel');
  if (s.branch) parts.push('branch');
  if (s.humanInLoop) parts.push('human');
  parts.push(n(s.scenarios, 'scenario', 'scenarios'));
  return parts.join(' · ');
}
