// Renders public/og.png (1200×630) from the home page hero: headline, buttons and the live framed diagram.
// Serve dist first (PORT=4971 node scripts/serve-dist.mjs), then: PORT=4971 node scripts/og.mjs, or set OG_URL.
import { chromium } from '@playwright/test';
const url = process.env.OG_URL ?? `http://localhost:${process.env.PORT ?? 4321}/`;
const browser = await chromium.launch();
// Render a 1600×840 CSS-pixel viewport at 0.75× so the whole hero, caption included, fits 1200×630.
const page = await browser.newPage({ viewport: { width: 1600, height: 840 }, deviceScaleFactor: 0.75 });
await page.goto(url);
await page.waitForSelector('.hero-stage flow-player.is-enhanced', { timeout: 15000 });
await page.addStyleTag({ content: '.site-header{display:none}' });
// Let the hero diagram reach a mid-run frame with tokens in flight.
await page.waitForTimeout(2500);
await page.screenshot({ path: 'public/og.png', clip: { x: 0, y: 0, width: 1600, height: 840 } });
await browser.close();
console.log('wrote public/og.png');
