import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createBudget } from '../../scripts/check-budget.mjs';

let dist: string;
const write = (rel: string, body: string) => { mkdirSync(dirname(join(dist, rel)), { recursive: true }); writeFileSync(join(dist, rel), body); };
const gz = (s: string) => gzipSync(s).length;
const noise = (n: number) => Array.from({ length: n }, (_, i) => ((i * 7919) % 251).toString(36)).join('');
const analyze = (file = 'index.html') => createBudget(dist).analyzePage(join(dist, file));

beforeEach(() => { dist = mkdtempSync(join(tmpdir(), 'budget-')); });
afterEach(() => rmSync(dist, { recursive: true, force: true }));

describe('check-budget', () => {
  it('follows static imports of inline module scripts', () => {
    const chunk = `export const a="${noise(600)}";`;
    const inline = 'import{a}from"/_astro/chunk.js";console.log(a);';
    write('_astro/chunk.js', chunk);
    write('index.html', `<html><script type="module">${inline}</script></html>`);
    const r = analyze();
    expect(r.chunks).toBe(1);
    expect(r.inline).toBe(gz(inline));
    expect(r.external).toBe(gz(chunk));
    expect(r.total).toBe(gz(inline) + gz(chunk));
    expect(r.missing).toEqual([]);
  });

  it('reports a missing chunk imported from an inline module', () => {
    write('index.html', '<script type="module">import"/_astro/gone.js";</script>');
    expect(analyze().missing).toEqual(['_astro/gone.js']);
  });

  it('ignores dynamic import() in inline modules', () => {
    write('_astro/lazy.js', `export const l="${noise(300)}";`);
    write('index.html', '<script type="module">import("/_astro/lazy.js");</script>');
    expect(analyze().chunks).toBe(0);
  });

  it('does not treat data-src as a script src', () => {
    write('_astro/real.js', `export const r="${noise(300)}";`);
    write('_astro/decoy.js', `export const d="${noise(300)}";`);
    write('index.html', '<script data-src="/_astro/decoy.js" src="/_astro/real.js"></script><script data-src="/_astro/decoy.js">var x=1;</script>');
    const r = analyze();
    expect(r.chunks).toBe(1); // only real.js
    expect(r.inlineCount).toBe(1); // the data-src script has no src, so it counts as inline
  });

  it('does not treat data-href on a modulepreload link as an href', () => {
    write('_astro/decoy.js', `export const d="${noise(300)}";`);
    write('index.html', '<link rel="modulepreload" data-href="/_astro/decoy.js">');
    expect(analyze().chunks).toBe(0);
  });
});
