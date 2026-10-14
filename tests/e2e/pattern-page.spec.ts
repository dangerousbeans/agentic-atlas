import { test, expect } from '@playwright/test';
import { catalogOrder, patternsWithoutVariants } from '../catalog-fixture';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { patternStats } from '../../src/lib/pattern-stats';
const url = '/patterns/evaluator-optimizer/';

test('has all sections in order', async ({ page }) => {
  await page.goto(url);
  const heads = await page.locator('article h2:visible').allTextContents();
  expect(heads).toEqual(['Measured over one run', 'Problem', 'How it works', 'When to use', 'When to avoid', 'Trade-offs', 'Failure modes', 'Related patterns', 'Sources']);
  await expect(page.locator('dl.spec:visible')).toContainText('Autonomy');
  await expect(page.locator('.spec-row:visible').filter({ hasText: 'Autonomy' })).toHaveAttribute('data-tip', /control flow/);
  await expect(page.getByRole('link', { name: /^Self-Refine: Iterative Refinement/ })).toHaveAttribute('href', 'https://arxiv.org/abs/2303.17651');
});

test('the Build tab is the default; the Prompts tab shows the prompt templates', async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole('tab', { name: 'Build it with your AI' })).toHaveAttribute('aria-selected', 'true');
  const build = page.locator('.build-md:visible');
  await expect(build).toHaveCount(1);
  await expect(build).toContainText('Implement the Evaluator-Optimizer pattern in this codebase');
  await expect(build).toContainText('## Stop rule');
  await expect(page.locator('.build-panel .hint:visible')).toContainText('Claude Code, Cursor, ChatGPT');
  await page.getByRole('tab', { name: 'Prompts' }).click();
  await expect(page.locator('[data-prompt-block="generator"]:visible')).toHaveCount(1);
  await expect(page.locator('.build-md:visible')).toHaveCount(0);
});

test.describe('copy button', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
  test('copies the composed build prompt and announces it', async ({ page }) => {
    await page.goto(url);
    const btn = page.locator('[data-copy]:visible');
    await expect(btn).toHaveText('Copy');
    await btn.click();
    await expect(btn).toHaveText('Copied');
    await expect(page.locator('[data-copy-status]')).toHaveText(/copied/i);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toBe(await page.locator('.build-md:visible').textContent());
    expect(text.startsWith('Implement the Evaluator-Optimizer pattern in this codebase')).toBe(true);
    await expect(btn).toHaveText('Copy', { timeout: 4000 });
  });
});

test('copy falls back to selecting the brief when the clipboard is unavailable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto(url);
  const btn = page.locator('[data-copy]:visible');
  await btn.click();
  await expect(btn).toHaveText('Selected');
  await expect(page.locator('[data-copy-status]')).toHaveText(/Ctrl\+C/);
  const selected = await page.evaluate(() => getSelection()!.toString());
  // (Selection.toString() drops the brief's trailing newline)
  expect(selected.trim()).toBe((await page.locator('.build-md:visible').textContent())!.trim());
});

test.describe('variants', () => {
  const visiblePlayers = (page: import('@playwright/test').Page) => page.locator('flow-player:not([compact]):visible');
  test('tabs swap the diagram, build, prompts, stats and origin, and set the hash', async ({ page }) => {
    await page.goto(url);
    const tabs = page.getByRole('tablist', { name: 'Evaluator-Optimizer variants' }).getByRole('tab');
    await expect(tabs).toHaveText(['Separate judge', 'Same model', 'Tool-checked']);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(visiblePlayers(page)).toHaveCount(1);
    await expect(visiblePlayers(page)).toHaveAttribute('data-uid', 'evaluator-optimizer');
    await expect(page.locator('.origin:visible')).toContainText('Popularized by Schluntz & Zhang (2024) · Anthropic');

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    expect(new URL(page.url()).hash).toBe('#variant-self-critique');
    await expect(visiblePlayers(page)).toHaveAttribute('data-uid', 'evaluator-optimizer--self-critique');
    await expect(page.locator('.build-md:visible')).toContainText('(Same model variant)');
    await expect(page.locator('.origin:visible')).toContainText('Introduced by Madaan et al. (2023)');
    const val = (label: string) => page.locator('.spec-row:visible').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd .v');
    await expect(val('Scenarios')).toHaveText('1');
    await page.getByRole('tab', { name: 'Prompts' }).click();
    await expect(page.locator('[data-prompt-block="feedback"]:visible')).toHaveCount(1);
    await expect(page.locator('[data-prompt-block="evaluator"]:visible')).toHaveCount(0);

    // keyboard: arrows move between variant tabs; the first tab clears the hash
    await tabs.nth(1).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(2)).toBeFocused();
    expect(new URL(page.url()).hash).toBe('#variant-tool-checked');
    await expect(val('Tool calls')).toHaveText('2');
    await page.keyboard.press('Home');
    expect(new URL(page.url()).hash).toBe('');
    expect(new URL(page.url()).pathname).toBe(url);
  });

  test('a #variant- hash deep-links a tab, and only the visible diagram plays', async ({ page }) => {
    await page.goto(`${url}#variant-tool-checked`);
    await expect(page.getByRole('tab', { name: 'Tool-checked' })).toHaveAttribute('aria-selected', 'true');
    await expect(visiblePlayers(page)).toHaveAttribute('data-uid', 'evaluator-optimizer--tool-checked');
    await expect(visiblePlayers(page)).toHaveAttribute('data-playing', 'true');
    await expect(page.locator('flow-player[data-uid="evaluator-optimizer"]')).toHaveAttribute('data-suspended', '');
    await expect(page.locator('flow-player[data-uid="evaluator-optimizer"]')).toHaveAttribute('data-playing', 'false');
    await expect(page.locator('.origin:visible')).toContainText('Introduced by Gou et al. (2023)');
  });

  test('an unknown or malformed hash falls back to the default variant without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}#variant-nope`);
    await expect(page.getByRole('tab', { name: 'Separate judge' })).toHaveAttribute('aria-selected', 'true');
    await page.goto(`${url}#variant-%E0`);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Separate judge' })).toHaveAttribute('aria-selected', 'true');
    expect(errors).toEqual([]);
  });

  test('a hashchange to a variant selects it; to an empty hash resets; other anchors keep it', async ({ page }) => {
    await page.goto(url);
    await page.evaluate(() => { location.hash = '#variant-self-critique'; });
    await expect(page.getByRole('tab', { name: 'Same model' })).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(() => { location.hash = '#main'; });
    await expect(page.getByRole('tab', { name: 'Same model' })).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(() => { location.hash = '#variant-tool-checked'; });
    await expect(page.getByRole('tab', { name: 'Tool-checked' })).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(() => { location.hash = ''; });
    await expect(page.getByRole('tab', { name: 'Separate judge' })).toHaveAttribute('aria-selected', 'true');
  });

  test('a deep link starts at the top of the page, with the tab selected', async ({ page }) => {
    await page.goto(`${url}#variant-tool-checked`);
    await page.waitForLoadState('load');
    await expect(page.getByRole('tab', { name: 'Tool-checked' })).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });

  test('pages without variants have no variant tabs', async ({ page }) => {
    const [slug] = patternsWithoutVariants();
    expect(slug, 'at least one pattern without variants').toBeDefined();
    await page.goto(`/patterns/${slug}/`);
    await expect(page.locator('[data-variant-tabs]')).toHaveCount(0);
    await expect(page.locator('.variant-h')).toHaveCount(0);
  });
});

test('JSON-LD cites each distinct origin as a CreativeWork', async ({ page }) => {
  await page.goto(url);
  const lds = await page.locator('script[type="application/ld+json"]').allTextContents();
  const article = lds.map(t => JSON.parse(t)).find(x => x['@type'] === 'TechArticle');
  expect(article.headline).toBe('Evaluator-Optimizer');
  expect(article.citation.map((c: { url: string }) => c.url)).toEqual([
    'https://www.anthropic.com/engineering/building-effective-agents', 'https://arxiv.org/abs/2303.17651', 'https://arxiv.org/abs/2305.11738',
  ]);
  for (const c of article.citation) { expect(c['@type']).toBe('CreativeWork'); expect(c.author).toBeTruthy(); }
});

test('hovering a NodeRef highlights the diagram node', async ({ page }) => {
  await page.goto(url);
  await page.locator('.noderef[data-noderef="evaluator"]').first().hover();
  await expect(page.locator('flow-player').first().locator('svg[data-layout="wide"] g.node[data-node="evaluator"]')).toHaveClass(/is-ref/);
});

test('focusing a NodeRef highlights the node and survives mouseleave', async ({ page }) => {
  await page.goto(url);
  const ref = page.locator('.noderef[data-noderef="generator"]').first();
  const node = page.locator('flow-player').first().locator('svg[data-layout="wide"] g.node[data-node="generator"]');
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
    await expect(page.locator('[data-copy]:visible')).toHaveCount(0);
    await expect(page.locator('[data-prompt-block="generator"]').first()).toBeVisible();
  });
  test('variants stack with headings, each with its diagram, build, stats and origin', async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('.variant-h')).toHaveText(['Separate judge (default)', 'Same model', 'Tool-checked']);
    await expect(page.locator('flow-player:not([compact]):visible')).toHaveCount(3);
    await expect(page.locator('.build-md:visible')).toHaveCount(3);
    await expect(page.locator('dl.spec:visible')).toHaveCount(3);
    await expect(page.locator('.origin:visible')).toHaveCount(3);
    await expect(page.locator('.origin-for').first()).toHaveText('Separate judge:');
  });
  test('#variant-<id> scrolls to that variant\'s heading', async ({ page }) => {
    await page.goto(`${url}#variant-tool-checked`);
    const h = page.locator('#variant-tool-checked');
    await expect(h).toHaveText('Tool-checked');
    await expect(h).toBeInViewport();
    expect(await page.locator('[id^="variant-"]').count()).toBe(3);
  });
  test('prompt code blocks are keyboard-focusable without JS', async ({ page }) => {
    await page.goto(url);
    const pres = page.locator('[data-prompt-block] pre');
    expect(await pres.count()).toBeGreaterThan(0);
    for (const pre of await pres.all()) await expect(pre).toHaveAttribute('tabindex', '0');
  });
});

test('spec tooltips: hover shows, Escape dismisses without leaving the page', async ({ page }) => {
  await page.goto(url);
  const row = page.locator('.spec-row:visible').first();
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

// Catalog order: family rank, then family order, derived from the content files.
const order = catalogOrder();
const at = (slug: string) => `/patterns/${slug}/`;
const pathOf = (page: import('@playwright/test').Page) => new URL(page.url()).pathname;

test.describe('neighbour nav', () => {
  for (const slug of ['prompt-chaining', 'evaluator-optimizer', order[order.length - 1]]) {
    test(`position and ends for ${slug}`, async ({ page }) => {
      await page.goto(at(slug));
      const i = order.indexOf(slug);
      await expect(page.locator('.pattern-nav .pos')).toHaveText(`${i + 1} of ${order.length}`);
      const prev = page.locator('[data-nav="prev"]'), next = page.locator('[data-nav="next"]');
      if (i === 0) { await expect(prev).toHaveAttribute('aria-disabled', 'true'); await expect(prev).not.toHaveAttribute('href', /.+/); }
      else await expect(prev).toHaveAttribute('href', new RegExp(`${order[i - 1]}/$`));
      if (i === order.length - 1) { await expect(next).toHaveAttribute('aria-disabled', 'true'); await expect(next).not.toHaveAttribute('href', /.+/); }
      else await expect(next).toHaveAttribute('href', new RegExp(`${order[i + 1]}/$`));
    });
  }
  test('back link goes to the atlas page', async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('.pattern-nav a.back')).toHaveAttribute('href', /\/atlas\/$/);
  });
  test('random href without JS is next, or prev on the last page', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    const base = test.info().project.use.baseURL!;
    await page.goto(base + at('routing'));
    await expect(page.locator('[data-nav="random"]')).toHaveAttribute('href', /sectioning\/$/);
    const last = order[order.length - 1], beforeLast = order[order.length - 2];
    await page.goto(base + at(last));
    await expect(page.locator('[data-nav="random"]')).toHaveAttribute('href', new RegExp(`${beforeLast}/$`));
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
  test('there is no single-key r shortcut (WCAG 2.1.4); the legend lists arrows and esc; esc goes to the atlas', async ({ page }) => {
    await page.goto(url);
    const legend = page.locator('.legend[aria-label="Keyboard shortcuts"]');
    await expect(legend.locator('kbd')).toHaveText(['←', '→', 'esc']);
    await expect(legend).not.toContainText('random');
    await page.locator('body').click({ position: { x: 2, y: 400 } });
    for (const key of ['r', 'R']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
      expect(pathOf(page)).toBe(url);
    }
    await page.keyboard.down('CapsLock'); await page.keyboard.press('KeyR'); await page.keyboard.up('CapsLock');
    await page.waitForTimeout(300);
    expect(pathOf(page)).toBe(url);
    // The visible Random button still picks a different pattern.
    await page.locator('[data-nav="random"]').click();
    await expect(page).toHaveURL(/\/patterns\/[a-z-]+\/$/);
    expect(pathOf(page)).not.toBe(url);
    expect(order).toContain(pathOf(page).split('/')[2]);
    await page.waitForLoadState('load');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/atlas\/$/);
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
    await page.keyboard.press('Shift+ArrowRight');
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
  const val = async (label: string) => (await page.locator('.spec-row:visible').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd .v').textContent())!.trim();
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
    await page.locator('.spec-row:visible').last().hover();
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
