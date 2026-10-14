import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const tiles = (page: Page) => page.locator('a.atlas-tile');
const focusedSlug = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.slug ?? null);

async function open(page: Page) {
  await page.goto('/atlas/');
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-enhanced', '');
}

test.describe('/atlas/', () => {
  test('the map fills the viewport below the header', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The atlas · 21 patterns · 6 families');
    const header = (await page.locator('header.site-header').boundingBox())!;
    const v = (await page.locator('.atlas-viewport').boundingBox())!;
    expect(v.height).toBeGreaterThanOrEqual(900 - header.height - 120);
  });

  test('is the active page in the header nav', async ({ page }) => {
    await open(page);
    await expect(page.locator('header nav a', { hasText: 'Atlas' })).toHaveAttribute('aria-current', 'page');
  });

  test('the arrow keys walk tiles and Enter opens one', async ({ page }) => {
    await open(page);
    await page.locator('[data-zoom-btn="home"]').focus();
    await page.keyboard.press('Tab');
    expect(await focusedSlug(page)).toBe('prompt-chaining');
    await page.keyboard.press('ArrowRight');
    expect(await focusedSlug(page)).toBe('routing');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/patterns\/routing\/$/);
  });

  test('has no horizontal overflow at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('axe clean', async ({ page }) => {
    await open(page);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    expect(r.violations).toEqual([]);
  });

  test('without JS the 21 pattern links are a plain list', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(test.info().project.use.baseURL! + '/atlas/');
    await expect(tiles(page)).toHaveCount(21);
    await ctx.close();
  });

  test('is not indexed by search', async ({ page }) => {
    await page.goto('/atlas/');
    await expect(page.locator('[data-pagefind-body]')).toHaveCount(0);
  });
});

test.describe('author credit', () => {
  for (const path of ['/', '/about/', '/patterns/routing/']) {
    test(`footer credit and head metadata on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('footer .credit')).toContainText('Made by Joran Kikke');
      await expect(page.locator('footer').getByRole('link', { name: 'Joran Kikke on GitHub' })).toHaveAttribute('href', 'https://github.com/dangerousbeans');
      await expect(page.locator('footer').getByRole('link', { name: 'Source', exact: true })).toHaveAttribute('href', 'https://github.com/dangerousbeans/agentic-atlas');
      await expect(page.locator('meta[name="author"]')).toHaveAttribute('content', 'Joran Kikke');
      await expect(page.locator('link[rel="me"]')).toHaveAttribute('href', 'https://github.com/dangerousbeans');
    });
  }
  test('pattern pages link their yaml source', async ({ page }) => {
    await page.goto('/patterns/routing/');
    await expect(page.getByRole('link', { name: 'Edit on GitHub' })).toHaveAttribute('href', /\/blob\/main\/src\/content\/patterns\/routing\/pattern\.yaml$/);
  });
});
