import type { Origin } from './schema';

/** First author's surname: "Maciej Besta, Nils Blach et al." -> "Besta et al."; "A B, C D, E F" -> "B et al."; "Erik Schluntz and Barry Zhang" -> "Schluntz & Zhang"; anything else as written. */
export function shortBy(by: string): string {
  const surname = (name: string) => name.trim().split(/\s+/).pop()!;
  const etAl = /^(.+?)\s+et al\.?(\s*\(.*\))?$/.exec(by.trim());
  if (etAl) return `${surname(etAl[1].split(',')[0])} et al.`;
  const list = by.split(/\s*,\s*/).filter(Boolean);
  if (list.length >= 3 && list.every(n => n.split(/\s+/).length >= 2)) return `${surname(list[0])} et al.`;
  const pair = by.split(/\s+and\s+/);
  if (pair.length === 2 && pair.every(n => n.trim().split(/\s+/).length >= 2)) return pair.map(surname).join(' & ');
  return by.trim();
}

/** The short form for tile and card metadata, e.g. "Yao et al. 2022". Uncertain origins say so. */
export function originShort(o: Origin): string {
  return o.uncertain ? 'No single inventor' : `${shortBy(o.by)} ${o.year}`;
}

/** At most two organisations, then "and others", so a long affiliation list stays one header line. */
export function shortOrg(org: string): string {
  const parts = org.split(/\s*,\s*/).filter(Boolean);
  return parts.length <= 2 ? parts.join(' & ') : `${parts.slice(0, 2).join(', ')} and others`;
}

export interface OriginLine { lead: string; by?: string; year?: number; org?: string; url: string; note?: string }

/** The pattern header line (addendum §3): "Introduced by …", "Popularized by …" or "No single inventor" plus the note. */
export function originLine(o: Origin): OriginLine {
  if (o.uncertain) return { lead: 'No single inventor', url: o.url, note: o.note };
  return {
    lead: o.kind === 'introduced' ? 'Introduced by' : 'Popularized by',
    by: o.by, year: o.year, org: o.org && shortOrg(o.org), url: o.url, note: o.note,
  };
}

/** A schema.org CreativeWork for the pattern page's JSON-LD `citation`. */
export function originCitation(o: Origin): Record<string, unknown> {
  return {
    '@type': 'CreativeWork',
    url: o.url,
    datePublished: String(o.year),
    author: citationAuthors(o),
  };
}

/** People named in `by` (split on commas and "and", "et al." dropped) plus the organisation; a bare name that is
 *  not two or more capitalised words (e.g. "Anthropic", "LangChain team") is the organisation itself. */
function citationAuthors(o: Origin): Record<string, string>[] {
  const names = o.by.replace(/\s+et al\.?(\s*\(.*\))?$/, '').split(/\s*,\s*|\s+and\s+/).map(n => n.trim()).filter(Boolean);
  const isPerson = (n: string) => /^(\p{Lu}[\p{L}.'-]*\s+)+\p{Lu}[\p{L}'-]+$/u.test(n) && !/\b(team|Labs?|AI|Inc)\b/.test(n);
  const people = names.filter(isPerson).map(name => ({ '@type': 'Person', name }));
  const orgName = o.org ?? (people.length ? undefined : o.by);
  return orgName ? [...people, { '@type': 'Organization', name: orgName }] : people;
}
