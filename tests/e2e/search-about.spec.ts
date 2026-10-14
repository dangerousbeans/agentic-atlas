import { test, expect } from '@playwright/test';

test('cmd/ctrl+K opens search and finds a pattern', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Search patterns' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox').fill('critique');
  await expect(dialog.locator('.results a').first()).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator('.results')).toContainText('Evaluator-Optimizer');
});

test('search family filter narrows results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Search/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Search patterns' });
  await dialog.getByRole('combobox', { name: 'Family' }).selectOption('Multi-Agent');
  await dialog.getByRole('searchbox').fill('agent');
  await expect(dialog.locator('.results a').first()).toBeVisible({ timeout: 5000 });
  for (const t of await dialog.locator('.results .fam').allTextContents()) expect(t).toBe('Multi-Agent');
});

test('about page shows the legend for every node kind', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.locator('.legend-item')).toHaveCount(10);
});

test('404 page links home', async ({ page }) => {
  const res = await page.goto('/nope-not-here/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('link', { name: /atlas/i }).first()).toBeVisible();
});
