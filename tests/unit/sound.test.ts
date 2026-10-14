// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { notesFor, PENTATONIC } from '../../src/lib/sound/palette';
import { isSoundFocus, tileOf } from '../../src/lib/sound/focus';
import { cuesBetween, type CueCursor } from '../../src/lib/sound/cues';
import { compileScenario } from '../../src/lib/diagram/compile';
import type { TokenKind } from '../../src/lib/diagram/types';

const KINDS: TokenKind[] = ['prompt', 'tool-call', 'result', 'feedback', 'tokens'];

describe('notesFor: token kinds', () => {
  it('gives every token kind exactly one note, each on its own pentatonic pitch', () => {
    const freqs = KINDS.map(k => { const n = notesFor(k); expect(n).toHaveLength(1); return n[0].freq; });
    expect(new Set(freqs).size).toBe(KINDS.length);
    for (const f of freqs) expect(PENTATONIC).toContain(f);
  });
  it('keeps token notes short, soft and smooth (sine or triangle, never square or sawtooth)', () => {
    for (const k of KINDS) for (const n of notesFor(k)) {
      expect(['sine', 'triangle']).toContain(n.type);
      expect(n.dur).toBeGreaterThan(0.05);
      expect(n.dur).toBeLessThanOrEqual(0.3);
      expect(n.gain).toBeGreaterThan(0);
      expect(n.gain).toBeLessThanOrEqual(0.5);
    }
  });
  it('makes streamed tokens the lightest cue', () => {
    const t = notesFor('tokens')[0];
    for (const k of KINDS) if (k !== 'tokens') { expect(t.dur).toBeLessThan(notesFor(k)[0].dur); expect(t.gain).toBeLessThan(notesFor(k)[0].gain); }
  });
});

describe('notesFor: completion, rejection, step', () => {
  it('completion is a rolled chord of pentatonic pitches, longer and quieter per voice than a token', () => {
    const chord = notesFor('done');
    expect(chord.length).toBeGreaterThanOrEqual(3);
    for (const n of chord) { expect(PENTATONIC).toContain(n.freq); expect(n.type).toBe('sine'); expect(n.gain).toBeLessThan(notesFor('prompt')[0].gain); }
    expect(chord.map(n => n.delay ?? 0)).toEqual([...chord.map(n => n.delay ?? 0)].sort((a, b) => a - b));
    expect(new Set(chord.map(n => n.delay)).size).toBe(chord.length);
  });
  it('rejection is one low, muted, falling sine', () => {
    const [n, ...rest] = notesFor('reject');
    expect(rest).toEqual([]);
    expect(n.type).toBe('sine');
    expect(n.freq).toBeLessThan(150);
    expect(n.drop).toBeGreaterThan(0);
    expect(n.drop).toBeLessThan(1);
    expect(n.cutoff).toBeLessThanOrEqual(500);
  });
  it('a manual step is one short pentatonic tick', () => {
    const s = notesFor('step');
    expect(s).toHaveLength(1);
    expect(PENTATONIC).toContain(s[0].freq);
    expect(s[0].dur).toBeLessThanOrEqual(0.3);
  });
});

describe('cuesBetween', () => {
  // three 1000 ms steps: a prompt at 0, a tool call at 1000 and a rejection at 1500, a result at 2000 (duration 3000)
  const tl = compileScenario({ id: 's', label: 'S', steps: [
    { id: 'a', caption: 'a', duration: 1000, events: [{ type: 'send', edge: 'e1', token: { kind: 'prompt' } }] },
    { id: 'b', caption: 'b', duration: 1000, events: [{ type: 'send', edge: 'e2', token: { kind: 'tool-call' } }, { type: 'activate', node: 'g', status: 'error', at: [0.5, 1] }, { type: 'activate', node: 'n', status: 'thinking' }] },
    { id: 'c', caption: 'c', duration: 1000, events: [{ type: 'send', edge: 'e3', token: { kind: 'result' } }, { type: 'branch', node: 'r', taken: 'e1', notTaken: ['e2'] }] },
  ] });
  const run = (frames: [number, number][], cur: CueCursor = { i: 0, t: -1 }) => {
    const out: string[] = [];
    for (const [a, b] of frames) cuesBetween(tl, a, b, cur, c => out.push(c));
    return out;
  };
  const frames = (from: number, to: number, dt: number) => { const f: [number, number][] = []; for (let t = from; t < to; t += dt) f.push([t, t + dt]); return f; };

  it('cues each send and rejection once, in order, then done once, across consecutive frames', () => {
    expect(run(frames(0, 3200, 16))).toEqual(['prompt', 'tool-call', 'reject', 'result', 'done']);
  });
  it('ignores non-error activations and branches (not-taken is routing, not a rejection)', () => {
    expect(run([[0, 3001]])).toEqual(['prompt', 'tool-call', 'reject', 'result', 'done']);
  });
  it('replays from the top after a wrap, and re-finds its place after a seek', () => {
    const cur: CueCursor = { i: 0, t: -1 };
    expect(run(frames(0, 3200, 100), cur)).toHaveLength(5);
    expect(run(frames(0, 1100, 100), cur)).toEqual(['prompt', 'tool-call']);
    expect(run([[1900, 2100]], cur)).toEqual(['result']);
  });
  it('re-finds its place for another timeline', () => {
    const cur: CueCursor = { i: 0, t: -1 };
    run([[0, 1600]], cur);
    const other = compileScenario({ id: 'o', label: 'O', steps: [{ id: 'x', caption: 'x', events: [{ type: 'send', edge: 'e', token: { kind: 'feedback' } }] }] });
    const out: string[] = [];
    cuesBetween(other, 1600, 1700, cur, c => out.push(c));
    expect(out).toEqual([]);
    cuesBetween(other, 0, 10, cur, c => out.push(c));
    expect(out).toEqual(['feedback']);
  });
});

describe('isSoundFocus', () => {
  const html = `
    <flow-player id="main"></flow-player>
    <a class="atlas-tile" id="t1"><span><flow-player id="p1" compact></flow-player></span></a>
    <a class="atlas-tile" id="t2"><span><flow-player id="p2" compact></flow-player></span></a>
    <div class="card"><flow-player id="thumb" compact></flow-player></div>`;
  const setup = () => { document.body.innerHTML = html; return (id: string) => document.getElementById(id)!; };

  it('with no active tile, only full (non-compact) players are focused', () => {
    const $ = setup();
    expect(isSoundFocus($('main'), null)).toBe(true);
    expect(isSoundFocus($('p1'), null)).toBe(false);
    expect(isSoundFocus($('p2'), null)).toBe(false);
    expect(isSoundFocus($('thumb'), null)).toBe(false);
  });
  it('with an active map tile, only the player inside it is focused, not the main player', () => {
    const $ = setup();
    expect(isSoundFocus($('p1'), $('t1'))).toBe(true);
    expect(isSoundFocus($('p2'), $('t1'))).toBe(false);
    expect(isSoundFocus($('main'), $('t1'))).toBe(false);
    expect(isSoundFocus($('thumb'), $('t1'))).toBe(false);
  });
  it('tileOf finds the map tile around an event target, else null', () => {
    const $ = setup();
    expect(tileOf($('p1'))).toBe($('t1'));
    expect(tileOf($('t2'))).toBe($('t2'));
    expect(tileOf($('thumb'))).toBeNull();
    expect(tileOf(null)).toBeNull();
    expect(tileOf(window)).toBeNull();
  });
});
