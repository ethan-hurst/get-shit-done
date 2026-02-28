/**
 * GSD Tools Tests - Hooks
 *
 * Tests for gsd-statusline, gsd-context-monitor, and gsd-check-update hooks.
 * Hooks are stdin-to-stdout Node scripts tested via spawnSync.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const STATUSLINE_PATH = path.join(__dirname, '..', 'hooks', 'gsd-statusline.js');
const CONTEXT_MONITOR_PATH = path.join(__dirname, '..', 'hooks', 'gsd-context-monitor.js');
const CHECK_UPDATE_PATH = path.join(__dirname, '..', 'hooks', 'gsd-check-update.js');

function runHook(hookPath, inputData, env) {
  const input = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
  return spawnSync(process.execPath, [hookPath], {
    input,
    encoding: 'utf-8',
    timeout: 10000,
    env: { ...process.env, ...env },
  });
}

// ─── gsd-statusline ──────────────────────────────────────────────────────────

describe('gsd-statusline', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hook-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('basic output includes model name and directory', () => {
    const result = runHook(STATUSLINE_PATH, {
      model: { display_name: 'Claude 4' },
      workspace: { current_dir: tmpDir },
    });

    assert.strictEqual(result.status, 0, `Hook exited with ${result.status}: ${result.stderr}`);
    assert.ok(result.stdout.includes('Claude 4'), 'should include model name');
    assert.ok(result.stdout.includes(path.basename(tmpDir)), 'should include directory name');
  });

  test('displays milestone when ACTIVE_MILESTONE exists', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ACTIVE_MILESTONE'), 'v2.0');

    const result = runHook(STATUSLINE_PATH, {
      model: { display_name: 'Claude 4' },
      workspace: { current_dir: tmpDir },
    });

    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes('[v2.0]'), 'should include milestone in brackets');
  });

  test('no milestone bracket when ACTIVE_MILESTONE absent', () => {
    const result = runHook(STATUSLINE_PATH, {
      model: { display_name: 'Claude 4' },
      workspace: { current_dir: tmpDir },
    });

    assert.strictEqual(result.status, 0);
    // Strip ANSI codes before checking for milestone brackets
    const plain = result.stdout.replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(!plain.includes('['), 'should not contain bracket when no milestone');
  });

  test('context bar at 50% remaining', () => {
    const result = runHook(STATUSLINE_PATH, {
      model: { display_name: 'Claude 4' },
      workspace: { current_dir: tmpDir },
      context_window: { remaining_percentage: 50 },
    });

    assert.strictEqual(result.status, 0);
    // 50% remaining = 50% used raw, scaled to (50/80)*100 = 62.5% -> 63%
    assert.ok(result.stdout.includes('█'), 'should include filled bar segments');
    assert.ok(result.stdout.includes('░'), 'should include empty bar segments');
    assert.ok(result.stdout.includes('%'), 'should include percentage');
  });

  test('critical context shows skull emoji', () => {
    const result = runHook(STATUSLINE_PATH, {
      model: { display_name: 'Claude 4' },
      workspace: { current_dir: tmpDir },
      context_window: { remaining_percentage: 4 },
    });

    assert.strictEqual(result.status, 0);
    // 4% remaining = 96% used raw, scaled to (96/80)*100 = 120% -> capped at 100% -> skull
    assert.ok(result.stdout.includes('💀'), 'should include skull emoji at critical context');
  });

  test('invalid JSON input does not crash', () => {
    const result = runHook(STATUSLINE_PATH, 'not json');

    assert.strictEqual(result.status, 0, 'should exit 0 on invalid JSON');
    assert.strictEqual(result.stdout, '', 'should produce empty stdout on invalid JSON');
  });

  test('missing model defaults to Claude', () => {
    const result = runHook(STATUSLINE_PATH, {
      workspace: { current_dir: tmpDir },
    });

    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes('Claude'), 'should include default "Claude" model name');
  });
});

// ─── gsd-context-monitor ────────────────────────────────────────────────────

describe('gsd-context-monitor', () => {
  let tmpDir;
  const sessionId = `test-ctx-${Date.now()}`;

  function bridgePath() {
    return path.join(os.tmpdir(), `claude-ctx-${sessionId}.json`);
  }

  function warnPath() {
    return path.join(os.tmpdir(), `claude-ctx-${sessionId}-warned.json`);
  }

  function writeBridge(data) {
    const bridgeData = {
      session_id: sessionId,
      timestamp: Math.floor(Date.now() / 1000),
      ...data,
    };
    fs.writeFileSync(bridgePath(), JSON.stringify(bridgeData));
  }

  function writeWarnFile(data) {
    fs.writeFileSync(warnPath(), JSON.stringify(data));
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hook-test-'));
  });

  afterEach(() => {
    // Clean up bridge and warn files
    try { fs.unlinkSync(bridgePath()); } catch {}
    try { fs.unlinkSync(warnPath()); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('no session_id returns empty output', () => {
    const result = runHook(CONTEXT_MONITOR_PATH, {});

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '', 'should produce empty stdout without session_id');
  });

  test('no bridge file returns empty output', () => {
    const result = runHook(CONTEXT_MONITOR_PATH, { session_id: sessionId });

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '', 'should produce empty stdout without bridge file');
  });

  test('above threshold returns empty output', () => {
    writeBridge({ remaining_percentage: 50, used_pct: 63 });

    const result = runHook(CONTEXT_MONITOR_PATH, { session_id: sessionId });

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '', 'should not warn when above threshold');
  });

  test('WARNING fires at remaining <= 35%', () => {
    writeBridge({ remaining_percentage: 34, used_pct: 83 });

    const result = runHook(CONTEXT_MONITOR_PATH, { session_id: sessionId });

    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout, 'should produce output at warning threshold');

    const output = JSON.parse(result.stdout);
    assert.ok(output.hookSpecificOutput, 'should have hookSpecificOutput');
    assert.ok(output.hookSpecificOutput.additionalContext.includes('WARNING'),
      'should include WARNING in message');
  });

  test('CRITICAL fires at remaining <= 25%', () => {
    writeBridge({ remaining_percentage: 24, used_pct: 95 });

    const result = runHook(CONTEXT_MONITOR_PATH, { session_id: sessionId });

    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout, 'should produce output at critical threshold');

    const output = JSON.parse(result.stdout);
    assert.ok(output.hookSpecificOutput.additionalContext.includes('CRITICAL'),
      'should include CRITICAL in message');
  });

  test('debounce suppresses repeated warnings', () => {
    writeBridge({ remaining_percentage: 34, used_pct: 83 });

    // First call fires the warning
    const first = runHook(CONTEXT_MONITOR_PATH, { session_id: sessionId });
    assert.ok(first.stdout, 'first call should produce warning');

    // Second call should be debounced (callsSinceWarn = 1, < 5)
    const second = runHook(CONTEXT_MONITOR_PATH, { session_id: sessionId });
    assert.strictEqual(second.stdout, '', 'second call should be debounced');
  });

  test('severity escalation bypasses debounce', () => {
    writeBridge({ remaining_percentage: 34, used_pct: 83 });

    // First call at WARNING level
    runHook(CONTEXT_MONITOR_PATH, { session_id: sessionId });

    // Escalate to CRITICAL — should bypass debounce
    writeBridge({ remaining_percentage: 24, used_pct: 95 });
    const result = runHook(CONTEXT_MONITOR_PATH, { session_id: sessionId });

    assert.ok(result.stdout, 'escalation should bypass debounce');
    const output = JSON.parse(result.stdout);
    assert.ok(output.hookSpecificOutput.additionalContext.includes('CRITICAL'),
      'should fire CRITICAL after WARNING escalation');
  });
});

// ─── gsd-check-update ───────────────────────────────────────────────────────

describe('gsd-check-update', () => {
  test('smoke test — exits without crashing', () => {
    const result = spawnSync(process.execPath, [CHECK_UPDATE_PATH], {
      input: '{}',
      encoding: 'utf-8',
      timeout: 10000,
    });

    assert.strictEqual(result.status, 0, `Hook crashed with status ${result.status}: ${result.stderr}`);
  });
});
