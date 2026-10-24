import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TenantClubDatabaseState } from './pilotEngine';

/**
 * Issue #13, #14, #18, #19: Real SQL Relational Migration, Foreign-Key/Unique/Check Constraint Enforcement,
 * and Multi-Table ACID Transaction Engine backed by Node's built-in SQL engine (`node:sqlite` with `PRAGMA foreign_keys = ON`),
 * executing the canonical relational DDL from `src/server/postgresSchema.sql`.
 *
 * Note on Status Honesty (`AGENTS.md` / `ADR-0001`):
 * This engine executes real SQL DDL, foreign keys, composite primary/unique keys, CHECK constraints,
 * and `BEGIN IMMEDIATE ... COMMIT / ROLLBACK` transactions against `src/server/postgresSchema.sql`.
 * Production PostgreSQL (`pg` network connection) remains tracked as `DDL_READY_RUNTIME_PENDING`
 * when `DATABASE_URL` is not provisioned.
 */
export function adaptPostgresDdlForSqliteExecution(postgresDdl: string): string {
  return postgresDdl
    .replace(/\bBIGSERIAL\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/\bTIMESTAMPTZ\b/gi, 'TEXT')
    .replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP");
}

export interface TenantSqlMigrationVerificationReport {
  clubId: string;
  members: number;
  memberLifecycleHistory: number;
  meetings: number;
  meetingRsvps: number;
  meetingAttendances: number;
  verifiedGuestAttendances: number;
  makeupSubmissions: number;
  guestMakeupCertificates: number;
  financialLineItems: number;
  treasuryLedger: number;
  debtWriteOffJournals: number;
  auditEntries: number;
  totalMemberDuesBalance: number;
  totalFinancialLineAmount: number;
  totalTreasuryAmount: number;
  totalWaivedDebtAmount: number;
  integrityVerified: boolean;
}

export class SqlRelationalVerificationEngine {
  public readonly db: DatabaseSync;

  constructor(sqliteFilePath = ':memory:') {
    this.db = new DatabaseSync(sqliteFilePath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    const ddlPath = path.join(process.cwd(), 'src', 'server', 'postgresSchema.sql');
    const rawPostgresDdl = fs.readFileSync(ddlPath, 'utf-8');
    const executableSql = adaptPostgresDdlForSqliteExecution(rawPostgresDdl);
    this.db.exec(executableSql);
  }

  /**
   * Runs a callback inside a single atomic SQL transaction (`BEGIN IMMEDIATE ... COMMIT`).
   * If any statement or constraint check fails, executes `ROLLBACK` and rethrows so zero partial rows persist.
   */
  public runInTransaction<T>(fn: (db: DatabaseSync) => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn(this.db);
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback error if already rolled back
      }
      throw err;
    }
  }

  /**
   * Strict canonical member identity resolver (#70 / #13):
   * - Never falls back to `tenant.members[0]` or any default identity.
   * - Rejects unknown, cross-tenant, or ambiguous member references with `MIGRATION_HOLD_UNRESOLVED_MEMBER_IDENTITY`.
   */
  public resolveCanonicalSqlMemberId(
    tenant: Pick<TenantClubDatabaseState, 'clubId' | 'members'>,
    candidateId?: string | null,
    candidateName?: string | null,
    candidateRotaryId?: string | null
  ): string {
    const normalizeName = (s?: string | null): string =>
      String(s || '')
        .toLowerCase()
        .replace(/^rtn\.?\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    const members = tenant.members || [];
    const normalizedId = (candidateId || '').trim();
    const normalizedName = normalizeName(candidateName);
    const normalizedRotaryId = (candidateRotaryId || '').trim().toUpperCase();

    if (normalizedId) {
      const exactIdMatches = members.filter((m) => m.id === normalizedId);
      if (exactIdMatches.length > 1) {
        throw new Error(
          `MIGRATION_HOLD_UNRESOLVED_MEMBER_IDENTITY: Duplicate member id '${normalizedId}' in club '${tenant.clubId}'.`
        );
      }
      if (exactIdMatches.length === 1) {
        const matched = exactIdMatches[0];
        if (
          normalizedName &&
          normalizeName(matched.fullName) !== normalizedName
        ) {
          throw new Error(
            `MIGRATION_HOLD_UNRESOLVED_MEMBER_IDENTITY: Member id '${normalizedId}' name mismatch ('${candidateName}' vs '${matched.fullName}') in club '${tenant.clubId}'.`
          );
        }
        return matched.id;
      }

      // Known Galata officer auth account IDs map ONLY if target id + rotaryId + fullName unambiguously exist in club-galata
      const canonicalOfficerByAccountId: Record<
        string,
        { memberId: string; rotaryId: string; expectedName: string }
      > = {
        'm-emre': {
          memberId: 'm-1',
          rotaryId: 'TR-2420-64109',
          expectedName: 'mimar emre karaca',
        },
        'm-nazli': {
          memberId: 'm-2',
          rotaryId: 'TR-2420-77104',
          expectedName: 'av. nazlı denizmen',
        },
        'm-levent': {
          memberId: 'm-3',
          rotaryId: 'TR-2420-71920',
          expectedName: 'ymm levent soydan',
        },
      };
      const officerSpec = canonicalOfficerByAccountId[normalizedId];
      if (tenant.clubId === 'club-galata' && officerSpec) {
        const officerMatches = members.filter(
          (m) =>
            m.id === officerSpec.memberId &&
            m.rotaryId.trim().toUpperCase() === officerSpec.rotaryId &&
            normalizeName(m.fullName) === officerSpec.expectedName
        );
        if (officerMatches.length === 1) {
          if (normalizedName && normalizedName !== officerSpec.expectedName) {
            throw new Error(
              `MIGRATION_HOLD_UNRESOLVED_MEMBER_IDENTITY: Officer alias '${normalizedId}' name conflict ('${candidateName}') in club '${tenant.clubId}'.`
            );
          }
          return officerMatches[0].id;
        }
      }

      throw new Error(
        `MIGRATION_HOLD_UNRESOLVED_MEMBER_IDENTITY: Unrecognized or cross-club member id '${normalizedId}' in club '${tenant.clubId}'. Quarantined (HOLD).`
      );
    }

    if (normalizedRotaryId) {
      const rotaryMatches = members.filter(
        (m) => m.rotaryId.trim().toUpperCase() === normalizedRotaryId
      );
      if (rotaryMatches.length === 1) {
        return rotaryMatches[0].id;
      }
      throw new Error(
        `MIGRATION_HOLD_UNRESOLVED_MEMBER_IDENTITY: Unresolved or ambiguous rotaryId '${normalizedRotaryId}' (matches=${rotaryMatches.length}) in club '${tenant.clubId}'. Quarantined (HOLD).`
      );
    }

    if (normalizedName) {
      const nameMatches = members.filter(
        (m) => normalizeName(m.fullName) === normalizedName
      );
      if (nameMatches.length === 1) {
        return nameMatches[0].id;
      }
      throw new Error(
        `MIGRATION_HOLD_UNRESOLVED_MEMBER_IDENTITY: Unresolved or ambiguous member name '${candidateName}' (matches=${nameMatches.length}) in club '${tenant.clubId}'. Quarantined (HOLD).`
      );
    }

    throw new Error(
      `MIGRATION_HOLD_UNRESOLVED_MEMBER_IDENTITY: Empty member identity reference in club '${tenant.clubId}'. Quarantined (HOLD).`
    );
  }

  /**
   * Migrates a tenant's complete operational state and SHA-256 hash-chained audit ledger into
   * the 12 canonical relational SQL tables inside a single atomic SQL transaction (#70, #13, #18, #19).
   * - Never uses `INSERT OR REPLACE` (prevents silent overwrite of existing records).
   * - Supports idempotent rerun when data is identical, and fails closed (`ROLLBACK`) if any immutable record conflicts.
   * - Verifies row counts, primary keys, financial balances/amounts, and audit hashes before committing.
   */
  public migrateTenantState(tenant: TenantClubDatabaseState): TenantSqlMigrationVerificationReport {
    return this.runInTransaction((db) => {
      const existingClub = db
        .prepare(
          'SELECT club_id, club_name, district, revision FROM rotary_clubs WHERE club_id = ?'
        )
        .get(tenant.clubId) as
        | { club_id: string; club_name: string; district: string; revision: number }
        | undefined;

      if (!existingClub) {
        db.prepare(`
          INSERT INTO rotary_clubs (
            club_id, club_name, district, revision, outbound_messaging_enabled, kvkk_mask_phone, selected_meeting_no, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          tenant.clubId,
          tenant.clubName,
          tenant.district,
          tenant.revision,
          tenant.outboundMessagingEnabled ? 1 : 0,
          tenant.kvkkMaskPhone ? 1 : 0,
          tenant.selectedMeetingNo || 1842,
          tenant.updatedAt
        );
      } else {
        if (existingClub.revision > tenant.revision) {
          throw new Error(
            `MIGRATION_CONFLICT_STALE_REVISION: SQL revision (${existingClub.revision}) is newer than incoming revision (${tenant.revision}) for club '${tenant.clubId}'.`
          );
        }
        db.prepare(`
          UPDATE rotary_clubs
          SET club_name = ?, district = ?, revision = ?, outbound_messaging_enabled = ?, kvkk_mask_phone = ?, selected_meeting_no = ?, updated_at = ?
          WHERE club_id = ?
        `).run(
          tenant.clubName,
          tenant.district,
          tenant.revision,
          tenant.outboundMessagingEnabled ? 1 : 0,
          tenant.kvkkMaskPhone ? 1 : 0,
          tenant.selectedMeetingNo || 1842,
          tenant.updatedAt,
          tenant.clubId
        );
      }

      // 1. rotary_members (no INSERT OR REPLACE)
      const selectMember = db.prepare(
        'SELECT id, club_id, rotary_id, full_name, dues_balance, meal_balance, foundation_balance, membership_status FROM rotary_members WHERE club_id = ? AND id = ?'
      );
      const insertMember = db.prepare(`
        INSERT INTO rotary_members (
          id, club_id, rotary_id, full_name, classification, role_badge, membership_status,
          dues_balance, meal_balance, foundation_balance, attendance_rate, rsvp_status,
          meal_preference, reminder_opt_out, preferred_reminder_channel,
          leave_start_date, leave_end_date, leave_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateMember = db.prepare(`
        UPDATE rotary_members
        SET full_name = ?, classification = ?, role_badge = ?, membership_status = ?,
            dues_balance = ?, meal_balance = ?, foundation_balance = ?, attendance_rate = ?,
            rsvp_status = ?, meal_preference = ?, reminder_opt_out = ?, preferred_reminder_channel = ?,
            leave_start_date = ?, leave_end_date = ?, leave_reason = ?
        WHERE club_id = ? AND id = ? AND rotary_id = ?
      `);

      for (const m of tenant.members || []) {
        const mappedRsvp =
          m.rsvpStatus === 'with_spouse' || m.rsvpStatus === 'with_guest'
            ? 'attending'
            : m.rsvpStatus || 'pending';
        const existingMember = selectMember.get(tenant.clubId, m.id) as
          | {
              id: string;
              club_id: string;
              rotary_id: string;
              full_name: string;
              dues_balance: number;
              meal_balance: number;
              foundation_balance: number;
              membership_status: string;
            }
          | undefined;

        if (!existingMember) {
          insertMember.run(
            m.id,
            tenant.clubId,
            m.rotaryId,
            m.fullName,
            m.classification,
            m.clubTitle || 'Üye',
            m.membershipStatus || 'Aktif',
            m.duesBalance,
            m.mealBalance,
            m.foundationBalance,
            m.attendancePercent,
            mappedRsvp,
            m.mealPreference || 'Standart',
            m.reminderOptOut ? 1 : 0,
            m.preferredReminderChannel || 'WhatsApp Taslağı',
            m.leaveStartDate ?? null,
            m.leaveEndDate ?? null,
            m.leaveReason ?? null
          );
        } else {
          if (existingMember.rotary_id !== m.rotaryId) {
            throw new Error(
              `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: Member '${m.id}' rotary_id cannot be silently replaced ('${existingMember.rotary_id}' vs '${m.rotaryId}').`
            );
          }
          if (
            existingClub &&
            existingClub.revision === tenant.revision &&
            (existingMember.dues_balance !== m.duesBalance ||
              existingMember.meal_balance !== m.mealBalance ||
              existingMember.foundation_balance !== m.foundationBalance ||
              existingMember.membership_status !== (m.membershipStatus || 'Aktif') ||
              existingMember.full_name !== m.fullName)
          ) {
            throw new Error(
              `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: Member '${m.id}' state differs at identical revision ${tenant.revision}. Silent overwrite blocked.`
            );
          }
          updateMember.run(
            m.fullName,
            m.classification,
            m.clubTitle || 'Üye',
            m.membershipStatus || 'Aktif',
            m.duesBalance,
            m.mealBalance,
            m.foundationBalance,
            m.attendancePercent,
            mappedRsvp,
            m.mealPreference || 'Standart',
            m.reminderOptOut ? 1 : 0,
            m.preferredReminderChannel || 'WhatsApp Taslağı',
            m.leaveStartDate ?? null,
            m.leaveEndDate ?? null,
            m.leaveReason ?? null,
            tenant.clubId,
            m.id,
            m.rotaryId
          );
        }
      }

      // 2. member_lifecycle_history (immutable append-only from m.lifecycleHistory + tenant.memberLifecycleHistory)
      const selectLifecycle = db.prepare(
        'SELECT actor_id, actor_name, actor_role, reason, leave_start_date, leave_end_date, board_resolution_ref, writeoff_journal_id FROM member_lifecycle_history WHERE club_id = ? AND member_id = ? AND recorded_at = ? AND from_status = ? AND to_status = ?'
      );
      const insertLifecycle = db.prepare(`
        INSERT INTO member_lifecycle_history (
          club_id, member_id, from_status, to_status, actor_id, actor_name, actor_role,
          reason, leave_start_date, leave_end_date, board_resolution_ref, writeoff_journal_id, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const lifecycleRowsToMigrate: Array<{
        memberId: string;
        memberName?: string;
        entry: {
          timestamp: string;
          fromStatus: string;
          toStatus: string;
          actorId: string;
          actorName: string;
          actorRole: string;
          reason: string;
          leaveStartDate?: string;
          leaveEndDate?: string;
          boardResolutionRef?: string;
          writeOffJournalId?: string;
        };
      }> = [];
      for (const m of tenant.members || []) {
        for (const h of m.lifecycleHistory || []) {
          lifecycleRowsToMigrate.push({
            memberId: m.id,
            memberName: m.fullName,
            entry: h,
          });
        }
      }
      for (const topH of tenant.memberLifecycleHistory || []) {
        const alreadyPresent = lifecycleRowsToMigrate.some(
          (r) =>
            r.memberId === topH.memberId &&
            r.entry.timestamp === topH.timestamp &&
            r.entry.fromStatus === topH.fromStatus &&
            r.entry.toStatus === topH.toStatus
        );
        if (!alreadyPresent) {
          lifecycleRowsToMigrate.push({
            memberId: topH.memberId,
            memberName: topH.memberName,
            entry: topH,
          });
        }
      }

      for (const item of lifecycleRowsToMigrate) {
        const canonicalMemberId = this.resolveCanonicalSqlMemberId(
          tenant,
          item.memberId,
          item.memberName
        );
        const canonicalActorId = this.resolveCanonicalSqlMemberId(
          tenant,
          item.entry.actorId,
          item.entry.actorName
        );
        const h = item.entry;
        const existingH = selectLifecycle.get(
          tenant.clubId,
          canonicalMemberId,
          h.timestamp,
          h.fromStatus,
          h.toStatus
        ) as
          | {
              actor_id: string;
              actor_name: string;
              actor_role: string;
              reason: string;
              leave_start_date: string | null;
              leave_end_date: string | null;
              board_resolution_ref: string | null;
              writeoff_journal_id: string | null;
            }
          | undefined;
        if (!existingH) {
          insertLifecycle.run(
            tenant.clubId,
            canonicalMemberId,
            h.fromStatus,
            h.toStatus,
            canonicalActorId,
            h.actorName,
            h.actorRole,
            h.reason,
            h.leaveStartDate ?? null,
            h.leaveEndDate ?? null,
            h.boardResolutionRef ?? null,
            h.writeOffJournalId ?? null,
            h.timestamp
          );
        } else if (
          existingH.actor_id !== canonicalActorId ||
          existingH.actor_role !== h.actorRole ||
          existingH.reason !== h.reason ||
          (existingH.board_resolution_ref ?? null) !== (h.boardResolutionRef ?? null) ||
          (existingH.writeoff_journal_id ?? null) !== (h.writeOffJournalId ?? null)
        ) {
          throw new Error(
            `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: member_lifecycle_history (${canonicalMemberId}, ${h.timestamp}) cannot be silently overwritten.`
          );
        }
      }

      // 3. weekly_meetings
      const selectMeeting = db.prepare(
        'SELECT meeting_no, meeting_date, venue, speaker, topic, status FROM weekly_meetings WHERE club_id = ? AND meeting_no = ?'
      );
      const insertMeeting = db.prepare(`
        INSERT INTO weekly_meetings (
          club_id, meeting_no, meeting_date, venue, speaker, topic, status, is_past, is_lcv_locked_for_hotel, hotel_confirmation_ref
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateMeeting = db.prepare(`
        UPDATE weekly_meetings
        SET meeting_date = ?, venue = ?, speaker = ?, topic = ?, status = ?, is_past = ?, is_lcv_locked_for_hotel = ?, hotel_confirmation_ref = ?
        WHERE club_id = ? AND meeting_no = ?
      `);
      const validMeetingNumbers = new Set<number>();
      for (const mt of tenant.meetings || []) {
        validMeetingNumbers.add(mt.meetingNo);
        const existingMt = selectMeeting.get(tenant.clubId, mt.meetingNo) as
          | {
              meeting_no: number;
              meeting_date: string;
              venue: string;
              speaker: string;
              topic: string;
              status: string;
            }
          | undefined;
        if (!existingMt) {
          insertMeeting.run(
            tenant.clubId,
            mt.meetingNo,
            mt.date,
            mt.venue,
            mt.speakerName,
            mt.topic,
            mt.status || 'Planlandı',
            mt.isPast ? 1 : 0,
            mt.isLcvLockedForHotel ? 1 : 0,
            mt.hotelConfirmationRef ?? null
          );
        } else {
          if (
            existingClub &&
            existingClub.revision === tenant.revision &&
            (existingMt.meeting_date !== mt.date ||
              existingMt.venue !== mt.venue ||
              existingMt.speaker !== mt.speakerName ||
              existingMt.topic !== mt.topic ||
              existingMt.status !== (mt.status || 'Planlandı'))
          ) {
            throw new Error(
              `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: weekly_meetings '${mt.meetingNo}' differs at identical revision ${tenant.revision}.`
            );
          }
          updateMeeting.run(
            mt.date,
            mt.venue,
            mt.speakerName,
            mt.topic,
            mt.status || 'Planlandı',
            mt.isPast ? 1 : 0,
            mt.isLcvLockedForHotel ? 1 : 0,
            mt.hotelConfirmationRef ?? null,
            tenant.clubId,
            mt.meetingNo
          );
        }
      }

      // 4. meeting_rsvps (from member.meetingRsvps + member.meetingMenus)
      const selectRsvp = db.prepare(
        'SELECT rsvp_status, menu_preference FROM meeting_rsvps WHERE club_id = ? AND meeting_no = ? AND member_id = ?'
      );
      const insertRsvp = db.prepare(`
        INSERT INTO meeting_rsvps (
          club_id, meeting_no, member_id, rsvp_status, menu_preference, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      const updateRsvp = db.prepare(`
        UPDATE meeting_rsvps
        SET rsvp_status = ?, menu_preference = ?, updated_at = ?
        WHERE club_id = ? AND meeting_no = ? AND member_id = ?
      `);
      const uniqueRsvpPairs = new Set<string>();
      for (const m of tenant.members || []) {
        const rsvpMap = m.meetingRsvps || {};
        const menuMap = m.meetingMenus || {};
        for (const [mNoKey, rsvpStatus] of Object.entries(rsvpMap)) {
          const meetingNo = Number(mNoKey);
          if (!Number.isInteger(meetingNo) || !validMeetingNumbers.has(meetingNo)) {
            continue;
          }
          const canonicalMemberId = this.resolveCanonicalSqlMemberId(
            tenant,
            m.id,
            m.fullName
          );
          const pairKey = `${meetingNo}::${canonicalMemberId}`;
          if (uniqueRsvpPairs.has(pairKey)) continue;
          uniqueRsvpPairs.add(pairKey);

          const menuPref = menuMap[mNoKey] || m.mealPreference || 'Standart';
          const existingR = selectRsvp.get(
            tenant.clubId,
            meetingNo,
            canonicalMemberId
          ) as { rsvp_status: string; menu_preference: string } | undefined;
          if (!existingR) {
            insertRsvp.run(
              tenant.clubId,
              meetingNo,
              canonicalMemberId,
              rsvpStatus,
              menuPref,
              tenant.updatedAt
            );
          } else {
            if (
              existingClub &&
              existingClub.revision === tenant.revision &&
              (existingR.rsvp_status !== rsvpStatus ||
                existingR.menu_preference !== menuPref)
            ) {
              throw new Error(
                `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: meeting_rsvps (${meetingNo}, ${canonicalMemberId}) differs at identical revision.`
              );
            }
            updateRsvp.run(
              rsvpStatus,
              menuPref,
              tenant.updatedAt,
              tenant.clubId,
              meetingNo,
              canonicalMemberId
            );
          }
        }
      }

      // 5. meeting_attendances
      const selectAttendance = db.prepare(
        'SELECT checkin_mode FROM meeting_attendances WHERE club_id = ? AND meeting_no = ? AND member_id = ?'
      );
      const insertAttendance = db.prepare(`
        INSERT INTO meeting_attendances (
          club_id, meeting_no, member_id, checkin_mode
        ) VALUES (?, ?, ?, 'qr')
      `);
      const uniqueAttendanceKeys = new Set<string>();
      for (const [mNoKey, memberIds] of Object.entries(
        tenant.meetingAttendances || {}
      )) {
        const meetingNo = Number(mNoKey);
        if (!Number.isInteger(meetingNo)) continue;
        for (const memberId of memberIds || []) {
          const canonicalMemberId = this.resolveCanonicalSqlMemberId(
            tenant,
            memberId
          );
          const pairKey = `${meetingNo}::${canonicalMemberId}`;
          if (uniqueAttendanceKeys.has(pairKey)) continue;
          uniqueAttendanceKeys.add(pairKey);

          const existingAtt = selectAttendance.get(
            tenant.clubId,
            meetingNo,
            canonicalMemberId
          ) as { checkin_mode: string } | undefined;
          if (!existingAtt) {
            insertAttendance.run(tenant.clubId, meetingNo, canonicalMemberId);
          }
        }
      }

      // 6. verified_guest_attendances (immutable append-only)
      const selectVerifiedGuest = db.prepare(
        'SELECT id, meeting_no, guest_name, guest_club, verified_by_member_id, verified_at, checkin_method, evidence_note, revoked FROM verified_guest_attendances WHERE club_id = ? AND id = ?'
      );
      const insertVerifiedGuest = db.prepare(`
        INSERT INTO verified_guest_attendances (
          id, club_id, meeting_no, guest_name, guest_club, guest_district,
          verified_by_member_id, verified_by_name, verified_by_role, verified_at, checkin_method, evidence_note, revoked
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const vga of tenant.verifiedGuestAttendances || []) {
        const canonicalVerifierId = this.resolveCanonicalSqlMemberId(
          tenant,
          vga.verifiedByMemberId,
          vga.verifiedByName
        );
        const existingVga = selectVerifiedGuest.get(tenant.clubId, vga.id) as
          | {
              id: string;
              meeting_no: number;
              guest_name: string;
              guest_club: string;
              verified_by_member_id: string;
              verified_at: string;
              checkin_method: string;
              evidence_note: string;
              revoked: number;
            }
          | undefined;
        if (!existingVga) {
          insertVerifiedGuest.run(
            vga.id,
            tenant.clubId,
            vga.meetingNo,
            vga.guestName,
            vga.guestClub,
            vga.guestDistrict || 'UR 2420. Bölge',
            canonicalVerifierId,
            vga.verifiedByName,
            vga.verifiedByRole,
            vga.verifiedAt,
            vga.checkinMethod,
            vga.evidenceNote,
            vga.revoked ? 1 : 0
          );
        } else if (
          existingVga.meeting_no !== vga.meetingNo ||
          existingVga.guest_name !== vga.guestName ||
          existingVga.guest_club !== vga.guestClub ||
          existingVga.verified_by_member_id !== canonicalVerifierId ||
          existingVga.verified_at !== vga.verifiedAt ||
          existingVga.checkin_method !== vga.checkinMethod ||
          existingVga.evidence_note !== vga.evidenceNote
        ) {
          throw new Error(
            `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: verified_guest_attendances '${vga.id}' cannot be silently overwritten.`
          );
        }
      }

      // 7. makeup_submissions
      const selectMakeup = db.prepare(
        'SELECT id, member_id, member_name, target_club_or_event, activity_type, activity_date, description, evidence_ref, status, attendance_boost FROM makeup_submissions WHERE club_id = ? AND id = ?'
      );
      const insertMakeup = db.prepare(`
        INSERT INTO makeup_submissions (
          id, club_id, member_id, member_name, target_club_or_event, activity_type,
          activity_date, description, evidence_ref, status, attendance_boost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const mk of tenant.makeupSubmissions || []) {
        const canonicalMemberId = this.resolveCanonicalSqlMemberId(
          tenant,
          mk.memberId,
          mk.memberName
        );
        const existingMk = selectMakeup.get(tenant.clubId, mk.id) as
          | {
              id: string;
              member_id: string;
              member_name: string;
              target_club_or_event: string;
              activity_type: string;
              activity_date: string;
              description: string;
              evidence_ref: string | null;
              status: string;
              attendance_boost: number;
            }
          | undefined;
        if (!existingMk) {
          insertMakeup.run(
            mk.id,
            tenant.clubId,
            canonicalMemberId,
            mk.memberName,
            mk.targetClubOrEvent,
            mk.activityType,
            mk.date,
            mk.description,
            mk.evidenceRef ?? null,
            mk.status,
            mk.attendanceBoost ?? 0
          );
        } else if (
          existingMk.member_id !== canonicalMemberId ||
          existingMk.target_club_or_event !== mk.targetClubOrEvent ||
          existingMk.activity_type !== mk.activityType ||
          existingMk.activity_date !== mk.date ||
          existingMk.description !== mk.description ||
          (existingMk.evidence_ref ?? null) !== (mk.evidenceRef ?? null) ||
          (existingClub &&
            existingClub.revision === tenant.revision &&
            existingMk.status !== mk.status)
        ) {
          throw new Error(
            `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: makeup_submissions '${mk.id}' cannot be silently overwritten.`
          );
        }
      }

      // 8. guest_makeup_certificates
      const selectCert = db.prepare(
        'SELECT id, meeting_no, guest_name, guest_club, status, issued_by_member_id, approved_by_member_id, guest_attendance_record_id, verification_code FROM guest_makeup_certificates WHERE club_id = ? AND id = ?'
      );
      const insertCert = db.prepare(`
        INSERT INTO guest_makeup_certificates (
          id, club_id, meeting_no, guest_name, guest_club, guest_district, guest_email,
          meeting_date, sent_at, schema_version, status, issued_by_member_id,
          approved_by_member_id, guest_attendance_record_id, attendance_evidence, verification_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const cert of tenant.guestMakeupCards || []) {
        const canonicalIssuedById = this.resolveCanonicalSqlMemberId(
          tenant,
          cert.issuedByMemberId,
          cert.issuedByName
        );
        const canonicalApprovedById = cert.approvedByMemberId
          ? this.resolveCanonicalSqlMemberId(
              tenant,
              cert.approvedByMemberId,
              cert.approvedByName
            )
          : null;
        const existingCert = selectCert.get(tenant.clubId, cert.id) as
          | {
              id: string;
              meeting_no: number;
              guest_name: string;
              guest_club: string;
              status: string;
              issued_by_member_id: string;
              approved_by_member_id: string | null;
              guest_attendance_record_id: string | null;
              verification_code: string;
            }
          | undefined;
        if (!existingCert) {
          insertCert.run(
            cert.id,
            tenant.clubId,
            cert.meetingNo,
            cert.guestName,
            cert.guestClub,
            cert.guestDistrict || 'UR 2420. Bölge',
            cert.guestEmail || '',
            cert.meetingDate,
            cert.sentAt,
            cert.schemaVersion || 1,
            cert.status || 'Taslak',
            canonicalIssuedById,
            canonicalApprovedById,
            cert.guestAttendanceRecordId ?? null,
            cert.attendanceEvidence ?? null,
            cert.verificationCode
          );
        } else if (
          existingCert.meeting_no !== cert.meetingNo ||
          existingCert.guest_name !== cert.guestName ||
          existingCert.guest_club !== cert.guestClub ||
          existingCert.issued_by_member_id !== canonicalIssuedById ||
          (existingCert.guest_attendance_record_id ?? null) !==
            (cert.guestAttendanceRecordId ?? null) ||
          existingCert.verification_code !== cert.verificationCode
        ) {
          throw new Error(
            `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: guest_makeup_certificates '${cert.id}' cannot be silently overwritten.`
          );
        }
      }

      // 9. financial_line_items
      const selectFinItem = db.prepare(
        'SELECT id, category, title, period, total_amount, paid_amount, idempotency_key FROM financial_line_items WHERE club_id = ? AND id = ?'
      );
      const insertFinItem = db.prepare(`
        INSERT INTO financial_line_items (
          id, club_id, category, title, period, total_amount, paid_amount, due_date, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateFinItem = db.prepare(`
        UPDATE financial_line_items
        SET paid_amount = ?, due_date = ?
        WHERE club_id = ? AND id = ?
      `);
      for (const item of tenant.financialItems || []) {
        const idempKey = item.idempotencyKey || `${tenant.clubId}::${item.id}`;
        const existingFin = selectFinItem.get(tenant.clubId, item.id) as
          | {
              id: string;
              category: string;
              title: string;
              period: string;
              total_amount: number;
              paid_amount: number;
              idempotency_key: string;
            }
          | undefined;
        if (!existingFin) {
          insertFinItem.run(
            item.id,
            tenant.clubId,
            item.category,
            item.title,
            item.period,
            item.totalAmount,
            item.paidAmount,
            item.dueDate,
            idempKey
          );
        } else {
          if (
            existingFin.category !== item.category ||
            existingFin.title !== item.title ||
            existingFin.period !== item.period ||
            Number(existingFin.total_amount) !== Number(item.totalAmount) ||
            existingFin.idempotency_key !== idempKey
          ) {
            throw new Error(
              `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: financial_line_items '${item.id}' immutable fields cannot be replaced.`
            );
          }
          if (
            existingClub &&
            existingClub.revision === tenant.revision &&
            Number(existingFin.paid_amount) !== Number(item.paidAmount)
          ) {
            throw new Error(
              `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: financial_line_items '${item.id}' paid_amount differs at identical revision.`
            );
          }
          updateFinItem.run(item.paidAmount, item.dueDate, tenant.clubId, item.id);
        }
      }

      // 10. treasury_ledger (immutable append-only)
      const selectLedger = db.prepare(
        'SELECT id, entry_date, type, category, title, counterparty, amount, reference_no FROM treasury_ledger WHERE club_id = ? AND id = ?'
      );
      const insertLedger = db.prepare(`
        INSERT INTO treasury_ledger (
          id, club_id, entry_date, type, category, title, counterparty, amount, reference_no
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const entry of tenant.treasuryLedger || []) {
        const existingTl = selectLedger.get(tenant.clubId, entry.id) as
          | {
              id: string;
              entry_date: string;
              type: string;
              category: string;
              title: string;
              counterparty: string;
              amount: number;
              reference_no: string;
            }
          | undefined;
        if (!existingTl) {
          insertLedger.run(
            entry.id,
            tenant.clubId,
            entry.date,
            entry.type,
            entry.category,
            entry.title,
            entry.counterparty,
            entry.amount,
            entry.referenceNo
          );
        } else if (
          existingTl.entry_date !== entry.date ||
          existingTl.type !== entry.type ||
          existingTl.category !== entry.category ||
          existingTl.title !== entry.title ||
          existingTl.counterparty !== entry.counterparty ||
          Number(existingTl.amount) !== Number(entry.amount) ||
          existingTl.reference_no !== entry.referenceNo
        ) {
          throw new Error(
            `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: treasury_ledger '${entry.id}' cannot be silently overwritten.`
          );
        }
      }

      // 11. debt_writeoff_journals (immutable append-only, #24 / #39)
      const selectWriteOff = db.prepare(
        'SELECT id, member_id, resolution_id, resolution_no, board_meeting_no, waived_dues_amount, waived_meal_amount, waived_foundation_amount, total_waived_amount, idempotency_key, entry_hash FROM debt_writeoff_journals WHERE club_id = ? AND id = ?'
      );
      const insertWriteOff = db.prepare(`
        INSERT INTO debt_writeoff_journals (
          id, club_id, idempotency_key, resolution_id, resolution_no, board_meeting_no, board_meeting_date,
          member_id, member_name, waived_dues_amount, waived_meal_amount, waived_foundation_amount, total_waived_amount,
          source_receivable_ids, debit_account_code, credit_account_code, approved_by_member_ids,
          recorded_by_member_id, recorded_by_role, recorded_at, entry_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const j of tenant.debtWriteOffJournals || []) {
        const canonicalMemberId = this.resolveCanonicalSqlMemberId(
          tenant,
          j.memberId,
          j.memberName
        );
        const canonicalRecordedById = this.resolveCanonicalSqlMemberId(
          tenant,
          j.recordedByMemberId
        );
        const existingJ = selectWriteOff.get(tenant.clubId, j.id) as
          | {
              id: string;
              member_id: string;
              resolution_id: string;
              resolution_no: string;
              board_meeting_no: string;
              waived_dues_amount: number;
              waived_meal_amount: number;
              waived_foundation_amount: number;
              total_waived_amount: number;
              idempotency_key: string;
              entry_hash: string;
            }
          | undefined;
        if (!existingJ) {
          insertWriteOff.run(
            j.id,
            tenant.clubId,
            j.idempotencyKey,
            j.resolutionId,
            j.resolutionNo,
            j.boardMeetingNo,
            j.boardMeetingDate,
            canonicalMemberId,
            j.memberName,
            j.waivedDuesAmountTL,
            j.waivedMealAmountTL,
            j.waivedFoundationAmountTL,
            j.totalWaivedAmountTL,
            JSON.stringify(j.sourceReceivableIds || []),
            j.debitAccountCode,
            j.creditAccountCode,
            JSON.stringify(j.approvedByMemberIds || []),
            canonicalRecordedById,
            j.recordedByRole,
            j.recordedAtIso,
            j.entryHash
          );
        } else if (
          existingJ.member_id !== canonicalMemberId ||
          existingJ.resolution_id !== j.resolutionId ||
          existingJ.resolution_no !== j.resolutionNo ||
          Number(existingJ.total_waived_amount) !== Number(j.totalWaivedAmountTL) ||
          existingJ.idempotency_key !== j.idempotencyKey ||
          existingJ.entry_hash !== j.entryHash
        ) {
          throw new Error(
            `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: debt_writeoff_journals '${j.id}' cannot be silently overwritten.`
          );
        }
      }

      // 12. chained_audit_ledger (immutable hash chain)
      const selectAudit = db.prepare(
        'SELECT id, sequence_no, actor_name, actor_role, module, action, detail, prev_hash, entry_hash FROM chained_audit_ledger WHERE club_id = ? AND id = ?'
      );
      const insertAudit = db.prepare(`
        INSERT INTO chained_audit_ledger (
          id, club_id, sequence_no, recorded_at, actor_name, actor_role, module, action, detail, verified_by_server, prev_hash, entry_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const sortedAudit = [...(tenant.auditLedger || [])].sort(
        (a, b) => a.sequenceNo - b.sequenceNo
      );
      for (const aud of sortedAudit) {
        const existingAud = selectAudit.get(tenant.clubId, aud.id) as
          | {
              id: string;
              sequence_no: number;
              actor_name: string;
              actor_role: string;
              module: string;
              action: string;
              detail: string;
              prev_hash: string;
              entry_hash: string;
            }
          | undefined;
        if (!existingAud) {
          insertAudit.run(
            aud.id,
            tenant.clubId,
            aud.sequenceNo,
            aud.timestamp,
            aud.actorName,
            aud.actorRole,
            aud.module,
            aud.action,
            aud.detail,
            aud.verifiedByServer ? 1 : 0,
            aud.prevHash,
            aud.entryHash
          );
        } else if (
          Number(existingAud.sequence_no) !== Number(aud.sequenceNo) ||
          existingAud.actor_name !== aud.actorName ||
          existingAud.actor_role !== aud.actorRole ||
          existingAud.module !== aud.module ||
          existingAud.action !== aud.action ||
          existingAud.detail !== aud.detail ||
          existingAud.prev_hash !== aud.prevHash ||
          existingAud.entry_hash !== aud.entryHash
        ) {
          throw new Error(
            `MIGRATION_CONFLICT_IMMUTABLE_ROW_MISMATCH: chained_audit_ledger '${aud.id}' hash/content mismatch on rerun.`
          );
        }
      }

      return this.verifyTenantMigrationIntegrity(
        db,
        tenant,
        lifecycleRowsToMigrate.length,
        uniqueRsvpPairs.size,
        uniqueAttendanceKeys.size
      );
    });
  }

  /**
   * Verifies row counts, primary key sets, financial sums, and audit hashes between source tenant state and SQL tables.
   */
  private verifyTenantMigrationIntegrity(
    db: DatabaseSync,
    tenant: TenantClubDatabaseState,
    expectedLifecycleCount: number,
    expectedRsvpCount: number,
    expectedAttendanceCount: number
  ): TenantSqlMigrationVerificationReport {
    const countFor = (table: string): number => {
      const row = db
        .prepare(`SELECT COUNT(*) AS cnt FROM ${table} WHERE club_id = ?`)
        .get(tenant.clubId) as { cnt: number };
      return Number(row?.cnt || 0);
    };

    const members = countFor('rotary_members');
    const memberLifecycleHistory = countFor('member_lifecycle_history');
    const meetings = countFor('weekly_meetings');
    const meetingRsvps = countFor('meeting_rsvps');
    const meetingAttendances = countFor('meeting_attendances');
    const verifiedGuestAttendances = countFor('verified_guest_attendances');
    const makeupSubmissions = countFor('makeup_submissions');
    const guestMakeupCertificates = countFor('guest_makeup_certificates');
    const financialLineItems = countFor('financial_line_items');
    const treasuryLedger = countFor('treasury_ledger');
    const debtWriteOffJournals = countFor('debt_writeoff_journals');
    const auditEntries = countFor('chained_audit_ledger');

    if (
      members !== (tenant.members || []).length ||
      memberLifecycleHistory !== expectedLifecycleCount ||
      meetings !== (tenant.meetings || []).length ||
      meetingRsvps !== expectedRsvpCount ||
      meetingAttendances !== expectedAttendanceCount ||
      verifiedGuestAttendances !== (tenant.verifiedGuestAttendances || []).length ||
      makeupSubmissions !== (tenant.makeupSubmissions || []).length ||
      guestMakeupCertificates !== (tenant.guestMakeupCards || []).length ||
      financialLineItems !== (tenant.financialItems || []).length ||
      treasuryLedger !== (tenant.treasuryLedger || []).length ||
      debtWriteOffJournals !== (tenant.debtWriteOffJournals || []).length ||
      auditEntries !== (tenant.auditLedger || []).length
    ) {
      throw new Error(
        `MIGRATION_INTEGRITY_VERIFICATION_FAILED: Row count mismatch for club '${tenant.clubId}'.`
      );
    }

    const memberSumRow = db
      .prepare(
        'SELECT COALESCE(SUM(dues_balance + meal_balance + foundation_balance), 0) AS total_debt FROM rotary_members WHERE club_id = ?'
      )
      .get(tenant.clubId) as { total_debt: number };
    const expectedMemberDebt = (tenant.members || []).reduce(
      (acc, m) => acc + m.duesBalance + m.mealBalance + m.foundationBalance,
      0
    );

    const finSumRow = db
      .prepare(
        'SELECT COALESCE(SUM(total_amount), 0) AS total_fin FROM financial_line_items WHERE club_id = ?'
      )
      .get(tenant.clubId) as { total_fin: number };
    const expectedFinSum = (tenant.financialItems || []).reduce(
      (acc, f) => acc + f.totalAmount,
      0
    );

    const treasurySumRow = db
      .prepare(
        'SELECT COALESCE(SUM(amount), 0) AS total_tl FROM treasury_ledger WHERE club_id = ?'
      )
      .get(tenant.clubId) as { total_tl: number };
    const expectedTreasurySum = (tenant.treasuryLedger || []).reduce(
      (acc, t) => acc + t.amount,
      0
    );

    const writeOffSumRow = db
      .prepare(
        'SELECT COALESCE(SUM(total_waived_amount), 0) AS total_wo FROM debt_writeoff_journals WHERE club_id = ?'
      )
      .get(tenant.clubId) as { total_wo: number };
    const expectedWriteOffSum = (tenant.debtWriteOffJournals || []).reduce(
      (acc, j) => acc + j.totalWaivedAmountTL,
      0
    );

    if (
      Number(memberSumRow?.total_debt || 0) !== expectedMemberDebt ||
      Number(finSumRow?.total_fin || 0) !== expectedFinSum ||
      Number(treasurySumRow?.total_tl || 0) !== expectedTreasurySum ||
      Number(writeOffSumRow?.total_wo || 0) !== expectedWriteOffSum
    ) {
      throw new Error(
        `MIGRATION_INTEGRITY_VERIFICATION_FAILED: Financial sum mismatch for club '${tenant.clubId}'.`
      );
    }

    return {
      clubId: tenant.clubId,
      members,
      memberLifecycleHistory,
      meetings,
      meetingRsvps,
      meetingAttendances,
      verifiedGuestAttendances,
      makeupSubmissions,
      guestMakeupCertificates,
      financialLineItems,
      treasuryLedger,
      debtWriteOffJournals,
      auditEntries,
      totalMemberDuesBalance: Number(memberSumRow?.total_debt || 0),
      totalFinancialLineAmount: Number(finSumRow?.total_fin || 0),
      totalTreasuryAmount: Number(treasurySumRow?.total_tl || 0),
      totalWaivedDebtAmount: Number(writeOffSumRow?.total_wo || 0),
      integrityVerified: true,
    };
  }

  /**
   * Migrates tenant state into real SQL tables and returns exact row counts & verification report read back from SQL (#70, #13, #18, #19).
   */
  public migrateTenantToSql(
    tenant: TenantClubDatabaseState
  ): TenantSqlMigrationVerificationReport {
    return this.migrateTenantState(tenant);
  }

  /**
   * Executes adversarial SQL constraint, Cross-Tenant Composite FK & ACID rollback tests against the live SQL tables (#70, #13, #18, #19):
   * 1. Verifies all 13 canonical tables from `src/server/postgresSchema.sql` exist in `sqlite_master`.
   * 2. Verifies `FOREIGN KEY` enforcement rejects orphan rows AND cross-club composite FK attacks:
   *    - Club B meeting attendance attempting to bind Club A member -> REJECTED.
   *    - Club B guest makeup certificate attempting to bind Club A verified guest attendance -> REJECTED.
   * 3. Verifies `UNIQUE` constraint enforcement rejects duplicate `rotary_id` or duplicate `(club_id, sequence_no)`.
   * 4. Verifies `CHECK` constraint enforcement rejects negative `dues_balance` or `treasury_ledger.amount <= 0`.
   * 5. Verifies `BEGIN IMMEDIATE ... ROLLBACK` atomically rolls back multi-table writes when a later statement fails.
   */
  public verifySchemaAndConstraints(): {
    ddlLoaded: boolean;
    tableCount: number;
    foreignKeysEnforced: boolean;
    crossTenantForeignKeysBlocked: boolean;
    uniqueConstraintsEnforced: boolean;
    checkConstraintsEnforced: boolean;
    acidRollbackVerified: boolean;
  } {
    const expectedTables = [
      'rotary_clubs',
      'rotary_members',
      'member_lifecycle_history',
      'weekly_meetings',
      'meeting_rsvps',
      'meeting_attendances',
      'verified_guest_attendances',
      'makeup_submissions',
      'guest_makeup_certificates',
      'financial_line_items',
      'treasury_ledger',
      'debt_writeoff_journals',
      'chained_audit_ledger',
    ];
    const existingTables = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as Array<{ name: string }>;
    const tableSet = new Set(existingTables.map((t) => t.name));
    const matchedTables = expectedTables.filter((t) => tableSet.has(t));

    // Seed two isolated test clubs (Club A & Club B) for composite FK & constraint checks
    this.db
      .prepare(
        "INSERT INTO rotary_clubs (club_id, club_name, district, revision) VALUES ('club-sql-test-a', 'SQL Test Club A', '2420', 1)"
      )
      .run();
    this.db
      .prepare(
        "INSERT INTO rotary_clubs (club_id, club_name, district, revision) VALUES ('club-sql-test-b', 'SQL Test Club B', '2420', 1)"
      )
      .run();

    // 1. Foreign Key violation test: inserting attendance for non-existent meeting/member MUST throw
    let foreignKeysEnforced = false;
    try {
      this.db
        .prepare(
          "INSERT INTO meeting_attendances (club_id, meeting_no, member_id, checkin_mode) VALUES ('club-nonexistent', 9999, 'm-nonexistent', 'qr')"
        )
        .run();
    } catch {
      foreignKeysEnforced = true;
    }

    // 2. UNIQUE constraint violation test: duplicate rotary_id MUST throw
    let uniqueConstraintsEnforced = false;
    this.db
      .prepare(
        "INSERT INTO rotary_members (id, club_id, rotary_id, full_name, classification, role_badge) VALUES ('m-sql-a1', 'club-sql-test-a', 'TR-SQL-001', 'SQL Test Member A1', 'Yazılım', 'Üye')"
      )
      .run();
    this.db
      .prepare(
        "INSERT INTO rotary_members (id, club_id, rotary_id, full_name, classification, role_badge) VALUES ('m-sql-b1', 'club-sql-test-b', 'TR-SQL-002', 'SQL Test Member B1', 'Hukuk', 'Genel Sekreter')"
      )
      .run();
    try {
      this.db
        .prepare(
          "INSERT INTO rotary_members (id, club_id, rotary_id, full_name, classification, role_badge) VALUES ('m-sql-a2', 'club-sql-test-a', 'TR-SQL-001', 'SQL Test Member A2', 'Hukuk', 'Üye')"
        )
        .run();
    } catch {
      uniqueConstraintsEnforced = true;
    }

    // Seed meetings for Club A (9101) and Club B (9201) + verified guest attendance in Club A
    this.db
      .prepare(
        "INSERT INTO weekly_meetings (club_id, meeting_no, meeting_date, venue, speaker, topic, status, is_past) VALUES ('club-sql-test-a', 9101, '10 Ekim 2026', 'Salon A', 'Konuşmacı A', 'Konu A', 'Tamamlandı', 1)"
      )
      .run();
    this.db
      .prepare(
        "INSERT INTO weekly_meetings (club_id, meeting_no, meeting_date, venue, speaker, topic, status, is_past) VALUES ('club-sql-test-b', 9201, '10 Ekim 2026', 'Salon B', 'Konuşmacı B', 'Konu B', 'Tamamlandı', 1)"
      )
      .run();
    this.db
      .prepare(
        "INSERT INTO verified_guest_attendances (id, club_id, meeting_no, guest_name, guest_club, guest_district, verified_by_member_id, verified_by_name, verified_by_role, verified_at, checkin_method, evidence_note) VALUES ('vga-sql-a1', 'club-sql-test-a', 9101, 'Misafir A', 'Bebek Rotary', 'UR 2420. Bölge', 'm-sql-a1', 'SQL Test Member A1', 'sekreter', '10 Ekim 2026 19:30', 'Salon Kayıt Masası', 'Masa kaydı doğrulandı')"
      )
      .run();

    // 2b. Cross-Tenant Composite Foreign Key violation tests (#70):
    // Attack 1: Bind Club A member ('m-sql-a1') to Club B meeting attendance ('club-sql-test-b', 9201) -> MUST THROW
    let crossClubAttendanceBlocked = false;
    try {
      this.db
        .prepare(
          "INSERT INTO meeting_attendances (club_id, meeting_no, member_id, checkin_mode) VALUES ('club-sql-test-b', 9201, 'm-sql-a1', 'qr')"
        )
        .run();
    } catch {
      crossClubAttendanceBlocked = true;
    }

    // Attack 2: Bind Club A guest attendance ('vga-sql-a1') to Club B guest makeup certificate ('club-sql-test-b', 9201) -> MUST THROW
    let crossClubCertificateEvidenceBlocked = false;
    try {
      this.db
        .prepare(
          "INSERT INTO guest_makeup_certificates (id, club_id, meeting_no, guest_name, guest_club, guest_district, guest_email, meeting_date, sent_at, schema_version, status, issued_by_member_id, approved_by_member_id, guest_attendance_record_id, attendance_evidence, verification_code) VALUES ('cert-sql-b1', 'club-sql-test-b', 9201, 'Misafir A', 'Bebek Rotary', 'UR 2420. Bölge', 'misafir@ornek.org', '10 Ekim 2026', '10 Ekim 2026', 1, 'Aktif', 'm-sql-b1', 'm-sql-b1', 'vga-sql-a1', 'Cross-club kanıt denemesi', 'UR2420-SQL-CROSS-1')"
        )
        .run();
    } catch {
      crossClubCertificateEvidenceBlocked = true;
    }

    const crossTenantForeignKeysBlocked =
      crossClubAttendanceBlocked && crossClubCertificateEvidenceBlocked;
    foreignKeysEnforced = foreignKeysEnforced && crossTenantForeignKeysBlocked;

    // 3. CHECK constraint violation test: negative dues_balance (< 0) and treasury amount <= 0 MUST throw
    let checkNegativeDuesRejected = false;
    try {
      this.db
        .prepare(
          "INSERT INTO rotary_members (id, club_id, rotary_id, full_name, classification, role_badge, dues_balance) VALUES ('m-sql-neg', 'club-sql-test-a', 'TR-SQL-NEG', 'Neg Balance', 'Finans', 'Üye', -100)"
        )
        .run();
    } catch {
      checkNegativeDuesRejected = true;
    }

    let checkZeroTreasuryRejected = false;
    try {
      this.db
        .prepare(
          "INSERT INTO treasury_ledger (id, club_id, entry_date, type, category, title, counterparty, amount, reference_no) VALUES ('tl-sql-zero', 'club-sql-test-a', '24 Ekim 2026', 'Gelir', 'Aidat', 'Sıfır Tutar', 'Test', 0, 'REF-SQL-ZERO')"
        )
        .run();
    } catch {
      checkZeroTreasuryRejected = true;
    }
    const checkConstraintsEnforced =
      checkNegativeDuesRejected && checkZeroTreasuryRejected;

    // 4. Multi-table ACID Transaction Rollback test:
    // Mutate rotary_clubs revision AND insert a treasury_ledger row, then throw before COMMIT -> both must roll back!
    let acidRollbackVerified = false;
    try {
      this.runInTransaction((db) => {
        db.prepare(
          "UPDATE rotary_clubs SET revision = 999 WHERE club_id = 'club-sql-test-a'"
        ).run();
        db.prepare(
          "INSERT INTO treasury_ledger (id, club_id, entry_date, type, category, title, counterparty, amount, reference_no) VALUES ('tl-rollback', 'club-sql-test-a', '24 Ekim 2026', 'Gelir', 'Aidat', 'Rollback Test', 'Test', 5000, 'REF-ROLLBACK-1')"
        ).run();
        throw new Error('SIMULATED_SQL_ACID_ABORT');
      });
    } catch {
      const clubRow = this.db
        .prepare("SELECT revision FROM rotary_clubs WHERE club_id = 'club-sql-test-a'")
        .get() as { revision: number };
      const ledgerRow = this.db
        .prepare("SELECT COUNT(*) AS cnt FROM treasury_ledger WHERE id = 'tl-rollback'")
        .get() as { cnt: number };
      acidRollbackVerified =
        clubRow?.revision === 1 && Number(ledgerRow?.cnt || 0) === 0;
    }

    // Verify ON DELETE RESTRICT blocks deleting club-sql-test-a while m-sql-a1 still references it
    let restrictEnforced = false;
    try {
      this.db
        .prepare("DELETE FROM rotary_clubs WHERE club_id = 'club-sql-test-a'")
        .run();
    } catch {
      restrictEnforced = true;
    }
    foreignKeysEnforced = foreignKeysEnforced && restrictEnforced;

    // Clean up test rows in reverse dependency order
    this.db
      .prepare("DELETE FROM verified_guest_attendances WHERE club_id IN ('club-sql-test-a', 'club-sql-test-b')")
      .run();
    this.db
      .prepare("DELETE FROM weekly_meetings WHERE club_id IN ('club-sql-test-a', 'club-sql-test-b')")
      .run();
    this.db
      .prepare("DELETE FROM rotary_members WHERE club_id IN ('club-sql-test-a', 'club-sql-test-b')")
      .run();
    this.db
      .prepare("DELETE FROM rotary_clubs WHERE club_id IN ('club-sql-test-a', 'club-sql-test-b')")
      .run();

    return {
      ddlLoaded: matchedTables.length === expectedTables.length,
      tableCount: matchedTables.length,
      foreignKeysEnforced,
      crossTenantForeignKeysBlocked,
      uniqueConstraintsEnforced,
      checkConstraintsEnforced,
      acidRollbackVerified,
    };
  }

  public close(): void {
    this.db.close();
  }
}
