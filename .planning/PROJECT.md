# get-shit-done

## What This Is

An open-source npm package that orchestrates AI coding agents for software development workflows. Development includes both the core tool (agent orchestration, workflow routing, config management) and its test infrastructure (433 tests, 94.01% coverage, CI pipeline).

## Core Value

Reliable AI agent orchestration with quality gates that catch bad plans before execution burns context. Every module has tests that catch regressions before they reach users.

## Requirements

### Validated

- ✓ Node.js built-in `node:test` + `node:assert` test framework — v1.0
- ✓ CLI integration test pattern via `execSync` with temp directory isolation — v1.0
- ✓ Test helpers (`createTempProject`, `runGsdTools`, `cleanup`, `createTempGitProject`) — v1.0
- ✓ Tests for all 11 modules: phase, state, commands, init, roadmap, core, frontmatter, verify, config, template, milestone — v1.0
- ✓ 355 tests passing, 0 failures — v1.0
- ✓ 4 regression tests (REG-01 through REG-04) — v1.0
- ✓ GitHub Actions CI pipeline with 3x3 OS/Node matrix — v1.0
- ✓ commands.cjs from 59% to 88.86% line coverage — v1.1
- ✓ init.cjs from 42% to 98.59% line coverage — v1.1
- ✓ state.cjs from 40% to 96.16% line coverage — v1.1
- ✓ gsd-tools.cjs dispatcher from 76% to 94.35% line coverage — v1.1
- ✓ roadmap.cjs from 71% to 99.32% line coverage — v1.1
- ✓ c8 devDependency with `npm run test:coverage` script — v1.1
- ✓ Coverage thresholds enforced in CI (fail if any module drops below 70%) — v1.1
- ✓ VERIFICATION.md audit trail for each coverage phase — v1.1

### Active (v2.0 — MoE Panels)

- MoE panel infrastructure: 3 config keys (`plan_check_panel`, `verifier_panel`, `research_panel`), all default `false`
- Plan Checker Panel: 3 parallel specialists (Structural, Semantic, Compliance) with consensus logic
- Verifier Panel: 3 domain specialists (Artifacts, Requirements, Human) with domain-partitioned assembly
- Research Panel: 3 domain researchers (Stack, Architecture, Pitfalls) with inline synthesis
- Workflow routing: conditional panel dispatch based on config keys
- Output contract preservation: panel output identical to single-agent output (same headers, frontmatter, patterns)

*Full requirements in `.planning/REQUIREMENTS.md` (pending creation)*

### Out of Scope

- Changing user-facing commands or output formats
- Performance/benchmark testing — not needed at current scale
- TypeScript migration — different milestone entirely
- Performance tests for large ROADMAP.md files (PERF-01) — future candidate
- Windows-specific path separator tests (WIN-01) — future candidate
- Windows CRLF line ending handling tests (CRLF-01) — future candidate

## Current Milestone: v2.0 — MoE Panels

**Phase:** Defining requirements (research pending)
**Starting phase:** 14 (continuing from v1.1's Phase 13)

Adds Mixture of Experts panels for the three highest-variance quality gates: plan checking, verification, and phase research. Each panel replaces a single-agent step with 3 parallel specialists, improving coverage without changing user-facing commands or output formats.

## Current State

Shipped v1.1 with 433 tests, 94.01% overall line coverage, all 11 modules above 70%. Coverage is enforced in CI on every PR. All requirements have VERIFICATION.md audit trails.

- **Test count:** 433
- **Overall coverage:** 94.01% line coverage
- **Lowest module:** commands.cjs at 88.86% (target: 75%)
- **CI matrix:** Ubuntu, macOS, Windows × Node 18, 20, 22 (9 jobs)
- **Coverage enforcement:** c8 v11 on Node 20+; plain `npm test` on Node 18

Known bugs documented and tested (tests assert current behavior, production code not modified):
- `getRoadmapPhaseInternal` goal regex format mismatch (`**Goal:**` vs `**Goal**:`)
- `verify.cjs:82` — `content.search()` returns -1 handled by guard
- `frontmatter.cjs` — comma splitting doesn't handle quoted values (REG-04 documents limitation)
- `commands.cjs` — all git errors treated as "nothing to commit"

**Codebase map:** `.planning/codebase/` (7 documents, analyzed 2026-02-25)

## Constraints

- **No new dependencies** (except c8 as devDependency): Follow existing lightweight convention
- **Backwards compatible**: Panel config keys default `false` — existing behavior unchanged
- **Output contract preservation**: Panel output must be identical to single-agent output
- **Existing patterns**: Tests use `node:test` + `node:assert`, CLI integration via `execSync`, temp directories
- **Cross-platform**: Tests must work on macOS, Linux, and Windows (CI matrix)
- **Not our repo**: We're contributing PRs, not merging directly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use node:test (no Jest/Vitest) | Match existing convention, zero dependencies | ✓ Good — 433 tests, fast execution |
| Integration tests for cmd* functions | process.exit() in output/error prevents direct require() | ✓ Good — consistent pattern across all modules |
| Unit tests for pure functions | comparePhaseNum, extractFrontmatter etc. can be require()'d directly | ✓ Good — faster, more granular |
| One PR per module | Keeps reviews focused, allows parallel submission | ✓ Good — each phase is an independent PR |
| createTempGitProject helper | Git-dependent tests need isolated repos with config | ✓ Good — used by verify-summary and verify-commits |
| Concurrency groups in CI | Cancel stale runs on same branch using head_ref \|\| run_id | ✓ Good — prevents queue buildup |
| c8 for coverage (not nyc) | Works natively with node:test via V8 coverage | ✓ Good — 94.01% overall, clean per-file report |
| Node 18 skip for c8 v11 | c8 v11 declares engines Node 20+, Node 18 EOL April 2025 | ✓ Good — CI stable, plain npm test still runs on Node 18 |
| VERIFICATION.md per coverage phase | Audit trail for orphaned requirements found in milestone audit | ✓ Good — all requirements now have 3-source verification |

---
*Last updated: 2026-02-26 — v2.0 MoE Panels milestone started*
