# Agentic Atlas: Redesign Addendum ("instrument" direction)

**Date:** 2026-10-14
**Amends:** `2026-10-14-agentic-patterns-atlas-design.md` §5 (Pages) and §6 (Visual system). Everything else stands: content model, diagram engine, catalog, testing, budgets and accessibility.
**Reference:** https://www.threebodyorbits.com/, studied on 2026-10-14 (homepage, atlas map, orbit detail page, families grid).
**User decisions:**
- Adopt the reference's black/red/cream system.
- Replace the 3D constellation with a 2D pannable map of live diagrams.
- Earlier the same day: remove the video controls; add hover tooltips for every node and edge, with example payloads on edges.

## 1. Visual system (replaces spec §6)

- **Palette** (one accent):

  | Token | Value | Use |
  |---|---|---|
  | `--bg` | `#120F0E` | warm near-black background |
  | `--bg-1` | `#1A1615` | surfaces |
  | `--bg-2` | `#221D1B` | |
  | `--line` | `#3A302D` | hairlines |
  | `--line-strong` | `#5A4A45` | |
  | `--text` | `#F4EDE7` | cream |
  | `--text-2` | `#B8ABA4` | |
  | `--text-3` | `#8C7F79` | |
  | `--accent` | `#FF3B30` | red |
  | `--accent-soft` | `#FF3B3033` | |

  `--family-accent` maps to `--accent` everywhere. Families are told apart by name and shape, not colour. The `accent` field stays in the family YAML (schema unchanged) but is not used for colour.
- **Type:**
  - Display: Archivo at its widest width (wdth 125) and weight 800, tight leading, for h1 and h2.
  - UI and body: Archivo at normal width.
  - Data, captions and numbers: JetBrains Mono.
  - All fonts are self-hosted via @fontsource. If the Archivo variable font lacks the `wdth` axis in fontsource, use the closest wide grotesk available there and record the choice.
- **Shapes:** sharp corners (radius 0), 1px hairline borders, small 6px red square markers before brand and section labels.
- **Buttons:** primary is solid red with cream text; secondary is a hairline outline.
- **Navigation:** the active link gets a 2px red underline.
- **Frame:** every live visual sits in a "viewfinder" frame. This is a hairline rectangle with heavier corner brackets and one red corner square. It is a reusable `Frame.astro`.
- **Diagram styling:**
  - Nodes: cream hairline shapes.
  - Active and thinking nodes: red stroke with a soft red glow.
  - Edges: cream at low opacity. Active edges are red. Traversed edges are cream at medium opacity.
  - Tokens: cream comet heads with red trails.
  - Loop labels: mono italic is replaced by mono uppercase small caps.
  - Tooltips: sharp, bg-1, a hairline border and a red top rule.
- **Dark only.** All colours are CSS custom properties.

## 2. Pages (replaces spec §5)

1. **Home (`/`)**
   - **Split hero.** Left: a display headline ("An atlas of agentic patterns."), a lede, and buttons: "Open the atlas" (scrolls to the map), "Browse families" and "Show me a random pattern".
   - **Right: a framed live diagram.** It shows a random pattern from the catalog in hero size and autoplays. Below the frame is a mono caption bar: `Name · N nodes · L LLM calls · loop | parallel | branch · S scenarios`, followed by **Open this pattern** and **Another**. "Another" fetches another pattern page and swaps in its diagram; no full reload. The no-JS default is a build-time pick.
   - **The atlas map.** A section headed "The atlas" with a lede and usage hints, which differ for desktop and touch. The map itself is a pannable, zoomable 2D plane.
     - **Layout:** family "islands" are labelled regions positioned by family. Inside each island, each pattern is a tile containing its compact live diagram and its name. Zoomed out, tiles read as clusters. Zoomed in, the diagrams run.
     - **Controls:** a "Find a pattern" search box filters tiles and flies to the match. "Somewhere new" flies to a random pattern. There are + / − / ⌂ zoom buttons and a minimap.
     - **Keyboard and pointer:** with the map focused, arrow keys walk from tile to tile and Enter opens one. Drag pans and the wheel zooms. Touch supports pinch and drag.
     - **Accessibility:** the tiles are real links in DOM order (family, then pattern), so the map is fully usable as a list with a screen reader or without JS.
     - **Performance:** only tiles in view and above a zoom threshold animate. The rest are paused at a representative step.
   - Below the map: the families grid (§2.3 cards).
2. **Pattern page (`/patterns/<slug>/`)**
   - **Top bar:** "← Atlas" on the left. On the right: `7 of 21` in mono, then previous, next and random icon buttons. The order is the catalog order (family rank, then family order).
   - **Main, two columns:**
     - Left: the framed diagram stage. It keeps hover/focus tooltips, scenario tabs, the live caption and step-button navigation.
     - Right:
       - family link, the H1 in display type, aliases;
       - the summary paragraph;
       - **"Measured over one run"**: a spec table with mono values computed at build time from the diagram and metadata (§3);
       - autonomy, cost and latency as rows in the same table.
   - Under the stage: a keyboard legend: `← →` neighbours, `r` random, `esc` atlas. These are page-level shortcuts, ignored while typing in an input.
   - Below, full width: prose sections with the sticky code panel (Pseudocode/Prompts, synced to the step), "often confused with" callouts, related patterns, sources.
3. **Families index (`/families/`)**
   - A display H1, a lede ("21 patterns in 6 families"), then a grid of tall cards: one per pattern, grouped under family headings.
   - Each card has its compact live diagram on top, then the name, a mono line (`Workflows · 4 nodes`) and the one-line summary.
4. **Family page (`/families/<slug>/`)**
   - A display H1, a mono count, the description, the same tall-card grid for its patterns, and links to the other families.
   - There is no 3D header.
5. **About, Search (⌘K), 404:** restyled through the new tokens. There are no structural changes.

## 3. Computed pattern stats (new)

`src/lib/pattern-stats.ts` exports `patternStats(diagram): PatternStats`, a pure function with unit tests. It computes over the **first scenario**, using the compiled timeline:

| Stat | Definition |
|---|---|
| `nodes` | count of nodes |
| `llmCalls` | count of `activate` events with status `thinking` on `llm` or `agent` nodes, plus `branch` events on llm or agent nodes |
| `toolCalls` | count of `send` events whose target node kind is `tool` |
| `steps` | number of expanded steps |
| `scenarios` | number of scenarios |
| `loop` | the diagram has a `loop`-style edge, or a step with `repeat` |
| `parallel` | any step has ≥ 2 `send` events whose windows overlap |
| `branch` | the diagram contains any `branch` event |
| `humanInLoop` | any node of kind `human` |

These feed the pattern page table, the hero caption bar and the card mono lines.

## 4. Removed

- three.js and the constellation: `src/components/atlas/Constellation*`, `constellation-scene.ts`, `src/lib/constellation.ts` and their tests, plus the `three` and `@types/three` dependencies.
- The 200 KB scene budget goes. All pages now fall under the 15 KB JS budget.

## 5. Budgets and accessibility (unchanged except as noted)

- **JS budget:** ≤ 15 KB gzip of JS on every page, including home with the map.
- **Accessibility:** WCAG 2.2 AA, axe-clean.
  - The map is keyboard operable: tab into it, arrows to move, Enter to open.
  - Tooltips meet 1.4.13: dismissible with Esc, hoverable, persistent.
  - Reduced motion: nothing autoplays and the map doesn't animate flights.
- **Responsive:** usable at 360px.
  - The hero stacks with the stage first, as in the reference's mobile layout.
  - The map stays pannable, with touch hints.
