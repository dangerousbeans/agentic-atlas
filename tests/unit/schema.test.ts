import { describe, it, expect } from 'vitest';
import { diagramIssues, validateCatalog, patternSchema, familySchema, type Pattern, type Family } from '../../src/lib/schema';
import type { DiagramSpec } from '../../src/lib/diagram/types';
import type { Prompt } from '../../src/lib/schema';

const prompts: Prompt[] = [{ id: 'gen', title: 'Generator prompt', lang: 'markdown', source: 'Write {{task}}.\n' }];
const base = (): DiagramSpec => ({
  nodes: [
    { id: 'in', description: 'A fixture node.', kind: 'io', label: 'Task' },
    { id: 'gen', description: 'A fixture node.', kind: 'llm', label: 'Generator' },
    { id: 'eval', description: 'A fixture node.', kind: 'evaluator', label: 'Evaluator' },
    { id: 'out', description: 'A fixture node.', kind: 'io', label: 'Output' },
  ],
  edges: [
    { id: 'task', description: 'A fixture edge.', example: 'A sample payload', from: 'in', to: 'gen' },
    { id: 'draft', description: 'A fixture edge.', example: 'A sample payload', from: 'gen', to: 'eval' },
    { id: 'revise', description: 'A fixture edge.', example: 'A sample payload', from: 'eval', to: 'gen', style: 'loop' },
    { id: 'accept', description: 'A fixture edge.', example: 'A sample payload', from: 'eval', to: 'out' },
  ],
  scenarios: [{ id: 's', label: 'S', steps: [
    { id: 'a', caption: 'Go.', events: [{ type: 'send', edge: 'task', token: { kind: 'prompt' } }] },
    { id: 'b', caption: 'Judge.', events: [{ type: 'branch', node: 'eval', taken: 'accept', notTaken: ['revise'] }] },
  ] }],
});

describe('diagramIssues', () => {
  it('accepts a valid diagram', () => expect(diagramIssues(base())).toEqual([]));
  it('flags duplicate node ids', () => { const d = base(); d.nodes.push({ id: 'gen', description: 'A fixture node.', kind: 'llm', label: 'X' }); expect(diagramIssues(d).join()).toMatch(/duplicate node id "gen"/); });
  it('flags duplicate edge ids', () => { const d = base(); d.edges.push({ id: 'task', description: 'A fixture edge.', example: 'A sample payload', from: 'in', to: 'out' }); expect(diagramIssues(d).join()).toMatch(/duplicate edge id "task"/); });
  it('flags edge to missing node', () => { const d = base(); d.edges[0].to = 'nope'; expect(diagramIssues(d).join()).toMatch(/edge "task" .*unknown node "nope"/); });
  it('flags send on unknown edge', () => { const d = base(); d.scenarios[0].steps[0].events = [{ type: 'send', edge: 'zzz', token: { kind: 'prompt' } }]; expect(diagramIssues(d).join()).toMatch(/unknown edge "zzz"/); });
  it('flags branch.taken that is not outgoing from node', () => { const d = base(); d.scenarios[0].steps[1].events = [{ type: 'branch', node: 'eval', taken: 'task' }]; expect(diagramIssues(d).join()).toMatch(/not an outgoing edge of "eval"/); });
  it('flags notTaken that is not outgoing', () => { const d = base(); d.scenarios[0].steps[1].events = [{ type: 'branch', node: 'eval', taken: 'accept', notTaken: ['draft'] }]; expect(diagramIssues(d).join()).toMatch(/"draft" is not an outgoing edge of "eval"/); });
  it('flags label too long for size', () => { const d = base(); d.nodes[0].label = 'A very long label'; expect(diagramIssues(d).join()).toMatch(/label .* exceeds 10 chars/); });
  it('flags appear on a non-hidden node', () => { const d = base(); d.scenarios[0].steps[0].events.push({ type: 'appear', node: 'gen' }); expect(diagramIssues(d).join()).toMatch(/appear on "gen" which is not hidden/); });
  it('flags hidden node that never appears', () => { const d = base(); d.nodes.push({ id: 'w', description: 'A fixture node.', kind: 'llm', label: 'W', hidden: true }); expect(diagramIssues(d).join()).toMatch(/hidden node "w" never appears in scenario "s"/); });
  it('flags read/write on a non-memory node', () => { const d = base(); d.scenarios[0].steps[0].events.push({ type: 'write', node: 'gen' }); expect(diagramIssues(d).join()).toMatch(/write on "gen" which is not a memory node/); });
  it('flags duplicate step ids within a scenario', () => { const d = base(); d.scenarios[0].steps[1].id = 'a'; expect(diagramIssues(d).join()).toMatch(/duplicate step id "a"/); });
  it('flags a pinned node inside a group', () => { const d = base(); d.nodes[1].pos = { x: 0, y: 0 }; d.groups = [{ id: 'g', label: 'G', children: ['gen'] }]; expect(diagramIssues(d).join()).toMatch(/node "gen" is pinned but inside group "g"; pins are only supported for ungrouped nodes/); });
  it('flags group child that does not exist', () => { const d = base(); d.groups = [{ id: 'g', label: 'G', children: ['zz'] }]; expect(diagramIssues(d).join()).toMatch(/group "g" .*unknown node "zz"/); });
});

const fam = (slug: string, order: string[]): Family => familySchema.parse({ slug, name: slug, rank: 1, accent: '#F5B14C', description: 'A family of things.', order });
const pat = (slug: string, family: string, related: Partial<Pattern['related']> = {}): Pattern => ({
  slug, name: slug, family, aliases: [], summary: 'A summary of the pattern.', badges: { autonomy: 'low', cost: 'low', latency: 'low' },
  sources: [{ title: 't', url: 'https://example.com' }], related: { composesWith: [], confusedWith: [], ...related },
  prompts, diagram: base(),
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

describe('build, origin and variants', () => {
  const build = { goal: 'Draft and judge until it passes.', steps: ['Draft with the {{prompt:gen}}.', 'Judge the draft.', 'Loop back with the critique.'], stop: 'Stop after three rounds.', requirements: ['Cap the rounds.', 'Log every call.', 'Test with a stub LLM.'] };
  const origin = { by: 'Aman Madaan et al.', year: 2023, url: 'https://arxiv.org/abs/2303.17651', kind: 'introduced' };
  const variant = (id = 'self') => ({ id, name: 'Same model', summary: 'One model plays both roles.', diagram: base() });
  const parse = (extra: Record<string, unknown>) => patternSchema.safeParse({ ...pat('a', 'f'), ...extra });
  const messages = (r: ReturnType<typeof parse>) => (r.success ? '' : r.error.issues.map(i => i.message).join('\n'));

  it('accepts a pattern with build, origin and variants', () => expect(messages(parse({ build, origin, defaultVariantName: 'Separate judge', variants: [variant(), variant('tools')] }))).toBe(''));
  it('keeps build and origin optional during the migration', () => expect(parse({}).success).toBe(true));
  it('requires 3 to 8 build steps', () => {
    expect(parse({ build: { ...build, steps: build.steps.slice(0, 2) } }).success).toBe(false);
    expect(parse({ build: { ...build, steps: Array(9).fill('Do the next thing.') } }).success).toBe(false);
  });
  it('requires 3 to 6 requirements', () => expect(parse({ build: { ...build, requirements: Array(7).fill('Another requirement.') } }).success).toBe(false));
  it('flags a build step citing an unknown prompt', () => expect(messages(parse({ build: { ...build, steps: [...build.steps, 'Use the {{prompt:nope}}.'] } }))).toMatch(/build step references unknown prompt "nope"/));
  it('flags a variant build citing a prompt it does not have', () => {
    const v = { ...variant(), prompts: [{ id: 'critic', title: 'Critic', lang: 'markdown', source: 'x' }] };
    expect(messages(parse({ build, variants: [v] }))).toMatch(/variant "self": build step references unknown prompt "gen"/);
  });
  it('checks prompt references in every build field, not just steps', () => {
    expect(messages(parse({ build: { ...build, goal: 'Run the {{prompt:nope}} until it passes.' } }))).toMatch(/build goal references unknown prompt "nope"/);
    expect(messages(parse({ build: { ...build, stop: 'Stop when the {{prompt:gone}} says so.' } }))).toMatch(/build stop references unknown prompt "gone"/);
    expect(messages(parse({ build: { ...build, requirements: [...build.requirements, 'Log the {{prompt:x}} output.'] } }))).toMatch(/build requirement references unknown prompt "x"/);
  });
  it('allows only http(s) origin and source urls', () => {
    expect(parse({ origin: { ...origin, url: 'javascript:alert(1)' } }).success).toBe(false);
    expect(parse({ sources: [{ title: 't', url: 'data:text/html,hi' }] }).success).toBe(false);
    expect(parse({ origin: { ...origin, url: 'http://example.com/paper' } }).success).toBe(true);
  });
  it('rejects python prompts (the brief stays language-neutral)', () => expect(parse({ prompts: [{ id: 'gen', title: 'G', lang: 'python', source: 'x' }] }).success).toBe(false));
  it('rejects an origin kind outside introduced | popularized', () => expect(parse({ origin: { ...origin, kind: 'coined' } }).success).toBe(false));
  it('requires a note when the origin is uncertain', () => {
    expect(messages(parse({ origin: { ...origin, uncertain: true } }))).toMatch(/note is required/);
    expect(parse({ origin: { ...origin, uncertain: true, note: 'The term predates any single paper.' } }).success).toBe(true);
  });
  it('flags duplicate variant ids', () => expect(messages(parse({ variants: [variant(), variant()] }))).toMatch(/duplicate variant id "self"/));
  it('reserves the default variant id', () => expect(messages(parse({ variants: [variant('standard')] }))).toMatch(/"standard" is reserved/));
  it('runs diagramIssues on variant diagrams', () => {
    const v = variant(); v.diagram.edges[0].to = 'nope';
    expect(messages(parse({ variants: [v] }))).toMatch(/\[a\] variant "self": edge "task" references unknown node "nope"/);
  });
  it('allows at most 3 variants', () => expect(parse({ variants: ['a', 'b', 'c', 'd'].map(variant) }).success).toBe(false));
});
