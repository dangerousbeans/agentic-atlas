# Agentic Atlas: Expansion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Ship the expansion addendum (`docs/superpowers/specs/2026-10-14-atlas-expansion-addendum.md`):
- the build-it prompt replaces pseudocode;
- variant tabs;
- creator attribution;
- 52 patterns in 9 families;
- then the opt-in soundscape.

**Global constraints:**
- Everything in the earlier plans' Global Constraints still applies, as amended: the instrument design, budgets ≤ 15 KB JS per page, WCAG 2.2 AA, labels ≥ 9px, the base path via href/joinBase, PW_PORT, kill only your own PIDs.
- Commit identity: the repo is configured with the noreply email. Never commit with another identity.
- Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Tasks

### X1: Engineering (schema, build prompt, variants, origin, families)
Covers addendum §1–§3, plus the 3 new family YAMLs and rank renumbering.
- **Content migration:** strip `code` and `codeRef` from all 21 YAMLs with a script; there is no content rewrite. Add `build` plus `origin` plus 2 `variants` to **evaluator-optimizer** as the worked reference, sourced from research A's evaluator-optimizer variants and origin.
- **Schema rollout:** `build` and `origin` are optional in the schema during migration. A content test lists the patterns still missing them; it fails only after X3.
- **Atlas layout:** check it handles 9 islands and about 52 tiles (unit test). The 6-tile play cap still holds.
- **CONTRIBUTING.md:** update it (no codeRef; build, variants and origin).
- **Tests:**
  - unit: composeBuildPrompt; the variant schema; origin rendering;
  - e2e: copy button, variant tabs plus hash deep-link plus no-JS stacking, the "Introduced by" line, JSON-LD citation, readability for variant diagrams, budget.

### X2 (×3, parallel): existing 21 patterns, adding build + origin + variants
Groups follow the research files:
- (a) workflows except evaluator-optimizer;
- (b) agent-loops, planning-search and knowledge-memory;
- (c) multi-agent and safety-oversight.

### X3 (×5, parallel): 31 new patterns, written in full
Full content means pattern.yaml with build, origin, variants where the research proposes them, prompts, the diagram with descriptions and examples, and index.mdx prose. Groups:
- (a) reasoning-prompting: 5
- (b) planning-search 2 + agent-loops 2
- (c) knowledge-memory: 5
- (d) multi-agent: 5
- (e) safety-oversight 4 + reliability-runtime 4 + efficiency-cost 4. This group is large, so split it into (e1) safety and (e2) reliability + efficiency.

Then make `build` and `origin` required.

### X4: QA re-run
All gates; a screenshot sweep of all 52 patterns plus their variants; a readability spec over every variant; draw-perf; Lighthouse; a fresh og.png.

### X5: Soundscape (opt-in)
- Off by default, with a header toggle stored in localStorage.
- Web Audio synthesis is lazy-loaded on first enable (≤ 3 KB gzip).
- Tones per token kind; a completion chord; a reject/trip thunk.
- Only the focused diagram sounds.
- With reduced motion, only step cues play.
- WCAG 1.4.2 is respected.

### X6: Final review, then push
