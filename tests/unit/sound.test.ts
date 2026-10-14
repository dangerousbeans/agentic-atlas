// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { notesFor, PENTATONIC } from '../../src/lib/sound/palette';
import { isSoundFocus, tileOf } from '../../src/lib/sound/focus';
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
