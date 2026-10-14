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
- **Prompts:** at least one block in `prompts`. Each has an `id`, `title`, `lang` (`markdown` or `text`) and `source`.
- **Build:** the brief behind the page's "Build it with your AI" tab (see below).
- **Origin:** who introduced or popularized the pattern (see below).
- **Variants** (optional): 1 to 3 alternative topologies, shown as tabs (see below).
- **Diagram nodes:** `id`, `kind`, `label` and a required `description` (10-180 characters). Label length depends on node `size`: `sm` 10, `md` 16, `lg` 22 characters. A `sublabel` is at most 24.
- **Diagram edges:** `from`, `to`, a required `description` (10-180) and a required `example` payload (10-280). An edge `label` is at most 14 characters, as is a token label.
- **Scenarios:** ordered steps that play the trace. A `hidden` node must `appear` in every scenario.
- **Ids** (slug, nodes, edges, prompts, steps, variants) are lowercase kebab-case.

`src/lib/schema.ts` is the source of truth, and the build fails on violations.

### Build

The page turns `build` and `prompts` into one Markdown brief that a reader pastes into Claude Code, Cursor, ChatGPT or any coding assistant (`src/lib/build-prompt.ts`). Write it for that assistant: imperative, concrete, and neutral about provider and language.

- `goal`: one sentence on what the implementation must do.
- `steps`: 3 to 8 ordered, imperative sentences. Cite a prompt as `{{prompt:<id>}}`; it is replaced by the prompt's title, and an unknown id fails validation.
- `stop`: when the loop or flow ends, and what is returned when it fails or hits a cap.
- `requirements`: 3 to 6 bullets: caps, fallbacks, logging, and a test that uses a stub or fake LLM.

### Origin

- `by`: the first author plus "et al.", or the person or organization that coined or popularized it.
- `org` (optional), `year`, `url` (the paper or post).
- `kind`: `introduced` (first described it) or `popularized` (named or spread it). When a later source named a pattern that an earlier paper introduced, use `popularized` and credit the paper in `note`.
- `uncertain: true` when there is no single inventor; `note` is then required and says why.

The header shows "Introduced by ...", "Popularized by ..." or "No single inventor", and the page's JSON-LD cites it.

### Variants

The pattern's own `diagram`, `build` and `prompts` are the default tab, labelled `defaultVariantName` (default "Standard"). Each entry in `variants` is another tab with an `id` (unique, and not `standard`), a `name`, a one-line `summary` and a full `diagram`, held to the same rules and quality bar as the main one. `build`, `prompts` and `origin` are optional and fall back to the pattern's; give a variant its own `build` whenever its flow differs. Add a variant only when the topology changes, not for a prompt tweak. `#variant-<id>` links to a tab.

```yaml
origin:
  by: Erik Schluntz and Barry Zhang
  org: Anthropic
  year: 2024
  url: https://www.anthropic.com/engineering/building-effective-agents
  kind: popularized
  note: "Introduced as Self-Refine by Madaan et al. in 2023."
build:
  goal: "Revise an output until a separate evaluator passes it against every criterion, or a round budget runs out."
  steps:
    - "Call the generator with the {{prompt:generator}}, adding the latest critique after round one."
    - "Send the draft and the criteria to the evaluator with the {{prompt:evaluator}}; parse its JSON."
    - "Return the draft if it passed; otherwise loop back with the critique."
  stop: "Stop on a pass or after 3 rounds; on the cap, return the last draft with its open critique."
  requirements:
    - "Make the round cap a parameter (default 3)."
    - "Log each round's draft, verdict and critique."
    - "Test with a stub LLM that fails twice, then passes."
defaultVariantName: Separate judge
variants:
  - id: self-critique
    name: Same model
    summary: "One model drafts, critiques its own draft, and rewrites until its critique says stop."
    diagram: { ... }   # a full diagram: nodes, edges and scenarios, with descriptions and examples
    build: { ... }     # its own, because the flow differs
    prompts: [ ... ]
    origin: { ... }
```

`src/content/patterns/evaluator-optimizer/pattern.yaml` is the worked reference.

Finally, as its own step, add the slug to its family's `order` in `src/content/families/<family>.yaml`. Without it the pattern will not appear.

## Quality bar

- Accurate, and every source verified (the link works and says what you claim).
- A concrete running example, not an abstract one.
- Hover text on nodes and edges matches the build steps and the prompts, and the running example is the same in the diagram, the build and the prompts.
- Restrained prose. No marketing language.

## Local setup

```
npm ci
npm run dev            # dev server
npm test               # unit tests (vitest)
npm run check          # astro check, expect 0 errors
npx playwright test    # e2e
npm run build          # static build, required before the budget check
npm run budget         # JS size budget (needs the build)
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
