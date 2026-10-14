import type { Scenario, DiagramSpec, DiagramEvent, CodeRef } from './types';

export const DEFAULT_STEP_MS = 1200;
export interface TimedEvent { event: DiagramEvent; start: number; end: number }
export interface TimedStep { id: string; index: number; caption: string; start: number; end: number; codeRef?: CodeRef; iteration?: { n: number; of: number }; events: TimedEvent[] }
export interface Timeline { id: string; label: string; duration: number; steps: TimedStep[]; events: TimedEvent[] }

export function compileScenario(s: Scenario): Timeline {
  const steps: TimedStep[] = [];
  let t = 0;
  for (const step of s.steps) {
    const n = step.repeat ?? 1;
    const dur = step.duration ?? DEFAULT_STEP_MS;
    for (let k = 1; k <= n; k++) {
      const start = t;
      const events = step.events.map((event): TimedEvent => {
        const [a, b] = event.at ?? [0, 1];
        return { event, start: start + a * dur, end: start + b * dur };
      });
      const ts: TimedStep = { id: n > 1 ? `${step.id}#${k}` : step.id, index: steps.length, caption: step.caption, start, end: start + dur, events };
      if (step.codeRef) ts.codeRef = step.codeRef;
      if (n > 1) ts.iteration = { n: k, of: n };
      steps.push(ts);
      t = start + dur;
    }
  }
  const events = steps.flatMap(st => st.events)
    .map((e, i) => ({ e, i }))
    .sort((x, y) => x.e.start - y.e.start || x.i - y.i)
    .map(x => x.e);
  return { id: s.id, label: s.label, duration: t, steps, events };
}

export function compileDiagram(d: DiagramSpec): Timeline[] {
  return d.scenarios.map(compileScenario);
}
