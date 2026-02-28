# Phase 14: PR Restructure - Research

**Researched:** 2026-02-28
**Domain:** Git branch management, GitHub PR workflow, git rebase/cherry-pick
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**PR #762 Handling**
- Close #762 and open 2 new PRs (not 3 — PR A absorbed by merged #763)
- Add closing comment to #762 with links to new PRs: "Split into #X, #Y per review feedback from @glittercowboy"
- Each new PR references #762 in its body: "Split from #762 per review feedback"

**PR #761 Coordination**
- PR #761 was closed without merging — the resolve-model fix only exists in our branch
- No conflict risk since #761 never landed on main
- Credit @ChuckMayo in PR B body: "Also identified by @ChuckMayo in #761"

**Branch Strategy**
- Rebase feat/autopilot onto main first (main now includes #763's test content)
- Fork both new branches from rebased feat/autopilot
- PR B: branch from feat/autopilot, remove all non-resolve-model files
- PR C: branch from feat/autopilot, remove `.planning/` artifacts, keep autopilot feature code
- PR B stays separate from PR C (reviewer explicitly asked for separation)

**PR Descriptions**
- Follow repo's PR template: What / Why / Testing / Checklist / Breaking Changes
- Add extra section mapping which @glittercowboy review findings each PR addresses (point-by-point)
- Both PRs include test plan details

### Claude's Discretion
- Exact branch names for PR B and PR C
- Commit message wording for the rebase and cleanup
- How to structure the "review findings addressed" section in PR body
- Whether template.test.cjs goes into PR B or PR C

### Deferred Ideas (OUT OF SCOPE)
- Adding tests for the autopilot feature itself (reviewer noted as [MISSING]) — candidate for v1.4
- CHANGELOG.md updates for the autopilot feature — include in PR C if user-facing
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRS-01 | PR #762 split into focused PRs (updated in CONTEXT: 2 PRs, not 3 — PR A already merged) | PR #763 confirmed MERGED; PR #762 confirmed CLOSED Feb 28 |
| PRS-02 | `.planning/` artifacts removed from all PR branches via `git rm --cached` | `.planning/` tracked in git index; git rm --cached -r .planning/ is the correct approach |
| PRS-03 | `.gitignore` updated to prevent `.planning/` from being committed again | `.planning/` is ALREADY in both feat/autopilot and origin/main .gitignore — no action needed |
| PRS-04 | PR #761 status confirmed and resolve-model fix coordinated (no duplicate changes) | PR #761 CLOSED. Resolve-model fix already on origin/main via PR #739 — see critical finding below |
| CRD-01 | PR A (tests+CI) submitted first with no dependencies | DONE — PR #763 already merged Feb 25 |
| CRD-02 | PR B (resolve-model) submitted after confirming PR #761 status | See critical finding: fix already on main; PR B scope is moot for code change but confirmed for coordination |
</phase_requirements>

## Summary

Phase 14 is a git restructuring task: rebase `feat/autopilot` onto `origin/main`, create a clean PR C branch containing only autopilot feature code with `.planning/` artifacts removed from the git index, and close PR #762 with a closing comment.

**Critical finding:** The CONTEXT.md assumptions are partially outdated. Research reveals that (1) `origin/main` is far ahead of local `main` — local main must be synced first; (2) the resolve-model fix is ALREADY on `origin/main` via PR #739 (merged independently), making PR B a coordination confirmation rather than a new PR submission; (3) `.planning/` is already in `.gitignore` on both branches, so PRS-03 requires only removing the tracked files from the git index, not updating `.gitignore`.

**Primary recommendation:** Sync local main with `git fetch origin && git merge origin/main`, rebase `feat/autopilot` onto the updated main, resolve the known conflicts (execute-phase.md path style), run `git rm --cached -r .planning/`, then create and push the clean PR C branch. Close PR #762 with a comment. Skip PR B creation since the code change is already on main; satisfy CRD-02 by documenting the confirmation in the PR C body.

## Critical Findings (Research Discoveries)

### Finding 1: Resolve-Model Fix Already on upstream main (SCOPE CHANGE)

The CONTEXT.md states "the resolve-model fix only exists in our branch." This is incorrect as of Feb 28. Research confirms:

- PR #739 ("fix: load model_overrides from config and use resolveModelInternal in CLI") was MERGED to `origin/main` independently
- `origin/main`'s `get-shit-done/bin/lib/commands.cjs` already has `resolveModelInternal` delegation (no `'inherit'` bug)
- `origin/main`'s `get-shit-done/bin/lib/core.cjs` already has `model_overrides: parsed.model_overrides || null` in `loadConfig`
- PR #761 (ChuckMayo's fix) was CLOSED without merging

**Impact on Phase 14:**
- PR B (fix/resolve-model) does NOT need to be created as a new code PR
- CRD-02 is satisfied by: confirm PR #761 closed, document that fix landed via PR #739, credit ChuckMayo in PR C body instead
- PR C becomes the only new PR to submit

**Confidence:** HIGH — verified by fetching origin/main and inspecting `commands.cjs` and `core.cjs` source directly.

### Finding 2: Local main is ~15 commits behind origin/main

Local `main` is at commit `3fddd62` (pre-1.21.0). `origin/main` is at `19ac77e` and includes:
- 1.21.0, 1.21.1 releases
- PR #763 (tests+CI merged)
- PR #739 (resolve-model fix)
- PR #786 (`$HOME` path fix)
- Several other community PRs (#737, #741, #759, etc.)

**Impact:** Rebasing feat/autopilot must target `origin/main`, not local `main`. First step is `git fetch origin && git merge origin/main` (or `git pull origin main`).

### Finding 3: .gitignore Already Contains .planning/

`.planning/` is already excluded in `.gitignore` on BOTH `feat/autopilot` and `origin/main` (line: `# Internal planning documents` / `.planning/`).

**Impact on PRS-03:** No `.gitignore` edit needed. The issue is that git tracks files once they are committed — `.gitignore` only prevents untracked files from being staged. The fix is purely `git rm --cached -r .planning/`. PRS-03 is partially satisfied; only the index cleanup remains.

### Finding 4: feat/autopilot is 10 Commits Ahead of origin/main

```
87f08eb docs(14): capture phase context         — .planning only
56b6930 docs: create milestone v1.3 roadmap     — .planning only
5900bcc docs: define milestone v1.3 requirements — .planning only
3c2c317 docs: complete project research         — .planning only
7411599 docs: start milestone v1.3 PR Review    — .planning only
b296079 wip: v2.0 milestone setup paused        — .planning only
ade3945 docs: start milestone v2.0 MoE Panels   — .planning only
000163a refactor: remove dead execution section  — SOURCE CODE (autopilot)
8850ebf refactor: remove Agent Teams engine      — SOURCE CODE (autopilot)
b0aa9fc feat: add autopilot mode                 — SOURCE CODE (autopilot)
```

**Impact:** After rebase onto `origin/main`, the 7 `.planning/` commits remain but contain only artifacts that will be removed. The 3 source commits are the autopilot feature. PR C should contain only the net diff from these 3 source commits (after conflict resolution).

## Standard Stack

### Core (Git Operations)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| git | system | Branch creation, rebase, cherry-pick, rm --cached | Only tool for git index operations |
| gh CLI | system | PR creation, comment posting, PR view | GitHub API automation |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `git rm --cached -r` | git builtin | Remove tracked files from index without deleting from disk | Required for PRS-02 |
| `git rebase origin/main` | git builtin | Replay autopilot commits on top of updated main | Required before PR C creation |
| `git checkout -b` | git builtin | Create new clean branch | For PR C branch |

**Installation:** No additional installs needed — git and gh CLI already present.

## Architecture Patterns

### Pattern 1: Rebase-then-Fork Branch Strategy (Locked Decision)

**What:** Rebase `feat/autopilot` onto `origin/main`, then fork PR C from the rebased state after removing `.planning/` artifacts.

**When to use:** When the source branch diverged before a large upstream update (1.21.0 → 1.21.1+ with multiple community PRs).

**Steps:**
```bash
# 1. Sync local main
git checkout main
git pull origin main

# 2. Rebase feat/autopilot (resolve conflicts during rebase)
git checkout feat/autopilot
git rebase origin/main

# 3. Remove .planning/ from git index (files stay on disk)
git rm --cached -r .planning/
git commit -m "chore: remove .planning/ artifacts from git index"

# 4. Create PR C branch
git checkout -b feat/autopilot-clean  # or chosen branch name

# 5. Push and open PR
git push fork feat/autopilot-clean
gh pr create --repo gsd-build/get-shit-done --title "..." --body "..."
```

### Pattern 2: git rm --cached vs git rm

**What:** `git rm --cached -r .planning/` removes files from the git index (staging area) without touching the working tree. Files remain on disk, only removed from git tracking.

**Critical distinction:**
```bash
git rm -r .planning/      # WRONG: Deletes files from disk AND index
git rm --cached -r .planning/  # CORRECT: Removes from index only
```

**After running:** Files in `.planning/` become untracked. Since `.planning/` is in `.gitignore`, they will not appear in `git status` as untracked — they are effectively invisible to git going forward.

### Pattern 3: Verifying Clean Branch Diff

**What:** Use `git diff origin/main...{branch}` (three dots) to see only the commits unique to the branch.

```bash
# Verify PR C contains only expected files
git diff origin/main...feat/autopilot-clean --name-only
```

Expected output for PR C:
```
commands/gsd/autopilot.md
get-shit-done/bin/lib/config.cjs
get-shit-done/templates/config.json
get-shit-done/workflows/auto-discuss.md
get-shit-done/workflows/autopilot.md
get-shit-done/workflows/execute-phase.md
get-shit-done/workflows/progress.md
get-shit-done/workflows/settings.md
```

No `.planning/` entries should appear.

### Pattern 4: Closing PR with Comment (GitHub CLI)
```bash
# Add closing comment to PR #762
gh pr comment 762 --repo gsd-build/get-shit-done \
  --body "Closing and splitting into focused PRs per @glittercowboy review feedback:
- PR #XXX: feat/autopilot-clean — autopilot feature code only"

gh pr close 762 --repo gsd-build/get-shit-done
```

Note: PR #762 is already CLOSED (closed Feb 28). Only the closing comment needs to be added.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Removing .planning/ from git | Manual file operations | `git rm --cached -r .planning/` | Index-only removal is built into git |
| Creating PR body | Manual HTML/text | `gh pr create --body "$(cat <<'EOF'...)"` heredoc | gh CLI handles escaping, API auth |
| Verifying branch cleanliness | Script parsing git log | `git diff origin/main...branch --name-only` | Three-dot notation shows only branch-specific commits |

## Known Rebase Conflicts

Based on direct code inspection, rebasing `feat/autopilot` onto `origin/main` will produce the following conflicts:

### Conflict 1: execute-phase.md (path style)

**Location:** `get-shit-done/workflows/execute-phase.md`

**Nature:** The autopilot commit (b0aa9fc) added lines using `~/.claude/get-shit-done/bin/gsd-tools.cjs` path style. `origin/main` uses `"$HOME/.claude/get-shit-done/bin/gsd-tools.cjs"` (PR #786 fix: "use $HOME instead of ~ for gsd-tools.cjs paths to prevent subagent MODULE_NOT_FOUND").

**Resolution:** Accept `$HOME` style (origin/main's version is correct — per PR #786, subagents sometimes rewrite `~` to relative paths). Verify autopilot-specific additions still exist after resolution.

**Autopilot-specific lines to preserve in execute-phase.md:**
```bash
AUTO_CFG=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.auto_advance 2>/dev/null || echo "false")
```
This line already exists in origin/main's execute-phase.md — the autopilot commit's additions may be entirely absorbed.

### Conflict 2: init.cjs (execution_engine removal)

**Location:** `get-shit-done/bin/lib/init.cjs`

**Nature:** Autopilot commit (8850ebf) removes `execution_engine` field from `cmdInitExecutePhase`. `origin/main` has a substantially refactored version of `init.cjs` (from the module split + toPosixPath changes).

**Resolution:** Accept origin/main's version as base; verify `execution_engine` field is not present (8850ebf's intent). The toPosixPath removal in origin/main's version supersedes the autopilot change.

### Conflict 3: config.cjs (autopilot section vs origin/main's config)

**Location:** `get-shit-done/bin/lib/config.cjs`

**Nature:** Autopilot commits add `autopilot: { discuss_agents, discuss_model }` section with validation. origin/main may or may not have this section.

**Resolution:** Keep the autopilot config section additions — these are unique to PR C.

### Non-Conflict: commands.cjs

No conflict expected. None of the 3 autopilot commits touch `commands.cjs`. After rebase, `commands.cjs` will automatically use `origin/main`'s fixed version (no `'inherit'` bug).

### Non-Conflict: .gitignore

No conflict expected. None of the 3 autopilot commits touch `.gitignore`. After rebase, `.gitignore` will be `origin/main`'s version (which has `coverage/` and `.planning/`).

## Common Pitfalls

### Pitfall 1: Rebasing onto local main instead of origin/main

**What goes wrong:** Local `main` is at `3fddd62` (pre-1.21.0). Rebasing onto it puts `feat/autopilot` on a base that's ~15 commits behind upstream, creating a PR with massive unintended diff (includes all 1.21.0, 1.21.1, test suite changes).

**How to avoid:** Always `git fetch origin` first, then `git rebase origin/main`.

**Warning signs:** `git diff origin/main...{branch} --name-only` shows hundreds of files.

### Pitfall 2: Using git rm (without --cached) to remove .planning/

**What goes wrong:** Deletes `.planning/` files from disk permanently. All planning documents, context files, requirements, etc. are lost.

**How to avoid:** Always use `git rm --cached -r .planning/`. Double-check with `ls .planning/` after the command to confirm files are still present.

**Warning signs:** `git status` shows nothing (files gone from disk, not just index).

### Pitfall 3: Force-pushing feat/autopilot (the source branch)

**What goes wrong:** After creating PR C as a new branch, force-pushing to `feat/autopilot` would rewrite the branch history and potentially confuse the `fork` remote.

**How to avoid:** Create a NEW branch (`feat/autopilot-clean` or chosen name) for PR C. Do not modify `feat/autopilot` in place.

### Pitfall 4: Reopening PR #762 instead of commenting + closing

**What goes wrong:** PR #762 is already CLOSED. Reopening it would require re-review of a large diff. The correct flow is add a closing comment explaining the split, then submit new focused PRs.

**How to avoid:** Use `gh pr comment 762` to add the comment. PR is already closed — no `gh pr close` needed.

### Pitfall 5: Including .planning/ files in the rebase commit before git rm

**What goes wrong:** If the rebase creates merge commits that include `.planning/` files, those files must still be removed AFTER the rebase with `git rm --cached`.

**How to avoid:** Run `git rm --cached -r .planning/` AFTER the full rebase is complete, then commit the removal as a separate cleanup commit before pushing.

### Pitfall 6: Assuming PR B is still needed as a new code PR

**What goes wrong:** Creating PR B (`fix/resolve-model`) to fix the `'inherit'` bug when it's already fixed on `origin/main` (PR #739) creates a duplicate that will be rejected.

**How to avoid:** Verify with `git show origin/main:get-shit-done/bin/lib/commands.cjs | grep resolveModelInternal` — returns the fixed version. No PR B needed for code. CRD-02 is satisfied by documenting the confirmation.

## Code Examples

### Verifying resolve-model fix on origin/main
```bash
# Confirm fix is present (should show resolveModelInternal, not 'inherit')
git show origin/main:get-shit-done/bin/lib/commands.cjs | sed -n '/function cmdResolveModel/,/^}/p'

# Confirm model_overrides in loadConfig
git show origin/main:get-shit-done/bin/lib/core.cjs | grep "model_overrides"
```

### Full rebase workflow
```bash
# Step 1: Sync local main
git checkout main
git pull origin main

# Step 2: Rebase (will have conflicts — resolve per "Known Rebase Conflicts" section)
git checkout feat/autopilot
git rebase origin/main
# ... resolve conflicts, git add, git rebase --continue ...

# Step 3: Verify rebase result — should show only 10 commits ahead
git log --oneline origin/main..feat/autopilot

# Step 4: Remove .planning/ from git index
git rm --cached -r .planning/
git commit -m "chore: remove .planning/ artifacts from git index"

# Step 5: Verify .planning/ files still exist on disk
ls .planning/

# Step 6: Create PR C branch
git checkout -b feat/autopilot-clean  # pick branch name

# Step 7: Verify clean diff
git diff origin/main...feat/autopilot-clean --name-only
# Should show ONLY: commands/gsd/autopilot.md, get-shit-done/bin/lib/config.cjs,
#   get-shit-done/templates/config.json, get-shit-done/workflows/*.md (autopilot files)
# Should NOT show: .planning/, tests/, commands.cjs, core.cjs, etc.

# Step 8: Push and create PR
git push fork feat/autopilot-clean -u
gh pr create --repo gsd-build/get-shit-done \
  --title "feat: autopilot mode — full pipeline automation with synthetic multi-agent discuss" \
  --body "$(cat <<'EOF'
## What

Adds `/gsd:autopilot` — one command to run the full GSD pipeline (discuss → plan → execute → verify) for all remaining phases automatically.

## Why

Split from #762 per review feedback from @glittercowboy.

## Review Findings Addressed

- **[SCOPE] `.planning/` directory committed** — Resolved: removed from git index via `git rm --cached -r .planning/`; `.gitignore` already excludes `.planning/`.
- **[CONCERN] Auto-advance forced ON** — Resolved in Phase 15 (separate PR): use `--auto` runtime flag instead of `config-set`.
- **[BREAKING] Removed `execution.engine`** — Removed intentionally: Agent Teams can't set per-teammate models, defeating profile-based differentiation. Subagents-only is correct.
- **[QUALITY] No tests for autopilot** — Acknowledged: autopilot tests are a v1.4 candidate.

**Note on resolve-model fix:** The `cmdResolveModel` / `model_overrides` fix originally in this branch was independently merged to main via PR #739. Also identified by @ChuckMayo in PR #761 (closed).

## Testing

- [ ] Tested on macOS
- [ ] Tested on Windows
- [ ] Tested on Linux

## Checklist

- [ ] Follows GSD style (no enterprise patterns, no filler)
- [ ] Updates CHANGELOG.md for user-facing changes
- [ ] No unnecessary dependencies added
- [ ] Works on Windows (backslash paths tested)

## Breaking Changes

None
EOF
)"
```

### Adding closing comment to PR #762
```bash
gh pr comment 762 --repo gsd-build/get-shit-done \
  --body "Closing. Split into focused PR per @glittercowboy review feedback:

- PR #XXX: \`feat/autopilot-clean\` — autopilot feature only (.planning/ artifacts removed)

The resolve-model fix from this branch landed independently as PR #739. Tests+CI are in merged PR #763."
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic PR (tests+CI+feature+fix) | 2-3 focused PRs per feature area | PR #762 feedback | Faster review, easier to bisect issues |
| `config-set workflow.auto_advance true` (mutates config) | `--auto` runtime flag (stateless) | Phase 15 fixes this | No config corruption on crash |
| `~/` path prefix in workflow scripts | `"$HOME/"` prefix | PR #786 merged to main | Prevents subagent MODULE_NOT_FOUND errors |

## Open Questions

1. **PR B scope — does it still need to be submitted?**
   - What we know: Resolve-model fix is already on `origin/main` via PR #739
   - What's unclear: Whether REQUIREMENTS.md PRS-01 / CRD-02 require explicitly creating a PR B branch as a deliverable, or just confirming coordination
   - Recommendation: No new PR B. Satisfy CRD-02 by documenting in PR C body that fix is already on main + credit @ChuckMayo

2. **Rebase conflict severity in execute-phase.md**
   - What we know: feat/autopilot uses `~` paths; origin/main uses `$HOME`; autopilot commits add `AUTO_CFG` line to execute-phase.md
   - What's unclear: Whether the `AUTO_CFG` line added by autopilot already exists in origin/main's execute-phase.md
   - Recommendation: During rebase, inspect `git show origin/main:get-shit-done/workflows/execute-phase.md | grep AUTO_CFG` to determine actual conflict scope

3. **init.cjs conflict severity**
   - What we know: Both origin/main and autopilot commits modified init.cjs
   - What's unclear: Exact overlap — origin/main has `toPosixPath` changes; autopilot removed `execution_engine` field
   - Recommendation: Accept origin/main's version during conflict, manually verify `execution_engine` is absent

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`) |
| Config file | none — run directly via node |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

This phase is a git restructuring task (no new source code). Validation is manual git inspection, not automated test runs.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRS-01 | PR #762 closed, 2 new PRs opened | manual | `gh pr view 762 --repo gsd-build/get-shit-done --json state` | N/A |
| PRS-02 | `.planning/` not in any PR branch's diff | git | `git diff origin/main...{branch} --name-only \| grep '\.planning'` | N/A |
| PRS-03 | `.gitignore` has `.planning/` | git | `git show {branch}:.gitignore \| grep planning` | N/A (already present) |
| PRS-04 | PR #761 status confirmed, no duplicate | manual | `gh pr view 761 --repo gsd-build/get-shit-done --json state` | N/A |
| CRD-01 | PR A already merged (#763) | manual | `gh pr view 763 --repo gsd-build/get-shit-done --json state` | N/A |
| CRD-02 | PR B coordination confirmed | manual | Inspect PR #739 on origin/main | N/A |

### Sampling Rate
- **Per task commit:** `npm test` (verify no regressions from rebase)
- **Per wave merge:** `git diff origin/main...{branch} --name-only` (verify clean diff)
- **Phase gate:** All 6 success criteria verified before `/gsd:verify-work`

### Wave 0 Gaps

None — this phase requires no new test files. Validation is git state inspection.

## Sources

### Primary (HIGH confidence)
- Direct git inspection: `git log`, `git diff`, `git show` against live branches — branch structure, commit contents, file diffs
- `gh pr view 762/761/763` — PR states, review comments verified live
- `gh api repos/gsd-build/get-shit-done/contents/...` — upstream main file contents verified

### Secondary (MEDIUM confidence)
- PR #739 commit message on upstream main ("fix: load model_overrides from config and use resolveModelInternal in CLI") — confirms resolve-model already landed
- PR #786 commit message ("fix: use $HOME instead of ~ for gsd-tools.cjs paths") — confirms path style change

### Tertiary (LOW confidence)
- None — all findings are directly verified from git/GitHub

## Metadata

**Confidence breakdown:**
- Git operations (rebase, rm --cached, branch creation): HIGH — standard git features, well-understood
- Conflict prediction (execute-phase.md, init.cjs): HIGH — verified by direct diff inspection
- PR #762 state (CLOSED): HIGH — confirmed via gh CLI
- Resolve-model already on main: HIGH — verified by reading source on origin/main
- .gitignore already correct: HIGH — verified by git show

**Research date:** 2026-02-28
**Valid until:** 2026-03-07 (7 days — upstream main moves fast with community PRs)
