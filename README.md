# RotaClub

RotaClub is a **pilot-stage** club operations application, currently oriented toward a synthetic Galata Rotary workflow. It uses **React 19 + Vite + TypeScript** on the frontend and **Express/TypeScript** on the API. Code is hosted in [Rifat-Akin/RotaClub](https://github.com/Rifat-Akin/RotaClub).

> **Production acceptance is not established.** Passing GitHub CI means typechecking, automated source tests and frontend build succeeded; it does not prove real-user onboarding, bank reconciliation, off-host recovery or launch approval. See [#76 security gate](https://github.com/Rifat-Akin/RotaClub/issues/76) and [#75 pilot acceptance](https://github.com/Rifat-Akin/RotaClub/issues/75).

## Current implementation boundaries

- Frontend entry: `src/App.tsx`; views: `src/components/`.
- API: `server.ts`; authentication, tenant store, migration and audit: `src/server/pilotEngine.ts`.
- Data currently includes synthetic fixtures in `src/data/mockGalataData.ts`.
- `src/server/postgresSchema.sql` is a **schema artifact**. Its presence does **not** mean PostgreSQL is the active runtime store; `AtomicMultiTenantStore` remains in use. Relational migration, backup and restore are tracked in [#13](https://github.com/Rifat-Akin/RotaClub/issues/13) and [#19](https://github.com/Rifat-Akin/RotaClub/issues/19).
- External messaging, real payments, real member invitations and official document activation must stay behind their separate approval gates.

## Local development (synthetic data only)

Use **Node.js 22**, npm and Git.

```bash
npm ci --legacy-peer-deps
npm run dev
```

The Express/Vite development server is configured in `server.ts` (default port **3000**). Do **not** put real member data or production tokens in the local pilot database. `.env.example` documents environment variable names; provide private values via an appropriate secret store, never commit `.env` or paste credentials into GitHub issues.

## Verification commands

```bash
npm run lint       # TypeScript typecheck: tsc --noEmit (NOT ESLint)
npm run test:unit
npm run test:integration
npm test           # both test suites
npm run build
node scripts/check-secrets.mjs --self-test
node scripts/check-secrets.mjs
node scripts/check-ci-policy.mjs --self-test
node scripts/check-ci-policy.mjs
node --test scripts/release-preflight.test.mjs
npm audit --omit=dev --audit-level=high
```

GitHub Actions runs the typecheck, tests, build, tracked-file secret scan and production dependency audit. CI's external GitHub Actions are pinned to reviewed commit SHAs, checkout credentials are not persisted, and `check-ci-policy.mjs` tests regressions to these controls. To upgrade an action, verify the new commit against the official upstream repository and update the CI and the script's reviewed SHA list together. A passing source scan is **not** a full historical secret exposure audit. The frontend build is **not** an approved production deployment.

## Branch, review and release workflow

1. Pick an existing GitHub issue and inspect its acceptance conditions. Check current `main` and the active writer's scope.
2. Create `feature/rotaclub-<issue>-<topic>`. Use one writer per overlapping file; do not force-push or overwrite another agent's work.
3. Keep PRs small, attach tests and a rollback strategy, and use the [PR template](.github/pull_request_template.md). Include a source SHA and links to GitHub Actions.
4. Require independent review for authentication, multi-tenant isolation, financial state, privacy, backup and official certificates. **Do not equate local PASS with production GO.**
5. Merge only after relevant checks and review; re-read remote `main` and the issue before claiming completion. Enable branch protection/required checks in repository settings; a workflow file alone does not enforce a protected `main`.

## Read-only release evidence audit (#21)

The manually triggered [RotaClub Release Evidence Audit](.github/workflows/release-preflight.yml) checks current GitHub `main` SHA, protected branch/required checks, CI results on that exact SHA, and the state of release/security/pilot issues #21, #75 and #76. Go to **GitHub Actions → RotaClub Release Evidence Audit (NO DEPLOY) → Run workflow**, on `main`, only when an evidence read-back is useful.

The workflow runs with **read-only** GitHub permissions; it neither deploys, enables real users/outbound communications nor writes approvals. A successful *audit workflow* run means the check executed, **not** that the product is ready. Its summary always reports `RELEASE_DECISION=NO_GO`, `DEPLOYMENT_AUTHORIZED=NO`, and machine-checkable prerequisites as `PASS` or `HOLD`. Even closed issues and green CI **cannot replace** explicit authorized owner/club approval, two-device UAT, isolated restore and a separate release decision. Never use this report to auto-deploy.

## Release and rollback

- **Development:** synthetic fixtures and local-only test accounts.
- **Staging:** isolated service, credentials and data; verify auth, API denial cases, database migrations and smoke tests. External effects disabled by default.
- **Production:** remains **HOLD** until the owner/club approves the scope after [#75](https://github.com/Rifat-Akin/RotaClub/issues/75) and the [#76](https://github.com/Rifat-Akin/RotaClub/issues/76) security review, including real-device UAT and verified restore.
- **Rollback:** retain the previous deploy artifact and an independently verified, encrypted and access-controlled backup before any migration; test a restore in isolation. Do not overwrite or reset meaningful data as a fallback.

Architecture status and proposed database transition are in [docs/adr](docs/adr/). This repository's currently tracked operational evidence is GitHub code, PRs, issues and Actions—not chat summaries.
