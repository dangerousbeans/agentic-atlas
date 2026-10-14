/**
 * The header's sound toggle. Off by default; the choice persists in localStorage. The synth (./synth.ts) is a dynamic
 * import, fetched the first time sound is turned on (or, when a stored "on" is restored, right away, so the next
 * gesture can start the audio synchronously, as WebKit requires). Audio only starts on a user gesture (the toggle
 * click, or the next pointer or key press after a restore), since browsers block autoplaying audio.
 * While sound is off nothing here listens or runs: no AudioContext, no hook for the players.
 */
import type { Synth } from './synth';
import type { SoundHook } from '../../lib/sound/hook';
import { isSoundFocus, tileOf } from '../../lib/sound/focus';

const KEY = 'atlas-sound';
const btn = document.querySelector<HTMLButtonElement>('button[data-sound]');
const quiet = () => {};

if (btn) {
  let want = false;
  let mod: typeof import('./synth') | null = null;
  let loading: Promise<unknown> | null = null;
  let synth: Synth | null = null;
  let hoverTile: Element | null = null, focusTile: Element | null = null;

  const hook: SoundHook = { on: p => isSoundFocus(p, hoverTile ?? focusTile), cue: c => synth?.cue(c) };
  const onOver = (e: PointerEvent) => { hoverTile = tileOf(e.target); };
  const onOut = (e: PointerEvent) => { if (!e.relatedTarget) hoverTile = null; };
  // keyboard focus only: a map drag that starts on a tile focuses its link, which must not keep that tile sounding
  const keyTile = (el: EventTarget | null) => (el instanceof Element && el.matches(':focus-visible') ? tileOf(el) : null);
  const onFocusIn = (e: FocusEvent) => { focusTile = keyTile(e.target); };
  const onFocusOut = () => { focusTile = null; };
  const onVis = () => { if (synth) (document.hidden ? synth.suspend() : synth.resume()).catch(quiet); };
  const page: [string, EventListener][] = [['pointerover', onOver as EventListener], ['pointerout', onOut as EventListener], ['focusin', onFocusIn as EventListener], ['focusout', onFocusOut as EventListener], ['visibilitychange', onVis]];

  // A gesture starts the audio, or resumes a context the browser created suspended.
  const gestures = ['pointerdown', 'pointerup', 'keydown'];
  const resume = () => synth?.resume().then(running, quiet);
  const onGesture = () => { if (!synth) start(); else if (synth.ctx.state === 'suspended' && !document.hidden) resume(); };
  const awaitGesture = (on: boolean) => gestures.forEach(g => (on ? window.addEventListener(g, onGesture, true) : window.removeEventListener(g, onGesture, true)));
  const running = () => { if (synth?.ctx.state === 'running') awaitGesture(false); };

  /** Fetch the synth chunk once; a failure (offline, a stale chunk after a deploy) turns sound off for this page only,
   *  without saving that, so the stored choice is retried on the next page load. */
  const load = () => (loading ??= import('./synth').then(m => { mod = m; }, () => { loading = null; if (want) { want = false; btn.setAttribute('aria-pressed', 'false'); stop(); } }));

  /** Start the audio: synchronously when the chunk is already here (inside the gesture), else once it arrives. */
  function start() {
    if (synth || !want) return;
    if (mod) begin(mod);
    else void load().then(() => { if (mod && want && !synth) begin(mod); });
  }

  function begin(m: typeof import('./synth')) {
    synth = m.createSynth();
    globalThis.__atlasSound = hook;
    page.forEach(([t, f]) => document.addEventListener(t, f));
    // the pointer may already rest on a tile, or keyboard focus sit on one, before these listeners existed
    hoverTile = tileOf(document.querySelector('.atlas-tile:hover'));
    focusTile = keyTile(document.activeElement);
    if (document.hidden) synth.suspend().catch(quiet); else resume();
  }

  /** Stop every sound at once (WCAG 1.4.2): drop the hook, cancel scheduled notes and close the context. */
  function stop() {
    globalThis.__atlasSound = undefined;
    page.forEach(([t, f]) => document.removeEventListener(t, f));
    awaitGesture(false);
    synth?.stop().catch(quiet);
    synth = null; hoverTile = focusTile = null;
  }

  const set = (on: boolean) => {
    want = on; btn.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked: the choice lasts this page */ }
  };
  const off = () => { set(false); stop(); };
  btn.addEventListener('click', () => {
    if (want) return off();
    set(true); awaitGesture(true); start();
  });
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (stored === '1') { want = true; btn.setAttribute('aria-pressed', 'true'); awaitGesture(true); void load(); }
  btn.hidden = false;
}
