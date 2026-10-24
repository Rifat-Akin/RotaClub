#!/usr/bin/env node
/**
 * RotaClub release evidence audit (#21, #75, #76) — read-only.
 * This NEVER approves or performs a deployment, enables outbound services,
 * writes back to GitHub, or confuses CI success with actual pilot acceptance.
 */
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const CANONICAL_REPO = 'Rifat-Akin/RotaClub';
export const REQUIRED_CHECK_NAMES = Object.freeze([
  'Typecheck, Unit/API Tests and Build',
  'Secret Scan and Production Dependency Audit',
]);
export const BLOCKING_ISSUES = Object.freeze([21, 75, 76]);

const shaIsValid = (s) => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s);

export function evaluateReleaseEvidence({
  repository, ref, eventName, workflowSha, branch, requiredStatuses, checkRuns, issues,
} = {}) {
  const headSha = branch?.commit?.sha;
  const exactSha = shaIsValid(workflowSha) && shaIsValid(headSha) &&
    workflowSha === headSha;

  const required = [
    ...(Array.isArray(requiredStatuses?.contexts) ? requiredStatuses.contexts : []),
    ...(Array.isArray(requiredStatuses?.checks)
      ? requiredStatuses.checks.map((x) => x?.context)
      : []),
  ];
  const observed = Array.isArray(checkRuns?.check_runs)
    ? checkRuns.check_runs
    : [];
  const checksArePassing = REQUIRED_CHECK_NAMES.every((name) => {
    const matching = observed.filter((x) => x?.name === name);
    return matching.length > 0 &&
      matching.every((x) => x?.status === 'completed' &&
        x?.conclusion === 'success' && x?.head_sha === headSha);
  });
  const checksRequired = REQUIRED_CHECK_NAMES.every((name) => required.includes(name));
  const checkedIssues = BLOCKING_ISSUES.every((n) =>
    issues && Object.prototype.hasOwnProperty.call(issues, n)
  );

  const gates = [
    {
      id: 'canonical-workflow-context',
      pass: repository === CANONICAL_REPO &&
        ref === 'refs/heads/main' && eventName === 'workflow_dispatch',
      detail: 'Only manually dispatched canonical main workflow may be evaluated',
    },
    {
      id: 'immutable-main-sha',
      pass: exactSha,
      detail: 'Dispatched SHA must still equal live main HEAD',
    },
    {
      id: 'branch-protected',
      pass: branch?.protected === true,
      detail: 'Main must have enforceable branch protection or ruleset',
    },
    {
      id: 'both-required-checks',
      pass: checksRequired,
      detail: 'Both code and security checks must be required by branch protection',
    },
    {
      id: 'ci-on-exact-sha',
      pass: exactSha && checksArePassing,
      detail: 'Both required check runs must pass for this exact HEAD',
    },
    ...BLOCKING_ISSUES.map((n) => ({
      id: 'issue-' + n + '-closed',
      pass: checkedIssues && issues[n]?.state === 'closed' &&
        issues[n]?.pull_request === undefined,
      detail: 'Issue #' + n + ' must be closed; closure alone does not prove human acceptance',
    })),
  ];
  const machineReady = gates.every((g) => g.pass === true);
  return {
    repository: CANONICAL_REPO,
    sourceSha: shaIsValid(headSha) ? headSha : null,
    machinePreflight: machineReady ? 'PASS' : 'HOLD',
    // Deliberately non-automatable: real-world UAT/owner authorization is
    // separately recorded outside this metadata check.
    deploymentAuthorization: 'NOT_GRANTED',
    releaseDecision: 'NO_GO',
    gates,
  };
}

export function validateDispatchWorkflow(source) {
  const lines = String(source).split(/\r?\n/);
  const errors = [];
  if (!/^on:\s*$/m.test(source) ||
      !/^\s{2}workflow_dispatch:\s*$/m.test(source)) {
    errors.push('manual-only-trigger-required');
  }
  if (/^\s{2}(?:push|pull_request|pull_request_target|schedule|workflow_run):/m.test(source)) {
    errors.push('automatic-trigger-forbidden');
  }
  if (!/^\s{2}contents:\s*read\s*$/m.test(source) ||
      !/^\s{2}checks:\s*read\s*$/m.test(source) ||
      !/^\s{2}issues:\s*read\s*$/m.test(source) ||
      /^\s+(?:contents|issues|checks|id-token|actions|deployments):\s*write\s*$/m.test(source)) {
    errors.push('read-only-permissions-required');
  }
  const uses = lines.filter((s) => /^\s+uses:\s/.test(s)).map((s) => s.trim());
  const reviewedActions = [
    'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
    'uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  ];
  if (uses.length !== 2 || reviewedActions.some((a) => !uses.includes(a)) ||
      !source.includes('persist-credentials: false')) {
    errors.push('action-pinning-or-checkout-policy');
  }
  const runLines = lines.filter((s) => /^\s+run:\s/.test(s)).map((s) => s.trim());
  const allowedRuns = [
    'run: node scripts/release-preflight.mjs',
    'run: node --test scripts/release-preflight.test.mjs',
  ];
  if (allowedRuns.some((a) => !runLines.includes(a))) {
    errors.push('preflight-and-regression-required');
  }
  if (runLines.length !== allowedRuns.length ||
      runLines.some((line) => !allowedRuns.includes(line))) {
    errors.push('unexpected-execution-command');
  }
  if (/\b(?:npm\s+(?:publish|deploy)|docker\s+push|kubectl\s+(?:apply|rollout)|gh\s+release\s+create)\b/i.test(source)) {
    errors.push('deployment-command-forbidden');
  }
  return [...new Set(errors)];
}

const githubGet = async (resource, token) => {
  const url = 'https://api.github.com/repos/' + CANONICAL_REPO + resource;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'rotaclub-readonly-release-preflight',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    // Do not echo response body, headers or token to logs.
    throw new Error('GitHub API evidence unavailable: ' + resource + ' HTTP_' + response.status);
  }
  return response.json();
};

/**
 * A branch's active ruleset is readable with repository Metadata:read.
 * Legacy branch-protection required-checks API needs Administration:read,
 * which the least-privilege GitHub Actions token does not normally have.
 * An absent/malformed ruleset must NEVER be interpreted as passing.
 */
export function requiredStatusesFromRules(activeRules) {
  if (!Array.isArray(activeRules)) return null;
  const checks = activeRules
    .filter((rule) => rule?.type === 'required_status_checks')
    .flatMap((rule) => Array.isArray(rule.parameters?.required_status_checks)
      ? rule.parameters.required_status_checks
      : [])
    .filter((item) => typeof item?.context === 'string' && item.context.trim())
    .map((item) => ({ context: item.context }));
  return checks.length ? { contexts: [], checks } : null;
}

export async function collectReleaseEvidence(token) {
  if (!token || typeof token !== 'string') throw new Error('GITHUB_TOKEN_REQUIRED');
  const branch = await githubGet('/branches/main', token);
  const sha = branch?.commit?.sha;
  if (!shaIsValid(sha)) throw new Error('UNTRUSTED_BRANCH_HEAD');
  const [checkRuns, activeRules, ...issues] = await Promise.all([
    githubGet('/commits/' + sha + '/check-runs?per_page=100', token),
    githubGet('/rules/branches/main?per_page=100', token),
    ...BLOCKING_ISSUES.map((n) => githubGet('/issues/' + n, token)),
  ]);
  let requiredStatuses = requiredStatusesFromRules(activeRules);
  const alreadyRequired = REQUIRED_CHECK_NAMES.every((name) =>
    requiredStatuses?.checks?.some((item) => item.context === name)
  );
  if (branch.protected && !alreadyRequired) {
    try {
      const legacy = await githubGet(
        '/branches/main/protection/required_status_checks', token
      );
      requiredStatuses = {
        contexts: [
          ...(requiredStatuses?.contexts || []),
          ...(legacy?.contexts || []),
        ],
        checks: [
          ...(requiredStatuses?.checks || []),
          ...(legacy?.checks || []),
        ],
      };
    } catch {
      // Legacy permission denied or no classic protection: report HOLD unless
      // the active ruleset itself establishes both required checks.
    }
  }
  return {
    branch, checkRuns, requiredStatuses,
    issues: Object.fromEntries(BLOCKING_ISSUES.map((n, i) => [n, issues[i]])),
  };
}

export function markdownSummary(report) {
  const missing = report.gates.filter((x) => !x.pass);
  const items = report.gates.map((g) => '- ' + (g.pass ? '[x]' : '[ ]') +
    ' ' + g.id + ' — ' + (g.pass ? 'PASS' : 'HOLD') + '\n').join('');
  return '## RotaClub release evidence audit (read-only)\n\n' +
    '**Release decision: NO-GO. Production authorization: NOT_GRANTED.**\n\n' +
    'Machine-checkable prerequisites: **' + report.machinePreflight + '**. ' +
    'Missing gates: **' + missing.length + '**.\n\n' +
    'Exact main SHA: ' + (report.sourceSha || 'UNKNOWN') + '\n\n' +
    items + '\nThis report never authorizes deployment, real members, money, or messages. ' +
    'Human owner/club GO, independent restore, and two-device UAT require separate proof.\n';
}

async function main() {
  const context = {
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    eventName: process.env.GITHUB_EVENT_NAME,
    workflowSha: process.env.GITHUB_SHA,
  };
  if (context.repository !== CANONICAL_REPO ||
      context.ref !== 'refs/heads/main' ||
      context.eventName !== 'workflow_dispatch') {
    throw new Error('NON_CANONICAL_WORKFLOW_CONTEXT');
  }
  const evidence = await collectReleaseEvidence(process.env.GITHUB_TOKEN);
  const report = evaluateReleaseEvidence({ ...context, ...evidence });
  console.log('RELEASE_PREFLIGHT=' + report.machinePreflight +
    ' DECISION=' + report.releaseDecision + ' DEPLOYMENT_AUTHORIZED=NO' +
    ' MISSING_GATES=' + report.gates.filter((x) => !x.pass).length);
  for (const gate of report.gates) {
    console.log('GATE ' + gate.id + '=' + (gate.pass ? 'PASS' : 'HOLD'));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownSummary(report));
  }
  // Audit completed successfully even if its verdict is HOLD.
  // The workflow has NO deployment job or approval/effect mechanism.
}

const invokedDirectly = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error('RELEASE_PREFLIGHT=HOLD DECISION=NO_GO VERIFICATION_FAILED=' +
      (error instanceof Error ? error.message : 'unknown'));
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '## Release audit failed closed\n\n**NO-GO** — evidence unavailable or untrusted.\n');
    }
    process.exitCode = 1;
  });
}
