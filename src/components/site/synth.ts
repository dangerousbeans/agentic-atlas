/**
 * The soundscape's synthesizer, loaded lazily (dynamic import) the first time sound is turned on. No audio files:
 * every cue is an oscillator through a low-pass filter and a gain envelope, into a quiet master gain and a compressor
 * set as a limiter, so stacked cues stay polite.
 */
import { notesFor } from '../../lib/sound/palette';
import type { Cue } from '../../lib/sound/hook';

const MASTER = 0.14;   // overall level: well below full scale
const MAX_VOICES = 8;  // a wide fan-out sends many tokens at once; past this, new notes are dropped
const ATTACK = 0.012;

export function createSynth() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = MASTER;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -18; limit.knee.value = 6; limit.ratio.value = 20; limit.attack.value = 0.003; limit.release.value = 0.2;
  master.connect(limit).connect(ctx.destination);
  const voices = new Set<OscillatorNode>();
  const last = new Map<Cue, number>();

  function cue(c: Cue) {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // the same cue twice within 60 ms (parallel sends) plays once
    if (now - (last.get(c) ?? -1) < 0.06) return;
    last.set(c, now);
    for (const n of notesFor(c)) {
      if (voices.size >= MAX_VOICES) return;
      const t = now + (n.delay ?? 0), end = t + n.dur;
      const osc = ctx.createOscillator(), lp = ctx.createBiquadFilter(), env = ctx.createGain();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.freq, t);
      if (n.drop) osc.frequency.exponentialRampToValueAtTime(n.freq * n.drop, end);
      lp.type = 'lowpass'; lp.frequency.value = n.cutoff ?? 2400; lp.Q.value = 0.5;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(n.gain, t + ATTACK);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(lp).connect(env).connect(master);
      voices.add(osc);
      osc.onended = () => { voices.delete(osc); env.disconnect(); };
      osc.start(t); osc.stop(end + 0.02);
    }
  }

  /** Silence now: cancel every scheduled or sounding note and close the context. */
  function stop() {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.value = 0;
    for (const o of voices) { try { o.stop(); } catch { /* not started yet */ } o.disconnect(); }
    voices.clear();
    return ctx.close();
  }

  return {
    ctx, cue, stop,
    suspend: () => ctx.suspend(),
    resume: () => ctx.resume(),
  };
}
export type Synth = ReturnType<typeof createSynth>;
