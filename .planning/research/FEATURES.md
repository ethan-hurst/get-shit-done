# Feature Landscape: MoE Panels & Consensus Mechanisms

**Domain:** AI agent orchestration quality gates with parallel specialist panels
**Researched:** 2026-02-26
**Overall Confidence:** MEDIUM-HIGH

## Executive Summary

GSD currently uses single-agent quality gates (plan-checker, verifier, phase-researcher) that each bear the full responsibility of their domain. The v2.0 MoE Panels milestone replaces each gate with a panel of 3 parallel specialists, each covering a non-overlapping domain partition. This is not a voting system -- it is a domain-partitioned assembly pattern where each specialist owns distinct sections of the output document and a synthesizer merges their non-overlapping contributions.

The key insight from research: **voting and consensus mechanisms solve a different problem than what GSD panels need.** Voting works when multiple agents evaluate the *same* thing and you need to pick the best answer. Domain-partitioned assembly works when agents evaluate *different things* and you need to combine their non-overlapping findings. GSD panels are the latter -- specialists checking distinct dimensions, not redundant reviewers voting on the same dimensions.

The auto-discuss workflow already proves the panel pattern works in this codebase: it spawns N agents in parallel, collects structured outputs, and synthesizes them. The MoE panel pattern is a constrained version of auto-discuss where specialist domains are pre-defined (not dynamically generated) and output sections are non-overlapping (not debated).

## Table Stakes

Features that must exist for panels to deliver value over the current single-agent gates.

| Feature | Why Expected | Complexity | Confidence | Notes |
|---------|-------------|------------|------------|-------|
| Parallel specialist spawning | Panels must run specialists concurrently to avoid 3x latency | Low | HIGH | GSD already spawns parallel agents in auto-discuss and wave execution |
| Domain-partitioned output assembly | Each specialist must own distinct document sections to avoid duplication and conflict | Medium | HIGH | Core innovation -- see Architecture section |
| Backward compatibility with orchestrators | plan-phase, execute-phase, and research-phase must consume panel output identically to single-agent output | Medium | HIGH | VERIFICATION.md, RESEARCH.md, and checker returns must keep same format |
| Per-panel configuration | Users must be able to enable/disable panels per gate (config.json) and fall back to single-agent | Low | HIGH | Follows existing `workflow.research`, `workflow.plan_check`, `workflow.verifier` pattern |
| Specialist agent definitions (9 agents) | 3 specialists per panel x 3 panels = 9 new agent .md files | High | HIGH | Largest content effort -- each agent needs focused role, dimensions, and output format |
| Panel synthesizer logic | Orchestrator or synthesizer agent must merge 3 specialist outputs into single output document | Medium | MEDIUM | Similar to gsd-research-synthesizer pattern already in codebase |
| Cross-validation between specialists | When one specialist flags an issue, adjacent specialists should verify (reduces false positives) | Medium | MEDIUM | Inspired by diffray's cross-validation approach (87% fewer false positives) |
| Model-per-specialist configuration | Different specialists may benefit from different model strengths | Low | HIGH | Already supported via model profile resolution |

## Differentiators

Features that elevate panels beyond basic parallel execution.

| Feature | Value Proposition | Complexity | Confidence | Notes |
|---------|-------------------|------------|------------|-------|
| Conflict detection at merge time | When two specialists make contradictory claims about the same artifact, flag for resolution rather than silently including both | Medium | MEDIUM | Only relevant at domain boundaries -- should be rare with good partitioning |
| Specialist confidence weighting | Specialists report confidence per finding; synthesizer weights HIGH findings above LOW | Low | MEDIUM | Lightweight version of attention-based routing from MoE literature |
| Degraded-mode fallback | If one specialist fails/times out, produce partial panel output with explicit gaps rather than blocking entirely | Medium | HIGH | Important for reliability -- single-agent fallback for failed specialist |
| Panel-level scoring | Aggregate specialist scores into panel-level pass/fail with drill-down | Low | HIGH | Verifier already produces scores; extend to per-specialist breakdown |
| Configurable specialist count | Allow 1-specialist (single-agent mode), 3-specialist (standard), or 5-specialist (deep) per panel | Medium | LOW | Premature optimization; start with 3-specialist only, add later |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Voting/majority consensus between specialists | Specialists own non-overlapping domains -- there is nothing to vote on. Voting suits overlapping evaluations (like auto-discuss where agents evaluate the same gray areas). | Use domain-partitioned assembly: each specialist contributes its section, synthesizer merges. |
| Multi-round debate between specialists | Research shows increasing discussion rounds *decreases* performance (Kaesberg et al., 2025). Adds latency with diminishing returns. | Single-round parallel execution. If cross-validation catches a conflict, the synthesizer resolves it -- no iterative debate. |
| Dynamic specialist routing (MoE-style gating) | True MoE routing requires a trained gating network. Our specialists are pre-assigned -- the "routing" is static by design. Dynamic routing adds complexity without benefit for 3-specialist panels. | Static assignment: each specialist always runs. All 3 always fire. |
| Shared context between parallel specialists | Research shows isolated execution produces better diversity. Claude Code subagents already run in isolated contexts. Sharing context risks groupthink. | Each specialist gets independent context. Synthesizer sees all outputs. |
| Complex weighting/scoring algorithms | Over-engineering the merge. The output is markdown, not numerical predictions. | Simple structured merge with section ownership. |
| Specialist-to-specialist communication during execution | Adds synchronization complexity, defeats the purpose of parallelism, risks cascading failures. | Post-execution cross-validation only (synthesizer reads all outputs, flags contradictions). |

## Consensus Mechanism Analysis

The central design question. Based on research into how multi-agent systems combine specialist outputs.

### Mechanism 1: UNION Assembly (RECOMMENDED)

**What:** Each specialist owns non-overlapping sections of the output document. Synthesizer concatenates sections, resolves boundary conflicts, and produces the final document.

**When it works:** When specialists have clearly partitioned domains with minimal overlap (which is the design intent for all 3 panels).

**Evidence:** This is how diffray's multi-agent code review works -- 11 specialists each own a concern, findings are merged and deduplicated. Google ADK's ParallelAgent pattern also uses this: parallel execution with post-processing merge. The existing gsd-research-synthesizer in this codebase is literally a UNION assembler -- it reads 4 parallel researcher outputs (STACK, FEATURES, ARCHITECTURE, PITFALLS) and synthesizes SUMMARY.md.

**Tradeoffs:**
- PRO: No latency penalty beyond slowest specialist (parallel execution)
- PRO: No information loss (every specialist's findings included)
- PRO: Simple implementation (structured merge, no voting logic)
- CON: Requires clean domain partitioning (overlap = conflicts)
- CON: Synthesizer must handle boundary cases

**Confidence:** HIGH -- This pattern is already proven in the codebase (research-synthesizer, auto-discuss synthesis step).

### Mechanism 2: Majority Voting

**What:** All specialists evaluate the same dimensions. Each votes pass/fail on each dimension. Majority wins.

**When it works:** When you want redundancy -- multiple agents checking the same thing to reduce error.

**Evidence:** The Kaesberg et al. (2025) study found voting improves reasoning tasks by 13.2% over consensus, but this applies to tasks where agents solve the *same* problem. Multi-Agent Verification (MAV) scales verifiers, not specialists.

**Tradeoffs:**
- PRO: Built-in redundancy (3 agents checking same thing = fewer misses)
- CON: 3x the work for marginally better accuracy on the same dimensions
- CON: Loses the benefit of domain specialization (generalist voters, not specialists)
- CON: Still need a tie-breaking mechanism for 3 agents

**Confidence:** HIGH that this is the WRONG pattern for GSD panels. Voting suits auto-discuss (same gray areas, different perspectives). Panels need specialization, not redundancy.

### Mechanism 3: Consensus via Iterative Debate

**What:** Specialists discuss findings, iterate toward agreement, converge on shared output.

**Evidence:** Research shows consensus reduces hallucination on fact-based tasks (2.8% improvement) but multiple rounds decrease overall performance. Debate adds latency proportional to round count.

**Tradeoffs:**
- PRO: May catch edge cases at domain boundaries
- CON: Significantly slower (2-5x latency per round)
- CON: Research explicitly recommends AGAINST multiple rounds
- CON: Complexity explosion in prompt engineering

**Confidence:** HIGH that this is overkill for GSD panels.

### Mechanism 4: Domain-Partitioned Assembly with Cross-Validation (RECOMMENDED VARIANT)

**What:** UNION assembly (Mechanism 1) plus a lightweight cross-validation step where the synthesizer checks for contradictions between specialist outputs before producing the final document.

**Example:** Plan-checker structural specialist says "dependencies valid" but semantic specialist says "task 3 references output from task 1 which doesn't produce that artifact." The synthesizer flags this as a cross-validation conflict and elevates severity.

**Tradeoffs:**
- PRO: Gets the speed of UNION assembly
- PRO: Catches boundary-crossing issues
- PRO: Synthesizer is a natural place for this (already reads all outputs)
- CON: Slightly more complex synthesizer logic

**Confidence:** HIGH -- This is the recommended approach.

## Panel Designs: Detailed Feature Maps

### Panel 1: Plan Checker Panel

**Current single agent:** gsd-plan-checker (8 verification dimensions, returns "VERIFICATION PASSED" or "ISSUES FOUND")

**Panel specialists:**

| Specialist | Domain | Dimensions Owned | Output Section |
|------------|--------|-----------------|----------------|
| **Structural Integrity** | Plan mechanics: frontmatter, task completeness, dependency graphs, wave assignment, scope metrics | Dim 2 (Task Completeness), Dim 3 (Dependency Correctness), Dim 5 (Scope Sanity), Dim 8 (Nyquist Compliance) | `## Structural Analysis` |
| **Semantic Quality** | Goal-backward analysis: requirement coverage, must_haves derivation, key links planned, action specificity | Dim 1 (Requirement Coverage), Dim 4 (Key Links Planned), Dim 6 (Verification Derivation) | `## Semantic Analysis` |
| **Compliance** | External constraints: CONTEXT.md decisions, project skills, CLAUDE.md conventions, deferred ideas exclusion | Dim 7 (Context Compliance), plus project skill rules, plus CLAUDE.md conventions | `## Compliance Analysis` |

**Why this partition:** Structural checks are mechanical (parseable, countable). Semantic checks require reasoning about intent vs. outcome. Compliance checks require cross-referencing external constraint documents. These are genuinely different cognitive tasks.

**Synthesizer behavior:** Merge all 3 sections. Cross-validate: if Structural says "3 tasks" but Semantic says "requirement X covered by tasks 1,2,3,4" -- flag inconsistency. Produce unified issue list with severity. Overall pass/fail uses worst-case: any blocker from any specialist = ISSUES FOUND.

**Output format (backward compatible):**
```markdown
## VERIFICATION PASSED | ISSUES FOUND

**Phase:** {phase-name}
**Plans verified:** {N}
**Panel:** Structural + Semantic + Compliance

### Structural Analysis
[Structural specialist output: dimensions 2,3,5,8]

### Semantic Analysis
[Semantic specialist output: dimensions 1,4,6]

### Compliance Analysis
[Compliance specialist output: dimension 7 + project rules]

### Cross-Validation Notes
[Synthesizer's boundary-crossing findings]

### Unified Issue List
[Merged, deduplicated, severity-ranked issues from all specialists]
```

**Confidence:** HIGH -- The 8-dimension structure naturally partitions into these 3 groups. No dimension is ambiguously assigned.

### Panel 2: Verifier Panel

**Current single agent:** gsd-verifier (3-level artifact verification, key link checks, anti-pattern scanning, creates VERIFICATION.md)

**Panel specialists:**

| Specialist | Domain | Checks Owned | Output Section |
|------------|--------|-------------|----------------|
| **Artifact & Wiring** | File existence, substantive content (not stubs), import/usage wiring, key link verification | Level 1 (exists), Level 2 (substantive), Level 3 (wired), Key Links | `## Artifact Verification` + `## Key Link Verification` |
| **Requirements & Anti-Patterns** | Requirement coverage, anti-pattern scanning (TODO/FIXME/placeholder/empty returns), goal-backward truth verification | Requirement mapping, anti-pattern detection, truth status determination | `## Requirements Coverage` + `## Anti-Patterns Found` |
| **Human Verification** | Items needing human testing, visual/UX concerns, external service integration checks, edge case identification | Human-needed classification, test script generation, uncertainty flagging | `## Human Verification Required` |

**Why this partition:** Artifact/wiring checks are grep-based (mechanical file analysis). Requirement/anti-pattern checks are reasoning-based (does this code satisfy that requirement?). Human verification is judgment-based (what can't be verified programmatically?). Each requires different cognitive approaches and tool usage patterns.

**Synthesizer behavior:** Merge sections into VERIFICATION.md format. Determine overall status: `passed` (all artifacts verified + all requirements satisfied + no blocker anti-patterns), `gaps_found` (any failure), `human_needed` (automated pass but human items remain). Score = verified truths / total truths. Cross-validate: if Artifact specialist says "file exists and is wired" but Anti-Pattern specialist says "file contains only TODO placeholders" -- elevate to blocker.

**Output format (backward compatible):**
```yaml
---
phase: XX-name
verified: YYYY-MM-DDTHH:MM:SSZ
status: passed | gaps_found | human_needed
score: N/M must-haves verified
panel: artifact-wiring + requirements-antipatterns + human-verification
gaps: [...]  # Merged from all specialists
human_verification: [...]  # From human verification specialist
---
```

**Confidence:** HIGH -- The verifier's existing steps (verify_artifacts, verify_wiring, verify_requirements, scan_antipatterns, identify_human_verification) map cleanly to these 3 specialists.

### Panel 3: Research Panel

**Current single agent:** gsd-phase-researcher (produces RESEARCH.md with stack, patterns, pitfalls, code examples)

**Panel specialists:**

| Specialist | Domain | Sections Owned | Output Section |
|------------|--------|---------------|----------------|
| **Stack & Ecosystem** | Library recommendations, versions, alternatives, don't-hand-roll, installation commands | Standard Stack, Don't Hand-Roll, State of the Art, Installation | `## Standard Stack` + `## Don't Hand-Roll` + `## State of the Art` |
| **Architecture & Patterns** | Project structure, design patterns, code examples, recommended organization | Architecture Patterns, Code Examples, Recommended Project Structure | `## Architecture Patterns` + `## Code Examples` |
| **Pitfalls & Validation** | Common mistakes, pitfalls, gotchas, validation architecture (Nyquist), open questions | Common Pitfalls, Validation Architecture, Open Questions | `## Common Pitfalls` + `## Validation Architecture` + `## Open Questions` |

**Why this partition:** These are genuinely different research domains. Stack research requires checking Context7/official docs for current versions. Architecture research requires understanding design patterns and project structure. Pitfall research requires finding community wisdom about what goes wrong. Different tool usage, different sources, different reasoning.

**Synthesizer behavior:** Merge into single RESEARCH.md. Cross-validate: if Stack specialist recommends library X but Pitfalls specialist warns against library X -- flag conflict, let synthesizer resolve or include both with warning. Add Summary section (synthesized from all 3). Ensure User Constraints section appears first (copied from CONTEXT.md by all specialists independently, deduplicated by synthesizer).

**Output format (backward compatible):**
```markdown
# Phase [X]: [Name] - Research

**Researched:** [date]
**Domain:** [domain]
**Confidence:** [level]
**Panel:** Stack + Architecture + Pitfalls

## User Constraints (from CONTEXT.md)
[Synthesizer deduplicates from all 3 specialists]

## Summary
[Synthesizer writes this from combined findings]

## Standard Stack
[From Stack & Ecosystem specialist]

## Architecture Patterns
[From Architecture & Patterns specialist]

## Don't Hand-Roll
[From Stack & Ecosystem specialist]

## Common Pitfalls
[From Pitfalls & Validation specialist]

## Code Examples
[From Architecture & Patterns specialist]

## State of the Art
[From Stack & Ecosystem specialist]

## Validation Architecture
[From Pitfalls & Validation specialist]

## Open Questions
[From Pitfalls & Validation specialist, augmented by synthesizer]

## Sources
[Merged from all specialists]
```

**Confidence:** HIGH -- This is essentially the same pattern as the existing project research pipeline (4 parallel researchers + synthesizer) but applied at phase level.

## Feature Dependencies

```
Per-panel config (config.json) --> Panel enablement check in orchestrators
  |
  v
Specialist agent definitions (9 agents/*.md files)
  |
  v
Panel orchestration logic in workflows (plan-phase.md, execute-phase.md, research-phase.md)
  |
  v
Synthesizer logic (per-panel merge + cross-validation)
  |
  v
Backward-compatible output format (same VERIFICATION.md / RESEARCH.md / checker return)
  |
  v
Degraded-mode fallback (if specialist fails, fall back to single-agent)
```

**Critical dependency:** Specialist agent definitions must be complete before orchestration logic can be tested. The 9 agent .md files are the largest work item and the foundation for everything else.

**Parallel work streams:**
- Stream A: Specialist agent definitions (9 files) -- can be done in parallel across panels
- Stream B: Config schema updates -- independent of agent definitions
- Stream C: Orchestrator workflow updates -- depends on A being at least partially done

## Implementation Complexity Assessment

| Component | Effort | Risk | Notes |
|-----------|--------|------|-------|
| 9 specialist agent .md files | HIGH (largest effort) | LOW (well-understood pattern from existing agents) | Each is ~200-400 lines. Total ~2700-3600 lines of prompt engineering. |
| Config schema updates | LOW | LOW | Add `panel` section to config.json with per-gate enable/disable |
| plan-phase.md orchestrator update | MEDIUM | MEDIUM | Replace single plan-checker spawn with 3 parallel + synthesizer |
| execute-phase.md orchestrator update | MEDIUM | MEDIUM | Replace single verifier spawn with 3 parallel + synthesizer |
| research-phase.md / plan-phase.md research step | MEDIUM | LOW | Already has pattern from project research pipeline |
| Synthesizer logic (3 synthesizers) | MEDIUM | MEDIUM | Could be inline in orchestrator or separate agents. Inline is simpler. |
| Cross-validation logic | LOW | LOW | Lightweight post-merge check in synthesizer |
| Degraded-mode fallback | LOW | LOW | If specialist timeout, run single-agent as fallback |
| Testing/validation | HIGH | HIGH | Need to verify panel output matches what downstream consumers expect |

## MVP Recommendation

**Phase 1 (Foundation): Agent Definitions + Config**
1. Define 9 specialist agent .md files (3 panels x 3 specialists)
2. Add panel config schema to config.json
3. No orchestrator changes yet -- agents can be tested standalone

**Phase 2 (Integration): Orchestrator Panel Spawning**
1. Update plan-phase.md to spawn plan-checker panel (3 parallel + inline synthesis)
2. Update execute-phase.md to spawn verifier panel (3 parallel + inline synthesis)
3. Update plan-phase.md research step to spawn research panel (3 parallel + inline synthesis)
4. Add backward-compatible output format validation

**Phase 3 (Hardening): Cross-Validation + Fallback**
1. Add cross-validation logic to synthesizers
2. Add degraded-mode fallback for specialist failures
3. Add panel-level scoring and drill-down
4. Test autopilot end-to-end with panels

**Defer:**
- Configurable specialist count (1/3/5) -- start with 3 only, add later if needed
- Specialist-to-specialist communication -- anti-feature, don't build
- Complex weighting algorithms -- unnecessary for markdown-based outputs

## Sources

### Primary (HIGH confidence)
- GSD codebase analysis: agents/gsd-plan-checker.md, agents/gsd-verifier.md, agents/gsd-phase-researcher.md, agents/gsd-research-synthesizer.md
- GSD workflow analysis: workflows/plan-phase.md, workflows/execute-phase.md, workflows/auto-discuss.md, workflows/new-project.md
- Google ADK Parallel Agent documentation: https://google.github.io/adk-docs/agents/workflow-agents/parallel-agents/

### Secondary (MEDIUM confidence)
- Kaesberg et al. (2025) "Voting or Consensus? Decision-Making in Multi-Agent Debate" -- https://arxiv.org/abs/2502.19130 -- Systematic evaluation of 7 decision protocols. Key finding: voting better for reasoning, consensus for knowledge, more agents better than more rounds.
- Qodo "Single-Agent vs Multi-Agent Code Review" -- https://www.qodo.ai/blog/single-agent-vs-multi-agent-code-review/ -- Architecture for domain-partitioned code review with explicit pass/fail signals per specialist.
- Diffray "Multi-Agent Code Review" -- https://diffray.ai/multi-agent-code-review/ -- 11-specialist architecture with cross-validation and deduplication. 87% fewer false positives.
- ProofSource "Parallel Sub-Agents in Claude Code" -- https://proofsource.ai/2025/12/parallel-sub-agents-in-claude-code-multiplying-your-development-speed/ -- Claude Code synthesizes subagent findings into coherent responses. Diminishing returns beyond 4-5 parallel agents.

### Tertiary (LOW confidence)
- General multi-agent system surveys from 2025 (classicinformatics, ioni.ai, neomanex) -- broad patterns, not GSD-specific
- MoE model architecture literature (HuggingFace, NVIDIA) -- neural network MoE patterns; analogy to agent panels is loose
