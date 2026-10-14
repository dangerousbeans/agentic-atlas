import { describe, it, expect } from 'vitest';
import { KIND_DESCRIPTION, nodeDescription, edgeDescription, edgeTitle } from '../../src/lib/diagram/kinds';
import { NODE_KINDS } from '../../src/lib/diagram/types';
import { diagramSchema } from '../../src/lib/schema';

const labels = new Map([['a', { label: 'Generator' }], ['b', { label: 'Evaluator' }]]);

describe('tooltip fallbacks', () => {
  it('has a generic description for every node kind', () => {
    for (const k of NODE_KINDS) expect(KIND_DESCRIPTION[k].length).toBeGreaterThan(10);
    expect(KIND_DESCRIPTION.router).toBe('A classifier or code branch that picks a path.');
  });
  it('prefers a node description, else falls back to its kind', () => {
    expect(nodeDescription({ kind: 'llm', description: 'Writes the draft.' })).toBe('Writes the draft.');
    expect(nodeDescription({ kind: 'llm' })).toBe(KIND_DESCRIPTION.llm);
  });
  it('titles edges "From → To"', () => {
    expect(edgeTitle({ from: 'a', to: 'b' }, labels)).toBe('Generator → Evaluator');
  });
  it('falls back to "<from> → <to>" plus the label', () => {
    expect(edgeDescription({ from: 'a', to: 'b' }, labels)).toBe('Generator → Evaluator');
    expect(edgeDescription({ from: 'a', to: 'b', label: 'revise' }, labels)).toBe('Generator → Evaluator: revise');
    expect(edgeDescription({ from: 'a', to: 'b', label: 'x', description: 'Sends a critique.' }, labels)).toBe('Sends a critique.');
  });
});

describe('schema: description and example', () => {
  const base = {
    nodes: [{ id: 'a', kind: 'llm', label: 'A' }, { id: 'b', kind: 'llm', label: 'B' }],
    edges: [{ id: 'e', from: 'a', to: 'b' }],
    scenarios: [{ id: 's', label: 'S', steps: [{ id: 'x', caption: 'Hello', events: [{ type: 'send', edge: 'e', token: { kind: 'prompt' } }] }] }],
  };
  const full = { ...base, nodes: base.nodes.map(n => ({ ...n, description: 'Describes the node.' })), edges: [{ ...base.edges[0], description: 'Describes the edge.', example: 'A sample payload' }] };
  it('is valid with descriptions and an example', () => expect(diagramSchema.safeParse(full).success).toBe(true));
  it('requires a description on nodes and edges, and an example on edges', () => {
    expect(diagramSchema.safeParse(base).success).toBe(false);
    expect(diagramSchema.safeParse({ ...full, nodes: [base.nodes[0], full.nodes[1]] }).success).toBe(false);
    expect(diagramSchema.safeParse({ ...full, edges: [{ ...full.edges[0], description: undefined }] }).success).toBe(false);
    expect(diagramSchema.safeParse({ ...full, edges: [{ ...full.edges[0], example: undefined }] }).success).toBe(false);
  });
  it('accepts and bounds description and example', () => {
    const ok = { ...full, nodes: [{ ...base.nodes[0], description: 'x'.repeat(180) }, full.nodes[1]], edges: [{ ...base.edges[0], description: 'x'.repeat(10), example: 'y'.repeat(280) }] };
    expect(diagramSchema.safeParse(ok).success).toBe(true);
    expect(diagramSchema.safeParse({ ...ok, nodes: [{ ...base.nodes[0], description: 'short' }, full.nodes[1]] }).success).toBe(false);
    expect(diagramSchema.safeParse({ ...ok, edges: [{ ...base.edges[0], example: 'y'.repeat(281) }] }).success).toBe(false);
  });
});
