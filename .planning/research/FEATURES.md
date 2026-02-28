# Feature Research: PR Review Fixes

**Domain:** OSS contributor workflow — addressing reviewer feedback on autopilot mode PR
**Researched:** 2026-02-28
**Confidence:** HIGH

## Context

This research addresses four discrete fix areas from reviewer feedback on PR #762 (autopilot mode). The PR was flagged for scope creep (5 distinct efforts bundled together), a config mutation bug, missing validation, and undocumented config. Research below maps each fix area to table stakes vs differentiators, with complexity and dependency notes.

---

## Fix Area 1: Runtime Flags vs Config File Mutation

### The Problem

`autopilot.md` calls `config-set workflow.auto_advance true` to enable auto-advance for the duration of the autopilot run. This mutates `.planning/config.json` persistently. If autopilot is interrupted (crash, kill, user cancel), the `milestone_complete` cleanup step never fires, and `auto_advance` stays `true` in the user's config file permanently. The reviewer correctly identified this as a correctness bug.

### Table Stakes (Must Fix)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Auto-advance enabled only for autopilot session | Users expect that running `/gsd:autopilot` does not permanently change their config | LOW | Industry standard: CLI flags are session-scoped; config files are persistent preferences. npm, git, cargo, kubectl all follow this pattern. |
| Cleanup idempotency | If autopilot stops for any reason (gap found, checkpoint, crash), config must not be left in a mutated state | LOW | Session flag eliminates the cleanup problem entirely — no cleanup needed if nothing was mutated |
| No regression for manual `auto_advance` config | Users who have `workflow.auto_advance: true` in their config file manually must see no behavior change | LOW | Session flag is additive — it passes `--auto` argument or reads an in-memory flag, not touching disk config |

### Differentiators (Nice to Have)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `--no-auto` flag to disable auto-advance per-invocation | Allows users with persistent `auto_advance: true` to run a single manual phase | LOW | Inverse of the runtime flag pattern |
| Explicit autopilot mode banner showing active runtime overrides | User sees what config overrides are active for this run | LOW | Transparency over magic |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Writing session state to config.json | Leaks ephemeral state into persistent user preferences; impossible to clean up on crash | Pass `--auto` as argument to the plan-phase subagent Task call instead of persisting to config |
| Using a `.lock` file as session marker | Adds complexity and still leaves cleanup problem | Argument-based activation has no cleanup problem |

### Implementation Pattern

The standard pattern across CLI tooling (npm, git, curl): command-line arguments override config values for that invocation only. Config files store user preferences; flags store session intent.

For GSD: remove the `config-set workflow.auto_advance true` step from `autopilot.md`. Instead, the `run_phase_chain` step passes `ARGUMENTS='${PHASE} --auto'` to plan-phase. The plan-phase workflow already has an `auto_advance` check that reads config — extend it to also check for `--auto` in arguments. No config mutation, no cleanup needed.

**Dependency:** Requires reading `--auto` flag in `plan-phase.md`'s auto_advance logic. Low touch — plan-phase already has this branching.

---

## Fix Area 2: Input Validation for Config Values at Runtime

### The Problem

Two validation gaps identified in PR review:

1. `config.cjs:cmdConfigSet` validates `discuss_agents` and `discuss_model` only when invoked via the `config-set` CLI command. Direct edits to `config.json` bypass this entirely.
2. `auto-discuss.md` reads `AGENT_COUNT` from config and uses it directly in agent spawning logic without validating the value it received.

### Table Stakes (Must Fix)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Runtime validation of `discuss_agents` in auto-discuss | The workflow must not spawn 0, 2, 4, 6, 8, or 10+ agents just because config.json has a bad value | LOW | Standard defensive pattern: validate at consumption point, not only at write point |
| Fallback to default on invalid config value | Invalid `discuss_agents` (non-odd, out-of-range) should fall back to 5, not crash or spawn wrong count | LOW | Same pattern as the existing `AGENT_COUNT=$(... 2>/dev/null \|\| echo "5")` fallback already in auto-discuss.md — extend it |
| Validation message when falling back | User or caller knows a fallback occurred, not silently swallowing bad config | LOW | Print a warning to stderr: "discuss_agents=4 is invalid (must be odd 3-9), using 5" |

### Differentiators (Nice to Have)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `config-validate` CLI command | Validates all config values against schema on demand | MEDIUM | Useful but separable — not needed for this PR fix |
| JSON schema for `config.json` with validation on load | Catch all invalid values at config load time | MEDIUM | Adds robustness but is a larger change touching `loadConfig()` in core.cjs |
| Startup validation warning for unknown config keys | Warns user that `model_overrides` or other undocumented keys are present | LOW | Complements documentation fix (Fix Area 3) |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Validating only at `config-set` write time | Direct JSON edits bypass CLI; any agent reading config cannot trust values it receives | Validate at consumption point in the workflow |
| Crashing on invalid config | Breaks autopilot entirely for a recoverable problem | Fall back to documented default with a warning |

### Implementation Pattern

The OWASP Input Validation Cheat Sheet (2025) recommends allowlist validation: define exactly what is allowed, reject everything else. For `discuss_agents`:

```bash
# In auto-discuss.md initialize step
AGENT_COUNT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get autopilot.discuss_agents 2>/dev/null || echo "5")
# Validate: must be odd number 3-9
case "$AGENT_COUNT" in
  3|5|7|9) ;; # valid
  *) echo "Warning: discuss_agents=$AGENT_COUNT invalid (must be 3/5/7/9). Using 5." >&2; AGENT_COUNT=5 ;;
esac
```

**Dependency:** Self-contained change to `auto-discuss.md`. No changes to `config.cjs` required for this fix. The existing validation in `cmdConfigSet` is a separate concern (prevents bad values from being written via CLI) and is fine as-is for this milestone.

---

## Fix Area 3: Config Documentation Best Practices

### The Problem

Two documentation gaps:

1. `model_overrides` was added to `loadConfig()` in `core.cjs` with no validation, no documentation, and no tests. Reviewer flagged it as undocumented arbitrary JSON passthrough.
2. The `autopilot` config section (`discuss_agents`, `discuss_model`) is added to defaults in `config.cjs` but not documented anywhere users can discover it.

### Table Stakes (Must Fix)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Every config key documented in one place | OSS users expect a single authoritative source for all config options | LOW | Industry convention: `README.md` config section, or `docs/config.md` — one file, all keys, types, defaults, description |
| `model_overrides` documented or removed from this PR | If it has no tests and no documentation, it should not be in the PR | LOW | Remove from `loadConfig()` if premature; if intentional, add docs + at least one test for it |
| New `autopilot.*` keys listed with types, defaults, valid values | Users configuring autopilot need to know the valid range for `discuss_agents` | LOW | Short addition to existing config docs section in README |

### Differentiators (Nice to Have)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Inline comments in the generated `config.json` defaults | Users see documentation when they open their config file | LOW | JSON doesn't support comments natively, but the `cmdConfigEnsureSection` output could include a header comment block as a separate file or README |
| `config-docs` CLI command | Prints all config options with descriptions | MEDIUM | Nice for discoverability, separable from PR fix |
| CHANGELOG.md entry for new config keys | Maintains project-level history of config schema evolution | LOW | Keep A Changelog pattern: add to `[Unreleased]` section under `### Added` |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Documenting config in PR description only | PR descriptions are not part of the codebase; users won't find them | Put docs in README or a dedicated config reference file |
| Adding config options without tests | Untestable config options become technical debt | Pair each new config key with at least one test in `config.test.cjs` |

### Documentation Pattern (OSS Standard)

The Keep a Changelog specification and GitHub's own OSS project guidance both establish: every new configuration option added in a release should appear in (a) the changelog under `Added`, (b) the README config reference, and (c) if it has validation rules, those rules are tested.

For `model_overrides` specifically: the OSS principle is "don't ship what you can't support." If it has no validation, no tests, and no documentation, it should be either removed from this PR or explicitly scoped to a follow-up PR with a `TODO:` comment and a failing test marking it as incomplete.

**Dependency:** Purely additive changes to README.md and optionally CHANGELOG.md. No source code changes required for basic documentation fix. For `model_overrides`: either a one-line revert in `core.cjs` or a test addition in the test suite.

---

## Fix Area 4: PR Splitting Strategies

### The Problem

PR #762 bundles 5 distinct efforts into one 8,179-line addition PR:
1. Test suite overhaul (~6,370 lines across 13 files)
2. CI pipeline (~50 lines)
3. Autopilot feature (~620 lines: `autopilot.md`, `auto-discuss.md`, config changes)
4. Resolve-model fix (overlaps with PR #761)
5. `model_overrides` config loading (undocumented, untested)

### Table Stakes (Must Fix)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Test suite + CI as standalone PR | Tests and CI can be reviewed and merged independently; reviewer can verify tests pass without the autopilot feature | LOW | No dependencies on autopilot code — pure test infrastructure |
| Resolve-model fix coordinated with PR #761 | Two PRs fixing the same function will conflict on merge | LOW | One approach: rebase #762's resolve-model change on top of #761 after #761 lands, then drop it from this PR |
| Autopilot feature as focused PR | The actual new feature with only its direct dependencies | LOW | Once tests+CI and resolve-model are extracted, the autopilot PR becomes ~670 lines |
| `.planning/` artifacts removed from branch | Development artifacts (STATE.md, PLAN.md, SUMMARY.md referencing contributor filesystem paths) do not belong in the repo | LOW | `git rm .planning/STATE.md .planning/quick/` from the PR branch |

### Differentiators (Nice to Have)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Stacked PR approach for future large features | Autopilot + MoE panels will be large; establish a workflow now | MEDIUM | Tools: `git rebase --update-refs`, Graphite, or manual stacking |
| PR template enforcing size and scope checklist | Prevents future scope creep in submissions | LOW | Separable from this milestone's fixes |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Squashing everything into one commit before splitting | Loses granular history, makes bisect harder | Use `git cherry-pick` or `git rebase -i` to move commits to new branches |
| Creating split PRs that target main directly without stacking | If PR A depends on PR B, merging order matters; targeting main with dependent PRs risks broken states | Stack PRs on each other with clear dependency labels in PR body |

### Recommended Split Order

Based on the dependency graph:

```
PR A: tests + CI (no dependencies)
  └─> PR B: resolve-model fix (depends on: rebase after #761 lands)
        └─> PR C: autopilot feature (depends on: config keys from core, auto-discuss from A)
```

**Rationale:** Tests+CI can land immediately — it's the least risky and validates the CI setup itself. Resolve-model must coordinate with #761 to avoid conflicts. Autopilot should be last because it depends on the config infrastructure and the resolve-model fix being in main.

**Dependency on `model_overrides`:** Remove from PR C (autopilot) unless it has documentation and tests. If needed for autopilot, scope it explicitly with validation.

---

## Feature Dependencies

```
Fix Area 1 (runtime flag for auto-advance)
    └──modifies──> autopilot.md (remove config-set call)
    └──modifies──> plan-phase.md (read --auto argument)

Fix Area 2 (input validation for discuss_agents)
    └──modifies──> auto-discuss.md (validate AGENT_COUNT at read time)
    └──depends on──> Fix Area 1 (same PR: autopilot feature)

Fix Area 3 (config documentation)
    └──adds──> README.md (config reference section)
    └──optionally modifies──> CHANGELOG.md (unreleased section)
    └──optionally reverts──> core.cjs (remove model_overrides if premature)

Fix Area 4 (PR splitting)
    └──precedes──> all other fix areas (structure work, not code work)
    └──depends on──> git branch manipulation (cherry-pick or rebase)
```

### Dependency Notes

- **Fix Areas 1 and 2 share a PR (autopilot feature):** They both touch autopilot.md and auto-discuss.md, so they belong together in the same focused PR.
- **Fix Area 3 can land in any PR:** Documentation for `model_overrides` is independent of the runtime flag fix. If `model_overrides` is removed, Fix Area 3 is just a README addition.
- **Fix Area 4 must happen first:** The PR split is the prerequisite for all other fixes to be reviewable as separate PRs.
- **Resolve-model fix (PR #761 coordination):** This is not strictly part of v1.3 code changes but is a PR management task. It should be tracked separately.

---

## MVP Definition

### Do Now (v1.3 — this milestone)

- [x] Split PR: extract tests+CI, resolve-model, autopilot into separate PRs — **no code required, git branch work**
- [x] Remove `.planning/` artifacts from autopilot PR branch — **git rm**
- [x] Fix auto-advance config mutation — **remove 1 line from autopilot.md, add --auto to phase chain call**
- [x] Add runtime validation for `discuss_agents` in auto-discuss.md — **~5 lines of shell validation**
- [x] Document `autopilot.*` config keys in README — **~10 lines of docs**
- [x] Decide: remove `model_overrides` from loadConfig() or add tests+docs

### Defer to Later

- [ ] `config-validate` CLI command — useful but separable from PR review fixes
- [ ] JSON schema validation on config load — larger refactor, different milestone
- [ ] Stacked PR tooling setup — process improvement, not a code fix
- [ ] PR template for scope checklist — governance, not code

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Remove config mutation (auto-advance) | HIGH — prevents silent config corruption | LOW — remove 1 line, add --auto arg | P1 |
| Runtime validation for discuss_agents | HIGH — prevents autopilot spawning wrong agent count | LOW — 5 lines of shell validation | P1 |
| PR split (tests+CI separate) | HIGH — unblocks reviewer approval | LOW — git branch work only | P1 |
| Remove .planning/ artifacts | HIGH — removes contributor filesystem path leakage | LOW — git rm | P1 |
| Document autopilot.* config keys | MEDIUM — discoverability for users | LOW — README addition | P2 |
| Decide on model_overrides | MEDIUM — cleanliness of codebase | LOW — revert 1 line OR add tests | P2 |
| config-validate command | LOW — convenience | MEDIUM — new CLI command | P3 |
| Stacked PR workflow docs | LOW — process hygiene | LOW | P3 |

---

## Sources

### Runtime Flags vs Config Mutation (HIGH confidence)
- npm config precedence model: [npm-config docs](https://docs.npmjs.com/cli/v6/using-npm/config/) — CLI flags override config files, not the reverse
- node-config library: [Environment Variables wiki](https://github.com/node-config/node-config/wiki/Environment-Variables) — env vars override config files; config files store persistent preferences
- GSD codebase: `autopilot.md` lines 47-52 (`ensure_auto_advance` step) — the mutation bug is directly observable

### Input Validation (HIGH confidence)
- OWASP Input Validation Cheat Sheet: [owasp.org](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) — allowlist validation pattern; validate at consumption point
- GitHub security blog: [Validate all the things](https://github.blog/security/application-security/validate-all-things-input-validation/) — validate inputs before use, not only at write time
- GSD codebase: `auto-discuss.md` lines 30-32 — `AGENT_COUNT` read with fallback but no validation of the value received

### Config Documentation (HIGH confidence)
- Keep a Changelog: [keepachangelog.com](https://keepachangelog.com/en/1.0.0/) — every new option in `### Added` under `[Unreleased]`
- Changelog best practices: [getbeamer.com](https://www.getbeamer.com/blog/11-best-practices-for-changelogs) — document breaking changes, categorize by type, link to additional material
- GSD codebase: `config.cjs` — `autopilot` section added in defaults but no README section or CHANGELOG entry

### PR Splitting (HIGH confidence)
- Graphite PR size guide: [graphite.com](https://graphite.com/guides/best-practices-managing-pr-size) — under 200 lines ideal, atomic PRs, no mixed change types
- Stacked pull requests: [michaelagreiler.com](https://www.michaelagreiler.com/stacked-pull-requests/) — stack dependent PRs on each other rather than targeting main directly
- PR splitting strategies: [awesomecodereviews.com](https://www.awesomecodereviews.com/best-practices/stacked-pull-requests/) — separate refactors, features, tests into distinct PRs
- GitHub community discussion: [github.com/orgs/community](https://github.com/orgs/community/discussions/181240) — separation of concerns is the primary split criterion
- Git stacking with --update-refs: [andrewlock.net](https://andrewlock.net/working-with-stacked-branches-in-git-is-easier-with-update-refs/) — native git support for stacked branches without third-party tools

---

*Feature research for: PR review fixes on autopilot mode (get-shit-done v1.3)*
*Researched: 2026-02-28*
