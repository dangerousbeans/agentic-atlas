/**
 * Variant tabs on a pattern page (expansion addendum §2). Every variant is rendered on the server; blocks that belong
 * to some variants carry `data-for-variants="<id> <id>"`. This marks the ones for the active variant `data-on`, and CSS
 * under `[data-variants-enhanced]` hides the rest. Without JS nothing is hidden: the variants stack with headings.
 * `#variant-<id>` deep-links a tab. Inactive diagrams are suspended so only the visible one animates.
 */
const PREFIX = '#variant-';

/** The variant id a hash selects, if it names one of `ids`. */
export function variantFromHash(hash: string, ids: string[]): string | undefined {
  if (!hash.startsWith(PREFIX)) return undefined;
  let id: string;
  try { id = decodeURIComponent(hash.slice(PREFIX.length)); } catch { return undefined; } // a malformed %-escape
  return ids.includes(id) ? id : undefined;
}

function init() {
  const root = document.querySelector<HTMLElement>('[data-variants]');
  const list = root?.querySelector<HTMLElement>('[data-variant-tabs]');
  if (!root || !list) return;
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[data-variant-tab]')];
  const ids = tabs.map(t => t.dataset.variantTab!);
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-for-variants]')];
  const panes = [...root.querySelectorAll<HTMLElement>('[data-variant-pane]')];
  for (const p of panes) {
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', `vtab-${p.dataset.variantPane}`);
  }

  const select = (id: string, push: boolean) => {
    tabs.forEach(t => {
      const on = t.dataset.variantTab === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    for (const b of blocks) b.toggleAttribute('data-on', b.dataset.forVariants!.split(' ').includes(id));
    for (const p of panes) p.querySelector('flow-player')?.toggleAttribute('data-suspended', p.dataset.variantPane !== id);
    if (push) {
      const url = id === ids[0] ? location.pathname + location.search : PREFIX + id;
      history.replaceState(history.state, '', url);
    }
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(ids[i], true));
  });
  list.addEventListener('keydown', e => {
    const n = tabs.length, i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (j < 0 || i < 0) return;
    e.preventDefault();
    select(ids[j], true);
    tabs[j].focus();
  });
  // Any other hash (empty, unknown, or another anchor on the page) shows the default variant.
  addEventListener('hashchange', () => select(variantFromHash(location.hash, ids) ?? ids[0], false));

  list.hidden = false;
  root.setAttribute('data-variants-enhanced', '');
  const fromHash = variantFromHash(location.hash, ids);
  select(fromHash ?? ids[0], false);
  // `#variant-<id>` is also the id of that variant's no-JS heading. The browser may already have scrolled to it
  // before this ran; once enhanced, the heading is hidden and the page starts at the top with that tab selected.
  if (fromHash) scrollTo(0, 0);
}

if (typeof document !== 'undefined') init();
