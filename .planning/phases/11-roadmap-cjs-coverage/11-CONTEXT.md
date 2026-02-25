# Phase 11: roadmap.cjs Coverage - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Test roadmap.cjs parsing and analysis branches to reach 75%+ line coverage. Cover edge-case inputs, malformed markdown handling, missing sections, and write operations. The module already exists — this phase writes tests, not features.

</domain>

<decisions>
## Implementation Decisions

### Edge case inputs
- Test full spectrum of partial states: empty file, file with just a title, phases with no success criteria, phases with no requirements
- Parser returns what it finds — numbering gaps (e.g., Phase 3 jumps to Phase 5) are not errors, just return existing phases
- Test reasonable formatting variations: extra whitespace, missing bold markers on Goal/Requirements, tab vs spaces — not adversarial fuzzing
- Fix bugs found during testing — test expected/correct behavior (carried from Phase 10)

### Error recovery behavior
- Missing phase requests return structured `{ found: false }` — not null, not throw
- Missing ROADMAP.md file returns safe default (empty result, no phases) — let caller handle
- Assert deterministic ordering — phases come back in file order, same input always produces same output

### Test consistency with Phase 10
- Test file named `roadmap.test.cjs` — matches module name, consistent with existing convention
- Each test file owns its own fixtures (temp dir with fixture ROADMAP.md files) — self-contained, no cross-test dependencies
- Test both read operations (get-phase, analyze) AND write operations (update-plan-progress) — full module coverage
- Pattern matching assertions (not exact text) — carried from Phase 10

### Claude's Discretion
- CLI spawn vs direct require() — decide per function based on what's exposed via CLI vs internal-only
- Decimal phase parsing coverage — add tests if not already covered
- Missing success criteria handling — check current behavior and test accordingly
- Exact fixture content for each edge case scenario

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-roadmap-cjs-coverage*
*Context gathered: 2026-02-25*
