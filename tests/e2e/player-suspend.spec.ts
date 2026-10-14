import { test, expect } from '@playwright/test';

// flow-player's one external hook: `data-suspended` pauses playback while present (used by the atlas map's zoom threshold).
test('data-suspended pauses a visible player and removing it resumes', async ({ page }) => {
  await page.goto('/patterns/evaluator-optimizer/');
  const fp = page.locator('flow-player').first();
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await fp.evaluate(el => el.setAttribute('data-suspended', ''));
  await expect(fp).toHaveAttribute('data-playing', 'false');
  const idx = await fp.getAttribute('data-step-index');
  await page.waitForTimeout(700);
  await expect(fp).toHaveAttribute('data-step-index', idx!);
  await fp.evaluate(el => el.removeAttribute('data-suspended'));
  await expect(fp).toHaveAttribute('data-playing', 'true');
});

test('a player that starts suspended never plays', async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver(() => document.querySelectorAll('flow-player:not([data-suspended])').forEach(el => el.setAttribute('data-suspended', '')))
      .observe(document, { childList: true, subtree: true });
  });
  await page.goto('/patterns/evaluator-optimizer/');
  const fp = page.locator('flow-player').first();
  await expect(fp).toHaveClass(/is-enhanced/);
  await page.waitForTimeout(500);
  await expect(fp).toHaveAttribute('data-playing', 'false');
});
