import { describe, it, expect } from 'vitest';
import { compileScenario, DEFAULT_STEP_MS } from '../../src/lib/diagram/compile';

const send = (edge: string, at?: [number, number]) => ({ type: 'send' as const, edge, token: { kind: 'prompt' as const }, ...(at ? { at } : {}) });

describe('compileScenario', () => {
  it('assigns sequential step windows with default duration', () => {
    const tl = compileScenario({ id: 's', label: 'S', steps: [
      { id: 'a', caption: 'A', events: [send('e1')] },
      { id: 'b', caption: 'B', duration: 2000, events: [send('e2')] },
    ] });
    expect(tl.steps.map(s => [s.id, s.start, s.end])).toEqual([['a', 0, DEFAULT_STEP_MS], ['b', DEFAULT_STEP_MS, DEFAULT_STEP_MS + 2000]]);
    expect(tl.duration).toBe(DEFAULT_STEP_MS + 2000);
  });
  it('maps at windows to absolute times', () => {
    const tl = compileScenario({ id: 's', label: 'S', steps: [{ id: 'a', caption: 'A', duration: 1000, events: [send('e1', [0.25, 0.75])] }] });
    expect(tl.events[0]).toMatchObject({ start: 250, end: 750 });
  });
  it('expands repeat with unique ids and iteration info', () => {
    const tl = compileScenario({ id: 's', label: 'S', steps: [
      { id: 'loop', caption: 'L', duration: 1000, repeat: 3, events: [send('e1')] },
      { id: 'end', caption: 'E', duration: 500, events: [send('e2')] },
    ] });
    expect(tl.steps.map(s => s.id)).toEqual(['loop#1', 'loop#2', 'loop#3', 'end']);
    expect(tl.steps[1].iteration).toEqual({ n: 2, of: 3 });
    expect(tl.steps.map(s => s.index)).toEqual([0, 1, 2, 3]);
    expect(tl.steps[3].start).toBe(3000);
    expect(tl.duration).toBe(3500);
  });
  it('sorts events by start and keeps declaration order on ties', () => {
    const tl = compileScenario({ id: 's', label: 'S', steps: [{ id: 'a', caption: 'A', duration: 1000, events: [send('late', [0.5, 1]), send('first', [0, 0.5]), send('tie', [0, 0.2])] }] });
    expect(tl.events.map(e => (e.event as { edge: string }).edge)).toEqual(['first', 'tie', 'late']);
  });
});
