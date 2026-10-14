import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';
import pagefind from 'astro-pagefind';

export default defineConfig({
  output: 'static',
  integrations: [
    expressiveCode(),
    mdx(),
    pagefind(),
  ],
});
