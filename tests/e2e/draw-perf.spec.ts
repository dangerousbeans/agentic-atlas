// Draw-performance regression gate (R11): the home map zoomed into the Workflows island, six live diagrams.
// A CDP trace (Tracing domain) gives the browser's own frame and paint/raster accounting, not just rAF timing:
//   - frame-time p95: the interval between fully presented frames (PipelineReporter PRESENTED_ALL), skipping idle
//     vsyncs where no update was wanted; a PRESENTED_PARTIAL frame went out without the main thread's update, which
//     for rAF-driven diagrams is a lost animation frame
//   - Paint + Raster ms per second: Blink Paint, plus raster in the renderer (RasterTask) and, with GPU raster, the
//     GPU process's replay of those tiles (RendererRasterWorker)
// Budgets: the optimised build measured 16.7 ms p95 and 116-180 Paint+Raster ms/s (median ~140) in Playwright's
// headless Chromium (software raster), on a loaded 16-core machine. Local budgets give about 1.8x headroom; CI
// runners are slower and noisier, so theirs are looser. The ×4 run is logged only. Full numbers are always logged.
// Layerize (cc layer-tree building, which grows with promoted layers) is asserted locally only, with a generous budget.
// Timing budgets are noisy, so the structural test below pins the R11 wins directly: the live-tile cap, no live
// filters on tokens or active edges, and idle edge glows not painted.
import { test, expect, type Page, type CDPSession } from '@playwright/test';

const CI = !!process.env.CI;
const BUDGET = {
  frameP95: CI ? 50 : 34,          // ms; 16.7 is every vsync, 33.3 one miss
  paintRasterPerSec: CI ? 400 : 250, // ms of Paint + Raster per second of animation
  layerizeMsPerSec: 200,              // local only (not asserted on CI); see the test log for the measured value
};
const MS = 3000;
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink', 'cc', 'gpu', 'viz'];

interface TraceEvent { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any }

async function trace(cdp: CDPSession, during: () => Promise<void>): Promise<TraceEvent[]> {
  await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: CATEGORIES } });
  await during();
  const done = new Promise<{ stream?: string }>(r => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  let text = '';
  for (;;) {
    const { data, eof, base64Encoded } = await cdp.send('IO.read', { handle: stream!, size: 1 << 22 });
    text += base64Encoded ? Buffer.from(data, 'base64').toString() : data;
    if (eof) break;
  }
  await cdp.send('IO.close', { handle: stream! });
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : json.traceEvents;
}

function analyse(events: TraceEvent[]) {
  const started = events.find(e => e.name === 'TracingStartedInBrowser');
  const rpid: number = started?.args?.data?.frames?.find((f: any) => !f.parent)?.processId ?? started?.args?.data?.frames?.[0]?.processId;
  const gpuPid = events.find(e => e.ph === 'M' && e.name === 'process_name' && /GPU/i.test(e.args?.name))?.pid;
  const ts = events.filter(e => e.pid === rpid && e.ph === 'X').map(e => e.ts);
  const t0 = ts.reduce((m, t) => Math.min(m, t), Infinity), t1 = t0 + MS * 1000;
  const inWin = (e: TraceEvent) => e.ts >= t0 && e.ts <= t1;
  const sum = (name: string, pid?: number) => events.filter(e => e.ph === 'X' && e.name === name && inWin(e) && (pid === undefined || e.pid === pid)).reduce((s, e) => s + (e.dur ?? 0), 0) / 1000;
  // one PipelineReporter per vsync (possibly repeated per stage): keep the best state per frame_sequence
  const rank: Record<string, number> = { STATE_PRESENTED_ALL: 4, STATE_PRESENTED_PARTIAL: 3, STATE_DROPPED: 2, STATE_NO_UPDATE_DESIRED: 1 };
  const bySeq = new Map<number, { ts: number; state: string }>();
  for (const e of events) if (e.name === 'PipelineReporter' && e.ph === 'b' && e.pid === rpid && inWin(e)) {
    const seq = e.args?.frame_reporter?.frame_sequence ?? e.ts, state = e.args?.frame_reporter?.state ?? '';
    const cur = bySeq.get(seq);
    if (!cur || (rank[state] ?? 0) > (rank[cur.state] ?? 0)) bySeq.set(seq, { ts: cur ? Math.min(cur.ts, e.ts) : e.ts, state });
  }
  const frames = [...bySeq.values()].sort((a, b) => a.ts - b.ts);
  const states: Record<string, number> = {};
  const times: number[] = [];
  let last: number | null = null;
  for (const f of frames) {
    states[f.state] = (states[f.state] ?? 0) + 1;
    if (f.state === 'STATE_NO_UPDATE_DESIRED') { last = null; continue; }
    if (f.state === 'STATE_PRESENTED_ALL') { if (last !== null) times.push((f.ts - last) / 1000); last = f.ts; }
  }
  times.sort((a, b) => a - b);
  const q = (p: number) => times.length ? times[Math.min(times.length - 1, Math.floor(times.length * p))] : Infinity;
  const paint = sum('Paint', rpid), rasterRenderer = sum('RasterTask', rpid), rasterGpu = gpuPid === undefined ? 0 : sum('RendererRasterWorker', gpuPid);
  const sec = MS / 1000, r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    fullFrames: states.STATE_PRESENTED_ALL ?? 0, partialFrames: states.STATE_PRESENTED_PARTIAL ?? 0, droppedFrames: states.STATE_DROPPED ?? 0,
    frameP50: r1(q(0.5)), frameP95: r1(q(0.95)),
    paintMsPerSec: r1(paint / sec), rasterMsPerSec: r1((rasterRenderer + rasterGpu) / sec), rasterGpuMsPerSec: r1(rasterGpu / sec),
    paintRasterPerSec: r1((paint + rasterRenderer + rasterGpu) / sec),
    layerizeMsPerSec: r1(sum('Layerize', rpid) / sec), layoutMsPerSec: r1(sum('Layout', rpid) / sec), styleMsPerSec: r1(sum('UpdateLayoutTree', rpid) / sec),
  };
}

/** Centre the Workflows island (6 tiles) at zoom 1.3, through the real UI: a minimap click, then one wheel step. */
async function zoomIntoWorkflows(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-enhanced', '');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const vp = document.querySelector('.atlas-viewport')!;
    scrollTo(0, vp.getBoundingClientRect().top + scrollY - (document.querySelector('.site-header')?.getBoundingClientRect().height ?? 0));
  });
  const box = (await page.locator('.atlas-island[data-family="workflows"]').evaluate((el: HTMLElement) => {
    const s = getComputedStyle(el);
    return [s.getPropertyValue('--x'), s.getPropertyValue('--y'), s.getPropertyValue('--w'), s.getPropertyValue('--h')].map(parseFloat);
  }));
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
  await expect.poll(() => page.locator('.atlas-plane flow-player[data-playing="true"]').count()).toBeGreaterThanOrEqual(5);
  await page.waitForTimeout(1000); // settle: first frames after the zoom re-raster the whole view
}

test.describe('draw performance', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1440, height: 900 } });

  test('structure: at most 6 live tiles with more in view, no live filters on tokens or active edges, idle glows hidden', async ({ page }) => {
    await zoomIntoWorkflows(page);
    // Zoom out (still above the play threshold) until clearly more than six tiles are in view.
    const vpLoc = page.locator('.atlas-viewport');
    const vp = (await vpLoc.boundingBox())!;
    await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
    await page.mouse.wheel(0, Math.log(1.3 / 0.7) / 0.0015);
    await expect.poll(async () => Number(await vpLoc.getAttribute('data-zoom'))).toBeLessThan(0.8);
    await page.mouse.move(2, 2);
    const z = Number(await vpLoc.getAttribute('data-zoom'));
    expect(z, 'still above the play threshold').toBeGreaterThanOrEqual(0.6);
    const inView = await page.evaluate(() => {
      const v = document.querySelector('.atlas-viewport')!.getBoundingClientRect();
      return [...document.querySelectorAll('.atlas-tile')].filter(t => {
        const r = t.getBoundingClientRect();
        const w = Math.min(r.right, v.right) - Math.max(r.left, v.left), h = Math.min(r.bottom, v.bottom) - Math.max(r.top, v.top);
        return w > 0 && h > 0 && (w * h) / (r.width * r.height) > 0.5;
      }).length;
    });
    expect(inView, 'tiles at least half in view').toBeGreaterThan(6);
    await page.waitForTimeout(500); // let IntersectionObserver and the live-tile pick settle
    const live = page.locator('.atlas-map flow-player[data-playing="true"]');
    await expect.poll(() => live.count()).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) { expect(await live.count(), 'live map tiles').toBeLessThanOrEqual(6); await page.waitForTimeout(100); }

    // Tokens and active edges carry no live filter (their glow is pre-rendered), and idle glows are not painted.
    await expect.poll(() => page.locator('.atlas-map g.token:not([display]) circle').count()).toBeGreaterThan(0);
    await expect.poll(() => page.locator('.atlas-map .edge[data-state="active"]').count()).toBeGreaterThan(0);
    const styles = await page.evaluate(() => {
      const map = document.querySelector('.atlas-map')!;
      const filters = (sel: string) => [...map.querySelectorAll(sel)].map(el => getComputedStyle(el).filter);
      // an idle glow mid fade-out is still visible for its 0.3s transition; judge the settled ones
      const idle = [...map.querySelectorAll<SVGElement>('.edge-glow[data-state="idle"]')].filter(el => el.getAnimations().length === 0);
      return { token: filters('g.token circle'), active: filters('.edge[data-state="active"]'), idle: idle.map(el => getComputedStyle(el).visibility) };
    });
    expect(styles.token.length).toBeGreaterThan(0);
    expect(new Set(styles.token), 'token circle filter').toEqual(new Set(['none']));
    expect(new Set(styles.active), 'active edge filter').toEqual(new Set(['none']));
    expect(styles.idle.length).toBeGreaterThan(20);
    expect(new Set(styles.idle), 'idle edge-glow visibility').toEqual(new Set(['hidden']));
  });

  for (const rate of [1, 4]) {
    test(`map island, 6 live diagrams${rate > 1 ? `, ×${rate} CPU (logged only)` : `: frame p95 ≤ ${BUDGET.frameP95}ms, Paint+Raster ≤ ${BUDGET.paintRasterPerSec}ms/s`}`, async ({ page }) => {
      await zoomIntoWorkflows(page);
      const cdp = await page.context().newCDPSession(page);
      if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      const playing = await page.locator('flow-player[data-playing="true"]').count();
      const m = analyse(await trace(cdp, () => page.waitForTimeout(MS)));
      const line = `draw (cpu ×${rate}): ${JSON.stringify({ playing, ...m, budget: BUDGET })}`;
      console.log(`[perf] ${line}`);
      test.info().annotations.push({ type: 'perf', description: line });
      expect(m.fullFrames, 'frames presented').toBeGreaterThan(MS / 1000 * 10);
      if (rate > 1) return;
      expect(m.frameP95, 'frame-time p95 (ms)').toBeLessThanOrEqual(BUDGET.frameP95);
      expect(m.paintRasterPerSec, 'Paint + Raster (ms per second)').toBeLessThanOrEqual(BUDGET.paintRasterPerSec);
      if (!CI) expect(m.layerizeMsPerSec, 'Layerize (ms per second)').toBeLessThanOrEqual(BUDGET.layerizeMsPerSec);
    });
  }
});
