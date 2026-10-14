/**
 * Atlas map behaviour: DOM transforms only (no canvas, no libraries).
 *
 * - Mouse/pen: drag pans; the wheel zooms around the cursor (and lets the page scroll at the zoom limits).
 * - Touch is cooperative (touch-action: pan-y): one finger scrolls the page (a hint says to use two),
 *   two fingers pan and pinch the map.
 * - flyTo() animates centre + log-zoom; instant under reduced motion.
 * - Roving tabindex: the map is one tab stop. ←/→ walk tiles in DOM order (family, then pattern),
 *   ↑/↓ move to the nearest tile above/below, Home/End jump, Enter follows the link, +/− zoom, 0 resets.
 *   Any keyboard-focused tile is flown into the safe area (the viewport minus the overlay controls),
 *   so focus is never stranded off-screen or hidden under a control (WCAG 2.4.11). Pointer focus never flies.
 * - Search dims non-matches and frames the matches; Enter flies to and focuses the first.
 * - Playback: below MIN_PLAY zoom every tile player gets `data-suspended`; off-screen tiles are
 *   paused by flow-player's own IntersectionObserver (the viewport clips its overflow).
 */
const MIN_PLAY = 0.6;
const FAR = 0.3; // below this, island labels centre over their clusters
const MAX_Z = 2;
const FOCUS_Z = 1;
const FLY_MS = 480;
const EDGE = 24;

const root = document.querySelector<HTMLElement>('.atlas-map');
if (root) init(root);

function init(root: HTMLElement) {
  const $ = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  const vp = $<HTMLElement>('.atlas-viewport');
  const plane = $<HTMLElement>('.atlas-plane');
  const search = $<HTMLInputElement>('.atlas-search');
  const status = $<HTMLElement>('.atlas-status');
  const mm = $<SVGSVGElement>('.atlas-minimap');
  const mmView = mm.querySelector<SVGRectElement>('.mm-view')!;
  const hint = $<HTMLElement>('.atlas-touch-hint');
  const overlaysTop = [search, $<HTMLElement>('[data-somewhere]')];
  const overlaysBottom = [$<HTMLElement>('.atlas-zoom'), mm as unknown as HTMLElement];
  const tiles = [...root.querySelectorAll<HTMLAnchorElement>('a.atlas-tile')];
  const islands = [...root.querySelectorAll<HTMLElement>('.atlas-island')];
  const players = [...plane.querySelectorAll<HTMLElement>('flow-player')];
  const [, , W, H] = mm.getAttribute('viewBox')!.split(' ').map(Number);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cx = (t: HTMLElement) => +t.dataset.cx!;
  const cy = (t: HTMLElement) => +t.dataset.cy!;

  let vw = 0, vh = 0, z = 1, x = 0, y = 0, homeZ = 1, minZ = 0.1;
  let anim = 0, touched = false, suspended: boolean | null = null;
  let roving = tiles[0];

  root.setAttribute('data-enhanced', '');
  tiles.forEach(t => (t.tabIndex = t === roving ? 0 : -1));

  // ---- transform -------------------------------------------------------
  const clampZ = (v: number) => Math.min(MAX_Z, Math.max(minZ, v));
  function apply(nz: number, nx: number, ny: number) {
    z = clampZ(nz);
    // Keep at least half the viewport over the plane.
    x = Math.min(vw / 2, Math.max(vw / 2 - W * z, nx));
    y = Math.min(vh / 2, Math.max(vh / 2 - H * z, ny));
    plane.style.transform = `translate(${x}px,${y}px) scale(${z})`;
    plane.style.setProperty('--z', String(z));
    vp.dataset.zoom = z.toFixed(3);
    vp.style.backgroundSize = `${120 * z}px ${120 * z}px`;
    vp.style.backgroundPosition = `${x - z}px ${y - z}px`;
    root.toggleAttribute('data-far', z < FAR);
    const s = z < MIN_PLAY;
    if (s !== suspended) { suspended = s; players.forEach(p => p.toggleAttribute('data-suspended', s)); }
    mmView.setAttribute('x', String(-x / z)); mmView.setAttribute('y', String(-y / z));
    mmView.setAttribute('width', String(vw / z)); mmView.setAttribute('height', String(vh / z));
  }
  /** Transform that puts plane point (px, py) at the viewport centre at zoom nz. */
  const at = (px: number, py: number, nz: number): [number, number, number] => { nz = clampZ(nz); return [nz, vw / 2 - px * nz, vh / 2 - py * nz]; };
  const homeView = () => at(W / 2, H / 2, homeZ);
  /** The part of the viewport not covered by the overlay controls, in viewport-local px. */
  const safe = () => {
    const v = vp.getBoundingClientRect();
    const t = Math.max(0, ...overlaysTop.map(el => el.getBoundingClientRect().bottom - v.top)) + EDGE / 2;
    const b = Math.min(vh, ...overlaysBottom.map(el => el.getBoundingClientRect().top - v.top)) - EDGE / 2;
    return { l: EDGE / 2, r: vw - EDGE / 2, t, b: Math.max(t + 1, b) };
  };
  /** Like at(), but centres the point in the safe area. */
  const atSafe = (px: number, py: number, nz: number): [number, number, number] => {
    const S = safe(); nz = clampZ(nz);
    return [nz, (S.l + S.r) / 2 - px * nz, (S.t + S.b) / 2 - py * nz];
  };

  function flyTo([tz, tx, ty]: [number, number, number]) {
    cancelAnimationFrame(anim);
    if (reduced) { apply(tz, tx, ty); return; }
    tz = clampZ(tz);
    const c0 = [(vw / 2 - x) / z, (vh / 2 - y) / z], c1 = [(vw / 2 - tx) / tz, (vh / 2 - ty) / tz];
    const z0 = Math.log(z), z1 = Math.log(tz), t0 = performance.now();
    plane.classList.add('is-flying');
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / FLY_MS), e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      apply(...at(c0[0] + (c1[0] - c0[0]) * e, c0[1] + (c1[1] - c0[1]) * e, Math.exp(z0 + (z1 - z0) * e)));
      if (p < 1) anim = requestAnimationFrame(step); else plane.classList.remove('is-flying');
    };
    anim = requestAnimationFrame(step);
  }
  const stop = () => { cancelAnimationFrame(anim); plane.classList.remove('is-flying'); };
  /** Zoom by factor keeping viewport point (px, py) fixed. */
  const zoomed = (f: number, px = vw / 2, py = vh / 2): [number, number, number] => {
    const nz = clampZ(z * f);
    return [nz, px - ((px - x) * nz) / z, py - ((py - y) * nz) / z];
  };
  const focusZ = () => { const S = safe(); return Math.min(FOCUS_Z, (S.r - S.l) / 240, (S.b - S.t) / 190); };
  const tileView = (t: HTMLElement, nz: number) => atSafe(cx(t), cy(t), nz);
  const inView = (t: HTMLElement) => {
    const r = t.getBoundingClientRect(), v = vp.getBoundingClientRect(), S = safe();
    return r.left >= v.left + S.l && r.right <= v.left + S.r && r.top >= v.top + S.t && r.bottom <= v.top + S.b;
  };

  function measure() {
    vw = vp.clientWidth; vh = vp.clientHeight;
    homeZ = Math.min(vw / W, vh / H);
    minZ = homeZ * 0.75;
    if (!touched) apply(...homeView()); else apply(z, x, y);
  }
  new ResizeObserver(measure).observe(vp);
  // Focus can scroll an overflow:hidden box natively; the transform owns position, so undo it.
  vp.addEventListener('scroll', () => { vp.scrollLeft = 0; vp.scrollTop = 0; });

  // ---- focus & keyboard ------------------------------------------------
  function setRoving(t: HTMLAnchorElement) { roving.tabIndex = -1; roving = t; t.tabIndex = 0; }
  function go(t: HTMLAnchorElement | undefined) { if (!t) return; setRoving(t); t.focus({ preventScroll: true }); }
  vp.addEventListener('focusin', e => {
    const t = (e.target as Element).closest<HTMLAnchorElement>('a.atlas-tile');
    if (!t) return;
    setRoving(t);
    if (ptr) return; // mouse/touch focus (Chrome focuses links on mousedown): never fly, a drag may follow
    touched = true;
    if (z < MIN_PLAY) flyTo(tileView(t, focusZ())); else if (!inView(t)) flyTo(tileView(t, z));
  });
  vp.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const cur = (e.target as Element).closest<HTMLAnchorElement>('a.atlas-tile');
    const i = cur ? tiles.indexOf(cur) : -1;
    const k = e.key;
    let next: HTMLAnchorElement | undefined;
    if (k === 'ArrowRight') next = tiles[Math.min(tiles.length - 1, i + 1)];
    else if (k === 'ArrowLeft') next = tiles[Math.max(0, i - 1)];
    else if (k === 'Home') next = tiles[0];
    else if (k === 'End') next = tiles[tiles.length - 1];
    else if ((k === 'ArrowDown' || k === 'ArrowUp') && cur) {
      const dir = k === 'ArrowDown' ? 1 : -1;
      let best = Infinity;
      for (const t of tiles) {
        const dy = (cy(t) - cy(cur)) * dir, dx = Math.abs(cx(t) - cx(cur));
        if (dy > 20 && dy + 2 * dx < best) { best = dy + 2 * dx; next = t; }
      }
      next ??= cur;
    } else if (k === '+' || k === '=' || k === '-' || k === '0') {
      e.preventDefault(); touched = true;
      if (k === '0') return flyTo(homeView());
      const f = k === '-' ? 1 / 1.4 : 1.4;
      return flyTo(cur ? atSafe(cx(cur), cy(cur), z * f) : zoomed(f));
    } else return;
    e.preventDefault();
    go(next);
  });

  // ---- pointer: drag, pinch, wheel -------------------------------------
  const pts = new Map<number, { x: number; y: number }>();
  let drag: { sx: number; sy: number; ox: number; oy: number; moved: boolean; id: number; touch: boolean } | null = null;
  let pinch: { d: number; z: number; px: number; py: number } | null = null;
  let swallowClick = false, ptr = false, hintTimer = 0;
  const showHint = () => {
    hint.setAttribute('data-show', '');
    clearTimeout(hintTimer); hintTimer = window.setTimeout(() => hint.removeAttribute('data-show'), 1500);
  };
  // Two-finger gestures belong to the map: stop the browser from scrolling the page with them.
  const twoFinger = (e: TouchEvent) => { if (e.touches.length >= 2) e.preventDefault(); };
  vp.addEventListener('touchstart', twoFinger, { passive: false });
  vp.addEventListener('touchmove', twoFinger, { passive: false });
  const local = (e: PointerEvent | WheelEvent) => { const r = vp.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  vp.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptr = true;
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) {
      const p = local(e);
      // Touch: one finger never pans (the page scrolls instead); it only tracks movement for the hint.
      drag = { sx: p.x, sy: p.y, ox: x, oy: y, moved: false, id: e.pointerId, touch: e.pointerType === 'touch' };
    } else if (pts.size === 2) {
      stop(); touched = true;
      const s = pinchState();
      pinch = { d: s.d, z, px: (s.mx - x) / z, py: (s.my - y) / z };
      for (const id of pts.keys()) if (!vp.hasPointerCapture(id)) vp.setPointerCapture(id);
      if (drag) drag.moved = true;
    }
  });
  vp.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pinch && pts.size >= 2) {
      const s = pinchState(), nz = clampZ(pinch.z * (s.d / pinch.d));
      apply(nz, s.mx - pinch.px * nz, s.my - pinch.py * nz);
    } else if (drag && e.pointerId === drag.id) {
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      if (drag.touch) { if (Math.hypot(dx, dy) > 10) showHint(); return; }
      if (!drag.moved && Math.hypot(dx, dy) > 5) {
        // A real drag: cancel any flight and re-base on where the map is now.
        stop(); touched = true;
        drag.moved = true; drag.ox = x; drag.oy = y;
        vp.setPointerCapture(e.pointerId); vp.classList.add('is-dragging');
      }
      if (drag.moved) apply(z, drag.ox + dx, drag.oy + dy);
    }
  });
  // `ptr` marks "focus came from a pointer" and must never stick (it would block keyboard focus flights).
  const clearPtr = () => setTimeout(() => (ptr = false), 0);
  const end = (e: PointerEvent) => {
    clearPtr();
    if (!pts.delete(e.pointerId)) return;
    if (pinch) swallowClick = true;
    if (pts.size < 2) pinch = null;
    if (drag?.moved) swallowClick = true;
    if (pts.size === 0) { drag = null; vp.classList.remove('is-dragging'); setTimeout(() => (swallowClick = false), 0); }
    // After a pinch, the remaining finger neither pans nor shows the hint.
    else if (pts.size === 1) {
      const [[id, p]] = [...pts];
      drag = e.pointerType === 'touch' ? null : { sx: p.x, sy: p.y, ox: x, oy: y, moved: true, id, touch: false };
    }
  };
  // On window, so a release outside the map (without capture) still ends the gesture.
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
  addEventListener('blur', () => { pts.clear(); drag = null; pinch = null; vp.classList.remove('is-dragging'); clearPtr(); });
  vp.addEventListener('lostpointercapture', clearPtr);
  vp.addEventListener('click', e => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } }, true);
  vp.addEventListener('dragstart', e => e.preventDefault());
  vp.addEventListener('wheel', e => {
    const p = local(e), d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1);
    const f = Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0015));
    // At a zoom limit, let a plain wheel scroll the page. ctrl+wheel (trackpad pinch) is always ours,
    // or the browser would zoom the whole page.
    if (!e.ctrlKey && ((f > 1 && z >= MAX_Z - 1e-6) || (f < 1 && z <= minZ + 1e-6))) return;
    e.preventDefault(); stop(); touched = true;
    apply(...zoomed(f, p.x, p.y));
  }, { passive: false });

  // ---- controls ----------------------------------------------------------
  root.querySelectorAll<HTMLButtonElement>('[data-zoom-btn]').forEach(b => b.addEventListener('click', () => {
    touched = true;
    const k = b.dataset.zoomBtn;
    flyTo(k === 'home' ? homeView() : zoomed(k === 'in' ? 1.4 : 1 / 1.4));
  }));

  let spot: HTMLElement | undefined, spotTimer = 0;
  $('[data-somewhere]').addEventListener('click', () => {
    const pool = tiles.filter(t => t !== spot && !t.hasAttribute('data-dim'));
    const t = (pool.length ? pool : tiles)[Math.floor(Math.random() * (pool.length || tiles.length))];
    touched = true;
    spot?.removeAttribute('data-spot');
    spot = t; t.setAttribute('data-spot', '');
    clearTimeout(spotTimer); spotTimer = window.setTimeout(() => t.removeAttribute('data-spot'), 2400);
    setRoving(t);
    flyTo(tileView(t, focusZ()));
  });

  mm.addEventListener('click', e => {
    const r = mm.getBoundingClientRect();
    touched = true;
    flyTo(at(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, z));
  });

  // ---- search ------------------------------------------------------------
  let matches: HTMLAnchorElement[] = [], frameTimer = 0, hadQuery = false;
  function frame(list: HTMLElement[]) {
    const xs = list.map(cx), ys = list.map(cy);
    const x0 = Math.min(...xs) - 150, x1 = Math.max(...xs) + 150, y0 = Math.min(...ys) - 125, y1 = Math.max(...ys) + 125;
    const S = safe();
    flyTo(atSafe((x0 + x1) / 2, (y0 + y1) / 2, Math.min(focusZ(), (S.r - S.l) / (x1 - x0), (S.b - S.t) / (y1 - y0))));
  }
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    clearTimeout(frameTimer);
    matches = q ? tiles.filter(t => t.dataset.q!.includes(q)) : [];
    tiles.forEach(t => t.toggleAttribute('data-dim', !!q && !matches.includes(t)));
    islands.forEach(s => s.toggleAttribute('data-dim', !!q && !matches.some(t => s.contains(t))));
    status.textContent = q ? (matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'No match') : '';
    if (matches.length) { touched = true; frameTimer = window.setTimeout(() => frame(matches), 280); }
    else if (!q && hadQuery) flyTo(homeView()); // clearing the search returns the view home
    hadQuery = !!q;
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; search.dispatchEvent(new Event('input')); }
    if (e.key !== 'Enter' || !matches.length) return;
    e.preventDefault();
    clearTimeout(frameTimer);
    const t = matches[0];
    go(t);
    flyTo(tileView(t, focusZ()));
  });
}
