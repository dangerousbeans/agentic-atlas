import { describe, it, expect } from 'vitest';
import { composeBuildPrompt } from '../../src/lib/build-prompt';
import { resolveVariants, DEFAULT_VARIANT_ID } from '../../src/lib/variants';
import type { Pattern, Variant } from '../../src/lib/schema';
import type { DiagramSpec } from '../../src/lib/diagram/types';

const diagram = (caption = 'The task goes in.'): DiagramSpec => ({
  nodes: [
    { id: 'in', kind: 'io', label: 'Task', description: 'A fixture node.' },
    { id: 'gen', kind: 'llm', label: 'Gen', description: 'A fixture node.' },
  ],
  edges: [{ id: 'task', from: 'in', to: 'gen', description: 'A fixture edge.', example: 'A sample payload' }],
  scenarios: [{ id: 's', label: 'S', steps: [
    { id: 'a', caption, events: [{ type: 'send', edge: 'task', token: { kind: 'prompt' } }] },
    { id: 'b', caption: 'The model answers.', events: [{ type: 'activate', node: 'gen', status: 'thinking' }] },
  ] }],
});

const pattern = (): Pattern => ({
  slug: 'demo', name: 'Demo Loop', family: 'workflows', aliases: [], summary: 'A pattern used only by these tests.',
  badges: { autonomy: 'low', cost: 'low', latency: 'low' }, sources: [{ title: 't', url: 'https://example.com' }],
  related: { composesWith: [], confusedWith: [] },
  prompts: [
    { id: 'generator', title: 'Generator prompt', lang: 'markdown', source: 'Write {{artifact}}.\n\n<task>{{task}}</task>\n' },
    { id: 'judge', title: 'Judge prompt', lang: 'text', source: 'Reply with ```json fences``` only.' },
  ],
  diagram: diagram(),
  build: {
    goal: 'Draft, judge and revise a document until it passes.',
    steps: ['Send the task with the {{prompt:generator}}.', 'Score the draft with the {{prompt:judge}}.', 'Loop back with the critique.'],
    stop: 'Stop when the judge passes the draft or after 3 rounds; return the last draft and the open critique.',
    requirements: ['Cap rounds at 3.', 'Log every call.', 'Test with a stub LLM.'],
  },
  origin: { by: 'A. Person', year: 2023, url: 'https://example.com', kind: 'introduced' },
});

const variant = (over: Partial<Variant> = {}): Variant => ({ id: 'self', name: 'Same model', summary: 'One model plays both roles.', diagram: diagram(), ...over });

describe('composeBuildPrompt', () => {
  it('opens with the header and lists the sections in order', () => {
    const md = composeBuildPrompt(pattern());
    expect(md.split('\n')[0]).toBe('Implement the Demo Loop pattern in this codebase, using the LLM client and language we already use.');
    const order = ['## Goal', '## How it works', '## Prompts', '## Stop rule', '## Requirements'].map(h => md.indexOf(`\n${h}\n`));
    expect(order.every(i => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(md).toContain('\n- Cap rounds at 3.\n- Log every call.\n- Test with a stub LLM.\n');
  });

  it('names the variant in the header', () => {
    const md = composeBuildPrompt(pattern(), variant());
    expect(md.split('\n')[0]).toBe('Implement the Demo Loop pattern (Same model variant) in this codebase, using the LLM client and language we already use.');
  });

  it('treats the resolved default variant as the pattern itself', () => {
    const p = pattern();
    const [std] = resolveVariants(p);
    expect(std.id).toBe(DEFAULT_VARIANT_ID);
    expect(composeBuildPrompt(p, std)).toBe(composeBuildPrompt(p));
  });

  it('expands {{prompt:id}} references to prompt titles in numbered steps', () => {
    const md = composeBuildPrompt(pattern());
    expect(md).toContain('1. Send the task with the Generator prompt.\n2. Score the draft with the Judge prompt.\n3. Loop back with the critique.');
    expect(md).not.toMatch(/\{\{prompt:/);
  });

  it('embeds each prompt verbatim in a fence longer than any backtick run inside it', () => {
    const md = composeBuildPrompt(pattern());
    expect(md).toContain('### Generator prompt\n\n```markdown\nWrite {{artifact}}.\n\n<task>{{task}}</task>\n```');
    expect(md).toContain('### Judge prompt\n\n````text\nReply with ```json fences``` only.\n````');
  });

  it("falls back to the parent's build and prompts when the variant has none", () => {
    const p = pattern();
    const md = composeBuildPrompt(p, variant());
    expect(md).toContain('## Goal\n\nDraft, judge and revise a document until it passes.');
    expect(md).toContain('### Generator prompt');
  });

  it("uses the variant's own build and prompts when it has them", () => {
    const v = variant({
      prompts: [{ id: 'critic', title: 'Self-critique prompt', lang: 'markdown', source: 'Critique your draft.' }],
      build: { goal: 'One model drafts and critiques itself.', steps: ['Draft.', 'Critique with the {{prompt:critic}}.', 'Revise.'].map(s => s.padEnd(10, '.')), stop: 'Stop after two rounds.', requirements: ['Cap at two.', 'Log it all.', 'Stub the LLM.'] },
    });
    const md = composeBuildPrompt(pattern(), v);
    expect(md).toContain('One model drafts and critiques itself.');
    expect(md).toContain('Critique with the Self-critique prompt.');
    expect(md).toContain('### Self-critique prompt');
    expect(md).not.toContain('### Generator prompt');
  });

  it('is provider-neutral', () => {
    expect(composeBuildPrompt(pattern())).not.toMatch(/OpenAI|Anthropic|Claude|GPT|python/i);
  });
});

describe('resolveVariants', () => {
  it('puts the default first, named by defaultVariantName, and fills fallbacks', () => {
    const p = { ...pattern(), defaultVariantName: 'Separate judge', variants: [variant()] };
    const [std, self] = resolveVariants(p);
    expect([std.name, std.isDefault, self.name, self.isDefault]).toEqual(['Separate judge', true, 'Same model', false]);
    expect(self.build).toBe(p.build);
    expect(self.prompts).toBe(p.prompts);
    expect(self.origin).toBe(p.origin);
  });
  it('names the default "Standard" when unset', () => expect(resolveVariants(pattern())[0].name).toBe('Standard'));
});
