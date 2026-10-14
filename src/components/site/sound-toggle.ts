/**
 * The header's sound toggle. Off by default; the choice persists in localStorage. The synth (./synth.ts) is a dynamic
 * import, fetched the first time sound is turned on, and audio only starts on a user gesture (the toggle click, or,
 * when a stored "on" is restored, the next pointer or key press), since browsers block autoplaying audio.
 * While sound is off nothing here listens or runs: no AudioContext, no hook for the players.
 */
import type { Synth } from './synth';
import type { SoundHook } from '../../lib/sound/hook';
import { isSoundFocus, tileOf } from '../../lib/sound/focus';

const KEY = 'atlas-sound';
const btn = document.querySelector<HTMLButtonElement>('button[data-sound]');

if (btn) {
  let want = false, loading = false;
  let synth: Synth | null = null;
  let hoverTile: Element | null = null, focusTile: Element | null = null;

  const hook: SoundHook = { on: p => isSoundFocus(p, hoverTile ?? focusTile), cue: c => synth?.cue(c) };
  const onOver = (e: PointerEvent) => { hoverTile = tileOf(e.target); };
  const onOut = (e: PointerEvent) => { if (!e.relatedTarget) hoverTile = null; };
  const onFocusIn = (e: FocusEvent) => { focusTile = tileOf(e.target); };
  const onFocusOut = (e: FocusEvent) => { focusTile = tileOf(e.relatedTarget); };
  const onVis = () => { if (synth) void (document.hidden ? synth.suspend() : synth.resume()); };
  const page: [string, EventListener][] = [['pointerover', onOver as EventListener], ['pointerout', onOut as EventListener], ['focusin', onFocusIn as EventListener], ['focusout', onFocusOut as EventListener], ['visibilitychange', onVis]];

  // A gesture starts the audio, or resumes a context the browser created suspended.
  const gestures = ['pointerdown', 'pointerup', 'keydown'];
  const onGesture = () => { if (!synth) void start(); else if (synth.ctx.state === 'suspended' && !document.hidden) void synth.resume().then(running); };
  const awaitGesture = (on: boolean) => gestures.forEach(g => (on ? window.addEventListener(g, onGesture, true) : window.removeEventListener(g, onGesture, true)));
  const running = () => { if (synth?.ctx.state === 'running') awaitGesture(false); };

  async function start() {
    if (synth || loading || !want) return;
    loading = true;
    let mod: typeof import('./synth');
    try { mod = await import('./synth'); } finally { loading = false; }
    if (synth || !want) return;
    synth = mod.createSynth();
    globalThis.__atlasSound = hook;
    page.forEach(([t, f]) => document.addEventListener(t, f));
    if (document.hidden) void synth.suspend();
    else void synth.resume().then(running);
  }

  /** Stop every sound at once (WCAG 1.4.2): drop the hook, cancel scheduled notes and close the context. */
  function stop() {
    globalThis.__atlasSound = undefined;
    page.forEach(([t, f]) => document.removeEventListener(t, f));
    awaitGesture(false);
    void synth?.stop();
    synth = null; hoverTile = focusTile = null;
  }

  const set = (on: boolean) => { want = on; btn.setAttribute('aria-pressed', String(on)); };
  btn.addEventListener('click', () => {
    set(!want);
    try { localStorage.setItem(KEY, want ? '1' : '0'); } catch { /* storage blocked: the choice lasts this page */ }
    if (want) { awaitGesture(true); void start(); } else stop();
  });
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (stored === '1') { set(true); awaitGesture(true); }
  btn.hidden = false;
}
