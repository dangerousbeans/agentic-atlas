import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';
import pagefind from 'astro-pagefind';

export default defineConfig({
  output: 'static',
  integrations: [
    expressiveCode({
      themes: ['github-dark-dimmed'],
      styleOverrides: {
        codeFontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
        codeBackground: '#1A1615',
        borderColor: '#3A302D',
        borderRadius: '0',
      },
    }),
    mdx(),
    pagefind(),
  ],
});
