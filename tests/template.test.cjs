/**
 * GSD Tools Tests - Template
 *
 * Tests for cmdTemplateSelect and cmdTemplateFill via CLI.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// ─── template select ─────────────────────────────────────────────────────────

describe('template select', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('minimal plan — 2 tasks, 2 file paths, no decisions', () => {
    const planPath = path.join(tmpDir, '.planning', 'test-plan.md');
    fs.writeFileSync(planPath, [
      '# Plan',
      '',
      '### Task 1',
      'Edit `src/utils/helper.ts`',
      '',
      '### Task 2',
      'Edit `src/utils/format.ts`',
    ].join('\n'));

    const result = runGsdTools(['template', 'select', '.planning/test-plan.md'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.type, 'minimal');
    assert.strictEqual(output.taskCount, 2);
    assert.strictEqual(output.hasDecisions, false);
  });

  test('complex plan — has decision keyword', () => {
    const planPath = path.join(tmpDir, '.planning', 'test-plan.md');
    fs.writeFileSync(planPath, [
      '# Plan',
      '',
      '### Task 1',
      'Build the foundation',
      '',
      '### Task 2',
      'Add API layer',
      '',
      '### Task 3',
      'Key decision: use REST over GraphQL',
      'Edit `src/api/routes.ts`',
      'Edit `src/api/handler.ts`',
      'Edit `src/api/middleware.ts`',
      'Edit `src/api/types.ts`',
    ].join('\n'));

    const result = runGsdTools(['template', 'select', '.planning/test-plan.md'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.type, 'complex');
    assert.strictEqual(output.hasDecisions, true);
  });

  test('complex plan — many file paths (>6)', () => {
    const planPath = path.join(tmpDir, '.planning', 'test-plan.md');
    fs.writeFileSync(planPath, [
      '# Plan',
      '',
      '### Task 1',
      'Files: `src/a/one.ts`, `src/b/two.ts`, `src/c/three.ts`',
      '`src/d/four.ts`, `src/e/five.ts`, `src/f/six.ts`, `src/g/seven.ts`',
    ].join('\n'));

    const result = runGsdTools(['template', 'select', '.planning/test-plan.md'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.type, 'complex');
    assert.ok(output.fileCount > 6, `Expected >6 files, got ${output.fileCount}`);
  });

  test('complex plan — many tasks (>5)', () => {
    const planPath = path.join(tmpDir, '.planning', 'test-plan.md');
    fs.writeFileSync(planPath, [
      '# Plan',
      '',
      '### Task 1', 'Do thing 1',
      '### Task 2', 'Do thing 2',
      '### Task 3', 'Do thing 3',
      '### Task 4', 'Do thing 4',
      '### Task 5', 'Do thing 5',
      '### Task 6', 'Do thing 6',
    ].join('\n'));

    const result = runGsdTools(['template', 'select', '.planning/test-plan.md'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.type, 'complex');
    assert.strictEqual(output.taskCount, 6);
  });

  test('standard plan — middle ground (3 tasks, 4 files, no decisions)', () => {
    const planPath = path.join(tmpDir, '.planning', 'test-plan.md');
    fs.writeFileSync(planPath, [
      '# Plan',
      '',
      '### Task 1',
      'Edit `src/api/routes.ts` and `src/api/handler.ts`',
      '',
      '### Task 2',
      'Edit `src/db/schema.ts`',
      '',
      '### Task 3',
      'Edit `src/db/queries.ts`',
    ].join('\n'));

    const result = runGsdTools(['template', 'select', '.planning/test-plan.md'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.type, 'standard');
    assert.strictEqual(output.taskCount, 3);
    assert.strictEqual(output.fileCount, 4);
    assert.strictEqual(output.hasDecisions, false);
  });

  test('missing plan file — graceful fallback to standard', () => {
    const result = runGsdTools(['template', 'select', '.planning/nonexistent.md'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.type, 'standard');
    assert.ok(output.error, 'error should be truthy on missing file');
  });
});

// ─── template fill ───────────────────────────────────────────────────────────

describe('template fill', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Create a phase directory so fill commands can find it
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates summary with frontmatter and phase field', () => {
    const result = runGsdTools(['template', 'fill', 'summary', '--phase', '1'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);
    assert.strictEqual(output.template, 'summary');
    assert.ok(output.path.includes('01-01-SUMMARY.md'), `Expected path with 01-01-SUMMARY.md, got ${output.path}`);

    // Verify file content
    const content = fs.readFileSync(path.join(tmpDir, output.path), 'utf-8');
    assert.ok(content.startsWith('---'), 'should start with frontmatter delimiter');
    assert.ok(content.includes('phase:'), 'should contain phase field');
  });

  test('file-exists guard prevents overwrite', () => {
    // Create the file first
    runGsdTools(['template', 'fill', 'summary', '--phase', '1'], tmpDir);

    // Try to create it again
    const result = runGsdTools(['template', 'fill', 'summary', '--phase', '1'], tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, 'should have error field');
    assert.ok(output.error.includes('already exists'), `Expected "already exists" in error, got: ${output.error}`);
  });

  test('custom plan number produces correct filename', () => {
    const result = runGsdTools(['template', 'fill', 'summary', '--phase', '1', '--plan', '03'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.path.includes('01-03-SUMMARY.md'), `Expected 01-03-SUMMARY.md, got ${output.path}`);
  });

  test('creates plan with wave frontmatter', () => {
    const result = runGsdTools(['template', 'fill', 'plan', '--phase', '1'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);
    assert.ok(output.path.includes('01-01-PLAN.md'), `Expected 01-01-PLAN.md, got ${output.path}`);

    const content = fs.readFileSync(path.join(tmpDir, output.path), 'utf-8');
    assert.ok(content.includes('wave:'), 'plan should contain wave frontmatter');
  });

  test('plan with --wave flag sets correct value', () => {
    const result = runGsdTools(['template', 'fill', 'plan', '--phase', '1', '--wave', '2'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'), 'utf-8'
    );
    assert.ok(content.includes('wave: 2'), `Expected wave: 2 in frontmatter, got:\n${content.split('---')[1]}`);
  });

  test('creates verification with tables', () => {
    const result = runGsdTools(['template', 'fill', 'verification', '--phase', '1'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);
    assert.ok(output.path.includes('01-VERIFICATION.md'), `Expected 01-VERIFICATION.md, got ${output.path}`);

    const content = fs.readFileSync(path.join(tmpDir, output.path), 'utf-8');
    assert.ok(content.includes('| # | Truth'), 'should contain Observable Truths table');
    assert.ok(content.includes('| Artifact |'), 'should contain Required Artifacts table');
  });

  test('unknown phase returns error', () => {
    const result = runGsdTools(['template', 'fill', 'summary', '--phase', '99'], tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, 'should have error field');
    assert.ok(output.error.includes('Phase not found'), `Expected "Phase not found", got: ${output.error}`);
  });

  test('unknown template type exits with error', () => {
    const result = runGsdTools(['template', 'fill', 'bogus', '--phase', '1'], tmpDir);
    assert.strictEqual(result.success, false, 'should fail for unknown type');
  });
});
