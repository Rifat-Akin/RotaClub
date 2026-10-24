# ADR-0001 — Relational persistence and atomic audit transition

- **Status:** Proposed (**not** an approved production migration)
- **Date:** 2026-10-24
- **Owner:** RotaClub project owner / technical approver
- **Related issues:** [#13 database](https://github.com/Rifat-Akin/RotaClub/issues/13), [#14 synchronization](https://github.com/Rifat-Akin/RotaClub/issues/14), [#18 audit](https://github.com/Rifat-Akin/RotaClub/issues/18), [#19 recovery](https://github.com/Rifat-Akin/RotaClub/issues/19), [#39 finance](https://github.com/Rifat-Akin/RotaClub/issues/39)

## Verified current architecture

The Express app still imports `AtomicMultiTenantStore` from `src/server/pilotEngine.ts`: production-facing API persistence remains **single-process JSON/file CAS**, not PostgreSQL. As of independently audited main `4872a964e8736a7ed05bcf92e6baf7c9d0fe41db`, key mutation paths (including tenant restore/reset) stage state and SHA-256 chained audit together before a single file replacement, and injected write-failure plus restart tests pass. This corrects the previous blanket claim that those paths necessarily have split state/audit writes. However it does **not** prove multi-process durability, off-host restore or live PostgreSQL ACID.

`src/server/sqlRelationalEngine.ts` now executes an adapted copy of `src/server/postgresSchema.sql` using Node's **in-memory SQLite** engine for FK/UNIQUE/CHECK/rollback verification and sample migration. It is not a deployed PostgreSQL connection or a validated no-loss migrator.

## Proposed decision

Introduce a versioned PostgreSQL runtime path with transactional domain commands (attendance, payments, approvals, memberships). In each critical write, update authoritative state, enforce unique/idempotency constraints and append the audit record **in the same database transaction**. Do not use broad client-owned state replacement for financial/identity records.

## Updated source audit checkpoint — 24 October 2026

**Source:** `4872a964e8736a7ed05bcf92e6baf7c9d0fe41db` · [CI 29/29 PASS](https://github.com/Rifat-Akin/RotaClub/actions/runs/40099095320). The five items from the earlier `9992616` audit were **historical**; do not repeat the previously fixed defects as current vulnerabilities. This is a source checkpoint, not a production migration approval.

1. **#70 tenant-qualified SQL FKs — SOURCE FIXED:** `postgresSchema.sql` now uses composite club-scoped member and guest FKs. The SQLite engine includes deliberate Club-A/Club-B cross-tenant negative cases. [Re-review](https://github.com/Rifat-Akin/RotaClub/issues/70#issuecomment-6384959923). Real PostgreSQL, migration and multi-instance proofs are pending.
2. **#13 unknown identity and migration table coverage — PARTIAL SOURCE FIX:** the first-member fallback is removed in favor of `MIGRATION_HOLD_UNRESOLVED_MEMBER_IDENTITY`; all 13 tables, including member lifecycle, RSVP, makeup and write-off journal, have migration code. `INSERT OR REPLACE` is no longer used for operational migration. **Remaining:** verification compares row counts and aggregate financial totals; it does not prove all per-row identity/field hashes, full collision handling, backup recovery or live PostgreSQL. [Re-review](https://github.com/Rifat-Akin/RotaClub/issues/13#issuecomment-6384960643).
3. **#24/#39 debt-waiver governance — PARTIAL SOURCE FIX:** a proposal is Draft and requires distinct authenticated President and Treasurer approvals; state change and an audit-linked write-off journal are staged together. **Remaining P0:** the `sourceReceivableIds` array is constructed from first category-wide records, or fabricated strings if missing, without verified member-owned receivable allocation; zeroing balances is therefore not valid financial reconciliation. YK meeting identity and official quorum evidence also remain unbound. [Finance #39](https://github.com/Rifat-Akin/RotaClub/issues/39#issuecomment-6384957806) · [Governance #24](https://github.com/Rifat-Akin/RotaClub/issues/24#issuecomment-6384958456).
4. **#34 attendance threshold and future-dated meetings — SOURCE FIXED:** RI 60% check is now distinct from configurable club policy; future-dated meetings cannot be counted as held regardless of status/checkins. [Re-review](https://github.com/Rifat-Akin/RotaClub/issues/34#issuecomment-6384966177). Real meeting-ledger UAT remains pending.
5. **#76 personal-account security — P0 HOLD:** `/api/auth/register-member-account` still activates new accounts with an officer-chosen password, bypassing personal invitation. `issue-member-invite` returns token + target identity to issuer; `claim-member-invite` only checks echoed email/Rotary ID, not independent ownership. Require verified recipient-controlled delivery or identity provider, and no alternate active-account provisioning path. [Independent review](https://github.com/Rifat-Akin/RotaClub/issues/76#issuecomment-6384956291).
6. **#19 recovery and production runtime — HOLD:** JSON/file CAS is the active API store. In-memory SQLite is a verification helper, not an already deployed PostgreSQL cluster. No encrypted off-host backup/isolated restore evidence or production migration approval. [#19](https://github.com/Rifat-Akin/RotaClub/issues/19).

**No release authorization:** remain `NO-GO` for real member activation, financial write-offs, external messages or production migration until the referenced P0 issues and independent pilot acceptance are resolved. ADR stays `Proposed`.

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
