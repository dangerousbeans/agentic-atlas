import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { patternSchema, familySchema } from '../../src/lib/schema';
import { buildCatalog } from '../../src/lib/catalog';

const root = 'src/content';
const families = readdirSync(`${root}/families`).map(f => familySchema.parse(parse(readFileSync(`${root}/families/${f}`, 'utf8'))));
const slugs = readdirSync(`${root}/patterns`);

describe('content', () => {
  it('has 6 families with distinct ranks', () => {
    expect(families).toHaveLength(6);
    expect(new Set(families.map(f => f.rank)).size).toBe(6);
  });
  for (const slug of slugs) {
    it(`pattern ${slug} is valid and has prose`, () => {
      const r = patternSchema.safeParse(parse(readFileSync(`${root}/patterns/${slug}/pattern.yaml`, 'utf8')));
      if (!r.success) throw new Error(r.error.issues.map(i => i.message).join('\n'));
      expect(r.data.slug).toBe(slug);
      expect(existsSync(`${root}/patterns/${slug}/index.mdx`)).toBe(true);
    });
  }
  it('has all 21 v1 patterns', () => expect(slugs).toHaveLength(21));
  it('catalog cross-references are consistent (Review Focus 3)', () => {
    const patterns = slugs.map(s => patternSchema.parse(parse(readFileSync(`${root}/patterns/${s}/pattern.yaml`, 'utf8'))));
    expect(() => buildCatalog(families, patterns)).not.toThrow();
  });
});

describe('buildCatalog', () => {
  it('throws listing issues', () => {
    expect(() => buildCatalog(families, [])).toThrow(/order lists unknown pattern/);
  });
});
