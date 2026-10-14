import type { TokenKind } from '../diagram/types';

/** A sound cue: a token send of one kind, a rejection (a node activated with status `error`), a finished scenario, or
 *  a manual step (reduced motion plays only these). */
export type Cue = TokenKind | 'reject' | 'done' | 'step';

/** The sound hook a flow-player calls. It exists on `globalThis.__atlasSound` only while sound is on and its audio
 *  has started, so with sound off a player pays one global lookup per frame and nothing else. */
export interface SoundHook {
  /** Is this player the focused one (the only one allowed to sound)? Gates the per-frame event scan. */
  on(player: Element): boolean;
  cue(c: Cue): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __atlasSound: SoundHook | undefined;
}
