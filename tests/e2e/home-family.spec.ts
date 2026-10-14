import { test, expect } from '@playwright/test';

test('home lists all families and the start-here path', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#families .family-card')).toHaveCount(6);
  await expect(page.locator('.start-here a')).toHaveCount(5);
  await expect(page.locator('.constellation')).toBeVisible();
});

test('home constellation fallback links to patterns without JS', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('.constellation-svg a')).toHaveCount(21);
  await ctx.close();
});

test('reduced motion keeps the SVG constellation (no WebGL)', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(800);
  await expect(page.locator('.constellation')).not.toHaveClass(/is-gl/);
  await ctx.close();
});
