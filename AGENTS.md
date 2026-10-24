# RotaClub agent working contract

GitHub `main`, linked issues and CI runs are the code source of truth. Treat agent statements, screenshot claims and local test logs as **unverified** until the matching remote SHA and checks are read back.

## Project boundary

- `server.ts`: Express APIs, session and server-side authorization.
- `src/server/pilotEngine.ts`: tenant store, authentication, migration, audit.
- `src/App.tsx`, `src/components/**`: UI; `src/types/**` and `src/utils/**`: app logic and tests.
- `.github/**`, `README.md`, `AGENTS.md`, `docs/adr/**`, `scripts/check-secrets.mjs`: CI, quality and contributor documents.

For the **24 October 2026 next-pull handoff**, Google AI Studio's next writer lane is application/API/runtime and their tests (`server.ts`, `src/**`); ChatGPT's writer lane is `.github/**`, `README.md`, `AGENTS.md`, `docs/**`, and `scripts/check-*.mjs` / release evidence scripts. As of independently reviewed application SHA `99926167584018c7261fd6dcd1da04084548185b`, no simultaneous AI Studio edit is claimed. **Always fetch fresh `main` and active PRs before acquiring a file lease.** Do not overwrite a newer writer or infer branch selection support in AI Studio without verifying its GitHub sync UI.

At this SHA, application security HOLD findings are anchored in [#13](https://github.com/Rifat-Akin/RotaClub/issues/13#issuecomment-6384005197), [#70](https://github.com/Rifat-Akin/RotaClub/issues/70#issuecomment-6384004355), [#24](https://github.com/Rifat-Akin/RotaClub/issues/24#issuecomment-6384005983), [#39](https://github.com/Rifat-Akin/RotaClub/issues/39#issuecomment-6384008057) and [#34](https://github.com/Rifat-Akin/RotaClub/issues/34#issuecomment-6384007235). Real PostgreSQL and club pilot approval remain HOLD. `main` only blocks deletion/force-push; a second PR + required-check ruleset is currently **disabled** to preserve AI Studio direct sync.

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
