import type { Cue } from './hook';

/** One synthesized note: pitch (Hz), a soft waveform (never square or sawtooth), length (s) and peak level before the
 *  master gain. `delay` rolls a chord, `drop` bends the pitch down by that ratio, `cutoff` sets the low-pass (Hz). */
export interface Note { freq: number; type: 'sine' | 'triangle'; dur: number; gain: number; delay?: number; drop?: number; cutoff?: number }

/** C major pentatonic (C D E G A), C4 to A5: any cues that overlap still sound consonant together. */
export const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0] as const;

const TOKEN: Record<Exclude<Cue, 'reject' | 'done' | 'step'>, Note> = {
  prompt: { freq: 659.25, type: 'sine', dur: 0.22, gain: 0.5 },         // E5: a request goes out
  'tool-call': { freq: 392.0, type: 'triangle', dur: 0.2, gain: 0.45 }, // G4: a call into a tool
  result: { freq: 523.25, type: 'sine', dur: 0.26, gain: 0.5 },         // C5: the home note, an answer comes back
  feedback: { freq: 440.0, type: 'triangle', dur: 0.24, gain: 0.4 },    // A4: critique on the way back round a loop
  tokens: { freq: 783.99, type: 'sine', dur: 0.12, gain: 0.3 },         // G5: a light tick for streamed output
};

/** The notes one cue plays. Completion is a gentle rolled C-add9 chord; rejection a low, muted, falling thunk. */
export function notesFor(c: Cue): Note[] {
  switch (c) {
    case 'done': return [261.63, 329.63, 392.0, 587.33].map((freq, i) => ({ freq, type: 'sine', dur: 1.4, gain: 0.28, delay: i * 0.05 }));
    case 'reject': return [{ freq: 98.0, type: 'sine', dur: 0.28, gain: 0.9, drop: 0.55, cutoff: 320 }];
    case 'step': return [{ freq: 523.25, type: 'triangle', dur: 0.18, gain: 0.35 }];
    default: return [TOKEN[c]];
  }
}
