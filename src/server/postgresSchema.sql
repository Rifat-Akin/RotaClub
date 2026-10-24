-- RotaClub Canonical PostgreSQL Relational Schema & Transactional Constraint Model (#13, #14, #18, #19, ADR-0001)
-- Enforces tenant isolation (club_id), optimistic concurrency (revision), idempotency keys,
-- non-negative minor-unit/balance checks, and append-only SHA-256 hash-chained audit records.

BEGIN;

CREATE TABLE IF NOT EXISTS rotary_clubs (
  club_id VARCHAR(64) PRIMARY KEY,
  club_name VARCHAR(160) NOT NULL,
  district VARCHAR(64) NOT NULL DEFAULT 'UR 2420. Bölge',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  outbound_messaging_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  kvkk_mask_phone BOOLEAN NOT NULL DEFAULT TRUE,
  selected_meeting_no INTEGER NOT NULL DEFAULT 1842,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotary_members (
  id VARCHAR(64) PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL REFERENCES rotary_clubs(club_id) ON DELETE RESTRICT,
  rotary_id VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  classification VARCHAR(160) NOT NULL,
  role_badge VARCHAR(120) NOT NULL,
  membership_status VARCHAR(32) NOT NULL DEFAULT 'Aktif'
    CHECK (membership_status IN ('Aday', 'Aktif', 'İzinli (Muaf)', 'Onur Üyesi', 'İstifa / Ayrıldı', 'Nakil')),
  dues_balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (dues_balance >= 0),
  meal_balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (meal_balance >= 0),
  foundation_balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (foundation_balance >= 0),
  attendance_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (attendance_rate >= 0 AND attendance_rate <= 100),
  rsvp_status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (rsvp_status IN ('attending', 'regrets', 'excused', 'pending')),
  meal_preference VARCHAR(32) NOT NULL DEFAULT 'Standart',
  reminder_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_reminder_channel VARCHAR(32) NOT NULL DEFAULT 'WhatsApp Taslağı',
  leave_start_date VARCHAR(32),
  leave_end_date VARCHAR(32),
  leave_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_rotary_members_club_id ON rotary_members(club_id);

CREATE TABLE IF NOT EXISTS member_lifecycle_history (
  id BIGSERIAL PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL REFERENCES rotary_clubs(club_id) ON DELETE RESTRICT,
  member_id VARCHAR(64) NOT NULL REFERENCES rotary_members(id) ON DELETE RESTRICT,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  actor_name VARCHAR(160) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  leave_start_date VARCHAR(32),
  leave_end_date VARCHAR(32),
  board_resolution_ref VARCHAR(64),
  recorded_at VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS weekly_meetings (
  club_id VARCHAR(64) NOT NULL REFERENCES rotary_clubs(club_id) ON DELETE RESTRICT,
  meeting_no INTEGER NOT NULL CHECK (meeting_no > 0),
  meeting_date VARCHAR(64) NOT NULL,
  venue VARCHAR(160) NOT NULL,
  speaker VARCHAR(160) NOT NULL,
  topic VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Planlandı',
  is_past BOOLEAN NOT NULL DEFAULT FALSE,
  is_lcv_locked_for_hotel BOOLEAN NOT NULL DEFAULT FALSE,
  hotel_confirmation_ref VARCHAR(120),
  PRIMARY KEY (club_id, meeting_no)
);

CREATE TABLE IF NOT EXISTS meeting_rsvps (
  club_id VARCHAR(64) NOT NULL,
  meeting_no INTEGER NOT NULL,
  member_id VARCHAR(64) NOT NULL REFERENCES rotary_members(id) ON DELETE RESTRICT,
  rsvp_status VARCHAR(24) NOT NULL
    CHECK (rsvp_status IN ('attending', 'regrets', 'excused', 'pending')),
  menu_preference VARCHAR(32) NOT NULL DEFAULT 'Standart',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (club_id, meeting_no, member_id),
  FOREIGN KEY (club_id, meeting_no) REFERENCES weekly_meetings(club_id, meeting_no) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS meeting_attendances (
  club_id VARCHAR(64) NOT NULL,
  meeting_no INTEGER NOT NULL,
  member_id VARCHAR(64) NOT NULL REFERENCES rotary_members(id) ON DELETE RESTRICT,
  checkin_mode VARCHAR(32) NOT NULL DEFAULT 'qr',
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (club_id, meeting_no, member_id),
  FOREIGN KEY (club_id, meeting_no) REFERENCES weekly_meetings(club_id, meeting_no) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS verified_guest_attendances (
  id VARCHAR(96) PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL,
  meeting_no INTEGER NOT NULL,
  guest_name VARCHAR(160) NOT NULL,
  guest_club VARCHAR(160) NOT NULL,
  guest_district VARCHAR(64) NOT NULL DEFAULT 'UR 2420. Bölge',
  verified_by_member_id VARCHAR(64) NOT NULL REFERENCES rotary_members(id) ON DELETE RESTRICT,
  verified_by_name VARCHAR(160) NOT NULL,
  verified_by_role VARCHAR(32) NOT NULL,
  verified_at VARCHAR(64) NOT NULL,
  checkin_method VARCHAR(64) NOT NULL,
  evidence_note TEXT NOT NULL,
  FOREIGN KEY (club_id, meeting_no) REFERENCES weekly_meetings(club_id, meeting_no) ON DELETE RESTRICT,
  UNIQUE (club_id, meeting_no, guest_name, guest_club)
);

CREATE TABLE IF NOT EXISTS makeup_submissions (
  id VARCHAR(96) PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL REFERENCES rotary_clubs(club_id) ON DELETE RESTRICT,
  member_id VARCHAR(64) NOT NULL REFERENCES rotary_members(id) ON DELETE RESTRICT,
  member_name VARCHAR(160) NOT NULL,
  target_club_or_event VARCHAR(200) NOT NULL,
  activity_type VARCHAR(64) NOT NULL,
  activity_date VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  evidence_ref VARCHAR(160),
  status VARCHAR(32) NOT NULL
    CHECK (status IN ('Taslak', 'İnceleniyor', 'Düzeltme İstendi', 'Onaylandı', 'Reddedildi', 'İtiraz Edildi')),
  attendance_boost INTEGER NOT NULL DEFAULT 0 CHECK (attendance_boost >= 0)
);

CREATE TABLE IF NOT EXISTS guest_makeup_certificates (
  id VARCHAR(96) PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL,
  meeting_no INTEGER NOT NULL,
  guest_name VARCHAR(160) NOT NULL,
  guest_club VARCHAR(160) NOT NULL,
  guest_district VARCHAR(64) NOT NULL DEFAULT 'UR 2420. Bölge',
  guest_email VARCHAR(160) NOT NULL,
  meeting_date VARCHAR(64) NOT NULL,
  sent_at VARCHAR(64) NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'Taslak'
    CHECK (status IN ('Taslak', 'Aktif', 'İptal Edildi')),
  issued_by_member_id VARCHAR(64) NOT NULL,
  approved_by_member_id VARCHAR(64),
  guest_attendance_record_id VARCHAR(96) REFERENCES verified_guest_attendances(id) ON DELETE RESTRICT,
  attendance_evidence TEXT,
  verification_code VARCHAR(64) NOT NULL UNIQUE,
  FOREIGN KEY (club_id, meeting_no) REFERENCES weekly_meetings(club_id, meeting_no) ON DELETE RESTRICT,
  CHECK (
    status <> 'Aktif'
    OR (approved_by_member_id IS NOT NULL AND guest_attendance_record_id IS NOT NULL AND attendance_evidence IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS financial_line_items (
  id VARCHAR(96) PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL REFERENCES rotary_clubs(club_id) ON DELETE RESTRICT,
  category VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  period VARCHAR(64) NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_date VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS treasury_ledger (
  id VARCHAR(96) PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL REFERENCES rotary_clubs(club_id) ON DELETE RESTRICT,
  entry_date VARCHAR(64) NOT NULL,
  type VARCHAR(16) NOT NULL CHECK (type IN ('Gelir', 'Gider')),
  category VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  counterparty VARCHAR(160) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reference_no VARCHAR(96) NOT NULL,
  UNIQUE (club_id, reference_no)
);

CREATE TABLE IF NOT EXISTS chained_audit_ledger (
  id VARCHAR(96) NOT NULL UNIQUE,
  club_id VARCHAR(64) NOT NULL REFERENCES rotary_clubs(club_id) ON DELETE RESTRICT,
  sequence_no INTEGER NOT NULL CHECK (sequence_no >= 1),
  recorded_at VARCHAR(64) NOT NULL,
  actor_name VARCHAR(160) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  module VARCHAR(64) NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  verified_by_server BOOLEAN NOT NULL DEFAULT TRUE,
  prev_hash CHAR(64) NOT NULL,
  entry_hash CHAR(64) NOT NULL UNIQUE,
  PRIMARY KEY (club_id, sequence_no)
);

COMMIT;
