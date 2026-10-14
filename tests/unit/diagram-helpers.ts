import { glyphCentre, glyphReach } from '../../src/lib/diagram/layout';
import type { NodeKind } from '../../src/lib/diagram/types';

type Box = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

/** First and last points of an SVG path made of M/L/Q/C commands. */
export const first = (d: string): Pt => { const m = /^M(-?[\d.]+),(-?[\d.]+)/.exec(d)!; return { x: +m[1], y: +m[2] }; };
export const last = (d: string): Pt => { const m = /(-?[\d.]+),(-?[\d.]+)$/.exec(d)!; return { x: +m[1], y: +m[2] }; };

/**
 * An edge end is attached to its node when it lies within `tol` px of the glyph boundary (the reach circle:
 * glyph radius plus the small gap), or, for ends that run under the node label, on the box bottom below it.
 */
export function attached(kind: NodeKind, box: Box, p: Pt, tol = 2): boolean {
  const g = glyphCentre(box);
  if (Math.abs(Math.hypot(p.x - g.x, p.y - g.y) - glyphReach(kind)) <= tol) return true;
  return Math.abs(p.y - (box.y + box.h)) <= tol && Math.abs(p.x - g.x) <= box.w / 2;
}
