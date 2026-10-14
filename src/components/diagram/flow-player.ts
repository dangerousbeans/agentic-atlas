import { frameAt, nextStepEnd, prevStepStart, type FrameState, type TokenState } from '../../lib/diagram/state';
import type { Timeline } from '../../lib/diagram/compile';
import type { DiagramSpec } from '../../lib/diagram/types';

interface Payload { spec: DiagramSpec; timelines: Timeline[] }
interface Rect { x: number; y: number; w: number; h: number }
interface View { svg: SVGSVGElement; layer: SVGGElement; paths: Map<string, SVGPathElement>; lengths: Map<string, number>; pool: SVGGElement[]; active: boolean; obstacles?: Rect[] }
const NS = 'http://www.w3.org/2000/svg';
const HOLD_MS = 1600;
const TRAIL = [0.05, 0.1, 0.15];
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** What a token label must not cover: node glyphs, labels and sublabels, edge labels and group titles, in SVG units. */
function textObstacles(svg: SVGSVGElement): Rect[] {
  const inv = svg.getScreenCTM()?.inverse();
  if (!inv) return [];
  const out: Rect[] = [];
  svg.querySelectorAll<SVGGraphicsElement>('.node text, .node .shape, text.edge-label, .group text').forEach(t => {
    const b = t.getBBox(), m = inv.multiply(t.getScreenCTM()!);
    const p = new DOMPoint(b.x, b.y).matrixTransform(m), q = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m);
    out.push({ x: Math.min(p.x, q.x) - 2, y: Math.min(p.y, q.y) - 1, w: Math.abs(q.x - p.x) + 4, h: Math.abs(q.y - p.y) + 2 });
  });
  return out;
}
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

class FlowPlayer extends HTMLElement {
  private data!: Payload;
  private tl!: Timeline;
  private t = 0;
  private speed = 1;
  private playing = false;
  private stopAt: number | null = null;
  private userControl = false;
  private visible = false;
  private raf = 0;
  private last = 0;
  private lastStep = -1;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private views: View[] = [];
  private nodeEls = new Map<string, Element[]>();
  private edgeEls = new Map<string, Element[]>();
  private scrub?: HTMLInputElement;
  private scrubbing = false;
  private onDoc = (e: Event) => this.onNodeRef(e as CustomEvent<{ node: string | null }>);
  private onVis = () => this.ensureLoop();
  private inited = false;
  private observers: (ResizeObserver | IntersectionObserver)[] = [];

  get compact() { return this.hasAttribute('compact'); }

  connectedCallback() {
    if (this.inited) { this.attachGlobal(); this.observe(); this.render(); return; }
    const json = this.querySelector('script[data-diagram]');
    if (!json?.textContent) return;
    this.inited = true;
    this.data = JSON.parse(json.textContent);
    this.tl = this.data.timelines[0];
    this.querySelectorAll('[data-node]').forEach(el => this.push(this.nodeEls, (el as HTMLElement).dataset.node!, el));
    this.querySelectorAll('path.edge[data-edge], text.edge-label[data-edge]').forEach(el => this.push(this.edgeEls, (el as HTMLElement).dataset.edge!, el));
    this.querySelectorAll<SVGSVGElement>('svg.diagram-svg').forEach(svg => {
      const paths = new Map<string, SVGPathElement>();
      svg.querySelectorAll<SVGPathElement>('path.edge').forEach(p => paths.set(p.dataset.edge!, p));
      const view: View = { svg, layer: svg.querySelector('g.tokens')!, paths, lengths: new Map(), pool: [], active: false };
      this.views.push(view);
    });
    document.fonts?.ready.then(() => { for (const v of this.views) v.obstacles = undefined; this.render(); });
    this.classList.add('is-enhanced');
    this.setAttribute('data-playing', 'false');
    this.querySelector('.fp-controls')?.removeAttribute('hidden');
    this.bindControls();
    this.syncScenarioLists();
    this.observe();
    this.attachGlobal();
    this.render();
  }

  private observe() {
    for (const view of this.views) {
      const ro = new ResizeObserver(([entry]) => { view.active = entry.contentRect.width > 0; view.obstacles = undefined; if (view.active) this.render(); });
      ro.observe(view.svg); this.observers.push(ro);
    }
    // When the diagram is wider than the stage (big fan-outs on phones), start scrolled to the middle, where the
    // hub is, and let CSS show an edge fade on whichever side has more to see.
    const stage = this.querySelector<HTMLElement>('.diagram-stage');
    if (stage && !this.compact) {
      let centred = false;
      const sync = () => {
        const max = stage.scrollWidth - stage.clientWidth;
        if (max > 1 && !centred) { stage.scrollLeft = max / 2; centred = true; }
        if (max <= 1) centred = false;
        stage.toggleAttribute('data-more-left', max > 1 && stage.scrollLeft > 2);
        stage.toggleAttribute('data-more-right', max > 1 && stage.scrollLeft < max - 2);
      };
      stage.addEventListener('scroll', sync, { passive: true });
      const ro = new ResizeObserver(sync);
      ro.observe(stage); this.observers.push(ro);
    }
    const io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible && !this.userControl && !this.reduced && !this.playing) this.setPlaying(true);
      this.ensureLoop();
    }, { threshold: 0.3 });
    io.observe(this); this.observers.push(io);
  }

  private attachGlobal() {
    document.addEventListener('visibilitychange', this.onVis);
    if (!this.compact) document.addEventListener('noderef', this.onDoc);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.observers.forEach(o => o.disconnect()); this.observers = [];
    this.visible = false;
    for (const v of this.views) v.active = false;
    document.removeEventListener('visibilitychange', this.onVis);
    document.removeEventListener('noderef', this.onDoc);
  }

  private push(m: Map<string, Element[]>, k: string, el: Element) { const a = m.get(k); if (a) a.push(el); else m.set(k, [el]); }

  private bindControls() {
    const q = <T extends Element>(s: string) => this.querySelector<T>(s);
    q<HTMLButtonElement>('[data-action="play"]')?.addEventListener('click', () => this.togglePlay());
    q<HTMLButtonElement>('[data-action="next"]')?.addEventListener('click', () => this.next());
    q<HTMLButtonElement>('[data-action="prev"]')?.addEventListener('click', () => this.prev());
    this.scrub = q<HTMLInputElement>('[data-scrub]') ?? undefined;
    this.scrub?.addEventListener('input', () => { this.take(); this.setPlaying(false); this.t = (+this.scrub!.value / 1000) * this.tl.duration; this.render(); });
    this.scrub?.addEventListener('pointerdown', () => (this.scrubbing = true));
    const endScrub = () => (this.scrubbing = false);
    ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(ev => this.scrub?.addEventListener(ev, endScrub));
    q<HTMLSelectElement>('[data-speed]')?.addEventListener('change', e => (this.speed = +(e.target as HTMLSelectElement).value));
    q<HTMLSelectElement>('[data-scenario]')?.addEventListener('change', e => {
      this.tl = this.data.timelines[+(e.target as HTMLSelectElement).value];
      this.t = 0; this.lastStep = -1; this.syncScenarioLists(); this.render();
    });
    this.addEventListener('keydown', e => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter')) return;
      const k = e.key;
      if (k === ' ' || k === 'Spacebar') { e.preventDefault(); this.togglePlay(); }
      else if (k === 'ArrowRight') { e.preventDefault(); this.next(); }
      else if (k === 'ArrowLeft') { e.preventDefault(); this.prev(); }
      else if (k === 'Home') { e.preventDefault(); this.take(); this.setPlaying(false); this.t = 0; this.render(); }
      else if (k === 'End') { e.preventDefault(); this.take(); this.setPlaying(false); this.t = this.tl.duration; this.render(); }
    });
  }

  private take() { this.userControl = true; this.stopAt = null; }

  private togglePlay() {
    this.take();
    if (!this.playing && this.t >= this.tl.duration) this.t = 0;
    this.setPlaying(!this.playing);
  }

  private next() {
    this.take();
    const target = nextStepEnd(this.tl, this.t);
    if (this.reduced) { this.setPlaying(false); this.t = target; this.render(); return; }
    this.stopAt = target; this.setPlaying(true);
  }

  private prev() {
    this.take(); this.setPlaying(false);
    this.t = prevStepStart(this.tl, this.t); this.render();
  }

  private setPlaying(v: boolean) {
    this.playing = v;
    this.setAttribute('data-playing', String(v));
    const b = this.querySelector('[data-action="play"]');
    b?.setAttribute('aria-pressed', String(v));
    b?.setAttribute('aria-label', v ? 'Pause' : 'Play');
    this.ensureLoop();
  }

  private ensureLoop() {
    const run = this.playing && this.visible && !document.hidden;
    if (run && !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
    if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  private tick = (now: number) => {
    const dt = Math.max(0, Math.min(now - this.last, 100));
    this.last = now;
    let t = this.t + dt * this.speed;
    if (this.stopAt !== null && t >= this.stopAt) { t = this.stopAt; this.stopAt = null; this.t = t; this.render(); this.raf = 0; this.setPlaying(false); return; }
    if (t >= this.tl.duration) {
      if (!this.userControl) { if (t >= this.tl.duration + HOLD_MS) t = 0; }
      else { this.t = this.tl.duration; this.render(); this.raf = 0; this.setPlaying(false); return; }
    }
    this.t = t;
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };

  private shownT(): number {
    if (!this.reduced) return this.t;
    const f = frameAt(this.data.spec, this.tl, this.t);
    const step = this.tl.steps[f.stepIndex];
    return this.t >= this.tl.duration ? this.tl.duration : step.end - 0.001;
  }

  private render() {
    if (!this.data) return;
    const f = frameAt(this.data.spec, this.tl, this.shownT());
    for (const [id, s] of Object.entries(f.nodes)) for (const el of this.nodeEls.get(id) ?? []) if (el.getAttribute('data-state') !== s) el.setAttribute('data-state', s);
    for (const [id, s] of Object.entries(f.edges)) for (const el of this.edgeEls.get(id) ?? []) if (el.getAttribute('data-state') !== s) el.setAttribute('data-state', s);
    for (const v of this.views) if (v.active) this.drawTokens(v, f.tokens);
    if (this.scrub && !this.scrubbing) this.scrub.value = String(Math.round((Math.min(this.t, this.tl.duration) / this.tl.duration) * 1000));
    if (f.stepIndex !== this.lastStep) this.onStep(f);
  }

  private drawTokens(v: View, tokens: TokenState[]) {
    while (v.pool.length < tokens.length) v.pool.push(this.makeToken(v.layer));
    v.pool.forEach((g, i) => {
      const tok = tokens[i];
      if (!tok) { g.setAttribute('display', 'none'); return; }
      const path = v.paths.get(tok.edge);
      if (!path) { g.setAttribute('display', 'none'); return; }
      let len = v.lengths.get(tok.edge);
      if (len === undefined) { len = path.getTotalLength(); v.lengths.set(tok.edge, len); }
      g.removeAttribute('display');
      g.setAttribute('data-kind', tok.kind);
      const parts = g.children;
      const head = path.getPointAtLength(ease(tok.progress) * len);
      parts[3].setAttribute('transform', `translate(${head.x},${head.y})`);
      TRAIL.forEach((lag, k) => {
        const pt = path.getPointAtLength(ease(Math.max(0, tok.progress - lag)) * len);
        parts[k].setAttribute('transform', `translate(${pt.x},${pt.y})`);
      });
      const label = parts[4] as SVGTextElement;
      const text = tok.label ?? '';
      if (label.textContent !== text) label.textContent = text;
      if (!text) return;
      // Put the label beside the token, perpendicular to its direction of travel, on whichever side clears the
      // static labels; hide it for the frames where no side is clear.
      v.obstacles ??= textObstacles(v.svg);
      const back = path.getPointAtLength(Math.max(0, ease(tok.progress) * len - 6));
      let tx = head.x - back.x, ty = head.y - back.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = text.length * 6.2 + 4, h = 12;
      let placed = false;
      // beside the token first, then trailing behind it (clear of the glyph it is about to reach), then leading it
      for (const [sgn, lag] of [[-1, 0], [1, 0], [-1, w / 2 + 8], [1, w / 2 + 8], [-1, -w / 2 - 8], [1, -w / 2 - 8]]) {
        // normal (-ty, tx) or its opposite; for a horizontal edge -1 is above, for a vertical one it is right
        const nx = -ty * sgn, ny = tx * sgn;
        const cx = head.x + nx * 13 - tx * lag, cy = head.y + ny * 13 - ty * lag;
        const anchor = Math.abs(nx) > 0.7 ? (nx > 0 ? 'start' : 'end') : 'middle';
        const left = anchor === 'middle' ? cx - w / 2 : anchor === 'start' ? cx - 4 : cx - w + 4;
        const box = { x: left, y: cy - h / 2, w, h };
        if (v.obstacles.some(o => hit(o, box))) continue;
        label.setAttribute('text-anchor', anchor);
        label.setAttribute('transform', `translate(${anchor === 'middle' ? cx : anchor === 'start' ? cx - 4 : cx + 4},${cy + 3.5})`);
        placed = true;
        break;
      }
      if (placed) label.removeAttribute('display'); else label.setAttribute('display', 'none');
    });
  }

  private makeToken(layer: SVGGElement): SVGGElement {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'token');
    [2.6, 3.2, 3.8].forEach((r, i) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', String(r)); c.setAttribute('class', 'trail'); c.setAttribute('opacity', String(0.25 + i * 0.2)); g.appendChild(c); });
    const head = document.createElementNS(NS, 'circle'); head.setAttribute('r', '4.2'); head.setAttribute('class', 'head'); g.appendChild(head);
    const text = document.createElementNS(NS, 'text'); text.setAttribute('text-anchor', 'middle'); g.appendChild(text);
    layer.appendChild(g);
    return g;
  }

  private onStep(f: FrameState) {
    this.lastStep = f.stepIndex;
    this.setAttribute('data-step-index', String(f.stepIndex));
    const step = this.tl.steps[f.stepIndex];
    const cap = this.querySelector('.fp-caption');
    if (cap) cap.textContent = step.caption + (step.iteration ? ` (round ${step.iteration.n} of ${step.iteration.of})` : '');
    const ref = f.codeRef;
    this.setAttribute('data-code-ref', ref ? `${ref.block}:${ref.lines}` : '');
    const counter = this.querySelector('.fp-counter');
    if (counter) counter.textContent = `Step ${f.stepIndex + 1} / ${this.tl.steps.length}`;
    this.querySelectorAll(`ol.fp-captions[data-scenario="${this.tl.id}"] li`).forEach(li => {
      if ((li as HTMLElement).dataset.stepIndex === String(f.stepIndex)) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    this.dispatchEvent(new CustomEvent('flowstep', { bubbles: true, detail: { uid: this.dataset.uid, stepIndex: f.stepIndex, codeRef: f.codeRef } }));
  }

  private syncScenarioLists() {
    this.querySelectorAll<HTMLElement>('.fp-scenario-steps').forEach(el => {
      if (el.dataset.scenario === this.tl.id) el.removeAttribute('data-inactive'); else el.setAttribute('data-inactive', '');
    });
  }

  private onNodeRef(e: CustomEvent<{ node: string | null }>) {
    this.querySelectorAll('.node.is-ref').forEach(el => el.classList.remove('is-ref'));
    if (e.detail.node) for (const el of this.nodeEls.get(e.detail.node) ?? []) el.classList.add('is-ref');
  }
}

if (!customElements.get('flow-player')) customElements.define('flow-player', FlowPlayer);
