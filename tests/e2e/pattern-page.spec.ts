import { test, expect } from '@playwright/test';
const url = '/patterns/evaluator-optimizer/';

test('has all sections in order', async ({ page }) => {
  await page.goto(url);
  const heads = await page.locator('article h2').allTextContents();
  expect(heads).toEqual(['Problem', 'How it works', 'When to use', 'When to avoid', 'Trade-offs', 'Failure modes', 'Related patterns', 'Sources']);
  await expect(page.locator('.badges')).toContainText('Autonomy');
  await expect(page.locator('.badge').first()).toHaveAttribute('data-tip', /control flow/);
  await expect(page.locator('a[href*="arxiv.org/abs/2303.17651"]')).toBeVisible();
});

test.describe('code panel sync', () => {
  test.use({ reducedMotion: 'reduce' });
  const stepLines = async (page: import('@playwright/test').Page) =>
    page.locator('[data-code-block="loop"] .ec-line').evaluateAll(ls => ls.flatMap((l, i) => (l.classList.contains('is-step') ? [i + 1] : [])));

  test('highlights the initial step on load and follows step changes', async ({ page }) => {
    await page.goto(url);
    const fp = page.locator('flow-player').first();
    await expect(fp).toHaveAttribute('data-step-index', '0');
    await expect.poll(() => stepLines(page)).toEqual([1, 2, 3]);
    await page.locator('ol.fp-captions button[data-step-index="1"]').first().click();
    await expect(fp).toHaveAttribute('data-step-index', '1');
    await expect.poll(() => stepLines(page)).toEqual([4, 5, 6, 7, 8]);
  });
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

test('focusing a NodeRef highlights the node and survives mouseleave', async ({ page }) => {
  await page.goto(url);
  const ref = page.locator('.noderef[data-noderef="generator"]').first();
  const node = page.locator('svg[data-layout="wide"] g.node[data-node="generator"]');
  await ref.focus();
  await expect(node).toHaveClass(/is-ref/);
  await ref.hover();
  await page.mouse.move(0, 0);
  await expect(node).toHaveClass(/is-ref/);
  await ref.blur();
  await expect(node).not.toHaveClass(/is-ref/);
});

test.describe('no JS', () => {
  test.use({ javaScriptEnabled: false });
  test('dead tab buttons are hidden', async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('[role="tablist"]:visible')).toHaveCount(0);
    await expect(page.locator('[data-code-block="generator"]')).toBeVisible();
  });
});

test('badge tooltips: hover shows, Escape dismisses', async ({ page }) => {
  await page.goto(url);
  const badge = page.locator('.badge').first();
  const shown = () => badge.evaluate(el => getComputedStyle(el, '::after').display);
  await badge.hover();
  expect(await shown()).toBe('block');
  await page.keyboard.press('Escape');
  expect(await shown()).toBe('none');
  await page.mouse.move(0, 0);
  await badge.hover();
  expect(await shown()).toBe('block');
});

test.describe('360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('no horizontal overflow, even with a badge tooltip open', async ({ page }) => {
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await page.locator('.badge').last().hover();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
