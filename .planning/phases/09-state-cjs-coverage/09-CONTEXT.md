# Phase 9: state.cjs Coverage - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring state.cjs from 40% to 75%+ line coverage by testing all state management functions across 6 requirement groups (STATE-01 through STATE-06). Existing state.test.cjs has 12 tests covering state-snapshot and add-decision/add-blocker mutations — new tests extend coverage to helper functions, load/get commands, patch/update commands, advance-plan, metrics/progress, and resolve-blocker/record-session.

</domain>

<decisions>
## Implementation Decisions

### Fixture & isolation strategy
- Use real temp directories via `createTempProject()` for all filesystem operations — consistent with Phase 7 and 8 test suite patterns
- Use realistic STATE.md fixtures with full document structure (multiple sections, headings, fields) rather than minimal stubs — catches parsing issues with surrounding content
- Each test gets its own temp dir via beforeEach/afterEach lifecycle

### Mutation verification approach
- Read-after-write verification for all mutation commands: call the mutation, then read STATE.md back and assert specific fields changed while other fields/sections stayed intact
- This ensures mutations don't corrupt surrounding content (as caught by the existing dollar-amount preservation tests)

### Claude's Discretion
- **Test plan grouping**: How to split 6 requirements into plan files (2-3 plans). Claude assesses function complexity and test dependencies to determine optimal grouping
- **File layout**: Whether new tests extend state.test.cjs or create separate files — Claude picks based on existing codebase conventions
- **Edge case depth per function**: Claude assesses which functions have risky edge cases (malformed content, missing sections, empty files) and tests those proportionally. Focus coverage where it matters most rather than covering every catch block
- **Helper vs command testing balance**: For stateExtractField/stateReplaceField, Claude decides whether to test as unit functions or through the commands that use them
- **STATE.md fixture complexity**: Claude decides how many sections/fields each fixture needs based on what the function under test actually parses
- **Plan execution order and dependencies**: Claude picks based on what makes tests most maintainable

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User trusts Claude's judgment on all technical decisions for this test coverage phase. The established patterns from Phase 8 (temp dirs, realistic fixtures, read-after-write verification) provide sufficient precedent.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-state-cjs-coverage*
*Context gathered: 2026-02-25*
