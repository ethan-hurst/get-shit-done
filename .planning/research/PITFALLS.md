# Pitfalls Research

**Domain:** PR splitting, runtime config flags, validation hardening, overlapping PRs, artifact cleanup
**Researched:** 2026-02-28
**Confidence:** HIGH (derived from codebase analysis + documented PR state + common git/Node.js patterns)

---

## Critical Pitfalls

---

### Pitfall 1: Splitting a PR Leaves Commits Orphaned on the Original Branch

**What goes wrong:**
When splitting PR #762 (autopilot) into focused PRs (tests+CI, resolve-model fix, autopilot feature), commits that belong to split-off branches are often left behind on the original branch. The split looks clean in `git log` on the new branch but the original branch still contains the commits, and when it is eventually merged or rebased, the commits appear twice — once from the split PR and once from the original. GitHub may show them as "already merged" in the PR diff, but if force-push or rebase is involved, commits can reappear unexpectedly.

**Why it happens:**
Developers create a new branch from the original and cherry-pick the relevant commits, believing the branch is now "clean." They do not rebase the original branch to remove the cherry-picked commits. Now both branches contain the same logical changes but as distinct commit objects (different SHAs). When both branches target main, git sees distinct commits and applies both changes, potentially duplicating lines or creating conflicts.

**How to avoid:**
1. Start the split from the base commit (where feat/autopilot diverged from main), not from the tip of feat/autopilot.
2. Create each focused branch from main: `git checkout -b fix/resolve-model main`.
3. Cherry-pick only the commits belonging to that PR's scope into the new branch.
4. For the original branch (autopilot), interactively rebase to remove commits that were split into other PRs: `git rebase -i main` on feat/autopilot, dropping the lines for cherry-picked commits.
5. Verify the split is clean: `git diff main...fix/resolve-model` should show only the resolve-model fix. `git diff main...feat/autopilot` should show no resolve-model changes.

**Warning signs:**
- `git log main...feat/autopilot` shows commits that have also appeared in a merged PR
- PR #762's diff includes the resolve-model fix after PR #761 has merged (should be gone)
- GitHub reports "0 changed files" on a PR after another PR was merged (commits were already on base)

**Phase to address:** Phase 14 — PR Restructure (first phase of v1.3). Must happen before any other fix work because subsequent phases add commits on top of a correct branch structure.

---

### Pitfall 2: Runtime Flag Leaks Into Subsequent Sessions via Config Mutation

**What goes wrong:**
The auto-advance feature (autopilot advancing phases without user confirmation) was implemented by mutating `config.json` to set `auto_advance: true`. The reviewer identified this as a bug: config mutation persists across sessions. If the flag is written to disk, a subsequent unrelated session reads the config, finds `auto_advance: true`, and auto-advances without the user expecting it. The user's "one-time" option becomes a permanent state change.

**Why it happens:**
The natural pattern in Node.js CLI tools is to persist options by writing to the config file. Developers reach for `loadConfig()` + `fs.writeFileSync(configPath, JSON.stringify(...))` because it is how every other setting works in this codebase. The distinction between session-scoped flags (should not persist) and user preferences (should persist) is easy to miss.

**How to avoid:**
1. Use an in-memory runtime flag only: add a module-level variable in the relevant workflow or pass it as a parameter through the call chain. Never write session-scoped flags to `config.json`.
2. For the gsd-tools.cjs CLI, pass the flag as a command-line argument or environment variable (`GSD_AUTO_ADVANCE=1`). The process reads it once at startup and it dies with the process.
3. Add a code comment at the flag's declaration: `// Runtime-only: never persist to config.json`. This makes intent explicit for future contributors.
4. If the config loading code ever re-reads `config.json` during a session, the session-scoped value must be held separately and merged after load: `const runtimeFlags = { auto_advance: cliArgs.autoAdvance }; const effective = { ...config, ...runtimeFlags }`.

**Warning signs:**
- `config.json` is modified during a run that the user did not invoke as a settings change
- Tests that run in sequence pass individually but fail together (previous test left config state)
- `git diff` on `.planning/config.json` appears in test runs that should not touch config

**Phase to address:** Phase 15 — Auto-Advance Fix. This is an isolated code change in `state.cjs` or the autopilot workflow. Low risk of cross-phase interference if done as its own PR.

---

### Pitfall 3: Validation Too Strict Breaks Existing Callers of `discuss_agents`

**What goes wrong:**
Adding runtime validation for `discuss_agents` in the auto-discuss workflow could break existing users who have configs or workflows that provide `discuss_agents` in an unexpected format. If the validator throws or exits on any unexpected value (instead of defaulting gracefully), users who previously worked fine now get hard errors.

**Why it happens:**
Validation is usually added after a bug is discovered. The developer validates the exact case that caused the bug but over-constrains the input space. For example: validating that `discuss_agents` must be an array of strings also rejects a single string (which is a reasonable user shorthand), or rejects an array with empty strings (which might be valid as a "use default agent" signal), or rejects `undefined` (which was previously allowed as "use all agents").

**How to avoid:**
1. Before writing validation, enumerate all values that currently work (test existing configs and workflow invocations). The validation must accept all of them.
2. Prefer defensive coercion over rejection: if `discuss_agents` is a string, coerce to `[discuss_agents]`. If it is `null` or `undefined`, coerce to the default value. Only reject values that are structurally impossible to interpret.
3. The error message on rejection must tell the user exactly what to provide, not just what was wrong: "discuss_agents must be an array of agent names, got: `true`" is better than "invalid discuss_agents".
4. Add a test that passes the old config format (no `discuss_agents` key) and asserts the workflow still runs normally. Backwards compatibility test first, then add the validation.

**Warning signs:**
- Validation added without a test for the pre-existing "no key" case
- Validation uses `=== undefined` check on a key that could also be `null`, `0`, or `false`
- No graceful default — the code throws instead of falling back

**Phase to address:** Phase 16 — Validation Hardening. Scope: auto-discuss workflow only. Must not touch other callers of discuss_agents outside auto-discuss.

---

### Pitfall 4: Coordinating With PR #761 (resolve-model fix) — Merge Order Creates Conflicts

**What goes wrong:**
PR #761 and PR #762 both touch `resolve-model` logic. If both PRs are open simultaneously targeting main and one merges first, the other PR's diff now shows a conflict on the same lines. Git cannot auto-merge because both PRs modified the same function. The developer must rebase the second PR against the updated main — but if they rebase incorrectly, they either lose the first PR's fix or introduce a double-application of the same change.

**Why it happens:**
When two contributors (or two PRs from the same contributor) independently identify the same bug and fix it, their fixes diverge at the implementation level even if they solve the same problem. Cherry-picking is tempting but dangerous: cherry-picking a fix onto a branch that already has the same logical fix (with different surrounding code) silently applies a double-fix or creates syntactically valid but semantically wrong code.

**How to avoid:**
1. Decide on one canonical fix before both PRs are open simultaneously. If PR #761 (resolve-model) is already merged or likely to merge first, base the fix in PR #762 on the post-merge state of main.
2. After PR #761 merges, immediately rebase feat/autopilot against the updated main: `git fetch origin && git rebase origin/main`. Resolve conflicts at the resolve-model fix site manually — verify the post-rebase code has exactly one copy of the fix, not zero and not two.
3. If PR #761 is closed (not merged), cherry-pick the relevant commit from the closed PR's branch into the new focused PR rather than implementing the fix independently again.
4. If PR #761 was merged: check `git log main --oneline -- path/to/resolve-model-file` to confirm the fix is in main before removing it from PR #762's scope.

**Warning signs:**
- Both PRs modify the same file in their diffs
- `git diff main...feat/autopilot` shows changes to resolve-model code even after PR #761 merged
- CI shows a merge conflict check failing on PR #762

**Phase to address:** Phase 14 — PR Restructure (same phase as the split, since coordinate-with-761 is prerequisite to the split being correct).

---

### Pitfall 5: Removing `.planning/` Artifacts Breaks the Local Dev Workflow Mid-Milestone

**What goes wrong:**
The reviewer requested removing committed `.planning/` artifacts (PLAN.md files, SUMMARY.md files, research files) from the PR branch. If these are removed with `git rm` and committed, they disappear from the branch permanently. If the team is mid-execution (using those PLAN.md files to track what to do next), removing them mid-milestone orphans the working state. The agent trying to resume from a checkpoint no longer has the PLAN.md to resume from.

**Why it happens:**
The reviewer sees `.planning/` files as dev artifacts (like `node_modules` or compiled output) that should not be in the repository. The executor agent produced them as part of the workflow. The conflict: they should be tracked in `.gitignore` for the repo but were committed on the branch before `.gitignore` was updated.

**How to avoid:**
1. Before removing any `.planning/` file from git tracking, verify that the milestone is complete — all phases executed, no active PLAN.md files in-use. Check `.planning/STATE.md` to confirm status.
2. The removal order matters: (a) add `.planning/` patterns to `.gitignore` first, (b) then `git rm --cached .planning/phases/*/PLAN.md` to untrack without deleting the local files, (c) commit the `.gitignore` change and the `git rm --cached` in the same commit, (d) verify local dev still works by checking that the physical files still exist on disk.
3. Do not use `git rm` (without `--cached`) on PLAN.md or SUMMARY.md files that are currently in-use. The physical file must survive; only git's tracking of it should be removed.
4. After the cleanup commit, verify the workflow still functions: run `gsd-tools.cjs phases list` in the temp directory pattern used by tests to confirm `.planning/` artifact removal did not affect test fixtures (tests create their own temp dirs so this should be safe, but verify).

**Warning signs:**
- `git rm` without `--cached` on files that are still referenced by `.planning/STATE.md`
- `.gitignore` change is in a separate commit from the `git rm --cached` (leaves a window where CI includes artifacts)
- Physical `.planning/` files are deleted from disk during cleanup (confirms with `ls .planning/phases/`)

**Phase to address:** Phase 17 — Artifact Cleanup. Should be a standalone PR — no code changes, only `.gitignore` additions and `git rm --cached`. Keeps the diff reviewable.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Writing runtime flags to config.json | No extra parameter threading through call stack | Flag persists across sessions, surprising users | Never — session flags must never hit disk |
| Validating `discuss_agents !== undefined` only | Catches missing key | Misses `null`, `false`, `0`, empty array — all of which arrive from real configs | Never — validate all falsy paths |
| Removing `.planning/` via `git rm` (not `--cached`) | Cleaner local directory | Destroys workflow state mid-execution | Never if milestone is in-progress |
| Cherry-picking the resolve-model fix without rebasing original branch | Avoids rebase complexity | Both branches contain the same logical change, double-applied when both merge | Never — must rebase original branch |
| Documenting `model_overrides` inline in config.json template | No separate doc to maintain | Template becomes the spec; when code diverges, template is wrong and users are confused | Only if the feature is stable and unlikely to change |

---

## Integration Gotchas

Common mistakes when connecting the v1.3 fixes to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Runtime flag + loadConfig() | Reading `auto_advance` from config inside a function that is called multiple times per session, picking up stale disk state | Load config once at process start, pass effective config as parameter; never re-read config.json for session-scoped flags |
| `discuss_agents` validation + auto-discuss workflow | Adding validation that calls `process.exit(1)` on invalid input, breaking the workflow silently in CI where exit code 1 is indistinguishable from a test failure | Return structured error JSON matching the existing `output()` / `error()` helper convention, let the orchestrator surface the error |
| PR #762 rebase after PR #761 merge | Rebasing feat/autopilot on main after PR #761 merged, then forgetting to force-push the rebased branch, PR still shows old base | After rebase, always `git push --force-with-lease` to update the PR's remote branch (safer than `--force`: aborts if remote has new commits you have not seen) |
| .planning/ git rm + tests | Using `git rm` in a test that uses `createTempProject()` — the temp dir does not have git initialized, so `git rm` fails | Tests use temp directories that are not git repos; the cleanup change is a one-time git operation on the actual repo, not something to test via `runGsdTools()` |
| config.json template + `model_overrides` | Adding `model_overrides` to the template config.json with example values, users copy the template and get non-default model overrides they did not intend | Either omit the key from the template (rely on code defaults) or add it commented out with a clear "uncomment to customize" note |

---

## Performance Traps

Not applicable at the scale of v1.3 (the changes are code fixes and PR operations, not performance-sensitive features). No new code paths that touch ROADMAP.md scanning or large file operations.

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Writing auto_advance flag to config.json exposes it to git history | If a future automation commits config.json, `auto_advance: true` leaks into repo history and could be parsed by tools that auto-configure CI behavior | Keep session flags out of config.json entirely; they have no business being on disk |
| Over-broad validation error messages that echo back user input | If `discuss_agents` accepts arbitrary strings and the error message includes the raw input, a crafted input could inject into log output | Sanitize or truncate the echoed value in error messages; max 100 chars, no newlines |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Validation error on `discuss_agents` with no migration path | Users who already configured discuss_agents in the old format get a hard error with no guidance | Add validation + a clear upgrade message: "discuss_agents now requires an array, found: X. Update your config to: discuss_agents: [X]" |
| Documenting `model_overrides` config key that is not yet used | Users add it to their config expecting it to work, nothing happens, they file bugs | Either implement it or explicitly mark it as `// reserved for future use, has no effect yet` in the template and docs |
| PR split produces 3 separate PRs with dependencies not communicated | Reviewer merges the wrong PR first, creating a broken state | Add a PR description note to each PR: "Merge order: this PR first, then X, then Y" or use GitHub draft status on dependent PRs |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **PR Split:** Branch has been cherry-picked to new PRs — verify original feat/autopilot branch has been rebased to drop those commits, not just that the new PRs exist.
- [ ] **Runtime flag fix:** auto_advance is no longer written to config.json — verify by running the autopilot workflow and diffing `git diff .planning/config.json` before and after; it should show no changes.
- [ ] **discuss_agents validation:** Validation added — verify with a test that uses the pre-existing "no discuss_agents key" config and confirms the workflow still runs without error (backwards compatibility).
- [ ] **PR #761 coordination:** The resolve-model fix is not double-applied — verify `git log main...feat/autopilot -- [resolve-model file path]` shows no resolve-model commits after PR #761 merged.
- [ ] **Artifact cleanup:** `.planning/` files removed from git tracking — verify with `git ls-files .planning/` that phase artifacts no longer appear; physical files still exist on disk (`ls .planning/phases/`).
- [ ] **model_overrides documentation:** If `model_overrides` is documented in config, verify a test exercises loading config with `model_overrides` present and the system does not crash (even if the key is currently a no-op).

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Commits orphaned on original branch after split | MEDIUM | `git rebase -i main` on feat/autopilot, drop the split commits; force-push with `--force-with-lease`; notify PR reviewer the branch was rebased |
| auto_advance written to config.json and already merged | LOW | Hotfix PR: add migration in config load that strips `auto_advance` key from config.json on load; removes it from disk next time gsd-tools runs |
| Validation breaks existing discuss_agents config | LOW | Hotfix PR: add coercion before validation (string-to-array, null-to-default); bump patch version; communicate in CHANGELOG.md |
| PR #762 has double-applied resolve-model fix after PR #761 merged | MEDIUM | Identify the conflicting commits with `git log`; rebase feat/autopilot onto post-merge main; resolve conflicts by keeping PR #761's version; re-request review with explanation |
| `.planning/` files deleted from disk (not just untracked) | HIGH | `git checkout HEAD -- .planning/phases/` to restore from the commit before the bad `git rm`; if already committed, `git revert` the cleanup commit; never use bare `git rm` on active PLAN.md files |
| model_overrides documented but non-functional — user reports broken behavior | LOW | Add a CHANGELOG entry noting the key is reserved; add a warning log in config.cjs when the key is present: "model_overrides is not yet implemented and has no effect" |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Orphaned commits after PR split | Phase 14 — PR Restructure | `git log main...feat/autopilot` shows no commits that appear in the split-off PRs |
| Runtime flag config mutation | Phase 15 — Auto-Advance Fix | `git diff .planning/config.json` clean after autopilot run; unit test asserts config.json not written |
| Validation breaks backwards compat | Phase 16 — Validation Hardening | Test with config missing `discuss_agents` key passes; test with old string format passes (or gets clear error + coercion) |
| PR #761 resolve-model double-apply | Phase 14 — PR Restructure | Diff of new focused resolve-model PR against post-761-merge main shows no duplicated logic |
| Artifact removal breaks dev workflow | Phase 17 — Artifact Cleanup | Physical `.planning/` files exist on disk; `git ls-files .planning/phases/` returns empty for PLAN.md and SUMMARY.md files |
| model_overrides stale docs | Phase 18 (if addressed) — Config Docs | Either removed from template or accompanied by "no-op" warning in config.cjs |

---

## Sources

- GSD codebase analysis: `.planning/codebase/CONCERNS.md` — config mutation patterns, error handling gaps — HIGH confidence
- GSD codebase analysis: `.planning/codebase/CONVENTIONS.md` — no module-level mutable state convention, config loaded on-demand — HIGH confidence
- GSD codebase analysis: `.planning/codebase/TESTING.md` — `createTempProject()` creates non-git dirs, confirms `git rm` cannot be tested via test helpers — HIGH confidence
- GSD codebase analysis: `.planning/PROJECT.md` — v1.3 requirements, PR #762 and #761 relationship — HIGH confidence
- `.planning/STATE.md` — PR #761 closed, PR #762 open with changes requested — HIGH confidence
- `git diff main...feat/autopilot --stat` — confirmed `.planning/` artifacts committed on branch, config.json modified — HIGH confidence
- Common git rebase/cherry-pick pitfalls: standard git documentation and community best practices — HIGH confidence (well-established, not stale)
- Node.js `--force-with-lease` safety over `--force`: git documentation — HIGH confidence

---
*Pitfalls research for: PR Review Fixes — splitting, runtime flags, validation, overlapping PRs, artifact cleanup*
*Researched: 2026-02-28*
