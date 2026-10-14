// Crawl a build made for a sub-path deploy (GitHub Pages project site) and fail on 404s and on links that escape the
// base. Usage: node scripts/crawl-subpath.mjs [dir] (default dist-subpath), where dir was built with
// BASE_PATH=/agentic-atlas (see `npm run crawl:subpath`). The build is served under /agentic-atlas/ from a temp dir
// holding a symlink to it, so a root-relative URL that forgets the base 404s here exactly as it would on Pages.
import { mkdtempSync, symlinkSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const BASE = '/agentic-atlas/';
const SITE = (process.env.SITE_URL ?? 'https://dangerousbeans.github.io').replace(/\/$/, '');
const dir = resolve(process.argv[2] ?? 'dist-subpath');
const port = Number(process.env.CRAWL_PORT ?? 4996);
const origin = `http://localhost:${port}`;

const tmp = mkdtempSync(join(tmpdir(), 'crawl-subpath-'));
mkdirSync(join(tmp, 'dist'));
symlinkSync(dir, join(tmp, 'dist', BASE.replace(/\//g, '')), 'dir');
const server = spawn(process.execPath, [resolve('scripts/serve-dist.mjs')], { cwd: tmp, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { server.stdout.once('data', ok); server.once('exit', code => fail(new Error(`server exited (${code})`))); });

const problems = [];
const seen = new Map(); // url -> status
const queue = [origin + BASE];
const pagesVisited = [];

/** Every URL an HTML page or stylesheet points at. */
function refs(text, type) {
  const out = [];
  if (type.includes('html')) {
    for (const m of text.matchAll(/\s(?:href|src|action)=["']([^"']+)["']/g)) out.push(m[1]);
    for (const m of text.matchAll(/\ssrcset=["']([^"']+)["']/g)) for (const part of m[1].split(',')) out.push(part.trim().split(/\s+/)[0]);
    for (const m of text.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|og:url|twitter:image)["'][^>]*content=["']([^"']+)["']/g)) out.push(m[1]);
    for (const m of text.matchAll(/"url":"([^"]+)"/g)) out.push(m[1]); // JSON-LD
  }
  if (type.includes('html') || type.includes('css')) for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) out.push(m[1]);
  return out.filter(u => u && !u.startsWith('data:') && !u.startsWith('#') && !/^(mailto|tel|javascript):/.test(u));
}

/** Root-relative string literals in scripts that skip the base (e.g. "/pagefind/…" built without BASE_URL). */
function scriptEscapes(text) {
  return [...text.matchAll(/["'`](\/(?:_astro|pagefind|patterns|families|atlas|about|og\.png|favicon\.svg)\b[^"'`]*)["'`]/g)].map(m => m[1]);
}

while (queue.length) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  const res = await fetch(url);
  seen.set(url, res.status);
  const type = res.headers.get('content-type') ?? '';
  if (res.status !== 200) continue;
  const text = type.startsWith('text/') || type.includes('javascript') || type.includes('json') || type.includes('xml') ? await res.text() : '';
  if (type.includes('html')) pagesVisited.push(url);
  if (type.includes('javascript')) for (const lit of scriptEscapes(text)) problems.push(`script literal escapes the base: ${lit} in ${url.slice(origin.length)}`);
  for (const ref of refs(text, type)) {
    let abs;
    try { abs = new URL(ref, url); } catch { problems.push(`unparseable URL ${ref} in ${url.slice(origin.length)}`); continue; }
    abs.hash = '';
    if (abs.origin === SITE) { // canonical, og:image, JSON-LD: absolute URLs on the deployed site
      if (!abs.pathname.startsWith(BASE)) problems.push(`absolute URL escapes the base: ${abs.href} in ${url.slice(origin.length)}`);
      else queue.push(origin + abs.pathname + abs.search);
      continue;
    }
    if (abs.origin !== origin) continue; // external links are out of scope
    if (!abs.pathname.startsWith(BASE)) { problems.push(`link escapes the base: ${ref} in ${url.slice(origin.length)}`); continue; }
    queue.push(abs.href);
  }
}

for (const [url, status] of seen) if (status !== 200) problems.push(`${status}: ${url.slice(origin.length)}`);
server.kill();
rmSync(tmp, { recursive: true, force: true });

console.log(`crawl:subpath: ${pagesVisited.length} pages, ${seen.size} URLs under ${BASE}`);
if (pagesVisited.length < 30) problems.push(`only ${pagesVisited.length} pages reached (expected every page)`);
if (problems.length) {
  console.error([...new Set(problems)].map(p => `  ✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('crawl:subpath: no 404s, no links escaping the base');
