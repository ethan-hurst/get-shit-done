# Phase 4: config.cjs + template.cjs Tests - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Test config.cjs (3 exports: cmdConfigEnsureSection, cmdConfigSet, cmdConfigGet) and template.cjs (2 exports: cmdTemplateSelect, cmdTemplateFill) via CLI integration tests. All tests run through `gsd-tools.cjs` via execSync, consistent with phases 1-3.

</domain>

<decisions>
## Implementation Decisions

### Heuristic boundary testing
- Test template selection at exact boundary values (not just representative cases)
- Isolate each signal: separate tests for task-count-only, file-count-only, decisions-only, plus combined scenarios
- Test the fallback path: missing/unreadable plan file returns standard template
- All heuristic tests via CLI integration (execSync), not direct require()

### Environment-dependent config
- Test Brave Search file-based detection (create brave_api_key file in temp dir); skip env var testing
- Test user defaults merge: create temp defaults.json with overrides, verify they appear in generated config
- Test nested workflow merge specifically: override one workflow key, verify other workflow keys preserved
- Test value type coercion in config-set: 'true'→boolean, 'false'→boolean, '42'→number, 'hello'→string

### Template fill scope
- Test all three template types: summary, plan, and verification
- Extend createTempProject helper to include a ROADMAP.md with a test phase for template fill tests
- Test the file-already-exists guard: pre-create output file, verify fill returns error
- Test custom field merging via options.fields into frontmatter

### Error path coverage
- Test all documented config errors: missing key path, missing config.json, key-not-found in nested path
- Test auto-creation of nested objects via dot-notation (e.g., setting 'a.b.c' on empty config)
- Test both error styles: template fill rejects unknown types with error; template select falls back to standard gracefully
- Test config-ensure-section idempotency: second call returns {created: false, reason: 'already_exists'}

### Claude's Discretion
- Exact test file naming and describe/test structure
- How to mock the home directory for defaults.json and brave_api_key tests
- Whether to add a helper function or keep test setup inline
- Test ordering within files

</decisions>

<specifics>
## Specific Ideas

- Follow existing convention: CLI integration via `runGsdTools()` helper and `createTempProject()` for filesystem isolation
- Two separate test files: `config.test.cjs` and `template.test.cjs` (consistent with existing per-module test files)
- Template select thresholds from source: minimal (taskCount <= 2 && fileCount <= 3 && !hasDecisions), complex (hasDecisions || fileCount > 6 || taskCount > 5), standard (everything else)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-config-cjs-template-cjs-tests*
*Context gathered: 2026-02-25*
