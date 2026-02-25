---
phase: quick-1
plan: "01"
subsystem: test-suite
tags: [tests, overfitting, refactoring, quality]
duration: "~5 min"
completed: "2026-02-25"
key-decisions:
  - "Deleted FRONTMATTER_SCHEMAS describe block entirely — CLI validate tests cover behavior end-to-end"
  - "Replaced 12 per-profile per-agent matrix tests with 1 structural validation test using valid-value set"
  - "URL test switched to URL.searchParams.get() — encoding-agnostic and correct"
  - "Date assertion uses before/after window — handles midnight boundary without flakiness"
  - "branching_strategy/plan_check/verifier assertions switched to typeof checks — tests logic not defaults"
key-files:
  modified:
    - tests/frontmatter.test.cjs
    - tests/core.test.cjs
    - tests/commands.test.cjs
    - tests/state.test.cjs
    - tests/config.test.cjs
---

# Quick Task 1: Fix Overfitting in Test Suite Summary

**One-liner:** Removed 15 overfit tests across 5 files — schema shape assertions, profile lookup matrix, hardcoded defaults, raw URL encoding checks, and midnight-fragile date snapshot replaced with behavior-testing equivalents.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix HIGH severity overfitting — frontmatter, core, commands, state | 4816f2d | tests/frontmatter.test.cjs, tests/core.test.cjs, tests/commands.test.cjs, tests/state.test.cjs |
| 2 | Fix config.test.cjs default-value assertions and verify full suite | 01e4dc7 | tests/config.test.cjs |

## Changes Made

### tests/frontmatter.test.cjs
Deleted the entire `describe('FRONTMATTER_SCHEMAS', ...)` block (4 tests). These asserted on exact required-field arrays and exact schema key lists — implementation internals, not behavior. The CLI validate tests in `frontmatter-cli.test.cjs` exercise schema behavior end-to-end.

### tests/core.test.cjs
Replaced three `describe('quality profile', ...)`, `describe('balanced profile', ...)`, and `describe('budget profile', ...)` blocks (12 tests, each asserting exact string values per agent per profile) with a single structural validation test. The new test verifies every agent/profile combination resolves to a value in `['inherit', 'sonnet', 'haiku', 'opus']` — catching wrong types and invalid values without being fragile to lookup table changes.

The `override precedence` and `edge cases` describe blocks were preserved unchanged — they test real logic.

### tests/commands.test.cjs
Replaced three `assert.ok(capturedUrl.includes(...))` calls with URL-parsed assertions using `new URL(capturedUrl).searchParams.get()`. This is encoding-agnostic (`+`, `%20`, `%2B` all decode the same way) and more precise.

### tests/state.test.cjs
Replaced single `new Date().toISOString().split('T')[0]` snapshot with a `before`/`after` window approach. `before` is captured before the `runGsdTools` call; `after` is captured after reading the file. The assertion accepts either date, handling the midnight boundary where the command runs just before midnight and the assertion runs just after.

### tests/config.test.cjs
- Line 138: `assert.strictEqual(config.branching_strategy, 'none', ...)` → `assert.strictEqual(typeof config.branching_strategy, 'string', ...)`
- Lines 176-177: `assert.strictEqual(config.workflow.plan_check, true, ...)` and `assert.strictEqual(config.workflow.verifier, true, ...)` → `typeof ... 'boolean'` checks
- Added `// NOTE: This test touches ~/.gsd/ on the real filesystem...` isolation comment to all three `~/.gsd/` tests

## Verification Results

```
tests 433
pass  433
fail  0
```

Coverage (all modules above 70%):
- All files: 94.08% statements, 80.72% branch, 100% functions
- Lowest: config.cjs at 86.41% (well above 70% threshold)

**Test count change:** 448 → 433 (15 fewer: 4 schema tests deleted + 12 profile-matrix tests replaced by 1 structural test - 1 new = 11 net reduction in profile section + 4 schema = 15 total)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- tests/frontmatter.test.cjs: FOUND (FRONTMATTER_SCHEMAS describe block deleted)
- tests/core.test.cjs: FOUND (structural validation test present)
- tests/commands.test.cjs: FOUND (searchParams.get() assertions present)
- tests/state.test.cjs: FOUND (before/after window present)
- tests/config.test.cjs: FOUND (typeof checks present, isolation comments present)
- Commit 4816f2d: FOUND
- Commit 01e4dc7: FOUND
- npm run test:coverage: PASSED (433 tests, all modules >= 70%)
