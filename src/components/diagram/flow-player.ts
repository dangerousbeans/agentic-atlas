import { frameAt, type FrameState, type TokenState } from '../../lib/diagram/state';
import type { Timeline } from '../../lib/diagram/compile';
import type { DiagramSpec } from '../../lib/diagram/types';
import { pickLayout } from '../../lib/diagram/fit';

interface Payload { spec: DiagramSpec; timelines: Timeline[] }
interface Rect { x: number; y: number; w: number; h: number }
interface Track { len: number; pts: Float32Array }
interface View { svg: SVGSVGElement; layer: SVGGElement; paths: Map<string, SVGPathElement>; tracks: Map<string, Track>; pool: SVGGElement[]; active: boolean; glow?: string; obstacles?: Rect[] }
const NS = 'http://www.w3.org/2000/svg';
const HOLD_MS = 1600;
const EPS = 0.001;
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
/** Sample an edge path once (every TRACK_STEP SVG units), so per-frame token positions are plain interpolation:
 *  getPointAtLength() in the frame loop forces a style and layout update right after the state attributes change. */
const TRACK_STEP = 2;
function sampleTrack(path: SVGPathElement): Track {
  const len = path.getTotalLength(), n = Math.max(1, Math.ceil(len / TRACK_STEP));
  const pts = new Float32Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) { const p = path.getPointAtLength((i / n) * len); pts[2 * i] = p.x; pts[2 * i + 1] = p.y; }
  return { len, pts };
}
function pointAt({ len, pts }: Track, d: number): { x: number; y: number } {
  const n = pts.length / 2 - 1, f = Math.min(n, Math.max(0, (d / (len || 1)) * n)), i = Math.min(n - 1, Math.floor(f)), t = f - i;
  return { x: pts[2 * i] + (pts[2 * i + 2] - pts[2 * i]) * t, y: pts[2 * i + 1] + (pts[2 * i + 3] - pts[2 * i + 1]) * t };
}
/** Move a token dot by its circles' centres, not a transform: a changed SVG transform is a paint-property change that
 *  makes Blink re-layerize the whole page every frame, while a moved circle is only a repaint of its own rect. */
function place(dot: Element, x: number, y: number) {
  const sx = String(x), sy = String(y);
  for (const c of dot.children) { c.setAttribute('cx', sx); c.setAttribute('cy', sy); }
}
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

class FlowPlayer extends HTMLElement {
  private data!: Payload;
  private tl!: Timeline;
  private t = 0;
  private playing = false;
  private hover = false;
  private focused = false;
  private jumpHold = false;
  private visible = false;
  private raf = 0;
  private last = 0;
  private lastStep = -1;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private views: View[] = [];
  private nodeEls = new Map<string, Element[]>();
  private edgeEls = new Map<string, Element[]>();
  private tip?: HTMLElement;
  private tipParts: HTMLElement[] = [];
  private tipFor: Element | null = null;
  private hideTimer = 0;
  private lit: Element[] = [];
  private onDoc = (e: Event) => this.onNodeRef(e as CustomEvent<{ node: string | null }>);
  private onVis = () => this.ensureLoop();
  private onWin = () => this.showTip(null);
  private onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') this.showTip(null); };
  private inited = false;
  private observers: (ResizeObserver | IntersectionObserver)[] = [];

  get compact() { return this.hasAttribute('compact'); }

  /** External pause hook: while `data-suspended` is present the player stays paused (e.g. the atlas map below its zoom threshold). */
  static observedAttributes = ['data-suspended'];
  attributeChangedCallback() { if (this.inited) this.sync(); }

  connectedCallback() {
    if (this.inited) { this.attachGlobal(); this.observe(); this.render(); return; }
    const json = this.querySelector('script[data-diagram]');
    if (!json?.textContent) return;
    this.inited = true;
    this.data = JSON.parse(json.textContent);
    this.tl = this.data.timelines[0];
    this.querySelectorAll('[data-node]').forEach(el => this.push(this.nodeEls, (el as HTMLElement).dataset.node!, el));
    this.querySelectorAll('path.edge[data-edge], path.edge-glow[data-edge], text.edge-label[data-edge]').forEach(el => this.push(this.edgeEls, (el as HTMLElement).dataset.edge!, el));
    this.querySelectorAll<SVGSVGElement>('svg.diagram-svg').forEach(svg => {
      const paths = new Map<string, SVGPathElement>();
      svg.querySelectorAll<SVGPathElement>('path.edge').forEach(p => paths.set(p.dataset.edge!, p));
      this.views.push({ svg, layer: svg.querySelector('g.tokens')!, paths, tracks: new Map(), pool: [], active: false, glow: svg.querySelector('radialGradient.token-glow')?.id });
    });
    document.fonts?.ready.then(() => { for (const v of this.views) v.obstacles = undefined; this.render(); });
    this.classList.add('is-enhanced');
    this.setAttribute('data-playing', 'false');
    if (!this.compact) this.bindExplore();
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
      const wide = stage.querySelector<SVGSVGElement>('svg[data-layout="wide"]');
      // Show the wide layout only while its labels stay readable at this stage width, else the narrow one
      // (CSS keys off data-fit; without JS the 640px container query decides). Views follow via their observers.
      const fit = () => {
        if (!wide) return;
        const cs = getComputedStyle(stage), vb = wide.viewBox.baseVal;
        const avail = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const maxHeight = parseFloat(getComputedStyle(wide).maxHeight) || Infinity;
        const pick = pickLayout(avail, { width: vb.width, height: vb.height, maxHeight });
        if (this.dataset.fit !== pick) this.dataset.fit = pick;
      };
      fit();
      const sync = () => {
        fit();
        const max = stage.scrollWidth - stage.clientWidth;
        if (max > 1 && !centred) { stage.scrollLeft = max / 2; centred = true; }
        if (max <= 1) centred = false;
        // a wide layout only ever overflows by its empty margin (fit.ts), so there is nothing to point at
        const more = max > 1 && this.dataset.fit !== 'wide';
        stage.toggleAttribute('data-more-left', more && stage.scrollLeft > 2);
        stage.toggleAttribute('data-more-right', more && stage.scrollLeft < max - 2);
      };
      stage.addEventListener('scroll', sync, { passive: true });
      const ro = new ResizeObserver(sync);
      ro.observe(stage); this.observers.push(ro);
    }
    const io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.sync(); }, { threshold: 0.3 });
    io.observe(this); this.observers.push(io);
  }

  private attachGlobal() {
    document.addEventListener('visibilitychange', this.onVis);
    if (!this.compact) {
      document.addEventListener('noderef', this.onDoc);
      addEventListener('scroll', this.onWin, { passive: true });
      addEventListener('resize', this.onWin);
    }
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.observers.forEach(o => o.disconnect()); this.observers = [];
    this.visible = false;
    for (const v of this.views) v.active = false;
    document.removeEventListener('visibilitychange', this.onVis);
    document.removeEventListener('noderef', this.onDoc);
    removeEventListener('scroll', this.onWin);
    removeEventListener('resize', this.onWin);
    this.hover = this.focused = this.jumpHold = false;
    if (this.tip) this.showTip(null);
    this.sync();
  }

  private push(m: Map<string, Element[]>, k: string, el: Element) { const a = m.get(k); if (a) a.push(el); else m.set(k, [el]); }

  private get held() { return this.hover || this.focused || this.jumpHold; }

  /** Autoplay-loop whenever visible, not held by the pointer or keyboard focus, and not suspended. Reduced motion never autoplays. */
  private sync() {
    const run = !this.reduced && this.visible && !this.held && !this.hasAttribute('data-suspended');
    if (run !== this.playing) { this.playing = run; this.setAttribute('data-playing', String(run)); }
    this.ensureLoop();
  }

  private bindExplore() {
    const on = (t: EventTarget, type: string, fn: (e: any) => void) => t.addEventListener(type, fn);
    const hit = (e: Event) => (e.target as Element).closest<SVGElement>('[data-tip-t]');
    const stage = this.querySelector('.diagram-stage')!;
    on(stage, 'pointerenter', () => { this.hover = true; this.sync(); });
    on(stage, 'pointerleave', () => { this.hover = false; this.sync(); });
    on(this, 'pointerleave', () => { this.jumpHold = false; this.sync(); });
    on(this, 'focusin', e => { this.focused = (e.target as Element).matches(':focus-visible'); this.sync(); const el = hit(e); if (el) this.showTip(el); });
    on(this, 'focusout', e => {
      this.showTip(null);
      if (!this.contains(e.relatedTarget as Node | null)) { this.focused = false; this.jumpHold = false; this.sync(); }
    });
    // One tooltip element for the whole player.
    const tip = (this.tip = document.createElement('div'));
    tip.className = 'fp-tip'; tip.setAttribute('role', 'tooltip');
    const head = document.createElement('div'); head.className = 'fp-tip-head';
    this.tipParts = ['span:fp-tip-t', 'span:fp-tip-k', 'p:fp-tip-d', 'p:fp-tip-x'].map(s => {
      const [tag, cls] = s.split(':'); const el = document.createElement(tag); el.className = cls; return el;
    });
    head.append(this.tipParts[0], this.tipParts[1]);
    tip.append(head, this.tipParts[2], this.tipParts[3]);
    this.append(tip);
    on(tip, 'pointerenter', () => { clearTimeout(this.hideTimer); this.hover = true; this.sync(); });
    on(tip, 'pointerleave', () => { this.hover = false; this.sync(); this.hideSoon(); });
    on(this, 'pointerover', e => { const el = hit(e); if (el) this.showTip(el, e); });
    on(this, 'pointermove', e => { if (this.tipFor?.hasAttribute('data-hit') && !tip.contains(e.target as Node)) this.place(e.clientX, e.clientY, e.clientX, e.clientY); });
    on(this, 'pointerout', e => {
      if (e.pointerType === 'touch') return;
      const to = (e.relatedTarget as Element | null)?.closest?.('[data-tip-t]') ?? null;
      if (to !== hit(e)) { if (to) this.showTip(to); else this.hideSoon(); }
    });
    on(this, 'pointerdown', e => { if (e.pointerType === 'touch' && !hit(e)) this.showTip(null); });
    on(stage, 'scroll', this.onWin);

    on(this, 'click', e => {
      const b = (e.target as Element).closest<HTMLElement>('button[data-step-index]');
      if (!b) return;
      this.t = this.tl.steps[+b.dataset.stepIndex!].end - EPS;
      this.jumpHold = true; this.sync(); this.render();
    });

    const tabs = [...this.querySelectorAll<HTMLElement>('[data-scenario-tab]')];
    const list = this.querySelector('.fp-tabs');
    list?.removeAttribute('hidden');
    const pick = (i: number) => {
      tabs.forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
      this.tl = this.data.timelines[i]; this.t = 0; this.lastStep = -1;
      this.syncScenarioLists(); this.render();
    };
    tabs.forEach((b, i) => on(b, 'click', () => pick(i)));
    if (list) on(list, 'keydown', e => {
      const n = tabs.length, i = tabs.indexOf(document.activeElement as HTMLElement);
      const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); pick(j); tabs[j].focus();
    });
  }

  /** Give the pointer a moment to travel from the anchor onto the tooltip (WCAG 1.4.13 hoverable). */
  private hideSoon() {
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.showTip(null), 150);
  }

  private showTip(el: Element | null, e?: PointerEvent) {
    clearTimeout(this.hideTimer);
    if (el === this.tipFor) return;
    this.tipFor = el;
    if (el) document.addEventListener('keydown', this.onEsc); else document.removeEventListener('keydown', this.onEsc);
    const tip = this.tip!;
    for (const x of this.lit) x.classList.remove('is-hover');
    this.lit = [];
    if (this.classList.contains('has-focus')) {
      this.classList.remove('has-focus');
      this.edgeEls.forEach(a => a.forEach(x => x.classList.remove('is-rel')));
    }
    tip.classList.toggle('is-on', !!el);
    if (!el) return;
    const d = (el as HTMLElement).dataset;
    this.tipParts.forEach((p, i) => (p.textContent = [d.tipT, d.tipK, d.tipD, d.tipX][i] ?? ''));
    if (d.node) {
      this.lit = this.nodeEls.get(d.node) ?? [];
      this.classList.add('has-focus');
      this.edgeEls.forEach(a => a.forEach(x => x.classList.toggle('is-rel', (x as HTMLElement).dataset.from === d.node || (x as HTMLElement).dataset.to === d.node)));
    } else this.lit = this.edgeEls.get(d.hit!) ?? [];
    this.lit.forEach(x => x.classList.add('is-hover'));
    if (e && d.hit) this.place(e.clientX, e.clientY, e.clientX, e.clientY);
    else { const r = el.getBoundingClientRect(); this.place(r.left, r.top, r.right, r.bottom); }
  }

  /** Centre the tooltip above the anchor box (below if there is no room) and clamp it inside the viewport. */
  private place(l: number, t: number, r: number, b: number) {
    const tip = this.tip!, w = tip.offsetWidth, h = tip.offsetHeight, M = 8;
    const x = Math.min(Math.max((l + r) / 2 - w / 2, M), Math.max(M, document.documentElement.clientWidth - w - M));
    let y = t - h - 12;
    if (y < M) y = b + 12;
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.min(Math.max(y, M), Math.max(M, document.documentElement.clientHeight - h - M))}px`;
  }

  private ensureLoop() {
    const run = this.playing && !document.hidden;
    if (run && !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
    if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  private tick = (now: number) => {
    const dt = Math.max(0, Math.min(now - this.last, 100));
    this.last = now;
    let t = this.t + dt;
    if (t >= this.tl.duration + HOLD_MS) t = 0;
    this.t = t;
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };

  private shownT(): number {
    if (!this.reduced) return this.t;
    const f = frameAt(this.data.spec, this.tl, this.t);
    const step = this.tl.steps[f.stepIndex];
    return this.t >= this.tl.duration ? this.tl.duration : step.end - EPS;
  }

  private render() {
    if (!this.data) return;
    const f = frameAt(this.data.spec, this.tl, this.shownT());
    for (const [id, s] of Object.entries(f.nodes)) for (const el of this.nodeEls.get(id) ?? []) if (el.getAttribute('data-state') !== s) {
      el.setAttribute('data-state', s);
      if (el.hasAttribute('tabindex')) el.setAttribute('tabindex', s === 'hidden' ? '-1' : '0');
    }
    for (const [id, s] of Object.entries(f.edges)) for (const el of this.edgeEls.get(id) ?? []) if (el.getAttribute('data-state') !== s) el.setAttribute('data-state', s);
    for (const v of this.views) if (v.active) this.drawTokens(v, f.tokens);
    if (f.stepIndex !== this.lastStep) this.onStep(f);
  }

  private drawTokens(v: View, tokens: TokenState[]) {
    while (v.pool.length < tokens.length) v.pool.push(this.makeToken(v));
    v.pool.forEach((g, i) => {
      const tok = tokens[i];
      if (!tok) { g.setAttribute('display', 'none'); return; }
      const path = v.paths.get(tok.edge);
      if (!path) { g.setAttribute('display', 'none'); return; }
      let track = v.tracks.get(tok.edge);
      if (!track) { track = sampleTrack(path); v.tracks.set(tok.edge, track); }
      const len = track.len;
      g.removeAttribute('display');
      g.setAttribute('data-kind', tok.kind);
      const parts = g.children;
      const head = pointAt(track, ease(tok.progress) * len);
      place(parts[3], head.x, head.y);
      TRAIL.forEach((lag, k) => {
        const pt = pointAt(track, ease(Math.max(0, tok.progress - lag)) * len);
        place(parts[k], pt.x, pt.y);
      });
      const label = parts[4] as SVGTextElement;
      const text = tok.label ?? '';
      if (label.textContent !== text) label.textContent = text;
      if (!text) return;
      // Put the label beside the token, perpendicular to its direction of travel, on whichever side clears the
      // static labels; hide it for the frames where no side is clear.
      v.obstacles ??= textObstacles(v.svg);
      const back = pointAt(track, Math.max(0, ease(tok.progress) * len - 6));
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
        label.setAttribute('x', String(anchor === 'middle' ? cx : anchor === 'start' ? cx - 4 : cx + 4)); label.setAttribute('y', String(cy + 3.5));
        placed = true;
        break;
      }
      if (placed) label.removeAttribute('display'); else label.setAttribute('display', 'none');
    });
  }

  /** A comet: three trail dots and a head, each a solid core over a pre-rendered radial-gradient glow (no live filter:
   *  a moving drop-shadow would re-run its blur on every frame), plus a label. */
  private makeToken(v: View): SVGGElement {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'token');
    const glowFill = v.glow ? `url(#${v.glow})` : 'none';
    const dot = (cls: string) => {
      const d = document.createElementNS(NS, 'g'); d.setAttribute('class', cls);
      for (const part of ['glow', 'core']) {
        const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', part);
        if (part === 'glow') c.setAttribute('fill', glowFill);
        d.appendChild(c);
      }
      g.appendChild(d);
    };
    dot('trail'); dot('trail'); dot('trail'); dot('head');
    const text = document.createElementNS(NS, 'text'); text.setAttribute('text-anchor', 'middle'); g.appendChild(text);
    v.layer.appendChild(g);
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
    this.querySelectorAll<HTMLElement>(`ol.fp-captions[data-scenario="${this.tl.id}"] button`).forEach(b => {
      const li = b.parentElement!;
      if (b.dataset.stepIndex === String(f.stepIndex)) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
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
