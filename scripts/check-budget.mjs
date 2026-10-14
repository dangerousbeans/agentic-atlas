// JS budget gate: every built HTML page must load ≤ 15 KB gzip of JavaScript.
//
// Counted per page:
//   - <script src="…js"> and <link rel="modulepreload" href="…js">
//   - the transitive *static* imports of those chunks (`import … from "./x.js"`,
//     `import "./x.js"`, `export … from "./x.js"`)
//   - inline <script> bodies, except JSON data islands (type="application/json"),
//     plus the transitive static imports of those inline bodies
// Not counted: dynamic `import()` targets (lazy, e.g. Pagefind's UI and index,
// which only load when search opens) and anything under dist/pagefind/.
// Each chunk is gzipped individually, which is how the browser receives it.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const PAGE_LIMIT = 15 * 1024;

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

// Static imports only. Minified output has no whitespace (`import{a as b}from"./c.js"`),
// so the specifier match is anchored on `from` or a bare `import"…"`, and `import(` is excluded.
const STATIC_IMPORT = /(?:\bfrom\s*|\bimport\s*)(["'])([^"']+\.js)\1/g;

/** Budget analysis bound to one dist directory. */
export function createBudget(distDir) {
  const DIST = resolve(distDir);
  const gzCache = new Map();
  const gz = (p) => {
    if (!gzCache.has(p)) gzCache.set(p, gzipSync(readFileSync(p)).length);
    return gzCache.get(p);
  };
  const isPagefind = (p) => relative(DIST, p).split('/')[0] === 'pagefind';

  // Root-relative URLs ("/_astro/x.js", possibly with a base prefix) map into dist.
  // We try the full path first, then progressively strip leading segments so a
  // configured `base` (e.g. "/repo/_astro/x.js") still resolves.
  const resolveUrl = (url, fromFile) => {
    const clean = url.split(/[?#]/)[0];
    if (/^[a-z]+:\/\//i.test(clean)) return null; // external
    if (!clean.startsWith('/')) return join(dirname(fromFile), clean);
    const parts = clean.slice(1).split('/');
    for (let i = 0; i < parts.length; i++) {
      const p = join(DIST, ...parts.slice(i));
      if (existsSync(p)) return p;
    }
    return join(DIST, ...parts);
  };

  /** Static import targets of a piece of JS; `fromFile` is the file (chunk or HTML page) containing it. */
  const importsOfCode = (code, fromFile) => [...code.matchAll(STATIC_IMPORT)].map((m) => {
    const spec = m[2];
    if (spec.startsWith('/')) return resolveUrl(spec, fromFile);
    if (spec.startsWith('.')) return join(dirname(fromFile), spec);
    return null; // bare specifiers don't exist in a built static site
  }).filter(Boolean);

  /** Everything one HTML page loads: chunks (external + imported by inline modules), inline bytes, missing files. */
  function analyzePage(html) {
    const src = readFileSync(html, 'utf8');
    // `\s` before the attribute name keeps `data-src` / `data-href` from matching.
    const entries = [
      ...src.matchAll(/<script\b[^>]*\ssrc="([^"]+\.js)"/g),
      ...src.matchAll(/<link\b[^>]*\srel="modulepreload"[^>]*\shref="([^"]+\.js)"/g),
      ...src.matchAll(/<link\b[^>]*\shref="([^"]+\.js)"[^>]*\srel="modulepreload"/g),
    ].map((m) => resolveUrl(m[1], html)).filter(Boolean);

    let inline = 0;
    let inlineCount = 0;
    for (const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      const attrs = m[1];
      if (/\ssrc=/.test(attrs) || /type="application\/(?:ld\+)?json"/.test(attrs)) continue;
      if (!m[2].trim()) continue;
      inline += gzipSync(m[2]).length;
      inlineCount++;
      // An inline module's static imports load chunks too.
      entries.push(...importsOfCode(m[2], html));
    }

    const seen = new Set();
    const missing = [];
    const stack = [...entries];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f) || isPagefind(f)) continue;
      if (!existsSync(f)) { missing.push(relative(DIST, f)); continue; }
      seen.add(f);
      stack.push(...importsOfCode(readFileSync(f, 'utf8'), f));
    }

    const external = [...seen].reduce((a, f) => a + gz(f), 0);
    return { page: '/' + relative(DIST, html), chunks: seen.size, inlineCount, external, inline, total: external + inline, missing };
  }

  const pages = () => walk(DIST).filter((f) => f.endsWith('.html') && !isPagefind(f)).sort();
  return { DIST, resolveUrl, importsOfCode, analyzePage, pages };
}

function main() {
  const DIST = resolve(process.argv[2] ?? 'dist');
  if (!existsSync(DIST)) {
    console.error(`✗ ${DIST} does not exist; run \`npm run build\` first`);
    process.exit(1);
  }
  const budget = createBudget(DIST);
  const pages = budget.pages();
  if (pages.length === 0) {
    console.error(`✗ no HTML pages found in ${DIST}`);
    process.exit(1);
  }
  const rows = pages.map((html) => {
    const r = budget.analyzePage(html);
    return { ...r, ok: r.total <= PAGE_LIMIT && r.missing.length === 0 };
  });
  const failed = rows.some((r) => !r.ok);

  const kb = (n) => (n / 1024).toFixed(2);
  const w = Math.max(4, ...rows.map((r) => r.page.length));
  console.log(`${''.padEnd(2)}${'Page'.padEnd(w)}  ${'chunks'.padStart(6)}  ${'inline'.padStart(6)}  ${'ext KB'.padStart(7)}  ${'inl KB'.padStart(7)}  ${'total KB'.padStart(8)}`);
  for (const r of rows) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.page.padEnd(w)}  ${String(r.chunks).padStart(6)}  ${String(r.inlineCount).padStart(6)}  ${kb(r.external).padStart(7)}  ${kb(r.inline).padStart(7)}  ${kb(r.total).padStart(8)}`);
    if (r.missing.length) console.log(`    missing chunks: ${r.missing.join(', ')}`);
  }
  const max = rows.reduce((a, r) => (r.total > a.total ? r : a), rows[0]);
  console.log(`\n${rows.length} pages, limit ${kb(PAGE_LIMIT)} KB gzip; max ${kb(max.total)} KB on ${max.page}`);
  if (failed) console.error('✗ JS budget exceeded (or a referenced chunk is missing)');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
