import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { patternSchema, familySchema } from './lib/schema';

export const collections = {
  families: defineCollection({ loader: glob({ pattern: '*.yaml', base: './src/content/families' }), schema: familySchema }),
  patterns: defineCollection({
    loader: glob({ pattern: '*/pattern.yaml', base: './src/content/patterns', generateId: ({ entry }) => entry.split('/')[0] }),
    schema: patternSchema,
  }),
  patternProse: defineCollection({
    loader: glob({ pattern: '*/index.mdx', base: './src/content/patterns', generateId: ({ entry }) => entry.split('/')[0] }),
  }),
};
