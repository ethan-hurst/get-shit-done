# Architecture Research: PR #762 Fix Integration

**Domain:** CLI workflow engine — autopilot mode runtime state, config validation, model resolution
**Researched:** 2026-02-28
**Confidence:** HIGH (direct codebase analysis of all affected files)

## Context

This research addresses three specific fixes from PR #762 reviewer feedback:

1. **Auto-advance config mutation** — `autopilot.md` currently persists `workflow.auto_advance true` to `config.json`. Reviewer wants this to be a runtime flag, not persistent config.
2. **discuss_agents runtime validation** — `auto-discuss.md` reads `autopilot.discuss_agents` without validating the value before spawning N agents. If the value is invalid, the workflow silently uses a bad agent count.
3. **model_overrides undocumented** — `resolveModelInternal` in `core.cjs` checks `config.model_overrides` but `cmdResolveModel` in `commands.cjs` does not. The feature is partially implemented and undocumented.

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  User Commands (/gsd:autopilot, /gsd:plan-phase, etc.)          │
├─────────────────────────────────────────────────────────────────┤
│  Workflow Files (get-shit-done/workflows/*.md)                   │
│  Orchestrators: autopilot.md, plan-phase.md, auto-discuss.md    │
│  Read config via: config-get, config-set, init commands         │
├─────────────────────────────────────────────────────────────────┤
│  Node CLI Toolkit (get-shit-done/bin/lib/*.cjs)                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  │
│  │  core.cjs  │  │ config.cjs │  │  init.cjs  │  │commands  │  │
│  │ loadConfig │  │config-set  │  │ init cmds  │  │  .cjs    │  │
│  │ resolveModel│  │config-get  │  │ (INIT JSON)│  │resolve-  │  │
│  │ Internal   │  │            │  │            │  │ model    │  │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  State Layer (.planning/)                                        │
│  config.json — persistent settings                               │
│  ROADMAP.md, STATE.md — planning documents                       │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Key Functions |
|-----------|----------------|---------------|
| `core.cjs` | Config loading, model resolution, shared utilities | `loadConfig()`, `resolveModelInternal()` |
| `config.cjs` | Config CRUD (read/write/validate) | `cmdConfigSet()`, `cmdConfigGet()`, `cmdConfigEnsureSection()` |
| `commands.cjs` | Standalone utility commands | `cmdResolveModel()` (the broken one), `cmdCommit()`, etc. |
| `init.cjs` | Pre-computed INIT JSON for each workflow type | `cmdInitPlanPhase()`, `cmdInitExecutePhase()`, `cmdInitProgress()` |
| `auto-discuss.md` | Synthetic phase context via N-agent debate | Reads `autopilot.discuss_agents`, spawns agent panel |
| `autopilot.md` | Full pipeline orchestration across phases | Sets/clears `workflow.auto_advance` in config |
| `plan-phase.md` / `execute-phase.md` | Per-phase orchestration | Read `workflow.auto_advance` via `config-get` |

---

## Fix 1: Auto-Advance Runtime Flag

### Current Behavior (the problem)

`autopilot.md` step `ensure_auto_advance` runs:

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.auto_advance true
```

This persists the flag to `.planning/config.json`. Two consequences:

1. If autopilot crashes or is interrupted, `workflow.auto_advance` stays `true` in config.json permanently. The next manual `plan-phase` or `execute-phase` invocation auto-advances without the user asking for it.
2. The `config-set` writes config.json, which gets committed to git (if `commit_docs: true`). The flag then appears in git history as a persistent config change, not an ephemeral session flag.

`plan-phase.md` and `execute-phase.md` check auto-advance at runtime via:

```bash
AUTO_CFG=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
```

`discuss-phase.md` also checks and conditionally sets it:

```bash
# If --auto flag present AND AUTO_CFG is not true: persist to config
node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-set workflow.auto_advance true
```

### Where Auto-Advance is Currently Read

These four workflows check `workflow.auto_advance`:

- `plan-phase.md` — Step 14: spawns execute-phase if true
- `execute-phase.md` — checkpoint handler: skips pause if true; Step (transition): chains verify if true
- `discuss-phase.md` — final step: chains plan-phase if true
- `transition.md` — milestone boundary: clears it

All four use the same `config-get workflow.auto_advance` pattern.

### Option A: Environment Variable (RECOMMENDED)

**Mechanism:** Pass `GSD_AUTO_ADVANCE=true` in the orchestrator context. Each subprocess inherits it.

**How autopilot.md would set it:**
```bash
# In the bash environment of the autopilot orchestrator session
export GSD_AUTO_ADVANCE=true
```

**How plan-phase.md / execute-phase.md would read it:**
```bash
AUTO_CFG="${GSD_AUTO_ADVANCE:-false}"
```

**Pros:**
- Zero filesystem writes — no config.json mutation
- Automatic cleanup — env var dies when the terminal session ends
- No git pollution — nothing to commit
- No reset step needed at milestone boundary

**Cons:**
- Environment variable must be exported by the orchestrator, not just set locally
- If Claude Code subagents don't inherit the parent environment (they typically do via `execSync`), this breaks
- Requires changing the check pattern in plan-phase.md, execute-phase.md, and discuss-phase.md

**Confidence:** MEDIUM — Claude Code's Task() subagents do inherit environment variables from the parent process, but this behavior should be verified before relying on it.

### Option B: Temp File / Session File

**Mechanism:** Write a session marker file, e.g., `.planning/.autopilot-session`. Workflows check for file existence instead of a config key.

**How autopilot.md would set it:**
```bash
touch .planning/.autopilot-session
```

**How plan-phase.md / execute-phase.md would check it:**
```bash
AUTO_CFG=$([[ -f .planning/.autopilot-session ]] && echo "true" || echo "false")
```

Or via gsd-tools:
```bash
AUTO_CFG=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs verify-path-exists .planning/.autopilot-session --raw)
```

**How autopilot.md clears it at milestone boundary:**
```bash
rm -f .planning/.autopilot-session
```

**Pros:**
- Survives context compaction (unlike env var) — if a subagent loses environment, the file persists
- Easy to check, create, delete — no JSON parsing
- No config.json mutation
- Gitignored naturally if `.planning/` is gitignored, or add `/.planning/.autopilot-session` to `.gitignore`

**Cons:**
- File must be cleaned up on crash/interrupt — if autopilot crashes, the marker file persists until manually deleted
- Requires a new `verify-path-exists` call or shell `[[ -f ]]` check in each workflow
- Slightly less obvious than a config flag

**Confidence:** HIGH — straightforward file-based flag, no new dependencies, consistent with how GSD uses the filesystem for state.

### Option C: `--auto` Flag Passed Explicitly (No Persistence)

**Mechanism:** autopilot.md passes `--auto` to every phase chain invocation. No config.json mutation. No env var. No file.

**How autopilot.md would pass it:**
```
Task(
  prompt="... ARGUMENTS='${PHASE} --auto' ..."
)
```

**Plan-phase.md already checks `--auto`** in its auto-advance step (Step 14). It then passes `--auto` to execute-phase via ARGUMENTS. The entire chain already supports `--auto` flag propagation.

**Pros:**
- No state at all — flag lives only in the Task() prompt
- No cleanup required — the flag dies with the subagent
- No config mutation
- Consistent with existing `--auto` flag support throughout the chain

**Cons:**
- autopilot.md already passes `ARGUMENTS='${PHASE} --auto'` in `run_phase_chain` — but intermediate workflows (discuss-phase) may not propagate it further
- Harder to trace "why is auto-advance happening" when debugging — no visible state

**Confidence:** HIGH — this is the cleanest approach architecturally, and the existing `--auto` flag infrastructure already exists throughout the chain.

### Recommendation: Option C (Pass --auto Flag)

The autopilot.md already passes `--auto` via `ARGUMENTS='${PHASE} --auto'` in the `run_phase_chain` step. The fix is:

1. Remove the `config-set workflow.auto_advance true` from `autopilot.md` step `ensure_auto_advance`
2. Remove the `config-set workflow.auto_advance false` from `autopilot.md` step `milestone_complete`
3. Remove the `config-set workflow.auto_advance true` persistence from `discuss-phase.md` (direct `--auto` flag usage doesn't need to write config)
4. Keep the `--auto` flag check in plan-phase.md, execute-phase.md, discuss-phase.md as-is
5. Keep `workflow.auto_advance` in config.json as a **user-settable persistent preference** (not autopilot-managed) — this allows users who always want auto-advance to set it once

**Where to look for edge cases:**
- `new-project.md` also sets `workflow.auto_advance true` — check if this is intentional (user chose autopilot in project wizard) or should also be removed
- `transition.md` clears `workflow.auto_advance false` — this can stay (clears user's persistent preference at milestone boundary, which is appropriate) or be removed if the flag becomes fully flag-based

**Files affected (Option C):**

| File | Change | Type |
|------|--------|-------|
| `get-shit-done/workflows/autopilot.md` | Remove two `config-set workflow.auto_advance` calls | Modify (workflow) |
| `get-shit-done/workflows/discuss-phase.md` | Remove conditional `config-set workflow.auto_advance true` persistence | Modify (workflow) |
| `get-shit-done/workflows/new-project.md` | Evaluate and possibly remove `config-set workflow.auto_advance true` | Modify (workflow) |

No JavaScript module changes needed for Option C.

---

## Fix 2: discuss_agents Runtime Validation

### Current Behavior (the problem)

`auto-discuss.md` reads `autopilot.discuss_agents` with a fallback:

```bash
AGENT_COUNT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get autopilot.discuss_agents 2>/dev/null || echo "5")
```

The `|| echo "5"` fallback handles the case where the key is missing. But it does NOT validate:
- Whether the value is a valid odd number (3, 5, 7, 9)
- Whether the value is within the allowed range
- Whether `config.autopilot` section exists but has an invalid type for `discuss_agents`

`cmdConfigSet` in `config.cjs` validates at write time (odd, 3-9). But if someone manually edits `config.json` or if a future code path sets an invalid value, `auto-discuss.md` gets a bad AGENT_COUNT and spawns the wrong number of agents.

### Where Validation Should Live

**Option A: In auto-discuss.md (workflow-side validation)**

After reading AGENT_COUNT, add a shell check:

```bash
# Validate AGENT_COUNT is one of: 3, 5, 7, 9
case "$AGENT_COUNT" in
  3|5|7|9) ;;  # valid
  *) echo "Error: discuss_agents must be 3, 5, 7, or 9. Got: $AGENT_COUNT. Fix in .planning/config.json"; exit 1;;
esac
```

**Pros:** Catches bad values at execution time before spawning agents. No module changes. Fast fix.
**Cons:** Validation logic is in a markdown workflow file, not testable.

**Option B: Add a dedicated `cmdConfigValidateAutopilot` to config.cjs**

Create a new gsd-tools command `config validate autopilot` that reads and validates the autopilot config section, returning errors or the validated values.

**Pros:** Testable via Node.js tests. Centralized. Could be called by multiple workflows.
**Cons:** More code, new command in gsd-tools.cjs router, more test surface.

**Option C: Make `config-get` return a structured validation response**

Modify `cmdConfigGet` to accept a `--validate` flag that checks the value against known constraints.

**Pros:** Reusable validation pattern.
**Cons:** Changes existing API of `config-get` which is widely used.

### Recommendation: Option A for this PR fix

The reviewer feedback is about a specific validation gap, not a request to redesign config validation. Add an inline shell validation check in `auto-discuss.md` after the config-get. This is:
- A minimal fix that directly addresses the reported issue
- No module changes = no test changes = smaller PR scope
- Consistent with how other workflows handle bad config values (they error out with a message)

**Additional fix needed:** Validate that `AGENT_COUNT` is actually a number, not a string. The `config-get --raw` returns the raw value, which could be `"null"` or `"undefined"` if the key is missing and the command fails.

**Files affected:**

| File | Change | Type |
|------|--------|-------|
| `get-shit-done/workflows/auto-discuss.md` | Add AGENT_COUNT validation after config-get | Modify (workflow) |

No JavaScript module changes needed.

---

## Fix 3: model_overrides Documentation / Alignment

### The Divergence

Two functions in the codebase handle model resolution, and they behave differently:

**`resolveModelInternal` in `core.cjs` (lines 344-359):**
```javascript
function resolveModelInternal(cwd, agentType) {
  const config = loadConfig(cwd);

  // Check per-agent override FIRST
  const override = config.model_overrides?.[agentType];
  if (override) {
    return override === 'opus' ? 'inherit' : override;
  }

  // Fall back to profile lookup
  const profile = config.model_profile || 'balanced';
  const agentModels = MODEL_PROFILES[agentType];
  ...
}
```

**`cmdResolveModel` in `commands.cjs` (lines 200-219):**
```javascript
function cmdResolveModel(cwd, agentType, raw) {
  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';

  // NO model_overrides check — goes straight to profile
  const agentModels = MODEL_PROFILES[agentType];
  ...
}
```

`resolveModelInternal` is called by `init.cjs` (in `cmdInitPlanPhase`, `cmdInitExecutePhase`, etc.) to populate INIT JSON with per-agent models. `cmdResolveModel` is the CLI-facing `resolve-model` command that workflows call directly.

### Impact

Workflows that call `resolve-model` CLI directly (bypassing init.cjs) will NOT honor `model_overrides`. Workflows that use INIT JSON (the majority) WILL honor them because init.cjs uses `resolveModelInternal`.

The `model_overrides` feature is documented in `get-shit-done/references/model-profiles.md` and exists in the config template. But `loadConfig` in `core.cjs` does NOT include `model_overrides` in its return object — the `resolveModelInternal` function reads `config.model_overrides?.[agentType]` directly from the parsed JSON before loadConfig normalizes it.

### The Real Problem

`loadConfig` returns a normalized object with known keys. `model_overrides` is NOT one of those keys:

```javascript
// loadConfig return object (lines 95-107) — model_overrides missing!
return {
  model_profile: ...,
  commit_docs: ...,
  // ...
  brave_search: ...,
  // NO model_overrides here
};
```

But `resolveModelInternal` calls `loadConfig` then accesses `config.model_overrides`. Since `loadConfig` drops unknown keys, `config.model_overrides` is always `undefined`. The override check silently no-ops for everyone.

This is a bug: `model_overrides` is documented but never actually applied.

### Fix Options

**Option A: Add `model_overrides` to `loadConfig` return**

```javascript
// In core.cjs loadConfig:
return {
  // ...existing fields
  model_overrides: get('model_overrides') ?? {},
};
```

This makes the feature work as documented. `resolveModelInternal` and `cmdResolveModel` both need to check `config.model_overrides` (cmdResolveModel still needs to be updated too).

**Option B: Remove `model_overrides` from documentation and `resolveModelInternal`**

If the feature is premature, remove the dead code path and the documentation. Simplifies the codebase.

**Option C: Document it as "experimental / not yet wired"**

Add a note to `model-profiles.md` that `model_overrides` is not yet active. Defer the fix.

### Recommendation: Option A (Fix the wiring)

The feature is already documented in user-facing references (`model-profiles.md`), implemented in `resolveModelInternal`, and mentioned in the config schema. The only gap is that `loadConfig` drops it and `cmdResolveModel` ignores it. These are one-line fixes:

**Change 1: `core.cjs` loadConfig return**
```javascript
model_overrides: parsed.model_overrides ?? {},
```

**Change 2: `commands.cjs` cmdResolveModel**
```javascript
function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }
  // Delegate to resolveModelInternal to ensure model_overrides are honored
  const model = resolveModelInternal(cwd, agentType);
  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';
  const unknownAgent = !MODEL_PROFILES[agentType];
  const result = { model, profile, ...(unknownAgent ? { unknown_agent: true } : {}) };
  output(result, raw, model);
}
```

This makes `cmdResolveModel` use `resolveModelInternal`, eliminating the divergence.

**Files affected:**

| File | Change | Type |
|------|--------|-------|
| `get-shit-done/bin/lib/core.cjs` | Add `model_overrides` to `loadConfig` return | Modify (module, needs tests) |
| `get-shit-done/bin/lib/commands.cjs` | Refactor `cmdResolveModel` to delegate to `resolveModelInternal` | Modify (module, needs tests) |
| `tests/commands.test.cjs` | Add tests for `model_overrides` honored by `resolve-model` CLI | Modify (test) |
| `tests/core.test.cjs` or `tests/commands.test.cjs` | Add tests for `loadConfig` returning `model_overrides` | Modify (test) |

---

## PR Split Architecture

### Separation Logic

The reviewer requested splitting PR #762. The three fixes have distinct dependencies:

**Fix 1 (auto-advance):** Workflow-only changes. No module code. No test changes. Pure markdown edits.

**Fix 2 (discuss_agents):** Workflow-only change. No module code. No test changes. Pure markdown edits.

**Fix 3 (model_overrides):** Module code changes + test changes. Touches `core.cjs` and `commands.cjs`, which already have test files.

Additionally, the original PR #762 includes:
- Tests and CI changes (from v1.1 work)
- `.planning/` artifacts that should be removed from the PR branch
- The resolve-model fix that overlaps with PR #761 (closed)

### Recommended PR Split

**PR A: Workflow Fixes (autopilot, auto-discuss)**

Files:
```
get-shit-done/workflows/autopilot.md       # Remove config-set auto_advance calls
get-shit-done/workflows/discuss-phase.md   # Remove conditional config-set persistence
get-shit-done/workflows/auto-discuss.md    # Add AGENT_COUNT validation
```

No module changes. No test changes. No risk to CI. Can be reviewed in isolation.

**PR B: resolve-model / model_overrides Fix**

Files:
```
get-shit-done/bin/lib/core.cjs             # Add model_overrides to loadConfig
get-shit-done/bin/lib/commands.cjs         # Refactor cmdResolveModel
tests/commands.test.cjs                    # New tests for model_overrides
```

This is the module fix. Needs to be coordinated with any remaining resolve-model changes from PR #761 context.

**PR C: Tests + CI (from original PR #762)**

This was the bulk of the original PR: test files and CI configuration. Should be reviewed independently of the autopilot feature code. Remove the `.planning/` artifact files before submitting.

### Build Order

```
PR C (tests/CI)  ─────────────────────────────────────> merge (no conflicts)
PR A (workflows) ────────────────────────────────────── merge (no conflicts with C)
PR B (modules)   ─── depends on: no conflicts with A/C ─> merge last
```

PR A and PR C have no file overlap and can be submitted and merged in any order. PR B touches `core.cjs` and `commands.cjs` — verify no conflicts with PR #761 changes (PR #761 closed but the fix may have landed or been incorporated).

---

## Recommended Project Structure (Unchanged)

The existing structure handles these fixes without new directories:

```
get-shit-done/
├── bin/lib/
│   ├── core.cjs         # model_overrides fix (loadConfig + resolveModelInternal)
│   └── commands.cjs     # cmdResolveModel refactor
├── workflows/
│   ├── autopilot.md     # remove config-set calls
│   ├── discuss-phase.md # remove conditional config-set
│   └── auto-discuss.md  # add AGENT_COUNT validation
└── tests/
    └── commands.test.cjs # new model_overrides tests
```

No new files needed. All three fixes are modifications to existing files.

---

## Data Flow

### Auto-Advance (After Fix)

```
User: /gsd:autopilot 3-7
    |
    v
autopilot.md (orchestrator)
    |
    ├── No config-set (flag not persisted)
    |
    +--> Task(plan-phase.md, ARGUMENTS='3 --auto')
             |
             v
         plan-phase.md reads --auto from ARGUMENTS
         AUTO = true (flag only, no config read)
             |
             v
         Execute → Verify → Transition
         (each step receives --auto via ARGUMENTS propagation)
```

### Model Resolution (After Fix)

```
Workflow or agent calls: resolve-model gsd-executor
    |
    v
cmdResolveModel → resolveModelInternal(cwd, 'gsd-executor')
    |
    v
loadConfig(cwd) → returns { model_profile, model_overrides, ... }
    |
    ├── check config.model_overrides['gsd-executor']
    │     |
    │     ├── found: return override value (sonnet/haiku/inherit)
    │     └── not found: fall through to profile lookup
    |
    v
MODEL_PROFILES['gsd-executor'][profile]
    |
    v
return model string
```

### discuss_agents Validation (After Fix)

```
auto-discuss.md initialize step:
    |
    v
AGENT_COUNT=$(config-get autopilot.discuss_agents 2>/dev/null || echo "5")
    |
    v
[Validate: AGENT_COUNT must be 3, 5, 7, or 9]
    |
    ├── invalid: error, stop workflow, tell user to fix config.json
    └── valid: continue to spawn_debate step
```

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `autopilot.md` → `plan-phase.md` | `--auto` flag in ARGUMENTS | After fix: no config.json writes |
| `plan-phase.md` → `execute-phase.md` | `--auto` flag propagated via ARGUMENTS | Already works |
| `auto-discuss.md` → config | `config-get autopilot.discuss_agents` | Needs validation guard after read |
| `cmdResolveModel` → `resolveModelInternal` | Direct call (after fix) | Eliminates divergence |
| `loadConfig` → callers | Returns normalized config object | `model_overrides` added to return |
| `init.cjs` INIT JSON → workflows | Pre-computed flags + models | Already uses `resolveModelInternal`, benefits from fix automatically |

### External Services

None. All three fixes are internal — filesystem, config, and in-process function calls only.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using config.json as Session State

**What:** Writing `workflow.auto_advance true` to config.json during autopilot execution.
**Why bad:** Config.json is user-visible persistent settings. Session flags in config.json persist across invocations, survive crashes, and get committed to git history.
**Instead:** Use the `--auto` flag mechanism that already exists throughout the chain.

### Anti-Pattern 2: Duplicating Resolution Logic

**What:** Having `cmdResolveModel` reimplement resolution logic that `resolveModelInternal` already handles.
**Why bad:** Two code paths can diverge. `model_overrides` is an example of this happening — resolveModelInternal checks it, cmdResolveModel doesn't.
**Instead:** `cmdResolveModel` should delegate to `resolveModelInternal` rather than reimplementing the logic.

### Anti-Pattern 3: Deferred Validation (Read-Time vs Write-Time Only)

**What:** Validating `discuss_agents` only at write time (`cmdConfigSet`) but not at read time in the workflow.
**Why bad:** Users can edit config.json directly. Values can arrive invalid. The workflow silently uses a bad value.
**Instead:** Validate at the point of use. The workflow that reads `discuss_agents` should check the value is valid before acting on it.

### Anti-Pattern 4: Silent Fallback Masking Config Errors

**What:** `AGENT_COUNT=$(config-get ... 2>/dev/null || echo "5")` — the `2>/dev/null` and `|| echo "5"` hide errors.
**Why bad:** If `config-get` fails for a legitimate reason (corrupt config, wrong key type), the workflow silently proceeds with the fallback value. The user has no idea their config is broken.
**Instead:** Keep the fallback for the "key not set" case, but add explicit validation of the returned value.

---

## Sources

All findings from direct codebase analysis (HIGH confidence):

- `/Users/annon/projects/get-shit-done/get-shit-done/bin/lib/core.cjs` — `loadConfig`, `resolveModelInternal` (lines 60-111, 344-359)
- `/Users/annon/projects/get-shit-done/get-shit-done/bin/lib/commands.cjs` — `cmdResolveModel` (lines 200-219)
- `/Users/annon/projects/get-shit-done/get-shit-done/bin/lib/config.cjs` — `cmdConfigSet` validation (lines 105-110)
- `/Users/annon/projects/get-shit-done/get-shit-done/bin/lib/init.cjs` — `discuss_agents` in INIT JSON (line 666)
- `/Users/annon/projects/get-shit-done/get-shit-done/workflows/autopilot.md` — config-set calls (lines 51, 233)
- `/Users/annon/projects/get-shit-done/get-shit-done/workflows/auto-discuss.md` — AGENT_COUNT read (lines 30-32)
- `/Users/annon/projects/get-shit-done/get-shit-done/workflows/plan-phase.md` — auto_advance check (lines 444-446)
- `/Users/annon/projects/get-shit-done/get-shit-done/workflows/execute-phase.md` — auto_advance check (lines 184, 408-410)
- `/Users/annon/projects/get-shit-done/get-shit-done/workflows/discuss-phase.md` — auto_advance set/check (lines 444-451)
- `/Users/annon/projects/get-shit-done/get-shit-done/references/model-profiles.md` — model_overrides documentation
- `/Users/annon/projects/get-shit-done/.planning/codebase/ARCHITECTURE.md` — system layer analysis

---

*Architecture research for: PR #762 fix integration*
*Researched: 2026-02-28*
