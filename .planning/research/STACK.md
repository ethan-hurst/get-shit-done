# Stack Research

**Domain:** Git branch and PR management for decomposing a monolithic PR into focused PRs
**Researched:** 2026-02-28
**Confidence:** HIGH

## Context

This is a subsequent milestone (v1.3) addressing reviewer feedback on PR #762. The PR is monolithic: it bundles tests+CI, a resolve-model fix, the autopilot feature, and committed `.planning/` artifacts. The goal is to decompose it into focused PRs that reviewers can merge independently.

The constraint from PROJECT.md applies: "Not our repo — We're contributing PRs, not merging directly." This means we push to `fork/` remotes and open PRs against `origin/main`.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `git cherry-pick` | Built-in | Selectively apply specific commits to new branches | Best tool when source commits are already clean; no new branch history needed |
| `git checkout <branch> -- <file>` | Built-in | Bring specific files from a branch into the current branch without cherry-picking | Best tool when commits are mixed (one commit has multiple concerns); extract only the files you need |
| `git rm --cached -r <path>` | Built-in | Remove committed files from index/tracking without deleting them locally | Removes `.planning/` artifacts from branch without losing local files |
| `git rebase --onto` | Built-in | Transplant a range of commits onto a new base | Best tool when commits are sequential and cleanly separated |
| `git log --oneline <branch> ^<base>` | Built-in | Enumerate commits that need to be split | Planning step — understand what commits exist before operating |
| GitHub PR (gh CLI) | Current | Open PRs against upstream from fork branches | `gh pr create --repo org/repo` to target upstream, not fork |

### Supporting Techniques

| Technique | Purpose | When to Use |
|-----------|---------|-------------|
| Branch-from-base pattern | Create each sub-PR branch from `origin/main`, not from the monolithic branch | Always — prevents sub-PRs from carrying unrelated changes |
| `git diff --name-only <base> <branch>` | Identify what changed in the monolithic PR | Planning step before splitting |
| `git show --stat <commit>` | Understand what each commit touched | Planning step to decide which cherry-pick strategy to use |
| `git stash` | Preserve uncommitted local work during branch surgery | When you need to switch branches mid-operation |
| `.gitignore` entry | Prevent `.planning/` from being committed in future | Add `**/.planning/` to `.gitignore` if it isn't already |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `gh` CLI | Create PRs against upstream from fork | Use `gh pr create --repo gsd-build/get-shit-done --head ethan-hurst:branch-name` |
| `git log --graph --oneline` | Verify branch topology before pushing | Sanity check that branch base is `origin/main`, not the monolithic branch |

## Installation

```bash
# No installation required — git and gh are already present
# Verify gh is authenticated:
gh auth status
```

## Strategies for This Specific Split

The fork has 3 commits on `fork/feat/autopilot` vs `origin/main`:

1. `b0aa9fc` — feat: add autopilot mode + Agent Teams execution engine (9 files)
2. `8850ebf` — refactor: remove Agent Teams engine, simplify to subagents-only
3. `000163a` — refactor: remove dead execution section, consolidate to autopilot config

The target split is 3 focused PRs:

### PR A: Tests + CI (from `fork/feat/coverage-hardening`)

This already exists as a separate branch. No splitting needed — just open a PR from it.

```bash
# Branch already exists at fork/feat/coverage-hardening
# Verify it contains only test files and CI changes:
git diff --name-only origin/main fork/feat/coverage-hardening

# Open PR against upstream:
gh pr create --repo gsd-build/get-shit-done \
  --head ethan-hurst:feat/coverage-hardening \
  --title "test: add full test suite with CI pipeline (433 tests, 94% coverage)"
```

### PR B: resolve-model Fix (coordinates with PR #761)

The fix already exists on `fork/fix/load-model-overrides-from-config`. This may conflict with PR #761 — check before submitting.

```bash
# Branch already exists at fork/fix/load-model-overrides-from-config
git diff --name-only origin/main fork/fix/load-model-overrides-from-config

# Check for overlap with PR #761's files:
# If no conflict, open PR:
gh pr create --repo gsd-build/get-shit-done \
  --head ethan-hurst:fix/load-model-overrides-from-config \
  --title "fix: load model_overrides from config and use resolveModelInternal in CLI"
```

### PR C: Autopilot Feature (clean, without artifacts)

The autopilot commits include `.planning/` artifacts committed to the branch. Create a clean branch that cherry-picks only the feature files.

```bash
# Step 1: Create clean branch from origin/main
git checkout -b feat/autopilot-clean origin/main

# Step 2: Cherry-pick the 3 autopilot commits
git cherry-pick b0aa9fc  # autopilot feature
git cherry-pick 8850ebf  # remove Agent Teams
git cherry-pick 000163a  # remove dead execution section

# Step 3: Remove any .planning/ artifacts that got pulled in
git rm --cached -r .planning/ 2>/dev/null || true
echo '.planning/' >> .gitignore  # if not already ignored
git add .gitignore
git commit --amend --no-edit  # or: git commit -m "chore: remove .planning artifacts"

# Step 4: Verify only intended files are present
git diff --name-only origin/main feat/autopilot-clean

# Step 5: Push and open PR
git push fork feat/autopilot-clean
gh pr create --repo gsd-build/get-shit-done \
  --head ethan-hurst:feat/autopilot-clean \
  --title "feat: add /gsd:autopilot for fully automated pipeline execution"
```

**Alternative if cherry-pick has conflicts:** Use `git checkout <commit> -- <file>` to bring specific files without commit history:

```bash
git checkout -b feat/autopilot-clean origin/main

# Bring only the autopilot-related files from the monolithic branch
git checkout fork/feat/autopilot -- commands/gsd/autopilot.md
git checkout fork/feat/autopilot -- get-shit-done/workflows/auto-discuss.md
git checkout fork/feat/autopilot -- get-shit-done/workflows/autopilot.md
git checkout fork/feat/autopilot -- get-shit-done/workflows/execute-phase.md
git checkout fork/feat/autopilot -- get-shit-done/workflows/progress.md
git checkout fork/feat/autopilot -- get-shit-done/workflows/settings.md
git checkout fork/feat/autopilot -- get-shit-done/bin/lib/config.cjs
git checkout fork/feat/autopilot -- get-shit-done/templates/config.json

# Do NOT bring: .planning/ files, tests/, .github/, package*.json
git commit -m "feat: add /gsd:autopilot for fully automated pipeline execution"
```

## Runtime Flag Pattern (for auto-advance fix)

The review flagged that `autopilot.md` mutates `config.json` to set `workflow.auto_advance true` and then sets it back to `false` after the run. This persists state to disk, which is a side effect if the run is interrupted.

**Pattern to fix this:** Pass `AUTO_ADVANCE` as an environment variable or shell argument instead of persisting to config.

**Current (mutates config.json):**
```bash
# autopilot.md start
node gsd-tools.cjs config-set workflow.auto_advance true

# ... phases run ...

# autopilot.md end
node gsd-tools.cjs config-set workflow.auto_advance false
```

**Fixed (runtime flag, no persistence):**
```bash
# Pass flag as environment variable
AUTO_ADVANCE=true node gsd-tools.cjs execute-phase ...

# Or pass as CLI argument that execute-phase reads from args, not config
node gsd-tools.cjs execute-phase --auto-advance ...
```

**In `execute-phase.md`:** Read from env/arg first, fall back to config:
```bash
# Read auto_advance: env var takes priority over config
AUTO_CFG="${AUTO_ADVANCE:-$(node gsd-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo false)}"
```

This ensures `config.json` is never mutated during an autopilot run — it stays as the user left it.

**Confidence: HIGH** — This is the standard Unix pattern: environment variables override config files for session-scoped behavior. No new dependencies, no new config keys.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `git cherry-pick` per commit | `git rebase --onto` | Use rebase --onto when commits are sequential AND don't need file-level filtering |
| `git checkout <commit> -- <file>` | Interactive rebase + `git add -p` | Use interactive rebase when commits need to be re-split at hunk level (more complex) |
| New branch from `origin/main` | Amend the existing branch | Only amend existing branch when it's not yet published OR reviewer explicitly asks for force-push |
| Environment variable for runtime flag | New config key `autopilot.running` | Env var is session-scoped (no persistence risk), config key would require cleanup on crash |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `git filter-branch` | Deprecated, slow, dangerous for shared branches | `git rm --cached` for removing tracked files; BFG for history rewriting |
| `git push --force` to a branch with an open PR | Rewrites history reviewers may have fetched; confusing diffs in PR timeline | Push to a NEW branch, open a NEW PR |
| `git rebase -i` on published branches | Same issue — force-push required after | New branch + cherry-pick |
| Graphite CLI / git-multi-pr | External tooling, not available everywhere | Native git cherry-pick + gh CLI |
| Mutating `config.json` for runtime state | Leaves dirty state if process is interrupted; user's config is corrupted | Environment variables for session-scoped flags |
| `git add .` or `git add -A` when cleaning artifacts | Risk of accidentally re-adding files from adjacent directories | `git rm --cached -r .planning/` explicitly, then `git add` specific files |

## Stack Patterns by Variant

**If commits are clean and single-concern (each commit touches only one logical change):**
- Use `git cherry-pick <hash>` per commit
- This is the simplest path — no file-level surgery needed

**If commits are mixed-concern (one commit touches feature files AND test files AND artifacts):**
- Use `git checkout <branch> -- <specific-file>` to bring only the files you want
- Build the new branch file-by-file, then commit once

**If the PR has no clean commits (everything in one giant commit):**
- Use `git checkout <branch> -- <file>` for each file group
- Commit groups separately on the new branch
- This gives reviewers a meaningful commit history

**If a sub-PR conflicts with another open PR (e.g., PR #761):**
- Wait for the other PR to merge first, then rebase your branch onto the updated base
- OR communicate with the maintainer to sequence the merges
- Do NOT attempt to manually merge the two PRs' changes together

## Removing .planning/ Artifacts

The monolithic PR has committed `.planning/` dev artifacts. To clean them:

```bash
# On the branch that has the artifacts:
git rm --cached -r .planning/
git commit -m "chore: remove .planning dev artifacts from branch"

# Then add .planning/ to .gitignore to prevent recurrence:
echo '.planning/' >> .gitignore
git add .gitignore
git commit -m "chore: gitignore .planning artifacts"
```

This removes the files from tracking without deleting them locally — they stay in your working directory but won't appear in the PR diff.

## Version Compatibility

| Technique | Git Version | Notes |
|-----------|-------------|-------|
| `git cherry-pick` | Any modern git | Available in git 1.7+ |
| `git checkout <branch> -- <file>` | Any modern git | Long-standing feature |
| `git rm --cached -r` | Any modern git | Standard since git 1.0 |
| `gh pr create --repo` | gh 2.x+ | Targets upstream repo from fork |

## Sources

- [Git Official Docs: git-rm](https://git-scm.com/docs/git-rm) — `--cached` flag behavior, recursive removal (HIGH confidence)
- [Graphite: How to split a PR](https://graphite.com/guides/how-to-split-a-pull-request-into-multiple-prs) — Strategy overview: cherry-pick, checkout-file, branch-from-base (MEDIUM confidence)
- [GitHub Gist: Split large PR into two](https://gist.github.com/loilo/930f141d9acf89e9e734ffa042acd750) — `git rebase --onto` and `cherry-pick` concrete commands (HIGH confidence)
- GSD codebase — `fork/feat/coverage-hardening` and `fork/feat/autopilot` branch inspection (HIGH confidence — direct observation)
- Unix environment variable pattern — session-scoped config override via `$ENV_VAR` (HIGH confidence — standard Unix practice)

---
*Stack research for: git PR decomposition and runtime config patterns*
*Researched: 2026-02-28*
