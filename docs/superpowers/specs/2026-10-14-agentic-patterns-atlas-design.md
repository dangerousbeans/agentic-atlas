# Agentic Patterns Atlas: Design Spec

**Date:** 2026-10-14
**Status:** Draft, awaiting review

## 1. Intent

A public, visualization-first website that teaches AI agentic design patterns. Patterns are grouped by family, and each one has an animated, step-through flow diagram plus pseudocode and prompt templates for setting it up.

- **Audience:** engineers and curious builders learning which agentic pattern to reach for and how it works.
- **Positioning:** existing resources are either canonical but thin (Anthropic's essay, cloud vendor docs) or huge, list-like catalogs (200+ entries). The atlas is a *curated* set where every pattern uses one consistent diagram style. The animation shows how the pattern behaves at run time (loops, fan-out, retries), and you control playback.
- **Success criteria:**
  1. Someone unfamiliar with a pattern can watch its diagram and explain its control flow.
  2. Every pattern has copyable pseudocode and prompt templates.
  3. The site is beautiful enough to be shared.
  4. It is fully usable with a keyboard, a screen reader, reduced motion, and without JavaScript (diagrams fall back to captioned static SVG).

**Decisions made with the user:** public showcase; animated flow diagrams; pseudocode + prompts only (no framework code); ~20 patterns in 5–6 families; Astro; build-time SVG + ELK + vanilla player; "Observatory" visual direction; three.js for atmosphere only (atlas and family headers).

## 2. Stack

| Concern | Choice |
|---|---|
| Site | Astro 7, static output, TypeScript strict |
| Content | Astro content collections (`glob()` loader), Zod schemas via `astro/zod` |
| Pattern diagrams | SVG rendered at build time from a declarative spec |
| Layout | `elkjs` (layered algorithm), build time only, with per-node `pos` overrides |
| Playback | `<flow-player>` vanilla TS custom element, ≤ 8 KB gzip |
| Atmosphere | three.js (constellation hero + family headers), lazily loaded islands |
| Code display | `astro-expressive-code` (Shiki) with copy buttons |
| Search | Pagefind (`astro-pagefind`) |
| Tests | Vitest (unit), Playwright (e2e and screenshots), axe-core (accessibility) |
| CI | GitHub Actions |
| Hosting | Vercel or GitHub Pages (decided at deploy time; output is plain static files) |

**Excluded:**
- GSAP, because its license is proprietary and would block open-sourcing the engine.
- React Flow / Svelte Flow: built for editable graphs, heavy, awkward to render on the server.
- Mermaid: generic look and fragile to animate.
- UI frameworks in the diagram path.

## 3. Content model

### 3.1 Families: `src/content/families/<slug>.yaml`

```yaml
slug: workflows
name: Workflows
accent: "#F5B14C"
description: The code fixes the path; the LLMs fill in each step.
order: [prompt-chaining, routing, sectioning, voting, orchestrator-workers, evaluator-optimizer]
constellation: { x: 3.2, y: -1.2, z: 1.5 }   # cluster center for the three.js atlas
```

### 3.2 Patterns: `src/content/patterns/<slug>/`

| File | Contents |
|---|---|
| `pattern.yaml` | metadata and diagram spec (below) |
| `index.mdx` | prose sections: `## Problem`, `## How it works`, `## When to use`, `## When to avoid`, `## Trade-offs`, `## Failure modes` |
| `pseudocode.md` | one or more fenced blocks, each with a `title` (the block id) |
| `prompts.md` | prompt templates as fenced blocks with `{{variable}}` placeholders |

`pattern.yaml` metadata:

```yaml
slug: evaluator-optimizer
name: Evaluator-Optimizer
family: workflows
aliases: [Reflection, Self-Refine, Generator-Critic]
summary: One model drafts, another judges; the loop runs until the work clears the bar.
badges: { autonomy: low, cost: medium, latency: high }     # low | medium | high
sources:
  - { title: Building effective agents, url: https://www.anthropic.com/engineering/building-effective-agents }
  - { title: "Self-Refine (Madaan et al., 2023)", url: https://arxiv.org/abs/2303.17651 }
related:
  composesWith: [prompt-chaining]
  confusedWith:
    - { slug: reflexion, difference: Reflexion persists lessons to memory across attempts; this loop does not. }
diagram: { ... }   # §4.1
```

### 3.3 Validation

- Zod schemas validate every family and pattern file at build time.
- A `superRefine` pass checks cross-references:
  - node, edge, group and scenario ids are unique;
  - every edge endpoint and every event's node or edge exists;
  - `branch.taken` and `notTaken` are outgoing edges of `branch.node`;
  - `codeRef.block` exists in `pseudocode.md` and its line range is within that block;
  - `family`, `related.*` and family `order` slugs exist;
  - every pattern appears in exactly one family's `order`.
- Any violation fails the build, and the error message names the file and the id.

## 4. Diagram engine

### 4.1 Spec format

```ts
type NodeKind = 'io' | 'llm' | 'tool' | 'router' | 'evaluator' | 'aggregator'
              | 'memory' | 'human' | 'guard' | 'agent';

interface DiagramSpec {
  direction?: 'RIGHT' | 'DOWN';                    // wide layout; narrow is always DOWN
  groups?: { id: string; label: string; children: string[] }[];
  nodes: { id: string; kind: NodeKind; label: string; sublabel?: string;
           size?: 'sm' | 'md' | 'lg'; pos?: { x: number; y: number };
           hidden?: boolean }[];                   // hidden until an 'appear' event
  edges: { id: string; from: string; to: string; label?: string;
           style?: 'solid' | 'dashed' | 'loop' }[];
  scenarios: Scenario[];                           // at least 1; the first is the default
}

interface Scenario { id: string; label: string; steps: Step[] }

interface Step {
  id: string;
  caption: string;                                 // required, one sentence
  duration?: number;                               // ms, default 1200
  events: Event[];                                 // events in one step run together
  codeRef?: { block: string; lines: string };      // e.g. "3-7"
  repeat?: number;                                 // expanded at compile time
}

type Event =
  | { type: 'send'; edge: string; at?: [number, number];        // fraction of the step, default [0, 1]
      token: { kind: 'prompt' | 'tool-call' | 'result' | 'feedback' | 'tokens'; label?: string } }
  | { type: 'activate'; node: string; status: 'thinking' | 'calling' | 'waiting' | 'done' | 'error' }
  | { type: 'branch'; node: string; taken: string; notTaken?: string[] }
  | { type: 'appear'; node: string }
  | { type: 'read' | 'write'; node: string };
```

Labels use fixed size buckets, so no text measurement happens at build time. Labels too long for their bucket fail validation.

### 4.2 Build time (`src/lib/diagram/`)

- `compile.ts`: `DiagramSpec` → `Timeline`. It expands `repeat`, assigns absolute `[start, end]` ms to every step and event, and computes the total duration. It is a pure function with unit tests.
- `layout.ts`: runs ELK twice, `RIGHT` for wide and `DOWN` for narrow, and turns ELK bend points into rounded SVG path strings.
  - Edges with `style: loop` get a dedicated arc drawn outside the main flow.
  - Nodes with `pos` set override ELK's position.
  - Results are cached by spec hash.
- `Diagram.astro` outputs:
  - both layouts as inline SVG, switched by a container query;
  - stable `id`s on every node and edge;
  - one shape per `NodeKind` (§6);
  - the timeline as `<script type="application/json">`;
  - an `<ol>` of every step caption, which is the no-JS fallback and is indexed by search;
  - `<title>`/`<desc>` on the SVG.

### 4.3 Runtime: `<flow-player>`

- **Clock:**
  - All state derives from a single time value `t` (ms).
  - Play advances `t` by `dt × speed` on each animation frame.
  - The player starts when the diagram scrolls into view, and it pauses when off-screen or when the tab is hidden.
- **`render(t)`** is pure. It computes:
  - each token's position via cached `getPointAtLength`, with easing;
  - `data-state` on nodes and edges: `idle | active | thinking | calling | waiting | done | error | dim | hidden`;
  - a comet trail of 3 lagged copies of the token;
  - the active `codeRef` lines in the code panel, which get a highlight class.

  The state logic is a separate pure module, `state.ts`, which is unit-tested independently of the DOM.
- **Controls:**
  - Native `<button>`s: play/pause, previous/next step.
  - `<input type="range">` scrub bar.
  - Speed: 0.5×, 1×, 2×.
  - A scenario `<select>`, shown only when a pattern has more than one scenario.
- **Keyboard:** Space toggles play, ←/→ steps, Home/End jumps to start or end.
- **Accessibility:**
  - An `aria-live="polite"` region announces the caption when the step changes, never per frame.
  - `prefers-reduced-motion`: no autoplay, no token travel; each step snaps to its end state with the token parked at its destination.
- **Styling:** colors and glows come from CSS variables, and glows are pre-rendered filters. Only `transform` and `opacity` animate.

### 4.4 Proving the schema first

Evaluator-Optimizer (loop), Routing (branch) and Orchestrator-Workers (workers that appear at run time) are built end to end before any other pattern. The schema is fixed only once all three render, play and pass the tests.

## 5. Pages

1. **Home `/`**
   - three.js constellation hero: each pattern is a star and each family a constellation. Tokens travel the lines.
     - Hovering a star names it; clicking goes to the pattern page.
     - Drag orbits the camera, with auto-rotate.
     - The hero loads as an island when it scrolls into view.
     - With reduced motion, or without WebGL, a pre-rendered static image replaces it.
   - Below the hero:
     - an accessible grid of family cards;
     - a "Start here" path: Augmented LLM → Prompt Chaining → Routing → ReAct → Orchestrator-Workers.
2. **Family `/families/<slug>`**
   - A three.js header showing that family's constellation, with the same fallbacks as the home hero.
   - The family description.
   - A strip of small, synchronized diagrams for each pattern in the family.
   - Links to the other families.
3. **Pattern `/patterns/<slug>`**, in this order:
   1. Header: family chip, name, aliases, summary, badges.
   2. The hero diagram and player.
   3. Problem.
   4. How it works. Inline terms marked `<NodeRef id="…">` highlight that node on hover or focus.
   5. A tabbed Pseudocode / Prompts panel, synced to the player.
   6. When to use / when to avoid.
   7. Trade-offs and failure modes.
   8. "Often confused with" callouts.
   9. Related patterns.
   10. Sources.
   11. Previous and next pattern within the family.
4. **About `/about`:** the diagram legend (one example of each node kind and edge style), methodology, credits.
5. **Search:** a ⌘K overlay powered by Pagefind, with a family filter facet.

## 6. Visual system: Observatory (dark only in v1)

- **Background:** `#0B0F1A`, with a radial vignette toward `#161D3A` and a sparse star-dust layer.
- **Text:** primary `#E6E8F0`, secondary `#AAB0C6`.
- **Type:** Instrument Serif (display), Inter Tight (UI and body), JetBrains Mono (code). Fonts are self-hosted.
- **Family accents** (each verified at ≥ 3:1 against the background for graphics, and checked for text use):

  | Family | Accent |
  |---|---|
  | Workflows | `#F5B14C` |
  | Agent Loops | `#A78BFA` |
  | Planning & Search | `#22D3EE` |
  | Knowledge & Memory | `#34D399` |
  | Multi-Agent | `#FB7185` |
  | Safety & Oversight | `#E9D8A6` |

- **Diagram style:**
  - LLM nodes: glowing rings in the family accent.
  - Tools: rounded squares. Routers: diamonds. Evaluators: rings with a check notch. Memory: stacked arcs. Humans: hexagons. Guards: shields. Aggregators: a funnel ring. Input/output: small dots.
  - Edges: 1px hairlines that brighten when active. Loops: dashed arcs with italic serif labels.
  - Tokens: comets with trails, colored by token kind.
- **Themeability:** every color is a CSS custom property, so a light theme can be added later without rework.

## 7. Catalog: v1 (21 patterns, 6 families)

| # | Family | Pattern | Distinctive visual |
|---|---|---|---|
| 1 | Workflows | Prompt Chaining | sequential calls with a pass/fail gate |
| 2 | Workflows | Routing | the router lights one branch, the others dim |
| 3 | Workflows | Parallelization: Sectioning | fan-out, staggered finishes, fan-in |
| 4 | Workflows | Parallelization: Voting | N identical samples, a vote tally |
| 5 | Workflows | Orchestrator-Workers | workers *appear* at run time |
| 6 | Workflows | Evaluator-Optimizer | generate ↔ evaluate loop with feedback tokens |
| 7 | Agent Loops | Augmented LLM / Tool Use | LLM ↔ tool / retrieval / memory |
| 8 | Agent Loops | ReAct (Autonomous Agent) | thought → action → observation loop, max-iterations badge |
| 9 | Agent Loops | Reflexion | a failed trial writes a lesson to memory, then a retry |
| 10 | Planning & Search | Plan-and-Execute | a checklist ticks off, the replanner edits it |
| 11 | Planning & Search | ReWOO | plan with #E slots filled; the planner is never revisited |
| 12 | Planning & Search | LLMCompiler | a DAG of tool calls; independent ones fire in parallel |
| 13 | Planning & Search | Tree of Thoughts | branch, score, prune, backtrack |
| 14 | Knowledge & Memory | Agentic RAG | agent picks sources iteratively until it has enough |
| 15 | Knowledge & Memory | Corrective RAG (+ Self-RAG scenario) | grader rejects docs, rewrite → web fallback |
| 16 | Knowledge & Memory | Hierarchical Memory (MemGPT-style) | paging between core / recall / archival memory |
| 17 | Multi-Agent | Supervisor (+ hierarchical scenario) | hub and spoke; every result returns to the hub |
| 18 | Multi-Agent | Handoffs | a baton passes control; the active agent glows |
| 19 | Multi-Agent | Debate | all-to-all rounds, then a judge |
| 20 | Safety & Oversight | Human-in-the-Loop | risk gate pauses for approve / edit / reject |
| 21 | Safety & Oversight | Guardrails | parallel input checks, a tripwire stops the flow |

- **Naming rules:** the canonical names above are used everywhere; other names appear in `aliases`.
  - Reflection and Self-Refine are aliases of Evaluator-Optimizer.
  - Planning (Ng's term) is the family name, not a pattern.
  - "Swarm" is not used as a title.
- **Sources:** each pattern's primary source must be verified (title, authors, arXiv ID, URL) before launch. The research pass recalled some IDs from memory, so these are not yet trusted.
- **Deliberately out of v1:** LATS (a note on Tree of Thoughts), Blackboard, Self-RAG as its own page, Hierarchical Teams as its own page, cross-cutting practices (as "concepts"), MCP/A2A (protocols, not patterns), plain RAG and Chain-of-Thought (prerequisites).

## 8. Non-functional requirements

- **JS budgets** (gzip, enforced in CI):
  - Pattern and family pages: ≤ 15 KB, excluding the three.js header island.
  - three.js island: ≤ 200 KB, loaded lazily.
- **Lighthouse** (mobile): Performance ≥ 90, Accessibility 100, on Home and on one pattern page.
- **Responsive:** usable at 360 px width. Diagrams switch to the `DOWN` layout below the breakpoint.
- **Accessibility:** WCAG 2.2 AA, axe-clean on every page type, keyboard-operable player, captions announced to screen readers, honors `prefers-reduced-motion`.
- **No JavaScript:** every page is readable; diagrams show the static SVG with the captions list.

## 9. Testing

- **Vitest:**
  - schema refinements (one failing fixture per rule);
  - `compile.ts` (repeat expansion, timing, `at` windows);
  - `state.ts` (given `t`, the expected node and edge states and token progress, including branch dimming and `appear`);
  - layout path generation (loop arcs, `pos` overrides).
- **Build:** `astro build` validates all content; any schema failure fails CI.
- **Playwright:**
  - the player's play, pause, step, scrub and keyboard controls;
  - the scenario switch;
  - reduced-motion emulation;
  - JavaScript disabled;
  - ⌘K search;
  - screenshots of every pattern diagram at 1280 px and 390 px, reviewed by eye when they change.
- **axe-core:** run on home, a family page, a pattern page and the about page.
- **Budget check:** a script measures the gzipped JS per page from the build output.

## 10. Build order

1. **Scaffold:** Astro + TS, tokens, fonts, base layout, CI skeleton, `.gitignore`.
2. **Diagram pipeline:** schema → compile → layout → `Diagram.astro` → `<flow-player>`, built against the three prove-out patterns.
3. **Pattern page template**, including the code panel sync.
4. **Content:** the remaining 18 patterns, family by family, with sources verified.
5. **Family pages** with the small-diagram strip.
6. **three.js** hero and family headers, plus static fallbacks.
7. **Search, about page, social preview images, deploy.**

## 11. Post-v1 candidates

Compare view (two or three patterns running the same input in sync), light theme, worked-example traces with real model outputs, concept and glossary pages, interactive parameters (N workers, max iterations), and new patterns (Blackboard, LATS).
