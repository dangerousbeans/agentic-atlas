import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

const pages: { name: string; path: string; status?: number; width?: number }[] = [
  { name: 'home', path: '/' },
  // Phones start the map zoomed out, where tile text is faded; the tile links must keep their names.
  { name: 'home at 390px', path: '/', width: 390 },
  { name: 'families index', path: '/families/' },
  { name: 'family page', path: '/families/workflows/' },
  { name: 'pattern: evaluator-optimizer', path: '/patterns/evaluator-optimizer/' },
  { name: 'pattern: supervisor', path: '/patterns/supervisor/' },
  { name: 'about', path: '/about/' },
  { name: '404', path: '/no-such-page/', status: 404 },
];

const summarise = (violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) =>
  violations.map(v => `${v.id} (${v.impact}): ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`);

async function settle(page: Page) {
  // Let custom elements upgrade and the first animation frame land, so axe sees the enhanced DOM.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

for (const { name, path, status = 200, width } of pages) {
  test(`axe: ${name} (${path})`, async ({ page }) => {
    if (width) await page.setViewportSize({ width, height: 860 });
    const res = await page.goto(path);
    expect(res?.status()).toBe(status);
    await settle(page);
    const wcag = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    // heading-order is a best-practice rule, so it is not part of the WCAG tags; run it explicitly.
    const headings = await new AxeBuilder({ page }).withRules(['heading-order']).analyze();
    expect(summarise([...wcag.violations, ...headings.violations])).toEqual([]);
  });
}
