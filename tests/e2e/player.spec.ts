import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { KIND_LABEL } from '../../src/lib/diagram/kinds';
import type { NodeKind } from '../../src/lib/diagram/types';
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

test('an edge tooltip is hoverable and does not chase the pointer', async ({ page }) => {
  await page.goto(url);
  const pt = await page.locator('svg[data-layout="wide"] path.edge-hit[data-hit="revise"]').evaluate((p: SVGPathElement) => {
    const m = p.getPointAtLength(p.getTotalLength() / 2), c = p.getScreenCTM()!;
    return { x: m.x * c.a + c.e, y: m.y * c.d + c.f };
  });
  await page.mouse.move(pt.x, pt.y);
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toContainText('Evaluator → Generator');
  await page.waitForTimeout(300);
  // Record, after the player has handled each pointermove (window, bubble phase), whether the pointer is still over the
  // edge's hit path and where the tooltip sits; and catch any moment the tooltip closes.
  await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>('.fp-tip')!;
    const w = window as unknown as { __rec: { onEdge: boolean; on: boolean; x: number; y: number; title: string }[]; __closed: boolean };
    w.__rec = []; w.__closed = false;
    new MutationObserver(() => { if (!t.classList.contains('is-on')) w.__closed = true; }).observe(t, { attributes: true, attributeFilter: ['class'] });
    addEventListener('pointermove', e => {
      const r = t.getBoundingClientRect();
      const under = document.elementsFromPoint(e.clientX, e.clientY).some(el => el.getAttribute('data-hit') === 'revise');
      w.__rec.push({ onEdge: under, on: t.classList.contains('is-on'), x: r.left, y: r.top, title: t.querySelector('.fp-tip-t')!.textContent ?? '' });
    });
  });
  const before = (await tip(page).boundingBox())!;
  const target = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  // Travel straight at the tooltip like a person would: small steps (about 1.5px each), not a few long jumps.
  const steps = Math.ceil(Math.hypot(target.x - pt.x, target.y - pt.y) / 1.5);
  await page.mouse.move(target.x, target.y, { steps });
  await page.waitForTimeout(400);
  await expect(tip(page)).toBeVisible();
  const { rec, closed } = await page.evaluate(() => { const w = window as unknown as { __rec: { onEdge: boolean; on: boolean; x: number; y: number; title: string }[]; __closed: boolean }; return { rec: w.__rec, closed: w.__closed }; });
  expect(rec.length).toBeGreaterThan(5);
  expect(closed, 'the tooltip closed while the pointer travelled to it').toBe(false);
  expect(rec.every(r => r.on && r.title === 'Evaluator → Generator')).toBe(true);
  const left = rec.findIndex(r => !r.onEdge);
  expect(left, 'the pointer left the edge on its way').toBeGreaterThan(-1);
  for (const r of rec.slice(left)) {
    expect(Math.abs(r.x - rec[left].x)).toBeLessThan(0.5);
    expect(Math.abs(r.y - rec[left].y)).toBeLessThan(0.5);
  }
  // The pointer ends on the tooltip, which is still there and still put.
  const after = (await tip(page).boundingBox())!;
  expect(target.x).toBeGreaterThanOrEqual(after.x); expect(target.x).toBeLessThanOrEqual(after.x + after.width);
  expect(target.y).toBeGreaterThanOrEqual(after.y); expect(target.y).toBeLessThanOrEqual(after.y + after.height);
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.fp-tip'), target)).toBe(true);
});

test('re-inserting the player clears stale hover state and does not pile up listeners', async ({ page }) => {
  // Count scroll listeners added to the diagram stage, across the first connect and every reconnect.
  await page.addInitScript(() => {
    const w = window as unknown as { __stageScroll: number };
    w.__stageScroll = 0;
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest: unknown[]) {
      if (type === 'scroll' && this instanceof Element && this.classList.contains('diagram-stage')) w.__stageScroll++;
      return (add as (...a: unknown[]) => void).call(this, type, ...rest);
    } as typeof add;
  });
  await page.goto(url);
  const fp = fpOf(page);
  await expect(fp).toHaveAttribute('data-playing', 'true');
  const count = () => page.evaluate(() => (window as unknown as { __stageScroll: number }).__stageScroll);
  const initial = await count();
  expect(initial).toBeGreaterThan(0);
  await node(page, 'evaluator').hover();
  await expect(fp).toHaveAttribute('data-playing', 'false');
  const reinsert = () => page.evaluate(() => { const el = document.querySelector('flow-player')!; const parent = el.parentElement!, next = el.nextSibling; el.remove(); parent.insertBefore(el, next); });
  await reinsert();
  await page.mouse.move(0, 0);
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await expect(tip(page)).toBeHidden();
  for (let i = 0; i < 3; i++) await reinsert();
  expect(await count()).toBe(initial);
  await expect(fp).toHaveAttribute('data-playing', 'true');
});

test.describe('short viewport', () => {
  test.use({ viewport: { width: 1280, height: 420 } });
  test('tabbing through tree-of-thoughts nodes shows each focused node its tooltip, even when focus scrolls the page', async ({ page }) => {
    await page.goto('/patterns/tree-of-thoughts/');
    const fp = fpOf(page);
    // Start just before the player, then tab into it.
    await page.evaluate(() => {
      const first = document.querySelector<SVGGElement>('flow-player svg.diagram-svg g.node[tabindex="0"]');
      const all = [...document.querySelectorAll<HTMLElement | SVGElement>('a[href], button, [tabindex]')].filter(e => (e as HTMLElement).tabIndex >= 0);
      const prev = all[all.indexOf(first!) - 1] as HTMLElement; prev.focus();
    });
    let seen = 0;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => { const a = document.activeElement; return a?.matches('flow-player g.node') ? (a as SVGGElement).dataset.tipT ?? null : null; });
      if (id === null) { if (seen) break; continue; }
      seen++;
      await page.waitForTimeout(150); // let any focus-induced scroll fire
      await expect(tip(page), `tooltip for ${id}`).toBeVisible();
      await expect(tip(page).locator('.fp-tip-t')).toHaveText(id);
      const box = (await tip(page).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(420);
    }
    expect(seen).toBeGreaterThan(3);
    await expect(fp).toHaveAttribute('data-playing', 'false');
  });
});

test('scenario tabs control labelled panels', async ({ page }) => {
  await page.goto(url);
  const tab = page.locator('.fp-tabs [role="tab"]').first();
  const panel = page.locator(`#${await tab.getAttribute('aria-controls')}`);
  await expect(panel).toHaveAttribute('role', 'tabpanel');
  await expect(panel).toHaveAttribute('aria-labelledby', (await tab.getAttribute('id'))!);
});

test('only the selected scenario shows its step list, before and after a tab pick', async ({ page }) => {
  await page.goto(url);
  const lists = page.locator('.fp-scenario-steps');
  await expect(lists.nth(0)).toBeVisible();
  await expect(lists.nth(1)).toBeHidden();
  await page.locator('.fp-tabs [role="tab"]').nth(1).click();
  await expect(lists.nth(0)).toBeHidden();
  await expect(lists.nth(1)).toBeVisible();
});

// Every node now has a YAML description; the kind fallback itself is unit-tested in tests/unit/kinds.test.ts.
test('node tooltip shows the pattern-specific description and kind chip', async ({ page }) => {
  const yaml = parse(readFileSync('src/content/patterns/orchestrator-workers/pattern.yaml', 'utf8'));
  const spec = yaml.diagram.nodes.find((n: { id: string }) => n.id === 'orchestrator') as { kind: NodeKind; description: string };
  expect(spec.description).toBeTruthy();
  await page.goto('/patterns/orchestrator-workers/');
  await node(page, 'orchestrator').hover();
  await expect(tip(page)).toBeVisible();
  await expect(tip(page).locator('.fp-tip-d')).toHaveText(spec.description);
  await expect(tip(page).locator('.fp-tip-k')).toHaveText(KIND_LABEL[spec.kind]);
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
