import { describe, it, expect } from 'vitest';
import { compileScenario } from '../../src/lib/diagram/compile';
import { frameAt, nextStepEnd, prevStepStart } from '../../src/lib/diagram/state';
import type { DiagramSpec } from '../../src/lib/diagram/types';

const spec: DiagramSpec = {
  nodes: [
    { id: 'in', kind: 'io', label: 'In' }, { id: 'gen', kind: 'llm', label: 'Gen' },
    { id: 'eval', kind: 'evaluator', label: 'Eval' }, { id: 'out', kind: 'io', label: 'Out' },
    { id: 'w', kind: 'llm', label: 'W', hidden: true },
  ],
  edges: [
    { id: 'task', from: 'in', to: 'gen' }, { id: 'draft', from: 'gen', to: 'eval' },
    { id: 'revise', from: 'eval', to: 'gen', style: 'loop' }, { id: 'accept', from: 'eval', to: 'out' },
    { id: 'spawn', from: 'gen', to: 'w' },
  ],
  scenarios: [{ id: 's', label: 'S', steps: [
    { id: 'start', caption: 'Start', duration: 1000, events: [{ type: 'send', edge: 'task', token: { kind: 'prompt', label: 'q' } }] },
    { id: 'round', caption: 'Round', duration: 1000, repeat: 2, events: [
      { type: 'activate', node: 'gen', status: 'thinking', at: [0, 0.5] },
      { type: 'branch', node: 'eval', taken: 'revise', notTaken: ['accept'], at: [0.5, 1] },
    ] },
    { id: 'pass', caption: 'Pass', duration: 1000, events: [
      { type: 'branch', node: 'eval', taken: 'accept', notTaken: ['revise'], at: [0, 0.5] },
      { type: 'appear', node: 'w', at: [0.5, 0.6] },
      { type: 'send', edge: 'accept', token: { kind: 'result' }, at: [0.5, 1] },
    ] },
  ] }],
};
const tl = compileScenario(spec.scenarios[0]); // steps: start 0-1000, round#1 1000-2000, round#2 2000-3000, pass 3000-4000

describe('frameAt', () => {
  it('initial state: idle, hidden nodes hidden, first token at 0', () => {
    const f = frameAt(spec, tl, 0);
    expect(f.nodes.gen).toBe('idle');
    expect(f.nodes.w).toBe('hidden');
    expect(f.tokens).toEqual([{ edge: 'task', kind: 'prompt', label: 'q', progress: 0 }]);
    expect(f.edges.task).toBe('active');
    expect(f.stepIndex).toBe(0);
  });
  it('token progress is linear within its window', () => {
    expect(frameAt(spec, tl, 500).tokens[0].progress).toBeCloseTo(0.5);
  });
  it('sent edges become traversed after their window', () => {
    expect(frameAt(spec, tl, 1000).edges.task).toBe('traversed');
  });
  it('activate is live then settles to done', () => {
    expect(frameAt(spec, tl, 1200).nodes.gen).toBe('thinking');
    expect(frameAt(spec, tl, 1600).nodes.gen).toBe('done');
  });
  it('branch dims not-taken edge and its idle target', () => {
    const f = frameAt(spec, tl, 1700);
    expect(f.edges.accept).toBe('dim');
    expect(f.nodes.out).toBe('dim');
    expect(f.nodes.eval).toBe('thinking');
  });
  it('a later branch un-dims a previously dimmed edge and node (Review Focus 2)', () => {
    const f = frameAt(spec, tl, 3200);
    expect(f.edges.accept).toBe('idle');
    expect(f.nodes.out).toBe('idle');
    expect(f.edges.revise).toBe('dim');
  });
  it('appear reveals hidden node', () => {
    expect(frameAt(spec, tl, 3400).nodes.w).toBe('hidden');
    expect(frameAt(spec, tl, 3550).nodes.w).toBe('idle');
  });
  it('is pure: scrubbing back reproduces forward state (Review Focus 1)', () => {
    const forward = frameAt(spec, tl, 1700);
    frameAt(spec, tl, 3900);
    expect(frameAt(spec, tl, 1700)).toEqual(forward);
    expect(frameAt(spec, tl, 100).nodes.w).toBe('hidden');
  });
  it('clamps t and settles everything at the end', () => {
    const f = frameAt(spec, tl, 99999);
    expect(f.t).toBe(4000);
    expect(f.tokens).toEqual([]);
    expect(f.edges.accept).toBe('traversed');
    expect(f.nodes.eval).toBe('done');
    expect(f.stepIndex).toBe(3);
    expect(frameAt(spec, tl, -5).t).toBe(0);
  });
  it('reports codeRef of current step', () => {
    const s2: DiagramSpec = { ...spec, scenarios: [{ id: 'x', label: 'X', steps: [{ id: 'a', caption: 'A', codeRef: { block: 'b', lines: '1' }, events: [{ type: 'send', edge: 'task', token: { kind: 'prompt' } }] }] }] };
    expect(frameAt(s2, compileScenario(s2.scenarios[0]), 10).codeRef).toEqual({ block: 'b', lines: '1' });
  });
});

describe('step navigation', () => {
  it('nextStepEnd goes to the end of the current step, or the next one at a boundary', () => {
    expect(nextStepEnd(tl, 0)).toBe(1000);
    expect(nextStepEnd(tl, 500)).toBe(1000);
    expect(nextStepEnd(tl, 1000)).toBe(2000);
    expect(nextStepEnd(tl, 4000)).toBe(4000);
  });
  it('prevStepStart goes to the current step start, or the previous one at a boundary', () => {
    expect(prevStepStart(tl, 1500)).toBe(1000);
    expect(prevStepStart(tl, 1000)).toBe(0);
    expect(prevStepStart(tl, 0)).toBe(0);
    expect(prevStepStart(tl, 4000)).toBe(3000);
  });
});
