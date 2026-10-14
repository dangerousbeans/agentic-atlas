import { test, expect } from '@playwright/test';
const url = '/patterns/evaluator-optimizer/';

test('has all sections in order', async ({ page }) => {
  await page.goto(url);
  const heads = await page.locator('article h2').allTextContents();
  expect(heads).toEqual(['Problem', 'How it works', 'When to use', 'When to avoid', 'Trade-offs', 'Failure modes', 'Related patterns', 'Sources']);
  await expect(page.locator('.badges')).toContainText('Autonomy');
  await expect(page.locator('a[href*="arxiv.org/abs/2303.17651"]')).toBeVisible();
});

test('code panel highlights lines for the current step', async ({ page }) => {
  await page.goto(url);
  const fp = page.locator('flow-player').first();
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await expect(fp).toHaveAttribute('data-step-index', '1', { timeout: 4000 });
  await page.locator('[data-action="play"]').first().click();
  await page.locator('input[data-scrub]').fill('0');
  const lines = page.locator('[data-code-block="loop"] .ec-line');
  await expect(lines.nth(0)).toHaveClass(/is-step/);
  await expect(lines.nth(3)).not.toHaveClass(/is-step/);
});

test('prompt tab shows prompt templates', async ({ page }) => {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Prompts' }).click();
  await expect(page.locator('[data-code-block="generator"]')).toBeVisible();
  await expect(page.locator('[data-code-block="loop"]')).toBeHidden();
});

test('hovering a NodeRef highlights the diagram node', async ({ page }) => {
  await page.goto(url);
  await page.locator('.noderef[data-noderef="evaluator"]').first().hover();
  await expect(page.locator('svg[data-layout="wide"] g.node[data-node="evaluator"]')).toHaveClass(/is-ref/);
});

test('prev/next within family', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('nav.prevnext a[rel="prev"]')).toBeVisible();
});
