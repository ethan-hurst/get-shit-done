# Phase 6: CI Pipeline - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

GitHub Actions workflow that runs the full test suite on every push and PR to main, across a 3-OS x 3-Node version matrix (9 jobs total). Coverage reporting, linting, and deployment are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Caching & performance
- Cache npm dependencies using setup-node built-in caching
- Use concurrency groups to auto-cancel stale workflow runs on the same branch/PR
- 10-minute timeout per matrix job
- Use `npm ci` for deterministic, clean installs from lockfile

### Workflow triggers
- Push to main only (not all branches)
- PR to main (including draft PRs)
- Manual dispatch via `workflow_dispatch` for ad-hoc runs
- No path filtering — run CI on every qualifying push regardless of file types

### Failure handling
- Fail-fast enabled — cancel remaining matrix jobs on first failure
- No artifact uploads — test output visible in job logs
- Required status checks — failing CI blocks PR merges (requires branch protection rule)
- Test command: `npm test`

### Workflow identity
- Workflow name in Actions UI: "Tests"
- File: `.github/workflows/test.yml`
- Add CI status badge to README

### Claude's Discretion
- Exact checkout and setup-node action versions
- Concurrency group naming convention
- Badge placement in README
- Any OS-specific test configuration nuances

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The workflow should follow GitHub Actions best practices for Node.js projects.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-ci-pipeline*
*Context gathered: 2026-02-25*
