import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const viewport = (page: Page) => page.locator('.atlas-viewport');
const tiles = (page: Page) => page.locator('a.atlas-tile');
const tile = (page: Page, slug: string) => page.locator(`a.atlas-tile[data-slug="${slug}"]`);
const zoomOf = async (page: Page) => Number(await viewport(page).getAttribute('data-zoom'));
const focusedSlug = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.slug ?? null);

/** True when the locator's box lies fully inside the map viewport. */
async function fullyInView(page: Page, loc: Locator) {
  const [v, t] = await Promise.all([viewport(page).boundingBox(), loc.boundingBox()]);
  return !!v && !!t && t.x >= v.x - 1 && t.y >= v.y - 1 && t.x + t.width <= v.x + v.width + 1 && t.y + t.height <= v.y + v.height + 1;
}

async function openMap(page: Page) {
  await page.goto('/');
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-enhanced', '');
  await viewport(page).scrollIntoViewIfNeeded();
}

test.describe('hero', () => {
  test('renders the framed evaluator-optimizer player with a stats caption', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('An atlas of agentic patterns.');
    const stage = page.locator('.hero-stage');
    await expect(stage.locator('flow-player')).toHaveCount(1);
    await expect(stage.locator('flow-player')).toHaveAttribute('data-uid', 'hero');
    await expect(stage.locator('flow-player')).toHaveClass(/is-enhanced/);
    await expect(page.locator('.hero-name')).toHaveText('Evaluator-Optimizer');
    await expect(page.locator('.hero-stats')).toContainText(/\d+ nodes · \d+ LLM calls/);
    await expect(page.locator('.hero-open')).toHaveAttribute('href', /\/patterns\/evaluator-optimizer\/$/);
  });

  test('hero buttons go to the atlas, the families index and a random pattern', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Open the atlas' })).toHaveAttribute('href', '#atlas');
    await expect(page.getByRole('link', { name: 'Browse families' })).toHaveAttribute('href', /\/families\/$/);
    await page.getByRole('link', { name: 'Show me a random pattern' }).click();
    await expect(page).toHaveURL(/\/patterns\/[a-z-]+\/$/);
  });

  test('Another swaps in a different live player and updates the caption', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Another' }).click();
    const name = page.locator('.hero-name');
    await expect(name).not.toHaveText('Evaluator-Optimizer');
    const fp = page.locator('.hero-stage flow-player');
    await expect(fp).toHaveCount(1);
    await expect(fp).not.toHaveAttribute('data-uid', 'hero');
    await expect(fp).toHaveClass(/is-enhanced/);
    const slug = (await fp.getAttribute('data-uid'))!;
    await expect(page.locator('.hero-open')).toHaveAttribute('href', new RegExp(`/patterns/${slug}/$`));
    // The swapped player is fully live: hovering a node shows its tooltip.
    await page.locator('.hero-stage .diagram-stage').hover({ position: { x: 4, y: 4 } });
    await expect(fp).toHaveAttribute('data-playing', 'false');
    await page.locator('.hero-stage svg.diagram-svg:visible g.node:not([data-state="hidden"]) .shape').first().hover();
    await expect(page.locator('.hero-stage .fp-tip.is-on')).toBeVisible();
    // It plays again once the pointer leaves.
    await page.mouse.move(0, 0);
    await expect(fp).toHaveAttribute('data-playing', 'true');
  });
});

test.describe('atlas map', () => {
  test('lays out 21 tile links in family-then-pattern DOM order', async ({ page }) => {
    await openMap(page);
    await expect(tiles(page)).toHaveCount(21);
    const order = await tiles(page).evaluateAll(els => els.map(e => (e as HTMLElement).dataset.slug));
    expect(order.slice(0, 7)).toEqual(['prompt-chaining', 'routing', 'sectioning', 'voting', 'orchestrator-workers', 'evaluator-optimizer', 'augmented-llm']);
    await expect(page.locator('.atlas-island-label')).toHaveCount(6);
  });

  test('the map is one tab stop; arrows walk tiles and Enter opens one', async ({ page }) => {
    await openMap(page);
    await expect(page.locator('a.atlas-tile[tabindex="0"]')).toHaveCount(1);
    await page.locator('[data-zoom-btn="home"]').focus();
    await page.keyboard.press('Tab');
    expect(await focusedSlug(page)).toBe('prompt-chaining');
    await page.keyboard.press('ArrowRight');
    expect(await focusedSlug(page)).toBe('routing');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedSlug(page)).toBe('prompt-chaining');
    await page.keyboard.press('ArrowDown');
    expect(await focusedSlug(page)).toBe('voting');
    // Walking past the last tile of an island continues into the next family.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await focusedSlug(page)).toBe('augmented-llm');
    await expect.poll(() => fullyInView(page, tile(page, 'augmented-llm'))).toBe(true);
    await expect(page.locator('a.atlas-tile[tabindex="0"]')).toHaveAttribute('data-slug', 'augmented-llm');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/patterns\/augmented-llm\/$/);
  });

  test('search dims non-matches, then Enter flies to and focuses the match', async ({ page }) => {
    await openMap(page);
    const box = page.getByRole('searchbox', { name: 'Find a pattern' });
    await box.fill('reflex');
    await expect(page.locator('a.atlas-tile:not([data-dim])')).toHaveCount(1);
    await expect(tile(page, 'routing')).toHaveAttribute('data-dim', '');
    await expect(page.locator('.atlas-status')).toContainText('1 match');
    await box.press('Enter');
    expect(await focusedSlug(page)).toBe('reflexion');
    await expect.poll(() => fullyInView(page, tile(page, 'reflexion'))).toBe(true);
    await box.fill('');
    await expect(page.locator('a.atlas-tile[data-dim]')).toHaveCount(0);
  });

  test('"Somewhere new" moves the map', async ({ page }) => {
    await openMap(page);
    const plane = page.locator('.atlas-plane');
    const before = await plane.getAttribute('style');
    await page.getByRole('button', { name: 'Somewhere new' }).click();
    await expect.poll(() => plane.getAttribute('style')).not.toBe(before);
  });

  test('zoom buttons and the wheel zoom; home resets; wheel never scrolls the page', async ({ page }) => {
    await openMap(page);
    const z0 = await zoomOf(page);
    await page.locator('[data-zoom-btn="in"]').click();
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(z0);
    await page.locator('[data-zoom-btn="home"]').click();
    await expect.poll(() => zoomOf(page)).toBeCloseTo(z0, 2);
    const v = (await viewport(page).boundingBox())!;
    await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -400);
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(z0);
    expect(await page.evaluate(() => scrollY)).toBe(y0);
  });

  test('dragging pans without opening a tile', async ({ page }) => {
    await openMap(page);
    const plane = page.locator('.atlas-plane');
    const before = await plane.getAttribute('style');
    const t = (await tile(page, 'routing').boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width / 2 + 120, t.y + t.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    await expect(page).toHaveURL(/\/$/);
    expect(await plane.getAttribute('style')).not.toBe(before);
  });

  test('only tiles in view and above the zoom threshold play', async ({ page }) => {
    await openMap(page);
    const playing = page.locator('.atlas-plane flow-player[data-playing="true"]');
    // Zoomed out to the whole map (below 0.6): every tile is paused.
    expect(await zoomOf(page)).toBeLessThan(0.6);
    await page.waitForTimeout(500);
    await expect(playing).toHaveCount(0);
    // Zoom in on one island: some tiles play, never more than are in view.
    await page.getByRole('searchbox', { name: 'Find a pattern' }).fill('routing');
    await page.getByRole('searchbox', { name: 'Find a pattern' }).press('Enter');
    await expect.poll(() => zoomOf(page)).toBeGreaterThanOrEqual(0.6);
    await page.mouse.move(0, 0);
    await expect.poll(() => playing.count()).toBeGreaterThan(0);
    const inView = await page.evaluate(() => {
      const v = document.querySelector('.atlas-viewport')!.getBoundingClientRect();
      return [...document.querySelectorAll('a.atlas-tile')].filter(t => {
        const r = t.getBoundingClientRect();
        return r.right > v.left && r.left < v.right && r.bottom > v.top && r.top < v.bottom;
      }).length;
    });
    expect(await playing.count()).toBeLessThanOrEqual(inView);
    expect(inView).toBeLessThan(21);
  });

  test('the minimap tracks the view and clicking it recentres', async ({ page }) => {
    await openMap(page);
    const rect = page.locator('.atlas-minimap .mm-view');
    await page.locator('[data-zoom-btn="in"]').click();
    await page.locator('[data-zoom-btn="in"]').click();
    const before = await rect.getAttribute('x');
    const mm = (await page.locator('.atlas-minimap').boundingBox())!;
    await page.mouse.click(mm.x + mm.width * 0.9, mm.y + mm.height * 0.9);
    await expect.poll(() => rect.getAttribute('x')).not.toBe(before);
  });

  test('ends with a link to the families index', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Browse all families' })).toHaveAttribute('href', /\/families\/$/);
  });
});

test('without JS the map is a plain list of 21 tile links', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('.atlas-map')).not.toHaveAttribute('data-enhanced', '');
  await expect(tiles(page)).toHaveCount(21);
  for (const t of await tiles(page).all()) await expect(t).toBeVisible();
  await expect(page.locator('.hero-stage flow-player')).toHaveCount(1);
  await ctx.close();
});

test('reduced motion: nothing animates, even zoomed in', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openMap(page);
  await page.locator('[data-zoom-btn="in"]').click();
  await page.locator('[data-zoom-btn="in"]').click();
  await page.locator('[data-zoom-btn="in"]').click();
  await page.waitForTimeout(600);
  await expect(page.locator('flow-player[data-playing="true"]')).toHaveCount(0);
  await ctx.close();
});

for (const width of [360, 390]) {
  test(`no horizontal page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.locator('.atlas-map')).toHaveAttribute('data-enhanced', '');
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw);
    // The stage stacks above the copy on small screens.
    const [stage, h1] = await Promise.all([page.locator('.hero-stage').boundingBox(), page.locator('h1').boundingBox()]);
    expect(stage!.y).toBeLessThan(h1!.y);
  });
}

test('home is axe-clean', async ({ page }) => {
  await openMap(page);
  const res = await new AxeBuilder({ page }).analyze();
  expect(res.violations.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
