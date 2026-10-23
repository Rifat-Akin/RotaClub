-- RotaClub v5.0 PostgreSQL Production Schema (UR 2420. Bölge Multi-Tenant Architecture)
-- Issue #14, #18, #20, #76: Relational Multi-Tenant Isolation, Immutable Hash-Chained Audit Ledger & Bank Reconciliation

CREATE TABLE IF NOT EXISTS rotaclub_tenants (
  club_id VARCHAR(64) PRIMARY KEY,
  club_name VARCHAR(160) NOT NULL,
  district VARCHAR(64) NOT NULL DEFAULT '2420. Bölge',
  revision INTEGER NOT NULL DEFAULT 1,
  state_payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotaclub_users (
  member_id VARCHAR(64) PRIMARY KEY,
  rotary_id VARCHAR(64) UNIQUE NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  club_id VARCHAR(64) NOT NULL REFERENCES rotaclub_tenants(club_id),
  club_role VARCHAR(32) NOT NULL CHECK (club_role IN ('uye', 'sekreter', 'sayman', 'baskan')),
  password_salt VARCHAR(128) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  webauthn_credential_id TEXT,
  webauthn_public_key TEXT,
  kvkk_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable Append-Only SHA-256 Hash-Chained Audit Ledger (#18)
CREATE TABLE IF NOT EXISTS rotaclub_audit_ledger (
  sequence_no SERIAL PRIMARY KEY,
  audit_id VARCHAR(64) UNIQUE NOT NULL,
  club_id VARCHAR(64) NOT NULL REFERENCES rotaclub_tenants(club_id),
  timestamp_label VARCHAR(64) NOT NULL,
  actor_name VARCHAR(160) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  module_name VARCHAR(64) NOT NULL,
  action_title TEXT NOT NULL,
  detail_text TEXT NOT NULL,
  prev_hash VARCHAR(64) NOT NULL,
  entry_hash VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent UPDATE or DELETE on rotaclub_audit_ledger via PostgreSQL Rule
CREATE OR REPLACE RULE rotaclub_audit_no_update AS
  ON UPDATE TO rotaclub_audit_ledger DO INSTEAD NOTHING;

CREATE OR REPLACE RULE rotaclub_audit_no_delete AS
  ON DELETE TO rotaclub_audit_ledger DO INSTEAD NOTHING;

-- Bank Statement Reconciliation Table (#6, #76)
CREATE TABLE IF NOT EXISTS rotaclub_bank_statements (
  bank_ref VARCHAR(64) PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL REFERENCES rotaclub_tenants(club_id),
  amount_tl NUMERIC(12, 2) NOT NULL CHECK (amount_tl > 0),
  sender_name VARCHAR(160) NOT NULL,
  statement_date VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  reconciled_at TIMESTAMPTZ,
  reconciled_by VARCHAR(160)
);
