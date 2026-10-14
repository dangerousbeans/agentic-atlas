import type { DiagramEdge, DiagramNode, DiagramSpec, NodeKind } from './types';

/** Generic one-line meaning of each node kind; used when a node has no `description` of its own. */
export const KIND_DESCRIPTION: Record<NodeKind, string> = {
  io: 'Input or output: where a request enters or a result leaves.',
  llm: 'A single LLM call with a specific prompt.',
  agent: 'A full agent: an LLM in a loop with its own tools.',
  tool: 'A tool or API the model can call.',
  router: 'A classifier or code branch that picks a path.',
  evaluator: 'A judge: tests, a validator or an LLM grader.',
  aggregator: 'Combines several results: a vote, a merge or a judge.',
  memory: 'A store: vector DB, plan, scratchpad or long-term memory.',
  human: 'A person in the loop who approves, edits or rejects.',
  guard: 'A guardrail check that can block the flow.',
};

export const KIND_LABEL: Record<NodeKind, string> = {
  io: 'Input / output', llm: 'LLM call', agent: 'Agent', tool: 'Tool', router: 'Router',
  evaluator: 'Evaluator', aggregator: 'Aggregator', memory: 'Memory', human: 'Human', guard: 'Guard',
};

export const nodeDescription = (n: Pick<DiagramNode, 'kind' | 'description'>): string => n.description ?? KIND_DESCRIPTION[n.kind];

type Labels = ReadonlyMap<string, { label: string }>;

/** "From → To" title for an edge. */
export function edgeTitle(e: Pick<DiagramEdge, 'from' | 'to'>, nodes: Labels): string {
  return `${nodes.get(e.from)?.label ?? e.from} → ${nodes.get(e.to)?.label ?? e.to}`;
}

/** Edge description, falling back to "<from> → <to>" plus the label when present. */
export function edgeDescription(e: Pick<DiagramEdge, 'from' | 'to' | 'label' | 'description'>, nodes: Labels): string {
  return e.description ?? (e.label ? `${edgeTitle(e, nodes)}: ${e.label}` : edgeTitle(e, nodes));
}

export const nodeMap = (spec: Pick<DiagramSpec, 'nodes'>) => new Map(spec.nodes.map(n => [n.id, n]));
