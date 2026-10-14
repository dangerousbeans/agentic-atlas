import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parse, parseDocument, visit } from 'yaml';
import { patternSchema, familySchema } from '../../src/lib/schema';
import { buildCatalog } from '../../src/lib/catalog';
import { catalogOrder } from '../catalog-fixture';

const root = 'src/content';
const families = readdirSync(`${root}/families`).map(f => familySchema.parse(parse(readFileSync(`${root}/families/${f}`, 'utf8'))));
const slugs = readdirSync(`${root}/patterns`);

/**
 * Patterns that still lack `build` or `origin` during the expansion migration (plan Task X2/X3). Each content task
 * removes the slugs it completes; once this list is empty, `build` and `origin` become required in the schema.
 */
export const MIGRATION_PENDING: readonly string[] = [
  'augmented-llm', 'react', 'reflexion',
  'agentic-rag', 'corrective-rag', 'hierarchical-memory',
  'supervisor', 'handoffs', 'debate',
  'human-in-the-loop', 'guardrails',
];

describe('content', () => {
  it('has 9 families ranked 1 to 9 (expansion addendum §4)', () => {
    expect(families).toHaveLength(9);
    expect([...families].sort((a, b) => a.rank - b.rank).map(f => f.slug)).toEqual([
      'workflows', 'reasoning-prompting', 'agent-loops', 'planning-search', 'knowledge-memory',
      'multi-agent', 'safety-oversight', 'reliability-runtime', 'efficiency-cost',
    ]);
    expect(families.map(f => f.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  for (const slug of slugs) {
    it(`pattern ${slug} is valid and has prose`, () => {
      const r = patternSchema.safeParse(parse(readFileSync(`${root}/patterns/${slug}/pattern.yaml`, 'utf8')));
      if (!r.success) throw new Error(r.error.issues.map(i => i.message).join('\n'));
      expect(r.data.slug).toBe(slug);
      expect(existsSync(`${root}/patterns/${slug}/index.mdx`)).toBe(true);
    });
    it(`pattern ${slug} describes every node and edge, with an example on every edge`, () => {
      const p = patternSchema.parse(parse(readFileSync(`${root}/patterns/${slug}/pattern.yaml`, 'utf8')));
      const missing = [p.diagram, ...(p.variants ?? []).map(v => v.diagram)].flatMap((d, i) => {
        const at = i === 0 ? '' : `variant "${p.variants![i - 1].id}" `;
        return [
          ...d.nodes.filter(n => !n.description).map(n => `${at}node "${n.id}" has no description`),
          ...d.edges.filter(e => !e.description).map(e => `${at}edge "${e.id}" has no description`),
          ...d.edges.filter(e => !e.example).map(e => `${at}edge "${e.id}" has no example`),
        ];
      });
      expect(missing).toEqual([]);
    });
  }
  it('pattern prose never mentions the removed pseudocode', () => {
    const hits = slugs.filter(s => /pseudocode/i.test(readFileSync(`${root}/patterns/${s}/index.mdx`, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('content YAML has no comments (an unquoted " #" silently truncates a value)', () => {
    const files = [
      ...readdirSync(`${root}/families`).map(f => `${root}/families/${f}`),
      ...slugs.map(s => `${root}/patterns/${s}/pattern.yaml`),
    ];
    const comments: string[] = [];
    for (const f of files) {
      const doc = parseDocument(readFileSync(f, 'utf8'));
      if (doc.comment) comments.push(`${f}: #${doc.comment}`);
      visit(doc, { Node(_k, n) { if ('comment' in n && n.comment) comments.push(`${f}: #${n.comment}`); } });
    }
    expect(comments).toEqual([]);
  });
  it('every pattern directory is in exactly one family order, and every order slug has a directory', () => {
    const listed = families.flatMap(f => f.order);
    expect([...listed].sort()).toEqual([...slugs].sort());
    expect(new Set(listed).size).toBe(listed.length);
    expect(catalogOrder().sort()).toEqual([...slugs].sort());
  });
  it('every pattern not pending migration has build and origin', () => {
    const lacking = slugs.filter(s => !MIGRATION_PENDING.includes(s)).filter(s => {
      const p = patternSchema.parse(parse(readFileSync(`${root}/patterns/${s}/pattern.yaml`, 'utf8')));
      return !p.build || !p.origin;
    });
    expect(lacking).toEqual([]);
  });
  it('lists the patterns still missing build or origin (informational until the migration ends)', () => {
    const report = slugs.map(s => patternSchema.parse(parse(readFileSync(`${root}/patterns/${s}/pattern.yaml`, 'utf8'))))
      .map(p => [p.slug, [!p.build && 'build', !p.origin && 'origin'].filter(Boolean)] as const)
      .filter(([, gaps]) => gaps.length);
    if (report.length) console.info(`Expansion migration: ${report.length} pattern(s) still missing fields:\n${report.map(([s, g]) => `  ${s}: ${g.join(', ')}`).join('\n')}`);
    expect(MIGRATION_PENDING.filter(s => !slugs.includes(s))).toEqual([]);
  });
  it('hides families with no patterns from the catalog until they have content', () => {
    const patterns = slugs.map(s => patternSchema.parse(parse(readFileSync(`${root}/patterns/${s}/pattern.yaml`, 'utf8'))));
    const cat = buildCatalog(families, patterns);
    expect(cat.families.every(f => f.order.length > 0)).toBe(true);
    expect(cat.families.map(f => f.slug)).toEqual([...families].filter(f => f.order.length).sort((a, b) => a.rank - b.rank).map(f => f.slug));
  });
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
