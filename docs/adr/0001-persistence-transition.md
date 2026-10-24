# ADR-0001 — Relational persistence and atomic audit transition

- **Status:** Proposed (**not** an approved production migration)
- **Date:** 2026-10-24
- **Owner:** RotaClub project owner / technical approver
- **Related issues:** [#13 database](https://github.com/Rifat-Akin/RotaClub/issues/13), [#14 synchronization](https://github.com/Rifat-Akin/RotaClub/issues/14), [#18 audit](https://github.com/Rifat-Akin/RotaClub/issues/18), [#19 recovery](https://github.com/Rifat-Akin/RotaClub/issues/19), [#39 finance](https://github.com/Rifat-Akin/RotaClub/issues/39)

## Verified current architecture

The Express app still imports `AtomicMultiTenantStore` from `src/server/pilotEngine.ts`: production-facing API persistence remains **single-process JSON/file CAS**, not PostgreSQL. As of main `99926167584018c7261fd6dcd1da04084548185b`, key mutation paths (including tenant restore/reset) stage state and SHA-256 chained audit together before a single file replacement, and injected write-failure plus restart tests pass. This corrects the previous blanket claim that those paths necessarily have split state/audit writes. However it does **not** prove multi-process durability, off-host restore or live PostgreSQL ACID.

`src/server/sqlRelationalEngine.ts` now executes an adapted copy of `src/server/postgresSchema.sql` using Node's **in-memory SQLite** engine for FK/UNIQUE/CHECK/rollback verification and sample migration. It is not a deployed PostgreSQL connection or a validated no-loss migrator.

## Proposed decision

Introduce a versioned PostgreSQL runtime path with transactional domain commands (attendance, payments, approvals, memberships). In each critical write, update authoritative state, enforce unique/idempotency constraints and append the audit record **in the same database transaction**. Do not use broad client-owned state replacement for financial/identity records.

## Current mandatory design corrections — independent audit 24 October 2026

These are **source findings at** `99926167584018c7261fd6dcd1da04084548185b` with [GitHub CI success](https://github.com/Rifat-Akin/RotaClub/actions/runs/40092231757); they are not claims of a live exploit.

1. **Composite tenant FKs:** `postgresSchema.sql` currently references `rotary_members(id)` for meeting attendance and verified guest officer, and `verified_guest_attendances(id)` for certificates without matching club identity. A synthetic SQLite reproduction with `PRAGMA foreign_keys=ON` accepted club B attendance tied to club A's member and club B certificate tied to club A's guest evidence. Every cross-entity relation needs the same-club constraint plus negative tests on both SQLite and PostgreSQL. [#70](https://github.com/Rifat-Akin/RotaClub/issues/70#issuecomment-6384004355).
2. **No guessed identities:** `SqlRelationalVerificationEngine.resolveCanonicalSqlMemberId` currently falls back to the tenant's first member when encountering an unresolved source ID/name. Migrations must **HOLD/quarantine** unknown or duplicate identity instead of fabricating attendance, guest evidence or historical audit identities. [#13](https://github.com/Rifat-Akin/RotaClub/issues/13#issuecomment-6384005197).
3. **Complete, reversible migration:** `member_lifecycle_history`, `meeting_rsvps` and `makeup_submissions` tables exist but are not populated by `migrateTenantState`; only member/meeting/audit row counts are read back. Replace indiscriminate `INSERT OR REPLACE` with tenant-safe, lossless writes and prove per-table/per-tenant counts, IDs, amounts, hashes, idempotent reruns and rollback before cutover. [#13](https://github.com/Rifat-Akin/RotaClub/issues/13#issuecomment-6384005197).
4. **Governance and financial integrity:** the current debt-waiver endpoint can create `'Oybirliği ile Kabul'` / Approved on one officer's request, and exit then zeroes debt balances without a matching immutable write-off journal. Do not claim a genuine board vote, resolved financial liability or official approval without independent decision evidence and balanced transaction postings. [#24](https://github.com/Rifat-Akin/RotaClub/issues/24#issuecomment-6384005983) / [#39](https://github.com/Rifat-Akin/RotaClub/issues/39#issuecomment-6384008057).
5. **Actual runtime + recovery:** in-memory SQLite tests do not establish live PostgreSQL, concurrent writer behavior, authenticated encrypted off-host backups or isolated restore. [#18](https://github.com/Rifat-Akin/RotaClub/issues/18#issuecomment-6384016084) / [#19](https://github.com/Rifat-Akin/RotaClub/issues/19#issuecomment-6384016699).

None of these findings authorizes new financial operations, migrations or live member access. This ADR stays **Proposed** pending architecture, governance and production approval.

## Alternatives

1. **Keep JSON files:** minimal immediate operating cost, but hard to prove multi-process transaction safety, typed constraints and isolated audit.
2. **SQLite with WAL and constrained single-writer semantics:** viable bounded pilot option; requires explicit topology, locking, migration and backup acceptance.
3. **PostgreSQL:** scalable transaction/FK/unique controls, but operational overhead, credentials, migration and recovery procedures must be tested.

This is a design proposal, not authorization to provision services or move production data.

## Migration and acceptance

1. Inventory and snapshot all existing pilot file formats; verify encrypted backups and old-version recovery before writing.
2. Build schema migration with dry-run, foreign-key/unique checks, tenant IDs, minor-unit money representation and explicit no-loss mapping.
3. Test positive/negative role/tenant access, concurrent and replayed mutations, rejected financial double posting, injected crash between state and audit, and rollback.
4. Validate isolated restoration with record counts, ledger totals and audit-chain reconciliation.
5. Deploy to synthetic staging first; require separate owner/club approval before real personal or financial data is imported.

**Gate:** This ADR remains `Proposed` until architecture and data owners approve the actual runtime choice and operational costs.
