import { joinBase } from '../../lib/url';

/** A random slug from the list, never the current one. `rnd` is injectable for tests. */
export function pickRandom(slugs: string[], current: string, rnd: () => number = Math.random): string | undefined {
  const others = slugs.filter(s => s !== current);
  return others.length ? others[Math.min(others.length - 1, Math.floor(rnd() * others.length))] : undefined;
}

/** Targets whose arrow keys and letters belong to something else. */
const OWNED = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .fp-tabs, .fp-captions, [role="tablist"]';

/**
 * True when a page shortcut must not fire for this event. This includes Esc inside the diagram's step list and
 * scenario tabs: those widgets own the keyboard there, so Esc does not leave the page from them.
 */
export function shouldIgnore(e: KeyboardEvent, doc: Document = document): boolean {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return true;
  if (doc.querySelector('dialog[open]')) return true;
  const t = e.target instanceof Element ? e.target : doc.activeElement;
  return !!t?.closest(OWNED);
}

function init() {
  const nav = document.querySelector<HTMLElement>('[data-pattern-nav]');
  if (!nav) return;
  const slugs: string[] = JSON.parse(nav.querySelector('script[data-slugs]')!.textContent!);
  const current = nav.dataset.current!;
  const go = (url: string) => location.assign(url);
  const randomUrl = () => {
    const s = pickRandom(slugs, current);
    return s ? joinBase(import.meta.env.BASE_URL, `patterns/${s}/`) : undefined;
  };
  const randomLink = nav.querySelector<HTMLAnchorElement>('[data-nav="random"]');
  const refresh = () => { const u = randomUrl(); if (u && randomLink) randomLink.href = u; };
  refresh();
  randomLink?.addEventListener('click', refresh);
  const atlas = nav.querySelector<HTMLAnchorElement>('a.back')!.href;

  // Capture phase: an open spec or diagram tooltip takes Esc before it can leave the page.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || shouldIgnore(e)) return;
    const open = [...document.querySelectorAll<HTMLElement>('.spec-row:not([data-dismissed])')].filter(r => r.matches(':hover, :focus-visible'));
    if (open.length || document.querySelector('.fp-tip.is-on')) {
      open.forEach(r => r.setAttribute('data-dismissed', ''));
      return;
    }
    go(atlas);
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' || shouldIgnore(e)) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const a = nav.querySelector<HTMLAnchorElement>(`[data-nav="${e.key === 'ArrowLeft' ? 'prev' : 'next'}"]`);
      if (a?.href) { e.preventDefault(); go(a.href); }
    } else if (e.key === 'r' || e.key === 'R') {
      const u = randomUrl();
      if (u) { e.preventDefault(); go(u); }
    }
  });

  for (const r of document.querySelectorAll<HTMLElement>('.spec-row'))
    for (const ev of ['pointerleave', 'blur']) r.addEventListener(ev, () => r.removeAttribute('data-dismissed'));
}

if (typeof document !== 'undefined') init();
