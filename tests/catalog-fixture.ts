// Catalog facts derived from the content files, shared by vitest and Playwright specs so no test hardcodes a count.
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';

const root = 'src/content';

/** Visible families (non-empty `order`) in rank order. */
function families() {
  return readdirSync(`${root}/families`)
    .map(f => parse(readFileSync(`${root}/families/${f}`, 'utf8')) as { slug: string; rank: number; order: string[] })
    .filter(f => f.order.length > 0)
    .sort((a, b) => a.rank - b.rank);
}

/** Pattern slugs in catalog order: family rank, then the family's order list. */
export const catalogOrder = (): string[] => families().flatMap(f => f.order);

/** Visible family slugs in rank order. */
export const visibleFamilies = (): string[] => families().map(f => f.slug);

/** Pattern slugs whose pattern.yaml declares no `variants`. */
export const patternsWithoutVariants = (): string[] =>
  catalogOrder().filter(s => !parse(readFileSync(`${root}/patterns/${s}/pattern.yaml`, 'utf8')).variants);
