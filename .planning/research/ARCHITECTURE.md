# Architecture Patterns: MoE Panel Integration

**Domain:** Agent orchestration panel dispatch within CLI workflow engine
**Researched:** 2026-02-26
**Confidence:** HIGH (based on direct codebase analysis of existing patterns)

## Recommended Architecture

MoE Panels are **orchestrator agents that replace single agents at dispatch points**. Three panels replace three existing single agents: `gsd-plan-checker` (plan verification), `gsd-verifier` (phase verification), and `gsd-phase-researcher` (research). Each panel spawns 3 specialist subagents in parallel, synthesizes their outputs, and returns the **exact same structured output contract** as the single agent it replaces.

The key architectural insight: panels are a **transparent substitution**. The workflow files (`plan-phase.md`, `execute-phase.md`) dispatch to either a single agent or a panel agent based on a config flag. The orchestrator workflow never knows or cares whether a single agent or a panel produced the output -- the return contract is identical.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `config.json` workflow section | Stores `plan_check_panel`, `verifier_panel`, `researcher_panel` booleans | Read by `init.cjs` commands |
| `init.cjs` init commands | Resolves panel flags + panel model into INIT JSON for workflows | Consumed by workflow orchestrators |
| `core.cjs` MODEL_PROFILES | Maps panel agent names to model tiers | Called by `resolveModelInternal` |
| Workflow files (plan-phase, execute-phase) | Conditional dispatch: panel flag true -> spawn panel agent, false -> spawn single agent | Spawn panel or single agents via Task() |
| Panel agent `.md` files | Orchestrate 3 parallel specialists, synthesize, return structured output | Spawn specialist agents via Task(), return to workflow |
| Specialist prompts | Inline within panel agent (NOT separate agent files) | Spawned by panel orchestrator, return findings |

### Data Flow

```
config.json
  |
  v
init.cjs (resolves flags + models into INIT JSON)
  |
  v
workflow.md (plan-phase / execute-phase)
  |
  +--> [if panel=false] --> single agent (gsd-plan-checker / gsd-verifier / gsd-phase-researcher)
  |                              |
  |                              v
  |                         structured return (## VERIFICATION PASSED / ## ISSUES FOUND / etc.)
  |
  +--> [if panel=true]  --> panel agent (gsd-plan-checker-panel / gsd-verifier-panel / gsd-researcher-panel)
                               |
                               +--> Task(specialist-1, model=panel_model) --|
                               +--> Task(specialist-2, model=panel_model) --+--> parallel
                               +--> Task(specialist-3, model=panel_model) --|
                               |
                               v
                          synthesize (majority consensus / union of findings)
                               |
                               v
                          structured return (SAME contract as single agent)
```

## Integration Point 1: Config Routing

### Current Config Structure

The existing config uses `workflow.*` keys for boolean agent toggles:

```json
{
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "auto_advance": false,
    "nyquist_validation": false
  }
}
```

### Recommended Config Extension

Add `*_panel` keys alongside existing toggles. A panel flag is only meaningful when its parent toggle is `true`.

```json
{
  "workflow": {
    "research": true,
    "research_panel": false,
    "plan_check": true,
    "plan_check_panel": false,
    "verifier": true,
    "verifier_panel": false,
    "auto_advance": false,
    "nyquist_validation": false
  }
}
```

**Why parallel booleans instead of a mode enum:** The existing pattern is per-feature booleans (`research: true/false`, `plan_check: true/false`). Adding `research_panel: true/false` follows the same convention. A user can disable research entirely (`research: false`) or enable it with a panel (`research: true, research_panel: true`). These are independent toggles -- `research_panel: true` with `research: false` is a no-op (the panel flag is only checked when the parent feature is enabled).

**Why NOT a global `panels: true` toggle:** Different panels have different cost/value tradeoffs. A user may want panel verification (catches more bugs) but not panel research (overkill for simple phases). Per-feature panel toggles give that control.

### Config Resolution in `init.cjs`

The `cmdInitPlanPhase` function already resolves `research_enabled`, `plan_checker_enabled`. Add panel resolution:

```javascript
// In cmdInitPlanPhase result object:
{
  // Existing
  research_enabled: config.research,
  plan_checker_enabled: config.plan_checker,
  researcher_model: resolveModelInternal(cwd, 'gsd-phase-researcher'),
  checker_model: resolveModelInternal(cwd, 'gsd-plan-checker'),

  // New panel flags
  research_panel: config.research_panel || false,
  plan_check_panel: config.plan_check_panel || false,

  // New panel models (only resolved when panel enabled)
  researcher_panel_model: config.research_panel
    ? resolveModelInternal(cwd, 'gsd-researcher-panel')
    : null,
  checker_panel_model: config.plan_check_panel
    ? resolveModelInternal(cwd, 'gsd-plan-checker-panel')
    : null,
}
```

Similarly for `cmdInitExecutePhase`:

```javascript
{
  verifier_model: resolveModelInternal(cwd, 'gsd-verifier'),
  verifier_panel: config.verifier_panel || false,
  verifier_panel_model: config.verifier_panel
    ? resolveModelInternal(cwd, 'gsd-verifier-panel')
    : null,
}
```

### Config Loading in `core.cjs` loadConfig

Add three new fields to the config loader:

```javascript
// In loadConfig return:
{
  // ...existing fields
  research_panel: get('research_panel', { section: 'workflow', field: 'research_panel' }) ?? false,
  plan_check_panel: get('plan_check_panel', { section: 'workflow', field: 'plan_check_panel' }) ?? false,
  verifier_panel: get('verifier_panel', { section: 'workflow', field: 'verifier_panel' }) ?? false,
}
```

### Settings UI Addition

Add three new questions to `settings.md` (one per panel toggle), positioned after their parent toggle:

```
{
  question: "Use MoE Panel for plan checking? (3 specialist agents instead of 1)",
  header: "Plan Check Panel",
  multiSelect: false,
  options: [
    { label: "No (Recommended)", description: "Single plan-checker agent" },
    { label: "Yes", description: "3 specialists: coverage analyst, scope auditor, dependency checker" }
  ]
}
```

## Integration Point 2: Model Profile Registration

### Current MODEL_PROFILES Table

```javascript
const MODEL_PROFILES = {
  'gsd-plan-checker':       { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-verifier':           { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-phase-researcher':   { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  // ...
};
```

### Add Panel Orchestrator Entries

Panel orchestrators do synthesis (moderate reasoning), not execution. They should use the same tier as the single agent they replace:

```javascript
const MODEL_PROFILES = {
  // ...existing entries
  'gsd-plan-checker-panel':  { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-verifier-panel':      { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-researcher-panel':    { quality: 'opus',   balanced: 'sonnet', budget: 'haiku' },
};
```

**Specialist subagent models:** Specialists spawned BY the panel use the SAME model as the panel orchestrator. The panel agent passes its own model to each Task() call. This avoids adding 9 more entries (3 specialists x 3 panels) to the profile table. The panel agent `.md` should document: "Pass your own model to specialist Task calls."

## Integration Point 3: Conditional Dispatch in Workflows

### Pattern: plan-phase.md Step 10 (Plan Checker)

Current (single agent):
```
Task(
  prompt=checker_prompt,
  subagent_type="gsd-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase} plans"
)
```

Recommended (conditional dispatch):
```
# After parsing INIT JSON:
# PLAN_CHECK_PANEL=$(echo "$INIT" | jq -r '.plan_check_panel')
# CHECKER_PANEL_MODEL=$(echo "$INIT" | jq -r '.checker_panel_model // empty')

if PLAN_CHECK_PANEL is true:
  Task(
    prompt="First, read ~/.claude/agents/gsd-plan-checker-panel.md for your role and instructions.\n\n" + checker_prompt,
    subagent_type="general-purpose",
    model="{checker_panel_model}",
    description="Panel verify Phase {phase} plans"
  )
else:
  Task(
    prompt=checker_prompt,
    subagent_type="gsd-plan-checker",
    model="{checker_model}",
    description="Verify Phase {phase} plans"
  )
```

**Critical detail:** Panel agents use `subagent_type="general-purpose"` (not a named type) because Claude Code only recognizes a fixed set of subagent types. Named types like `gsd-plan-checker` cause Claude Code to load the matching `agents/*.md` file. Panel agents load their own instructions via `@file` reference instead. This matches the existing pattern used by `auto-discuss.md` and `new-project.md` researcher spawns.

### Pattern: execute-phase.md verify_phase_goal Step

Same conditional dispatch pattern:
```
if VERIFIER_PANEL is true:
  Task(
    prompt="First, read ~/.claude/agents/gsd-verifier-panel.md for your role and instructions.\n\n" + verifier_prompt,
    subagent_type="general-purpose",
    model="{verifier_panel_model}",
    description="Panel verify phase {phase_number} goal"
  )
else:
  Task(
    prompt=verifier_prompt,
    subagent_type="gsd-verifier",
    model="{verifier_model}",
    description="Verify phase {phase_number} goal"
  )
```

### Pattern: plan-phase.md Step 5 (Researcher)

```
if RESEARCH_PANEL is true:
  Task(
    prompt="First, read ~/.claude/agents/gsd-researcher-panel.md for your role and instructions.\n\n" + research_prompt,
    subagent_type="general-purpose",
    model="{researcher_panel_model}",
    description="Panel research Phase {phase}"
  )
else:
  Task(
    prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n" + research_prompt,
    subagent_type="general-purpose",
    model="{researcher_model}",
    description="Research Phase {phase}"
  )
```

## Integration Point 4: Panel Agent File Structure

### Recommended: 3 New Agent Files

```
agents/
  gsd-plan-checker.md              # existing single agent
  gsd-plan-checker-panel.md        # NEW: panel orchestrator
  gsd-verifier.md                  # existing single agent
  gsd-verifier-panel.md            # NEW: panel orchestrator
  gsd-phase-researcher.md          # existing single agent
  gsd-researcher-panel.md          # NEW: panel orchestrator
```

### Why NOT Separate Specialist Agent Files

Specialists should be **inline prompts within the panel agent**, not separate `.md` files. Reasons:

1. **Context isolation:** Each specialist is spawned via Task() with a specific prompt. The panel agent constructs these prompts dynamically based on the input context (phase goal, plans, requirements). Separate files would be static and unable to adapt.

2. **Coupling:** Specialists only make sense in the context of their panel. A "coverage analyst" is useless outside the plan-checker-panel. Separate files suggest independent reuse that doesn't exist.

3. **Precedent:** `auto-discuss.md` already uses this pattern -- specialist prompts are constructed inline with role assignments, not loaded from separate files.

4. **Maintenance:** 3 panel files vs 3 panels + 9 specialist files. The inline approach keeps each panel self-contained.

### Panel Agent Anatomy (Template)

```markdown
---
name: gsd-plan-checker-panel
description: MoE panel that spawns 3 specialist agents to verify plans from different angles. Returns same output contract as gsd-plan-checker.
tools: Read, Bash, Glob, Grep
color: green
---

<role>
You are a GSD plan-checker panel. You orchestrate 3 specialist verification agents,
synthesize their findings, and return the same structured output as gsd-plan-checker.

The workflow that spawned you expects EXACTLY the same return format as a single
gsd-plan-checker agent. Your job is to produce BETTER results through parallel
specialist analysis, but the output contract is non-negotiable.
</role>

<output_contract>
Your return MUST be one of:
- ## VERIFICATION PASSED (same format as gsd-plan-checker)
- ## ISSUES FOUND (same format as gsd-plan-checker)

The orchestrator workflow parses these headers. Any other format breaks the pipeline.
</output_contract>

<specialists>
## Specialist 1: Coverage Analyst
Focus: Requirement coverage (Dimensions 1, 6, 7 from plan-checker)
Checks: Every requirement has tasks, must_haves trace to goal, context compliance

## Specialist 2: Scope & Structure Auditor
Focus: Task quality and scope (Dimensions 2, 5)
Checks: Task completeness (files/action/verify/done), scope sanity, context budget

## Specialist 3: Dependency & Wiring Inspector
Focus: Dependency correctness and key links (Dimensions 3, 4, 8)
Checks: Dependency graph, key links, Nyquist compliance
</specialists>

<process>
1. Load context (same as gsd-plan-checker Step 1-2)
2. Construct specialist prompts with shared context
3. Spawn all 3 specialists in parallel via Task()
4. Collect results from all 3
5. Synthesize: union of all issues (deduplicate by plan+task+dimension)
6. Determine overall status (any blocker -> ISSUES FOUND)
7. Return in gsd-plan-checker output format
</process>

<specialist_spawn_pattern>
Task(
  subagent_type="general-purpose",
  model="{same model as panel}",
  prompt="
    <role>You are a {specialist_name} for GSD plan verification.</role>
    <focus>{specialist_focus}</focus>
    <files_to_read>{same files from orchestrator prompt}</files_to_read>
    <output>Return a YAML issues list + coverage table for your dimensions.</output>
  ",
  description="{specialist_name}"
)
</specialist_spawn_pattern>

<synthesis>
1. Parse each specialist's issues list
2. Deduplicate by (plan, task, dimension) tuple
3. If any specialist found blockers -> overall = ISSUES FOUND
4. If no blockers but warnings -> overall = ISSUES FOUND (warnings should still be reviewed)
5. If no issues -> overall = VERIFICATION PASSED
6. Merge coverage tables from all specialists
7. Format into exact gsd-plan-checker return structure
</synthesis>
```

## Integration Point 5: Output Contract Preservation

This is the most critical architectural constraint. Panel agents MUST produce byte-compatible output with single agents.

### Plan Checker Contract

Single agent returns one of:
```markdown
## VERIFICATION PASSED
**Phase:** {phase-name}
**Plans verified:** {N}
**Status:** All checks passed
### Coverage Summary
| Requirement | Plans | Status |
### Plan Summary
| Plan | Tasks | Files | Wave | Status |
```

OR:

```markdown
## ISSUES FOUND
**Phase:** {phase-name}
**Plans checked:** {N}
**Issues:** {X} blocker(s), {Y} warning(s), {Z} info
### Blockers (must fix)
### Warnings (should fix)
### Structured Issues
(YAML issues list)
### Recommendation
```

The panel MUST return exactly these formats. The revision loop in plan-phase.md Steps 11-12 parses `## VERIFICATION PASSED` and `## ISSUES FOUND` headers to determine next action.

### Verifier Contract

Single agent returns:
```markdown
## Verification Complete
**Status:** {passed | gaps_found | human_needed}
**Score:** {N}/{M} must-haves verified
**Report:** .planning/phases/{phase_dir}/{phase_num}-VERIFICATION.md
```

The execute-phase.md `verify_phase_goal` step reads the VERIFICATION.md status field via grep. The panel must write the same file format.

### Researcher Contract

Single agent returns:
```markdown
## RESEARCH COMPLETE
**Phase:** {phase_number} - {phase_name}
**Confidence:** [HIGH/MEDIUM/LOW]
### Key Findings
### File Created
### Confidence Assessment
### Ready for Planning
```

OR:

```markdown
## RESEARCH BLOCKED
**Phase:** {phase_number} - {phase_name}
**Blocked by:** [what]
```

The plan-phase.md Step 5 handler checks for these headers.

### Contract Enforcement Strategy

Each panel agent `.md` file should include an `<output_contract>` section that:
1. Lists the exact headers the workflow expects
2. Shows the complete output format template
3. States: "Your synthesis MUST produce this exact format. Do not add extra sections or change headers."

## Integration Point 6: Panel-Specialist Relationship

### Hierarchy

```
Workflow Orchestrator (plan-phase.md / execute-phase.md)
  |
  v
Panel Agent (gsd-plan-checker-panel.md)  <-- has 200K context
  |
  +--> Specialist 1 (Task, general-purpose)  <-- has 200K context
  +--> Specialist 2 (Task, general-purpose)  <-- has 200K context
  +--> Specialist 3 (Task, general-purpose)  <-- has 200K context
  |
  v
Synthesis (panel agent combines results)
  |
  v
Return to Workflow Orchestrator
```

### Context Budget

Each specialist gets a fresh 200K context window. The panel orchestrator also has 200K. This means:
- Panel orchestrator: reads files, constructs prompts, synthesizes (~30-40% context usage)
- Each specialist: reads files, performs focused analysis, returns findings (~50-60% context usage)

**Total token cost:** 4x a single agent (1 panel + 3 specialists). This is the primary tradeoff.

### Specialist Prompt Construction

The panel agent receives the same `<verification_context>` or `<research_context>` block that the single agent would receive. It passes this context through to each specialist, adding the specialist's focus area:

```
specialist_prompt = f"""
<role>{specialist_role_description}</role>

<focus>
You are responsible for verification dimensions: {dimension_list}
Ignore other dimensions -- other specialists handle them.
</focus>

{original_context_from_workflow}

<output_format>
Return your findings as:

### Findings

#### Dimension {N}: {Name}
Status: PASS | FAIL
Issues:
```yaml
issues:
  - plan: "XX-YY"
    dimension: "{dimension_name}"
    severity: "blocker|warning|info"
    description: "..."
    fix_hint: "..."
```

If no issues for a dimension, state: "Dimension {N}: PASS - no issues found"
</output_format>
"""
```

### Synthesis Pattern

The panel agent collects all specialist returns and merges:

1. **Parse** each specialist's YAML issues list
2. **Union** all issues into a single list
3. **Deduplicate** by (plan, task, dimension) -- if two specialists flag the same issue, keep the higher severity
4. **Aggregate** coverage tables (each specialist reports on their dimensions)
5. **Determine** overall status: any blocker -> ISSUES FOUND, else VERIFICATION PASSED
6. **Format** into the exact single-agent output contract

This is analogous to `auto-discuss.md`'s `synthesize_consensus` step, but for verification findings instead of decisions.

## Patterns to Follow

### Pattern 1: Transparent Substitution (from auto-discuss.md)

**What:** auto-discuss.md produces CONTEXT.md in the exact same format as discuss-phase.md. Downstream agents (researcher, planner) consume it identically.

**Apply to panels:** Panel agents produce output in the exact same format as single agents. Workflow orchestrators consume it identically.

**Why this works:** The contract is at the output level, not the agent level. What happens inside the agent (1 agent or 3 specialists) is an implementation detail.

### Pattern 2: Parallel Task Spawning (from auto-discuss.md)

**What:** auto-discuss.md spawns N agents in parallel via multiple Task() calls in a single message.

```
For each agent (1 to AGENT_COUNT):
  Task(
    subagent_type="general-purpose",
    model="${DISCUSS_MODEL}",
    prompt="...",
    description="${ROLE_NAME} review"
  )
```

**Apply to panels:** Panel agents spawn 3 specialists in parallel the same way. All three use `subagent_type="general-purpose"` with inline role prompts.

### Pattern 3: Config Flag Gating (from existing workflow toggles)

**What:** `workflow.research: true/false` gates whether the researcher is spawned. The workflow checks `research_enabled` from INIT JSON.

**Apply to panels:** `workflow.plan_check_panel: true/false` gates whether the panel version is spawned. The workflow checks `plan_check_panel` from INIT JSON.

### Pattern 4: INIT JSON Pre-computation (from init.cjs)

**What:** All config resolution happens in `init.cjs` before the workflow starts. The workflow reads a single JSON blob with all flags and models pre-resolved.

**Apply to panels:** Panel flags and panel models are resolved in init.cjs and included in the INIT JSON. The workflow never reads config.json directly for panel decisions.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Panel Agents Altering Output Format
**What:** Adding extra sections, changing header levels, or renaming sections in the panel output.
**Why bad:** Workflow orchestrators parse specific headers (`## VERIFICATION PASSED`, `## ISSUES FOUND`). Any change breaks the revision loop.
**Instead:** Copy the exact output template from the single agent into the panel agent's `<output_contract>` section. Make the panel's synthesis step format its output using this template.

### Anti-Pattern 2: Separate Agent Files for Specialists
**What:** Creating `agents/gsd-coverage-analyst.md`, `agents/gsd-scope-auditor.md`, etc.
**Why bad:** Specialists are not independently useful. They fragment the panel logic across files. They can't be spawned via `subagent_type` (Claude Code doesn't know about them). They add maintenance burden without benefit.
**Instead:** Inline specialist prompts within the panel agent file, constructed dynamically.

### Anti-Pattern 3: Double-Reading Files
**What:** Panel agent reads all plan files, then each specialist also reads all plan files.
**Why bad:** Wastes context in the panel orchestrator. The panel only needs enough context to construct specialist prompts and synthesize results.
**Instead:** Panel agent reads file paths (not contents) from INIT JSON, passes paths to specialists via `<files_to_read>` blocks. Specialists read files themselves with their fresh 200K context. Panel agent only reads files for synthesis if needed.

### Anti-Pattern 4: Global Panel Toggle
**What:** `workflow.panels: true` enables all panels at once.
**Why bad:** Different panels have different cost/benefit profiles. Verification panels catch more bugs (high value). Research panels produce more thorough findings but may be overkill for simple phases (moderate value). Users should control each independently.
**Instead:** Per-feature panel toggles: `plan_check_panel`, `verifier_panel`, `researcher_panel`.

### Anti-Pattern 5: Panel Orchestrator Doing Analysis
**What:** Panel agent performs its own verification analysis in addition to spawning specialists.
**Why bad:** Duplicates work, wastes context, creates conflicts between panel and specialist findings.
**Instead:** Panel agent is ONLY an orchestrator. It constructs prompts, spawns agents, collects results, synthesizes output. All analytical work is done by specialists.

## Scalability Considerations

| Concern | 1 panel active | 2 panels active | All 3 panels active |
|---------|---------------|-----------------|---------------------|
| Token cost | 4x single agent | 8x single agent | 12x single agent |
| Wall-clock time | ~same (parallel) | ~same (sequential between panels) | ~same |
| Quality improvement | Focused analysis per dimension | Comprehensive coverage | Maximum thoroughness |
| Context pressure on parent workflow | Minimal (same return size) | Minimal | Minimal |

**Token cost is the primary constraint.** Each panel spawns 3 specialists, each with 200K context. For budget-conscious users, panels should default to `false`. For quality-focused users (quality model profile), panels provide significant value.

**Recommended defaults:**
- `research_panel: false` -- research is already thorough with a single agent
- `plan_check_panel: false` -- single checker catches most issues
- `verifier_panel: false` -- single verifier is sufficient for most phases

Panels are an opt-in quality boost, not a default.

## Implementation Sequence

The recommended build order for this feature:

1. **Config layer first** -- add panel flags to `config.cjs`, `core.cjs`, `init.cjs`
2. **Model profiles** -- add panel entries to MODEL_PROFILES table
3. **Settings UI** -- add panel toggle questions to `settings.md`
4. **Plan-checker panel** -- build first panel (plan-checker is the most well-defined contract)
5. **Conditional dispatch in plan-phase.md** -- wire the config flag to dispatch
6. **Verifier panel** -- second panel (similar structure)
7. **Conditional dispatch in execute-phase.md** -- wire verifier dispatch
8. **Researcher panel** -- third panel (different synthesis pattern)
9. **Conditional dispatch in plan-phase.md research step** -- wire researcher dispatch
10. **Integration testing** -- verify panel output matches single agent contracts

## Sources

All findings are from direct codebase analysis (HIGH confidence):

- `get-shit-done/templates/config.json` -- current config schema
- `get-shit-done/bin/lib/core.cjs` -- MODEL_PROFILES table, loadConfig, resolveModelInternal
- `get-shit-done/bin/lib/config.cjs` -- config CRUD operations
- `get-shit-done/bin/lib/init.cjs` -- INIT JSON pre-computation for all workflow types
- `get-shit-done/workflows/plan-phase.md` -- plan checker and researcher dispatch points
- `get-shit-done/workflows/execute-phase.md` -- verifier dispatch point
- `get-shit-done/workflows/auto-discuss.md` -- existing parallel agent spawn + synthesis pattern
- `get-shit-done/workflows/settings.md` -- settings UI pattern for config toggles
- `agents/gsd-plan-checker.md` -- plan checker output contract (VERIFICATION PASSED / ISSUES FOUND)
- `agents/gsd-verifier.md` -- verifier output contract (Verification Complete + VERIFICATION.md)
- `agents/gsd-phase-researcher.md` -- researcher output contract (RESEARCH COMPLETE / RESEARCH BLOCKED)
- `get-shit-done/references/model-profiles.md` -- model profile philosophy and table structure
