import { describe, it, expect } from 'vitest';
import { diagramIssues, validateCatalog, patternSchema, familySchema, type Pattern, type Family } from '../../src/lib/schema';
import type { DiagramSpec, CodeBlock } from '../../src/lib/diagram/types';

const code: CodeBlock[] = [{ id: 'loop', title: 'loop.py', lang: 'python', source: 'a\nb\nc\n' }];
const base = (): DiagramSpec => ({
  nodes: [
    { id: 'in', kind: 'io', label: 'Task' },
    { id: 'gen', kind: 'llm', label: 'Generator' },
    { id: 'eval', kind: 'evaluator', label: 'Evaluator' },
    { id: 'out', kind: 'io', label: 'Output' },
  ],
  edges: [
    { id: 'task', from: 'in', to: 'gen' },
    { id: 'draft', from: 'gen', to: 'eval' },
    { id: 'revise', from: 'eval', to: 'gen', style: 'loop' },
    { id: 'accept', from: 'eval', to: 'out' },
  ],
  scenarios: [{ id: 's', label: 'S', steps: [
    { id: 'a', caption: 'Go.', events: [{ type: 'send', edge: 'task', token: { kind: 'prompt' } }], codeRef: { block: 'loop', lines: '1-3' } },
    { id: 'b', caption: 'Judge.', events: [{ type: 'branch', node: 'eval', taken: 'accept', notTaken: ['revise'] }] },
  ] }],
});

describe('diagramIssues', () => {
  it('accepts a valid diagram', () => expect(diagramIssues(base(), code)).toEqual([]));
  it('flags duplicate node ids', () => { const d = base(); d.nodes.push({ id: 'gen', kind: 'llm', label: 'X' }); expect(diagramIssues(d, code).join()).toMatch(/duplicate node id "gen"/); });
  it('flags duplicate edge ids', () => { const d = base(); d.edges.push({ id: 'task', from: 'in', to: 'out' }); expect(diagramIssues(d, code).join()).toMatch(/duplicate edge id "task"/); });
  it('flags edge to missing node', () => { const d = base(); d.edges[0].to = 'nope'; expect(diagramIssues(d, code).join()).toMatch(/edge "task" .*unknown node "nope"/); });
  it('flags send on unknown edge', () => { const d = base(); d.scenarios[0].steps[0].events = [{ type: 'send', edge: 'zzz', token: { kind: 'prompt' } }]; expect(diagramIssues(d, code).join()).toMatch(/unknown edge "zzz"/); });
  it('flags branch.taken that is not outgoing from node', () => { const d = base(); d.scenarios[0].steps[1].events = [{ type: 'branch', node: 'eval', taken: 'task' }]; expect(diagramIssues(d, code).join()).toMatch(/not an outgoing edge of "eval"/); });
  it('flags notTaken that is not outgoing', () => { const d = base(); d.scenarios[0].steps[1].events = [{ type: 'branch', node: 'eval', taken: 'accept', notTaken: ['draft'] }]; expect(diagramIssues(d, code).join()).toMatch(/"draft" is not an outgoing edge of "eval"/); });
  it('flags codeRef past block end', () => { const d = base(); d.scenarios[0].steps[0].codeRef = { block: 'loop', lines: '2-9' }; expect(diagramIssues(d, code).join()).toMatch(/codeRef lines "2-9" out of range/); });
  it('flags unknown codeRef block', () => { const d = base(); d.scenarios[0].steps[0].codeRef = { block: 'nope', lines: '1' }; expect(diagramIssues(d, code).join()).toMatch(/unknown code block "nope"/); });
  it('flags label too long for size', () => { const d = base(); d.nodes[0].label = 'A very long label'; expect(diagramIssues(d, code).join()).toMatch(/label .* exceeds 10 chars/); });
  it('flags appear on a non-hidden node', () => { const d = base(); d.scenarios[0].steps[0].events.push({ type: 'appear', node: 'gen' }); expect(diagramIssues(d, code).join()).toMatch(/appear on "gen" which is not hidden/); });
  it('flags hidden node that never appears', () => { const d = base(); d.nodes.push({ id: 'w', kind: 'llm', label: 'W', hidden: true }); expect(diagramIssues(d, code).join()).toMatch(/hidden node "w" never appears in scenario "s"/); });
  it('flags read/write on a non-memory node', () => { const d = base(); d.scenarios[0].steps[0].events.push({ type: 'write', node: 'gen' }); expect(diagramIssues(d, code).join()).toMatch(/write on "gen" which is not a memory node/); });
  it('flags duplicate step ids within a scenario', () => { const d = base(); d.scenarios[0].steps[1].id = 'a'; expect(diagramIssues(d, code).join()).toMatch(/duplicate step id "a"/); });
  it('flags a pinned node inside a group', () => { const d = base(); d.nodes[1].pos = { x: 0, y: 0 }; d.groups = [{ id: 'g', label: 'G', children: ['gen'] }]; expect(diagramIssues(d, code).join()).toMatch(/node "gen" is pinned but inside group "g"; pins are only supported for ungrouped nodes/); });
  it('flags group child that does not exist', () => { const d = base(); d.groups = [{ id: 'g', label: 'G', children: ['zz'] }]; expect(diagramIssues(d, code).join()).toMatch(/group "g" .*unknown node "zz"/); });
});

const fam = (slug: string, order: string[]): Family => familySchema.parse({ slug, name: slug, rank: 1, accent: '#F5B14C', description: 'A family of things.', order });
const pat = (slug: string, family: string, related: Partial<Pattern['related']> = {}): Pattern => ({
  slug, name: slug, family, aliases: [], summary: 'A summary of the pattern.', badges: { autonomy: 'low', cost: 'low', latency: 'low' },
  sources: [{ title: 't', url: 'https://example.com' }], related: { composesWith: [], confusedWith: [], ...related },
  code, prompts: code, diagram: base(),
});

describe('validateCatalog', () => {
  it('accepts a consistent catalog', () => expect(validateCatalog([fam('f', ['a', 'b'])], [pat('a', 'f'), pat('b', 'f')])).toEqual([]));
  it('flags pattern missing from its family order', () => expect(validateCatalog([fam('f', ['a'])], [pat('a', 'f'), pat('b', 'f')]).join()).toMatch(/pattern "b" is not listed in family "f" order/));
  it('flags order slug with no pattern', () => expect(validateCatalog([fam('f', ['a', 'ghost'])], [pat('a', 'f')]).join()).toMatch(/family "f" order lists unknown pattern "ghost"/));
  it('flags unknown family', () => expect(validateCatalog([fam('f', ['a'])], [pat('a', 'f'), pat('b', 'nope')]).join()).toMatch(/pattern "b" has unknown family "nope"/));
  it('flags pattern listed in two families', () => expect(validateCatalog([fam('f', ['a']), fam('g', ['a'])], [pat('a', 'f')]).join()).toMatch(/pattern "a" is listed in family "g" but belongs to "f"/));
  it('flags unknown related slug', () => expect(validateCatalog([fam('f', ['a'])], [pat('a', 'f', { composesWith: ['zz'] })]).join()).toMatch(/pattern "a" relates to unknown pattern "zz"/));
  it('flags duplicate family slugs once each', () => { const r = validateCatalog([fam('f', ['a']), fam('f', ['a'])], [pat('a', 'f')]); expect(r.filter(i => i === 'duplicate family slug "f"')).toHaveLength(1); });
  it('flags duplicate pattern slugs once each', () => { const r = validateCatalog([fam('f', ['a'])], [pat('a', 'f'), pat('a', 'f'), pat('a', 'f')]); expect(r.filter(i => i === 'duplicate pattern slug "a"')).toHaveLength(1); });
  it('flags self relation', () => expect(validateCatalog([fam('f', ['a'])], [pat('a', 'f', { composesWith: ['a'] })]).join()).toMatch(/pattern "a" relates to itself/));
});

describe('patternSchema', () => {
  it('rejects an invalid diagram through superRefine', () => {
    const p = pat('a', 'f'); p.diagram.edges[0].to = 'nope';
    const r = patternSchema.safeParse(p);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map(i => i.message).join('\n')).toMatch(/\[a\].*unknown node "nope"/);
  });
  it('rejects bad accent', () => expect(familySchema.safeParse({ slug: 'f', name: 'F', rank: 1, accent: 'orange', description: 'x', order: [] }).success).toBe(false));
});
