# Agentic Atlas: Expansion Addendum

**Date:** 2026-10-14
**Amends:** the design spec plus the instrument redesign addendum. Wherever this document conflicts with them, this document wins.
**Research:** `docs/research/expansion-A.md`, `docs/research/expansion-B.md`.

**User decisions** (2026-10-14):
- Replace pseudocode with a copy-paste "build it with your own LLM" prompt aimed at an AI coding assistant.
- Grow the catalog to about 50 patterns, with variants shown as tabs inside a pattern.
- Attribute each pattern's creators where possible.
- Add an opt-in soundscape (separate, later task).

## 1. "Build it with your AI" replaces pseudocode

- **Remove** the pattern `code` blocks, step `codeRef`, the CodePanel line-sync, `flowstep.detail.codeRef` and the `data-code-ref` mirror.
- **Add `build`** to each pattern, and optionally to each variant:

  ```yaml
  build:
    goal: one sentence on what the implementation must do
    steps:            # 3–8 ordered, imperative sentences; may reference prompts by id as {{prompt:generator}}
      - ...
    stop: when the loop or flow ends and what is returned on failure
    requirements:     # 3–6 bullets: caps, fallbacks, logging, a test using a fake/stub LLM
      - ...
  ```

- **`composeBuildPrompt(pattern, variant?)`** is a pure function with unit tests. It produces the copyable Markdown in this order:
  1. a header: "Implement the <Name> pattern<variant suffix> in this codebase, using the LLM client and language we already use.";
  2. "Goal";
  3. "How it works" (numbered steps, with prompt references expanded to the prompt titles);
  4. "Prompts", each template verbatim, fenced;
  5. "Stop rule";
  6. "Requirements".

  The output is provider- and language-neutral.
- **Pattern page tabs:** "Build it with your AI" (default; the composed text in a code block with a Copy button and a short "Paste this into Claude Code, Cursor, ChatGPT…" hint) and "Prompts" (unchanged).
- **Schema:** `build` is required on patterns once every pattern has it.
- **Pattern stats are unaffected.**

## 2. Variants (tabs inside a pattern)

```yaml
variants:            # optional; 1–3 alternatives besides the default
  - id: separate-judge          # kebab-case, unique within the pattern
    name: Separate judge model
    summary: one line on how it differs
    diagram: { ... }            # full DiagramSpec (it may reuse parent node ids)
    build: { ... }              # optional; falls back to the parent's
    prompts: [ ... ]            # optional; falls back to the parent's
    origin: { ... }             # optional
```

- The pattern's own `diagram`, `build` and `prompts` form the **default variant**. Its tab label is `defaultVariantName` (optional; defaults to "Standard").
- **Page:** when variants exist, a variant tablist above the stage (role=tablist).
  - Switching swaps the diagram (each variant's SVG is pre-rendered; only the active one is shown), the build prompt, the prompts, the stats table and the "Introduced by" line if it's overridden.
  - The URL hash `#variant-<id>` deep-links a variant.
  - Without JS, every variant renders stacked with headings.
- **Atlas tiles and cards** show the default variant only, plus a mono "+N variants" note.
- **Validation:** variant diagrams pass the same `diagramIssues`. Variant ids are unique. Pattern stats are computed per variant.

## 3. Creator attribution

```yaml
origin:
  by: "Shunyu Yao et al."        # first author + et al., or the org/person that coined or popularized it
  org: "Princeton University, Google Research"   # optional
  year: 2022
  url: https://arxiv.org/abs/2210.03629
  kind: introduced               # introduced | popularized
  note: optional; required when uncertain
  uncertain: false               # true → the UI says "Origin: no single inventor" + note
```

- **Pattern header:** "Introduced by Yao et al. (2022) · Princeton & Google ↗" for kind `introduced`, or "Popularized by Anthropic (2024) ↗" for kind `popularized`. When `uncertain`, it shows "No single inventor" plus the note.
- **Atlas tile and card tooltips** get a short form, e.g. "Yao et al. 2022".
- **JSON-LD:** each pattern page adds `citation`, a CreativeWork with author and url.
- **Required** on every pattern (`uncertain: true` is allowed). Origins come from the verified research files.

## 4. Catalog: 52 patterns, 9 families

Family ranks:

| Rank | Family | Status |
|---|---|---|
| 1 | workflows | |
| 2 | reasoning-prompting | new |
| 3 | agent-loops | |
| 4 | planning-search | |
| 5 | knowledge-memory | |
| 6 | multi-agent | |
| 7 | safety-oversight | |
| 8 | reliability-runtime | new |
| 9 | efficiency-cost | new |

New patterns and family orders come from the research files:
- reasoning-prompting: chain-of-thought, least-to-most, self-ask, chain-of-verification, program-aided-reasoning
- planning-search: + graph-of-thoughts, lats
- knowledge-memory: + hyde, multi-query-rag, retrieve-and-rerank, graph-rag, memory-stream (hierarchical-memory moves last)
- agent-loops: + codeact, critic
- multi-agent: + group-chat, role-play, sop-team, blackboard, mixture-of-agents
- safety-oversight: + permission-policies, sandboxed-execution, dual-llm, llm-as-judge
- reliability-runtime: schema-repair, model-fallback, durable-execution, ambient-agent
- efficiency-cost: model-cascade, caching, batch-processing, skeleton-of-thought

Variants for the existing 21 come from the research files. Each pattern gets 1–3; prompt-only tweaks are excluded.

The `accent` values for new families follow the research suggestions. They are data only; the UI stays red, black and cream.

## 5. Unchanged

The visual system, tooltips and descriptions, readability floor, accessibility, performance budgets, the base path, deploy and the content quality bar all stay as they are. Every new pattern needs node and edge descriptions plus edge examples, and its sources verified.
