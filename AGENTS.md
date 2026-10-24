# RotaClub agent working contract

GitHub `main`, linked issues and CI runs are the code source of truth. Treat agent statements, screenshot claims and local test logs as **unverified** until the matching remote SHA and checks are read back.

## Project boundary

- `server.ts`: Express APIs, session and server-side authorization.
- `src/server/pilotEngine.ts`: tenant store, authentication, migration, audit.
- `src/App.tsx`, `src/components/**`: UI; `src/types/**` and `src/utils/**`: app logic and tests.
- `.github/**`, `README.md`, `AGENTS.md`, `docs/adr/**`, `scripts/check-secrets.mjs`: CI, quality and contributor documents.

For the **24 October 2026 two-writer handoff**, Google AI Studio owns application/API/runtime and application tests (`server.ts`, `src/**`); ChatGPT owns `.github/**`, `README.md`, `AGENTS.md`, `docs/**`, and `scripts/**` CI/security/release evidence tools. **Always fetch fresh `main` and open PRs before acquiring a file lease.** Do not overwrite another writer or assume AI Studio supports feature-branch GitHub Sync without UI verification.

**Last independently audited application source:** `4872a964e8736a7ed05bcf92e6baf7c9d0fe41db` (CI 29/29 PASS, source-only). P0 HOLD items: [#76 personal invite ownership and alternative account-registration path](https://github.com/Rifat-Akin/RotaClub/issues/76#issuecomment-6384956291), [#39 actual member receivable allocation and journal legitimacy](https://github.com/Rifat-Akin/RotaClub/issues/39#issuecomment-6384957806). Partial positive fixes: [#70 composite SQL tenant FKs](https://github.com/Rifat-Akin/RotaClub/issues/70#issuecomment-6384959923), [#34 RI60 attendance calculation](https://github.com/Rifat-Akin/RotaClub/issues/34#issuecomment-6384966177). Remain open: [#13 lossless migration verification](https://github.com/Rifat-Akin/RotaClub/issues/13#issuecomment-6384960643), [#24 actual YK meeting evidence](https://github.com/Rifat-Akin/RotaClub/issues/24#issuecomment-6384958456), production PostgreSQL, backup/restore and pilot WebAuthn. `main` forbids deletion/force-push but PR-required/CI-required ruleset `25780663` is still **disabled** to preserve AI Studio direct sync.

## Invariants

1. One active writer per file. Use isolated branches. Never mutate `main` directly as an agent, force-push, reset or silently discard another branch.
2. Fetch current `main` and the issue's acceptance criteria before edits. Record base SHA, changed paths, test command, results and rollout/rollback in the PR.
3. Authenticate/authorize every sensitive API from server-verified account, role and tenant membership; negative RBAC and cross-tenant tests are mandatory.
4. Do not allow generic client state sync to mint confirmed attendance, financial receipts, verified bank movements or official certificates. Authoritative actions must be server-side, idempotent and auditable.
5. Never commit actual member, scholarship or financial PII, credentials, private keys, secret .env files, raw private correspondence or screenshots revealing data. Use synthetic fixtures.
6. Real bank/payment effects, member invitations, external WhatsApp/email/SMS, live club data, third-party integrations and production release require separate scoped owner/club approval.
7. A `PASS` from `npm test` is a **source test**, not live-device, off-host-backup or full product acceptance. Do not close [#75](https://github.com/Rifat-Akin/RotaClub/issues/75) or [#76](https://github.com/Rifat-Akin/RotaClub/issues/76) without their specified evidence.

## Verification / done

```bash
npm ci --legacy-peer-deps
npm run lint
npm test
npm run build
node scripts/check-secrets.mjs --self-test
node scripts/check-secrets.mjs
npm audit --omit=dev --audit-level=high
```

`npm run lint` currently means TypeScript `tsc --noEmit`, not ESLint. CI, secret-pattern scanning and dependency auditing have separate scopes. New security-critical code needs its own adversarial cases; not every check can be satisfied by this baseline.

Every PR should link an existing issue, identify regression and negative tests, list changed files, explain data compatibility/migration, flag any known limitation, and show the GitHub Actions run. Independently read back the exact remote commit and PR status after a material write.

## Status honesty

Use `IMPLEMENTED`, `CI_PASS`, `STAGING_VERIFIED`, `PILOT_ACCEPTED` and `DONE` as separate states. An issue remains open when its broader acceptance criteria or real-world checks are unfinished. See [README.md](README.md) and [docs/adr](docs/adr/).
