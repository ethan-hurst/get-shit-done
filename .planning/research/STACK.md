# Technology Stack: MoE Panels for Agent Orchestration

**Project:** get-shit-done v2.0 -- MoE Panels
**Researched:** 2026-02-26
**Domain:** Multi-agent panel orchestration for AI coding assistant quality gates

## Constraint

No new npm dependencies allowed. All patterns must be implementable using:
- Markdown agent definitions (`.md` files in `agents/`)
- Claude Code's Task tool for spawning subagents
- Node.js built-ins for CLI tooling (`bin/lib/*.cjs`)
- Existing `.planning/` state management layer

## Recommended Architecture: Scatter-Gather with LLM Synthesizer

**Confidence: HIGH** -- This pattern is the most proven and directly maps to GSD's existing infrastructure.

The architecture replaces each single quality-gate agent with a **panel of 3 parallel specialists** plus a **synthesizer agent** that merges their outputs. This is the "fan-out/fan-in" or "scatter-gather" pattern documented by Microsoft Azure Architecture Center, AWS, Google ADK, and implemented in CrewAI, LangGraph, and AutoGen.

### Why 3 Specialists (Not 2, Not 5)

| Panel Size | Tradeoff | Verdict |
|------------|----------|---------|
| 2 agents | Ties possible, limited diversity | Too few |
| **3 agents** | **Majority possible, diverse enough, manageable token cost** | **Use this** |
| 4 agents | Even number creates ties, diminishing returns | Avoid |
| 5+ agents | Error compounding grows, 60k+ token overhead per panel, coordination tax exceeds gains | Too many |

**Confidence: MEDIUM** -- The "Coordination Tax" research from Google DeepMind (2025) shows accuracy gains saturate or fluctuate beyond 4 agents. The "17x error trap" paper demonstrates that poorly coordinated multi-agent systems compound errors. 3 is the sweet spot for: (a) majority vote viability, (b) diverse perspectives, (c) affordable token cost (3 x 20k = 60k overhead), (d) matches Claude Code's 10-agent parallel cap.

### Panel Composition Strategy

Each panel needs **specialist diversity, not specialist redundancy**. The 3 agents must examine the problem from genuinely different angles. If all 3 use the same approach, you get redundancy not robustness.

**Pattern: Role-Based Specialization**

| Specialist Role | Focus | What It Catches |
|----------------|-------|-----------------|
| **Domain Expert** | Does this achieve the functional goal? | Missing requirements, wrong behavior |
| **Quality Auditor** | Does this meet structural standards? | Anti-patterns, missing tests, scope issues |
| **Devil's Advocate** | What could go wrong? | Edge cases, failure modes, hidden assumptions |

**Confidence: MEDIUM** -- This role triad is derived from multi-agent debate literature (ACL 2025 findings, debate-based consensus patterns) and mirrors effective human review panels. The specific role names and scopes need phase-specific tuning.

## Panel Types and Specialist Definitions

### Panel 1: Plan Checker Panel (replaces single gsd-plan-checker)

Currently one agent checks all 8 dimensions (requirement coverage, task completeness, dependencies, key links, scope, verification derivation, context compliance, Nyquist). Split into:

| Specialist | Dimensions | Prompt Focus |
|-----------|------------|--------------|
| **Completeness Specialist** | Dims 1, 2, 6 (requirement coverage, task completeness, verification derivation) | "Do these plans cover everything the phase needs to deliver?" |
| **Structure Specialist** | Dims 3, 4, 5 (dependency correctness, key links, scope sanity) | "Are these plans structurally sound and properly connected?" |
| **Compliance Specialist** | Dims 7, 8 (context compliance, Nyquist) | "Do these plans honor user decisions and testing requirements?" |

**Synthesizer:** Merges issue lists, deduplicates, assigns final severity, produces single ISSUES FOUND / VERIFICATION PASSED result.

**Confidence: HIGH** -- This maps cleanly to the existing dimension structure in gsd-plan-checker.md. Each specialist gets a focused subset that reduces prompt complexity and improves depth of analysis.

### Panel 2: Verifier Panel (replaces single gsd-verifier)

Currently one agent performs 10-step verification (observable truths, artifacts, key links, requirements, anti-patterns, human verification). Split into:

| Specialist | Steps | Prompt Focus |
|-----------|-------|--------------|
| **Truth Verifier** | Steps 2-3 (establish must-haves, verify observable truths) | "Are the phase goals actually achieved in the codebase?" |
| **Wiring Inspector** | Steps 4-5 (verify artifacts at 3 levels, verify key links) | "Are artifacts substantive and properly connected?" |
| **Quality Scanner** | Steps 6-7 (requirements coverage, anti-pattern scan) | "Are requirements satisfied and is the code clean?" |

**Synthesizer:** Merges verification results, produces single VERIFICATION.md with unified truth table, artifact table, and gap list.

**Confidence: HIGH** -- This follows the existing step structure. Each specialist is self-contained and reads different parts of the codebase.

### Panel 3: Phase Researcher Panel (replaces single gsd-phase-researcher)

Currently one agent researches all domains (stack, patterns, pitfalls, code examples). Split into:

| Specialist | Sections | Prompt Focus |
|-----------|----------|--------------|
| **Stack Researcher** | Standard Stack, Don't Hand-Roll, State of the Art | "What libraries and tools does this phase need?" |
| **Pattern Researcher** | Architecture Patterns, Code Examples | "How do experts structure this type of implementation?" |
| **Risk Researcher** | Common Pitfalls, Open Questions | "What commonly goes wrong in this domain?" |

**Synthesizer:** Merges research sections, resolves contradictions, produces single RESEARCH.md.

**Confidence: MEDIUM** -- GSD already has a parallel research pattern (new-project spawns 4 researchers). This applies the same pattern at phase level. Note: the project-level research already uses 4 parallel agents -- this phase-level panel uses 3 focused specialists instead.

### Panel 4: Project Research Panel (already exists -- 4 parallel agents)

The `/gsd:new-project` workflow already spawns 4 parallel researchers (STACK, FEATURES, ARCHITECTURE, PITFALLS) plus a synthesizer. This is already a panel pattern. **No change needed** except possibly adding a synthesizer improvement.

**Confidence: HIGH** -- Already implemented and working.

## Consensus/Aggregation Strategy

### Use: LLM Synthesizer (Not Majority Vote)

**Confidence: HIGH** -- Majority voting only works for discrete classification tasks (pass/fail, yes/no). Quality gates produce rich structured output (issue lists, verification reports, research findings). An LLM synthesizer is the correct aggregation strategy for complex, non-discrete outputs.

| Aggregation Method | Works For | Does NOT Work For |
|-------------------|-----------|-------------------|
| Majority Vote | Binary pass/fail decisions | Structured issue lists, research findings |
| Weighted Vote | Ranked recommendations | Complex verification reports |
| **LLM Synthesizer** | **All panel outputs in this system** | Nothing (universal, but costs one extra agent) |

### Synthesizer Pattern

```
Specialists (parallel) → Write to distinct output keys → Synthesizer reads all → Produces unified result
```

The synthesizer agent:

1. Reads all 3 specialist outputs
2. **Deduplicates** findings (same issue reported by 2+ specialists)
3. **Resolves conflicts** (specialist A says pass, specialist B says fail on same item)
4. **Elevates** items flagged by 2+ specialists (consensus = higher confidence)
5. **Produces** the final structured output in the format the orchestrator expects

**Conflict resolution rule:** When specialists disagree on severity or status:
- 2 agree, 1 disagrees = go with majority
- All 3 disagree = synthesizer uses most conservative (highest severity) finding
- Specialist provides reasoning? Synthesizer evaluates reasoning quality, not just position

**Confidence: HIGH** -- This mirrors the gsd-research-synthesizer pattern already in the codebase, which reads 4 researcher outputs and produces unified SUMMARY.md. The same pattern extends to all panels.

## Implementation Stack

### No New Dependencies Required

Everything needed exists in the current stack:

| Component | Implementation | Existing Precedent |
|-----------|---------------|-------------------|
| Parallel dispatch | Task tool (3 parallel calls) | new-project.md spawns 4 researchers |
| Specialist definitions | `agents/*.md` files | All 11 existing agents |
| Result collection | Task tool return values | new-project.md collects researcher outputs |
| Synthesizer | Task tool (1 call after parallel batch) | gsd-research-synthesizer.md |
| Panel config | `.planning/config.json` additions | Existing workflow toggles |
| CLI tooling | `bin/lib/*.cjs` modules | Existing verify, frontmatter modules |

### New Agent Files Needed

```
agents/
  # Existing (unchanged)
  gsd-plan-checker.md         → becomes "solo mode" fallback
  gsd-verifier.md             → becomes "solo mode" fallback
  gsd-phase-researcher.md     → becomes "solo mode" fallback

  # New: Panel specialist agents
  panels/
    plan-checker/
      completeness-specialist.md
      structure-specialist.md
      compliance-specialist.md
      synthesizer.md
    verifier/
      truth-verifier.md
      wiring-inspector.md
      quality-scanner.md
      synthesizer.md
    phase-researcher/
      stack-researcher.md
      pattern-researcher.md
      risk-researcher.md
      synthesizer.md
```

**Total new agent files:** 12 (9 specialists + 3 synthesizers)

**Confidence: HIGH** -- Follows existing agent definition pattern exactly. No architectural change, just more .md files.

### Config Schema Extension

```json
{
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "panels": {
      "enabled": true,
      "plan_checker": {
        "enabled": true,
        "specialists": 3
      },
      "verifier": {
        "enabled": true,
        "specialists": 3
      },
      "phase_researcher": {
        "enabled": true,
        "specialists": 3
      }
    }
  }
}
```

When `panels.enabled` is false, fall back to single-agent mode (existing behavior). This provides a clean upgrade path and allows users to opt out of higher token costs.

**Confidence: HIGH** -- Follows existing config pattern. The `workflow` object already has boolean toggles.

### Orchestrator Changes

Each workflow that spawns a quality-gate agent needs a panel-aware dispatch function:

**Before (plan-phase.md, step 10):**
```
Task(prompt=checker_prompt, subagent_type="gsd-plan-checker", ...)
```

**After:**
```
if (panels.plan_checker.enabled) {
  // Spawn 3 specialists in parallel
  Task(prompt=completeness_prompt, subagent_type="general-purpose", ...)
  Task(prompt=structure_prompt, subagent_type="general-purpose", ...)
  Task(prompt=compliance_prompt, subagent_type="general-purpose", ...)

  // After all 3 complete, spawn synthesizer
  Task(prompt=synthesizer_prompt, subagent_type="general-purpose", ...)
} else {
  // Fallback to single agent
  Task(prompt=checker_prompt, subagent_type="gsd-plan-checker", ...)
}
```

**Confidence: HIGH** -- The branching pattern (config check -> conditional spawn) already exists in plan-phase.md for research and plan-check toggles.

## Token Cost Analysis

| Gate | Solo Mode | Panel Mode (3 + synthesizer) | Increase |
|------|-----------|------------------------------|----------|
| Plan Checker | ~20k overhead + work | ~80k overhead + 3x work + synthesis | 4x |
| Verifier | ~20k overhead + work | ~80k overhead + 3x work + synthesis | 4x |
| Phase Researcher | ~20k overhead + work | ~80k overhead + 3x work + synthesis | 4x |

**Mitigation strategies:**
1. Panels are opt-in via config (default: off for budget profile, on for quality profile)
2. Each specialist gets a *narrower* prompt than the solo agent, so work per specialist is ~40% of solo
3. Net increase is roughly **2.5x per gate** (not 4x) because specialists do less work each
4. Model profile applies: use Sonnet for specialists, Opus only for synthesizer if quality profile

**Confidence: MEDIUM** -- Token estimates are approximations. Real costs depend on phase complexity, codebase size, and model choice.

## Alternatives Considered

| Alternative | Why Not |
|------------|---------|
| **Debate pattern** (agents argue in rounds) | Too expensive (multiple rounds), complex to implement, diminishing returns after round 1 for structured analysis |
| **Hierarchical supervisor** (one agent delegates to others) | Adds latency (supervisor must reason before dispatching), unnecessary when specialization is static |
| **Group chat** (agents in shared thread) | Accumulating context bloats rapidly, cross-talk introduces confusion for structured verification |
| **5+ specialists** | Error compounding, coordination tax, 100k+ token overhead |
| **2 specialists** | No tiebreaking, limited diversity |
| **External framework (CrewAI, LangGraph)** | Violates no-new-dependencies constraint, adds complexity, GSD already has Task tool |
| **Majority vote only** | Only works for binary decisions; quality gates produce structured reports |

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Panel size | 3 specialists + 1 synthesizer | Majority possible, affordable, below coordination tax threshold |
| Aggregation | LLM synthesizer agent | Rich structured outputs need synthesis, not counting |
| Specialist diversity | Role-based (domain, structure, risk) | Prevents redundant analysis |
| Config location | `.planning/config.json` | Follows existing pattern |
| Agent definitions | `agents/panels/*.md` | Follows existing agent pattern, scoped in subdirectory |
| Fallback | Single-agent mode when panels disabled | Backward compatible |
| File writes | Specialists return via Task output, synthesizer writes final file | Prevents file conflicts from parallel agents |

## Sources

### Primary (HIGH confidence)
- [Microsoft Azure Architecture Center -- AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) -- Concurrent orchestration pattern, fan-out/fan-in, aggregation strategies (Updated 2026-02-12)
- [AWS Prescriptive Guidance -- Parallelization and scatter-gather patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/parallelization-and-scatter-gather-patterns.html) -- Scatter-gather implementation details
- GSD codebase (`new-project.md`, `gsd-research-synthesizer.md`) -- Existing 4-agent parallel + synthesizer pattern

### Secondary (MEDIUM confidence)
- [LangGraph Parallel Agent Pattern](https://dev.to/rosen_hristov/why-i-split-one-langgraph-agent-into-four-running-in-parallel-2c65) -- Send API, state reducers, result merging pattern
- [Parallelization -- Agentic Design Pattern Series](https://datalearningscience.com/p/3-parallelization-agentic-design) -- Dispatch, concurrent execution, aggregation steps
- [Claude Code Task Tool Patterns](https://amitkoth.com/claude-code-task-tool-vs-subagents/) -- Parallel dispatch via Task tool, 10-agent cap, 20k token overhead per agent
- [Claude Code Sub-Agents: Parallel vs Sequential Patterns](https://claudefa.st/blog/guide/agents/sub-agent-best-practices) -- Task spawning best practices

### Tertiary (LOW confidence -- flag for validation)
- [17x Error Trap / Bag of Agents](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/) -- Error compounding in multi-agent systems, coordination tax concept
- [Voting or Consensus? Decision-Making in Multi-Agent Debate (ACL 2025)](https://aclanthology.org/2025.findings-acl.606.pdf) -- 7 decision protocols comparison
- [CrewAI Parallel Patterns](https://github.com/apappascs/crewai-parallel-patterns) -- CrewAI-specific patterns, async_execution model
- [Multi-Agent AI Systems Explained: LangGraph vs CrewAI vs AutoGen (2026)](https://www.mayhemcode.com/2026/02/multi-agent-ai-systems-explained.html) -- Framework comparison
