# Agentic Atlas: Redesign Plan ("instrument" direction)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restyle and restructure the v1 site to the approved "instrument" direction:
- the black/red/cream system;
- a framed live hero;
- a 2D pannable atlas map of live diagrams;
- instrument-style pattern pages with computed stats;
- a tall-card families grid.

Remaining work after that: the content descriptions, QA, and deploy.

**Architecture:** Keep the content model, the diagram engine (compile, frameAt, ELK layout, flow-player explore mode with tooltips), the catalog and the tests. Add:
- `pattern-stats.ts` (pure);
- `Frame.astro` and button styles;
- `AtlasMap.astro` with a vanilla `atlas-map.ts` (DOM transforms, no canvas, no libraries);
- `HeroStage.astro` with an "Another" swap script.

Remove three.js and the constellation.

**Spec:** `docs/superpowers/specs/2026-10-14-agentic-patterns-atlas-design.md` as amended by `docs/superpowers/specs/2026-10-14-atlas-redesign-addendum.md`. **The addendum wins on conflict.**

## Global Constraints

- Everything in `.superpowers/sdd/2026-10-14-agentic-patterns-atlas-v1/global-constraints.md` still applies, except the visual values, which the addendum §1 replaces. Use the addendum's exact tokens.
- Internal links go through `href()` / `joinBase()` from `src/lib/url.ts`.
- **JS budget:** ≤ 15 KB gzip on EVERY page, home with the map included.
- **Accessibility:** WCAG 2.2 AA and axe-clean. The map is keyboard operable. Tooltips meet 1.4.13. Reduced motion means no autoplay and no animated flights. Every page reads without JS.
- **Responsive:** usable at 360px with no horizontal page overflow.
- **Ports:** Playwright honours `PW_PORT`. `scripts/serve-dist.mjs` honours `PORT`. Never kill servers you didn't start; kill only the PIDs you started.
- **Commits:** stage explicit paths only. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No placeholders.** Visual checks (screenshots viewed with Read) are mandatory for every UI task.

## Review Focus

1. **Atlas map:** keyboard walking order follows DOM order (family, then pattern). Enter opens the focused tile. Focus is visible. The pan/zoom state never strands the focused tile off-screen.
2. **Performance on the home page:** 21 live compact diagrams. Only tiles in view and above the zoom threshold animate, verified by counting `flow-player[data-playing="true"]`.
3. **"Another" swap:** after the swap, the new diagram is a live, fully working player (tooltips, steps). The caption updates. No duplicate global listeners. Works with a base path.
4. **Pattern page keyboard shortcuts** (`←` / `→` / `r` / `esc`) never fire while typing in search or other inputs, nor when a modifier key is held.
5. **Stats correctness:** `llmCalls`, `toolCalls`, `parallel` and `loop` match hand counts for 3 real patterns.

---

### Task R1: Design system and site chrome
**Files:**
- Modify: `src/styles/global.css`, `src/layouts/BaseLayout.astro`, `src/components/site/Header.astro`, `src/components/site/Footer.astro`, `package.json` (fonts).
- Create: `src/components/site/Frame.astro`, `src/styles/buttons.css` (or a section in global.css).
- Remove the per-family inline `--family-accent` colouring from layouts and pages, so the accent is always `var(--accent)`. Keep the YAML field.

**Produces:**
- The token names from addendum §1.
- `.btn` and `.btn-primary` classes.
- `Frame.astro` with props `{ label?: string; class?: string }` and a default slot. It renders the viewfinder frame: hairline box, heavier corner brackets, a red corner square.
- The `.mark` red square utility.
- The display type class `.display`.

- [ ] Install fonts: Archivo with the wdth axis via @fontsource; verify that the axis exists, and otherwise pick the closest wide grotesk and note the choice. Remove Instrument Serif and Inter Tight.
- [ ] Rewrite the tokens and base styles. Header: wordmark with a red square, uppercase tracked, nav with a red underline for the active link (via `Astro.url`), Search button styled secondary. Footer restyled.
- [ ] `Frame.astro`, plus a unit-free visual check page in the scratchpad only.
- [ ] Screenshot `/`, `/patterns/routing/` and `/about/` at 1280 and 390. Check type, contrast and nav.
- [ ] Run `npm run check`, `npm test` and the e2e suite (fix selectors broken by the restyle only; no behaviour changes). Run axe on the 4 pages.
- [ ] Commit `feat(design): instrument design system and chrome`.

### Task R2: Diagram restyle
**Files:** `src/components/diagram/diagram.css`, `NodeShape.astro`, `DiagramSvg.astro` (only if needed for styling hooks), the tooltip CSS, and the token colours in `flow-player.ts`, which should be CSS-driven if possible.

Apply addendum §1 diagram styling:
- cream hairline nodes;
- red active and thinking nodes with a glow;
- cream low-opacity edges, red when active;
- cream comet heads with red trails;
- labels in mono uppercase;
- sharp tooltip with a red top rule;
- the Frame around the stage: use `Frame.astro` in `Diagram.astro` for non-compact diagrams.

- [ ] Restyle.
- [ ] Re-run the 21-pattern screenshot sweep at 1280 and 390, mid-scenario, with one tooltip open on 3 of the patterns. View every image.
- [ ] Run the e2e suite and axe on a pattern page (contrast of the cream-on-black text, red on black ≥ 3:1 for graphics).
- [ ] Commit `feat(design): diagram restyle`.

### Task R3: Pattern stats (pure, TDD)
**Files:** create `src/lib/pattern-stats.ts` and `tests/unit/pattern-stats.test.ts`.

**Produces:** `export interface PatternStats { nodes; llmCalls; toolCalls; steps; scenarios; loop: boolean; parallel: boolean; branch: boolean; humanInLoop: boolean }` and `export function patternStats(d: DiagramSpec): PatternStats`. The definitions are exactly those in addendum §3, over the first scenario's compiled timeline (`compileScenario`).

`export function statsLine(s: PatternStats): string` returns e.g. `4 nodes · 3 LLM calls · loop · 2 scenarios`. It includes only the true flags, in the order loop, parallel, branch, human.

- [ ] Write the failing tests: synthetic specs for each stat, plus hand counts for evaluator-optimizer, sectioning and react, loaded from YAML.
- [ ] Implement, then commit `feat(lib): computed pattern stats`.

### Task R4: Home page (hero and atlas map); remove three.js
Depends on R1 and R3.

**Files:**
- Create: `src/components/home/HeroStage.astro`, `src/components/home/hero-swap.ts`, `src/components/atlas/AtlasMap.astro`, `src/components/atlas/atlas-map.ts`, `src/lib/atlas-layout.ts` (pure island and tile positions), `tests/unit/atlas-layout.test.ts`, `tests/e2e/home.spec.ts` (replacing the home parts of `home-family.spec.ts`).
- Delete: `src/components/atlas/Constellation*.astro`, `constellation-scene.ts`, `src/lib/constellation.ts`, `tests/unit/constellation.test.ts`, and the `three` and `@types/three` dependencies.
- Modify: `src/pages/index.astro`.

**Hero:**
- Split layout: copy on the left, a `Frame` with a hero-size `Diagram` on the right.
- The build-time default is a deterministic pick, e.g. the first pattern of the rank-1 family's "featured" choice. Use `evaluator-optimizer` and keep it simple.
- Caption bar in mono: name · `statsLine` · **Open this pattern** · **Another**.
- "Another": pick a random other slug from an inline JSON list of `{slug, name, statsLine}`, then `fetch(joinBase(BASE_URL, 'patterns/<slug>/'))`. Parse it with DOMParser, take the `flow-player` element, and import it into the stage. The custom element connects and works.
  - Update the caption.
  - Re-sync: the swapped player's CodePanel does not exist on home, which is fine.
  - On fetch failure, navigate to the pattern page.
- Buttons: "Open the atlas" (anchor to `#atlas`), "Browse families" (`/families/`), "Show me a random pattern" (navigates to a random pattern page).

**Atlas map:**
- `atlas-layout.ts` computes island centres from family rank on a loose ring or grid, and tile positions packed inside each island (a hex or square grid), with tile size 220×170. It is deterministic and unit-tested: no tile overlaps, and every pattern is placed exactly once.
- `AtlasMap.astro` renders:
  - a viewport div with role="region" and an aria-label;
  - a transformed plane containing island labels and tile `<a>` elements in DOM order (family, then pattern). Each tile holds a compact `Diagram`, the name and the mono stats;
  - the controls: a search input ("Find a pattern"), a "Somewhere new" button, + / − / ⌂ buttons, and a minimap (a small SVG of island rects plus a viewport rect, clickable).
- `atlas-map.ts`:
  - **Pan and zoom:** pan by drag (pointer events, with touch pinch via two pointers). The wheel zooms around the cursor; use ctrl/trackpad pinch on the wheel event and plain wheel; don't hijack page scroll unless the map is focused or hovered (choose: zoom only with the map hovered, show the hint).
  - **Flights:** flyTo(tile) animates the transform; it is instant when reduced motion is on.
  - **Keyboard:** when focus is inside the map, arrow keys move focus to the nearest tile in that direction. Enter follows the link. +/− zoom. `0` resets.
  - **Search:** filters, dims non-matches, and Enter flies to and focuses the first match.
  - **Minimap:** updates on transform.
  - **Playback:** compact players play only when the tile intersects the viewport and the zoom is ≥ 0.6. Otherwise they pause (set an attribute the flow-player respects, or toggle the visibility it already observes).
  - **Budget:** ≤ 6 KB gzip for atlas-map.ts.
- **Without JS:** the plane becomes a normal wrapped grid of tiles via a `.no-js` fallback (CSS: when there is no `data-enhanced` attribute, render static flow).

**Families grid below the map:** reuse the R6 card component if it has landed; otherwise render a simple grid of FamilyCard and leave a TODO-free fallback (the plain card list from v1).

- [ ] TDD for atlas-layout and the e2e home tests:
  - the hero renders, and Another swaps the name and the player works (hover a node gives a tooltip);
  - map arrow-key walking and Enter navigation;
  - search flies to and focuses the match;
  - "Somewhere new" changes the transform;
  - no-JS shows 21 tile links;
  - reduced motion: no animating players;
  - at 360px, no page overflow;
  - the playing-players count is ≤ the tiles in view.
- [ ] Remove three.js and update the budget script (no scene allowance).
- [ ] Visual sweep: home at 1280 and 390, map zoomed out and zoomed into an island. View every image and polish.
- [ ] Commit `feat(home): framed hero and 2D atlas map; remove three.js`.

### Task R5: Pattern page instrument layout
Depends on R1, R3, and 8b merged.

**Files:** `src/pages/patterns/[slug].astro`, `src/components/pattern/PatternHeader.astro`, a new `src/components/pattern/SpecTable.astro`, a new `src/components/pattern/PatternNav.astro`, a new `src/components/pattern/page-keys.ts`, `Badges.astro` (delete once replaced), and `tests/e2e/pattern-page.spec.ts`.

- Top bar: "← Atlas" (`/#atlas`). On the right, `N of 21` in mono and prev / next / random icon buttons. Order is `catalog.patterns`. Random is a link, picked client-side from an inline slug list; without JS it goes to the next pattern.
- Two columns: the framed stage on the left (Diagram), with the right column holding:
  - the family link;
  - the H1 in `.display`;
  - aliases;
  - the summary;
  - "Measured over one run": SpecTable rows for nodes, LLM calls, tool calls, steps, scenarios, loop, parallel, branch, human-in-the-loop, autonomy, cost and latency. Mono values. Each row has a hover/focus explanation using the same tooltip rules (1.4.13).
- Under the stage: the keyboard legend.
- page-keys.ts: ← and → go to prev and next, `r` goes to random, `esc` goes to the atlas. Ignore these when the target is an input, textarea, select or contenteditable, when any modifier key is held, or when the search dialog is open.
- Below: prose plus the sticky CodePanel, the callouts, related patterns, sources. The existing components are restyled.

- [ ] Write the e2e tests: N of 21 is correct for 3 patterns; prev and next wrap or stop at the ends (decide: stop, and disable the buttons); keys navigate; keys are ignored inside the ⌘K search input; the spec table values for evaluator-optimizer match patternStats; code-panel sync still works.
- [ ] Implement it, then do the visual sweep: 3 patterns at 1280 and 390. Commit `feat(pattern): instrument layout with computed stats and neighbour nav`.

### Task R6: Families index and family pages
Depends on R1 and R3.

**Files:** create `src/pages/families/index.astro`, `src/components/site/PatternCard.astro`. Modify `src/pages/families/[slug].astro` (remove the constellation header and the `:global` thumbnail override), Header nav (Families goes to `/families/`), and `tests/e2e/home-family.spec.ts` (move it to `families.spec.ts`).

- PatternCard is a tall card: the compact live diagram on top, then the name, a mono line (`Family · statsLine`) and the summary. The whole card is a link; the compact SVG is aria-hidden, and the h3 gives the name.
- Index: a display H1 "Families of agentic patterns", a lede, then per family a section with a heading, its description, and a grid of PatternCards.
- Family page: the display H1, a mono count, the description, a grid of PatternCards, and the other families.

- [ ] Write the e2e tests: the index has 6 sections and 21 cards; the family page has the right counts; the cards link correctly; no-JS works; 360px has no overflow.
- [ ] Visual sweep at 1280 and 390. Commit `feat(families): families index and tall-card grids`.

### Task R7 (×3, parallel): Node and edge descriptions, plus edge examples
Depends on 7b merged (pattern YAML layout changes).

Split by families, as Tasks 10–12 were:
- (a) workflows, excluding evaluator-optimizer, which is done;
- (b) agent-loops and planning-search;
- (c) knowledge-memory, multi-agent and safety-oversight.

- Every node gets a `description` (10–180 chars): what it does in THIS pattern, concrete.
- Every edge gets a `description` (what flows and why) and an `example` (10–280 chars): a concrete sample payload consistent with the pattern's own pseudocode, prompts and scenario captions.
- The last merged R7 adds a content-test assertion that every node and edge has a description and every edge has an example.

- [ ] Write them. Run `npx vitest run tests/unit/content.test.ts` and `npm run check`. Commit per family group.

### Task R8: Quality gates (the old Task 16, adapted)
Depends on all of the above. Follow the original Task 16 brief, with these changes:
- the budget script has no scene allowance, and home counts;
- the screenshot sweep doesn't click play (there is no play button); it hovers off the stage and uses step buttons to reach a mid-scenario state;
- the axe pages are `/`, `/families/`, `/families/workflows/`, `/patterns/evaluator-optimizer/`, `/patterns/supervisor/`, `/about/`;
- a Lighthouse spot check on `/` and one pattern page.

### Task R9: Deploy (the old Task 17)
Unchanged: GitHub Pages via Actions if `gh` is authenticated, otherwise Vercel, otherwise stop and report.

## Execution order
- R1 and R3 now, in parallel (disjoint files).
- 7b and 8b fix rounds finish, then merge into v1.
- Then R2, R4, R5 and R6 in parallel worktrees (disjoint files). R4 and R6 share PatternCard: R6 owns it, and R4 falls back to the v1 FamilyCard grid if R6 hasn't landed.
- Then the R7 ×3 content tasks (they can start as soon as 7b merges).
- Then R8, R9, the final review and finishing.
