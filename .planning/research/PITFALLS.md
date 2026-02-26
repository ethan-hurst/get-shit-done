# Domain Pitfalls: MoE Panels for Agent Orchestration

**Domain:** Parallel agent orchestration with output merging and consensus logic
**Researched:** 2026-02-26
**Overall confidence:** HIGH (pitfalls derived from codebase analysis + multi-agent system literature)

---

## Critical Pitfalls

Mistakes that cause rewrites, broken workflows, or silent data loss.

---

### Pitfall 1: Output Contract Drift Between Panel and Single-Agent Mode

**What goes wrong:** Panel output diverges from the exact string patterns that downstream workflows regex-match. The plan-phase.md workflow matches `## VERIFICATION PASSED` and `## ISSUES FOUND` as literal strings. The execute-phase.md workflow greps `^status:` from VERIFICATION.md frontmatter. The research-phase.md workflow matches `## RESEARCH COMPLETE` and `## RESEARCH BLOCKED`. If a panel's merging logic produces `## Verification Passed` (wrong case), `## ISSUES FOUND\n\n` (extra newline before content), or `status:  passed` (double space), the downstream orchestrator silently falls through to a default branch and the workflow breaks.

**Why it happens:** Three specialists each produce markdown independently. A synthesizer/merger must reconstruct the exact output, but no specialist "owns" the final header format. The merger may normalize whitespace, adjust casing, or insert its own section headers that subtly differ. LLM agents are nondeterministic -- even with identical prompts, they produce slightly different formatting.

**Consequences:**
- Orchestrator workflows silently misroute (no error, just wrong branch)
- `plan-phase.md` step 11 fails to detect `## VERIFICATION PASSED` and treats it as inconclusive, entering an infinite revision loop or max-iteration bailout
- `execute-phase.md` step `verify_phase_goal` fails to grep `^status:` from VERIFICATION.md, treating a passed verification as gaps_found
- Users see "gaps found" when everything actually passed -- trust erodes

**Prevention:**
1. The orchestrator (not the specialists) must own the final output template. Specialists produce structured data (YAML/JSON or structured markdown sections). The orchestrator assembles the final output using a deterministic template with hardcoded headers.
2. Define output contracts as constants in a shared reference file (`references/panel-contracts.md`) that both panel workflows and tests reference.
3. Never let LLM agents write the `## VERIFICATION PASSED` / `## ISSUES FOUND` header -- the orchestrator writes it based on parsed specialist data.
4. Add contract tests: for each panel, assert that output exactly matches a regex set extracted from the consuming workflow's matching patterns.

**Detection:** Integration test that runs panel mode and single-agent mode on identical input, then diffs the structural elements (headers, frontmatter keys, status values). Any diff is a test failure.

**Confidence:** HIGH -- directly derived from codebase analysis of `plan-phase.md`, `execute-phase.md`, `verify-phase.md`, and `research-phase.md` workflow routing patterns.

---

### Pitfall 2: Consensus Logic Double-Counting or Dropping Findings

**What goes wrong:** In the Plan Checker Panel, three specialists (Structural, Semantic, Compliance) may each report the same underlying issue from different angles. UNION of blockers and MAJORITY of warnings sounds simple, but:
- **Double-counting:** Specialist A reports "Task 2 missing <verify>" as a structural issue. Specialist B reports "Task 2 cannot be validated" as a semantic issue. These are the same problem counted twice, inflating the blocker count and confusing the planner during revision.
- **Dropping findings:** If dedup is too aggressive (e.g., matching on task number alone), distinct issues on the same task get collapsed. "Task 2 missing <verify>" and "Task 2 scope too broad" are different problems that share a task reference.
- **Conflicting severities:** Specialist A says "blocker", Specialist B says "warning" for the same finding. UNION of blockers means any-one-says-blocker wins. But if the blocker assessment is wrong (LLM hallucination), there is no correction mechanism.

**Why it happens:** Deduplication requires semantic similarity judgment, not exact string matching. The issue descriptions from three LLM agents will never be identical strings even when describing the same problem. Naive dedup (exact match) catches nothing. Aggressive dedup (substring match on plan+task) drops distinct issues.

**Consequences:**
- Planner receives inflated issue count, over-revises plans (rewrites that introduce new problems)
- Planner receives collapsed issues, misses one of two distinct problems
- Revision loop hits max iterations because "fixed" issues keep reappearing from a different specialist's perspective

**Prevention:**
1. Normalize findings to a canonical structure BEFORE dedup: `{plan_id, task_id, dimension, severity, description}`. Dedup on `{plan_id, task_id, dimension}` tuple -- same plan, same task, same dimension = same finding, take highest severity.
2. If two specialists report the same plan+task but different dimensions (e.g., `task_completeness` vs `scope_sanity`), keep both -- they are genuinely different concerns.
3. For severity conflicts: take the highest severity (conservative). A blocker from any specialist is a blocker. This matches the stated UNION-blockers rule.
4. Include a `reported_by` field in merged output so the planner can see which specialists flagged which issues. Transparency reduces confusion during revision.
5. Add a dedup count: "3 specialists flagged this" vs "1 specialist flagged this" helps the planner prioritize.

**Detection:** Unit test with three specialist outputs containing known overlapping and distinct issues. Assert merged output has exact expected count, correct severity escalation, and no dropped findings.

**Confidence:** HIGH -- the Plan Checker agent already defines 8 verification dimensions (requirement_coverage, task_completeness, dependency_correctness, etc.). The dimension field is the natural dedup key. This is directly grounded in `gsd-plan-checker.md`.

---

### Pitfall 3: Verifier Panel Domain Boundary Bleed

**What goes wrong:** The Verifier Panel uses domain-partitioned assembly (not voting): Artifacts specialist checks file existence/substance, Requirements specialist checks requirement coverage, Human-verification specialist identifies what needs manual testing. The risk is that domains bleed: the Artifacts specialist discovers a missing file that is also a requirement gap, and the Requirements specialist independently discovers the same gap from the requirements side. Or worse, neither specialist covers a cross-cutting concern because each assumes the other handles it.

**Why it happens:** Clean domain boundaries look clear on paper (artifacts vs requirements vs human) but real verification findings are cross-cutting. A missing API route is simultaneously an artifact issue (file does not exist), a requirement issue (REQ-AUTH-01 not satisfied), and potentially a human-verification issue (cannot test login flow). Domain partitioning means each specialist sees only their slice of the problem.

**Consequences:**
- **Gap between domains:** No specialist checks key_links (wiring between artifacts). The current single-agent verifier checks three levels: exists, substantive, wired. If "wired" falls between Artifacts and Requirements domains, nobody checks it.
- **Redundant findings:** Same missing file appears in both Artifacts and Requirements sections with different descriptions, confusing the gap-closure planner.
- **VERIFICATION.md structural inconsistency:** The single-agent verifier produces a specific YAML frontmatter structure (`gaps:` with `truth`, `status`, `reason`, `artifacts`, `missing`). Domain-partitioned assembly must reconstruct this exact structure from three separate domain reports.

**Prevention:**
1. Pre-compute shared data BEFORE specialist dispatch. The orchestrator runs `gsd-tools.cjs verify artifacts` and `gsd-tools.cjs verify key-links` once, then distributes the JSON results to all specialists. This eliminates the "discovery" phase overlap.
2. Assign key_links (wiring) verification explicitly to the Artifacts specialist. Make domain ownership unambiguous in the specialist prompts.
3. Assembly logic must deduplicate on `artifact.path` -- if both Artifacts and Requirements report an issue for the same file, merge into one gap entry with evidence from both.
4. The assembly step is deterministic code (not LLM). It reads structured sections from each specialist and templates them into the VERIFICATION.md format. Never have an LLM "synthesize" verification output -- the format contract is too strict.

**Detection:** Test with a scenario where a missing file satisfies multiple domain concerns. Assert the merged VERIFICATION.md contains exactly one gap entry for that file with composite evidence, not duplicates.

**Confidence:** HIGH -- the verifier agent's VERIFICATION.md format is fully specified in `gsd-verifier.md` with YAML frontmatter schema. Domain partitioning assembly must reconstruct this exact schema.

---

### Pitfall 4: Specialist Timeout or Failure Breaks Entire Panel

**What goes wrong:** One of three specialists times out (Claude Code has execution time limits), crashes, or produces malformed output. The panel either: (a) fails entirely and produces no output, breaking the workflow, or (b) waits indefinitely for the failed specialist, blocking the entire pipeline.

**Why it happens:** Claude Code Task subagents can fail due to context limits, model errors, `classifyHandoffIfNeeded` bugs (documented in execute-phase.md), or simple timeouts. With a single agent, failure is straightforward -- the workflow catches it. With three parallel agents, partial failure is the hard case.

**Consequences:**
- If the panel requires all three specialists: one failure = total panel failure = workflow stops
- If the panel waits for all: one hanging specialist blocks everything
- If the panel proceeds with 2/3: output quality degrades but silently (user does not know one specialist did not contribute)

**Prevention:**
1. **Graceful degradation rule:** If 2/3 specialists succeed, the panel produces output using available results with a warning header: `Note: {specialist_name} did not complete. Results from {N}/3 specialists.`
2. **Never wait indefinitely.** Set a timeout per specialist. If a specialist has not returned when others have, proceed after a reasonable delay.
3. **Fallback to single-agent mode:** If 2/3 specialists fail, abandon the panel and fall back to the single-agent version of the step. This is the safest degradation path because the single-agent mode is the existing, tested code path.
4. **For the Plan Checker Panel:** 2/3 is still valid for UNION blockers (any blocker from any specialist is still a blocker). For MAJORITY warnings, 2/3 means majority = 2 agrees, which still works.
5. **For the Verifier Panel:** If the Artifacts specialist fails, the pre-computed shared data (from gsd-tools.cjs) is still available. The orchestrator can inject it directly into the assembly. If the Requirements specialist fails, the orchestrator can do a simple requirements-to-artifacts cross-reference from the pre-computed data.
6. **For the Research Panel:** If one domain researcher fails, the inline synthesis simply notes the gap: "Stack research not available -- this area needs phase-specific research later."

**Detection:** Test by mocking one specialist returning an error or empty output. Assert the panel still produces valid output (with degradation warning) that passes the output contract tests from Pitfall 1.

**Confidence:** HIGH -- the `classifyHandoffIfNeeded` bug is already documented in `execute-phase.md` step 5. Partial failure handling is a well-established pattern in the codebase's wave execution model (where one plan failing in a wave does not necessarily stop other plans).

---

### Pitfall 5: Context Window Bloat From Passing Full Context to All Three Specialists

**What goes wrong:** Each specialist needs context to do its job. Naively passing the full context (ROADMAP, STATE, REQUIREMENTS, CONTEXT.md, RESEARCH.md, all PLAN.md files, codebase analysis docs) to all three specialists triples the effective context cost. Specialists hit context limits and produce degraded output (hallucinations, missed findings, truncated analysis).

**Why it happens:** The current single-agent architecture passes context via `<files_to_read>` blocks -- the agent reads files independently using its fresh 200K context window. This works well for one agent. For three agents, the problem is not the file reading itself (each gets fresh context) but the API cost and latency of three parallel 200K-context conversations.

More insidiously: if specialists are given files irrelevant to their domain, they waste context on parsing and may get confused by irrelevant information, producing lower-quality findings.

**Consequences:**
- 3x API cost per panel invocation (3 specialists each with full context)
- Slower panel execution (3 parallel model calls with large context)
- Lower specialist quality: irrelevant context = attention dilution = worse findings

**Prevention:**
1. **Scope specialist context to their domain.** The Plan Checker Structural specialist needs PLAN.md files only (not RESEARCH.md, not STATE.md). The Semantic specialist needs PLAN.md + ROADMAP goal + REQUIREMENTS. The Compliance specialist needs PLAN.md + CONTEXT.md (user decisions). Each specialist reads only what it needs.
2. **Pre-compute shared data.** The Verifier Panel should run `gsd-tools.cjs verify artifacts` and `gsd-tools.cjs verify key-links` ONCE and distribute JSON results, not have each specialist independently read and grep the entire codebase.
3. **For the Research Panel:** Domain researchers already have scoped concerns (Stack, Architecture, Pitfalls). Each reads only the files relevant to their domain. The orchestrator should not pass all codebase analysis files to all three researchers.
4. **Measure context efficiency:** Add a diagnostic that logs total tokens consumed per specialist. If any specialist uses more than 60% of its context window, the scoping is too broad.

**Detection:** Log context window usage per specialist invocation during testing. Alert if any specialist exceeds 60% context utilization on test inputs.

**Confidence:** HIGH -- Anthropic's own engineering blog recommends scoped context per sub-agent. The GSD architecture already follows this principle (orchestrator passes paths, not content). The risk is that panel implementation regresses this pattern by over-sharing.

---

## Moderate Pitfalls

---

### Pitfall 6: Research Panel Inline Synthesis Produces Inconsistent File Structure

**What goes wrong:** The Research Panel has 3 domain researchers (Stack, Architecture, Pitfalls) with inline synthesis by the orchestrator (no separate synthesizer). The risk: the orchestrator must produce multiple research files (SUMMARY.md, STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md) from three domain-specific outputs. If each researcher produces different structural conventions (different heading levels, different frontmatter, different confidence level labels), the orchestrator's inline synthesis produces inconsistent files.

**Why it happens:** The current `gsd-project-researcher.md` agent produces all five files with consistent internal formatting because one agent writes all files. When three specialists each write their domain, they may use different formatting conventions despite having the same output format specification in their prompts. LLM agents are not deterministic -- even identical prompts produce variation.

**Prevention:**
1. Each domain researcher writes exactly ONE file in their domain (Stack researcher -> STACK.md, Architecture researcher -> ARCHITECTURE.md, Pitfalls researcher -> PITFALLS.md).
2. The orchestrator writes SUMMARY.md and FEATURES.md by reading the three domain files and synthesizing. These two files are cross-cutting (they reference findings from all domains).
3. Provide a strict template for each domain file with exact heading structure, table formats, and frontmatter fields. The template is in `get-shit-done/templates/research-project/`.
4. The orchestrator validates each file's structure before committing: correct frontmatter, expected headings present, confidence levels using correct vocabulary (HIGH/MEDIUM/LOW, not "high"/"medium"/"low").

**Detection:** Structure validation test: parse each research output file and assert expected headings, frontmatter keys, and confidence level vocabulary match the template specification.

**Confidence:** MEDIUM -- the exact research output templates exist in the codebase but are guidance, not strict schemas. The risk is moderate because research files are consumed by humans (roadmap creation) not by regex-matching workflows, so slight format variation is more tolerable than in verification or plan-checking output.

---

### Pitfall 7: Config Migration Breaks Existing Installations

**What goes wrong:** Three new config keys (`plan_check_panel`, `verifier_panel`, `research_panel`) are added to `config.json`. Existing installations have no these keys. If the code checks `config.plan_check_panel === true` but the key does not exist, it returns `undefined` which is falsy -- correct behavior (panels disabled by default). But if ANY code path checks `config.plan_check_panel !== false` (testing for explicit opt-out instead of explicit opt-in), missing keys evaluate to `true` and panels activate unexpectedly on existing installations.

**Why it happens:** JavaScript truthiness gotchas. `undefined !== false` is `true`. This is a classic boolean config default problem that has bitten many CLI tools.

**Prevention:**
1. **Always check for explicit opt-in:** `config.plan_check_panel === true`, never `config.plan_check_panel !== false`.
2. **Normalize config at load time:** In `core.cjs` config loading, add default values for all panel keys: `{ plan_check_panel: false, verifier_panel: false, research_panel: false }`. Use `Object.assign(defaults, loadedConfig)` pattern.
3. **Do not update the template config.json** to include panel keys with `true` values. The template should either omit them (relying on defaults) or explicitly set them to `false`.
4. **Add a config schema version.** When new keys are added, bump the schema version. The health check (`/gsd:health`) can warn about missing keys and offer to add defaults.
5. **Test with a config.json that has NO panel keys** -- this is the upgrade path for every existing user.

**Detection:** Unit test in `tests/core.test.cjs` (or wherever config loading is tested): load a config.json without panel keys, assert all panel features are disabled.

**Confidence:** HIGH -- the existing config template in `get-shit-done/templates/config.json` does not have panel keys. The `workflow` section has `research`, `plan_check`, and `verifier` as boolean flags already. The new panel keys must coexist with these existing keys without conflict (see Pitfall 8).

---

### Pitfall 8: Config Key Naming Collision With Existing Workflow Keys

**What goes wrong:** The existing config already has `workflow.plan_check: true` (enables the plan checker step) and `workflow.verifier: true` (enables the verifier step). The new MoE keys are `plan_check_panel`, `verifier_panel`, `research_panel`. The risk: confusing interaction between `workflow.plan_check` (enable/disable the step entirely) and `plan_check_panel` (use panel mode vs single-agent mode when the step IS enabled).

Consider: `workflow.plan_check: false, plan_check_panel: true`. Does this mean: skip plan checking entirely (first key wins) or use panel mode for plan checking (second key wins)? The correct answer is: `workflow.plan_check` gates whether the step runs at all; `plan_check_panel` selects the implementation when it does run. But if this is not documented and tested, bugs will emerge.

**Why it happens:** Two levels of configuration (feature gate vs implementation selector) is inherently confusing. The naming convention does not make the relationship obvious.

**Prevention:**
1. **Nest panel config under `workflow`:** `workflow.plan_check_panel`, `workflow.verifier_panel`, `workflow.research_panel`. This keeps all workflow toggles in one place and makes the hierarchy clear.
2. **Document the precedence rule explicitly:** `workflow.plan_check` must be `true` for `workflow.plan_check_panel` to have any effect. If the step is disabled, the panel key is ignored.
3. **Init command should enforce this:** `gsd-tools.cjs init plan-phase` already returns `plan_checker_enabled`. It should also return `plan_check_panel_enabled`, computed as `workflow.plan_check === true && workflow.plan_check_panel === true`.
4. **Add a truth table to the config template as a comment or to the user guide:**

| `workflow.plan_check` | `workflow.plan_check_panel` | Behavior |
|---|---|---|
| `false` | any | Plan checking skipped entirely |
| `true` | `false` or missing | Single-agent plan checker (current behavior) |
| `true` | `true` | 3-specialist panel plan checker |

**Detection:** Integration test: set `plan_check: false, plan_check_panel: true`, assert plan checking does NOT run. Set `plan_check: true, plan_check_panel: false`, assert single-agent mode runs. Set `plan_check: true, plan_check_panel: true`, assert panel mode runs.

**Confidence:** HIGH -- directly derived from examining `get-shit-done/templates/config.json` and the `plan-phase.md` workflow which already checks `plan_checker_enabled` from init JSON.

---

### Pitfall 9: Dedup Logic Fails on Semantically Similar But Textually Different Issues

**What goes wrong:** The Plan Checker Panel's consensus logic requires deduplicating issues across three specialists. Two specialists might report:
- Specialist A: `"Task 2 missing <verify> element"` (dimension: task_completeness)
- Specialist B: `"Task 2 lacks verification step"` (dimension: task_completeness)

These are the same issue, but string comparison misses the match. If dedup relies on exact description matching, duplicates survive. If dedup relies on `{plan, task, dimension}` tuple (as recommended in Pitfall 2), these correctly deduplicate. But edge cases exist:
- Phase-level issues (no task reference): `{plan: null, task: null, dimension: scope_sanity}` -- two specialists both flag scope concerns with different descriptions. Tuple match works but loses the distinct details.
- Multi-task issues: "Plans 02 and 03 have circular dependency" -- this has two plan references, not one.

**Prevention:**
1. Require specialists to output issues in the existing structured YAML format (from `gsd-plan-checker.md`): `{plan, dimension, severity, description, task, fix_hint}`. Dedup on `{plan, task, dimension}`.
2. For phase-level issues (no task), dedup on `{plan: null, task: null, dimension}`. If two specialists flag the same dimension at the phase level, keep the more detailed description.
3. For multi-plan issues (circular dependencies), normalize to the first plan in the cycle as the canonical plan reference.
4. Do NOT attempt semantic similarity matching (no embeddings, no LLM-as-judge for dedup). The structured fields provide sufficient dedup keys. Semantic similarity adds complexity and nondeterminism to what should be a deterministic merge step.

**Detection:** Unit test with edge cases: phase-level issues from multiple specialists, circular dependency issues, and identical-dimension-different-description pairs.

**Confidence:** HIGH -- the issue format is already well-defined in `gsd-plan-checker.md`. Structured dedup on defined fields is deterministic and testable.

---

### Pitfall 10: Panel Mode Cannot Be Tested End-to-End Without Expensive LLM Calls

**What goes wrong:** Panel logic involves spawning 3 LLM agents, collecting their outputs, and merging. Unit tests can mock the specialist outputs and test the merge logic. But end-to-end tests (verifying the full pipeline from input to final output) require actual LLM calls, which are expensive, slow, and nondeterministic.

**Why it happens:** The core value of panels is that multiple LLM specialists produce diverse findings. Mocking them eliminates the very thing being tested (LLM diversity). But real LLM calls make CI unreliable (model output varies, tests flake).

**Consequences:**
- Tests pass with mocked outputs but fail with real LLM calls due to unexpected formatting
- Output contract violations are only discovered in production (user runs panel, gets malformed output)
- CI becomes slow and expensive if real LLM calls are included

**Prevention:**
1. **Layer the testing strategy:**
   - **Unit tests (CI):** Test merge/consensus/dedup logic with fixed specialist outputs. These are deterministic, fast, and catch logic bugs. This is where 90% of panel bugs will be caught.
   - **Contract tests (CI):** Validate that merge output matches output contract patterns (regex from consuming workflows). Use fixed inputs, assert structural correctness.
   - **Integration tests (manual/nightly):** Run full panel with real LLM calls. Compare structural output against single-agent output for same input. Flag structural differences (not content differences).
2. **Snapshot testing for output structure:** Capture the structural skeleton of panel output (headers, frontmatter keys, section order) and snapshot it. Content varies, structure must not.
3. **The merge step MUST be deterministic code, not LLM.** This makes the merge logic fully testable without LLM calls. Only specialist dispatch requires LLMs; everything after collection is pure code.

**Detection:** CI test suite with contract tests that run on every PR. Nightly integration test that runs full panel and diffs structural output.

**Confidence:** HIGH -- the existing test infrastructure uses `node:test` + `node:assert` with temp directory isolation. Merge logic can be tested as pure functions. The testing pattern is well-established in the codebase (433 tests, 94% coverage).

---

## Minor Pitfalls

---

### Pitfall 11: Parallel Specialist Spawn Order Creates Non-Deterministic Merge Order

**What goes wrong:** Three specialists are spawned in parallel. The order they complete is nondeterministic (depends on model latency, context size, network conditions). If the merge logic processes results in completion order rather than a fixed order, the output varies between runs even with identical inputs. This makes debugging harder and snapshot tests fragile.

**Prevention:** Always sort specialist results by specialist name/role before merging. The merge function takes an array sorted by `[structural, semantic, compliance]` (or `[artifacts, requirements, human]`), not by completion time.

**Confidence:** HIGH -- trivial to implement, easy to miss.

---

### Pitfall 12: Specialist Prompts Drift From Single-Agent Prompts Over Time

**What goes wrong:** The single-agent versions (gsd-plan-checker.md, gsd-verifier.md, gsd-project-researcher.md) continue to be maintained and updated. The specialist panel prompts are derivatives. Over time, updates to the single agent are not propagated to the specialists, creating behavioral divergence.

**Prevention:**
1. Specialist prompts should `@include` or reference the base agent prompt and add only their domain-scoping delta. Do not copy-paste the full agent prompt into specialist prompts.
2. If full inclusion is too expensive (context), extract the shared verification dimensions/process steps into a shared reference file (`references/plan-check-dimensions.md`) that both the single-agent and specialist prompts reference.
3. Add a CI check: hash the base agent prompt sections and compare against the specialist prompts. If the base changes, flag the specialists for review.

**Confidence:** MEDIUM -- this is a maintenance concern, not an implementation bug. It will not cause problems at launch but will accumulate over months.

---

### Pitfall 13: Research Panel Domain Researchers Produce Overlapping Content

**What goes wrong:** The Stack researcher covers "what technology to use." The Architecture researcher covers "how to structure the system." The Pitfalls researcher covers "what can go wrong." But technology choices (Stack) inform architecture decisions (Architecture), and both inform pitfalls (Pitfalls). Without careful domain boundaries, each researcher partially duplicates the others' work. The inline synthesis then has to reconcile three partially-overlapping narratives.

**Prevention:**
1. Define hard exclusion rules in each specialist prompt:
   - Stack: technology selection and rationale. Does NOT discuss architecture patterns or failure modes.
   - Architecture: system structure, component boundaries, data flow. Does NOT discuss technology selection or common mistakes.
   - Pitfalls: failure modes, anti-patterns, risks. Does NOT recommend technologies or define architecture.
2. Accept minor overlap as natural. The synthesis step (SUMMARY.md, FEATURES.md) is where cross-cutting concerns are reconciled. The domain files are allowed to reference each other ("see STACK.md for technology choice rationale") without duplicating.

**Confidence:** MEDIUM -- overlap is inherent in domain decomposition. It is manageable with clear prompt boundaries but cannot be fully eliminated.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Panel infrastructure (config, routing) | Config key collision with existing workflow keys (Pitfall 8) | Nest under `workflow.*`, test all 4 combinations of enable/panel flags |
| Plan Checker Panel consensus | Double-counting or dropping findings (Pitfall 2) | Structured dedup on `{plan, task, dimension}` tuple with severity escalation |
| Plan Checker Panel output | Output contract drift (Pitfall 1) | Orchestrator writes final headers from structured data, contract tests |
| Verifier Panel assembly | Domain boundary bleed (Pitfall 3) | Pre-compute shared data, assign key_links to Artifacts specialist explicitly |
| Verifier Panel output | VERIFICATION.md format deviation (Pitfall 1) | Deterministic code assembly, not LLM synthesis of final output |
| Research Panel synthesis | Overlapping domain content (Pitfall 13) | Hard exclusion rules in prompts, accept minor overlap, synthesize in SUMMARY.md |
| Specialist failure handling | One specialist timeout breaks panel (Pitfall 4) | Graceful degradation to 2/3, fallback to single-agent mode at 1/3 |
| Testing strategy | Cannot test panels end-to-end cheaply (Pitfall 10) | Layered testing: unit (merge logic) + contract (output structure) + integration (nightly) |
| Backwards compatibility | Config migration breaks existing users (Pitfall 7) | Explicit opt-in (`=== true`), normalize defaults at load time, test without panel keys |

---

## Cross-Cutting Design Principles

These principles address multiple pitfalls simultaneously:

### Principle 1: Orchestrator Owns Output, Specialists Own Analysis

Specialists produce structured findings (YAML issues, JSON verification results, markdown sections with defined headings). The orchestrator/merge-step assembles these into the final output using deterministic templates. Never let an LLM write the structural wrapper -- only the content within sections.

**Addresses:** Pitfall 1, 3, 6

### Principle 2: Pre-Compute, Then Distribute

Any data that multiple specialists need should be computed once by the orchestrator (using gsd-tools.cjs) and distributed as input, not computed independently by each specialist. This reduces cost, eliminates inconsistency, and makes the pre-computed data available for fallback if a specialist fails.

**Addresses:** Pitfall 3, 4, 5

### Principle 3: Deterministic Merge, Nondeterministic Analysis

The analysis step (what specialists find) is nondeterministic by nature -- that is the point of using multiple LLM agents. The merge step (how findings are combined) must be deterministic code. This separation makes the merge fully testable without LLM calls and ensures output contract compliance.

**Addresses:** Pitfall 1, 2, 9, 10

### Principle 4: Graceful Degradation to Known-Good Path

Every panel must have a fallback path to the existing single-agent mode. If panels are enabled but failing, the system should degrade to the working single-agent implementation rather than producing no output or broken output. This is the safety net that makes opt-in panels low-risk.

**Addresses:** Pitfall 4, 7, 8

---

## Sources

- GSD codebase analysis: `agents/gsd-plan-checker.md`, `agents/gsd-verifier.md`, `agents/gsd-project-researcher.md` (output contract patterns) -- HIGH confidence
- GSD codebase analysis: `get-shit-done/workflows/plan-phase.md`, `get-shit-done/workflows/execute-phase.md`, `get-shit-done/workflows/verify-phase.md` (downstream regex matching) -- HIGH confidence
- GSD codebase analysis: `get-shit-done/templates/config.json` (existing config structure) -- HIGH confidence
- GSD codebase analysis: `get-shit-done/bin/lib/verify.cjs`, `get-shit-done/bin/lib/frontmatter.cjs` (output parsing code) -- HIGH confidence
- [ACL 2025: Voting or Consensus? Decision-Making in Multi-Agent Debate](https://aclanthology.org/2025.findings-acl.606/) -- MEDIUM confidence (academic; applied indirectly to agent panels)
- [Maxim.ai: Multi-Agent System Reliability](https://www.getmaxim.ai/articles/multi-agent-system-reliability-failure-patterns-root-causes-and-production-validation-strategies/) -- MEDIUM confidence (industry patterns, verified against GSD architecture)
- [Azure Architecture Center: AI Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) -- MEDIUM confidence (general patterns)
- [Google ADK: Parallel Agents](https://google.github.io/adk-docs/agents/workflow-agents/parallel-agents/) -- MEDIUM confidence (framework-specific but pattern applicable)
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) -- MEDIUM confidence (authoritative source on context scoping)
- [JetBrains Research: Context Management for LLM-Powered Agents](https://blog.jetbrains.com/research/2025/12/efficient-context-management/) -- LOW confidence (single source, applied indirectly)
