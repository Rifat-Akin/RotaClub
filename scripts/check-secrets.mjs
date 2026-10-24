#!/usr/bin/env node
/**
 * Source secret scan. Git checkouts use the tracked index; exported snapshots
 * without .git use a bounded, symlink-safe source tree scan.
 * Never report matched values. Neither mode inspects full Git history.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const rules = [
  { id: 'private-key', regex: /-----BEGIN (?:(?:RSA|EC|OPENSSH|DSA) )?PRIVATE KEY-----/g },
  { id: 'github-token', regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{35,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { id: 'aws-access-key', regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: 'openai-api-key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/g },
  { id: 'google-api-key', regex: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { id: 'stripe-live-key', regex: /\bsk_live_[A-Za-z0-9]{24,}\b/g },
];
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', '.aistudio', '.next', 'coverage', '.turbo', '.cache']);
const MAX_FILES = 20000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yaml', '.yml',
  '.md', '.mdx', '.html', '.css', '.scss', '.sql', '.sh', '.ps1', '.toml',
  '.ini', '.xml', '.txt', '.pem', '.key', '.crt', '.properties',
]);

function inspectText(filename, content) {
  const findings = [];
  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    for (const match of content.matchAll(rule.regex)) {
      const line = content.slice(0, match.index ?? 0).split('\n').length;
      findings.push(`${filename}:${line} [${rule.id}]`);
    }
  }
  return findings;
}
function isEnvSecret(filename) {
  const base = filename.replaceAll('\\', '/').split('/').pop();
  return /^\.env(?:\.|$)/.test(base) &&
    !/^\.env\.(?:example|sample|template)$/.test(base);
}
function scanEligible(filename) {
  const base = path.basename(filename);
  return isEnvSecret(filename) || base === '.env.example' ||
    base === 'Dockerfile' || base.startsWith('Dockerfile.') ||
    base === '.npmrc' || base === '.gitignore' ||
    SOURCE_EXTENSIONS.has(path.extname(base).toLowerCase());
}
function exportedFiles(root) {
  const files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= MAX_FILES) throw new Error('SCAN_FILE_LIMIT');
      if (entry.isSymbolicLink()) continue;
      const relative = path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) visit(path.join(dir, entry.name));
      } else if (entry.isFile() && (scanEligible(relative) || isEnvSecret(relative))) {
        files.push(relative);
      }
    }
  }
  visit(root);
  return files;
}
function trackedFiles(root) {
  if (!existsSync(path.join(root, '.git'))) return { mode: 'export', files: exportedFiles(root) };
  // A checkout with a corrupt/unavailable index must fail, not silently downgrade.
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return { mode: 'git', files: output.split('\0').filter(Boolean) };
}
function scanFiles(root, files) {
  const findings = [];
  let scanned = 0;
  for (const relative of files) {
    if (isEnvSecret(relative)) findings.push(`${relative}:1 [secret-env-file]`);
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) continue;
    const meta = lstatSync(absolute);
    if (meta.isSymbolicLink() || !meta.isFile()) continue;
    if (meta.size > MAX_FILE_BYTES) {
      findings.push(`${relative}:1 [oversize-unscanned]`);
      continue;
    }
    const raw = readFileSync(absolute);
    if (raw.includes(0)) continue;
    scanned++;
    findings.push(...inspectText(relative, raw.toString('utf8')));
  }
  return { findings, scanned };
}
function selfTest() {
  assert.equal(inspectText('fixture', 'ghp_' + 'Z'.repeat(40)).length, 1);
  assert.equal(inspectText('fixture', '-----BEGIN ' + 'PRIVATE KEY-----').length, 1);
  assert.equal(inspectText('fixture', 'GEMINI_API_KEY="MY_GEMINI_API_KEY"').length, 0);
  assert.equal(isEnvSecret('.env.production'), true);
  assert.equal(isEnvSecret('.env.example'), false);
  assert.equal(scanEligible('src/server/server.ts'), true);
  assert.equal(scanEligible('notes/private.json'), true);
  assert.equal(EXCLUDED_DIRS.has('.aistudio'), true);
  console.log('SECRET_SCAN_SELF_TEST=PASS');
}
function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  try {
    const root = process.cwd();
    const { mode, files } = trackedFiles(root);
    const { findings, scanned } = scanFiles(root, files);
    if (findings.length) {
      console.error('SECRET_SCAN=FAIL');
      for (const item of findings) console.error(item);
      process.exitCode = 1;
      return;
    }
    console.log(`SECRET_SCAN=PASS MODE=${mode} TEXT_FILES=${scanned}`);
  } catch (error) {
    console.error(`SECRET_SCAN=FAIL_SCANNER_ERROR ${error instanceof Error ? error.message : 'unknown'}`);
    process.exitCode = 1;
  }
}
main();
