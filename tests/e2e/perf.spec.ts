// Runtime performance: long tasks, frame times and how many players animate.
// Assertions use the unthrottled numbers (realistic on CI runners); the ×4 CPU-throttled
// variant only logs its numbers (they show up as test annotations and on stdout).
import { test, expect, type Page } from '@playwright/test';

type Sample = { longTasks: number[]; frames: number[] };

/** Observe long tasks and rAF frame durations in the page for `ms` milliseconds, starting now. */
async function measure(page: Page, ms: number, during?: () => Promise<void>): Promise<Sample> {
  await page.evaluate(() => {
    const w = window as unknown as { __perf: Sample & { stop: boolean } };
    w.__perf = { longTasks: [], frames: [], stop: false };
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) w.__perf.longTasks.push(Math.round(e.duration));
    }).observe({ type: 'longtask' }); // not buffered: only tasks from now on count
    let last = performance.now();
    const tick = (t: number) => {
      w.__perf.frames.push(t - last);
      last = t;
      if (!w.__perf.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
  });
  if (during) await during();
  else await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const w = window as unknown as { __perf: Sample & { stop: boolean } };
    w.__perf.stop = true;
    return { longTasks: w.__perf.longTasks, frames: w.__perf.frames };
  });
}

const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : 0;
};
const fmt = (s: Sample) => ({
  frames: s.frames.length,
  frameP95ms: +p95(s.frames).toFixed(1),
  longTasks: s.longTasks.length,
  maxLongTaskMs: Math.max(0, ...s.longTasks),
});

/** Time a fixed JS loop: proves CPU throttling is in effect (≈4× slower at rate 4). */
const calibrate = (page: Page) => page.evaluate(() => {
  const t = performance.now();
  let x = 0;
  for (let i = 0; i < 3e6; i++) x += Math.sqrt(i);
  return Math.round(performance.now() - t + (x < 0 ? 1 : 0));
});

function record(name: string, value: unknown) {
  const line = `${name}: ${JSON.stringify(value)}`;
  console.log(`[perf] ${line}`);
  test.info().annotations.push({ type: 'perf', description: line });
}

async function throttle(page: Page, rate: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

/** Home, with the map zoomed in on an island so its tiles animate, and the hero still running. */
async function homeAnimating(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-enhanced', '');
  await page.locator('.atlas-viewport').scrollIntoViewIfNeeded();
  const search = page.getByRole('searchbox', { name: 'Find a pattern' });
  await search.fill('routing');
  await search.press('Enter');
  await expect.poll(async () => Number(await page.locator('.atlas-viewport').getAttribute('data-zoom'))).toBeGreaterThanOrEqual(0.6);
  await expect(page.locator('.atlas-plane:not(.is-flying)')).toHaveCount(1);
  await page.mouse.move(2, 2);
  await expect.poll(() => page.locator('.atlas-plane flow-player[data-playing="true"]').count()).toBeGreaterThan(0);
}

const tilesInView = (page: Page) => page.evaluate(() => {
  const v = document.querySelector('.atlas-viewport')!.getBoundingClientRect();
  return [...document.querySelectorAll('a.atlas-tile')].filter(t => {
    const r = t.getBoundingClientRect();
    return r.right > v.left && r.left < v.right && r.bottom > v.top && r.top < v.bottom;
  }).length;
});

/** Sweep the pointer across every node and edge of the visible diagram for `ms`. */
async function hoverSweep(page: Page, ms: number) {
  const targets = await page.evaluate(() => {
    const svg = [...document.querySelectorAll<SVGSVGElement>('flow-player svg.diagram-svg')].find(s => s.getBoundingClientRect().width > 0)!;
    return [...svg.querySelectorAll('g.node .shape, path.edge-hit')].map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }).filter(p => p.x > 0 && p.y > 0 && p.y < innerHeight);
  });
  expect(targets.length, 'hover targets in view').toBeGreaterThan(3);
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    const t = targets[i++ % targets.length];
    await page.mouse.move(t.x, t.y, { steps: 2 });
  }
  return i;
}

test.describe('runtime performance', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('home: map animating, no long tasks > 100ms, frame p95 ≤ 25ms, playing ≤ visible tiles + hero', async ({ page }) => {
    await homeAnimating(page);
    const s = await measure(page, 3000);
    const playing = await page.locator('flow-player[data-playing="true"]').count();
    const inView = await tilesInView(page);
    record('home (unthrottled)', { ...fmt(s), playing, tilesInView: inView, calibrationMs: await calibrate(page) });
    expect(s.frames.length, 'rAF kept ticking').toBeGreaterThan(60);
    expect(s.longTasks.filter(d => d > 100), 'long tasks > 100ms').toEqual([]);
    expect(p95(s.frames), 'frame-time p95 (ms)').toBeLessThanOrEqual(25);
    expect(playing, 'players animating').toBeLessThanOrEqual(inView + 1);
  });

  test('home: ×4 CPU throttling (logged only)', async ({ page }) => {
    await homeAnimating(page);
    await throttle(page, 4);
    const s = await measure(page, 3000);
    const playing = await page.locator('flow-player[data-playing="true"]').count();
    record('home (cpu ×4)', { ...fmt(s), playing, tilesInView: await tilesInView(page), calibrationMs: await calibrate(page) });
  });

  for (const rate of [1, 4]) {
    test(`pattern page: rapid hover over nodes and edges for 2s${rate > 1 ? ` at ×${rate} CPU (logged only)` : ', no long tasks > 50ms'}`, async ({ page }) => {
      await page.goto('/patterns/supervisor/');
      await page.waitForLoadState('load');
      await expect(page.locator('flow-player').first()).toHaveClass(/is-enhanced/);
      if (rate > 1) await throttle(page, rate);
      let moves = 0;
      const s = await measure(page, 2000, async () => { moves = await hoverSweep(page, 2000); });
      await expect(page.locator('.fp-tip.is-on')).toHaveCount(1); // the sweep really drove the tooltips
      record(`pattern hover (cpu ×${rate})`, { ...fmt(s), moves, calibrationMs: await calibrate(page) });
      if (rate === 1) expect(s.longTasks.filter(d => d > 50), 'long tasks > 50ms').toEqual([]);
    });
  }
});
