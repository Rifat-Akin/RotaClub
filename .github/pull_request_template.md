## Purpose / issue
- Related existing issue(s): #
- Scope and base SHA:
- Writer / file ownership confirmed:
- Current state: IMPLEMENTED / CI_PASS / STAGING_VERIFIED / PILOT_ACCEPTED

## Changes
- Product or API behavior:
- Files/modules changed:
- Data/schema migration and backward compatibility:

## Verification (include exact GitHub Actions run URL)
- [ ] `npm run lint` (TypeScript typecheck, not ESLint)
- [ ] `npm test` (unit + API integration)
- [ ] `npm run build`
- [ ] `node scripts/check-secrets.mjs --self-test`
- [ ] `node scripts/check-secrets.mjs`
- [ ] `npm audit --omit=dev --audit-level=high`
- [ ] Negative RBAC / tenant / replay and concurrency tests, where affected
- [ ] Device/browser E2E or staging smoke, where affected

**Commands, results and test limitations:**

## Privacy, security and real-world effect
- [ ] No secrets, real member data, bank statements or scholarship PII committed
- [ ] Auth/tenant/financial boundaries reviewed if touched
- [ ] Real messages, actual payments, live data and official document activation remain disabled until separately authorized

## Rollback, monitoring and release
- Rollback steps:
- Staging/backward-compatibility evidence:
- Known risks / remaining HOLD items:
- Screenshots or redacted API evidence (if UI changed):

## Independent review and GitHub read-back
- Reviewer:
- Remote commit SHA:
- CI URL:
- Related acceptance issue(s) updated only after verification:
