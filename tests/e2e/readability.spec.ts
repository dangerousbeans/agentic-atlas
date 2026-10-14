// Readability gate: node labels in the visible diagram must render at a legible size.
// Effective size = SVG scale (rendered width / viewBox width) x computed font-size.
import { test, expect, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';

const slugs = readdirSync('src/content/patterns').sort();
const MIN_PX = 9;
const MIN_PX_SCROLLING = 8; // phones only: a stage that scrolls sideways may go a little smaller

interface Reading { layout: string; px: number; scrolls: boolean; visible: number }

/** The smallest effective node-label size across the visible SVGs of the first full player on the page. */
async function measure(page: Page, scope = 'flow-player:not([compact])'): Promise<Reading> {
  return page.evaluate(sel => {
    const fp = document.querySelector(sel)!;
    const svgs = [...fp.querySelectorAll<SVGSVGElement>('svg.diagram-svg')].filter(s => s.getBoundingClientRect().width > 0);
    let px = Infinity, layout = '';
    for (const svg of svgs) {
      // preserveAspectRatio "meet": a max-height can letterbox the drawing inside a wider box, so take the smaller axis.
      const box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      const scale = Math.min(box.width / vb.width, box.height / vb.height);
      for (const t of svg.querySelectorAll<SVGTextElement>('.node .label')) {
        const v = scale * parseFloat(getComputedStyle(t).fontSize);
        if (v < px) { px = v; layout = svg.dataset.layout ?? ''; }
      }
    }
    const stage = fp.querySelector<HTMLElement>('.diagram-stage')!;
    return { layout, px: Math.round(px * 100) / 100, scrolls: stage.scrollWidth - stage.clientWidth > 1, visible: svgs.length };
  }, scope);
}

for (const width of [1280, 1440, 390]) {
  test.describe(`label size at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const slug of slugs) {
      test(slug, async ({ page }) => {
        await page.goto(`/patterns/${slug}/`);
        await expect(page.locator('flow-player').first()).toHaveClass(/is-enhanced/);
        await page.waitForTimeout(100); // one ResizeObserver round
        const r = await measure(page);
        test.info().annotations.push({ type: 'label-px', description: `${slug}@${width} ${r.layout} ${r.px}px${r.scrolls ? ' (scrolls)' : ''}` });
        expect(r.visible, 'exactly one diagram layout is visible').toBe(1);
        const min = width < 700 && r.scrolls ? MIN_PX_SCROLLING : MIN_PX;
        expect(r.px, `${slug} node labels at ${width}px (${r.layout} layout)`).toBeGreaterThanOrEqual(min);
      });
    }
  });
}

// Desktop only: on phones the hero sits above the headline, so it stays a short teaser (the pattern page reads).
for (const width of [1440, 1280]) {
  test(`home hero label size at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('[data-hero] flow-player')).toHaveClass(/is-enhanced/);
    await page.waitForTimeout(100);
    const r = await measure(page, '[data-hero] flow-player');
    test.info().annotations.push({ type: 'label-px', description: `hero@${width} ${r.layout} ${r.px}px` });
    expect(r.visible).toBe(1);
    expect(r.px).toBeGreaterThanOrEqual(MIN_PX);
  });
}
