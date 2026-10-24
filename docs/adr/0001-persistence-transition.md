# ADR-0001 — Relational persistence and atomic audit transition

- **Status:** Proposed (**not** an approved production migration)
- **Date:** 2026-10-24
- **Owner:** RotaClub project owner / technical approver
- **Related issues:** [#13 database](https://github.com/Rifat-Akin/RotaClub/issues/13), [#14 synchronization](https://github.com/Rifat-Akin/RotaClub/issues/14), [#18 audit](https://github.com/Rifat-Akin/RotaClub/issues/18), [#19 recovery](https://github.com/Rifat-Akin/RotaClub/issues/19), [#39 finance](https://github.com/Rifat-Akin/RotaClub/issues/39)

## Verified current architecture

The Express app imports `AtomicMultiTenantStore` from `src/server/pilotEngine.ts`. Its current persistence is JSON/file based; `src/server/postgresSchema.sql` is present but not proof of a live PostgreSQL connection. Certain mutations and appended audit entries use separate writes. Source-code and CI passes do not demonstrate durability under crash, concurrent processes or off-host restoration.

## Proposed decision

Introduce a versioned PostgreSQL runtime path with transactional domain commands (attendance, payments, approvals, memberships). In each critical write, update authoritative state, enforce unique/idempotency constraints and append the audit record **in the same database transaction**. Do not use broad client-owned state replacement for financial/identity records.

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
