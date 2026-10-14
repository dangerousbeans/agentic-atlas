import { test, expect } from '@playwright/test';

test.describe('static diagram (no JS)', () => {
  test.use({ javaScriptEnabled: false });
  test('renders nodes, edges and the captions list', async ({ page }) => {
    await page.goto('/patterns/evaluator-optimizer/');
    const wide = page.locator('svg.diagram-svg[data-layout="wide"]');
    await expect(wide).toBeVisible();
    await expect(wide.locator('g.node')).toHaveCount(4);
    await expect(wide.locator('path.edge')).toHaveCount(4);
    await expect(page.locator('ol.fp-captions').first().locator('li')).toHaveCount(4); // start, round#1, round#2, pass
    await expect(page.locator('.fp-controls')).toBeHidden();
  });
  test('hidden workers are present but invisible before playback', async ({ page }) => {
    await page.goto('/patterns/orchestrator-workers/');
    await expect(page.locator('svg[data-layout="wide"] g.node[data-node="w1"]')).toHaveAttribute('data-state', 'hidden');
  });
});
