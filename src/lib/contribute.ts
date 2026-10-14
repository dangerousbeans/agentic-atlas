import { author } from './author';

/** Contribution links. Everything points at issue forms or CONTRIBUTING.md on the repo.
 *  GitHub issue forms ignore `body` and `labels`; they pre-fill `title` and any field whose `id` is passed as a param. */
export function issueUrl(template: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams({ template, ...params });
  return `${author.repo}/issues/new?${q.toString().replace(/\+/g, '%20')}`;
}

export const newPatternUrl = () => issueUrl('new-pattern.yml');

/** The id of the correction form's page-URL field (.github/ISSUE_TEMPLATE/correction.yml). */
export const CORRECTION_URL_FIELD = 'url';

export const correctionUrl = (slug?: string, name?: string) =>
  slug && name
    ? issueUrl('correction.yml', { title: `Correction: ${name}`, [CORRECTION_URL_FIELD]: `${author.site}patterns/${slug}/` })
    : issueUrl('correction.yml');

export const contributingUrl = () => `${author.repo}/blob/main/CONTRIBUTING.md`;
