import { joinBase } from '../../lib/url';

/**
 * "Another": fetch another pattern page, lift its full flow-player out of the
 * parsed document and drop it into the hero stage. The custom element upgrades
 * on connect, so the swapped player is fully live (tooltips, autoplay); the old
 * one disconnects and removes its own global listeners. Fetch failure → navigate.
 * Also wires every [data-random-pattern] link to a random pattern page.
 */
interface Item { slug: string; name: string; stats: string }
const BASE = import.meta.env.BASE_URL;
const root = document.querySelector<HTMLElement>('[data-hero]');
const list: Item[] = JSON.parse(root?.querySelector('script[data-hero-list]')?.textContent || '[]');
const pageOf = (slug: string) => joinBase(BASE, `patterns/${slug}/`);
const pick = (not?: string) => { const xs = list.filter(i => i.slug !== not); return xs[Math.floor(Math.random() * xs.length)]; };

document.querySelectorAll<HTMLAnchorElement>('a[data-random-pattern]').forEach(a => a.addEventListener('click', e => {
  if (!list.length || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  location.href = pageOf(pick(root?.dataset.slug).slug);
}));

if (root && list.length > 1) {
  const $ = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  const stage = $<HTMLElement>('.hero-stage');
  const btn = $<HTMLButtonElement>('[data-another]');
  let busy = false;
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    const next = pick(root.dataset.slug);
    const url = pageOf(next.slug);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const fp = doc.querySelector('flow-player:not([compact])');
      if (!fp) throw new Error('no player');
      const el = document.adoptNode(fp);
      const old = stage.querySelector('flow-player');
      if (old) old.replaceWith(el); else stage.append(el);
      root.dataset.slug = next.slug;
      $('.hero-name').textContent = next.name;
      $('.hero-stats').textContent = next.stats;
      $<HTMLAnchorElement>('.hero-open').href = url;
    } catch {
      location.href = url;
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
    }
  });
}
