import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';
import pagefind from 'astro-pagefind';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://dangerousbeans.github.io',
  base: process.env.BASE_PATH ?? '/',
  output: 'static',
  integrations: [
    expressiveCode(),
    mdx(),
    pagefind(),
  ],
});
