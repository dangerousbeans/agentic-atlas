# Pattern catalog: research notes (2026-10-14)

This is the source material for the content tasks. Topologies use these markers:

- `→` sequential
- `⇉` parallel fan-out or fan-in
- `?` conditional
- `↺` loop

**WARNING:** some arXiv IDs below were recalled from memory. Each one must be verified (title, authors, URL resolves) before it goes into a `pattern.yaml`. Only Anthropic's "Building effective agents" was fetched and checked directly.

## Families

| slug | Name | Description | Accent |
|---|---|---|---|
| workflows | Workflows | The code fixes the path; the LLMs fill in each step. | #F5B14C |
| agent-loops | Agent Loops | One model chooses its next action, observes the result and loops, sometimes critiquing itself or learning across attempts. | #A78BFA |
| planning-search | Planning & Search | Plan or explore the task before or while acting, as a plan, a DAG or a tree. | #22D3EE |
| knowledge-memory | Knowledge & Memory | Pull in outside or stored knowledge, decide when to fetch it, and check what comes back. | #34D399 |
| multi-agent | Multi-Agent | Several role-specialized agents coordinate through a manager, hand off to each other, or debate. | #FB7185 |
| safety-oversight | Safety & Oversight | Checks and human approval points wrapped around any of the other patterns. | #E9D8A6 |

## Patterns

### Workflows

1. **prompt-chaining: Prompt Chaining**
   - Aliases: Pipeline, Sequential workflow.
   - Summary: Break a task into fixed steps, where each LLM call works on the previous output, with optional code checks between steps.
   - Use when: the task splits cleanly into fixed subtasks. Avoid when: the steps can't be known in advance.
   - Source: Anthropic, https://www.anthropic.com/engineering/building-effective-agents
   - Nodes: user(io), llm1, gate(guard; a code check), llm2, llm3, out(io).
   - Edges: user→llm1→gate; gate?pass→llm2; gate?fail→out (exit early); llm2→llm3→out.
   - Scenarios:
     - passes: user→llm1, llm1→gate, gate branch pass→llm2, llm2→llm3, llm3→out.
     - gate fails: the gate branches to the exit.

2. **routing: Routing**
   - Aliases: Classifier/dispatcher, Intent routing, Triage.
   - Summary: Classify the input, then send it to a specialized prompt, model or tool.
   - Use when: the input categories are distinct and can be classified reliably. Avoid when: categories blur.
   - Source: Anthropic.
   - Nodes: user, router, llmA, llmB, llmC, out.
   - Steps: user→router, router thinks, branch taken to llmB (others dim), llmB→out.
   - A second scenario takes llmA.

3. **sectioning: Parallelization: Sectioning**
   - Aliases: Fan-out/fan-in, Scatter-gather.
   - Summary: Split the work into independent subtasks, run them in parallel, then merge the results.
   - Source: Anthropic.
   - Nodes: user, splitter(router), llm1, llm2, llm3, aggregator, out.
   - Steps: the three fan-out sends happen at once; the workers finish at staggered `at` windows; fan-in; aggregator→out.

4. **voting: Parallelization: Voting**
   - Aliases: Self-consistency, Ensembling, Majority vote.
   - Summary: Run the same task N times, or with N different prompts, and take the majority or consensus answer.
   - Sources: Anthropic; Self-Consistency (Wang et al.) arXiv 2203.11171.
   - Nodes: user, llm×3, aggregator(vote), out.
   - Steps: fan-out; result tokens labelled "A", "A", "B"; fan-in; the aggregator thinks; out with label "A".

5. **orchestrator-workers: Orchestrator-Workers**
   - Aliases: Dynamic decomposition, Planner-workers.
   - Summary: A central LLM works out the subtasks at run time, sends them to worker LLMs, then combines the results.
   - Avoid when: the subtasks are fixed (use Sectioning).
   - Source: Anthropic.
   - Nodes: user, orchestrator(llm), worker1..3 (hidden), out.
   - Steps: user→orch, orch thinks, workers `appear`, fan-out, fan-in, orch→out.

6. **evaluator-optimizer: Evaluator-Optimizer**
   - Aliases: Reflection, Self-Refine, Generator-Critic, Self-correction.
   - Summary: One model drafts, another judges; the loop runs until the work clears the bar.
   - Sources: Anthropic; Self-Refine (Madaan et al.) arXiv 2303.17651.
   - Nodes: user, generator(llm), evaluator, out.
   - Edges: gen→eval; eval→gen (loop, "revise"); eval→out.
   - Scenarios:
     - "fails twice": [gen→eval, eval branch fail→gen with a feedback token] repeat 2, then gen→eval, eval→out.
     - "passes first time".

### Agent Loops

7. **augmented-llm: Augmented LLM / Tool Use**
   - Aliases: Function calling, Tool use, The building block.
   - Summary: One LLM call that can use tools, retrieval and memory; every other pattern is built from this.
   - Sources: Anthropic; Toolformer arXiv 2302.04761.
   - Nodes: user, llm, tool, retrieval(tool), memory, out.
   - Edges: llm→tool, tool→llm, llm→retrieval, retrieval→llm, llm→memory (write), llm→out.

8. **react: ReAct (Autonomous Agent)**
   - Aliases: Reason+Act, Agent loop, Autonomous agent.
   - Summary: Alternate Thought → Action (tool call) → Observation until the model decides it is done.
   - Avoid when: the path is known (use a workflow), or you can't sandbox or limit cost.
   - Sources: Yao et al. arXiv 2210.03629; Anthropic.
   - Nodes: user, llm, search(tool), calculator(tool), out.
   - Steps: user→llm; then repeat: llm thinks ("Thought"), llm→tool (tool-call), tool→llm (result). Use different tools across 3 turns. Finish with llm→out.

9. **reflexion: Reflexion**
   - Aliases: Verbal reinforcement learning, Episodic self-reflection.
   - Summary: After a failed attempt, the agent writes a lesson in plain language to memory and tries again with that lesson in context.
   - Source: Shinn et al. arXiv 2303.11366.
   - Nodes: user, actor(llm), tests(evaluator), reflector(llm), memory, out.
   - Edges: actor→tests; tests→reflector (fail); reflector→memory (write); memory→actor (read); tests→out (pass).
   - Steps:
     - trial 1: actor→tests (error), tests→reflector, reflector→memory (write).
     - trial 2: memory→actor, actor→tests (done), tests→out.

### Planning & Search

10. **plan-and-execute: Plan-and-Execute**
    - Aliases: Plan-and-Solve, Planner-executor, Planning.
    - Summary: A planner writes a step list, an executor runs each step, and a replanner revises the remaining steps.
    - Sources: Wang et al. Plan-and-Solve arXiv 2305.04091; LangGraph plan-and-execute tutorial.
    - Nodes: user, planner(llm), plan(memory), executor(agent), tool, replanner(llm), out.
    - Edges: user→planner→plan; plan→executor; executor↔tool; executor→replanner; replanner→plan (loop); replanner→out.

11. **rewoo: ReWOO**
    - Aliases: Reasoning WithOut Observation, Planner-worker-solver.
    - Summary: Plan every tool call upfront using placeholders (#E1, #E2), run them, then a solver writes the answer in one pass.
    - Avoid when: later steps depend heavily on what earlier tools return.
    - Source: Xu et al. arXiv 2305.18323.
    - Nodes: user, planner, worker(tool) ×2, evidence(memory), solver(llm), out.
    - Steps: planner emits the plan (label "#E1 #E2"); tools run in order, each writing to evidence; evidence→solver→out. The planner is never revisited.

12. **llm-compiler: LLMCompiler**
    - Aliases: Parallel function calling, Task-DAG planner.
    - Summary: The planner streams a dependency graph (DAG) of tool calls; independent ones run in parallel; a joiner either answers or triggers a replan.
    - Source: Kim et al. arXiv 2312.04511.
    - Nodes: user, planner, scheduler(router), t1, t2, t3 (tools), joiner(aggregator), out.
    - Steps: scheduler sends to t1 and t2 in parallel; t3 waits for t1 and then fires; joiner→out.

13. **tree-of-thoughts: Tree of Thoughts**
    - Aliases: ToT. Note: LATS (arXiv 2310.04406) extends it with MCTS plus acting.
    - Summary: Generate several candidate thoughts at each step, score them, expand the promising branches and backtrack at dead ends.
    - Source: Yao et al. arXiv 2305.10601.
    - Nodes: problem(io), t1, t2, t3 (llm), t2a, t2b (llm), evaluator, out.
    - Steps: problem fans out to t1..t3; scores go to the evaluator; t1 and t3 are pruned (error/dim); t2 expands to t2a and t2b; t2a is a dead end (error); t2b→out.

### Knowledge & Memory

14. **agentic-rag: Agentic RAG**
    - Aliases: Retrieval agent, Tool-based retrieval.
    - Summary: The agent decides whether to retrieve, from which source, and with what rewritten query, and repeats until it has enough context.
    - Source: Singh et al. survey arXiv 2501.09136.
    - Nodes: user, agent(llm), router, vectordb(memory), web(tool), sql(tool), out.
    - Steps: agent→router→vectordb, back to agent ("need more"), agent→router→web, back to agent, agent→out.

15. **corrective-rag: Corrective RAG**
    - Aliases: CRAG, Self-RAG (variant).
    - Summary: Grade the retrieved documents. If they're irrelevant, rewrite the query and fall back to web search before generating.
    - Sources: Yan et al. CRAG arXiv 2401.15884; Asai et al. Self-RAG arXiv 2310.11511.
    - Nodes: user, retriever(memory), grader(evaluator), rewriter(llm), web(tool), generator(llm), check(evaluator), out.
    - Scenarios:
      - "docs irrelevant": grader→rewriter→web→generator→out.
      - "Self-RAG check": the generator output fails the check once, loops back to the generator, then passes.

16. **hierarchical-memory: Hierarchical Memory**
    - Aliases: MemGPT, Virtual context management, Tiered memory.
    - Summary: Treat the context window like RAM. The agent uses tool calls to page facts between core, recall and archival memory.
    - Sources: Packer et al. MemGPT arXiv 2310.08560; Park et al. Generative Agents arXiv 2304.03442.
    - Nodes: user, llm, core(memory), recall(memory), archival(memory), summarizer(llm).
    - Steps: user→llm; llm→archival (read) and back; llm→core (write "user prefers X"); llm→summarizer→recall (evict on overflow).

### Multi-Agent

17. **supervisor: Supervisor**
    - Aliases: Manager pattern, Orchestrator agent, Agents-as-tools, Hierarchical teams.
    - Summary: A supervisor agent sends work to specialist agents and every result comes back through it.
    - Sources: OpenAI "A practical guide to building agents"; LangGraph multi-agent docs.
    - Nodes: user, supervisor(agent), researcher(agent), coder(agent), writer(agent), out.
    - Steps: sup→researcher→sup, sup→coder→sup, sup→writer→sup, sup→out.
    - A second scenario, "hierarchical", uses a group to show coder as a sub-team.

18. **handoffs: Handoffs**
    - Aliases: Decentralized pattern, Swarm, Peer-to-peer.
    - Summary: Agents pass the whole conversation to each other; the agent holding it talks directly to the user, and there's no central manager.
    - Sources: OpenAI guide; OpenAI Swarm repo https://github.com/openai/swarm.
    - Nodes: user, triage(agent), billing(agent), tech(agent), refunds(agent).
    - Steps: user→triage, triage branches to billing (tech dims), billing→user, billing→refunds, refunds→user.

19. **debate: Multi-Agent Debate**
    - Aliases: Society of minds, Debate-and-judge.
    - Summary: Several agents answer independently, read each other's answers over several rounds, then a judge rules.
    - Source: Du et al. arXiv 2305.14325.
    - Nodes: user, a, b, c (agents), judge(aggregator), out.
    - Steps: fan-out; round 1; cross edges a→b, b→c, c→a in parallel; round 2 (repeat 2); fan-in; judge→out.

### Safety & Oversight

20. **human-in-the-loop: Human-in-the-Loop**
    - Aliases: Approval gate, Interrupt/resume, HITL.
    - Summary: Pause before high-stakes or irreversible actions so a person can approve, edit or reject; then resume.
    - Sources: OpenAI guide; LangGraph interrupts docs.
    - Nodes: user, agent, risk(router), human, tool, out.
    - Scenarios:
      - "approve": agent→risk; branch high→human (waiting); human→tool; tool→out.
      - "low risk": risk→tool directly.

21. **guardrails: Guardrails**
    - Aliases: Input/output filters, Tripwires, Safety classifiers.
    - Summary: Checks that run before and after the agent, any of which can block or redirect the flow.
    - Source: OpenAI guide (guardrails section).
    - Nodes: user, relevance(guard), jailbreak(guard), agent, output(guard), block(io), out.
    - Scenarios:
      - "passes": guards run in parallel with the agent starting; agent→output guard→out.
      - "tripped": the jailbreak guard shows error and branches to block.

## Naming rules

- Use the canonical names above everywhere; all other names go in `aliases`.
- Reflexion is a separate pattern from Evaluator-Optimizer because it adds memory across attempts.
- Orchestrator-Workers vs Supervisor vs Plan-and-Execute:
  - Orchestrator-Workers: workers are plain LLM calls.
  - Supervisor: workers are full agents with their own tools.
  - Plan-and-Execute: there is an explicit, persistent plan.
- Routing vs Handoffs: Routing dispatches once; Handoffs transfer control to another agent.
