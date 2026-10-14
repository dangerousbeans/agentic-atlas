/**
 * Which diagram layout to show, and how large. Node labels are 10.5px in SVG units (diagram.css), so a layout
 * drawn below MIN_LABEL_SCALE renders them under 9px and stops being readable. Kept free of ELK so the player
 * can import it.
 */
export const MIN_LABEL_SCALE = 0.86;
/** Layouts never draw larger than this (a small diagram stays a diagram, not a poster). */
export const MAX_SCALE = 1.25;
/** Empty margin around a wide layout's drawing, in SVG units (layout.ts). It may scroll out of view. */
export const WIDE_PAD = 28;
/** Content width of the diagram stage on a 390px phone. */
export const PHONE_STAGE = 330;
/**
 * Content widths of the pattern page's diagram stage at the 1280px max page width: beside the info column
 * (two-column instrument) and spanning the page (single column, no side padding). See pages/patterns/[slug].astro.
 */
const STAGE_SPLIT = 648;
const STAGE_FULL = 1130;

export interface FitBox { width: number; height: number; maxHeight: number }

/** Scale a `width: 100%; height: auto` SVG of viewBox w x h draws at, in a box `avail` wide with a max-height. */
export const drawnScale = (avail: number, b: FitBox) => Math.min(avail / b.width, b.maxHeight / b.height);

/**
 * Does the wide layout read at this stage width? Either it fits at a readable scale, or held at that scale
 * (CSS min-width) only its empty margin overflows, which the stage scrolls past.
 */
export const wideReads = (avail: number, wide: FitBox) =>
  wide.maxHeight / wide.height >= MIN_LABEL_SCALE && (drawnScale(avail, wide) >= MIN_LABEL_SCALE || (wide.width - 2 * WIDE_PAD) * MIN_LABEL_SCALE <= avail);

/** The wide layout when it reads at this width, otherwise the narrow one (which scrolls rather than shrink). */
export const pickLayout = (avail: number, wide: FitBox): 'wide' | 'narrow' => (wideReads(avail, wide) ? 'wide' : 'narrow');

/**
 * Pattern pages give the full width to diagrams whose wide layout is too wide to read beside the info column but
 * reads once it spans the page. Wider still, the narrow layout is used anyway, and that sits better beside the
 * info column.
 */
export const spansPage = (wideWidth: number) => {
  const box = { width: wideWidth, height: 1, maxHeight: Infinity };
  return !wideReads(STAGE_SPLIT, box) && wideReads(STAGE_FULL, box);
};
