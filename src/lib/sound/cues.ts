import type { Timeline } from '../diagram/compile';
import type { Cue } from './hook';

/** Where the last scan stopped: the timeline, the index of the first event not yet cued, and the time it reached. */
export interface CueCursor { tl?: Timeline; i: number; t: number }

/**
 * Emit the sound cues for timeline events starting in [a, b): a token send cues its kind, a node activated as `error`
 * cues `reject`, and crossing the scenario's end cues `done`. Consecutive frames ([a, b) then [b, c)) continue from
 * the cursor, so each frame touches only its own events; a wrap, a seek or another scenario re-finds it.
 */
export function cuesBetween(tl: Timeline, a: number, b: number, cur: CueCursor, emit: (c: Cue) => void): void {
  const evs = tl.events;
  let i = cur.i;
  if (cur.tl !== tl || cur.t !== a) { cur.tl = tl; i = 0; while (i < evs.length && evs[i].start < a) i++; }
  for (; i < evs.length && evs[i].start < b; i++) {
    const ev = evs[i].event;
    if (ev.type === 'send') emit(ev.token.kind);
    else if (ev.type === 'activate' && ev.status === 'error') emit('reject');
  }
  cur.i = i; cur.t = b;
  if (a < tl.duration && b >= tl.duration) emit('done');
}
