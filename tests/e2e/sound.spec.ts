// Opt-in soundscape (X5): the header toggle, the lazy synth chunk, persistence, and which player may sound.
// Every test counts AudioContexts and oscillators through a subclass of the real AudioContext, installed before any
// page script runs, so "the synth was called" means an oscillator was created.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PATTERN = '/patterns/evaluator-optimizer/';
const SYNTH = /\/_astro\/synth\.[^/]+\.js$/;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__ac = { created: 0, osc: 0, last: null };
    const Real = window.AudioContext;
    w.AudioContext = class extends Real {
      constructor(o?: AudioContextOptions) { super(o); w.__ac.created++; w.__ac.last = this; }
      createOscillator() { w.__ac.osc++; return super.createOscillator(); }
    };
  });
});

const toggle = (page: Page) => page.getByRole('button', { name: 'Sound' });
const ac = (page: Page) => page.evaluate(() => { const a = (window as any).__ac; return { created: a.created as number, osc: a.osc as number, state: a.last?.state as string | undefined }; });
const resetOsc = (page: Page) => page.evaluate(() => { (window as any).__ac.osc = 0; });

test('the toggle is in the header, off by default, named Sound', async ({ page }) => {
  await page.goto('/');
  const b = toggle(page);
  await expect(b).toBeVisible();
  await expect(b).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.site-header button[data-sound]')).toHaveCount(1);
});

test('turning sound on fetches the synth chunk, and only then', async ({ page }) => {
  const synthRequests: string[] = [];
  page.on('request', r => { if (SYNTH.test(new URL(r.url()).pathname)) synthRequests.push(r.url()); });
  await page.goto(PATTERN);
  await page.waitForLoadState('networkidle');
  expect(synthRequests).toEqual([]);
  const req = page.waitForRequest(r => SYNTH.test(new URL(r.url()).pathname));
  await toggle(page).click();
  await req;
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await ac(page)).state).toBe('running');
});

test('with sound off, no AudioContext is ever created', async ({ page }) => {
  await page.goto(PATTERN);
  const fp = page.locator('flow-player').first();
  await expect(fp).toHaveAttribute('data-playing', 'true');
  await page.waitForTimeout(2500);
  await fp.locator('button[data-step-index]').first().click();
  await page.keyboard.press('a');
  await page.mouse.move(2, 2);
  await page.waitForTimeout(500);
  expect(await ac(page)).toEqual({ created: 0, osc: 0, state: undefined });
  expect(await page.evaluate(() => (globalThis as any).__atlasSound)).toBeUndefined();
});

test('the choice persists across a reload; audio waits for the next gesture', async ({ page }) => {
  await page.goto(PATTERN);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1000);
  expect((await ac(page)).created).toBe(0);
  await page.locator('h1').first().click();
  await expect.poll(async () => (await ac(page)).state).toBe('running');
  expect((await ac(page)).created).toBe(1);
  // off again: persists as off
  await toggle(page).click();
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
});

test('the focused player sounds; turning sound off stops everything at once', async ({ page }) => {
  await page.goto(PATTERN);
  await expect(page.locator('flow-player').first()).toHaveAttribute('data-playing', 'true');
  await toggle(page).click();
  await expect.poll(async () => (await ac(page)).osc, { timeout: 8000 }).toBeGreaterThan(0);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await ac(page)).state).toBe('closed');
  expect(await page.evaluate(() => (globalThis as any).__atlasSound)).toBeUndefined();
  await resetOsc(page);
  await page.waitForTimeout(1500);
  expect((await ac(page)).osc).toBe(0);
});

test('a hidden tab suspends the audio', async ({ page }) => {
  await page.goto(PATTERN);
  await toggle(page).click();
  await expect.poll(async () => (await ac(page)).state).toBe('running');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await ac(page)).state).toBe('suspended');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await ac(page)).state).toBe('running');
});

test('quick on, off, on while the chunk loads ends with exactly one running context', async ({ page }) => {
  await page.route(SYNTH, async route => { await new Promise(r => setTimeout(r, 400)); await route.continue(); });
  await page.goto(PATTERN);
  await toggle(page).click();
  await toggle(page).click();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await ac(page)).state).toBe('running');
  await page.waitForTimeout(600);
  expect((await ac(page)).created).toBe(1);
});

test('a failed chunk load turns the toggle back off, with no page error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(SYNTH, route => route.abort());
  await page.goto(PATTERN);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect((await ac(page)).created).toBe(0);
  expect(errors).toEqual([]);
});

test('the output stays quiet: the last node before the speakers is a gain of about 0.3', async ({ page }) => {
  // The compressor adds about +10 dB of make-up gain; the synth's output gain must cancel it.
  await page.addInitScript(() => {
    const w = window as any;
    w.__out = [];
    const connect = AudioNode.prototype.connect as any;
    AudioNode.prototype.connect = function (this: AudioNode, dest: any, ...rest: any[]) {
      if (dest instanceof AudioDestinationNode) w.__out.push(this instanceof GainNode ? this.gain.value : this.constructor.name);
      return connect.call(this, dest, ...rest);
    } as any;
  });
  await page.goto(PATTERN);
  await toggle(page).click();
  await expect.poll(async () => (await ac(page)).state).toBe('running');
  const out = await page.evaluate(() => (window as any).__out);
  expect(out).toHaveLength(1);
  expect(out[0]).toBeGreaterThan(0.2);
  expect(out[0]).toBeLessThanOrEqual(0.35);
});

test('reduced motion: no token stream, but a manual step plays its cue', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PATTERN);
  await toggle(page).click();
  await expect.poll(async () => (await ac(page)).state).toBe('running');
  await page.waitForTimeout(2500);
  expect((await ac(page)).osc).toBe(0);
  await page.locator('flow-player').first().locator('button[data-step-index]').nth(1).click();
  await expect.poll(async () => (await ac(page)).osc).toBeGreaterThan(0);
});

/** Home page, sound on, then the draw-perf route: scroll the map in (the hero leaves view and stops), centre Workflows,
 *  zoom in until tiles play; the pointer is parked on the header, over no tile. */
async function soundOnZoomedMap(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-enhanced', '');
  await toggle(page).click();
  await expect.poll(async () => (await ac(page)).state).toBe('running');
  await page.evaluate(() => {
    const vp = document.querySelector('.atlas-viewport')!;
    scrollTo(0, vp.getBoundingClientRect().top + scrollY - (document.querySelector('.site-header')?.getBoundingClientRect().height ?? 0));
  });
  const box = await page.locator('.atlas-island[data-family="workflows"]').evaluate((el: HTMLElement) => {
    const s = getComputedStyle(el);
    return [s.getPropertyValue('--x'), s.getPropertyValue('--y'), s.getPropertyValue('--w'), s.getPropertyValue('--h')].map(parseFloat);
  });
  const [W, H] = (await page.locator('.atlas-minimap').getAttribute('viewBox'))!.split(' ').slice(2).map(Number);
  const mm = (await page.locator('.atlas-minimap').boundingBox())!;
  await page.mouse.click(mm.x + ((box[0] + box[2] / 2) / W) * mm.width, mm.y + ((box[1] + box[3] / 2) / H) * mm.height);
  await expect(page.locator('.atlas-plane:not(.is-flying)')).toHaveCount(1);
  const vp = (await page.locator('.atlas-viewport').boundingBox())!;
  const z0 = Number(await page.locator('.atlas-viewport').getAttribute('data-zoom'));
  await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
  await page.mouse.wheel(0, -Math.log(1.3 / z0) / 0.0015);
  await expect.poll(async () => Number(await page.locator('.atlas-viewport').getAttribute('data-zoom'))).toBeGreaterThan(1.2);
  await page.mouse.move(2, 2);
  await expect(page.locator('[data-hero] flow-player')).toHaveAttribute('data-playing', 'false');
  await expect.poll(() => page.locator('.atlas-plane flow-player[data-playing="true"]').count()).toBeGreaterThanOrEqual(3);
}

test('on the map, tiles playing in view stay silent; the tile under the pointer sounds', async ({ page }) => {
  await soundOnZoomedMap(page);
  await resetOsc(page);
  await page.waitForTimeout(3000);
  expect((await ac(page)).osc).toBe(0);

  const tile = page.locator('.atlas-tile:has(flow-player[data-playing="true"])').first();
  const t = (await tile.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await expect.poll(async () => (await ac(page)).osc, { timeout: 8000 }).toBeGreaterThan(0);
});

test('on the map, the tile with keyboard focus sounds', async ({ page }) => {
  await soundOnZoomedMap(page);
  await resetOsc(page);
  await page.waitForTimeout(1500);
  expect((await ac(page)).osc).toBe(0);
  // Tab from the zoom controls onto the map's roving tile (keyboard focus, so :focus-visible)
  await page.locator('[data-zoom-btn="home"]').focus();
  await page.keyboard.press('Tab');
  const focused = page.locator('a.atlas-tile:focus-visible');
  await expect(focused).toHaveCount(1);
  await expect(focused.locator('flow-player')).toHaveAttribute('data-playing', 'true');
  await expect.poll(async () => (await ac(page)).osc, { timeout: 8000 }).toBeGreaterThan(0);
});

test('axe: the header is clean with sound off and on', async ({ page }) => {
  await page.goto('/about/');
  await page.waitForLoadState('networkidle');
  const scan = () => new AxeBuilder({ page }).include('.site-header').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect((await scan()).violations.map(v => v.id)).toEqual([]);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  expect((await scan()).violations.map(v => v.id)).toEqual([]);
});
