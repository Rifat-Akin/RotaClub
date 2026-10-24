/**
 * Black-box negative/positive tests for the secret-scanning CLI.
 * All credentials are synthetic, created only in throwaway temp directories.
 * No fixture values, private data, or secrets are committed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(new URL('./check-secrets.mjs', import.meta.url));

function snapshot(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rotaclub-scan-'));
  const root = path.join(base, 'snapshot');
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return { root, base };
}

function put(root, relative, content) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
  return filename;
}

function run(root, args = []) {
  // Do not inherit an outer checkout's Git environment when exercising a
  // separate disposable fixture repository.
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[name];
  const proc = spawnSync(process.execPath, [scanner, ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
  });
  assert.equal(proc.error, undefined, String(proc.error));
  assert.notEqual(proc.status, null, 'scanner must terminate');
  return { code: proc.status, output: (proc.stdout || '') + (proc.stderr || '') };
}

function git(root, args) {
  const proc = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.equal(proc.error, undefined);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
}

test('export without .git scans clean nested source files', (t) => {
  const { root } = snapshot(t);
  put(root, 'src/lib/index.ts', 'export const isSafe = true;\n');
  put(root, '.env.example', 'APP_URL="https://example.invalid"\n');
  const res = run(root);
  assert.equal(res.code, 0, res.output);
  assert.match(res.output, /SECRET_SCAN=PASS MODE=export TEXT_FILES=2/);
});

test('export detects a planted token but never prints the token', (t) => {
  const { root } = snapshot(t);
  const synthetic = 'ghp_' + 'Z'.repeat(40);
  put(root, 'src/test.ts', 'safe line\nconst demo = "' + synthetic + '";\n');
  const res = run(root);
  assert.equal(res.code, 1);
  assert.match(res.output, /SECRET_SCAN=FAIL/);
  assert.match(res.output, /src\/test\.ts:2 \[github-token\]/);
  assert.ok(!res.output.includes(synthetic), 'secret must not appear in scanner output');
});

test('export detects a synthetic private-key marker without exposing it', (t) => {
  const { root } = snapshot(t);
  const marker = '-----BEGIN ' + 'PRIVATE KEY-----';
  put(root, 'keys/demo.pem', marker + '\nsynthetic\n');
  const res = run(root);
  assert.equal(res.code, 1);
  assert.match(res.output, /keys\/demo\.pem:1 \[private-key\]/);
  assert.ok(!res.output.includes(marker));
});

test('export blocks private .env even when its contents are empty', (t) => {
  const { root } = snapshot(t);
  put(root, '.env.production', '');
  put(root, '.env.example', 'SAFE="placeholder"\n');
  const res = run(root);
  assert.equal(res.code, 1);
  assert.match(res.output, /\.env\.production:1 \[secret-env-file\]/);
  assert.doesNotMatch(res.output, /\.env\.example:1 \[secret-env-file\]/);
});

test('export skips generated directories and never follows file symlinks', (t) => {
  const { root, base } = snapshot(t);
  const synthetic = 'ghp_' + 'A'.repeat(40);
  put(root, 'src/index.ts', 'export const n = 1;\n');
  for (const excluded of ['node_modules', 'dist', '.aistudio', 'coverage']) {
    put(root, excluded + '/not-source.js', synthetic + '\n');
  }
  const outside = put(base, 'outside.js', synthetic + '\n');
  try {
    fs.symlinkSync(outside, path.join(root, 'shortcut.js'));
  } catch (error) {
    if (error?.code === 'EPERM') return t.skip('symlinks not available');
    throw error;
  }
  const res = run(root);
  assert.equal(res.code, 0, res.output);
  assert.match(res.output, /SECRET_SCAN=PASS MODE=export TEXT_FILES=1/);
});

test('export fails closed when a source file exceeds the scan bound', (t) => {
  const { root } = snapshot(t);
  const filename = put(root, 'src/huge.ts', 'a');
  fs.truncateSync(filename, 8 * 1024 * 1024 + 1);
  const res = run(root);
  assert.equal(res.code, 1);
  assert.match(res.output, /src\/huge\.ts:1 \[oversize-unscanned\]/);
});

test('broken .git metadata must fail; never silently downgrade to export', (t) => {
  const { root } = snapshot(t);
  fs.mkdirSync(path.join(root, '.git'));
  put(root, 'src/index.ts', 'export const n = 1;\n');
  const res = run(root);
  assert.equal(res.code, 1);
  assert.match(res.output, /SECRET_SCAN=FAIL_SCANNER_ERROR/);
  assert.doesNotMatch(res.output, /SECRET_SCAN=PASS MODE=export/);
});

test('git mode checks tracked worktree changes, not synthetic untracked files', (t) => {
  const { root } = snapshot(t);
  git(root, ['init', '-q']);
  put(root, 'src/tracked.ts', 'export const safe = true;\n');
  git(root, ['add', 'src/tracked.ts']);
  const synthetic = 'ghp_' + 'B'.repeat(40);
  put(root, 'src/untracked.ts', synthetic + '\n');
  const clean = run(root);
  assert.equal(clean.code, 0, clean.output);
  assert.match(clean.output, /SECRET_SCAN=PASS MODE=git TEXT_FILES=1/);
  put(root, 'src/tracked.ts', synthetic + '\n');
  const dirty = run(root);
  assert.equal(dirty.code, 1);
  assert.match(dirty.output, /src\/tracked\.ts:1 \[github-token\]/);
  assert.ok(!dirty.output.includes(synthetic));
});

test('standalone self-test works even when .git is absent', (t) => {
  const { root } = snapshot(t);
  const res = run(root, ['--self-test']);
  assert.equal(res.code, 0, res.output);
  assert.match(res.output, /SECRET_SCAN_SELF_TEST=PASS/);
});
