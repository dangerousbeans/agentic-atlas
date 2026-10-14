import { z } from 'zod';
import { NODE_KINDS, LABEL_MAX, SUBLABEL_MAX, DEFAULT_SIZE, type DiagramSpec, type CodeBlock } from './diagram/types';

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
    size: z.enum(['sm', 'md', 'lg']).optional(),
    pos: z.object({ x: z.number(), y: z.number() }).optional(),
    hidden: z.boolean().optional(),
  })).min(2),
  edges: z.array(z.object({ id, from: id, to: id, label: z.string().max(14).optional(), style: z.enum(['solid', 'dashed', 'loop']).optional() })).min(1),
  scenarios: z.array(z.object({
    id, label: z.string().min(1),
    steps: z.array(z.object({
      id, caption: z.string().min(3).max(200), duration: z.number().int().min(300).max(10000).optional(),
      events: z.array(eventSchema).min(1),
      codeRef: z.object({ block: id, lines: z.string() }).optional(),
      repeat: z.number().int().min(2).max(5).optional(),
    })).min(1),
  })).min(1),
});

export const codeBlockSchema = z.object({ id, title: z.string().min(1), lang: z.enum(['python', 'markdown', 'text']), source: z.string().min(1) });

export function diagramIssues(d: DiagramSpec, code: CodeBlock[]): string[] {
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
  const blocks = new Map(code.map(b => [b.id, b.source.replace(/\n$/, '').split('\n').length]));
  const needNode = (s: string, nodeId: string) => { if (!nodes.has(nodeId)) { issues.push(`scenario "${s}" references unknown node "${nodeId}"`); return false; } return true; };
  for (const sc of d.scenarios) {
    dup('step', sc.steps.map(s => s.id));
    const appeared = new Set<string>();
    for (const st of sc.steps) {
      if (st.codeRef) {
        const len = blocks.get(st.codeRef.block);
        const m = /^(\d+)(?:-(\d+))?$/.exec(st.codeRef.lines);
        if (len === undefined) issues.push(`step "${st.id}" references unknown code block "${st.codeRef.block}"`);
        else if (!m) issues.push(`step "${st.id}" codeRef lines "${st.codeRef.lines}" must look like "3" or "3-7"`);
        else { const a = +m[1], b = m[2] ? +m[2] : a; if (a < 1 || b < a || b > len) issues.push(`step "${st.id}" codeRef lines "${st.codeRef.lines}" out of range (block "${st.codeRef.block}" has ${len} lines)`); }
      }
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
  sources: z.array(z.object({ title: z.string().min(1), url: z.url() })).min(1),
  related: z.object({
    composesWith: z.array(id).default([]),
    confusedWith: z.array(z.object({ slug: id, difference: z.string().min(10) })).default([]),
  }).default({ composesWith: [], confusedWith: [] }),
  code: z.array(codeBlockSchema).min(1),
  prompts: z.array(codeBlockSchema).min(1),
  diagram: diagramSchema,
}).superRefine((p, ctx) => {
  for (const msg of diagramIssues(p.diagram as DiagramSpec, p.code as CodeBlock[])) ctx.addIssue({ code: 'custom', message: `[${p.slug}] ${msg}`, path: ['diagram'] });
});

export const familySchema = z.object({
  slug: id, name: z.string().min(1), rank: z.number().int().min(1),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  description: z.string().min(1),
  order: z.array(id),
  constellation: z.object({ x: z.number(), y: z.number(), z: z.number() }),
});

export type Pattern = z.infer<typeof patternSchema>;
export type Family = z.infer<typeof familySchema>;

export function validateCatalog(families: Family[], patterns: Pattern[]): string[] {
  const issues: string[] = [];
  const famBySlug = new Map(families.map(f => [f.slug, f]));
  const patBySlug = new Map(patterns.map(p => [p.slug, p]));
  if (famBySlug.size !== families.length) issues.push('duplicate family slug');
  if (patBySlug.size !== patterns.length) issues.push('duplicate pattern slug');
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
