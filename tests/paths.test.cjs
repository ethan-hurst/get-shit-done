/**
 * GSD Tools Tests - paths.cjs
 *
 * Tests for resolvePlanningPaths, setMilestoneOverride, and milestone CLI commands.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

const {
  resolvePlanningPaths,
  setMilestoneOverride,
  getMilestoneOverride,
} = require('../get-shit-done/bin/lib/paths.cjs');

// ─── resolvePlanningPaths — legacy mode ─────────────────────────────────────

describe('resolvePlanningPaths — legacy mode', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    setMilestoneOverride(null);
  });

  afterEach(() => {
    setMilestoneOverride(null);
    cleanup(tmpDir);
  });

  test('returns .planning/STATE.md for rel.state when no ACTIVE_MILESTONE', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.strictEqual(p.rel.state, '.planning/STATE.md');
  });

  test('isMultiMilestone is false', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.strictEqual(p.isMultiMilestone, false);
  });

  test('milestone is null', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.strictEqual(p.milestone, null);
  });

  test('abs.state ends with .planning/STATE.md', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.ok(p.abs.state.endsWith(path.join('.planning', 'STATE.md')),
      `expected abs.state to end with .planning/STATE.md, got ${p.abs.state}`);
  });

  test('global.abs.project ends with .planning/PROJECT.md', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.ok(p.global.abs.project.endsWith(path.join('.planning', 'PROJECT.md')),
      `expected global.abs.project to end with .planning/PROJECT.md, got ${p.global.abs.project}`);
  });
});

// ─── resolvePlanningPaths — multi-milestone mode ────────────────────────────

describe('resolvePlanningPaths — multi-milestone mode', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    setMilestoneOverride(null);
    // Create ACTIVE_MILESTONE file with content "v2.0"
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ACTIVE_MILESTONE'), 'v2.0', 'utf-8');
  });

  afterEach(() => {
    setMilestoneOverride(null);
    cleanup(tmpDir);
  });

  test('returns .planning/milestones/v2.0/STATE.md for rel.state', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.strictEqual(p.rel.state, '.planning/milestones/v2.0/STATE.md');
  });

  test('isMultiMilestone is true', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.strictEqual(p.isMultiMilestone, true);
  });

  test('milestone is "v2.0"', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.strictEqual(p.milestone, 'v2.0');
  });

  test('abs.phases ends with .planning/milestones/v2.0/phases', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.ok(
      p.abs.phases.endsWith(path.join('.planning', 'milestones', 'v2.0', 'phases')),
      `expected abs.phases to end with .planning/milestones/v2.0/phases, got ${p.abs.phases}`
    );
  });

  test('global.abs.project still points to .planning/ root', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.ok(
      p.global.abs.project.endsWith(path.join('.planning', 'PROJECT.md')),
      `expected global.abs.project to end with .planning/PROJECT.md, got ${p.global.abs.project}`
    );
    // Should NOT contain milestones subpath
    assert.ok(
      !p.global.abs.project.includes('milestones'),
      'global.abs.project should not contain milestones'
    );
  });

  test('global.abs.milestones still points to .planning/ root', () => {
    const p = resolvePlanningPaths(tmpDir);
    assert.ok(
      p.global.abs.milestones.endsWith(path.join('.planning', 'MILESTONES.md')),
      `expected global.abs.milestones to end with .planning/MILESTONES.md, got ${p.global.abs.milestones}`
    );
  });
});

// ─── resolvePlanningPaths — explicit override ───────────────────────────────

describe('resolvePlanningPaths — explicit override', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    setMilestoneOverride(null);
  });

  afterEach(() => {
    setMilestoneOverride(null);
    cleanup(tmpDir);
  });

  test('milestoneOverride="hotfix" returns milestone-scoped paths regardless of ACTIVE_MILESTONE', () => {
    // Write a different ACTIVE_MILESTONE to prove override takes precedence
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ACTIVE_MILESTONE'), 'v2.0', 'utf-8');

    const p = resolvePlanningPaths(tmpDir, 'hotfix');
    assert.strictEqual(p.rel.state, '.planning/milestones/hotfix/STATE.md');
    assert.strictEqual(p.milestone, 'hotfix');
    assert.strictEqual(p.isMultiMilestone, true);
  });

  test('milestoneOverride="hotfix" works when no ACTIVE_MILESTONE file exists', () => {
    const p = resolvePlanningPaths(tmpDir, 'hotfix');
    assert.strictEqual(p.rel.state, '.planning/milestones/hotfix/STATE.md');
    assert.strictEqual(p.milestone, 'hotfix');
    assert.strictEqual(p.isMultiMilestone, true);
  });
});

// ─── setMilestoneOverride ───────────────────────────────────────────────────

describe('setMilestoneOverride', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    setMilestoneOverride(null);
  });

  afterEach(() => {
    setMilestoneOverride(null);
    cleanup(tmpDir);
  });

  test('setting override causes resolvePlanningPaths to return milestone-scoped paths', () => {
    setMilestoneOverride('v3.0');
    const p = resolvePlanningPaths(tmpDir);
    assert.strictEqual(p.milestone, 'v3.0');
    assert.strictEqual(p.isMultiMilestone, true);
    assert.strictEqual(p.rel.state, '.planning/milestones/v3.0/STATE.md');
    setMilestoneOverride(null);
  });

  test('clearing override restores legacy paths', () => {
    setMilestoneOverride('v3.0');
    const p1 = resolvePlanningPaths(tmpDir);
    assert.strictEqual(p1.milestone, 'v3.0');

    setMilestoneOverride(null);
    const p2 = resolvePlanningPaths(tmpDir);
    assert.strictEqual(p2.milestone, null);
    assert.strictEqual(p2.isMultiMilestone, false);
    assert.strictEqual(p2.rel.state, '.planning/STATE.md');
  });

  test('getMilestoneOverride reflects current value', () => {
    assert.strictEqual(getMilestoneOverride(), null);
    setMilestoneOverride('v3.0');
    assert.strictEqual(getMilestoneOverride(), 'v3.0');
    setMilestoneOverride(null);
    assert.strictEqual(getMilestoneOverride(), null);
  });
});

// ─── milestone create command (via CLI) ─────────────────────────────────────

describe('milestone create command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates milestone directory with STATE.md, ROADMAP.md, config.json, phases/', () => {
    const result = runGsdTools('milestone create v2.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);
    assert.strictEqual(output.name, 'v2.0');

    const milestoneDir = path.join(tmpDir, '.planning', 'milestones', 'v2.0');
    assert.ok(fs.existsSync(path.join(milestoneDir, 'STATE.md')), 'STATE.md should exist');
    assert.ok(fs.existsSync(path.join(milestoneDir, 'ROADMAP.md')), 'ROADMAP.md should exist');
    assert.ok(fs.existsSync(path.join(milestoneDir, 'config.json')), 'config.json should exist');
    assert.ok(fs.existsSync(path.join(milestoneDir, 'phases')), 'phases/ should exist');
  });

  test('writes ACTIVE_MILESTONE file', () => {
    runGsdTools('milestone create v2.0', tmpDir);

    const activeMilestone = fs.readFileSync(
      path.join(tmpDir, '.planning', 'ACTIVE_MILESTONE'), 'utf-8'
    ).trim();
    assert.strictEqual(activeMilestone, 'v2.0');
  });
});

// ─── milestone switch command ───────────────────────────────────────────────

describe('milestone switch command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Create two milestones
    runGsdTools('milestone create v1.0', tmpDir);
    runGsdTools('milestone create v2.0', tmpDir);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('switches between milestones and updates ACTIVE_MILESTONE', () => {
    // After creating v2.0, it should be active
    let active = fs.readFileSync(
      path.join(tmpDir, '.planning', 'ACTIVE_MILESTONE'), 'utf-8'
    ).trim();
    assert.strictEqual(active, 'v2.0');

    // Switch to v1.0
    const result = runGsdTools('milestone switch v1.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.switched, true);
    assert.strictEqual(output.name, 'v1.0');

    active = fs.readFileSync(
      path.join(tmpDir, '.planning', 'ACTIVE_MILESTONE'), 'utf-8'
    ).trim();
    assert.strictEqual(active, 'v1.0');
  });

  test('switch back to second milestone', () => {
    runGsdTools('milestone switch v1.0', tmpDir);
    const result = runGsdTools('milestone switch v2.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const active = fs.readFileSync(
      path.join(tmpDir, '.planning', 'ACTIVE_MILESTONE'), 'utf-8'
    ).trim();
    assert.strictEqual(active, 'v2.0');
  });

  test('switch warns when current milestone has in-progress work', () => {
    // beforeEach already created v1.0 and v2.0; recreate to get fresh STATE.md
    runGsdTools('milestone create v1.0', tmpDir);

    // Set v1.0 STATE.md to have in-progress status
    const v1StatePath = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'STATE.md');
    let stateContent = fs.readFileSync(v1StatePath, 'utf-8');
    stateContent = stateContent.replace('**Status:** Ready to plan', '**Status:** Executing Phase 2');
    fs.writeFileSync(v1StatePath, stateContent);

    // Recreate second milestone (makes v2.0 active)
    runGsdTools('milestone create v2.0', tmpDir);

    // Switch back to v1.0 first (so v1.0 is active)
    runGsdTools('milestone switch v1.0', tmpDir);

    // Now set v1.0 to executing again and switch to v2.0
    stateContent = fs.readFileSync(v1StatePath, 'utf-8');
    stateContent = stateContent.replace(/\*\*Status:\*\*.*/, '**Status:** Executing Phase 3');
    fs.writeFileSync(v1StatePath, stateContent);

    const result = runGsdTools('milestone switch v2.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.switched, true);
    assert.strictEqual(output.has_in_progress, true);
    assert.strictEqual(output.previous_milestone, 'v1.0');
    assert.ok(output.previous_status.includes('Executing'));
  });

  test('switch has no warning when current milestone is idle', () => {
    // beforeEach created v1.0 then v2.0; v2.0 is active with "Ready to plan" status
    // Switch to v1.0: previous=v2.0 with "Ready to plan" — not in-progress
    const result = runGsdTools('milestone switch v1.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.switched, true);
    assert.strictEqual(output.has_in_progress, false);
    assert.strictEqual(output.previous_milestone, 'v2.0');
  });

  test('switch to same milestone has no in-progress warning', () => {
    // beforeEach created v1.0 then v2.0; v2.0 is active
    // Switch to v2.0 (same as current): previousMilestone === name, so no in-progress check
    const result = runGsdTools('milestone switch v2.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.switched, true);
    assert.strictEqual(output.has_in_progress, false);
  });
});

// ─── milestone list command ─────────────────────────────────────────────────

describe('milestone list command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    runGsdTools('milestone create v1.0', tmpDir);
    runGsdTools('milestone create v2.0', tmpDir);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('lists both milestones with correct active flag', () => {
    const result = runGsdTools('milestone list', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 2, 'should have 2 milestones');

    // Find milestones by name (note: may also include auto-migrated 'initial')
    const names = output.milestones.map(m => m.name);
    assert.ok(names.includes('v1.0'), 'v1.0 should be listed');
    assert.ok(names.includes('v2.0'), 'v2.0 should be listed');

    // v2.0 was created last, so it should be active
    const v2 = output.milestones.find(m => m.name === 'v2.0');
    assert.strictEqual(v2.active, true, 'v2.0 should be active');

    const v1 = output.milestones.find(m => m.name === 'v1.0');
    assert.strictEqual(v1.active, false, 'v1.0 should not be active');
  });
});

// ─── milestone status command ───────────────────────────────────────────────

describe('milestone status command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('reports legacy mode when no active milestone', () => {
    const result = runGsdTools('milestone status', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.active, null);
    assert.strictEqual(output.is_multi_milestone, false);
    assert.strictEqual(output.state_path, '.planning/STATE.md');
  });

  test('reports active milestone name when one is set', () => {
    runGsdTools('milestone create v2.0', tmpDir);

    const result = runGsdTools('milestone status', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.active, 'v2.0');
    assert.strictEqual(output.is_multi_milestone, true);
    assert.strictEqual(output.state_path, '.planning/milestones/v2.0/STATE.md');
  });
});

// ─── --milestone flag integration ───────────────────────────────────────────

describe('--milestone flag integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Create a milestone so the directory exists
    runGsdTools('milestone create v2.0', tmpDir);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('state load --milestone v2.0 reads from milestone-scoped directory', () => {
    const result = runGsdTools('state load --milestone v2.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // The state should be loaded (state_exists depends on whether the milestone has a STATE.md)
    // Since milestone create writes STATE.md, it should exist
    assert.strictEqual(output.state_exists, true, 'state should exist in milestone directory');
  });

  test('milestone status --milestone v2.0 shows v2.0 paths', () => {
    // Switch away from v2.0 first
    runGsdTools('milestone create v3.0', tmpDir);

    const result = runGsdTools('milestone status --milestone v2.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, '.planning/milestones/v2.0/STATE.md');
  });
});

// ─── milestone state isolation ──────────────────────────────────────────────

describe('milestone state isolation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    runGsdTools('milestone create v1.0', tmpDir);
    runGsdTools('milestone create v2.0', tmpDir);
  });

  afterEach(() => {
    setMilestoneOverride(null);
    cleanup(tmpDir);
  });

  test('state written to v1.0 is not visible from v2.0', () => {
    // Write a marker into v1.0 STATE.md
    const v1StatePath = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'STATE.md');
    const original = fs.readFileSync(v1StatePath, 'utf-8');
    fs.writeFileSync(v1StatePath, original + '\n**Marker:** v1-unique-data\n');

    // Load state from v2.0
    const result = runGsdTools('state load --milestone v2.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(!result.output.includes('v1-unique-data'),
      'v2.0 state should not contain v1.0 marker');
  });

  test('state written to v2.0 is not visible from v1.0', () => {
    const v2StatePath = path.join(tmpDir, '.planning', 'milestones', 'v2.0', 'STATE.md');
    const original = fs.readFileSync(v2StatePath, 'utf-8');
    fs.writeFileSync(v2StatePath, original + '\n**Marker:** v2-unique-data\n');

    const result = runGsdTools('state load --milestone v1.0', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(!result.output.includes('v2-unique-data'),
      'v1.0 state should not contain v2.0 marker');
  });

  test('phases are isolated per milestone', () => {
    // Create different phase dirs in each milestone
    const v1Phases = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '01-setup');
    const v2Phases = path.join(tmpDir, '.planning', 'milestones', 'v2.0', 'phases', '01-api');
    fs.mkdirSync(v1Phases, { recursive: true });
    fs.mkdirSync(v2Phases, { recursive: true });
    fs.writeFileSync(path.join(v1Phases, '01-01-PLAN.md'), '# Setup Plan');
    fs.writeFileSync(path.join(v2Phases, '01-01-PLAN.md'), '# API Plan');

    const r1 = runGsdTools('init execute-phase 1 --milestone v1.0', tmpDir);
    assert.ok(r1.success, `v1.0 failed: ${r1.error}`);
    const o1 = JSON.parse(r1.output);
    assert.ok(o1.phase_name.includes('setup'), `v1.0 phase should be setup, got: ${o1.phase_name}`);

    const r2 = runGsdTools('init execute-phase 1 --milestone v2.0', tmpDir);
    assert.ok(r2.success, `v2.0 failed: ${r2.error}`);
    const o2 = JSON.parse(r2.output);
    assert.ok(o2.phase_name.includes('api'), `v2.0 phase should be api, got: ${o2.phase_name}`);
  });

  test('roadmap is isolated per milestone', () => {
    // Write different roadmaps
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'ROADMAP.md'),
      '# Roadmap\n\n### Phase 1: Foundation\n**Goal:** Setup\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v2.0', 'ROADMAP.md'),
      '# Roadmap\n\n### Phase 1: Advanced Features\n**Goal:** Build\n\n### Phase 2: Polish\n**Goal:** Ship\n'
    );

    const r1 = runGsdTools('roadmap analyze --milestone v1.0', tmpDir);
    assert.ok(r1.success, `v1.0 analyze failed: ${r1.error}`);
    const o1 = JSON.parse(r1.output);
    assert.strictEqual(o1.phase_count, 1, 'v1.0 should have 1 phase');

    const r2 = runGsdTools('roadmap analyze --milestone v2.0', tmpDir);
    assert.ok(r2.success, `v2.0 analyze failed: ${r2.error}`);
    const o2 = JSON.parse(r2.output);
    assert.strictEqual(o2.phase_count, 2, 'v2.0 should have 2 phases');
  });

  test('config is isolated per milestone', () => {
    // Write different configs
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'config.json'),
      JSON.stringify({ commit_docs: false })
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v2.0', 'config.json'),
      JSON.stringify({ commit_docs: true })
    );

    const c1 = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'config.json'), 'utf-8'
    ));
    const c2 = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v2.0', 'config.json'), 'utf-8'
    ));

    assert.strictEqual(c1.commit_docs, false, 'v1.0 config should have commit_docs: false');
    assert.strictEqual(c2.commit_docs, true, 'v2.0 config should have commit_docs: true');
  });

  test('ACTIVE_MILESTONE pointer is shared between milestones', () => {
    const activePath = path.join(tmpDir, '.planning', 'ACTIVE_MILESTONE');

    // Switch to v1.0
    runGsdTools('milestone switch v1.0', tmpDir);
    assert.strictEqual(
      fs.readFileSync(activePath, 'utf-8').trim(), 'v1.0',
      'ACTIVE_MILESTONE should point to v1.0'
    );

    // Switch to v2.0
    runGsdTools('milestone switch v2.0', tmpDir);
    assert.strictEqual(
      fs.readFileSync(activePath, 'utf-8').trim(), 'v2.0',
      'ACTIVE_MILESTONE should point to v2.0'
    );
  });
});
