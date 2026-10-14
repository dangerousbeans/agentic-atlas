# Expansion research A: Reasoning & Prompting, Planning & Search, Knowledge & Memory, Efficiency & Cost (2026-10-14)

Notation follows `docs/research/pattern-catalog.md`: `→` sequential, `⇉` parallel fan-out/fan-in, `?` conditional, `↺` loop, `(dashed)` for context/side-channel edges. Node kinds: io / llm / tool / router / evaluator / aggregator / memory / human / guard / agent.

**Verification:** every arXiv ID below was checked against the arXiv API (title + author list), and authors, year and affiliations were read off page 1 of the PDF. The web sources were fetched with WebFetch. The few attributions that couldn't be confirmed are marked **uncertain**.

Totals: 16 new patterns, 2 new families, 35 variant tabs across the 13 existing patterns in scope. That is 13 defaults (the current topology) plus 22 new alternatives. The new patterns carry another 20 variant tabs (CoVe 4, PAL/PoT 2, LATS/RAP 2, multi-query 3, cascade 3, caching 3, batch 2, SoT 1).

---

## New families

| slug | Name | Description | Rank / placement | Accent (suggested) |
|---|---|---|---|---|
| reasoning-prompting | Reasoning & Prompting | Shape how one model thinks inside a call or a short fixed chain: decompose, ask follow-ups, verify its own claims, or hand the arithmetic to code. | rank 2. It sits between Workflows (code fixes the path) and Agent Loops (the model picks actions), because these patterns are single calls or short model-directed chains with at most one tool. All later ranks shift down by 1. | #60A5FA |
| efficiency-cost | Efficiency & Cost | Spend fewer tokens, dollars and seconds: escalate only when needed, reuse what was already computed, parallelize generation, and batch what can wait. | rank 7, last, next to Safety & Oversight. Like guardrails, these patterns wrap any other pattern instead of defining the task flow. | #A3E635 |

Proposed `order` arrays:
- reasoning-prompting: [chain-of-thought, least-to-most, self-ask, chain-of-verification, program-aided-reasoning]
- planning-search (append): [..., tree-of-thoughts, graph-of-thoughts, lats]
- knowledge-memory (append): [..., hyde, multi-query-rag, retrieve-and-rerank, graph-rag, memory-stream]. Move hierarchical-memory to the end, after memory-stream, so the two memory patterns sit together.
- efficiency-cost: [model-cascade, caching, batch-processing, skeleton-of-thought]

---

## New patterns

### Reasoning & Prompting (new family)

22. **chain-of-thought: Chain-of-Thought**
    - Family: reasoning-prompting (the family's building block, playing the role augmented-llm plays in Agent Loops).
    - Aliases: CoT, Step-by-step reasoning, Zero-shot CoT ("Let's think step by step"), Extended thinking.
    - Summary: The model writes out intermediate reasoning steps before its final answer, all inside one call.
    - Use when: the task needs multi-step arithmetic, logic or symbolic manipulation. Avoid when: it's a single-hop lookup, latency is critical, or a reasoning model already thinks natively (adding CoT only duplicates that work).
    - Sources: Wei et al., "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", https://arxiv.org/abs/2201.11903. Kojima et al., "Large Language Models are Zero-Shot Reasoners", https://arxiv.org/abs/2205.11916.
    - Origin: by Jason Wei et al.; org Google Research, Brain Team; 2022; https://arxiv.org/abs/2201.11903; kind introduced.
    - Running example: "A café sells 3 muffins for $5. What do 12 muffins and 2 coffees at $3.50 cost?"
    - Nodes: user(io), llm, group "one call" { s1(llm, "12 ÷ 3 = 4 packs"), s2(llm, "4 × $5 = $20"), s3(llm, "2 × $3.50 = $7") }, out(io, "$27").
    - Edges: user→s1→s2→s3→out. All steps sit inside one call frame.
    - Scenarios:
      - "step by step": user→llm; s1, s2 and s3 light up in turn inside the frame; s3→out ("$27").
      - "no CoT" (contrast): user→llm→out directly, with label "$25" in error colour.
    - Distinctive visual: thought bubbles stack up inside a single call boundary, so there is only one round trip.
    - Often confused with: prompt-chaining. Chaining makes several LLM calls with code gates between them; CoT is one call whose output includes the steps.

23. **least-to-most: Least-to-Most Prompting**
    - Family: reasoning-prompting.
    - Aliases: Decompose-then-solve, Successive prompting, Easy-to-hard decomposition.
    - Summary: First ask the model to break the problem into easier subquestions, then solve them in order, feeding each answer into the next.
    - Use when: the problems are harder than your examples and split into sub-problems that build on each other. Avoid when: the sub-problems are independent (use sectioning), or the steps need tools or outside facts (use self-ask or plan-and-execute).
    - Source: Zhou et al., "Least-to-Most Prompting Enables Complex Reasoning in Large Language Models", https://arxiv.org/abs/2205.10625 (ICLR 2023).
    - Origin: by Denny Zhou et al.; org Google Research, Brain Team; 2022; https://arxiv.org/abs/2205.10625; kind introduced.
    - Running example (from the paper): "Amy takes 4 min to climb the slide and 1 min to slide down. The slide closes in 15 min. How many times can she slide?"
    - Nodes: user(io), decomposer(llm), subqs(memory, "Q1 Q2"), solver(llm), out(io).
    - Edges: user→decomposer→subqs; subqs→solver; solver→subqs (↺, appends the answer and picks the next subquestion); solver→out.
    - Scenarios:
      - "decompose then solve": decomposer emits "Q1: how long per trip? Q2: how many trips in 15 min?"; ↺ ×2 (subqs→solver, solver→subqs labelled "A1 = 5 min"); then solver→out ("3").
    - Distinctive visual: a to-do list where each answered subquestion's answer feeds into the next line.
    - Often confused with: plan-and-execute. Least-to-most has no tools and no replanner, and the answers accumulate in the prompt. It also differs from prompt-chaining because the model chooses the steps, not the code.

24. **self-ask: Self-Ask**
    - Family: reasoning-prompting.
    - Aliases: Self-ask with search, Follow-up questioning.
    - Summary: The model explicitly asks itself follow-up questions, answers each one (optionally with a search engine), then composes the final answer.
    - Use when: answering a multi-hop factual question means combining facts the model may not hold together. Avoid when: the task needs varied tools or actions (use react).
    - Source: Press et al., "Measuring and Narrowing the Compositionality Gap in Language Models", https://arxiv.org/abs/2210.03350 (Findings of EMNLP 2023).
    - Origin: by Ofir Press et al.; org University of Washington, MosaicML, Meta AI Research, Allen Institute for AI; 2022; https://arxiv.org/abs/2210.03350; kind introduced.
    - Running example: "Who was US president when the Eiffel Tower was completed?"
    - Nodes: user(io), llm, search(tool), out(io).
    - Edges: user→llm; llm→search (labelled "Follow up:"); search→llm (labelled "Intermediate answer:") ↺; llm→out ("So the final answer is:").
    - Scenarios:
      - "two hops": llm→search "When was the Eiffel Tower completed?" → "1889"; llm→search "Who was US president in 1889?" → "Benjamin Harrison"; llm→out.
      - "no search": the same Q/A scaffold, but the llm answers its own follow-ups (a self-loop on llm).
    - Distinctive visual: a ledger of labelled Follow-up / Intermediate-answer pairs builds up beside the llm.
    - Often confused with: react. Self-Ask has one tool and a rigid Q/A scaffold, and its only "action" is asking a sub-question. It differs from least-to-most because the questions come one at a time, not all upfront.

25. **chain-of-verification: Chain-of-Verification**
    - Family: reasoning-prompting.
    - Aliases: CoVe, Factored verification, Draft-verify-revise.
    - Summary: Draft an answer, plan verification questions about its claims, answer each one independently without seeing the draft, then rewrite the answer to match.
    - Use when: answers are lists of facts or long-form text and hallucination is the main risk. Avoid when: the claims can be checked against a real source (prefer retrieval or tools), or the answer is short and atomic.
    - Source: Dhuliawala et al., "Chain-of-Verification Reduces Hallucination in Large Language Models", https://arxiv.org/abs/2309.11495.
    - Origin: by Shehzaad Dhuliawala et al.; org Meta AI, ETH Zürich; 2023; https://arxiv.org/abs/2309.11495; kind introduced.
    - Running example (from the paper): "Name some politicians who were born in New York City."
    - Nodes: user(io), drafter(llm), planner(llm), v1, v2, v3 (llm, isolated), reviser(llm), out(io).
    - Edges: user→drafter→planner; planner⇉v1,v2,v3; v1,v2,v3⇉reviser; drafter→reviser (dashed, carries the draft); reviser→out. There is no edge drafter→v*, and that absence is the point.
    - Scenarios:
      - "catches a hallucination": the draft lists "Clinton, Bloomberg, Trump"; the planner asks "Where was Hillary Clinton born?" and similar; v1 returns "Chicago" (error colour); reviser→out shows the corrected list with Clinton struck through.
      - "all verified": every v returns ok and the reviser passes the draft through.
    - Distinctive visual: a wall or curtain hides the draft from the verifier nodes, and claims get struck through in the final answer.
    - Often confused with: evaluator-optimizer. CoVe doesn't loop and has no judge giving a score; it probes claims with independent Q/A. It differs from corrective-rag, which checks retrieved documents, not the model's own claims.
    - Variants of this new pattern (from the paper): joint (plan and answer in one prompt) / two-step / factored (each question answered separately, the default) / factor+revise (an extra explicit step that checks consistency per claim).

26. **program-aided-reasoning: Program-Aided Reasoning**
    - Family: reasoning-prompting.
    - Aliases: PAL, Program of Thoughts (PoT), Code-as-reasoning, Code interpreter reasoning.
    - Summary: The model writes a program that encodes its reasoning, an interpreter runs it, and the program's output is the answer.
    - Use when: there is arithmetic, dates, counting or symbolic manipulation, and LLM computation is the weak link. Avoid when: there's no sandbox, or the reasoning is qualitative and doesn't translate into code.
    - Sources: Gao et al., "PAL: Program-aided Language Models", https://arxiv.org/abs/2211.10435. Chen et al., "Program of Thoughts Prompting: Disentangling Computation from Reasoning for Numerical Reasoning Tasks", https://arxiv.org/abs/2211.12588 (TMLR 2023).
    - Origin: by Luyu Gao, Aman Madaan, Shuyan Zhou et al. (equal first authors); org Carnegie Mellon University; 2022; https://arxiv.org/abs/2211.10435; kind introduced. Co-origin, concurrent: Wenhu Chen et al., University of Waterloo, Vector Institute, UC Santa Barbara, Google Research; 2022; kind introduced.
    - Running example (from PAL): "Roger has 5 tennis balls. He buys 2 cans of 3. How many does he have?"
    - Nodes: user(io), llm, interpreter(tool), out(io).
    - Edges: user→llm→interpreter (token is a code block `balls = 5 + 2*3`); interpreter→out ("11"); interpreter→llm (dashed, ↺ on exception; this is an extension, not in the original paper).
    - Scenarios:
      - "runs clean": llm→interpreter with a code token; interpreter→out.
      - "traceback" (extension): interpreter→llm with an error token, llm→interpreter with fixed code, then →out.
    - Distinctive visual: the edge token is a code card, and the answer comes from the tool, never from the llm.
    - Often confused with: augmented-llm / react. Here there is one code generation and the interpreter's result is the answer; there is no multi-turn deliberation.
    - Variants: PAL (the code is interleaved with NL comments as reasoning) vs PoT (the code is pure computation; optionally the llm reads the result and phrases the answer, adding an interpreter→llm→out step).

### Planning & Search

27. **graph-of-thoughts: Graph of Thoughts**
    - Family: planning-search.
    - Aliases: GoT, Thought graph.
    - Summary: Thoughts are nodes in an arbitrary graph. As well as branching and scoring them, you can merge several partial thoughts into one and refine a thought in a loop.
    - Use when: the problem splits into sub-results that must be combined (sorting, set operations, merging documents). Avoid when: plain branching and pruning is enough (tree-of-thoughts), or the cost of many calls isn't justified.
    - Source: Besta et al., "Graph of Thoughts: Solving Elaborate Problems with Large Language Models", https://arxiv.org/abs/2308.09687 (AAAI 2024).
    - Origin: by Maciej Besta, Nils Blach et al.; org ETH Zurich, Warsaw University of Technology, Cledar; 2023; https://arxiv.org/abs/2308.09687; kind introduced.
    - Running example (from the paper's sorting task): "Sort these 32 numbers (with duplicates)."
    - Nodes: problem(io), split(llm), t1, t2, t3, t4 (llm, sort each chunk of 8), scorer(evaluator), merge1, merge2 (aggregator, LLM merge), mergeF(aggregator), refine(llm), out(io).
    - Edges: problem→split⇉t1..t4; t*→scorer; t1,t2⇉merge1; t3,t4⇉merge2; merge1,merge2⇉mergeF; mergeF→refine; refine→refine (↺ "fix errors"); refine→out.
    - Scenarios:
      - "split-sort-merge": fan-out; one chunk scores badly and is regenerated (t2 error, then t2 re-lit); pairwise merges; one refine pass; out.
    - Distinctive visual: many-to-one edges, with branches converging back together, which a tree can't draw.
    - Often confused with: tree-of-thoughts. ToT only branches and prunes; GoT adds aggregation (merging) and refinement loops. It differs from sectioning because thoughts are scored and regenerated, and the merges are LLM calls arranged in a graph of operations.

28. **lats: Language Agent Tree Search**
    - Family: planning-search.
    - Decision: a separate pattern, not a ToT variant. LATS acts in a real environment (tool calls), backpropagates value along the path and writes reflections, so it needs three node kinds that ToT doesn't have (tool, memory, a backprop loop). Remove the LATS note from tree-of-thoughts aliases and add "see lats".
    - Aliases: LATS, MCTS agent, Agent tree search.
    - Summary: Monte Carlo Tree Search over agent actions: select a promising node, expand it with sampled actions, run them in the environment, score them with an LLM value function, backpropagate, and write reflections on failed trajectories.
    - Use when: the environment gives feedback (tests, web pages, a game), you can reset it or branch from a state, and accuracy matters more than cost. Avoid when: actions are irreversible (you can't branch), or the budget is tight.
    - Source: Zhou et al., "Language Agent Tree Search Unifies Reasoning, Acting, and Planning in Language Models", https://arxiv.org/abs/2310.04406 (ICML 2024).
    - Origin: by Andy Zhou et al.; org University of Illinois Urbana-Champaign, Lapis Labs; 2023; https://arxiv.org/abs/2310.04406; kind introduced.
    - Running example: "Write `is_valid_bracket_seq(s)` so the hidden unit tests pass" (the paper evaluates on HumanEval).
    - Nodes: task(io), selector(router, UCT), expander(llm), env(tool, runs code / tests), value(evaluator), reflector(llm), reflections(memory), out(io).
    - Edges: task→selector→expander; expander⇉env (k children); env→value; value→selector (↺ dashed, "backprop"); env?fail at a terminal→reflector→reflections; reflections→expander (dashed); value?solved→out.
    - Scenarios:
      - "two rollouts": rollout 1: select root, expand 2 children, env runs them, value scores them, backprop; a terminal fails, so reflector→reflections ("forgot the empty string"). Rollout 2: selector picks the higher-value child, the expander reads reflections, env passes, and →out.
    - Distinctive visual: a search tree whose node visit counts and values tick up along the highlighted backprop path; sticky notes (reflections) attach to the expander.
    - Often confused with: tree-of-thoughts (no acting, no backprop) and reflexion (linear retries with no tree).
    - Variant of this new pattern: **rap: RAP (Reasoning via Planning)**. The LLM acts as a world model that simulates the next state instead of calling a real environment, so the env(tool) node becomes world-model(llm). Source: Hao et al., "Reasoning with Language Model is Planning with World Model", https://arxiv.org/abs/2305.14992 (UC San Diego, University of Florida, MBZUAI; 2023).

### Knowledge & Memory

29. **hyde: HyDE (Hypothetical Document Embeddings)**
    - Family: knowledge-memory.
    - Aliases: Hypothetical document retrieval, Generate-then-retrieve, Answer-first retrieval.
    - Summary: Have the LLM write a hypothetical answer passage, embed that passage instead of the query, and retrieve the real documents closest to it.
    - Use when: queries are short or worded very differently from the documents, and you have no labelled data to tune the retriever. Avoid when: the model knows nothing about the domain (the fake passage points the wrong way), or exact keyword matching matters (IDs, codes).
    - Source: Gao et al., "Precise Zero-Shot Dense Retrieval without Relevance Labels", https://arxiv.org/abs/2212.10496 (ACL 2023).
    - Origin: by Luyu Gao et al.; org Carnegie Mellon University, University of Waterloo; 2022; https://arxiv.org/abs/2212.10496; kind introduced.
    - Running example: "Why does my sourdough collapse in the oven?"
    - Nodes: user(io), writer(llm), embed(tool), vectordb(memory), generator(llm), out(io).
    - Edges: user→writer→embed→vectordb→generator→out; user→generator (dashed, the original question).
    - Scenarios:
      - "fake doc finds real docs": writer emits a ghost-styled passage ("…overproofing weakens gluten…"); embed; vectordb returns 3 real docs; generator→out.
    - Distinctive visual: the hypothetical document is drawn dashed or ghosted, and its vector lands in a cluster of real document dots.
    - Often confused with: multi-query-rag. HyDE produces one answer-shaped passage, not several queries. It differs from corrective-rag, which rewrites the query only after grading fails.

30. **multi-query-rag: Multi-Query RAG**
    - Family: knowledge-memory.
    - Aliases: RAG-Fusion, Query expansion, Query decomposition, Sub-question retrieval.
    - Summary: Rewrite one question into several queries (paraphrases or sub-questions), retrieve for each in parallel, then fuse the ranked lists (e.g. with Reciprocal Rank Fusion) before generating.
    - Use when: the question is ambiguous, multi-faceted or worded badly, and recall matters. Avoid when: queries are already precise (it adds cost and drift), or the sub-questions depend on each other (use agentic-rag or self-ask).
    - Sources: Raudaschl, "Forget RAG, the Future is RAG-Fusion" (Oct 2023), https://adrianraudaschl.com/blog/forget-rag-the-future-is-rag-fusion/ and https://github.com/Raudaschl/rag-fusion. Rackauckas, "RAG-Fusion: a New Take on Retrieval-Augmented Generation", https://arxiv.org/abs/2402.03367. Ma et al., "Query Rewriting for Retrieval-Augmented Large Language Models", https://arxiv.org/abs/2305.14283.
    - Origin: by Adrian Raudaschl; org independent (blog, originally on Medium); 2023; https://adrianraudaschl.com/blog/forget-rag-the-future-is-rag-fusion/; kind popularized. **uncertain**: generating multiple queries and fusing ranks predates this in classic IR (query expansion, RRF), and LangChain's MultiQueryRetriever is around the same time. There is no single inventor.
    - Running example: "Is a Model Y cheaper to run than a Camry?" → "EV cost per mile", "Camry fuel economy mpg", "EV vs gas insurance and maintenance".
    - Nodes: user(io), rewriter(llm), r1, r2, r3 (memory, retrievals), fuse(aggregator, RRF), generator(llm), out(io).
    - Edges: user→rewriter⇉r1,r2,r3; r1,r2,r3⇉fuse; fuse→generator→out; user→generator (dashed).
    - Scenarios:
      - "fusion": three queries fan out; three ranked lists come back; fuse shows doc D7 rising (it appears in all three lists); generator→out.
    - Distinctive visual: one query beam splits into a prism of three, and three ranked lists interleave into one with 1/(60+rank) scores.
    - Often confused with: agentic-rag. Multi-query is a fixed one-shot fan-out with no decision about whether or where to retrieve, and no loop. It differs from sectioning because the fan-out is over queries for the same answer, not over subtasks.
    - Variants of this new pattern: rag-fusion (paraphrases + RRF) / sub-question (each sub-question is answered by its own generator, then a combiner writes the final answer, which adds per-branch llm nodes) / step-back query (retrieve with an abstracted question as well as the original; Zheng et al., "Take a Step Back: Evoking Reasoning via Abstraction in Large Language Models", https://arxiv.org/abs/2310.06117, Google DeepMind, 2023).

31. **retrieve-and-rerank: Retrieve-and-Rerank**
    - Family: knowledge-memory.
    - Aliases: Contextual retrieval, Two-stage retrieval, Hybrid search, Cross-encoder / LLM reranking.
    - Summary: Cast a wide net with cheap retrievers (BM25 plus embeddings, over chunks prefixed with LLM-written context), fuse the results, then have a reranker score about 150 candidates and keep the best 20.
    - Use when: the corpus is large, plain vector search misses exact terms, and precision in the top-k matters. Avoid when: the corpus is small enough to put entirely in the prompt (Anthropic suggests about 200K tokens as the threshold), or latency budgets can't absorb a reranker.
    - Sources: Anthropic, "Introducing Contextual Retrieval" (2024-09-19), https://www.anthropic.com/news/contextual-retrieval. It reports top-20 retrieval failure falling 35% with contextual embeddings, 49% with contextual BM25 added, and 67% with reranking added. Sun et al., "Is ChatGPT Good at Search? Investigating Large Language Models as Re-Ranking Agents", https://arxiv.org/abs/2304.09542.
    - Origin: by Anthropic (research and writing credited to Daniel Ford); org Anthropic; 2024; https://www.anthropic.com/news/contextual-retrieval; kind popularized. **uncertain**: two-stage retrieve-then-rerank is long-standing IR practice with no single originator. The LLM-reranker step was introduced by Weiwei Sun et al., Shandong University, Baidu, Leiden University, 2023.
    - Running example (from Anthropic's post): "What was ACME Corp's revenue growth in Q2 2023?"
    - Nodes: index phase: docs(io), contextualizer(llm), bm25(memory), vectors(memory). Query phase: user(io), fuse(aggregator), reranker(evaluator), generator(llm), out(io).
    - Edges: docs→contextualizer⇉bm25,vectors; user⇉bm25,vectors; bm25,vectors⇉fuse (label "150"); fuse→reranker (label "top 20"); reranker→generator→out.
    - Scenarios:
      - "index": a chunk "revenue grew 3%" gets the prefix "From ACME's Q2 2023 10-Q…" and is written to both indexes.
      - "query": hybrid fan-out; fuse; the reranker funnel narrows 150→20; generator→out.
    - Distinctive visual: a funnel. A wide fan of candidates narrows to a short scored list, and indexed chunks carry a highlighted context prefix.
    - Often confused with: corrective-rag. The reranker only orders and truncates; it never rewrites the query or falls back to the web.

32. **graph-rag: GraphRAG**
    - Family: knowledge-memory.
    - Aliases: Graph RAG, Knowledge-graph RAG, Community-summary RAG.
    - Summary: Index a corpus as an LLM-extracted entity graph clustered into communities with pre-written summaries. Answer global questions by map-reducing over those summaries, and local questions by walking out from matched entities.
    - Use when: there are "sensemaking" questions about a whole corpus ("what are the main themes?") that chunk retrieval can't answer. Avoid when: questions are pinpoint lookups, the corpus changes constantly (re-indexing is expensive), or the indexing budget is small.
    - Source: Edge et al., "From Local to Global: A Graph RAG Approach to Query-Focused Summarization", https://arxiv.org/abs/2404.16130.
    - Origin: by Darren Edge, Ha Trinh et al.; org Microsoft Research (with Microsoft Strategic Missions and Technologies and the Microsoft Office of the CTO); 2024; https://arxiv.org/abs/2404.16130; kind introduced.
    - Running example: "Across 1,000 podcast transcripts, what are the main themes about tech regulation?" (the paper uses podcast transcripts and news).
    - Nodes: docs(io), extractor(llm), graph(memory), clusterer(tool, Leiden), summaries(memory), user(io), m1, m2, m3 (llm, map), reducer(aggregator), out(io).
    - Edges: docs→extractor→graph→clusterer→summaries; user→summaries⇉m1,m2,m3; m1..m3⇉reducer→out; user→graph (dashed, local search path).
    - Scenarios:
      - "index": entities and relations are extracted; communities form as coloured bubbles; each gets a summary card.
      - "global question": community summaries fan out to the map LLMs (partial answers with helpfulness scores); reducer→out.
      - "local question": entity "FTC" is matched in graph; neighbours plus relevant chunks go to one llm, then →out.
    - Distinctive visual: a knowledge graph with coloured community hulls, each with a summary card.
    - Often confused with: agentic-rag (it retrieves chunks on demand; GraphRAG's distinctive work is the offline graph and community summaries), and with sectioning-style map-reduce (here the "chunks" are community summaries built at index time).

33. **memory-stream: Memory Stream**
    - Family: knowledge-memory.
    - Aliases: Generative Agents memory, Observation-reflection memory, Recency-importance-relevance retrieval.
    - Summary: Log every observation to a timestamped stream with an LLM-rated importance score, retrieve by a weighted sum of recency, importance and relevance, and periodically write higher-level reflections back into the stream.
    - Use when: long-lived agents or characters need believable continuity and should "remember what matters". Avoid when: you need exact, structured recall (use a fact store or hierarchical-memory), or the agent is short-lived.
    - Source: Park et al., "Generative Agents: Interactive Simulacra of Human Behavior", https://arxiv.org/abs/2304.03442 (UIST 2023). Its retrieval "combines relevance, recency, and importance".
    - Origin: by Joon Sung Park et al.; org Stanford University, Google Research, Google DeepMind; 2023; https://arxiv.org/abs/2304.03442; kind introduced.
    - Running example (from the paper): Isabella's agent is planning a Valentine's Day party; later Maria is asked "What are you doing tonight?"
    - Nodes: env(io), rater(llm, importance 1–10), stream(memory), retriever(evaluator, score = α·recency + β·importance + γ·relevance), agent(llm), reflector(llm), out(io, action/utterance).
    - Edges: env→rater→stream (write); env→retriever (query, dashed); stream→retriever; retriever→agent (top-k); agent→out; stream→reflector (?importance sum > threshold); reflector→stream (write reflection, ↺).
    - Scenarios:
      - "retrieve": a query arrives; memory cards show three bars each; "Isabella invited me to a party at 5pm" ranks top; agent→out ("I'm going to Isabella's party").
      - "reflect": the importance total crosses the threshold; reflector reads the recent memories and writes "Maria has a crush on Klaus" as a new card.
    - Distinctive visual: memory cards with three mini-bars (recency, importance, relevance) re-sorting live; reflection cards point back to their evidence.
    - Often confused with: hierarchical-memory. A memory stream has no tiers or paging, just one flat stream scored when it's read, plus reflection synthesis. **Action for the existing catalog:** remove the Park et al. citation from hierarchical-memory and cite it here.

### Efficiency & Cost (new family)

34. **model-cascade: Model Cascade**
    - Family: efficiency-cost.
    - Aliases: LLM cascade, FrugalGPT, Escalation ladder, Difficulty-based routing.
    - Summary: Try the cheapest model first; a scorer judges the answer and escalates to a stronger, pricier model only when confidence is too low.
    - Use when: traffic is mostly easy with a long tail of hard cases, and you can score answer reliability cheaply. Avoid when: nearly every query is hard (you pay twice), or latency is tight (escalation adds round trips).
    - Source: Chen, Zaharia, Zou, "FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance", https://arxiv.org/abs/2305.05176.
    - Origin: by Lingjiao Chen, Matei Zaharia, James Zou; org Stanford University; 2023; https://arxiv.org/abs/2305.05176; kind introduced (for LLM APIs; cascades in classifiers are older).
    - Running example: a support bot answering "How do I reset my router?" (easy) and "Why does my VPN drop only on 5 GHz after the firmware update?" (hard).
    - Nodes: user(io), small(llm), score1(evaluator), medium(llm), score2(evaluator), large(llm), out(io).
    - Edges: user→small→score1; score1?ok→out; score1?low→medium→score2; score2?ok→out; score2?low→large→out.
    - Scenarios:
      - "easy": small→score1 (0.93 ok)→out; the cost meter reads $0.0002.
      - "hard": small (0.41) escalates to medium (0.58), which escalates to large, then →out; the cost meter climbs to $0.03.
    - Distinctive visual: a ladder, with a running cost meter beside the flow.
    - Often confused with: routing. Routing picks by topic among peers before any answer exists; a cascade picks by difficulty and escalates after it sees an answer.
    - Variants of this new pattern:
      - sequential-cascade (the default, FrugalGPT).
      - predictive-router: a learned router guesses difficulty before any call, so only one model runs. Delta: score1/score2 are removed and router(router)⇉{small, large} is added. Source: Ong et al., "RouteLLM: Learning to Route LLMs with Preference Data", https://arxiv.org/abs/2406.18665 (UC Berkeley, Anyscale, Canva; ICLR 2025). Anthropic's post also lists "routing easy/common questions to smaller, cost-efficient models".
      - draft-and-verify: the small model drafts and the large model verifies, accepting or rewriting in one pass (an edge small→large carrying the draft, no score nodes). This is the agent-level analogue of speculative decoding: Leviathan et al., "Fast Inference from Transformers via Speculative Decoding", https://arxiv.org/abs/2211.17192 (Google Research, ICML 2023).

35. **caching: Caching & Reuse**
    - Family: efficiency-cost.
    - Aliases: Prompt caching, Prefix caching, KV-cache reuse, Semantic cache, Response cache.
    - Summary: Avoid recomputing. Reuse the processed prefix of a stable prompt (prompt cache), or return a stored answer when a new request matches an old one exactly or semantically (response cache).
    - Use when: a large, unchanging prefix (system prompt, tools, documents) repeats across calls, or many users ask near-identical questions. Avoid when: the prefix changes every call (timestamps placed early break the cache), or answers must be fresh or personalised (semantic hits can be wrong).
    - Sources: Anthropic prompt caching docs, https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching (prefix order tools→system→messages, `cache_control` breakpoints, 5-min/1-h TTL, cache reads at 0.1× base input on standard models). Anthropic blog "Prompt caching with Claude", https://claude.com/blog/prompt-caching ("up to 90%" cost and "up to 85%" latency reduction). Gim et al., "Prompt Cache: Modular Attention Reuse for Low-Latency Inference", https://arxiv.org/abs/2311.04934 (MLSys 2024). Zheng et al., "SGLang: Efficient Execution of Structured Language Model Programs" (RadixAttention prefix sharing), https://arxiv.org/abs/2312.07104. Zilliz GPTCache, https://github.com/zilliztech/GPTCache ("Semantic cache for LLMs").
    - Origin: **uncertain** (no single inventor). Earliest verified prompt-level attention-reuse paper: In Gim et al.; org Yale University, Google; 2023; https://arxiv.org/abs/2311.04934; kind introduced. API-level prompt caching was popularized by Anthropic in 2024 (the blog page is currently dated 2025-08-14 but carries a "GA on 2024-12-17" update, so the original announcement is 2024; date flagged). Semantic cache was popularized by Zilliz (GPTCache, 2023; year not verified on the repo page).
    - Running example: a support bot grounded in a 100-page product manual that thousands of users query.
    - Nodes (prompt-cache default): user(io), prefix(memory, "tools + system + manual", locked), suffix(io, user turn), llm, out(io).
    - Edges: prefix→llm (?hit: cheap read, label "0.1×"; ?miss: write, label "1.25×"); suffix→llm; llm→out.
    - Scenarios:
      - "cold then warm": request 1 is a miss and the prefix is written (amber); request 2 is a hit, the prefix glows as cached, and only the suffix is processed; time-to-first-token and cost bars shrink.
      - "semantic hit" (variant): a near-duplicate question returns the stored answer without calling the llm.
    - Distinctive visual: the prompt drawn as a bar with a locked, greyed prefix segment and a price tag; the second request lights only the tail.
    - Often confused with: hierarchical-memory. Caching stores computation or answers, not knowledge; the model sees the same content either way.
    - Variants of this new pattern:
      - prefix-cache (the default).
      - exact-response-cache: hash(request)→store; ?hit→out; ?miss→llm→store.
      - semantic-cache: user→embed(tool)→cache(memory)→similarity(evaluator); ?hit→out; ?miss→llm→out, plus llm→cache (write).

36. **batch-processing: Batch & Throttled Fan-out**
    - Family: efficiency-cost.
    - Aliases: Batch API, Async fan-out, Rate-limited parallelism, Bulk inference.
    - Summary: For many independent requests, either submit them as one asynchronous provider batch (half price, results later), or fan them out client-side through a rate limiter with retries.
    - Use when: there are thousands of independent items (classification, extraction, evals) and per-item latency doesn't matter (batch) or matters moderately (throttled fan-out). Avoid when: items depend on each other, or a user is waiting for each answer.
    - Sources: Anthropic, "Batch processing" (Message Batches API: asynchronous, "reducing costs by 50%", most batches finish in under 1 hour), https://platform.claude.com/docs/en/docs/build-with-claude/batch-processing. OpenAI Cookbook, `api_request_parallel_processor.py` ("parallel requests need to be throttled to stay under rate limits"; throttles requests and tokens per minute; retries), https://github.com/openai/openai-cookbook/blob/main/examples/api_request_parallel_processor.py.
    - Origin: **uncertain** (an engineering practice with no single inventor). It was popularized by provider batch APIs (OpenAI, Anthropic, 2024) and by the OpenAI Cookbook throttled processor; kind popularized. Launch years weren't verified on the fetched pages.
    - Running example: "Classify 10,000 support tickets into 12 categories overnight."
    - Nodes (throttled default): jobs(io, queue), limiter(guard, token bucket RPM/TPM), w1, w2, w3 (llm calls), retry(router, backoff), results(aggregator), out(io).
    - Edges: jobs→limiter⇉w1,w2,w3; w*?429/5xx→retry→limiter (↺ dashed, backoff); w*⇉results→out.
    - Scenarios:
      - "throttled": the queue drains through the limiter gauge; w2 hits a 429 (error), bounces through retry and succeeds; results fill.
      - "provider batch" (variant): jobs→batch_api(tool) with a clock icon ("<24h") →results→out; the cost tag shows "−50%".
    - Distinctive visual: a queue draining through a valve with a token-bucket gauge; 429s bounce back.
    - Often confused with: sectioning. Sectioning splits one task and merges the parts into one answer; batching runs many unrelated items, and the constraint is throughput and cost limits.
    - Variants of this new pattern: throttled-fan-out (client-side, the default) / provider-batch (the limiter, retry and workers collapse into one batch_api tool node with an async wait).

37. **skeleton-of-thought: Skeleton-of-Thought**
    - Family: efficiency-cost. It's a latency pattern, and the paper frames it that way. It could also sit in reasoning-prompting.
    - Aliases: SoT, Outline-then-expand, Parallel point expansion.
    - Summary: Generate a short outline first, then expand every outline point in parallel and concatenate the results.
    - Use when: long answers break into independent points (tips, comparisons, listicles) and time-to-complete matters. Avoid when: the reasoning is sequential (math, code), or the points must reference each other.
    - Source: Ning et al., "Skeleton-of-Thought: Prompting LLMs for Efficient Parallel Generation", https://arxiv.org/abs/2307.15337 (ICLR 2024).
    - Origin: by Xuefei Ning, Zinan Lin, Zixuan Zhou et al. (equal first authors); org Tsinghua University, Microsoft Research, KU Leuven, Infinigence-AI; 2023; https://arxiv.org/abs/2307.15337; kind introduced.
    - Running example: "What are the most effective ways to improve sleep quality?"
    - Nodes: user(io), skeleton(llm), p1, p2, p3 (llm, expand point i), concat(aggregator, plain concatenation), out(io).
    - Edges: user→skeleton⇉p1,p2,p3; p1..p3⇉concat→out.
    - Scenarios:
      - "outline then expand": skeleton emits "1. Fixed schedule 2. Cool dark room 3. Cut caffeine"; three expansions stream at once; concat→out. A latency bar beside it compares this with sequential decoding.
    - Distinctive visual: bullet stubs that all grow into paragraphs at the same time, with a stopwatch.
    - Often confused with: orchestrator-workers. SoT has no LLM synthesis step (plain concatenation), and the workers only elaborate their own point. It differs from sectioning because the split is generated from the model's own outline at run time.
    - Variant of this new pattern: sot-r (SoT with router): a router(router) node before skeleton decides whether SoT suits the question; ?no→ plain llm→out. Same paper.

---

## Variants for existing patterns

Format: parent / variant id: Name. Difference. Topology delta. Source.

### Workflows

**prompt-chaining**
- prompt-chaining / gated-exit: Gated (default). Code checks between steps; a failure exits early. This is the current scenario.
- prompt-chaining / gate-retry: Gate with retry. A failed check feeds the error back to the same step instead of exiting. Delta: replace gate?fail→out with gate?fail→llm1 (↺, error token), capped at N attempts.
- prompt-chaining / refine-chain: Incremental refine over chunks. The same step runs once per input chunk, carrying a running summary forward. Delta: llm2/llm3 collapse into one refiner node with input chunk_i (io, stack) plus summary(memory); refiner→summary ↺ per chunk; summary→out. Source: Chang et al., "BooookScore: A systematic exploration of book-length summarization in the era of LLMs", https://arxiv.org/abs/2310.00785 (University of Massachusetts Amherst, AI2, Princeton; ICLR 2024). This paper compares "incremental updating" with "hierarchical merging".

**routing**
- routing / llm-classifier: LLM classifier (default). An LLM call picks the route.
- routing / embedding-router: Embedding (semantic) router. The query is embedded and matched to the nearest set of example utterances; there's no LLM in the routing step and it can return "no match". Delta: router becomes embed(tool)→routes(memory, example vectors)→nearest(router); a ?none branch goes to a fallback. Source: aurelio-labs/semantic-router, https://github.com/aurelio-labs/semantic-router.
- routing / rules-then-llm: Rules first, LLM fallback. Deterministic rules (regex, keywords, metadata) handle the confident cases, and only unmatched inputs go to the LLM classifier. Delta: rules(guard) inserted before router; rules?match→llmX directly; rules?unmatched→router. No primary source; common practice.

**sectioning**
- sectioning / fixed-split: Fixed split (default).
- sectioning / map-reduce: Map-reduce over chunks. The splitter is code that chunks a long input; the mapper is one prompt applied to every chunk; the reduce step may be a tree (merge pairs, then merge the results). Delta: llm1..3 become the same mapper prompt; the aggregator becomes reduce1, reduce2→reduceF (a hierarchical merge tree). Source: Chang et al. BooookScore, https://arxiv.org/abs/2310.00785 ("hierarchical merging").
- sectioning / parallel-guardrail: Heterogeneous parallel tasks. One branch answers the user while another screens the same input for policy problems; the aggregator gates instead of merging. Delta: llm2 becomes screen(guard); aggregator becomes a gate (?flagged→block). Source: Anthropic, "Building effective agents" (sectioning example where "one model instance processes user queries while another screens them"), https://www.anthropic.com/engineering/building-effective-agents.

**voting**
- voting / majority: Majority vote / self-consistency (default). Sample N reasoning paths and take the most common final answer (exact match).
- voting / llm-select: Universal self-consistency. For free-form outputs where exact-match voting fails, an LLM reads all N candidates and picks the most consistent one. Delta: aggregator(vote) becomes selector(llm); result tokens are full paragraphs, not labels. Source: Chen et al., "Universal Self-Consistency for Large Language Model Generation", https://arxiv.org/abs/2311.17311 (Google, 2023).
- voting / model-ensemble: Heterogeneous ensemble with rank-and-fuse. N different models answer; a ranker compares the candidates pairwise and a fuser merges the top ones. Delta: llm×3 become llmA/llmB/llmC (distinct models); aggregator splits into ranker(evaluator)→fuser(llm). Source: Jiang et al., "LLM-Blender: Ensembling Large Language Models with Pairwise Ranking and Generative Fusion", https://arxiv.org/abs/2306.02561 (AI2, USC, Zhejiang University; ACL 2023).

**orchestrator-workers**
- orchestrator-workers / single-round: Single round (default). Plan, fan out, fan in, answer.
- orchestrator-workers / iterative: Iterative rounds plus a finishing pass. The orchestrator reviews the workers' results, decides whether to spawn another round, and a separate finishing worker (e.g. citations) runs before output. Delta: add orch→orch (↺ "more research?") around the fan-out/fan-in; add citer(llm) between orch and out. Source: Anthropic, "How we built our multi-agent research system" (2025-06-13), https://www.anthropic.com/engineering/multi-agent-research-system ("spins up 3-5 subagents in parallel"; the lead decides whether more research is needed; a separate CitationAgent).

**evaluator-optimizer**
- evaluator-optimizer / self-critique: Same model. The generator critiques and refines its own output; generator and evaluator are one model with two prompts. Delta: generator and evaluator merge into one llm node with a self-loop labelled "feedback". Source: Madaan et al., "Self-Refine: Iterative Refinement with Self-Feedback", https://arxiv.org/abs/2303.17651.
- evaluator-optimizer / separate-judge: Separate judge. A different (often stronger or rubric-prompted) model scores the work. This is the current topology, made explicit as a variant. Source: Anthropic, "Building effective agents".
- evaluator-optimizer / tool-grounded: Tool-grounded critique. The critic uses external tools (code execution, search, unit tests) to produce evidence before giving feedback. Delta: add tool node; evaluator→tool→evaluator before evaluator→generator. Source: Gou et al., "CRITIC: Large Language Models Can Self-Correct with Tool-Interactive Critiquing", https://arxiv.org/abs/2305.11738 (Tsinghua University, Microsoft Research Asia, Microsoft Azure AI; ICLR 2024).

### Planning & Search

**plan-and-execute**
- plan-and-execute / replanning: With replanner (default).
- plan-and-execute / single-pass: Plan-and-Solve. One call writes the plan and then carries it out with no tools and no replanning. Delta: remove executor, tool, replanner; planner→plan→solver(llm)→out, possibly in one call. Source: Wang et al., "Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models", https://arxiv.org/abs/2305.04091 (Singapore Management University et al.; ACL 2023).
- plan-and-execute / as-needed: As-needed (recursive) decomposition. Execute directly first; only when a step fails does the planner decompose it into sub-steps, recursively. Delta: executor?fail→planner (decompose this step)→sub-plan→executor (nested ↺); no upfront full plan. Source: Prasad et al., "ADaPT: As-Needed Decomposition and Planning with Language Models", https://arxiv.org/abs/2311.05772 (UNC Chapel Hill, Allen Institute for AI; NAACL 2024 Findings).

**rewoo**
- rewoo / sequential-workers: Sequential workers (default).
- rewoo / parallel-workers: Parallel evidence. Planned calls with no #E dependencies run concurrently, while dependent ones (#E2 uses #E1) wait. Delta: the worker edges become ⇉ for independent steps. This is the conceptual bridge to llm-compiler, which adds a streaming scheduler and a replanning joiner. No separate primary source; the scheduling idea is the core of Kim et al. (llm-compiler).

**llm-compiler**
- llm-compiler / replanning-joiner: Joiner with replan (default).
- llm-compiler / native-parallel-calls: Native parallel tool calls. No separate planner or scheduler: the model emits several independent tool calls in one turn, the runtime runs them concurrently, and the results return in the next turn. Delta: planner, scheduler and joiner collapse into one llm; llm⇉t1,t2 ⇉llm, with no dependency edges (t3 must wait a full turn). Source: OpenAI function calling guide, "Parallel function calling" (`parallel_tool_calls`), https://developers.openai.com/api/docs/guides/function-calling.

**tree-of-thoughts**
- tree-of-thoughts / bfs-beam: Breadth-first with beam. Expand every frontier node, score them, and keep the best b per level; there's no backtracking. Delta: scenario only. Two levels fan out together and a fixed number survive each level. Source: Yao et al. 2305.10601 (the paper defines the BFS and DFS search algorithms).
- tree-of-thoughts / dfs-backtrack: Depth-first with backtracking (this is the current scenario). Follow the most promising child and back up when the value falls below a threshold. Delta: a backtrack edge from the dead end to its parent (dashed ↺). Same source.
- (MCTS with acting is split out as the new pattern `lats`.)

### Knowledge & Memory

**agentic-rag**
- agentic-rag / source-router: Router over sources (default).
- agentic-rag / interleaved-retrieval: Retrieval interleaved with reasoning. A single retriever is queried again after each reasoning sentence, and each new thought becomes the next query. Delta: remove router, web and sql; llm↔retriever ↺ per CoT step. Source: Trivedi et al., "Interleaving Retrieval with Chain-of-Thought Reasoning for Knowledge-Intensive Multi-Step Questions" (IRCoT), https://arxiv.org/abs/2212.10509 (Stony Brook University, Allen Institute for AI; ACL 2023).
- agentic-rag / adaptive-depth: Adaptive by complexity. A classifier predicts query complexity and picks no retrieval, single-step retrieval or multi-step iterative retrieval. Delta: add complexity(router) up front with three branches: →llm→out | →retriever→llm→out | →iterative loop. Source: Jeong et al., "Adaptive-RAG: Learning to Adapt Retrieval-Augmented Large Language Models through Question Complexity", https://arxiv.org/abs/2403.14403 (KAIST; NAACL 2024).

**corrective-rag**
- corrective-rag / crag: Grade and fall back to the web (default).
- corrective-rag / self-rag: Self-reflective generation. One model decides on demand whether to retrieve, then critiques each segment's relevance and support using reflection tokens; there's no separate grader. Delta: grader, rewriter, web and check collapse into the generator, with self-edges labelled [Retrieve], [IsRel] and [IsSup]; retriever is called only on [Retrieve]=yes. Source: Asai et al., "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection", https://arxiv.org/abs/2310.11511 (University of Washington, Allen Institute for AI, IBM Research AI). Move "Self-RAG" from aliases to this variant.
- corrective-rag / groundedness-loop: Post-generation hallucination check. After generating, a grader checks that the answer is grounded in the documents and answers the question. If not grounded, regenerate; if it doesn't answer the question, rewrite the query and retrieve again. Delta: check?ungrounded→generator (↺); check?off-topic→rewriter→retriever (↺). No single primary source; a common LangGraph composition of CRAG and Self-RAG ideas.

**hierarchical-memory**
- hierarchical-memory / os-paging: OS-style paging (default, MemGPT).
- hierarchical-memory / rolling-summary: Recursive rolling summary. There are no tool-driven tiers. After each session the LLM folds the new dialogue into a running summary, which is prepended to future turns. Delta: drop core, recall and archival; add summary(memory); llm→summarizer→summary ↺ per session; summary→llm. Source: Wang et al., "Recursively Summarizing Enables Long-Term Dialogue Memory in Large Language Models", https://arxiv.org/abs/2308.15022 (HKUST, CAS IIE, NUDT, University of Sydney; Neurocomputing).
- hierarchical-memory / fact-store: Extracted fact store with update ops. After each exchange, an extractor pulls candidate facts, compares them with similar stored ones and applies ADD / UPDATE / DELETE / NOOP. Delta: replace the tiers with extractor(llm)→compare(evaluator)→facts(memory) via an op label; facts→llm at retrieval. Source: Chhikara et al., "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory", https://arxiv.org/abs/2504.19413 (Mem0, 2025).

---

## Origins for existing patterns (workflows, planning-search, knowledge-memory)

| slug | by | org | year | url | kind | note |
|---|---|---|---|---|---|---|
| prompt-chaining | Erik Schluntz and Barry Zhang (Anthropic) | Anthropic | 2024 | https://www.anthropic.com/engineering/building-effective-agents | popularized | The page byline shows "Erik S." and Barry Zhang, published 2024-12-19. Earlier academic introduction of "Chaining LLM steps": Tongshuang Wu, Michael Terry, Carrie J. Cai, "AI Chains", University of Washington and Google Research, 2021, https://arxiv.org/abs/2110.01691 (kind introduced; CHI 2022). |
| routing | Erik Schluntz and Barry Zhang | Anthropic | 2024 | same | popularized | No single inventor. |
| sectioning | Erik Schluntz and Barry Zhang | Anthropic | 2024 | same | popularized | Anthropic names it "Parallelization: sectioning". |
| voting | Xuezhi Wang et al. | Google Research, Brain Team | 2022 | https://arxiv.org/abs/2203.11171 | introduced | Self-consistency (ICLR 2023); Anthropic popularized the "voting" framing in 2024. |
| orchestrator-workers | Erik Schluntz and Barry Zhang | Anthropic | 2024 | https://www.anthropic.com/engineering/building-effective-agents | popularized | |
| evaluator-optimizer | Erik Schluntz and Barry Zhang | Anthropic | 2024 | same | popularized | Introduced as Self-Refine by Aman Madaan et al., CMU, AI2, UW, NVIDIA, UC San Diego, Google Research, 2023, https://arxiv.org/abs/2303.17651 (kind introduced). |
| plan-and-execute | LangChain team | LangChain | 2024 | https://www.langchain.com/blog/planning-agents | popularized | The blog (2024-02-13) says it is "based loosely on" Plan-and-Solve (Lei Wang et al., Singapore Management University et al., 2023, https://arxiv.org/abs/2305.04091) and Yohei Nakajima's BabyAGI (BabyAGI not separately verified). |
| rewoo | Binfeng Xu et al. | **uncertain**: page 1 lists emails only (microsoft.com, tamu.edu, ncsu.edu) and no affiliation lines | 2023 | https://arxiv.org/abs/2305.18323 | introduced | |
| llm-compiler | Sehoon Kim et al. | UC Berkeley, ICSI, LBNL | 2023 | https://arxiv.org/abs/2312.04511 | introduced | ICML 2024. |
| tree-of-thoughts | Shunyu Yao et al. | Princeton University, Google DeepMind | 2023 | https://arxiv.org/abs/2305.10601 | introduced | NeurIPS 2023. Concurrent "Large Language Model Guided Tree-of-Thought" by Jieyi Long, 2023, https://arxiv.org/abs/2305.08291 (title, author and year confirmed via the arXiv API; affiliation not checked). |
| agentic-rag | Aditi Singh et al. (survey) | Cleveland State University, Kent State University, Northeastern University, University of Agder | 2025 | https://arxiv.org/abs/2501.09136 | popularized | **uncertain**: the term predates the survey, which systematizes it and doesn't coin it. No single originator found. |
| corrective-rag | Shi-Qi Yan et al. | University of Science and Technology of China, UCLA, Google DeepMind | 2024 | https://arxiv.org/abs/2401.15884 | introduced | |
| hierarchical-memory | Charles Packer et al. | UC Berkeley | 2023 | https://arxiv.org/abs/2310.08560 | introduced | MemGPT. |

---

## Rejected or folded candidates

- **Step-back prompting** (Zheng et al., https://arxiv.org/abs/2310.06117, verified): folded. On its own it's a two-call prompt chain (abstract the question, then answer), which is close to a prompt-only tweak. It appears instead as the "step-back query" variant of multi-query-rag, where it changes the retrieval topology.
- **Long-context Map-Reduce / Refine summarization**: folded into variants. Map-reduce is `sectioning / map-reduce` and Refine is `prompt-chaining / refine-chain` (both sourced to BooookScore). As its own pattern it would duplicate the sectioning and chaining topologies.
- **Speculative decoding** (Leviathan et al., verified): rejected as a pattern because it lives inside the inference server, at the token level, not in agent topology. Its agent-level analogue is kept as the `model-cascade / draft-and-verify` variant.
- **Prompt caching as its own pattern separate from semantic cache**: merged into `caching`, with prefix, exact and semantic as variants, to avoid two thin patterns.
- **Prompt compression (LLMLingua, https://arxiv.org/abs/2310.05736, verified)**: rejected. It's a preprocessing technique with a single compressor node and too little topology for its own page; it could be mentioned in the caching or efficiency family intro.
- **Self-Discover** (https://arxiv.org/abs/2402.03620, verified): rejected for now. It's a meta-prompting step (select, adapt and implement reasoning modules) that mostly changes prompt content; it's newer and less adopted than the other candidates.
- **Query decomposition as a separate pattern from multi-query**: merged. Sub-question decomposition is a variant of `multi-query-rag`.
- **Contextual retrieval as a separate pattern from reranking**: merged into `retrieve-and-rerank`. Contextual chunk prefixes are the index-phase half of the same pipeline (Anthropic presents them together).
- **RAP (Reasoning via Planning)**: kept as a variant of `lats` (MCTS with an LLM world model instead of a real environment), not a separate pattern.
- **Zero-shot CoT, few-shot CoT, extended thinking as separate entries**: prompt or model settings, not topology changes; they're listed as aliases of chain-of-thought.
