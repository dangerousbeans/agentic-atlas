/**
 * Pure, deterministic layout for the home-page atlas map (addendum §2.1).
 *
 * Families become rectangular "islands" on a loose grid (row-major by rank,
 * odd columns staggered down so the map reads as a scatter, not a table).
 * Inside each island, pattern tiles are packed on a square grid; a short last
 * row is centred. All units are plane pixels at zoom 1.
 */
export const TILE_W = 220;
export const TILE_H = 170;
export const TILE_GAP = 20;
const PAD_X = 28;
const PAD_TOP = 56; // room for the island label
const PAD_BOTTOM = 28;
const GUTTER_X = 120;
const GUTTER_Y = 60; // minimum vertical gap between islands, stagger included
const STAGGER = 90;
const MARGIN = 160;

export interface Rect { x: number; y: number; w: number; h: number }
export interface AtlasFamily { slug: string; name: string; rank: number; patterns: string[] }
export interface IslandBox extends Rect { slug: string; name: string }
/** `x`/`y` are absolute plane coordinates; `rx`/`ry` are relative to the tile's island. */
export interface TileBox extends Rect { slug: string; family: string; rx: number; ry: number }
export interface AtlasLayout { width: number; height: number; islands: IslandBox[]; tiles: TileBox[] }

const span = (n: number, size: number) => n * size + Math.max(0, n - 1) * TILE_GAP;

export function atlasLayout(input: AtlasFamily[]): AtlasLayout {
  const fams = [...input].sort((a, b) => a.rank - b.rank || a.slug.localeCompare(b.slug));
  const shapes = fams.map(f => {
    const n = f.patterns.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    return { f, n, cols, rows, w: 2 * PAD_X + span(cols, TILE_W), h: PAD_TOP + span(rows, TILE_H) + PAD_BOTTOM };
  });

  const gridCols = Math.max(1, Math.min(fams.length, Math.ceil(Math.sqrt(fams.length * 1.5))));
  const gridRows = Math.ceil(fams.length / gridCols);
  const colW = Array.from({ length: gridCols }, (_, c) => Math.max(0, ...shapes.filter((_, i) => i % gridCols === c).map(s => s.w)));
  // A row is as tall as its tallest island *including* the stagger of odd columns, so a staggered
  // island never reaches into the next row (the gap is always at least GUTTER_Y).
  const rowH = Array.from({ length: gridRows }, (_, r) => Math.max(0, ...shapes.map((s, i) => [s, i] as const).filter(([, i]) => Math.floor(i / gridCols) === r).map(([s, i]) => s.h + (i % gridCols % 2 ? STAGGER : 0))));
  const colX = colW.map((_, c) => MARGIN + colW.slice(0, c).reduce((a, w) => a + w + GUTTER_X, 0));
  const rowY = rowH.map((_, r) => MARGIN + rowH.slice(0, r).reduce((a, h) => a + h + GUTTER_Y, 0));

  const islands: IslandBox[] = [];
  const tiles: TileBox[] = [];
  shapes.forEach((s, i) => {
    const c = i % gridCols, r = Math.floor(i / gridCols);
    const x = colX[c] + Math.round((colW[c] - s.w) / 2);
    const y = rowY[r] + (c % 2 ? STAGGER : 0);
    islands.push({ slug: s.f.slug, name: s.f.name, x, y, w: s.w, h: s.h });
    s.f.patterns.forEach((slug, k) => {
      const row = Math.floor(k / s.cols), col = k % s.cols;
      const inRow = Math.min(s.cols, s.n - row * s.cols);
      const shift = ((s.cols - inRow) * (TILE_W + TILE_GAP)) / 2;
      const rx = PAD_X + shift + col * (TILE_W + TILE_GAP);
      const ry = PAD_TOP + row * (TILE_H + TILE_GAP);
      tiles.push({ slug, family: s.f.slug, x: x + rx, y: y + ry, w: TILE_W, h: TILE_H, rx, ry });
    });
  });

  const width = Math.max(...islands.map(b => b.x + b.w), 0) + MARGIN;
  const height = Math.max(...islands.map(b => b.y + b.h), 0) + MARGIN;
  return { width, height, islands, tiles };
}
