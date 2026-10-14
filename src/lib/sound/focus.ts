/**
 * Which diagram may make sound. Only one at a time:
 * - while a map tile (atlas page or home map) is under the pointer or holds keyboard focus, only the player inside it;
 * - otherwise only full (non-compact) players: the main player on a pattern page, the hero on the home page.
 * Compact players elsewhere (map tiles merely playing in view, family-page thumbnails) stay silent.
 */
export function isSoundFocus(player: Element, activeTile: Element | null): boolean {
  return activeTile ? activeTile.contains(player) : !player.hasAttribute('compact');
}

/** The map tile an event target sits in, if any. */
export const tileOf = (t: EventTarget | null): Element | null => (t instanceof Element ? t.closest('.atlas-tile') : null);
