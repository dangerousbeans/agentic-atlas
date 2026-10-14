import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('index has 6 family sections and 21 pattern cards', async ({ page }) => {
  await page.goto('/families/');
  await expect(page.locator('h1')).toHaveText('Families of agentic patterns');
  await expect(page.locator('section.family-section')).toHaveCount(6);
  await expect(page.locator('a.pattern-card')).toHaveCount(21);
  await expect(page.locator('flow-player[compact]')).toHaveCount(21);
});

test('header Families link points at /families/ and is current', async ({ page }) => {
  await page.goto('/families/');
  const link = page.locator('header nav a', { hasText: 'Families' });
  await expect(link).toHaveAttribute('href', /\/families\/$/);
  await expect(link).toHaveAttribute('aria-current', 'page');
});

test('family page shows a compact diagram per pattern', async ({ page }) => {
  await page.goto('/families/workflows/');
  await expect(page.locator('h1')).toHaveText('Workflows');
  await expect(page.locator('flow-player[compact]')).toHaveCount(6);
  await expect(page.locator('a.pattern-card')).toHaveCount(6);
  await expect(page.locator('.other a')).toHaveCount(5);
  await expect(page.locator('.constellation')).toHaveCount(0);
});

test('card link is named by its h3 and navigates', async ({ page }) => {
  await page.goto('/families/workflows/');
  const first = page.locator('a.pattern-card').first();
  await expect(first.locator('h3')).toHaveText('Prompt Chaining');
  await expect(first).toHaveAccessibleName(/Prompt Chaining/);
  await first.click();
  await expect(page).toHaveURL(/\/patterns\/prompt-chaining\/$/);
});

test('cards are readable and linked without JS', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/families/');
  await expect(page.locator('a.pattern-card')).toHaveCount(21);
  await expect(page.locator('a.pattern-card h3').first()).toBeVisible();
  await expect(page.locator('a.pattern-card .stats').first()).toContainText('nodes');
  await ctx.close();
});

for (const path of ['/families/', '/families/multi-agent/']) {
  test(`no horizontal overflow at 360px: ${path}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(path);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
    await ctx.close();
  });
  test(`axe clean: ${path}`, async ({ page }) => {
    await page.goto(path);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations).toEqual([]);
  });
}
