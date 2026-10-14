import { test, expect, type Page } from '@playwright/test';
const url = '/patterns/evaluator-optimizer/';
const fpOf = (page: Page) => page.locator('flow-player').first();
const node = (page: Page, id: string) => page.locator(`svg[data-layout="wide"] g.node[data-node="${id}"]`);
const tip = (page: Page) => page.locator('.fp-tip').first();

test('video controls are gone', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('.fp-controls, [data-action], input[data-scrub], select[data-speed], .fp-counter')).toHaveCount(0);
});

test('autoplays when visible and advances steps', async ({ page }) => {
  await page.goto(url);
  const fp = fpOf(page);
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await expect(fp).toHaveAttribute('data-step-index', '1', { timeout: 4000 });
});

test('hovering the stage pauses, leaving resumes', async ({ page }) => {
  await page.goto(url);
  const fp = fpOf(page);
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await page.locator('.diagram-stage').first().hover({ position: { x: 4, y: 4 } });
  await expect(fp).toHaveAttribute('data-playing', 'false');
  const idx = await fp.getAttribute('data-step-index');
  await page.waitForTimeout(700);
  await expect(fp).toHaveAttribute('data-step-index', idx!);
  await page.mouse.move(0, 0);
  await expect(fp).toHaveAttribute('data-playing', 'true');
});

test('focus inside the player pauses until it blurs', async ({ page }) => {
  await page.goto(url);
  const fp = fpOf(page);
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await page.locator('ol.fp-captions button').first().focus(); // no pointer use yet, so :focus-visible applies
  await expect(fp).toHaveAttribute('data-playing', 'false');
  await page.locator('ol.fp-captions button').first().blur();
  await expect(fp).toHaveAttribute('data-playing', 'true');
});

test('clicking a step button jumps there and mirrors the code ref', async ({ page }) => {
  await page.goto(url);
  const fp = fpOf(page);
  const list = page.locator('.fp-scenario-steps[data-scenario="fails-twice"]');
  await list.locator('button[data-step-index="2"]').click();
  await expect(fp).toHaveAttribute('data-step-index', '2');
  await expect(fp).toHaveAttribute('data-playing', 'false');
  await expect(page.locator('.fp-caption')).toContainText('The generator drafts');
  await expect(list.locator('li[aria-current="step"] button')).toHaveAttribute('data-step-index', '2');
  await expect(fp).toHaveAttribute('data-code-ref', 'loop:4-8');
  await list.locator('button[data-step-index="0"]').click();
  await expect(fp).toHaveAttribute('data-step-index', '0');
  await expect(fp).toHaveAttribute('data-code-ref', 'loop:1-3');
});

test('after a step jump, moving the pointer out resumes play', async ({ page }) => {
  await page.goto(url);
  const fp = fpOf(page);
  await page.locator('.fp-scenario-steps[data-scenario="fails-twice"] button[data-step-index="1"]').click();
  await expect(fp).toHaveAttribute('data-playing', 'false');
  await page.mouse.move(0, 0);
  await expect(fp).toHaveAttribute('data-playing', 'true');
});

test('jumping to the last step parks its end state', async ({ page }) => {
  await page.goto(url);
  await page.locator('.fp-scenario-steps[data-scenario="fails-twice"] button[data-step-index="3"]').click();
  await expect(fpOf(page)).toHaveAttribute('data-step-index', '3');
  await expect(node(page, 'output')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('svg[data-layout="wide"] path.edge[data-edge="accept"]')).toHaveAttribute('data-state', 'active'); // token parked at the end of the edge
  await page.mouse.move(0, 0);
  await expect(fpOf(page)).toHaveAttribute('data-playing', 'true');
});

test('jumping back restores hidden workers', async ({ page }) => {
  await page.goto('/patterns/orchestrator-workers/');
  const list = page.locator('ol.fp-captions').first();
  const last = await list.locator('button').count() - 1;
  await list.locator(`button[data-step-index="${last}"]`).click();
  await expect(node(page, 'w1')).not.toHaveAttribute('data-state', 'hidden');
  await list.locator('button[data-step-index="0"]').click();
  await expect(node(page, 'w1')).toHaveAttribute('data-state', 'hidden');
});

test('scenario tabs switch the captions list', async ({ page }) => {
  await page.goto(url);
  const tabs = page.locator('.fp-tabs').getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(page.locator('.fp-scenario-steps[data-scenario="passes-first-time"]')).toBeVisible();
  await expect(page.locator('.fp-scenario-steps[data-scenario="fails-twice"]')).toBeHidden();
  await tabs.nth(0).click();
  await expect(page.locator('.fp-scenario-steps[data-scenario="fails-twice"]')).toBeVisible();
});

test('node hover shows a tooltip with label, kind and description; leaving hides it', async ({ page }) => {
  await page.goto(url);
  await node(page, 'evaluator').hover();
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toHaveAttribute('role', 'tooltip');
  await expect(tip(page)).toContainText('Evaluator');
  await expect(tip(page)).toContainText('Judges each draft against the criteria');
  await expect(node(page, 'evaluator')).toHaveClass(/is-hover/);
  const box = await tip(page).boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  await page.mouse.move(0, 0);
  await expect(tip(page)).toBeHidden();
});

test('Escape dismisses a hover tooltip even though focus is outside the player', async ({ page }) => {
  await page.goto(url);
  await node(page, 'evaluator').hover();
  await expect(tip(page)).toBeVisible();
  await expect(page.locator('flow-player :focus')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(tip(page)).toBeHidden();
});

test('the tooltip is hoverable: the pointer can move onto it without it closing', async ({ page }) => {
  await page.goto(url);
  await node(page, 'output').locator('.shape').hover();
  await expect(tip(page)).toBeVisible();
  const box = (await tip(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.waitForTimeout(400);
  await expect(tip(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tip(page)).toBeHidden();
});

test('re-inserting the player clears stale hover state', async ({ page }) => {
  await page.goto(url);
  const fp = fpOf(page);
  await node(page, 'evaluator').hover();
  await expect(fp).toHaveAttribute('data-playing', 'false');
  await page.evaluate(() => { const el = document.querySelector('flow-player')!; const parent = el.parentElement!, next = el.nextSibling; el.remove(); parent.insertBefore(el, next); });
  await page.mouse.move(0, 0);
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await expect(tip(page)).toBeHidden();
});

test('scenario tabs control labelled panels', async ({ page }) => {
  await page.goto(url);
  const tab = page.locator('.fp-tabs [role="tab"]').first();
  const panel = page.locator(`#${await tab.getAttribute('aria-controls')}`);
  await expect(panel).toHaveAttribute('role', 'tabpanel');
  await expect(panel).toHaveAttribute('aria-labelledby', (await tab.getAttribute('id'))!);
});

test('kind fallback text appears when a node has no description', async ({ page }) => {
  await page.goto('/patterns/orchestrator-workers/');
  const n = page.locator('svg[data-layout="wide"] g.node[data-kind="llm"]').first();
  await n.hover();
  await expect(tip(page)).toContainText('A single LLM call with a specific prompt.');
  await expect(tip(page)).toContainText('LLM call');
});

test('focusing a node by keyboard shows the tooltip', async ({ page }) => {
  await page.goto(url);
  await node(page, 'generator').focus();
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toContainText('Generator');
  await expect(tip(page)).toContainText('Writes the first draft');
  await expect(node(page, 'generator')).toHaveAttribute('aria-label', /Generator\. Writes the first draft/);
  await page.keyboard.press('Escape');
  await expect(tip(page)).toBeHidden();
});

test('hovering an edge shows From → To, label, description and example', async ({ page }) => {
  await page.goto(url);
  // Hover the real midpoint of the path (the bounding-box centre can miss a curved edge).
  const pt = await page.locator('svg[data-layout="wide"] path.edge-hit[data-hit="revise"]').evaluate((p: SVGPathElement) => {
    const m = p.getPointAtLength(p.getTotalLength() / 2), c = p.getScreenCTM()!;
    return { x: m.x * c.a + c.e, y: m.y * c.d + c.f };
  });
  await page.mouse.move(pt.x, pt.y);
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toContainText('→');
  await expect(tip(page)).toContainText('Evaluator → Generator');
  await expect(tip(page)).toContainText('revise');
  await expect(tip(page)).toContainText("The evaluator's critique goes back");
  await expect(tip(page)).toContainText('{"passed": false, "critique": "Claim 2 has no citation; tone too casual for a board memo."}');
  await expect(page.locator('svg[data-layout="wide"] path.edge[data-edge="revise"]')).toHaveClass(/is-hover/);
});

test('parts list covers every node and edge', async ({ page }) => {
  await page.goto(url);
  const parts = page.locator('details.fp-parts');
  await parts.locator('summary').click();
  await expect(parts.locator('dt')).toHaveCount(8);
  await expect(parts).toContainText('Evaluator → Generator');
  await expect(parts).toContainText('Claim 2 has no citation');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('does not autoplay, and step buttons still jump', async ({ page }) => {
    await page.goto(url);
    const fp = fpOf(page);
    await page.waitForTimeout(1500);
    await expect(fp).toHaveAttribute('data-playing', 'false');
    await expect(fp).toHaveAttribute('data-step-index', '0');
    await page.locator('ol.fp-captions button[data-step-index="1"]').first().click();
    await expect(fp).toHaveAttribute('data-step-index', '1');
    await expect(fp).toHaveAttribute('data-playing', 'false');
  });
});

test.describe('no JS', () => {
  test.use({ javaScriptEnabled: false });
  test('the parts list is present with node and edge text', async ({ page }) => {
    await page.goto(url);
    const parts = page.locator('details.fp-parts');
    await expect(parts).toHaveCount(1);
    await expect(parts.locator('dt')).toHaveCount(8);
    await expect(parts).toContainText('Judges each draft against the criteria');
  });
});
