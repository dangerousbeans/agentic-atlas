// Screenshot sweep with overflow assertions. The images are reviewed by eye, not compared
// against baselines: they land in test-results/screens/<slug>-<width>.png.
import { test, expect, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';

const slugs = readdirSync('src/content/patterns').sort();
const dir = 'test-results/screens';
// A tall element screenshot scrolls the page, and the sticky header would be painted over it.
const unstick = '.site-header { position: static !important; }';

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'no horizontal page overflow').toBeLessThanOrEqual(0);
}

for (const width of [1280, 390]) {
  test.describe(`pattern diagrams at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const slug of slugs) {
      test(slug, async ({ page }) => {
        await page.goto(`/patterns/${slug}/`);
        const player = page.locator('flow-player').first();
        await expect(player).toHaveClass(/is-enhanced/);
        // Hover off the stage so no tooltip is open and hover-pause doesn't skew the frame.
        await page.mouse.move(2, 2);
        // Reach a mid-scenario state via the step buttons of the visible (first) scenario.
        const steps = player.locator('ol.fp-captions button[data-step-index]').locator('visible=true');
        const n = await steps.count();
        expect(n, 'the first scenario has step buttons').toBeGreaterThan(0);
        const mid = steps.nth(Math.floor((n - 1) / 2));
        const index = await mid.getAttribute('data-step-index');
        await mid.click();
        await expect(player).toHaveAttribute('data-step-index', index!);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(900); // let the step's transitions settle
        await expectNoHorizontalOverflow(page);
        await player.locator('.diagram-frame').scrollIntoViewIfNeeded();
        await player.locator('.diagram-frame').screenshot({ path: `${dir}/${slug}-${width}.png`, style: unstick });
      });
    }
  });
}

const sitePages = [
  { name: 'home', path: '/' },
  { name: 'families', path: '/families/' },
  { name: 'family-multi-agent', path: '/families/multi-agent/' },
];
for (const width of [1440, 390]) {
  test.describe(`site pages at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const { name, path } of sitePages) {
      test(name, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.mouse.move(2, 2);
        await page.waitForTimeout(600);
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: `${dir}/page-${name}-${width}.png`, fullPage: true });
      });
    }
  });
}
