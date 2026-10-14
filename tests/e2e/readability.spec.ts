// Readability gate: node labels in the visible diagram must render at a legible size.
// Effective size = SVG scale (rendered width / viewBox width) x computed font-size.
import { test, expect, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';

const slugs = readdirSync('src/content/patterns').sort();
const MIN_PX = 9; // everywhere, phones included

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

/** The player has measured its stage and picked a layout (flow-player sets data-fit). */
const fitted = (page: Page, scope = 'flow-player:not([compact])') => expect(page.locator(`${scope}[data-fit]`).first()).toBeAttached();

for (const width of [1440, 1280, 1024, 390]) {
  test.describe(`label size at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const slug of slugs) {
      test(slug, async ({ page }) => {
        await page.goto(`/patterns/${slug}/`);
        await fitted(page);
        const r = await measure(page);
        test.info().annotations.push({ type: 'label-px', description: `${slug}@${width} ${r.layout} ${r.px}px${r.scrolls ? ' (scrolls)' : ''}` });
        expect(r.visible, 'exactly one diagram layout is visible').toBe(1);
        expect(r.px, `${slug} node labels at ${width}px (${r.layout} layout)`).toBeGreaterThanOrEqual(MIN_PX);
        if (width >= 961) {
          // The instrument only spans the page for a wide layout: a narrow (tall) layout keeps the info column beside
          // it instead of floating alone in a full-width stage.
          const g = await page.evaluate(() => {
            const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
            const stage = r('.instrument .stage'), info = r('.instrument .info');
            return { side: info.left >= stage.right - 1, above: info.bottom <= stage.top + 1 };
          });
          if (r.layout === 'narrow') expect(g.side, `${slug}: narrow layout sits beside the info column`).toBe(true);
          else expect(g.side || g.above, `${slug}: wide layout beside the info column or below its band`).toBe(true);
        }
      });
    }
  });
}

for (const width of [1440, 1280]) {
  test(`home hero label size at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await fitted(page, '[data-hero] flow-player');
    const r = await measure(page, '[data-hero] flow-player');
    test.info().annotations.push({ type: 'label-px', description: `hero@${width} ${r.layout} ${r.px}px` });
    expect(r.visible).toBe(1);
    expect(r.px).toBeGreaterThanOrEqual(MIN_PX);
  });
}

// Phones: the hero sits above the headline, too short for 9px labels, so by design it is a text-free thumbnail
// (HeroStage.astro); the pattern page, one tap away, reads in full. Assert that no diagram text is drawn at all.
test('home hero on a phone is a text-free thumbnail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await fitted(page, '[data-hero] flow-player');
  const shown = await page.locator('[data-hero] svg.diagram-svg text').evaluateAll(ts =>
    ts.filter(t => getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().width > 0).map(t => t.textContent));
  expect(shown).toEqual([]);
  await expect(page.locator('[data-hero] svg.diagram-svg:visible')).toHaveCount(1);
});

// Far out on a phone, island labels wrap to their island's width; none may take more than two lines.
test('atlas island labels wrap onto at most two lines on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.atlas-map[data-far]')).toBeAttached();
  const lines = await page.locator('.atlas-island-label').evaluateAll(ls => ls.map(l => {
    // the family name is the label's text node(s) before the count; count its distinct line boxes
    const range = document.createRange();
    const name = [...l.childNodes].filter(n => n.nodeType === Node.TEXT_NODE);
    range.setStartBefore(name[0]); range.setEndAfter(name[name.length - 1]);
    return { name: l.textContent, n: new Set([...range.getClientRects()].map(r => Math.round(r.top))).size };
  }));
  expect(lines).toHaveLength(6);
  for (const l of lines) expect(l.n, l.name!).toBeLessThanOrEqual(2);
});
