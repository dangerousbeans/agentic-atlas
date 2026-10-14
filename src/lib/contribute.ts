import { author } from './author';

/** Contribution links. Everything points at issue forms or CONTRIBUTING.md on the repo. */
export function issueUrl(template: string, title?: string, body?: string, labels?: string): string {
  const q = new URLSearchParams({ template });
  if (title) q.set('title', title);
  if (body) q.set('body', body);
  if (labels) q.set('labels', labels);
  return `${author.repo}/issues/new?${q.toString().replace(/\+/g, '%20')}`;
}

export const newPatternUrl = () => issueUrl('new-pattern.yml');

export const correctionUrl = (slug?: string, name?: string) =>
  slug && name
    ? issueUrl('correction.yml', `Correction: ${name}`, `Pattern page: https://dangerousbeans.github.io/agentic-atlas/patterns/${slug}/`, 'correction')
    : issueUrl('correction.yml');

export const contributingUrl = () => `${author.repo}/blob/main/CONTRIBUTING.md`;
