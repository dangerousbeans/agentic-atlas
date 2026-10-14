import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { patternStats } from '../../src/lib/pattern-stats';
const url = '/patterns/evaluator-optimizer/';

test('has all sections in order', async ({ page }) => {
  await page.goto(url);
  const heads = await page.locator('article h2').allTextContents();
  expect(heads).toEqual(['Measured over one run', 'Problem', 'How it works', 'When to use', 'When to avoid', 'Trade-offs', 'Failure modes', 'Related patterns', 'Sources']);
  await expect(page.locator('dl.spec')).toContainText('Autonomy');
  await expect(page.locator('.spec-row').filter({ hasText: 'Autonomy' })).toHaveAttribute('data-tip', /control flow/);
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

test('spec tooltips: hover shows, Escape dismisses without leaving the page', async ({ page }) => {
  await page.goto(url);
  const row = page.locator('.spec-row').first();
  const shown = () => row.evaluate(el => getComputedStyle(el, '::after').display);
  await row.hover();
  expect(await shown()).toBe('block');
  await page.keyboard.press('Escape');
  expect(await shown()).toBe('none');
  expect(new URL(page.url()).pathname).toBe(url);
  await page.mouse.move(0, 0);
  await row.hover();
  expect(await shown()).toBe('block');
});

// Catalog order: family rank, then family order. 21 patterns.
const order = ['prompt-chaining', 'routing', 'sectioning', 'voting', 'orchestrator-workers', 'evaluator-optimizer', 'augmented-llm', 'react', 'reflexion', 'plan-and-execute', 'rewoo', 'llm-compiler', 'tree-of-thoughts', 'agentic-rag', 'corrective-rag', 'hierarchical-memory', 'supervisor', 'handoffs', 'debate', 'human-in-the-loop', 'guardrails'];
const at = (slug: string) => `/patterns/${slug}/`;
const pathOf = (page: import('@playwright/test').Page) => new URL(page.url()).pathname;

test.describe('neighbour nav', () => {
  for (const slug of ['prompt-chaining', 'evaluator-optimizer', 'guardrails']) {
    test(`position and ends for ${slug}`, async ({ page }) => {
      await page.goto(at(slug));
      const i = order.indexOf(slug);
      await expect(page.locator('.pattern-nav .pos')).toHaveText(`${i + 1} of 21`);
      const prev = page.locator('[data-nav="prev"]'), next = page.locator('[data-nav="next"]');
      if (i === 0) { await expect(prev).toHaveAttribute('aria-disabled', 'true'); await expect(prev).not.toHaveAttribute('href', /.+/); }
      else await expect(prev).toHaveAttribute('href', new RegExp(`${order[i - 1]}/$`));
      if (i === 20) { await expect(next).toHaveAttribute('aria-disabled', 'true'); await expect(next).not.toHaveAttribute('href', /.+/); }
      else await expect(next).toHaveAttribute('href', new RegExp(`${order[i + 1]}/$`));
    });
  }
  test('back link goes to the atlas anchor', async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('.pattern-nav a.back')).toHaveAttribute('href', /\/#atlas$/);
  });
  test('random href without JS is next, or prev on the last page', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    const base = test.info().project.use.baseURL!;
    await page.goto(base + at('routing'));
    await expect(page.locator('[data-nav="random"]')).toHaveAttribute('href', /sectioning\/$/);
    await page.goto(base + at('guardrails'));
    await expect(page.locator('[data-nav="random"]')).toHaveAttribute('href', /human-in-the-loop\/$/);
    await ctx.close();
  });
});

test.describe('page shortcuts', () => {
  test('arrows move between neighbours and stop at the ends', async ({ page }) => {
    await page.goto(at('routing'));
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/sectioning\/$/);
    await page.waitForLoadState('load');
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/routing\/$/);
    await page.waitForLoadState('load');
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/prompt-chaining\/$/);
    await page.waitForLoadState('load');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    expect(pathOf(page)).toBe(at('prompt-chaining'));
  });
  test('r picks a different pattern; esc goes to the atlas', async ({ page }) => {
    await page.goto(url);
    await page.keyboard.press('r');
    await expect(page).toHaveURL(/\/patterns\/[a-z-]+\/$/);
    expect(pathOf(page)).not.toBe(url);
    expect(order).toContain(pathOf(page).split('/')[2]);
    await page.waitForLoadState('load');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/#atlas$/);
  });
  test('ignored inside the search input, with modifiers, and in the step list', async ({ page }) => {
    await page.goto(at('routing'));
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.getByRole('dialog', { name: 'Search patterns' });
    await dialog.getByRole('searchbox').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    expect(pathOf(page)).toBe(at('routing'));
    await expect(dialog.getByRole('searchbox')).toHaveValue('r');
    await page.keyboard.press('Escape'); // the first Esc clears a search field, the second closes the dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(pathOf(page)).toBe(at('routing'));
    await expect(dialog).toBeHidden();
    await page.locator('body').click({ position: { x: 2, y: 400 } });
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('Shift+r');
    await page.waitForTimeout(300);
    expect(pathOf(page)).toBe(at('routing'));
    await page.locator('ol.fp-captions button').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect(pathOf(page)).toBe(at('routing'));
  });
});

test('spec table matches patternStats for evaluator-optimizer', async ({ page }) => {
  const d = parse(readFileSync('src/content/patterns/evaluator-optimizer/pattern.yaml', 'utf8')).diagram;
  const s = patternStats(d);
  await page.goto(url);
  const val = async (label: string) => (await page.locator('.spec-row').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd .v').textContent())!.trim();
  const yn = (b: boolean) => (b ? 'yes' : 'no');
  expect(await val('Nodes')).toBe(String(s.nodes));
  expect(await val('LLM calls')).toBe(String(s.llmCalls));
  expect(await val('Tool calls')).toBe(String(s.toolCalls));
  expect(await val('Steps')).toBe(String(s.steps));
  expect(await val('Scenarios')).toBe(String(s.scenarios));
  expect(await val('Loop')).toBe(yn(s.loop));
  expect(await val('Parallel')).toBe(yn(s.parallel));
  expect(await val('Branch')).toBe(yn(s.branch));
  expect(await val('Human in the loop')).toBe(yn(s.humanInLoop));
  expect(await val('Autonomy')).toBe('low');
  expect(await val('Cost')).toBe('medium');
  expect(await val('Latency')).toBe('high');
});

test.describe('360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('no horizontal overflow, even with a spec tooltip open', async ({ page }) => {
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await page.locator('.spec-row').last().hover();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});

for (const slug of ['evaluator-optimizer', 'supervisor']) {
  test(`axe clean: /patterns/${slug}/`, async ({ page }) => {
    await page.goto(`/patterns/${slug}/`);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations).toEqual([]);
  });
}
