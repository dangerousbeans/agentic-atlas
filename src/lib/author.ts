/** The single source for authorship and links. Footer, hero, about, pattern pages and head metadata all read this. */
export const author = {
  name: 'Joran Kikke',
  github: 'https://github.com/dangerousbeans',
  repo: 'https://github.com/dangerousbeans/agentic-atlas',
  site: 'https://dangerousbeans.github.io/agentic-atlas/',
} as const;

/** The GitHub URL for a pattern's source file. */
export const patternSourceUrl = (slug: string) => `${author.repo}/blob/main/src/content/patterns/${slug}/pattern.yaml`;
