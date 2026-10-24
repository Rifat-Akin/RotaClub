import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CANONICAL_REPO, REQUIRED_CHECK_NAMES, evaluateReleaseEvidence,
  validateDispatchWorkflow, markdownSummary, requiredStatusesFromRules,
} from './release-preflight.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const input = () => ({
  repository: CANONICAL_REPO,
  ref: 'refs/heads/main',
  eventName: 'workflow_dispatch',
  workflowSha: SHA,
  branch: { protected: true, commit: { sha: SHA } },
  requiredStatuses: { contexts: [], checks: REQUIRED_CHECK_NAMES.map((context) => ({ context })) },
  checkRuns: { check_runs: REQUIRED_CHECK_NAMES.map((name) => ({
    name, head_sha: SHA, status: 'completed', conclusion: 'success',
  })) },
  issues: {
    21: { state: 'closed' },
    75: { state: 'closed' },
    76: { state: 'closed' },
  },
});
const gate = (result, name) => result.gates.find((g) => g.id === name);

test('even ideal machine evidence never grants real-world release authority', () => {
  const report = evaluateReleaseEvidence(input());
  assert.equal(report.machinePreflight, 'PASS');
  assert.equal(report.releaseDecision, 'NO_GO');
  assert.equal(report.deploymentAuthorization, 'NOT_GRANTED');
  assert.equal(report.gates.every((x) => x.pass), true);
});

test('missing or false branch protection fails closed', () => {
  for (const protectedValue of [false, undefined]) {
    const x = input(); x.branch.protected = protectedValue;
    const report = evaluateReleaseEvidence(x);
    assert.equal(report.machinePreflight, 'HOLD');
    assert.equal(gate(report, 'branch-protected').pass, false);
  }
});

test('required checks must both be configured in branch protection', () => {
  const x = input();
  x.requiredStatuses.checks.pop();
  assert.equal(gate(evaluateReleaseEvidence(x), 'both-required-checks').pass, false);
});

test('active ruleset status checks are observable with read-only Metadata rights', () => {
  const rules = [
    { type: 'required_status_checks', parameters: {
      required_status_checks: [{ context: REQUIRED_CHECK_NAMES[0], integration_id: 15368 }],
    } },
    { type: 'commit_message_pattern', parameters: { pattern: 'feat:' } },
    { type: 'required_status_checks', parameters: {
      required_status_checks: [{ context: REQUIRED_CHECK_NAMES[1] }],
    } },
  ];
  const requiredStatuses = requiredStatusesFromRules(rules);
  assert.deepEqual(requiredStatuses?.checks.map((item) => item.context),
    REQUIRED_CHECK_NAMES);
  const x = input();
  x.requiredStatuses = requiredStatuses;
  const report = evaluateReleaseEvidence(x);
  assert.equal(report.machinePreflight, 'PASS');
  assert.equal(report.deploymentAuthorization, 'NOT_GRANTED');
  assert.equal(report.releaseDecision, 'NO_GO');
});

test('malformed, empty or unrelated rules never imply required checks', () => {
  for (const rules of [undefined, null, {}, [], [
    { type: 'required_status_checks', parameters: {} },
  ], [
    { type: 'required_status_checks', parameters: { required_status_checks: [] } },
  ], [
    { type: 'required_deployments', parameters: { required_status_checks: [
      { context: REQUIRED_CHECK_NAMES[0] },
    ] } },
  ]]) {
    assert.equal(requiredStatusesFromRules(rules), null);
    const x = input();
    x.requiredStatuses = requiredStatusesFromRules(rules);
    assert.equal(evaluateReleaseEvidence(x).machinePreflight, 'HOLD');
  }
});

test('failing or pending CI must not pass', () => {
  for (const status of ['failure', 'cancelled', 'skipped', null]) {
    const x = input();
    x.checkRuns.check_runs[0].conclusion = status;
    const report = evaluateReleaseEvidence(x);
    assert.equal(report.machinePreflight, 'HOLD');
    assert.equal(gate(report, 'ci-on-exact-sha').pass, false);
  }
});

test('CI on a different commit must not be credited to main', () => {
  const x = input();
  x.checkRuns.check_runs[0].head_sha = OTHER_SHA;
  assert.equal(gate(evaluateReleaseEvidence(x), 'ci-on-exact-sha').pass, false);
});

test('moving main after workflow dispatch fails closed', () => {
  const x = input();
  x.branch.commit.sha = OTHER_SHA;
  const report = evaluateReleaseEvidence(x);
  assert.equal(report.machinePreflight, 'HOLD');
  assert.equal(gate(report, 'immutable-main-sha').pass, false);
});

test('open issue or missing issue evidence means HOLD', () => {
  for (const issue of [21, 75, 76]) {
    const x = input();
    x.issues[issue].state = 'open';
    assert.equal(gate(evaluateReleaseEvidence(x), 'issue-' + issue + '-closed').pass, false);
  }
  const x = input();
  delete x.issues[75];
  assert.equal(evaluateReleaseEvidence(x).machinePreflight, 'HOLD');
});

test('non-canonical repo, non-main ref, or automatic event means HOLD', () => {
  for (const [field, value] of [
    ['repository', 'attacker/RotaClub'],
    ['ref', 'refs/heads/feature'],
    ['eventName', 'pull_request'],
  ]) {
    const x = input(); x[field] = value;
    assert.equal(gate(evaluateReleaseEvidence(x), 'canonical-workflow-context').pass, false);
  }
});

test('missing or malformed GitHub API evidence cannot become machine PASS', () => {
  for (const fixture of [
    undefined,
    {},
    { ...input(), requiredStatuses: null },
    { ...input(), checkRuns: null },
    { ...input(), branch: null },
    { ...input(), workflowSha: 'not-a-sha' },
  ]) {
    assert.equal(evaluateReleaseEvidence(fixture).machinePreflight, 'HOLD');
  }
});

test('human-readable summary communicates NO-GO independently of green CI', () => {
  const summary = markdownSummary(evaluateReleaseEvidence(input()));
  assert.match(summary, /NO-GO/);
  assert.match(summary, /NOT_GRANTED/);
  assert.match(summary, /Machine-checkable prerequisites: \*\*PASS\*\*/);
  assert.match(summary, /two-device UAT/);
});

test('release workflow is manual only, read only, pinned and non-deploying', () => {
  const source = readFileSync(new URL('../.github/workflows/release-preflight.yml', import.meta.url), 'utf8');
  assert.deepEqual(validateDispatchWorkflow(source), []);
  for (const [before, after, expected] of [
    ['workflow_dispatch:', 'push:', 'automatic-trigger-forbidden'],
    ['issues: read', 'issues: write', 'read-only-permissions-required'],
    ['persist-credentials: false', 'persist-credentials: true', 'action-pinning-or-checkout-policy'],
    ['actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
      'actions/checkout@v4', 'action-pinning-or-checkout-policy'],
    ['run: node scripts/release-preflight.mjs', 'run: echo skipped',
      'preflight-and-regression-required'],
  ]) {
    assert.ok(source.includes(before), 'fixture target must exist');
    assert.ok(validateDispatchWorkflow(source.replace(before, after)).includes(expected),
      'workflow mutation must be rejected: ' + expected);
  }
  assert.ok(validateDispatchWorkflow(source + '\n  push:\n')
    .includes('automatic-trigger-forbidden'));
  assert.ok(validateDispatchWorkflow(source + '\n        run: docker push x/y\n')
    .includes('deployment-command-forbidden'));
  assert.ok(validateDispatchWorkflow(source + '\n      - name: Unexpected execution\n        run: echo unsafe\n')
    .includes('unexpected-execution-command'));
  assert.ok(validateDispatchWorkflow(source + '\n      - name: Untrusted third-party action\n        uses: unknown-org/action@v1\n')
    .includes('action-pinning-or-checkout-policy'));
});
