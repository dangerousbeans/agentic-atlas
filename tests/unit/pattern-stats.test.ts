import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { isModelNode } from '../../src/lib/diagram/kinds';
import { patternStats, statsLine } from '../../src/lib/pattern-stats';
import type { DiagramSpec, DiagramEvent, NodeKind, Step } from '../../src/lib/diagram/types';

const node = (id: string, kind: NodeKind) => ({ id, description: 'A fixture node.', kind, label: id });
const tok = { kind: 'prompt' as const };
const send = (edge: string, at?: [number, number]): DiagramEvent => ({ type: 'send', edge, token: tok, ...(at ? { at } : {}) });
const step = (id: string, events: DiagramEvent[], extra: Partial<Step> = {}): Step => ({ id, caption: id, events, ...extra });
const spec = (over: Partial<DiagramSpec> = {}): DiagramSpec => ({
  nodes: [node('a', 'io'), node('b', 'llm'), node('t', 'tool')],
  edges: [{ id: 'ab', description: 'A fixture edge.', example: 'A sample payload', from: 'a', to: 'b' }, { id: 'bt', description: 'A fixture edge.', example: 'A sample payload', from: 'b', to: 't' }, { id: 'ba', description: 'A fixture edge.', example: 'A sample payload', from: 't', to: 'b' }],
  scenarios: [{ id: 's', label: 'S', steps: [step('x', [send('ab')])] }],
  ...over,
});
const one = (steps: Step[], over: Partial<DiagramSpec> = {}) => spec({ scenarios: [{ id: 's', label: 'S', steps }], ...over });

describe('patternStats (synthetic)', () => {
  it('counts nodes, scenarios and expanded steps', () => {
    const s = patternStats(spec({ scenarios: [
      { id: 's1', label: '1', steps: [step('a', [], { repeat: 3 }), step('b', [])] },
      { id: 's2', label: '2', steps: [step('c', [])] },
    ] }));
    expect(s.nodes).toBe(3);
    expect(s.scenarios).toBe(2);
    expect(s.steps).toBe(4); // first scenario only: 3 repeats + 1
  });
  it('llmCalls counts thinking activates plus branches on model nodes only', () => {
    const d = one([step('x', [
      { type: 'activate', node: 'b', status: 'thinking' },
      { type: 'activate', node: 'b', status: 'calling' },
      { type: 'activate', node: 'g', status: 'thinking' },
      { type: 'activate', node: 'a', status: 'thinking' },
      { type: 'activate', node: 'e', status: 'thinking' },
      { type: 'activate', node: 'c', status: 'thinking' },
      { type: 'branch', node: 'g', taken: 'x' },
      { type: 'branch', node: 'e', taken: 'x' },
      { type: 'branch', node: 'c', taken: 'x' },
    ])], { nodes: [node('a', 'io'), node('b', 'llm'), node('g', 'agent'), node('e', 'evaluator'), { ...node('c', 'evaluator'), model: false }, node('t', 'tool')] });
    // b thinking, g thinking, g branch, e thinking, e branch = 5; code evaluator c (model: false) excluded
    expect(patternStats(d).llmCalls).toBe(5);
  });
  it('toolCalls counts sends whose target node is a tool', () => {
    const d = one([step('x', [send('ab'), send('bt'), send('bt'), send('ba'), send('nope')])]);
    expect(patternStats(d).toolCalls).toBe(2);
  });
  it('loop is true for a loop edge or a repeating step', () => {
    expect(patternStats(spec()).loop).toBe(false);
    expect(patternStats(spec({ edges: [{ id: 'l', description: 'A fixture edge.', example: 'A sample payload', from: 'b', to: 'a', style: 'loop' }] })).loop).toBe(true);
    expect(patternStats(one([step('x', [], { repeat: 2 })])).loop).toBe(true);
  });
  it('parallel needs two sends overlapping within a step', () => {
    expect(patternStats(one([step('x', [send('ab'), send('bt')])])).parallel).toBe(true);
    expect(patternStats(one([step('x', [send('ab', [0, 0.5]), send('bt', [0.5, 1])])])).parallel).toBe(false);
    expect(patternStats(one([step('x', [send('ab', [0, 0.6]), send('bt', [0.5, 1])])])).parallel).toBe(true);
    expect(patternStats(one([step('x', [send('ab')]), step('y', [send('bt')])])).parallel).toBe(false);
  });
  it('branch and humanInLoop', () => {
    expect(patternStats(spec()).branch).toBe(false);
    expect(patternStats(one([step('x', [{ type: 'branch', node: 'b', taken: 'y' }])])).branch).toBe(true);
    expect(patternStats(spec()).humanInLoop).toBe(false);
    expect(patternStats(spec({ nodes: [node('h', 'human')] })).humanInLoop).toBe(true);
  });
});

describe('isModelNode', () => {
  it('defaults by kind', () => {
    for (const k of ['llm', 'agent', 'router', 'evaluator', 'guard'] as const) expect(isModelNode({ kind: k })).toBe(true);
    for (const k of ['io', 'tool', 'memory', 'human', 'aggregator'] as const) expect(isModelNode({ kind: k })).toBe(false);
  });
  it('explicit model wins', () => {
    expect(isModelNode({ kind: 'evaluator', model: false })).toBe(false);
    expect(isModelNode({ kind: 'aggregator', model: true })).toBe(true);
  });
});

describe('statsLine', () => {
  const base = { nodes: 4, llmCalls: 3, toolCalls: 0, steps: 4, scenarios: 2, loop: false, parallel: false, branch: false, humanInLoop: false };
  it('includes only true flags in order', () => {
    expect(statsLine({ ...base, loop: true })).toBe('4 nodes · 3 LLM calls · loop · 2 scenarios');
    expect(statsLine({ ...base, humanInLoop: true, branch: true, parallel: true, loop: true })).toBe('4 nodes · 3 LLM calls · loop · parallel · branch · human · 2 scenarios');
    expect(statsLine(base)).toBe('4 nodes · 3 LLM calls · 2 scenarios');
  });
  it('uses singular for counts of one', () => {
    expect(statsLine({ ...base, nodes: 1, llmCalls: 1, scenarios: 1 })).toBe('1 node · 1 LLM call · 1 scenario');
    expect(statsLine({ ...base, nodes: 0, llmCalls: 0 })).toBe('0 nodes · 0 LLM calls · 2 scenarios');
  });
});

const load = (slug: string) => parse(readFileSync(`src/content/patterns/${slug}/pattern.yaml`, 'utf8')).diagram as DiagramSpec;

describe('patternStats (hand counts from YAML)', () => {
  it('evaluator-optimizer', () => {
    // nodes: input, generator, evaluator, output = 4
    // scenario 1 steps: start(1) + round repeat 2 (2) + pass (1) = 4; scenarios = 2
    // llmCalls: generator thinking round x2 + pass = 3, plus evaluator (model by default) branches round x2 + pass = 3, total 6
    // toolCalls: no tool nodes = 0; loop: edge `revise` style loop; branch: yes; parallel: sends in a step never overlap; human: none
    expect(patternStats(load('evaluator-optimizer'))).toEqual({ nodes: 4, llmCalls: 6, toolCalls: 0, steps: 4, scenarios: 2, loop: true, parallel: false, branch: true, humanInLoop: false });
  });
  it('sectioning', () => {
    // nodes: user, splitter, llm1-3, aggregator, out = 7
    // steps: arrive, fan-out, work, merge = 4; scenarios = 1
    // llmCalls: llm1, llm2, llm3 thinking in `work` = 3 (aggregator thinking excluded; splitter has model: false)
    // toolCalls: 0; loop: no loop edge, no repeat; parallel: fan-out sends s1-s3 all [0,1] overlap; branch: none; human: none
    expect(patternStats(load('sectioning'))).toEqual({ nodes: 7, llmCalls: 3, toolCalls: 0, steps: 4, scenarios: 1, loop: false, parallel: true, branch: false, humanInLoop: false });
  });
  it('react', () => {
    // nodes: user, agent, search, calculator, out = 5
    // scenario 1 steps: ask, turn-1, turn-2, turn-3, finish = 5; scenarios = 2
    // llmCalls: agent(llm) thinking in turn-1, turn-2, turn-3, finish = 4
    // toolCalls: sends to a tool node: act-search (turn-1, turn-2), act-calc (turn-3) = 3; obs-* go back to agent
    // loop: no loop-style edge (obs edges are dashed), no repeat; parallel: one send per step, no overlap; branch: none; human: none
    expect(patternStats(load('react'))).toEqual({ nodes: 5, llmCalls: 4, toolCalls: 3, steps: 5, scenarios: 2, loop: false, parallel: false, branch: false, humanInLoop: false });
  });
});
