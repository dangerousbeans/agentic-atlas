import { describe, it, expect } from 'vitest';
import { pickLayout, spansPage, drawnScale } from '../../src/lib/diagram/fit';

const box = (width: number, height = 300, maxHeight = Infinity) => ({ width, height, maxHeight });

describe('layout fit', () => {
  it('drawn scale is limited by width and by max-height', () => {
    expect(drawnScale(500, box(1000))).toBe(0.5);
    expect(drawnScale(1000, box(500, 400, 200))).toBe(0.5);
  });
  it('keeps the wide layout while its labels read (scale >= 0.86)', () => {
    expect(pickLayout(700, box(800))).toBe('wide'); // 0.875
    expect(pickLayout(660, box(1100))).toBe('narrow'); // 0.6
  });
  it('keeps the wide layout when only its empty margin would overflow', () => {
    // 1357 wide: 0.836 at 1134px, but its drawing (1357 - 56) fits at 0.86
    expect(pickLayout(1134, box(1357))).toBe('wide');
    expect(pickLayout(1134, box(1606))).toBe('narrow');
  });
  it('a max-height that squeezes the drawing below a readable scale means narrow', () => {
    expect(pickLayout(2000, box(600, 500, 300))).toBe('narrow');
  });
  it('spans the page only for diagrams too wide for the split stage that read full width', () => {
    expect(spansPage(692)).toBe(false); // reads beside the info column
    expect(spansPage(1108)).toBe(true);
    expect(spansPage(1357)).toBe(true);
    expect(spansPage(1606)).toBe(false); // narrow anyway: keep it beside the info column
  });
});
