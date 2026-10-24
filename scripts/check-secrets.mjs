#!/usr/bin/env node
/**
 * Dependency-free, high-confidence pre-merge check for secrets in TRACKED text files.
 * This is a baseline, not a substitute for provider-side rotation or history scanning.
 * Findings print only path/line and rule ID, never secret values.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const rules = [
  { id: 'private-key', regex: /-----BEGIN (?:(?:RSA|EC|OPENSSH|DSA) )?PRIVATE KEY-----/g },
  { id: 'github-token', regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{35,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { id: 'aws-access-key', regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: 'openai-api-key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/g },
  { id: 'google-api-key', regex: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { id: 'stripe-live-key', regex: /\bsk_live_[A-Za-z0-9]{24,}\b/g },
];

function inspectText(filename, content) {
  const findings = [];
  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    for (const match of content.matchAll(rule.regex)) {
      const offset = match.index ?? 0;
      const line = content.slice(0, offset).split('\n').length;
      findings.push(`${filename}:${line} [${rule.id}]`);
    }
  }
  return findings;
}

function isTrackedEnvSecret(filename) {
  const base = filename.replaceAll('\\', '/').split('/').pop();
  return /^\.env(?:\.|$)/.test(base) &&
    !/^\.env\.(?:example|sample|template)$/.test(base);
}

function selfTest() {
  const syntheticGithubToken = 'ghp_' + 'Z'.repeat(40);
  const syntheticPrivateKeyHeader = '-----BEGIN ' + 'PRIVATE KEY-----';
  assert.equal(inspectText('fixture', syntheticGithubToken).length, 1);
  assert.equal(inspectText('fixture', syntheticPrivateKeyHeader).length, 1);
  assert.equal(inspectText('fixture', 'GEMINI_API_KEY="MY_GEMINI_API_KEY"').length, 0);
  assert.equal(isTrackedEnvSecret('.env.production'), true);
  assert.equal(isTrackedEnvSecret('.env.example'), false);
  console.log('SECRET_SCAN_SELF_TEST=PASS');
}

function scanTrackedFiles() {
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  } catch (error) {
    console.error('SECRET_SCAN=FAIL_NO_GIT_INDEX');
    process.exitCode = 1;
    return;
  }

  const findings = [];
  let scanned = 0;
  for (const filename of tracked.split('\0').filter(Boolean)) {
    if (isTrackedEnvSecret(filename)) {
      findings.push(`${filename}:1 [tracked-env-secret-file]`);
    }
    if (!existsSync(filename)) continue;
    const metadata = statSync(filename);
    if (!metadata.isFile()) continue;
    // Binary assets contain NUL bytes; source and lockfiles are read in full.
    const raw = readFileSync(filename);
    if (raw.includes(0)) continue;
    scanned++;
    findings.push(...inspectText(filename, raw.toString('utf8')));
  }

  if (findings.length > 0) {
    console.error('SECRET_SCAN=FAIL');
    for (const finding of findings) console.error(finding);
    process.exitCode = 1;
    return;
  }
  console.log(`SECRET_SCAN=PASS TRACKED_TEXT_FILES=${scanned}`);
}

if (process.argv.includes('--self-test')) selfTest();
else scanTrackedFiles();
