import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { catalogOrder, visibleFamilies } from '../catalog-fixture';

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
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`The atlas · ${catalogOrder().length} patterns · ${visibleFamilies().length} families`);
    const header = (await page.locator('header.site-header').boundingBox())!;
    const v = (await page.locator('.atlas-viewport').boundingBox())!;
    expect(v.height).toBeGreaterThanOrEqual(900 - header.height - 120);
  });

  for (const [w, h] of [[390, 844], [320, 640]]) {
    test(`the map ends within the window at ${w}px, with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      await expect.poll(async () => (await page.locator('.atlas-viewport').boundingBox())!.height).toBeGreaterThan(300);
      const v = (await page.locator('.atlas-viewport').boundingBox())!;
      expect(v.y + v.height).toBeLessThanOrEqual(h + 1);
      expect(await page.evaluate(() => scrollX)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

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

  test('without JS the pattern links are a plain list', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(test.info().project.use.baseURL! + '/atlas/');
    await expect(tiles(page)).toHaveCount(catalogOrder().length);
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
  test('JSON-LD names the author, and og:site_name is set', async ({ page }) => {
    await page.goto('/');
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(ld['@type']).toBe('WebSite');
    expect(ld.author).toMatchObject({ '@type': 'Person', name: 'Joran Kikke', url: 'https://github.com/dangerousbeans' });
    expect(ld.author.sameAs).toContain('https://github.com/dangerousbeans');
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'Agentic Atlas');
  });
  test('home hero byline and About "Made by" link to GitHub', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.byline')).toContainText('An atlas by Joran Kikke');
    await expect(page.locator('.byline a')).toHaveAttribute('href', 'https://github.com/dangerousbeans');
    await page.goto('/about/');
    const made = page.locator('h2', { hasText: 'Made by' }).locator('+ p');
    await expect(made).toContainText('Built by Joran Kikke.');
    await expect(made.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/dangerousbeans');
    await expect(made.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://github.com/dangerousbeans/agentic-atlas');
  });
  test('pattern pages link their yaml source', async ({ page }) => {
    await page.goto('/patterns/routing/');
    await expect(page.getByRole('link', { name: 'Edit on GitHub' })).toHaveAttribute('href', /\/blob\/main\/src\/content\/patterns\/routing\/pattern\.yaml$/);
  });
});
