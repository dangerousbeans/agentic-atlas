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
        codeBackground: '#0F1424',
        borderColor: '#2A3150',
        borderRadius: '10px',
      },
    }),
    mdx(),
    pagefind(),
  ],
});
