import { z } from 'zod';
import { PROMPT_REF_ALL } from './build-prompt';
import { DEFAULT_VARIANT_ID } from './variants';
import { NODE_KINDS, LABEL_MAX, SUBLABEL_MAX, DEFAULT_SIZE, type DiagramSpec } from './diagram/types';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase kebab-case');
const at = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
  .refine(([a, b]) => a < b, 'at[0] must be < at[1]').optional();
const level = z.enum(['low', 'medium', 'high']);
const tokenKind = z.enum(['prompt', 'tool-call', 'result', 'feedback', 'tokens']);

const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('send'), edge: id, token: z.object({ kind: tokenKind, label: z.string().max(14).optional() }), at }),
  z.object({ type: z.literal('activate'), node: id, status: z.enum(['thinking', 'calling', 'waiting', 'done', 'error']), at }),
  z.object({ type: z.literal('branch'), node: id, taken: id, notTaken: z.array(id).optional(), at }),
  z.object({ type: z.literal('appear'), node: id, at }),
  z.object({ type: z.literal('read'), node: id, at }),
  z.object({ type: z.literal('write'), node: id, at }),
]);

export const diagramSchema = z.object({
  direction: z.enum(['RIGHT', 'DOWN']).optional(),
  groups: z.array(z.object({ id, label: z.string().min(1), children: z.array(id).min(1) })).optional(),
  nodes: z.array(z.object({
    id, kind: z.enum(NODE_KINDS), label: z.string().min(1), sublabel: z.string().optional(),
    description: z.string().min(10).max(180),
    size: z.enum(['sm', 'md', 'lg']).optional(),
    pos: z.object({ x: z.number(), y: z.number() }).optional(),
    hidden: z.boolean().optional(),
    model: z.boolean().optional(),
  })).min(2),
  edges: z.array(z.object({ id, from: id, to: id, label: z.string().max(14).optional(), style: z.enum(['solid', 'dashed', 'loop']).optional(), description: z.string().min(10).max(180), example: z.string().min(10).max(280) })).min(1),
  scenarios: z.array(z.object({
    id, label: z.string().min(1),
    steps: z.array(z.object({
      id, caption: z.string().min(3).max(200), duration: z.number().int().min(300).max(10000).optional(),
      events: z.array(eventSchema).min(1),
      repeat: z.number().int().min(2).max(5).optional(),
    })).min(1),
  })).min(1),
});

/** Content links render as hrefs: only http(s), never javascript: or data:. */
const httpUrl = () => z.url({ protocol: /^https?$/ });

export const promptSchema = z.object({ id, title: z.string().min(1), lang: z.enum(['markdown', 'text']), source: z.string().min(1) });

/** The copy-paste "Build it with your AI" brief (expansion addendum §1). Steps may cite prompts as {{prompt:<id>}}. */
export const buildSchema = z.object({
  goal: z.string().min(10).max(300),
  steps: z.array(z.string().min(10).max(400)).min(3).max(8),
  stop: z.string().min(10).max(400),
  requirements: z.array(z.string().min(10).max(300)).min(3).max(6),
});

/** Who introduced or popularized the pattern (addendum §3). `uncertain` needs a `note` saying why. */
export const originSchema = z.object({
  by: z.string().min(2).max(80),
  org: z.string().min(2).max(120).optional(),
  year: z.number().int().min(1950).max(2100),
  url: httpUrl(),
  kind: z.enum(['introduced', 'popularized']),
  note: z.string().min(10).max(400).optional(),
  uncertain: z.boolean().optional(),
}).refine(o => !o.uncertain || !!o.note, { message: 'origin.note is required when origin.uncertain is true', path: ['note'] });

/** An alternative topology shown as a tab beside the pattern's own (default) diagram (addendum §2). */
export const variantSchema = z.object({
  id, name: z.string().min(1).max(40),
  summary: z.string().min(10).max(200),
  diagram: diagramSchema,
  build: buildSchema.optional(),
  prompts: z.array(promptSchema).min(1).optional(),
  origin: originSchema.optional(),
});

export function diagramIssues(d: DiagramSpec): string[] {
  const issues: string[] = [];
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const x of ids) { if (seen.has(x)) issues.push(`duplicate ${kind} id "${x}"`); seen.add(x); }
  };
  dup('node', [...d.nodes.map(n => n.id), ...(d.groups ?? []).map(g => g.id)]);
  dup('edge', d.edges.map(e => e.id));
  dup('scenario', d.scenarios.map(s => s.id));
  const nodes = new Map(d.nodes.map(n => [n.id, n]));
  const edges = new Map(d.edges.map(e => [e.id, e]));
  for (const n of d.nodes) {
    const size = n.size ?? DEFAULT_SIZE[n.kind];
    if (n.label.length > LABEL_MAX[size]) issues.push(`node "${n.id}" label "${n.label}" exceeds ${LABEL_MAX[size]} chars for size ${size}`);
    if (n.sublabel && n.sublabel.length > SUBLABEL_MAX) issues.push(`node "${n.id}" sublabel exceeds ${SUBLABEL_MAX} chars`);
  }
  for (const e of d.edges) for (const end of [e.from, e.to]) if (!nodes.has(end)) issues.push(`edge "${e.id}" references unknown node "${end}"`);
  const grouped = new Set<string>();
  for (const g of d.groups ?? []) for (const c of g.children) {
    if (!nodes.has(c)) issues.push(`group "${g.id}" references unknown node "${c}"`);
    if (grouped.has(c)) issues.push(`node "${c}" is in more than one group`);
    grouped.add(c);
  }
  for (const n of d.nodes) {
    if (!n.pos) continue;
    const g = (d.groups ?? []).find(x => x.children.includes(n.id));
    if (g) issues.push(`node "${n.id}" is pinned but inside group "${g.id}"; pins are only supported for ungrouped nodes`);
  }
  const needNode = (s: string, nodeId: string) => { if (!nodes.has(nodeId)) { issues.push(`scenario "${s}" references unknown node "${nodeId}"`); return false; } return true; };
  for (const sc of d.scenarios) {
    dup('step', sc.steps.map(s => s.id));
    const appeared = new Set<string>();
    for (const st of sc.steps) {
      for (const ev of st.events) {
        switch (ev.type) {
          case 'send': if (!edges.has(ev.edge)) issues.push(`step "${st.id}" sends on unknown edge "${ev.edge}"`); break;
          case 'activate': needNode(sc.id, ev.node); break;
          case 'appear':
            if (needNode(sc.id, ev.node)) { if (!nodes.get(ev.node)!.hidden) issues.push(`step "${st.id}" has appear on "${ev.node}" which is not hidden`); appeared.add(ev.node); }
            break;
          case 'read': case 'write':
            if (needNode(sc.id, ev.node) && nodes.get(ev.node)!.kind !== 'memory') issues.push(`step "${st.id}" has ${ev.type} on "${ev.node}" which is not a memory node`);
            break;
          case 'branch': {
            if (!needNode(sc.id, ev.node)) break;
            for (const eid of [ev.taken, ...(ev.notTaken ?? [])]) {
              const e = edges.get(eid);
              if (!e) issues.push(`step "${st.id}" branch references unknown edge "${eid}"`);
              else if (e.from !== ev.node) issues.push(`step "${st.id}" branch edge "${eid}" is not an outgoing edge of "${ev.node}"`);
            }
          }
        }
      }
    }
    for (const n of d.nodes) if (n.hidden && !appeared.has(n.id)) issues.push(`hidden node "${n.id}" never appears in scenario "${sc.id}"`);
  }
  return issues;
}

export const patternSchema = z.object({
  slug: id, name: z.string().min(1), family: id,
  aliases: z.array(z.string()).default([]),
  summary: z.string().min(10).max(160),
  badges: z.object({ autonomy: level, cost: level, latency: level }),
  sources: z.array(z.object({ title: z.string().min(1), url: httpUrl() })).min(1),
  related: z.object({
    composesWith: z.array(id).default([]),
    confusedWith: z.array(z.object({ slug: id, difference: z.string().min(10) })).default([]),
  }).default({ composesWith: [], confusedWith: [] }),
  prompts: z.array(promptSchema).min(1),
  diagram: diagramSchema,
  // Optional during the expansion migration; tests/unit/content.test.ts tracks which patterns still lack them.
  build: buildSchema.optional(),
  origin: originSchema.optional(),
  defaultVariantName: z.string().min(1).max(40).optional(),
  variants: z.array(variantSchema).min(1).max(3).optional(),
}).superRefine((p, ctx) => {
  const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message: `[${p.slug}] ${message}`, path });
  for (const msg of diagramIssues(p.diagram as DiagramSpec)) issue(msg, ['diagram']);
  // composeBuildPrompt expands {{prompt:<id>}} in every build field, so every field is checked.
  const promptIssues = (build: { goal: string; steps: string[]; stop: string; requirements: string[] } | undefined, prompts: { id: string }[], where: string, path: (string | number)[]) => {
    if (!build) return;
    const ids = new Set(prompts.map(x => x.id));
    const fields: [string, string[]][] = [['goal', [build.goal]], ['step', build.steps], ['stop', [build.stop]], ['requirement', build.requirements]];
    for (const [field, texts] of fields) for (const t of texts) for (const [, ref] of t.matchAll(PROMPT_REF_ALL))
      if (!ids.has(ref)) issue(`${where}build ${field} references unknown prompt "${ref}"`, path);
  };
  promptIssues(p.build, p.prompts, '', ['build']);
  const seen = new Set<string>();
  (p.variants ?? []).forEach((v, i) => {
    if (v.id === DEFAULT_VARIANT_ID) issue(`variant id "${v.id}" is reserved for the pattern's own diagram`, ['variants', i, 'id']);
    if (seen.has(v.id)) issue(`duplicate variant id "${v.id}"`, ['variants', i, 'id']);
    seen.add(v.id);
    for (const msg of diagramIssues(v.diagram as DiagramSpec)) issue(`variant "${v.id}": ${msg}`, ['variants', i, 'diagram']);
    promptIssues(v.build ?? p.build, v.prompts ?? p.prompts, `variant "${v.id}": `, ['variants', i, 'build']);
  });
});

export const familySchema = z.object({
  slug: id, name: z.string().min(1), rank: z.number().int().min(1),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  description: z.string().min(1),
  order: z.array(id),
});

export type Pattern = z.infer<typeof patternSchema>;
export type Family = z.infer<typeof familySchema>;
export type Build = z.infer<typeof buildSchema>;
export type Origin = z.infer<typeof originSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type Prompt = z.infer<typeof promptSchema>;

export function validateCatalog(families: Family[], patterns: Pattern[]): string[] {
  const issues: string[] = [];
  const famBySlug = new Map(families.map(f => [f.slug, f]));
  const patBySlug = new Map(patterns.map(p => [p.slug, p]));
  const dupSlugs = (kind: string, slugs: string[]) => {
    const seen = new Set<string>(), reported = new Set<string>();
    for (const x of slugs) {
      if (seen.has(x) && !reported.has(x)) { issues.push(`duplicate ${kind} slug "${x}"`); reported.add(x); }
      seen.add(x);
    }
  };
  dupSlugs('family', families.map(f => f.slug));
  dupSlugs('pattern', patterns.map(p => p.slug));
  for (const f of families) for (const s of f.order) {
    const p = patBySlug.get(s);
    if (!p) issues.push(`family "${f.slug}" order lists unknown pattern "${s}"`);
    else if (p.family !== f.slug) issues.push(`pattern "${s}" is listed in family "${f.slug}" but belongs to "${p.family}"`);
  }
  for (const p of patterns) {
    const f = famBySlug.get(p.family);
    if (!f) { issues.push(`pattern "${p.slug}" has unknown family "${p.family}"`); continue; }
    if (!f.order.includes(p.slug)) issues.push(`pattern "${p.slug}" is not listed in family "${f.slug}" order`);
    for (const r of [...p.related.composesWith, ...p.related.confusedWith.map(c => c.slug)]) {
      if (r === p.slug) issues.push(`pattern "${p.slug}" relates to itself`);
      else if (!patBySlug.has(r)) issues.push(`pattern "${p.slug}" relates to unknown pattern "${r}"`);
    }
  }
  return issues;
}
