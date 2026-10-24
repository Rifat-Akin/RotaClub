#!/usr/bin/env node
/**
 * Static CI policy regression gate (#17).
 *
 * Deliberately scoped to RotaClub's own ci.yml. It detects accidental drift
 * from reviewed GitHub Actions commits, checkout token persistence, least
 * privilege, and required verification commands. It is NOT a substitute for
 * protected branches, CODEOWNERS approval or independent review because a PR
 * author can change both the workflow and this script without a ruleset.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflowFile = fileURLToPath(
  new URL('../.github/workflows/ci.yml', import.meta.url)
);

// Reviewed from official GitHub repositories refs/tags/v4 on 2026-10-24.
const PINNED_ACTIONS = new Map([
  ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
  ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
]);

const REQUIRED_COMMANDS = [
  'npm ci --legacy-peer-deps',
  'npm run lint',
  'npm test',
  'npm run build',
  'node scripts/check-secrets.mjs --self-test',
  'node --test scripts/check-secrets.test.mjs',
  'node scripts/check-secrets.mjs',
  'npm audit --omit=dev --audit-level=high',
  'node scripts/check-ci-policy.mjs --self-test',
  'node scripts/check-ci-policy.mjs',
];

function validateWorkflow(source) {
  const errors = [];

  if (!/^on:\s*$/m.test(source) ||
      !/^\s{2}pull_request:\s*$/m.test(source) ||
      !/^\s{2}push:\s*$/m.test(source)) {
    errors.push('required-triggers');
  }
  if (/^\s{2}(?:pull_request_target|workflow_run|repository_dispatch):/m.test(source)) {
    errors.push('unsafe-trigger');
  }
  if (!/^permissions:\s*\n[ \t]{2}contents:\s*read\s*$/m.test(source) ||
      /^\s*permissions:\s*write-all\s*$/m.test(source) ||
      /^\s+(?:contents|id-token|actions|checks|pull-requests|packages|deployments):\s*write\s*$/m.test(source)) {
    errors.push('permissions-not-read-only');
  }

  const uses = [...source.matchAll(/^\s*uses:\s*([^\s#]+)/gm)];
  if (uses.length < 4) errors.push('required-action-steps');
  for (const match of uses) {
    const ref = match[1];
    const at = ref.lastIndexOf('@');
    const name = at < 0 ? ref : ref.slice(0, at);
    const sha = at < 0 ? '' : ref.slice(at + 1);
    if (!PINNED_ACTIONS.has(name) || PINNED_ACTIONS.get(name) !== sha) {
      errors.push('untrusted-action-ref');
    }
  }

  // The checkout and with: values must be inside the *same step*.
  const steps = source.split(/(?=^\s{6}- name:)/m);
  const checkoutSteps = steps.filter((step) =>
    /^\s*uses:\s*actions\/checkout@[0-9a-f]{40}\s*$/m.test(step)
  );
  if (checkoutSteps.length < 2 ||
      checkoutSteps.some((step) =>
        !/^\s{10}persist-credentials:\s*false\s*$/m.test(step)
      )) {
    errors.push('persist-credentials-must-be-false');
  }

  for (const command of REQUIRED_COMMANDS) {
    // A control is required as an actual run command, not as an echo,
    // quoted message or comment in a workflow file.
    if (!source.split('\n').some((line) => {
      const value = line.trim();
      return value === command || value === 'run: ' + command;
    })) {
      errors.push('required-control-missing');
    }
  }
  return [...new Set(errors)];
}

function selfTest(cleanSource) {
  assert.deepEqual(validateWorkflow(cleanSource), [], 'baseline CI must be clean');
  let count = 0;
  function rejectMutation(before, after, errorCode) {
    assert.ok(cleanSource.includes(before), 'fixture replacement target not found');
    const altered = cleanSource.replace(before, after);
    assert.ok(validateWorkflow(altered).includes(errorCode),
      'negative fixture was not rejected: ' + errorCode);
    count++;
  }

  rejectMutation(
    'actions/checkout@' + PINNED_ACTIONS.get('actions/checkout'),
    'actions/checkout@v4', 'untrusted-action-ref'
  );
  rejectMutation(
    'actions/setup-node@' + PINNED_ACTIONS.get('actions/setup-node'),
    'actions/setup-node@' + 'f'.repeat(40), 'untrusted-action-ref'
  );
  rejectMutation('persist-credentials: false', 'persist-credentials: true',
    'persist-credentials-must-be-false');
  rejectMutation('contents: read', 'contents: write',
    'permissions-not-read-only');
  rejectMutation('  pull_request:', '  pull_request_target:',
    'unsafe-trigger');
  rejectMutation('node scripts/check-secrets.mjs --self-test',
    'echo skipped-scanner-self-test', 'required-control-missing');
  rejectMutation(
    'actions/setup-node@' + PINNED_ACTIONS.get('actions/setup-node'),
    'unknown-org/setup-node@' + PINNED_ACTIONS.get('actions/setup-node'),
    'untrusted-action-ref'
  );
  rejectMutation('run: npm test', 'run: echo npm test',
    'required-control-missing');
  rejectMutation('  security-baseline:\n',
    '  security-baseline:\n    permissions:\n      contents: write\n',
    'permissions-not-read-only');

  console.log('CI_POLICY_SELF_TEST=PASS NEGATIVE_FIXTURES=' + count);
}

try {
  const source = readFileSync(workflowFile, 'utf8');
  if (process.argv.includes('--self-test')) {
    selfTest(source);
  } else {
    const errors = validateWorkflow(source);
    if (errors.length) {
      console.error('CI_POLICY=FAIL RULES=' + errors.join(','));
      process.exitCode = 1;
    } else {
      console.log('CI_POLICY=PASS PINNED_ACTIONS=4 CHECKOUT_TOKEN_PERSISTENCE=OFF');
    }
  }
} catch (error) {
  console.error('CI_POLICY=FAIL_VERIFICATION_ERROR ' +
    (error instanceof Error ? error.message : 'unknown'));
  process.exitCode = 1;
}
