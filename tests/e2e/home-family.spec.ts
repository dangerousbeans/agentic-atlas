import { test, expect } from '@playwright/test';

// Home-page tests live in home.spec.ts; this file keeps the family-page tests (R6 owns that page).

test('family page shows a compact diagram per pattern', async ({ page }) => {
  await page.goto('/families/workflows/');
  await expect(page.locator('h1')).toHaveText('Workflows');
  await expect(page.locator('flow-player[compact]')).toHaveCount(6);
  await page.locator('.pattern-strip a').first().click();
  await expect(page).toHaveURL(/\/patterns\/prompt-chaining\/$/);
});
