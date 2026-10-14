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

test('the focused search input shows a visible focus indicator', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('dialog', { name: 'Search patterns' }).getByRole('searchbox');
  await expect(input).toBeFocused();
  const style = await input.evaluate(el => { const c = getComputedStyle(el); return { outline: c.outlineStyle === 'none' ? 'none' : c.outlineWidth, shadow: c.boxShadow }; });
  expect(style.outline !== 'none' || style.shadow !== 'none', JSON.stringify(style)).toBe(true);
  // the indicator is the accent red (#FF3B30)
  expect(style.shadow).toContain('rgb(255, 59, 48)');
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

test('Enter in the search box opens the first result', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Search patterns' });
  await dialog.getByRole('searchbox').fill('critique');
  await expect(dialog.locator('.results a').first()).toBeVisible({ timeout: 5000 });
  await dialog.getByRole('searchbox').press('Enter');
  await page.waitForURL(/\/(patterns|families)\//);
});

test('Enter with no results leaves the dialog open', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Search patterns' });
  await dialog.getByRole('searchbox').fill('zzzzqqqq');
  await expect(dialog.getByRole('status')).toHaveText('No matches.', { timeout: 5000 });
  await dialog.getByRole('searchbox').press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /close search/ }).click();
  await expect(dialog).toBeHidden();
});

test('family page is filterable by family', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Search patterns' });
  await dialog.getByRole('combobox', { name: 'Family' }).selectOption('Agent Loops');
  await dialog.getByRole('searchbox').fill('loops');
  await expect(dialog.locator('.results .fam').first()).toHaveText('Agent Loops', { timeout: 5000 });
});

test('Enter right after typing opens the result for the current query', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const box = page.getByRole('dialog', { name: 'Search patterns' }).getByRole('searchbox');
  await box.fill('critique');
  await expect(page.locator('.results a').first()).toBeVisible({ timeout: 5000 });
  await box.fill('debate');
  await box.press('Enter');
  await page.waitForURL(/debate/, { timeout: 5000 });
});
