import { test, expect, type Page } from '@playwright/test';
const url = '/patterns/evaluator-optimizer/';
// Autoplay starts when the player scrolls into view; wait for it, then pause, so every test starts from a known state.
async function pause(page: Page) {
  const fp = page.locator('flow-player').first();
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await page.locator('[data-action="play"]').first().click();
  await expect(fp).toHaveAttribute('data-playing', 'false');
}

test('autoplays when visible and advances steps', async ({ page }) => {
  await page.goto(url);
  const fp = page.locator('flow-player').first();
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await expect(fp).toHaveAttribute('data-step-index', '1', { timeout: 4000 });
});

test('next/prev buttons step and pause', async ({ page }) => {
  await page.goto(url);
  const fp = page.locator('flow-player').first();
  await pause(page);
  await page.locator('input[data-scrub]').fill('0');
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(fp).toHaveAttribute('data-step-index', '1', { timeout: 3000 });
  await expect(fp).toHaveAttribute('data-playing', 'false', { timeout: 3000 });
  await page.getByRole('button', { name: 'Previous step' }).click();
  await expect(fp).toHaveAttribute('data-step-index', '0');
});

test('keyboard: space toggles, arrows step, End jumps to end (Review Focus 5)', async ({ page }) => {
  await page.goto(url);
  const fp = page.locator('flow-player').first();
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await page.locator('.diagram-stage').first().focus();
  await page.keyboard.press('Space');
  await expect(fp).toHaveAttribute('data-playing', 'false');
  await page.keyboard.press('End');
  await expect(fp).toHaveAttribute('data-step-index', '3');
  await expect(page.locator('svg[data-layout="wide"] g.node[data-node="output"]')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('svg[data-layout="wide"] path.edge[data-edge="accept"]')).toHaveAttribute('data-state', 'traversed');
  await page.keyboard.press('Home');
  await expect(fp).toHaveAttribute('data-step-index', '0');
});

test('arrow keys inside the speed select do not step the player', async ({ page }) => {
  await page.goto(url);
  const fp = page.locator('flow-player').first();
  await pause(page);
  const before = await fp.getAttribute('data-step-index');
  await page.locator('select[data-speed]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(fp).toHaveAttribute('data-step-index', before!);
});

test('scrubbing backwards restores hidden workers', async ({ page }) => {
  await page.goto('/patterns/orchestrator-workers/');
  await pause(page);
  await page.locator('input[data-scrub]').fill('1000');
  await expect(page.locator('svg[data-layout="wide"] g.node[data-node="w1"]')).not.toHaveAttribute('data-state', 'hidden');
  await page.locator('input[data-scrub]').fill('0');
  await expect(page.locator('svg[data-layout="wide"] g.node[data-node="w1"]')).toHaveAttribute('data-state', 'hidden');
});

test('caption is announced and the list marks the current step', async ({ page }) => {
  await page.goto(url);
  await pause(page);
  await page.locator('input[data-scrub]').fill('0');
  await expect(page.locator('.fp-caption')).toHaveText('The task arrives at the generator.');
  await expect(page.locator('ol.fp-captions li[aria-current="step"]').first()).toHaveAttribute('data-step-index', '0');
});

test('scenario switch swaps timeline and captions', async ({ page }) => {
  await page.goto(url);
  await page.locator('select[data-scenario]').selectOption({ index: 1 });
  await expect(page.locator('.fp-scenario-steps[data-scenario="passes-first-time"]')).toBeVisible();
  await expect(page.locator('.fp-scenario-steps[data-scenario="fails-twice"]')).toBeHidden();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('does not autoplay and shows no moving tokens', async ({ page }) => {
    await page.goto(url);
    const fp = page.locator('flow-player').first();
    await page.waitForTimeout(1500);
    await expect(fp).toHaveAttribute('data-playing', 'false');
    await expect(fp).toHaveAttribute('data-step-index', '0');
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(fp).toHaveAttribute('data-step-index', '1');
  });
});
