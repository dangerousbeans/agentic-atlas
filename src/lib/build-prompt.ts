import type { Build, Pattern, Prompt } from './schema';

/** `{{prompt:<id>}}` in a build step: replaced by that prompt's title in the composed text. */
export const PROMPT_REF_ALL = /\{\{prompt:([a-z0-9][a-z0-9-]*)\}\}/g;

/** What composeBuildPrompt needs from a variant (a schema Variant or a ResolvedVariant both fit). */
export interface BuildVariant { name: string; isDefault?: boolean; build?: Build; prompts?: Prompt[] }

function fenced(source: string, lang: string): string {
  const body = source.replace(/\n+$/, '');
  const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map(m => m[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${body}\n${fence}`;
}

/**
 * The copy-paste brief for an AI coding assistant (expansion addendum §1): a header, Goal, How it works, Prompts,
 * Stop rule and Requirements, in that order, as Markdown. Provider- and language-neutral. A variant without its own
 * build or prompts uses the pattern's.
 */
export function composeBuildPrompt(pattern: Pattern, variant?: BuildVariant): string {
  const own = variant && !variant.isDefault ? variant : undefined;
  const build = own?.build ?? pattern.build;
  const prompts = own?.prompts ?? pattern.prompts;
  const titles = new Map(prompts.map(p => [p.id, p.title]));
  const expand = (s: string) => s.replace(PROMPT_REF_ALL, (whole, id: string) => titles.get(id) ?? whole);

  const suffix = own ? ` (${own.name} variant)` : '';
  const out: string[] = [`Implement the ${pattern.name} pattern${suffix} in this codebase, using the LLM client and language we already use.`];

  out.push('## Goal', expand(build.goal));
  out.push('## How it works', build.steps.map((s, i) => `${i + 1}. ${expand(s)}`).join('\n'));
  out.push('## Prompts', ...prompts.flatMap(p => [`### ${p.title}`, fenced(p.source, p.lang)]));
  out.push('## Stop rule', expand(build.stop));
  out.push('## Requirements', build.requirements.map(r => `- ${expand(r)}`).join('\n'));
  return out.join('\n\n') + '\n';
}
