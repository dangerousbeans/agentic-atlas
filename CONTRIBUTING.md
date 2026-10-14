# Contributing to Agentic Atlas

Thanks for helping. The Atlas is a small, curated field guide, so accuracy matters more than volume.

## Ways to help

- **Corrections.** A wrong claim, a bad source, a misleading hover. [Open a correction](https://github.com/dangerousbeans/agentic-atlas/issues/new?template=correction.yml).
- **New patterns.** [Propose one](https://github.com/dangerousbeans/agentic-atlas/issues/new?template=new-pattern.yml) or send a PR.
- **Diagram or layout issues.** Overlapping labels, clipped nodes, odd animation. Include browser and viewport size.
- **Accessibility.** Keyboard, screen reader, contrast and reduced-motion problems.

## How a pattern is structured

Each pattern lives in `src/content/patterns/<slug>/` as two files:

- `pattern.yaml` holds the data.
- `index.mdx` holds the write-up. Use `NodeRef` to link prose to diagram nodes.

`pattern.yaml` contains:

- **Metadata:** `slug`, `name`, `family`, `aliases`, `summary` (10-160 characters), `badges` (autonomy, cost, latency), `sources` (at least one) and `related`.
- **Code and prompts:** `code` and `prompts` blocks, each with an `id`, `title`, `lang` and `source`. Keep pseudocode framework-agnostic.
- **Diagram nodes:** `id`, `kind`, `label` and a required `description` (10-180 characters).
- **Diagram edges:** `from`, `to`, a required `description` (10-180) and a required `example` payload (10-280). An edge `label` is at most 14 characters, as is a token label.
- **Scenarios:** ordered steps that play the trace. A step's `codeRef` (`block` plus `lines`, e.g. `3` or `3-7`) must stay within the block's line count.

`src/lib/schema.ts` is the source of truth, and the build fails on violations. Then add the slug to its family's `order` in `src/content/families/<family>.yaml`, or the pattern will not appear.

## Quality bar

- Accurate, and every source verified (the link works and says what you claim).
- A concrete running example, not an abstract one.
- Hover text on nodes and edges matches what the pseudocode does.
- Restrained prose. No marketing language.

## Local setup

```
npm ci
npm run dev            # dev server
npm test               # unit tests (vitest)
npm run check          # astro check, expect 0 errors
npx playwright test    # e2e
npm run budget         # bundle size budget (after a build)
```

## Pull requests

1. Fork and branch from `main`.
2. Keep the change focused: one pattern or one fix per PR.
3. Run the commands above and fill in the PR template checklist.
4. Attach screenshots for anything visual.

## Licensing

By contributing you agree your work is released under MIT (code) and CC BY 4.0 (content: write-ups, diagrams and prompts). See `LICENSE` and `LICENSE-content`.

## Conduct

Be kind, assume good faith, and keep feedback about the work.
