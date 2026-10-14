import { validateCatalog, type Family, type Pattern } from './schema';

export interface Catalog {
  families: Family[]; patterns: Pattern[]; bySlug: Map<string, Pattern>;
  family(slug: string): Family; patternsOf(familySlug: string): Pattern[];
  neighbors(slug: string): { prev?: Pattern; next?: Pattern };
}

export function buildCatalog(familiesIn: Family[], patternsIn: Pattern[]): Catalog {
  const issues = validateCatalog(familiesIn, patternsIn);
  if (issues.length) throw new Error(`Content catalog is invalid:\n  - ${issues.join('\n  - ')}`);
  const families = [...familiesIn].sort((a, b) => a.rank - b.rank);
  const bySlug = new Map(patternsIn.map(p => [p.slug, p]));
  const famMap = new Map(families.map(f => [f.slug, f]));
  const patternsOf = (fs: string) => famMap.get(fs)!.order.map(s => bySlug.get(s)!);
  const patterns = families.flatMap(f => patternsOf(f.slug));
  return {
    families, patterns, bySlug,
    family(slug) { const f = famMap.get(slug); if (!f) throw new Error(`unknown family ${slug}`); return f; },
    patternsOf,
    neighbors(slug) {
      const p = bySlug.get(slug)!; const list = patternsOf(p.family); const i = list.findIndex(x => x.slug === slug);
      return { prev: list[i - 1], next: list[i + 1] };
    },
  };
}

let memo: Promise<Catalog> | undefined;
export function getCatalog(): Promise<Catalog> {
  memo ??= (async () => {
    const { getCollection } = await import('astro:content');
    const fams = (await getCollection('families')).map(e => e.data as Family);
    const pats = (await getCollection('patterns')).map(e => e.data as Pattern);
    return buildCatalog(fams, pats);
  })();
  return memo;
}
