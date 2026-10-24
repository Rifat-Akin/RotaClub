import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  GALATA_ROTARY_MEMBERS,
  INITIAL_BOARD_RESOLUTIONS,
  INITIAL_CELEBRATIONS,
  INITIAL_CLUB_COMMITTEES,
  INITIAL_FINANCIAL_ITEMS,
  INITIAL_FIRESIDE_GROUPS,
  INITIAL_GALATA_PROJECTS,
  INITIAL_GUEST_MAKEUP_CARDS,
  INITIAL_MAKEUP_SUBMISSIONS,
  INITIAL_MEETINGS_LIST,
  INITIAL_OVERDUE_MEMBERS,
  INITIAL_PAST_PRESIDENTS,
  INITIAL_PAYMENT_NOTIFICATIONS,
  INITIAL_RITUAL_STEPS,
  INITIAL_SCHOLARS,
  INITIAL_SPEAKER_PROPOSALS,
  INITIAL_TERM_BOARD,
  INITIAL_TREASURY_LEDGER,
} from '../data/mockGalataData';
import {
  AuditLogEntry,
  BoardResolutionItem,
  CelebrationItem,
  ClubCommittee,
  ClubRole,
  FinancialLineItem,
  FiresideGroup,
  GalataProject,
  GuestRotaryMakeupCard,
  LcvReminderQueueItem,
  MakeupAuditHistoryEntry,
  MakeupSubmission,
  MenuPreference,
  OverdueMemberItem,
  PastPresidentRecord,
  PaymentNotification,
  RitualStep,
  RotaryMember,
  RsvpStatus,
  ScholarStudent,
  SpeakerProposal,
  TermBoardInfo,
  TreasuryLedgerEntry,
  WeeklyMeeting,
} from '../types/rotary';
import {
  maskPhoneForKvkk,
  resolveUnambiguousLegacyMemberId,
  SpecializedModuleData,
  SYNTHETIC_SPECIALIZED_MODULES,
  SYNTHETIC_VOLUNTEER_SHIFTS,
  VolunteerShiftSlot,
} from '../utils/rotaryLogic';

export const ALLOWED_TENANT_CLUB_IDS = [
  'club-galata',
  'club-karakoy',
  'club-macka',
  'club-district2420',
] as const;

export type AllowedTenantClubId = (typeof ALLOWED_TENANT_CLUB_IDS)[number];

export function isAllowedTenantClubId(
  clubId: string
): clubId is AllowedTenantClubId {
  return (ALLOWED_TENANT_CLUB_IDS as readonly string[]).includes(clubId);
}

/**
 * Runtime / Environment HMAC-SHA256 Secret Loader (#22)
 * Never uses a hardcoded fallback secret string in source code.
 * Reads ROTACLUB_JWT_SECRET from environment or generates/loads a 64-byte CSPRNG key in .aistudio/.jwt_secret.
 */
let cachedServerSecret: string | null = null;

export function getServerSecret(): string {
  if (
    process.env.ROTACLUB_JWT_SECRET &&
    process.env.ROTACLUB_JWT_SECRET.trim().length >= 32
  ) {
    return process.env.ROTACLUB_JWT_SECRET.trim();
  }
  if (cachedServerSecret) {
    return cachedServerSecret;
  }
  const secretDir = path.resolve(process.cwd(), '.aistudio');
  const secretFile = path.join(secretDir, '.jwt_secret');
  try {
    if (!fs.existsSync(secretDir)) {
      fs.mkdirSync(secretDir, { recursive: true });
    }
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 64) {
        cachedServerSecret = existing;
        return existing;
      }
    }
    const generated = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
    cachedServerSecret = generated;
    return generated;
  } catch {
    cachedServerSecret = crypto.randomBytes(64).toString('hex');
    return cachedServerSecret;
  }
}

export interface AuthenticatedUser {
  memberId: string;
  rotaryId: string;
  fullName: string;
  email: string;
  role: ClubRole;
  clubId: string;
  authMethod?: 'pin' | 'webauthn';
  iat: number;
  exp: number;
  jti: string;
}

export interface WebAuthnCredentialRecord {
  credentialId: string;
  publicKeySpkiB64: string;
  signCount: number;
  registeredAt: string;
  rpId: string;
  aaguid?: string;
  attestationFmt?: string;
}

export interface ClubMembershipBinding {
  clubId: AllowedTenantClubId;
  role: ClubRole;
}

export interface PilotUserAccount {
  memberId: string;
  rotaryId: string;
  fullName: string;
  email: string;
  role: ClubRole;
  clubId: AllowedTenantClubId;
  clubMemberships: ClubMembershipBinding[];
  passwordSalt: string;
  passwordHash: string;
  activated?: boolean;
  webauthnCredentials: WebAuthnCredentialRecord[];
}

export interface BankStatementEntry {
  bankRef: string;
  type?: 'Gelir' | 'Gider';
  amount: number;
  senderName: string;
  date: string;
  description: string;
  reconciled: boolean;
  reconciledPaymentId?: string;
  reconciledAt?: string;
  reconciledBy?: string;
}

export interface ChainedAuditLogEntry extends AuditLogEntry {
  clubId: string;
  sequenceNo: number;
  prevHash: string;
  entryHash: string;
}

export interface TenantClubDatabaseState {
  clubId: string;
  clubName: string;
  district: string;
  revision: number;
  updatedAt: string;
  termInfo: TermBoardInfo;
  meetings: WeeklyMeeting[];
  selectedMeetingNo: number;
  rsvpStatus: RsvpStatus;
  menuPreference: MenuPreference;
  guestNameInput: string;
  ritualSteps: RitualStep[];
  celebrations: CelebrationItem[];
  speakerProposals: SpeakerProposal[];
  qrCheckedIn: boolean;
  meetingAttendances?: Record<string, string[]>;
  makeupSubmissions: MakeupSubmission[];
  guestMakeupCards: GuestRotaryMakeupCard[];
  firesideGroups: FiresideGroup[];
  financialItems: FinancialLineItem[];
  paymentNotifications: PaymentNotification[];
  overdueMembers: OverdueMemberItem[];
  treasuryLedger: TreasuryLedgerEntry[];
  projects: GalataProject[];
  scholars: ScholarStudent[];
  members: RotaryMember[];
  committees: ClubCommittee[];
  pastPresidents: PastPresidentRecord[];
  boardResolutions: BoardResolutionItem[];
  volunteerShifts?: VolunteerShiftSlot[];
  specializedModules?: SpecializedModuleData;
  lcvReminderQueue?: LcvReminderQueueItem[];
  outboundMessagingEnabled?: boolean;
  kvkkMaskPhone: boolean;
  bankStatements: BankStatementEntry[];
  auditLedger: ChainedAuditLogEntry[];
}

export interface MultiTenantDatabaseFile {
  schemaVersion: '5.3.0-hardened';
  updatedAt: string;
  bootstrapClaimed?: boolean;
  bootstrapTokenSalt?: string;
  bootstrapTokenHash?: string;
  tenants: Record<string, TenantClubDatabaseState>;
  accounts: PilotUserAccount[];
  revokedTokenJtis: string[];
}

export function normalizeBankRef(ref: string): string {
  return String(ref || '')
    .trim()
    .replace(/^#+/, '')
    .toUpperCase();
}

export function normalizePersonName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/^rtn\.?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function maskEmailForKvkk(email: string, enabled: boolean): string {
  if (!enabled || !email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  const prefix = local.slice(0, 2);
  return `${prefix}***@${domain}`;
}

export function hashPinWithSalt(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 32).toString('hex');
}

export function verifySecretConstantTime(
  candidate: string,
  salt: string,
  expectedHashHex: string
): boolean {
  if (!candidate || !salt || !expectedHashHex) return false;
  const computed = hashPinWithSalt(candidate.trim(), salt);
  const bufA = Buffer.from(computed, 'hex');
  const bufB = Buffer.from(expectedHashHex, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates credential complexity for new account provisioning and PIN rotation (#22).
 * Rejects short (<6), repeated-character ('111111'), or sequential ('123456', '654321') PINs.
 */
export function validateStrongCredential(pinOrPassword: string): {
  valid: boolean;
  reason?: string;
} {
  const clean = String(pinOrPassword || '').trim();
  if (clean.length < 6) {
    return {
      valid: false,
      reason: 'Kimlik doğrulama parolası / PIN en az 6 karakter olmalıdır.',
    };
  }
  if (/^(\w)\1+$/.test(clean)) {
    return {
      valid: false,
      reason: 'Tekrarlayan karakterlerden oluşan zayıf PIN kodları (örn. 111111) kullanılamaz.',
    };
  }
  const weakList = new Set([
    '123456',
    '654321',
    '12345678',
    '000000',
    'password',
    'rotary',
    'galata',
  ]);
  if (weakList.has(clean.toLowerCase())) {
    return {
      valid: false,
      reason: 'Ardışık veya yaygın tahmin edilebilir PIN/parola dizileri kullanılamaz.',
    };
  }
  return { valid: true };
}

/**
 * Converts a 64-byte IEEE P1363 ECDSA signature (r || s, produced by WebCrypto subtle.sign)
 * into ASN.1 DER format expected by Node's crypto.verify('sha256', ...).
 * If already in ASN.1 DER format (starts with 0x30), returns as-is.
 */
export function ensureDerEcdsaSignature(sigBuf: Buffer): Buffer {
  if (sigBuf.length === 64) {
    const encodeInt = (buf: Buffer): Buffer => {
      let i = 0;
      while (i < buf.length - 1 && buf[i] === 0) {
        i++;
      }
      const sliced = buf.subarray(i);
      if (sliced[0] & 0x80) {
        return Buffer.concat([
          Buffer.from([0x02, sliced.length + 1, 0x00]),
          sliced,
        ]);
      }
      return Buffer.concat([Buffer.from([0x02, sliced.length]), sliced]);
    };
    const rDer = encodeInt(sigBuf.subarray(0, 32));
    const sDer = encodeInt(sigBuf.subarray(32, 64));
    const totalLen = rDer.length + sDer.length;
    return Buffer.concat([Buffer.from([0x30, totalLen]), rDer, sDer]);
  }
  return sigBuf;
}

/**
 * RFC 8949 CBOR Decoder & Encoder for W3C WebAuthn Attestation Object & COSE_Key P-256 (#22, #76)
 */
const P256_SPKI_PREFIX = Buffer.from(
  '3059301306072a8648ce3d020106082a8648ce3d03010703420004',
  'hex'
);

export function decodeCborItem(
  buf: Buffer,
  offset = 0
): { value: unknown; nextOffset: number } {
  if (offset >= buf.length) {
    throw new Error('CBOR_TRUNCATED: Unexpected end of CBOR buffer');
  }
  const initialByte = buf[offset];
  const majorType = initialByte >> 5;
  const additionalInfo = initialByte & 0x1f;
  let pos = offset + 1;

  const readLengthOrInt = (): number => {
    if (additionalInfo < 24) return additionalInfo;
    if (additionalInfo === 24) {
      if (pos + 1 > buf.length) throw new Error('CBOR_TRUNCATED');
      const v = buf[pos];
      pos += 1;
      return v;
    }
    if (additionalInfo === 25) {
      if (pos + 2 > buf.length) throw new Error('CBOR_TRUNCATED');
      const v = buf.readUInt16BE(pos);
      pos += 2;
      return v;
    }
    if (additionalInfo === 26) {
      if (pos + 4 > buf.length) throw new Error('CBOR_TRUNCATED');
      const v = buf.readUInt32BE(pos);
      pos += 4;
      return v;
    }
    throw new Error(`CBOR_UNSUPPORTED_ADDITIONAL_INFO: ${additionalInfo}`);
  };

  if (majorType === 0) {
    const val = readLengthOrInt();
    return { value: val, nextOffset: pos };
  }
  if (majorType === 1) {
    const val = readLengthOrInt();
    return { value: -1 - val, nextOffset: pos };
  }
  if (majorType === 2) {
    const len = readLengthOrInt();
    if (pos + len > buf.length) throw new Error('CBOR_TRUNCATED_BYTES');
    const slice = Buffer.from(buf.subarray(pos, pos + len));
    return { value: slice, nextOffset: pos + len };
  }
  if (majorType === 3) {
    const len = readLengthOrInt();
    if (pos + len > buf.length) throw new Error('CBOR_TRUNCATED_TEXT');
    const str = buf.subarray(pos, pos + len).toString('utf8');
    return { value: str, nextOffset: pos + len };
  }
  if (majorType === 4) {
    const len = readLengthOrInt();
    const arr: unknown[] = [];
    for (let i = 0; i < len; i++) {
      const elem = decodeCborItem(buf, pos);
      arr.push(elem.value);
      pos = elem.nextOffset;
    }
    return { value: arr, nextOffset: pos };
  }
  if (majorType === 5) {
    const len = readLengthOrInt();
    const map = new Map<string | number, unknown>();
    for (let i = 0; i < len; i++) {
      const k = decodeCborItem(buf, pos);
      const v = decodeCborItem(buf, k.nextOffset);
      map.set(k.value as string | number, v.value);
      pos = v.nextOffset;
    }
    return { value: map, nextOffset: pos };
  }
  if (majorType === 7) {
    if (additionalInfo === 20) return { value: false, nextOffset: pos };
    if (additionalInfo === 21) return { value: true, nextOffset: pos };
    if (additionalInfo === 22) return { value: null, nextOffset: pos };
  }
  throw new Error(`CBOR_UNSUPPORTED_MAJOR_TYPE: ${majorType}`);
}

function encodeCborUint(majorType: number, val: number): Buffer {
  const mtBits = (majorType & 0x07) << 5;
  if (val < 24) {
    return Buffer.from([mtBits | val]);
  }
  if (val <= 0xff) {
    return Buffer.from([mtBits | 24, val]);
  }
  if (val <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = mtBits | 25;
    b.writeUInt16BE(val, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = mtBits | 26;
  b.writeUInt32BE(val, 1);
  return b;
}

function encodeCborInt(val: number): Buffer {
  if (val >= 0) return encodeCborUint(0, val);
  return encodeCborUint(1, -1 - val);
}

function encodeCborBytes(bytes: Buffer): Buffer {
  return Buffer.concat([encodeCborUint(2, bytes.length), bytes]);
}

function encodeCborText(str: string): Buffer {
  const utf8 = Buffer.from(str, 'utf8');
  return Buffer.concat([encodeCborUint(3, utf8.length), utf8]);
}

export function encodeCborCoseEc2P256Key(x: Buffer, y: Buffer): Buffer {
  if (x.length !== 32 || y.length !== 32) {
    throw new Error('P-256 COSE_Key requires 32-byte X and Y coordinates');
  }
  // CBOR Map(5): { 1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y }
  return Buffer.concat([
    encodeCborUint(5, 5),
    encodeCborInt(1),
    encodeCborInt(2),
    encodeCborInt(3),
    encodeCborInt(-7),
    encodeCborInt(-1),
    encodeCborInt(1),
    encodeCborInt(-2),
    encodeCborBytes(x),
    encodeCborInt(-3),
    encodeCborBytes(y),
  ]);
}

export function encodeCborAttestationObject(params: {
  fmt: string;
  authData: Buffer;
  sig?: Buffer;
  alg?: number;
  x5c?: Buffer[];
}): Buffer {
  const attStmtEntries: Buffer[] = [];
  let attStmtCount = 0;
  if (typeof params.alg === 'number') {
    attStmtCount++;
    attStmtEntries.push(encodeCborText('alg'), encodeCborInt(params.alg));
  }
  if (params.sig) {
    attStmtCount++;
    attStmtEntries.push(encodeCborText('sig'), encodeCborBytes(params.sig));
  }
  if (Array.isArray(params.x5c) && params.x5c.length > 0) {
    attStmtCount++;
    attStmtEntries.push(
      encodeCborText('x5c'),
      encodeCborUint(4, params.x5c.length),
      ...params.x5c.map((certBuf) => encodeCborBytes(certBuf))
    );
  }

  return Buffer.concat([
    encodeCborUint(5, 3),
    encodeCborText('fmt'),
    encodeCborText(params.fmt),
    encodeCborText('attStmt'),
    encodeCborUint(5, attStmtCount),
    ...attStmtEntries,
    encodeCborText('authData'),
    encodeCborBytes(params.authData),
  ]);
}

/**
 * Extracts raw 32-byte (x, y) coordinates from a 91-byte P-256 DER SPKI public key.
 */
export function extractP256CoordinatesFromSpkiDer(spkiDer: Buffer): {
  x: Buffer;
  y: Buffer;
} {
  if (
    spkiDer.length !== 91 ||
    !spkiDer.subarray(0, 27).equals(P256_SPKI_PREFIX)
  ) {
    throw new Error('Invalid P-256 SPKI DER structure');
  }
  return {
    x: Buffer.from(spkiDer.subarray(27, 59)),
    y: Buffer.from(spkiDer.subarray(59, 91)),
  };
}

/**
 * Official Apple Inc. "Apple WebAuthn Root CA" certificate (from https://www.apple.com/certificateauthority/Apple_WebAuthn_Root_CA.pem)
 * - Subject / Issuer: CN = Apple WebAuthn Root CA, O = Apple Inc., ST = California
 * - Serial Number: 68:1d:01:6c:7a:3c:e3:02:25:a5:01:94:28:47:57:71 (681D016C7A3CE30225A5019428475771)
 * - Validity: Mar 18 18:21:32 2020 GMT -> Mar 15 00:00:00 2045 GMT
 * - Public Key Algorithm: id-ecPublicKey (NIST P-384 / secp384r1), ecdsa-with-SHA384
 * - Basic Constraints: critical, CA:TRUE
 */
export const APPLE_WEBAUTHN_ROOT_CA_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIICEjCCAZmgAwIBAgIQaB0BbHo84wIlpQGUKEdXcTAKBggqhkjOPQQDAzBLMR8w',
  'HQYDVQQDDBZBcHBsZSBXZWJBdXRobiBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJ',
  'bmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMB4XDTIwMDMxODE4MjEzMloXDTQ1MDMx',
  'NTAwMDAwMFowSzEfMB0GA1UEAwwWQXBwbGUgV2ViQXV0aG4gUm9vdCBDQTETMBEG',
  'A1UECgwKQXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTB2MBAGByqGSM49',
  'AgEGBSuBBAAiA2IABCJCQ2pTVhzjl4Wo6IhHtMSAzO2cv+H9DQKev3//fG59G11k',
  'xu9eI0/7o6V5uShBpe1u6l6mS19S1FEh6yGljnZAJ+2GNP1mi/YK2kSXIuTHjxA/',
  'pcoRf7XkOtO4o1qlcaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUJtdk',
  '2cV4wlpn0afeaxLQG2PxxtcwDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2cA',
  'MGQCMFrZ+9DsJ1PW9hfNdBywZDsWDbWFp28it1d/5w2RPkRX3Bbn/UbDTNLx7Jr3',
  'jAGGiQIwHFj+dJZYUJR786osByBelJYsVZd2GbHQu209b5RCmGQ21gpSAk9QZW4B',
  '1bWeT0vT',
  '-----END CERTIFICATE-----',
].join('\n');

// OID 1.3.6.1.4.1.45724.1.1.4 (id-fido-gen-ce-aaguid)
const FIDO_AAGUID_OID_DER = Buffer.from(
  '060b2b0601040182e51c010104',
  'hex'
);

// OID 1.2.840.113635.100.8.2 (Apple Anonymous Attestation Nonce Extension)
const APPLE_ATTESTATION_NONCE_OID_DER = Buffer.from(
  '06092a864886f763640802',
  'hex'
);

function readAsn1DerLength(
  buf: Buffer,
  offset: number
): { length: number; nextOffset: number } | null {
  if (offset >= buf.length) return null;
  const first = buf[offset];
  if ((first & 0x80) === 0) {
    return { length: first, nextOffset: offset + 1 };
  }
  const numBytes = first & 0x7f;
  if (numBytes === 0 || numBytes > 3 || offset + 1 + numBytes > buf.length) {
    return null;
  }
  let len = 0;
  for (let i = 0; i < numBytes; i++) {
    len = (len << 8) | buf[offset + 1 + i];
  }
  return { length: len, nextOffset: offset + 1 + numBytes };
}

function extractFidoAaguidFromCertDer(certDer: Buffer): Buffer | null {
  const idx = certDer.indexOf(FIDO_AAGUID_OID_DER);
  if (idx === -1) return null;
  let pos = idx + FIDO_AAGUID_OID_DER.length;
  if (pos >= certDer.length) return null;
  // Optional critical BOOLEAN (0x01 0x01 0x00/0xff)
  if (certDer[pos] === 0x01) {
    const boolLen = certDer[pos + 1] ?? 0;
    pos += 2 + boolLen;
  }
  if (pos >= certDer.length || certDer[pos] !== 0x04) return null;
  const outerLen = readAsn1DerLength(certDer, pos + 1);
  if (!outerLen) return null;
  pos = outerLen.nextOffset;
  // Inner OCTET STRING (0x04 0x10 <16-byte AAGUID>)
  if (
    pos + 18 <= certDer.length &&
    certDer[pos] === 0x04 &&
    certDer[pos + 1] === 0x10
  ) {
    return certDer.subarray(pos + 2, pos + 18);
  }
  return null;
}

function extractAppleNonceFromCertDer(certDer: Buffer): Buffer | null {
  const idx = certDer.indexOf(APPLE_ATTESTATION_NONCE_OID_DER);
  if (idx === -1) return null;
  let pos = idx + APPLE_ATTESTATION_NONCE_OID_DER.length;
  if (pos >= certDer.length) return null;
  if (certDer[pos] === 0x01) {
    const boolLen = certDer[pos + 1] ?? 0;
    pos += 2 + boolLen;
  }
  if (pos >= certDer.length || certDer[pos] !== 0x04) return null;
  const outerLen = readAsn1DerLength(certDer, pos + 1);
  if (
    !outerLen ||
    outerLen.nextOffset + outerLen.length > certDer.length
  ) {
    return null;
  }
  const extSlice = certDer.subarray(
    outerLen.nextOffset,
    outerLen.nextOffset + outerLen.length
  );
  const octetMarker = Buffer.from([0x04, 0x20]);
  const markerIdx = extSlice.indexOf(octetMarker);
  if (markerIdx === -1 || markerIdx + 2 + 32 > extSlice.length) return null;
  return extSlice.subarray(markerIdx + 2, markerIdx + 34);
}

export function loadTrustedWebAuthnRootCerts(
  extraRootPems?: string[]
): crypto.X509Certificate[] {
  // Strictly parse and cryptographically self-verify the built-in official Apple WebAuthn Root CA (no silent catch!)
  const officialAppleRoot = new crypto.X509Certificate(
    APPLE_WEBAUTHN_ROOT_CA_PEM
  );
  if (
    !officialAppleRoot.ca ||
    !officialAppleRoot.verify(officialAppleRoot.publicKey)
  ) {
    throw new Error(
      'FATAL_WEBAUTHN_TRUST_STORE: Official Apple WebAuthn Root CA failed self-verification.'
    );
  }

  const parsed: crypto.X509Certificate[] = [officialAppleRoot];
  const extraCandidates: string[] = [];
  if (process.env.ROTACLUB_WEBAUTHN_TRUSTED_ROOT_PEM) {
    extraCandidates.push(process.env.ROTACLUB_WEBAUTHN_TRUSTED_ROOT_PEM);
  }
  if (Array.isArray(extraRootPems)) {
    extraCandidates.push(...extraRootPems);
  }
  for (const pem of extraCandidates) {
    if (!pem || !pem.trim()) continue;
    parsed.push(new crypto.X509Certificate(pem));
  }
  return parsed;
}

/**
 * Strict W3C WebAuthn Attestation Object + X.509 Hardware PKI Trust Model + CBOR COSE_Key P-256 Verifier (#12, #22, #17, #76).
 * - Rejects software authenticators, bare 37-byte authenticatorData, all-zero AAGUIDs, and unattested (fmt: 'none') registrations.
 * - Rejects self-attestation (fmt: 'packed' without x5c) so software keys cannot spoof hardware AAGUIDs.
 * - Verifies full X.509 certificate chains (x5c) up to a trusted Hardware Attestation Root CA, rejecting self-signed or untrusted CAs.
 * - Verifies cryptographic binding between x5c[0] extensions (FIDO id-fido-gen-ce-aaguid 1.3.6.1.4.1.45724.1.1.4 or Apple 1.2.840.113635.100.8.2) and authenticatorData.
 */
export function verifyAndExtractWebAuthnRegistration(params: {
  attestationObjectB64Url?: string;
  clientDataJSONB64Url: string;
  credentialIdB64Url: string;
  expectedRpId: string;
  authenticatorDataB64Url?: string;
  publicKeySpkiB64Url?: string;
  authenticatorAttachment?: string;
  trustedRootPems?: string[];
}):
  | {
      ok: true;
      publicKeySpkiB64: string;
      signCount: number;
      aaguidHex: string;
      fmt: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      message: string;
    } {
  if (
    params.authenticatorAttachment &&
    ['software', 'virtual', 'simulated', 'mock', 'fallback'].includes(
      String(params.authenticatorAttachment).trim().toLowerCase()
    )
  ) {
    return {
      ok: false,
      status: 401,
      error: 'SOFTWARE_AUTHENTICATOR_REJECTED',
      message:
        'Yazılımsal veya simüle edilmiş WebAuthn anahtarları kabul edilmez; gerçek donanım doğrulayıcısı (Face ID / Touch ID / FIDO2) zorunludur (#22, #76).',
    };
  }

  if (
    !params.attestationObjectB64Url ||
    typeof params.attestationObjectB64Url !== 'string' ||
    !params.attestationObjectB64Url.trim()
  ) {
    return {
      ok: false,
      status: 400,
      error: 'ATTESTATION_OBJECT_REQUIRED',
      message:
        'WebAuthn donanım kaydı için W3C CBOR attestationObject zorunludur; ham/yazılımsal kayıt istekleri reddedilir (#22, #76).',
    };
  }

  let attMap: Map<string | number, unknown>;
  try {
    const attBuf = Buffer.from(params.attestationObjectB64Url, 'base64url');
    const decoded = decodeCborItem(attBuf, 0);
    if (
      decoded.nextOffset !== attBuf.length ||
      !(decoded.value instanceof Map)
    ) {
      return {
        ok: false,
        status: 400,
        error: 'INVALID_ATTESTATION_OBJECT',
        message: 'CBOR attestationObject yapısı geçersiz veya bozuk.',
      };
    }
    attMap = decoded.value as Map<string | number, unknown>;
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'INVALID_ATTESTATION_OBJECT',
      message: 'CBOR attestationObject çözümlenemedi.',
    };
  }

  const fmt = attMap.get('fmt');
  const attStmt = attMap.get('attStmt');
  const authData = attMap.get('authData');

  const allowedFormats = new Set([
    'none',
    'packed',
    'apple',
    'apple-appattest',
    'fido-u2f',
    'tpm',
    'android-key',
    'android-safetynet',
  ]);
  if (typeof fmt !== 'string' || !allowedFormats.has(fmt)) {
    return {
      ok: false,
      status: 401,
      error: 'INVALID_ATTESTATION_FORMAT',
      message: `Desteklenmeyen veya sahte WebAuthn attestation formatı: "${String(fmt)}".`,
    };
  }

  if (!Buffer.isBuffer(authData)) {
    return {
      ok: false,
      status: 400,
      error: 'INVALID_AUTHENTICATOR_DATA',
      message: 'attestationObject içinde geçerli binary authData bulunamadı.',
    };
  }

  // If client also supplied authenticatorData, it must match attestationObject.authData byte-for-byte
  if (params.authenticatorDataB64Url) {
    const clientAuthData = Buffer.from(
      String(params.authenticatorDataB64Url),
      'base64url'
    );
    if (
      clientAuthData.length !== authData.length ||
      !crypto.timingSafeEqual(clientAuthData, authData)
    ) {
      return {
        ok: false,
        status: 401,
        error: 'AUTHENTICATOR_DATA_MISMATCH',
        message:
          'Gönderilen authenticatorData ile CBOR attestationObject.authData birbiriyle eşleşmiyor.',
      };
    }
  }

  if (authData.length < 55) {
    return {
      ok: false,
      status: 401,
      error: 'ATTESTED_CREDENTIAL_DATA_REQUIRED',
      message:
        'WebAuthn kayıt authData içinde Attested Credential Data (AAGUID + Credential ID + COSE_Key) eksik; 37-byte yazılımsal sahte kayıtlar reddedilir (#22, #76).',
    };
  }

  const expectedRpIdHash = crypto
    .createHash('sha256')
    .update(params.expectedRpId, 'utf8')
    .digest();
  if (!crypto.timingSafeEqual(expectedRpIdHash, authData.subarray(0, 32))) {
    return {
      ok: false,
      status: 401,
      error: 'INVALID_RP_ID_HASH',
      message:
        'WebAuthn kayıt authenticatorData rpIdHash değeri sunucu rpId özetiyle eşleşmiyor.',
    };
  }

  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const attestedCredentialDataIncluded = (flags & 0x40) !== 0;

  if (!userPresent || !userVerified) {
    return {
      ok: false,
      status: 401,
      error: 'USER_VERIFICATION_REQUIRED',
      message:
        'WebAuthn donanım kaydında User Present (UP) ve User Verified (UV / Face ID / Touch ID) bayrakları zorunludur.',
    };
  }

  if (!attestedCredentialDataIncluded) {
    return {
      ok: false,
      status: 401,
      error: 'ATTESTED_CREDENTIAL_DATA_REQUIRED',
      message:
        'WebAuthn kayıt verisinde AT (0x40 - Attested Credential Data) bayrağı bulunmuyor; yazılımsal sahte kayıt reddedildi.',
    };
  }

  const initialSignCount = authData.readUInt32BE(33);
  const aaguidBuf = authData.subarray(37, 53);
  const aaguidHex = aaguidBuf.toString('hex');
  const isAllZeroAaguid = aaguidBuf.every((b) => b === 0);

  if (isAllZeroAaguid) {
    return {
      ok: false,
      status: 401,
      error: 'SOFTWARE_AUTHENTICATOR_REJECTED',
      message:
        'Sıfır AAGUID (00000000-0000-0000-0000-000000000000) içeren yazılımsal/anonim WebAuthn kaydı güvenlik politikası gereği reddedildi (#22, #17).',
    };
  }

  if (fmt === 'none') {
    return {
      ok: false,
      status: 401,
      error: 'UNATTESTED_REGISTRATION_REJECTED',
      message:
        'İmzasız/sertifikasız (fmt: none) WebAuthn kaydı güvenlik politikası gereği reddedildi; donanım kök sertifikası (x5c) doğrulaması zorunludur (#22, #17).',
    };
  }

  const credIdLen = authData.readUInt16BE(53);
  if (
    credIdLen < 16 ||
    credIdLen > 512 ||
    authData.length < 55 + credIdLen + 40
  ) {
    return {
      ok: false,
      status: 401,
      error: 'INVALID_ATTESTED_CREDENTIAL_LENGTH',
      message: 'Attested Credential ID uzunluğu veya COSE_Key alanı geçersiz.',
    };
  }

  const attestedCredIdBuf = authData.subarray(55, 55 + credIdLen);
  const submittedCredIdBuf = Buffer.from(
    String(params.credentialIdB64Url),
    'base64url'
  );
  if (
    attestedCredIdBuf.length !== submittedCredIdBuf.length ||
    !crypto.timingSafeEqual(attestedCredIdBuf, submittedCredIdBuf)
  ) {
    return {
      ok: false,
      status: 401,
      error: 'ATTESTED_CREDENTIAL_ID_MISMATCH',
      message:
        'attestationObject.authData içindeki gömülü Credential ID ile gönderilen credentialId eşleşmiyor.',
    };
  }

  // Decode CBOR COSE_Key from authData[55 + credIdLen ..]
  const coseBytes = authData.subarray(55 + credIdLen);
  let coseMap: Map<string | number, unknown>;
  try {
    const decodedCose = decodeCborItem(coseBytes, 0);
    if (!(decodedCose.value instanceof Map)) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_COSE_PUBLIC_KEY',
        message: 'Attested Credential Data içindeki COSE_Key haritası geçersiz.',
      };
    }
    coseMap = decodedCose.value as Map<string | number, unknown>;
  } catch {
    return {
      ok: false,
      status: 401,
      error: 'INVALID_COSE_PUBLIC_KEY',
      message: 'CBOR COSE_Key açık anahtarı çözümlenemedi.',
    };
  }

  const kty = coseMap.get(1);
  const alg = coseMap.get(3);
  const crv = coseMap.get(-1);
  const coseX = coseMap.get(-2);
  const coseY = coseMap.get(-3);

  if (
    kty !== 2 ||
    alg !== -7 ||
    crv !== 1 ||
    !Buffer.isBuffer(coseX) ||
    !Buffer.isBuffer(coseY) ||
    coseX.length !== 32 ||
    coseY.length !== 32
  ) {
    return {
      ok: false,
      status: 401,
      error: 'INVALID_COSE_PUBLIC_KEY',
      message:
        'COSE_Key EC2 P-256 (kty=2, alg=-7, crv=1, 32-byte X/Y) kriterlerini sağlamıyor.',
    };
  }

  const derivedSpkiDer = Buffer.concat([P256_SPKI_PREFIX, coseX, coseY]);
  let publicKeyObj: crypto.KeyObject;
  try {
    publicKeyObj = crypto.createPublicKey({
      key: derivedSpkiDer,
      format: 'der',
      type: 'spki',
    });
    if (publicKeyObj.asymmetricKeyType !== 'ec') {
      throw new Error('Not EC key');
    }
  } catch {
    return {
      ok: false,
      status: 401,
      error: 'INVALID_PUBLIC_KEY_SPKI',
      message: 'COSE_Key koordinatları geçerli bir NIST P-256 eğri noktası değil.',
    };
  }

  if (params.publicKeySpkiB64Url) {
    const clientSpkiDer = Buffer.from(
      String(params.publicKeySpkiB64Url),
      'base64url'
    );
    if (
      clientSpkiDer.length !== derivedSpkiDer.length ||
      !crypto.timingSafeEqual(clientSpkiDer, derivedSpkiDer)
    ) {
      return {
        ok: false,
        status: 401,
        error: 'ATTESTED_COSE_KEY_MISMATCH',
        message:
          'Sunulan publicKeySpkiB64 ile attestationObject içindeki CBOR COSE_Key açık anahtarı eşleşmiyor (#22, #76).',
      };
    }
  }

  const attStmtMap =
    attStmt instanceof Map ? (attStmt as Map<string | number, unknown>) : null;
  const x5cRaw = attStmtMap?.get('x5c');

  // Strict Hardware Attestation Trust Model (#22, #17):
  // Require a valid X.509 certificate chain (x5c) in attStmt; reject self-attestation (no x5c)
  if (
    !Array.isArray(x5cRaw) ||
    x5cRaw.length === 0 ||
    !x5cRaw.every((item) => Buffer.isBuffer(item))
  ) {
    return {
      ok: false,
      status: 401,
      error: 'SELF_ATTESTATION_REJECTED',
      message:
        'Donanım X.509 sertifika zinciri (x5c) içermeyen self-attestation WebAuthn kaydı reddedildi; yazılımsal anahtarlarla sahte donanım kimliği (AAGUID) üretilemez (#22, #17).',
    };
  }

  const certChain: crypto.X509Certificate[] = [];
  try {
    for (const rawDer of x5cRaw as Buffer[]) {
      certChain.push(new crypto.X509Certificate(rawDer));
    }
  } catch {
    return {
      ok: false,
      status: 401,
      error: 'INVALID_ATTESTATION_CERTIFICATE',
      message: 'WebAuthn attStmt.x5c içindeki X.509 sertifikası çözümlenemedi.',
    };
  }

  const leafCert = certChain[0];
  if (leafCert.ca) {
    return {
      ok: false,
      status: 401,
      error: 'INVALID_ATTESTATION_CERTIFICATE',
      message: 'WebAuthn yaprak (leaf) attestation sertifikası CA:TRUE olamaz.',
    };
  }

  // Reject self-signed leaf certificates
  if (
    leafCert.subject === leafCert.issuer ||
    leafCert.verify(leafCert.publicKey)
  ) {
    return {
      ok: false,
      status: 401,
      error: 'UNTRUSTED_ATTESTATION_ROOT',
      message:
        'Self-signed (kendi kendine imzalı) sahte WebAuthn sertifikası reddedildi; güvenilir donanım kök otoritesi zorunludur (#22, #17).',
    };
  }

  const nowMs = Date.now();
  for (const cert of certChain) {
    const notBefore = Date.parse(cert.validFrom);
    const notAfter = Date.parse(cert.validTo);
    if (
      Number.isNaN(notBefore) ||
      Number.isNaN(notAfter) ||
      nowMs < notBefore ||
      nowMs > notAfter
    ) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_ATTESTATION_CERTIFICATE',
        message: 'WebAuthn donanım sertifikasının geçerlilik süresi dolmuş veya henüz başlamamış.',
      };
    }
  }

  // Verify intermediate chain signatures
  for (let i = 0; i < certChain.length - 1; i++) {
    const child = certChain[i];
    const issuer = certChain[i + 1];
    if (
      !issuer.ca ||
      child.issuer !== issuer.subject ||
      !child.verify(issuer.publicKey)
    ) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_ATTESTATION_CERTIFICATE',
        message: 'WebAuthn x5c sertifika zinciri ara imzası doğrulanamadı.',
      };
    }
  }

  // Verify that the chain terminates at a Trusted Hardware Attestation Root CA
  const topCert = certChain[certChain.length - 1];
  const trustedRoots = loadTrustedWebAuthnRootCerts(params.trustedRootPems);
  const anchoredToTrustedRoot = trustedRoots.some((rootCert) => {
    const rootValidFrom = Date.parse(rootCert.validFrom);
    const rootValidTo = Date.parse(rootCert.validTo);
    if (
      !rootCert.ca ||
      Number.isNaN(rootValidFrom) ||
      Number.isNaN(rootValidTo) ||
      nowMs < rootValidFrom ||
      nowMs > rootValidTo
    ) {
      return false;
    }
    if (
      topCert.issuer === rootCert.subject &&
      topCert.verify(rootCert.publicKey)
    ) {
      return true;
    }
    if (certChain.length >= 2 && topCert.raw.equals(rootCert.raw)) {
      return true;
    }
    return false;
  });

  if (!anchoredToTrustedRoot) {
    return {
      ok: false,
      status: 401,
      error: 'UNTRUSTED_ATTESTATION_ROOT',
      message:
        'WebAuthn donanım sertifika zinciri (x5c) güvenilir bir donanım kök otoritesine (Apple WebAuthn Root CA / FIDO2 Root CA) bağlanamadı; sahte donanım kimliği reddedildi (#22, #17).',
    };
  }

  const clientDataBytes = Buffer.from(
    String(params.clientDataJSONB64Url),
    'base64url'
  );
  const clientDataHash = crypto
    .createHash('sha256')
    .update(clientDataBytes)
    .digest();
  const signedData = Buffer.concat([authData, clientDataHash]);

  if (fmt === 'apple') {
    const expectedNonce = crypto
      .createHash('sha256')
      .update(signedData)
      .digest();
    const certNonce = extractAppleNonceFromCertDer(leafCert.raw);
    if (
      !certNonce ||
      certNonce.length !== expectedNonce.length ||
      !crypto.timingSafeEqual(certNonce, expectedNonce)
    ) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_APPLE_ATTESTATION_NONCE',
        message:
          'Apple WebAuthn sertifikası (1.2.840.113635.100.8.2) içindeki nonce özeti doğrulanamadı (#22, #17).',
      };
    }

    const leafSpkiDer = leafCert.publicKey.export({
      format: 'der',
      type: 'spki',
    }) as Buffer;
    if (
      leafSpkiDer.length !== derivedSpkiDer.length ||
      !crypto.timingSafeEqual(leafSpkiDer, derivedSpkiDer)
    ) {
      return {
        ok: false,
        status: 401,
        error: 'ATTESTED_COSE_KEY_MISMATCH',
        message:
          'Apple attestation sertifikası açık anahtarı ile authenticatorData COSE_Key eşleşmiyor.',
      };
    }
  } else {
    // Verify FIDO AAGUID extension (OID 1.3.6.1.4.1.45724.1.1.4) matches authData.aaguid
    const certAaguidBuf = extractFidoAaguidFromCertDer(leafCert.raw);
    if (
      !certAaguidBuf ||
      certAaguidBuf.length !== aaguidBuf.length ||
      !crypto.timingSafeEqual(certAaguidBuf, aaguidBuf)
    ) {
      return {
        ok: false,
        status: 401,
        error: 'ATTESTATION_AAGUID_MISMATCH',
        message:
          'Donanım sertifikası (x5c) içindeki FIDO AAGUID uzantısı (1.3.6.1.4.1.45724.1.1.4) ile authenticatorData AAGUID değeri eşleşmiyor; sahte donanım kimliği reddedildi (#22, #17).',
      };
    }

    const attSig =
      attStmtMap && Buffer.isBuffer(attStmtMap.get('sig'))
        ? (attStmtMap.get('sig') as Buffer)
        : null;
    if (!attSig) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_ATTESTATION_SIGNATURE',
        message: 'Donanım attestation formatında attStmt.sig imzası zorunludur.',
      };
    }

    const derSig = ensureDerEcdsaSignature(attSig);
    const sigValid = crypto.verify(
      'sha256',
      signedData,
      leafCert.publicKey,
      derSig
    );
    if (!sigValid) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_ATTESTATION_SIGNATURE',
        message:
          'WebAuthn attestationObject (attStmt.sig) kriptografik donanım imzası geçersiz (#22, #76).',
      };
    }
  }

  return {
    ok: true,
    publicKeySpkiB64: derivedSpkiDer.toString('base64url'),
    signCount: initialSignCount,
    aaguidHex,
    fmt,
  };
}

/**
 * Secure Account Provisioning (#22, #70):
 * Zero hardcoded salts, zero precomputed hashes, and zero plaintext password files on disk.
 * Accounts without an explicit environment secret start with activated=false until claimed
 * via the one-time initial admin activation flow (/api/auth/bootstrap-claim) or provisioned by the President.
 */
function buildProvisionedAccount(params: {
  memberId: string;
  rotaryId: string;
  fullName: string;
  email: string;
  role: ClubRole;
  clubId: AllowedTenantClubId;
  clubMemberships: ClubMembershipBinding[];
  envPinVar: string;
}): PilotUserAccount {
  const salt = crypto.randomBytes(16).toString('hex');
  const envSecret = process.env[params.envPinVar]?.trim();
  const hasExplicitEnvSecret = Boolean(envSecret && envSecret.length >= 6);
  const initialSecret = hasExplicitEnvSecret
    ? envSecret!
    : crypto.randomBytes(24).toString('base64url');

  return {
    memberId: params.memberId,
    rotaryId: params.rotaryId,
    fullName: params.fullName,
    email: params.email,
    role: params.role,
    clubId: params.clubId,
    clubMemberships: params.clubMemberships,
    passwordSalt: salt,
    passwordHash: hashPinWithSalt(initialSecret, salt),
    activated: hasExplicitEnvSecret,
    webauthnCredentials: [],
  };
}

export function createInitialPilotAccounts(): PilotUserAccount[] {
  return [
    buildProvisionedAccount({
      memberId: 'm-rifat',
      rotaryId: 'TR-2420-88412',
      fullName: 'Rtn. Rifat Akın',
      email: 'rifat.akin@galatarotary.org',
      role: 'uye',
      clubId: 'club-galata',
      // Strictly Galata member ONLY (#70)
      clubMemberships: [{ clubId: 'club-galata', role: 'uye' }],
      envPinVar: 'ROTACLUB_PIN_UYE',
    }),
    buildProvisionedAccount({
      memberId: 'm-nazli',
      rotaryId: 'TR-2420-81024',
      fullName: 'Rtn. Av. Nazlı Denizmen',
      email: 'sekreter@galatarotary.org',
      role: 'sekreter',
      clubId: 'club-galata',
      // Strictly Galata secretary ONLY (#70)
      clubMemberships: [{ clubId: 'club-galata', role: 'sekreter' }],
      envPinVar: 'ROTACLUB_PIN_SEKRETER',
    }),
    buildProvisionedAccount({
      memberId: 'm-levent',
      rotaryId: 'TR-2420-79310',
      fullName: 'Rtn. YMM Levent Soydan',
      email: 'sayman@galatarotary.org',
      role: 'sayman',
      clubId: 'club-galata',
      // Strictly Galata treasurer ONLY (#70)
      clubMemberships: [{ clubId: 'club-galata', role: 'sayman' }],
      envPinVar: 'ROTACLUB_PIN_SAYMAN',
    }),
    buildProvisionedAccount({
      memberId: 'm-emre',
      rotaryId: 'TR-2420-74105',
      fullName: 'Rtn. Mimar Emre Karaca',
      email: 'baskan@galatarotary.org',
      role: 'baskan',
      clubId: 'club-galata',
      // Issue #70 Fix: Galata President is 'baskan' ONLY in club-galata!
      // Does NOT hold 'baskan' over Karaköy or Maçka!
      clubMemberships: [{ clubId: 'club-galata', role: 'baskan' }],
      envPinVar: 'ROTACLUB_PIN_BASKAN',
    }),
    buildProvisionedAccount({
      memberId: 'm-club-karakoy-baskan',
      rotaryId: 'TR-2420-KRK-01',
      fullName: 'Rtn. Karaköy Rotary Kulübü Başkanı',
      email: 'baskan@karakoyrotary.org',
      role: 'baskan',
      clubId: 'club-karakoy',
      // Strictly Karaköy President ONLY (#70)
      clubMemberships: [{ clubId: 'club-karakoy', role: 'baskan' }],
      envPinVar: 'ROTACLUB_PIN_KARAKOY_BASKAN',
    }),
    buildProvisionedAccount({
      memberId: 'm-club-macka-baskan',
      rotaryId: 'TR-2420-MCK-01',
      fullName: 'Rtn. Maçka Rotary Kulübü Başkanı',
      email: 'baskan@mackarotary.org',
      role: 'baskan',
      clubId: 'club-macka',
      // Strictly Maçka President ONLY (#70)
      clubMemberships: [{ clubId: 'club-macka', role: 'baskan' }],
      envPinVar: 'ROTACLUB_PIN_MACKA_BASKAN',
    }),
    buildProvisionedAccount({
      memberId: 'm-district-gov',
      rotaryId: 'TR-2420-GOV-01',
      fullName: 'Rtn. GDB Bölge Guvernörü',
      email: 'guvernor@rotary2420.org',
      role: 'baskan',
      clubId: 'club-district2420',
      // Issue #70 Fix: District Governor is 'baskan' in club-district2420,
      // and only visiting 'uye' (observer) when switching into individual clubs!
      clubMemberships: [
        { clubId: 'club-district2420', role: 'baskan' },
        { clubId: 'club-galata', role: 'uye' },
        { clubId: 'club-karakoy', role: 'uye' },
        { clubId: 'club-macka', role: 'uye' },
      ],
      envPinVar: 'ROTACLUB_PIN_DISTRICT_GOV',
    }),
  ];
}

const runtimeRevokedJtis = new Set<string>();

export function revokeTokenJti(jti: string): void {
  if (jti) {
    runtimeRevokedJtis.add(jti);
  }
}

export function isTokenJtiRevoked(jti: string): boolean {
  return runtimeRevokedJtis.has(jti);
}

export function getGenesisHashForClub(clubId: string): string {
  if (clubId === 'club-galata') return 'GENESIS_2420';
  const normalized = clubId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return `GENESIS_${normalized}_2420`;
}

export function computeAuditHash(
  payload: Omit<ChainedAuditLogEntry, 'entryHash'>
): string {
  const canonical = [
    payload.sequenceNo,
    payload.id,
    payload.timestamp,
    payload.clubId,
    payload.actorName,
    payload.actorRole,
    payload.module,
    payload.action,
    payload.detail,
    payload.prevHash,
  ].join('|');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function verifyAuditChain(
  ledger: ChainedAuditLogEntry[],
  clubId = 'club-galata'
): {
  valid: boolean;
  totalEntries: number;
  headHash: string;
  brokenAtSequence?: number;
} {
  const genesisHash = getGenesisHashForClub(clubId);
  if (!ledger || ledger.length === 0) {
    return { valid: true, totalEntries: 0, headHash: genesisHash };
  }
  const sorted = [...ledger].sort((a, b) => a.sequenceNo - b.sequenceNo);
  let expectedPrev = genesisHash;
  for (const item of sorted) {
    if (item.clubId !== clubId) {
      return {
        valid: false,
        totalEntries: sorted.length,
        headHash: sorted[sorted.length - 1].entryHash,
        brokenAtSequence: item.sequenceNo,
      };
    }
    if (item.prevHash !== expectedPrev) {
      return {
        valid: false,
        totalEntries: sorted.length,
        headHash: sorted[sorted.length - 1].entryHash,
        brokenAtSequence: item.sequenceNo,
      };
    }
    const recomputed = computeAuditHash({
      id: item.id,
      sequenceNo: item.sequenceNo,
      timestamp: item.timestamp,
      clubId: item.clubId,
      actorName: item.actorName,
      actorRole: item.actorRole,
      module: item.module,
      action: item.action,
      detail: item.detail,
      verifiedByServer: item.verifiedByServer,
      prevHash: item.prevHash,
    });
    if (recomputed !== item.entryHash) {
      return {
        valid: false,
        totalEntries: sorted.length,
        headHash: sorted[sorted.length - 1].entryHash,
        brokenAtSequence: item.sequenceNo,
      };
    }
    expectedPrev = item.entryHash;
  }
  return {
    valid: true,
    totalEntries: sorted.length,
    headHash: sorted[sorted.length - 1].entryHash,
  };
}

export function issueSignedToken(
  user: Omit<AuthenticatedUser, 'iat' | 'exp' | 'jti'>
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload: AuthenticatedUser = {
    ...user,
    iat: nowSec,
    exp: nowSec + 60 * 60 * 12, // 12 hours
    jti: crypto.randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', getServerSecret())
    .update(payloadB64, 'utf8')
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySignedToken(
  token: string | undefined,
  extraRevokedJtis?: string[]
): AuthenticatedUser | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getServerSecret())
    .update(payloadB64, 'utf8')
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as AuthenticatedUser;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!decoded.exp || decoded.exp < nowSec) {
      return null;
    }
    if (
      decoded.jti &&
      (runtimeRevokedJtis.has(decoded.jti) ||
        (extraRevokedJtis && extraRevokedJtis.includes(decoded.jti)))
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function findPilotAccount(
  identifier: string,
  accounts: PilotUserAccount[]
): PilotUserAccount | undefined {
  const normalized = String(identifier || '').trim().toLowerCase();
  return accounts.find(
    (acc) =>
      acc.rotaryId.toLowerCase() === normalized ||
      acc.email.toLowerCase() === normalized ||
      acc.memberId.toLowerCase() === normalized ||
      (acc.clubId === 'club-galata' && acc.role === normalized)
  );
}

export function getAccountClubMembership(
  account: PilotUserAccount,
  clubId: string
): ClubMembershipBinding | null {
  if (!isAllowedTenantClubId(clubId)) return null;
  const memberships = account.clubMemberships || [
    { clubId: account.clubId, role: account.role },
  ];
  return memberships.find((m) => m.clubId === clubId) || null;
}

export function authenticatePilotCredentials(
  identifier: string,
  pinOrPassword: string,
  clubId = 'club-galata',
  accounts: PilotUserAccount[]
):
  | { ok: true; user: AuthenticatedUser; token: string }
  | {
      ok: false;
      reason:
        | 'INVALID_CREDENTIALS'
        | 'ACCOUNT_ACTIVATION_REQUIRED'
        | 'UNKNOWN_CLUB_TENANT'
        | 'CLUB_MEMBERSHIP_FORBIDDEN';
    } {
  if (!isAllowedTenantClubId(clubId)) {
    return { ok: false, reason: 'UNKNOWN_CLUB_TENANT' };
  }

  const account = findPilotAccount(identifier, accounts);
  if (!account) {
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  if (account.activated === false) {
    return { ok: false, reason: 'ACCOUNT_ACTIVATION_REQUIRED' };
  }

  const computedHash = hashPinWithSalt(
    pinOrPassword.trim(),
    account.passwordSalt
  );
  const hashA = Buffer.from(computedHash, 'hex');
  const hashB = Buffer.from(account.passwordHash, 'hex');
  if (hashA.length !== hashB.length || !crypto.timingSafeEqual(hashA, hashB)) {
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  // Issue #70 Fix: Verify that the authenticated user is actually a member of the requested clubId!
  const membership = getAccountClubMembership(account, clubId);
  if (!membership) {
    return { ok: false, reason: 'CLUB_MEMBERSHIP_FORBIDDEN' };
  }

  const userPayload = {
    memberId: account.memberId,
    rotaryId: account.rotaryId,
    fullName: account.fullName,
    email: account.email,
    role: membership.role,
    clubId: membership.clubId,
    authMethod: 'pin' as const,
  };
  const token = issueSignedToken(userPayload);
  const verified = verifySignedToken(token)!;
  return { ok: true, user: verified, token };
}

function createInitialAuditChainForClub(
  clubId: string,
  clubName: string
): ChainedAuditLogEntry[] {
  const genesisHash = getGenesisHashForClub(clubId);
  const isGalata = clubId === 'club-galata';

  const seeds: Array<{
    id: string;
    timestamp: string;
    actorName: string;
    actorRole: ClubRole;
    module: AuditLogEntry['module'];
    action: string;
    detail: string;
  }> = isGalata
    ? [
        {
          id: 'aud-1001',
          timestamp: '20 Ekim 2026 · 09:00:00',
          actorName: 'Rtn. Mimar Emre Karaca (Dönem Başkanı)',
          actorRole: 'baskan',
          module: 'Yönetim & Güvenlik',
          action:
            'Galata Rotary Pilot Veritabanı & Kriptografik Denetim Zinciri Başlatıldı',
          detail:
            'SHA-256 hash zincirli denetim defteri, HMAC-SHA256 oturum doğrulaması ve çoklu kulüp izolasyonu başlatıldı.',
        },
        {
          id: 'aud-1002',
          timestamp: '20 Ekim 2026 · 18:45:00',
          actorName: 'Rtn. YMM Levent Soydan (Sayman)',
          actorRole: 'sayman',
          module: 'Saymanlık & Kasa',
          action: 'Banka Mutabakatlı Kasa Tahsilat Kaydı (GAR-2026-99120)',
          detail:
            '14 üyenin Ekim ayı aidat ve kuver tahsilatı (168.000 TL) banka ekstresiyle eşleştirilerek kasa defterine işlendi.',
        },
        {
          id: 'aud-1003',
          timestamp: '22 Ekim 2026 · 11:15:00',
          actorName: 'Rtn. Kerem Soylu (Üye · TR-2420-83190)',
          actorRole: 'uye',
          module: 'Saymanlık & Kasa',
          action: 'FAST Dekont Bildirimi (GAR-2026-88341)',
          detail:
            '9.000 TL 1. Yarıyıl Aidat 2. Taksit ödemesi banka mutabakatı ve Sayman onayı kuyruğuna eklendi.',
        },
        {
          id: 'aud-1004',
          timestamp: '22 Ekim 2026 · 14:20:00',
          actorName: 'Rtn. Av. Nazlı Denizmen (Genel Sekreter)',
          actorRole: 'sekreter',
          module: 'LCV & Kuver',
          action: '1842. Toplantı Kuver Matrisi Senkronizasyonu',
          detail:
            'Pera Palace Hotel mutfak kuver listesi (35 Kuver) sunucu veritabanında doğrulandı.',
        },
      ]
    : [
        {
          id: `aud-${clubId}-1001`,
          timestamp: '20 Ekim 2026 · 09:00:00',
          actorName: `${clubName} Dönem Başkanlığı`,
          actorRole: 'baskan',
          module: 'Yönetim & Güvenlik',
          action: `${clubName} İzole Veritabanı & SHA-256 Denetim Zinciri Başlatıldı`,
          detail: `${clubName} için kulüpler arası tamamen izole edilmiş (Zero Cross-Tenant Leak) veri alanı oluşturuldu.`,
        },
      ];

  const chain: ChainedAuditLogEntry[] = [];
  let prevHash = genesisHash;
  seeds.forEach((seed, idx) => {
    const partial: Omit<ChainedAuditLogEntry, 'entryHash'> = {
      ...seed,
      clubId,
      sequenceNo: idx + 1,
      verifiedByServer: true,
      prevHash,
    };
    const entryHash = computeAuditHash(partial);
    chain.push({ ...partial, entryHash });
    prevHash = entryHash;
  });

  return chain.reverse();
}

function createInitialBankStatementsForClub(
  clubId: string
): BankStatementEntry[] {
  if (clubId !== 'club-galata') {
    const prefix = clubId.replace('club-', '').toUpperCase();
    return [
      {
        bankRef: `${prefix}-2026-1001`,
        type: 'Gelir',
        amount: 9000,
        senderName: `Rtn. ${prefix} Rotary Başkanı`,
        date: '23 Ekim 2026 · 10:00',
        description: `${prefix} Rotary — Dönem Aidatı FAST Tahsilatı`,
        reconciled: false,
      },
    ];
  }

  return [
    {
      bankRef: 'GAR-2026-88341',
      type: 'Gelir',
      amount: 9000,
      senderName: 'Rtn. Kerem Soylu',
      date: '22 Ekim 2026 · 10:42',
      description: 'Garanti BBVA FAST — 1. Yarıyıl Aidat 2. Taksit',
      reconciled: false,
    },
    {
      bankRef: 'ISBK-2026-44120',
      type: 'Gelir',
      amount: 12000,
      senderName: 'Rtn. Defne Serezli',
      date: '21 Ekim 2026 · 16:40',
      description:
        'İş Bankası FAST — GALATART Sergi Fonu ve PolioPlus Katkı Payı',
      reconciled: false,
    },
    {
      bankRef: 'GAR-2026-99501',
      type: 'Gelir',
      amount: 5000,
      senderName: 'Rtn. Rifat Akın',
      date: '23 Ekim 2026 · 15:00',
      description:
        'Garanti BBVA FAST — Galata Rotary Proje / Burs / Aidat Ödemesi #1',
      reconciled: false,
    },
    {
      bankRef: 'GAR-2026-99502',
      type: 'Gelir',
      amount: 4500,
      senderName: 'Rtn. Rifat Akın',
      date: '23 Ekim 2026 · 15:10',
      description:
        'Garanti BBVA FAST — Galata Rotary Eğitim Bursu Katkı Ödemesi #2',
      reconciled: false,
    },
    {
      bankRef: 'GAR-2026-99503',
      type: 'Gelir',
      amount: 7500,
      senderName: 'Rtn. Rifat Akın',
      date: '23 Ekim 2026 · 15:20',
      description:
        'Garanti BBVA FAST — Galata Rotary Hizmet Projesi Bağışı #3',
      reconciled: false,
    },
    {
      bankRef: 'PERA-2026-77101',
      type: 'Gider',
      amount: 52500,
      senderName: 'Pera Palace Hotel Banket Müdürlüğü',
      date: '23 Ekim 2026 · 16:00',
      description:
        '1842. Toplantı Otel & Kuver Faturası (35 Kuver Banka EFT Çıkışı)',
      reconciled: false,
    },
  ];
}

function createIsolatedNonGalataMembers(
  clubId: string,
  clubPrefix: string
): RotaryMember[] {
  const code = clubId.replace('club-', '').toUpperCase().slice(0, 3);
  return [
    {
      id: `m-${clubId}-baskan`,
      rotaryId: `TR-2420-${code}-01`,
      fullName: `Rtn. ${clubPrefix} Başkanı`,
      clubTitle: 'Dönem Başkanı (2026-2027)',
      classification: 'Kurumsal Yönetim & Strateji',
      industryCategory: 'Finans',
      companyName: `${clubPrefix} Danışmanlık A.Ş.`,
      position: 'Yönetim Kurulu Başkanı',
      bloodGroup: 'A Rh(+)',
      phfLevel: 'PHF +2',
      phfStars: 2,
      joinYear: 2016,
      attendancePercent: 96,
      email: `baskan@${clubId.replace('club-', '')}rotary.org`,
      phone: '+90 532 100 20 01',
      sponsorMember: 'GDB Kurucu Üye',
      birthday: '12 Mayıs',
      sponsorName: 'GDB Kurucu Üye',
      committees: ['Kulüp Yönetimi Komitesi'],
      duesBalance: 0,
      mealBalance: 0,
      foundationBalance: 0,
      rsvpStatus: 'attending',
      mealPreference: 'Standart',
    },
    {
      id: `m-${clubId}-sekreter`,
      rotaryId: `TR-2420-${code}-02`,
      fullName: `Rtn. ${clubPrefix} Sekreteri`,
      clubTitle: 'Genel Sekreter (2026-2027)',
      classification: 'Hukuk & Yönetişim',
      industryCategory: 'Deniz Hukuku',
      companyName: `${clubPrefix} Hukuk Bürosu`,
      position: 'Kurucu Ortak',
      bloodGroup: '0 Rh(+)',
      phfLevel: 'PHF +1',
      phfStars: 1,
      joinYear: 2019,
      attendancePercent: 94,
      email: `sekreter@${clubId.replace('club-', '')}rotary.org`,
      phone: '+90 532 100 20 02',
      sponsorMember: `Rtn. ${clubPrefix} Başkanı`,
      birthday: '19 Eylül',
      sponsorName: `Rtn. ${clubPrefix} Başkanı`,
      committees: ['Üyelik Komitesi'],
      duesBalance: 0,
      mealBalance: 0,
      foundationBalance: 0,
      rsvpStatus: 'pending',
      mealPreference: 'Balık',
    },
  ];
}

export function createTenantClubState(
  clubId: string,
  _clubName: string,
  district = '2420. Bölge'
): TenantClubDatabaseState {
  const isGalata = clubId === 'club-galata';
  const clubPrefix =
    clubId === 'club-karakoy'
      ? 'Karaköy Rotary Kulübü'
      : clubId === 'club-macka'
      ? 'Maçka Rotary Kulübü'
      : clubId === 'club-district2420'
      ? 'UR 2420. Bölge Guvernörlüğü'
      : 'Galata Rotary Kulübü';

  const baseMeetings = INITIAL_MEETINGS_LIST.map((m) =>
    isGalata
      ? { ...m }
      : {
          ...m,
          venue: `${clubPrefix} Toplantı Salonu`,
          topic: `${clubPrefix} — ${m.topic}`,
        }
  );

  const baseProjects = INITIAL_GALATA_PROJECTS.map((p) =>
    isGalata
      ? { ...p }
      : {
          ...p,
          id: `${clubId}-${p.id}`,
          title: `${clubPrefix} · ${p.title}`,
          collectedAmount: Math.round(p.collectedAmount * 0.6),
          volunteers: [`Rtn. ${clubPrefix} Başkanı`],
        }
  );

  return {
    clubId,
    clubName: clubPrefix,
    district,
    revision: 1,
    updatedAt: new Date().toISOString(),
    termInfo: isGalata
      ? {
          ...INITIAL_TERM_BOARD,
          clubName: clubPrefix,
          district,
        }
      : {
          ...INITIAL_TERM_BOARD,
          clubName: clubPrefix,
          district,
          president: `Rtn. ${clubPrefix} Başkanı`,
          secretary: `Rtn. ${clubPrefix} Sekreteri`,
          treasurer: `Rtn. ${clubPrefix} Saymanı`,
        },
    meetings: baseMeetings,
    selectedMeetingNo: 1842,
    rsvpStatus: 'attending',
    menuPreference: 'Standart',
    guestNameInput: isGalata ? 'Mim. Caner Erkin — Kentsel Tasarım' : '',
    ritualSteps: INITIAL_RITUAL_STEPS.map((s) => ({ ...s })),
    celebrations: isGalata ? INITIAL_CELEBRATIONS.map((c) => ({ ...c })) : [],
    speakerProposals: isGalata
      ? INITIAL_SPEAKER_PROPOSALS.map((sp) => ({ ...sp }))
      : [],
    qrCheckedIn: false,
    meetingAttendances: {},
    makeupSubmissions: isGalata
      ? INITIAL_MAKEUP_SUBMISSIONS.map((m) => {
          const resolvedId =
            m.memberId ||
            resolveUnambiguousLegacyMemberId(
              m.memberName,
              GALATA_ROTARY_MEMBERS
            );
          return {
            ...m,
            ...(resolvedId ? { memberId: resolvedId } : {}),
            auditTrail:
              Array.isArray(m.auditTrail) && m.auditTrail.length > 0
                ? m.auditTrail.map((entry): MakeupAuditHistoryEntry => ({
                    timestamp: String(entry.timestamp || m.date),
                    actorId: String(entry.actorId || resolvedId || 'm-2'),
                    actorName: String(entry.actorName || m.memberName),
                    actorRole: entry.actorRole || 'uye',
                    ...(entry.fromStatus ? { fromStatus: entry.fromStatus } : {}),
                    toStatus: entry.toStatus || m.status,
                    ...(entry.note ? { note: entry.note } : {}),
                  }))
                : [
                    {
                      timestamp: m.date,
                      actorId:
                        m.status === 'Onaylandı'
                          ? 'm-2'
                          : resolvedId || 'm-rifat',
                      actorName:
                        m.status === 'Onaylandı'
                          ? 'Rtn. Av. Nazlı Denizmen'
                          : m.memberName,
                      actorRole:
                        m.status === 'Onaylandı' ? 'sekreter' : 'uye',
                      toStatus: m.status,
                      note:
                        m.status === 'Onaylandı'
                          ? 'Sekreterlik tarafından dönem başında onaylandı'
                          : 'Üye tarafından incelemeye gönderildi',
                    },
                  ],
          };
        })
      : [],
    guestMakeupCards: isGalata
      ? INITIAL_GUEST_MAKEUP_CARDS.map((g) => ({
          ...g,
          status: g.status || 'Aktif',
          issuedByMemberId: g.issuedByMemberId || 'm-2',
          issuedByName: g.issuedByName || 'Rtn. Av. Nazlı Denizmen',
          issuedByRole: g.issuedByRole || 'sekreter',
          approvedByMemberId: g.approvedByMemberId || 'm-2',
          approvedByName: g.approvedByName || 'Rtn. Av. Nazlı Denizmen',
          approvedByRole: g.approvedByRole || 'sekreter',
          approvedAt: g.approvedAt || g.sentAt,
          attendanceEvidence:
            g.attendanceEvidence || 'Kulüp Protokol Kayıt Defteri Onaylı',
          approvalHistory:
            Array.isArray(g.approvalHistory) && g.approvalHistory.length > 0
              ? g.approvalHistory
              : [
                  {
                    timestamp: g.sentAt,
                    action: 'ONAYLANDI',
                    actorId: 'm-2',
                    actorName: 'Rtn. Av. Nazlı Denizmen',
                    actorRole: 'sekreter',
                    note: 'Kulüp Protokol Kayıt Defteri Onaylı',
                  },
                ],
        }))
      : [],
    firesideGroups: isGalata
      ? INITIAL_FIRESIDE_GROUPS.map((f) => ({ ...f }))
      : [],
    financialItems: INITIAL_FINANCIAL_ITEMS.map((fi) => ({ ...fi })),
    paymentNotifications: isGalata
      ? INITIAL_PAYMENT_NOTIFICATIONS.map((p) => ({
          ...p,
          receiptRef: normalizeBankRef(p.receiptRef),
        }))
      : [],
    overdueMembers: isGalata
      ? INITIAL_OVERDUE_MEMBERS.map((o) => ({ ...o }))
      : [],
    treasuryLedger: isGalata
      ? INITIAL_TREASURY_LEDGER.map((t) => ({ ...t }))
      : [
          {
            id: `tr-${clubId}-1`,
            date: '20 Ekim 2026',
            type: 'Gelir',
            category: 'Aidat & Kuver Tahsilatı',
            title: `${clubPrefix} Dönem Açılış Aidat Tahsilatı`,
            amount: 85000,
            referenceNo: `${clubId.toUpperCase()}-2026-001`,
            counterparty: `${clubPrefix} Üyeleri`,
          },
        ],
    projects: baseProjects,
    scholars: isGalata ? INITIAL_SCHOLARS.map((s) => ({ ...s })) : [],
    members: (isGalata
      ? GALATA_ROTARY_MEMBERS.map((m) => ({ ...m }))
      : createIsolatedNonGalataMembers(clubId, clubPrefix)
    ).map((m) => ({
      ...m,
      meetingRsvps: {
        '1842': m.rsvpStatus,
        ...(m.meetingRsvps || {}),
      },
    })),
    committees: isGalata ? INITIAL_CLUB_COMMITTEES.map((c) => ({ ...c })) : [],
    pastPresidents: isGalata
      ? INITIAL_PAST_PRESIDENTS.map((pp) => ({ ...pp }))
      : [],
    boardResolutions: isGalata
      ? INITIAL_BOARD_RESOLUTIONS.map((br) => ({ ...br }))
      : [],
    volunteerShifts: isGalata
      ? SYNTHETIC_VOLUNTEER_SHIFTS.map((s) => ({
          ...s,
          assignedVolunteers: [...s.assignedVolunteers],
        }))
      : [],
    specializedModules: {
      kermes: { ...SYNTHETIC_SPECIALIZED_MODULES.kermes },
      galatart: { ...SYNTHETIC_SPECIALIZED_MODULES.galatart },
      ryla: { ...SYNTHETIC_SPECIALIZED_MODULES.ryla },
    },
    lcvReminderQueue: [],
    outboundMessagingEnabled: false,
    kvkkMaskPhone: false,
    bankStatements: createInitialBankStatementsForClub(clubId),
    auditLedger: createInitialAuditChainForClub(clubId, clubPrefix),
  };
}

export function createDefaultMultiTenantDb(): MultiTenantDatabaseFile {
  const accounts = createInitialPilotAccounts();
  const baskanAcc = accounts.find((a) => a.memberId === 'm-emre');
  return {
    schemaVersion: '5.3.0-hardened',
    updatedAt: new Date().toISOString(),
    bootstrapClaimed: Boolean(baskanAcc?.activated),
    tenants: {
      'club-galata': createTenantClubState('club-galata', 'Galata Rotary Kulübü'),
      'club-karakoy': createTenantClubState(
        'club-karakoy',
        'Karaköy Rotary Kulübü'
      ),
      'club-macka': createTenantClubState('club-macka', 'Maçka Rotary Kulübü'),
      'club-district2420': createTenantClubState(
        'club-district2420',
        'UR 2420. Bölge Guvernörlüğü'
      ),
    },
    accounts,
    revokedTokenJtis: [],
  };
}

/**
 * Lossless Database Migration Engine (#14, #19):
 * Upgrades any legacy v4 / v5.0 / v5.1 / v5.2 database object to '5.3.0-hardened'
 * while preserving 100% of existing tenant records, payments, treasury ledgers,
 * audit hash chains, rotated PINs, and registered WebAuthn credentials.
 */
export function migrateDatabaseLossless(
  rawParsed: Record<string, unknown>
): MultiTenantDatabaseFile {
  const defaults = createDefaultMultiTenantDb();
  const rawTenants =
    rawParsed.tenants && typeof rawParsed.tenants === 'object'
      ? (rawParsed.tenants as Record<string, Partial<TenantClubDatabaseState>>)
      : {};

  // Legacy v5.0 top-level auditLedger support
  const legacyTopLevelAudit = Array.isArray(rawParsed.auditLedger)
    ? (rawParsed.auditLedger as ChainedAuditLogEntry[])
    : [];

  const migratedTenants: Record<string, TenantClubDatabaseState> = {};

  for (const clubId of ALLOWED_TENANT_CLUB_IDS) {
    const defaultTenant = defaults.tenants[clubId];
    const existingTenant = rawTenants[clubId];
    if (!existingTenant) {
      migratedTenants[clubId] = defaultTenant;
      continue;
    }

    const existingAudit =
      Array.isArray(existingTenant.auditLedger) &&
      existingTenant.auditLedger.length > 0
        ? existingTenant.auditLedger
        : legacyTopLevelAudit.filter((a) => !a.clubId || a.clubId === clubId);

    migratedTenants[clubId] = {
      ...defaultTenant,
      ...existingTenant,
      clubId,
      revision:
        typeof existingTenant.revision === 'number' &&
        existingTenant.revision >= 1
          ? existingTenant.revision
          : 1,
      updatedAt: existingTenant.updatedAt || new Date().toISOString(),
      termInfo: existingTenant.termInfo || defaultTenant.termInfo,
      meetings: Array.isArray(existingTenant.meetings)
        ? existingTenant.meetings
        : defaultTenant.meetings,
      ritualSteps: Array.isArray(existingTenant.ritualSteps)
        ? existingTenant.ritualSteps
        : defaultTenant.ritualSteps,
      celebrations: Array.isArray(existingTenant.celebrations)
        ? existingTenant.celebrations
        : defaultTenant.celebrations,
      speakerProposals: Array.isArray(existingTenant.speakerProposals)
        ? existingTenant.speakerProposals
        : defaultTenant.speakerProposals,
      meetingAttendances:
        existingTenant.meetingAttendances &&
        typeof existingTenant.meetingAttendances === 'object'
          ? existingTenant.meetingAttendances
          : {},
      makeupSubmissions: Array.isArray(existingTenant.makeupSubmissions)
        ? existingTenant.makeupSubmissions.map((mk) => {
            const roster = Array.isArray(existingTenant.members)
              ? existingTenant.members
              : defaultTenant.members;
            const resolvedId =
              mk.memberId ||
              resolveUnambiguousLegacyMemberId(mk.memberName, roster);
            const normalizedTrail: MakeupAuditHistoryEntry[] =
              Array.isArray(mk.auditTrail) && mk.auditTrail.length > 0
                ? mk.auditTrail.map((rawEntry) => {
                    const legacyRec = rawEntry as unknown as Record<
                      string,
                      unknown
                    >;
                    return {
                      timestamp: String(
                        rawEntry.timestamp ||
                          legacyRec.at ||
                          mk.date ||
                          '23 Ekim 2026'
                      ),
                      actorId: String(
                        rawEntry.actorId ||
                          legacyRec.actorMemberId ||
                          resolvedId ||
                          'm-2'
                      ),
                      actorName: String(
                        rawEntry.actorName || mk.memberName || 'Kulüp Üyesi'
                      ),
                      actorRole: (rawEntry.actorRole as ClubRole) || 'uye',
                      ...(rawEntry.fromStatus
                        ? { fromStatus: rawEntry.fromStatus }
                        : {}),
                      toStatus: rawEntry.toStatus || mk.status,
                      ...(rawEntry.note
                        ? { note: String(rawEntry.note) }
                        : {}),
                    };
                  })
                : [
                    {
                      timestamp: mk.date || '23 Ekim 2026',
                      actorId:
                        mk.status === 'Onaylandı'
                          ? 'm-2'
                          : resolvedId || 'm-rifat',
                      actorName:
                        mk.status === 'Onaylandı'
                          ? 'Rtn. Av. Nazlı Denizmen'
                          : mk.memberName,
                      actorRole:
                        mk.status === 'Onaylandı' ? 'sekreter' : 'uye',
                      toStatus: mk.status,
                      note: 'Kayıt geçmişi doğrulandı',
                    },
                  ];
            return {
              ...mk,
              ...(resolvedId ? { memberId: resolvedId } : {}),
              auditTrail: normalizedTrail,
            };
          })
        : defaultTenant.makeupSubmissions,
      guestMakeupCards: Array.isArray(existingTenant.guestMakeupCards)
        ? existingTenant.guestMakeupCards
        : defaultTenant.guestMakeupCards,
      firesideGroups: Array.isArray(existingTenant.firesideGroups)
        ? existingTenant.firesideGroups
        : defaultTenant.firesideGroups,
      financialItems: Array.isArray(existingTenant.financialItems)
        ? existingTenant.financialItems
        : defaultTenant.financialItems,
      paymentNotifications: Array.isArray(existingTenant.paymentNotifications)
        ? existingTenant.paymentNotifications.map((p) => ({
            ...p,
            receiptRef: normalizeBankRef(p.receiptRef),
          }))
        : defaultTenant.paymentNotifications,
      overdueMembers: Array.isArray(existingTenant.overdueMembers)
        ? existingTenant.overdueMembers
        : defaultTenant.overdueMembers,
      treasuryLedger: Array.isArray(existingTenant.treasuryLedger)
        ? existingTenant.treasuryLedger
        : defaultTenant.treasuryLedger,
      projects: Array.isArray(existingTenant.projects)
        ? existingTenant.projects
        : defaultTenant.projects,
      scholars: Array.isArray(existingTenant.scholars)
        ? existingTenant.scholars
        : defaultTenant.scholars,
      members: (Array.isArray(existingTenant.members)
        ? existingTenant.members
        : defaultTenant.members
      ).map((m) => ({
        ...m,
        meetingRsvps: {
          [String(existingTenant.selectedMeetingNo || 1842)]: m.rsvpStatus,
          ...(m.meetingRsvps || {}),
        },
      })),
      committees: Array.isArray(existingTenant.committees)
        ? existingTenant.committees
        : defaultTenant.committees,
      pastPresidents: Array.isArray(existingTenant.pastPresidents)
        ? existingTenant.pastPresidents
        : defaultTenant.pastPresidents,
      boardResolutions: Array.isArray(existingTenant.boardResolutions)
        ? existingTenant.boardResolutions
        : defaultTenant.boardResolutions,
      volunteerShifts: Array.isArray(existingTenant.volunteerShifts)
        ? existingTenant.volunteerShifts
        : defaultTenant.volunteerShifts,
      specializedModules:
        existingTenant.specializedModules &&
        typeof existingTenant.specializedModules === 'object'
          ? {
              kermes: {
                ...SYNTHETIC_SPECIALIZED_MODULES.kermes,
                ...(existingTenant.specializedModules.kermes || {}),
              },
              galatart: {
                ...SYNTHETIC_SPECIALIZED_MODULES.galatart,
                ...(existingTenant.specializedModules.galatart || {}),
              },
              ryla: {
                ...SYNTHETIC_SPECIALIZED_MODULES.ryla,
                ...(existingTenant.specializedModules.ryla || {}),
              },
            }
          : defaultTenant.specializedModules,
      lcvReminderQueue: Array.isArray(existingTenant.lcvReminderQueue)
        ? existingTenant.lcvReminderQueue
        : [],
      outboundMessagingEnabled: Boolean(existingTenant.outboundMessagingEnabled),
      bankStatements: Array.isArray(existingTenant.bankStatements)
        ? existingTenant.bankStatements
        : defaultTenant.bankStatements,
      auditLedger:
        existingAudit.length > 0 ? existingAudit : defaultTenant.auditLedger,
    };
  }

  // Preserve any custom accounts & existing password hashes / WebAuthn passkeys
  const rawAccounts = Array.isArray(rawParsed.accounts)
    ? (rawParsed.accounts as Partial<PilotUserAccount>[])
    : [];
  const migratedAccounts: PilotUserAccount[] = [...defaults.accounts];

  for (const rawAcc of rawAccounts) {
    if (!rawAcc || !rawAcc.memberId) continue;
    const idx = migratedAccounts.findIndex(
      (a) => a.memberId === rawAcc.memberId
    );
    if (idx >= 0) {
      const defAcc = migratedAccounts[idx];
      migratedAccounts[idx] = {
        ...defAcc,
        ...rawAcc,
        memberId: defAcc.memberId,
        rotaryId: rawAcc.rotaryId || defAcc.rotaryId,
        fullName: rawAcc.fullName || defAcc.fullName,
        email: rawAcc.email || defAcc.email,
        role: (rawAcc.role as ClubRole) || defAcc.role,
        clubId: isAllowedTenantClubId(String(rawAcc.clubId || ''))
          ? (rawAcc.clubId as AllowedTenantClubId)
          : defAcc.clubId,
        // Enforce strict club memberships for default accounts (#70)
        clubMemberships: defAcc.clubMemberships,
        passwordSalt: rawAcc.passwordSalt || defAcc.passwordSalt,
        passwordHash: rawAcc.passwordHash || defAcc.passwordHash,
        activated:
          typeof rawAcc.activated === 'boolean'
            ? rawAcc.activated
            : Boolean(rawAcc.passwordHash) || defAcc.activated,
        webauthnCredentials: Array.isArray(rawAcc.webauthnCredentials)
          ? rawAcc.webauthnCredentials.filter(
              (c): c is WebAuthnCredentialRecord =>
                Boolean(c && c.credentialId && c.publicKeySpkiB64)
            )
          : defAcc.webauthnCredentials,
      };
    } else if (
      rawAcc.rotaryId &&
      rawAcc.fullName &&
      rawAcc.email &&
      rawAcc.role &&
      rawAcc.passwordSalt &&
      rawAcc.passwordHash
    ) {
      const safeClubId: AllowedTenantClubId = isAllowedTenantClubId(
        String(rawAcc.clubId || '')
      )
        ? (rawAcc.clubId as AllowedTenantClubId)
        : 'club-galata';
      migratedAccounts.push({
        memberId: rawAcc.memberId,
        rotaryId: rawAcc.rotaryId,
        fullName: rawAcc.fullName,
        email: rawAcc.email,
        role: rawAcc.role as ClubRole,
        clubId: safeClubId,
        clubMemberships: Array.isArray(rawAcc.clubMemberships)
          ? rawAcc.clubMemberships
          : [{ clubId: safeClubId, role: rawAcc.role as ClubRole }],
        passwordSalt: rawAcc.passwordSalt,
        passwordHash: rawAcc.passwordHash,
        activated: rawAcc.activated !== false,
        webauthnCredentials: Array.isArray(rawAcc.webauthnCredentials)
          ? rawAcc.webauthnCredentials.filter(
              (c): c is WebAuthnCredentialRecord =>
                Boolean(c && c.credentialId && c.publicKeySpkiB64)
            )
          : [],
      });
    }
  }

  const migratedBaskan = migratedAccounts.find((a) => a.memberId === 'm-emre');
  const bootstrapClaimed =
    typeof rawParsed.bootstrapClaimed === 'boolean'
      ? rawParsed.bootstrapClaimed
      : Boolean(rawAccounts.length > 0 || migratedBaskan?.activated);

  return {
    schemaVersion: '5.3.0-hardened',
    updatedAt: new Date().toISOString(),
    bootstrapClaimed,
    tenants: migratedTenants,
    accounts: migratedAccounts,
    revokedTokenJtis: Array.isArray(rawParsed.revokedTokenJtis)
      ? (rawParsed.revokedTokenJtis as string[])
      : [],
  };
}

/**
 * Redacts sensitive club-wide financial, governance, scholarship, and audit data
 * with strict field-level access controls when a regular 'uye' fetches the club state (#12, #16, #20, #76).
 */
export function redactStateForRole(
  tenantState: TenantClubDatabaseState,
  auditLedger: ChainedAuditLogEntry[],
  user: AuthenticatedUser
) {
  const isPrivilegedFinance = user.role === 'sayman' || user.role === 'baskan';
  const isPrivilegedBoard =
    user.role === 'sekreter' || user.role === 'sayman' || user.role === 'baskan';

  const shouldMaskPhones = Boolean(
    tenantState.kvkkMaskPhone || user.role === 'uye'
  );
  const shouldMaskSensitivePii = user.role === 'uye';

  const sanitizedMembers: RotaryMember[] = tenantState.members.map((m) => {
    const isSelf = m.id === user.memberId || m.rotaryId === user.rotaryId;
    return {
      ...m,
      phone: isSelf ? m.phone : maskPhoneForKvkk(m.phone, shouldMaskPhones),
      email: isSelf
        ? m.email
        : maskEmailForKvkk(m.email, shouldMaskSensitivePii),
      bloodGroup: isSelf || isPrivilegedBoard ? m.bloodGroup : 'KVKK Gizli',
      birthday: isSelf || isPrivilegedBoard ? m.birthday : 'KVKK Gizli',
      spouseName: isSelf || isPrivilegedBoard ? m.spouseName : undefined,
      weddingAnniversary:
        isSelf || isPrivilegedBoard ? m.weddingAnniversary : undefined,
      duesBalance: isPrivilegedFinance || isSelf ? m.duesBalance : 0,
      mealBalance: isPrivilegedFinance || isSelf ? m.mealBalance : 0,
      foundationBalance:
        isPrivilegedFinance || isSelf ? m.foundationBalance : 0,
    };
  });

  const sanitizedPayments = isPrivilegedFinance
    ? tenantState.paymentNotifications
    : tenantState.paymentNotifications.filter(
        (p) => p.memberId === user.memberId
      );

  const sanitizedOverdue = isPrivilegedFinance
    ? tenantState.overdueMembers
    : [];

  const sanitizedTreasuryLedger = isPrivilegedFinance
    ? tenantState.treasuryLedger
    : [];

  const sanitizedScholars: ScholarStudent[] = isPrivilegedBoard
    ? tenantState.scholars
    : tenantState.scholars.map((s) => {
        const parts = s.fullName.trim().split(/\s+/);
        const maskedName =
          parts.length > 1
            ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
            : s.fullName;
        return {
          ...s,
          fullName: maskedName,
          mentorMember: 'Burs Komitesi Mentörü (KVKK Korumalı)',
          statusNote: 'Burs Programı Aktif',
        };
      });

  const sanitizedBoardResolutions: BoardResolutionItem[] = isPrivilegedBoard
    ? tenantState.boardResolutions
    : tenantState.boardResolutions.map((br) => ({
        ...br,
        summary:
          'Yönetim Kurulu Karar Defteri tam metni yalnızca YK üyelerine açıktır.',
        signedBy: 'Yönetim Kurulu (Yetki Korumalı)',
      }));

  const sanitizedGuestMakeupCards: GuestRotaryMakeupCard[] = isPrivilegedBoard
    ? tenantState.guestMakeupCards
    : tenantState.guestMakeupCards.map((card) => ({
        ...card,
        guestEmail: maskEmailForKvkk(card.guestEmail, true),
      }));

  const chainVerification = verifyAuditChain(auditLedger, tenantState.clubId);
  const activeMeetingKey = String(tenantState.selectedMeetingNo || 1842);
  const currentMeetingAttendees = Array.isArray(
    tenantState.meetingAttendances?.[activeMeetingKey]
  )
    ? tenantState.meetingAttendances![activeMeetingKey]
    : [];
  const isUserCheckedIn = currentMeetingAttendees.includes(user.memberId);

  return {
    ...tenantState,
    qrCheckedIn: isUserCheckedIn,
    meetingAttendances: tenantState.meetingAttendances || {},
    members: sanitizedMembers,
    paymentNotifications: sanitizedPayments,
    overdueMembers: sanitizedOverdue,
    treasuryLedger: sanitizedTreasuryLedger,
    bankStatements: isPrivilegedFinance ? tenantState.bankStatements : [],
    scholars: sanitizedScholars,
    boardResolutions: sanitizedBoardResolutions,
    guestMakeupCards: sanitizedGuestMakeupCards,
    lcvReminderQueue: isPrivilegedBoard
      ? tenantState.lcvReminderQueue || []
      : (tenantState.lcvReminderQueue || []).filter(
          (q) => q.memberId === user.memberId
        ),
    outboundMessagingEnabled: Boolean(tenantState.outboundMessagingEnabled),
    auditLedger: isPrivilegedBoard ? auditLedger : [],
    auditLogs: isPrivilegedBoard ? auditLedger : [],
    auditVerification: chainVerification,
    redactedForRole: user.role,
    authenticatedUser: {
      memberId: user.memberId,
      rotaryId: user.rotaryId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      clubId: user.clubId,
    },
    kvkkPhoneProtected: shouldMaskPhones,
    canExportBackup: isPrivilegedBoard,
    canResetDatabase: user.role === 'baskan',
  };
}

/**
 * Atomic File Persistence with Write-Ahead Temp File + fsync + rename
 * Enforces mandatory Compare-And-Swap (CAS) revision locking, automatic discovery
 * of v5.2/v5.1/v5.0/v4 database files, and lossless schema migration (#14, #18, #19, #70).
 */
export class AtomicMultiTenantStore {
  private dbDir: string;
  private dbFile: string;
  private bootstrapTokenFile: string;
  private runtimeBootstrapToken: string | null = null;
  private state: MultiTenantDatabaseFile;

  constructor(customDbFile?: string) {
    this.dbDir = customDbFile
      ? path.dirname(customDbFile)
      : path.resolve(process.cwd(), '.aistudio');
    this.dbFile =
      customDbFile || path.join(this.dbDir, 'rotaclub_pilot_v5_3_db.json');
    this.bootstrapTokenFile = path.join(
      this.dbDir,
      'rotaclub_bootstrap_claim_token.json'
    );
    this.state = this.loadFromDisk();
    this.ensureBootstrapOwnershipToken();
    if (Array.isArray(this.state.revokedTokenJtis)) {
      for (const jti of this.state.revokedTokenJtis) {
        runtimeRevokedJtis.add(jti);
      }
    }
  }

  private ensureBootstrapOwnershipToken(): void {
    if (this.state.bootstrapClaimed) {
      this.runtimeBootstrapToken = null;
      try {
        if (fs.existsSync(this.bootstrapTokenFile)) {
          fs.unlinkSync(this.bootstrapTokenFile);
        }
      } catch {
        // Ignore cleanup errors
      }
      return;
    }

    const envToken = process.env.ROTACLUB_BOOTSTRAP_TOKEN?.trim();
    if (envToken && envToken.length >= 8) {
      const salt = crypto.randomBytes(16).toString('hex');
      this.state.bootstrapTokenSalt = salt;
      this.state.bootstrapTokenHash = hashPinWithSalt(envToken, salt);
      this.runtimeBootstrapToken = envToken;
      this.atomicWriteToDisk(this.state);
      return;
    }

    if (
      this.state.bootstrapTokenSalt &&
      this.state.bootstrapTokenHash &&
      fs.existsSync(this.bootstrapTokenFile)
    ) {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(this.bootstrapTokenFile, 'utf8')
        ) as { bootstrapToken?: string };
        if (
          parsed.bootstrapToken &&
          verifySecretConstantTime(
            parsed.bootstrapToken,
            this.state.bootstrapTokenSalt,
            this.state.bootstrapTokenHash
          )
        ) {
          this.runtimeBootstrapToken = parsed.bootstrapToken;
          return;
        }
      } catch {
        // Regenerate below if token file is unreadable
      }
    }

    const generatedToken = `RC2420-${crypto.randomBytes(24).toString('base64url')}`;
    const salt = crypto.randomBytes(16).toString('hex');
    this.state.bootstrapTokenSalt = salt;
    this.state.bootstrapTokenHash = hashPinWithSalt(generatedToken, salt);
    this.runtimeBootstrapToken = generatedToken;
    this.atomicWriteToDisk(this.state);

    try {
      fs.writeFileSync(
        this.bootstrapTokenFile,
        JSON.stringify(
          {
            bootstrapToken: generatedToken,
            rotaryId: 'TR-2420-74105',
            email: 'baskan@galatarotary.org',
            createdAt: new Date().toISOString(),
          },
          null,
          2
        ),
        { encoding: 'utf8', mode: 0o600 }
      );
    } catch {
      // Non-fatal if read-only dir
    }
  }

  public getBootstrapOwnershipToken(): string | null {
    if (this.state.bootstrapClaimed) return null;
    return this.runtimeBootstrapToken;
  }

  private findLegacyDatabaseFile(): string | null {
    const baseName = path.basename(this.dbFile);
    const candidates: string[] = [];

    if (baseName.includes('_v5_3')) {
      candidates.push(
        path.join(this.dbDir, baseName.replace('_v5_3', '_v5_2')),
        path.join(this.dbDir, baseName.replace('_v5_3', '_v5_1')),
        path.join(this.dbDir, baseName.replace('_v5_3', '_v5')),
        path.join(this.dbDir, baseName.replace('_v5_3', '_v4'))
      );
    }

    candidates.push(
      path.join(this.dbDir, 'rotaclub_pilot_v5_2_db.json'),
      path.join(this.dbDir, 'rotaclub_pilot_v5_1_db.json'),
      path.join(this.dbDir, 'rotaclub_pilot_v5_db.json'),
      path.join(this.dbDir, 'rotaclub_pilot_v4_db.json')
    );

    for (const candidate of candidates) {
      if (candidate !== this.dbFile && fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private loadFromDisk(): MultiTenantDatabaseFile {
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }
    if (!fs.existsSync(this.dbFile)) {
      const legacyFile = this.findLegacyDatabaseFile();
      if (legacyFile) {
        const legacyRaw = fs.readFileSync(legacyFile, 'utf-8');
        let legacyParsed: Record<string, unknown>;
        try {
          legacyParsed = JSON.parse(legacyRaw) as Record<string, unknown>;
        } catch (err) {
          const corruptBak = `${legacyFile}.corrupt.${Date.now()}.bak`;
          fs.copyFileSync(legacyFile, corruptBak);
          throw new Error(
            `CORRUPT_DATABASE_FILE: Eski sürüm veritabanı dosyası (${legacyFile}) bozulmuş, yedeklendi (${corruptBak}): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
        const oldVer = String(legacyParsed.schemaVersion || 'v5_2').replace(
          /[^a-zA-Z0-9._-]/g,
          '_'
        );
        fs.copyFileSync(
          legacyFile,
          `${legacyFile}.pre-migration-${oldVer}.bak`
        );
        fs.copyFileSync(
          legacyFile,
          `${this.dbFile}.pre-migration-${oldVer}.bak`
        );
        const migrated = migrateDatabaseLossless(legacyParsed);
        this.atomicWriteToDisk(migrated);
        return migrated;
      }

      const initial = createDefaultMultiTenantDb();
      this.atomicWriteToDisk(initial);
      return initial;
    }

    const raw = fs.readFileSync(this.dbFile, 'utf-8');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      // Never silently wipe a corrupt database file (#14, #19): quarantine to .corrupt.bak and throw
      const corruptBak = `${this.dbFile}.corrupt.${Date.now()}.bak`;
      fs.copyFileSync(this.dbFile, corruptBak);
      throw new Error(
        `CORRUPT_DATABASE_FILE: Veritabanı dosyası bozulmuş, veri kaybını önlemek için yedeklendi (${corruptBak}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('CORRUPT_DATABASE_FILE: Geçersiz veritabanı kök nesnesi.');
    }

    if (parsed.schemaVersion !== '5.3.0-hardened') {
      // Create a lossless pre-migration backup snapshot before upgrading (#19)
      const oldVer = String(parsed.schemaVersion || 'legacy').replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );
      const bakFile = `${this.dbFile}.pre-migration-${oldVer}.bak`;
      fs.copyFileSync(this.dbFile, bakFile);

      const migrated = migrateDatabaseLossless(parsed);
      this.atomicWriteToDisk(migrated);
      return migrated;
    }

    return parsed as unknown as MultiTenantDatabaseFile;
  }

  private atomicWriteToDisk(nextState: MultiTenantDatabaseFile): void {
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }
    const tmpFile = `${this.dbFile}.tmp.${process.pid}.${Date.now()}.${crypto
      .randomBytes(4)
      .toString('hex')}`;
    const serialized = JSON.stringify(nextState, null, 2);
    const fd = fs.openSync(tmpFile, 'w', 0o600);
    try {
      fs.writeFileSync(fd, serialized, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpFile, this.dbFile);
  }

  public getAccounts(): PilotUserAccount[] {
    return this.state.accounts;
  }

  public getBootstrapStatus() {
    return {
      bootstrapClaimRequired: !this.state.bootstrapClaimed,
      ownershipVerificationRequired: true,
    };
  }

  /**
   * One-Time Initial Admin Activation Flow with Trustworthy Ownership Verification & Club Isolation (#22, #70, #76):
   * Strictly requires the CSPRNG one-time bootstrap ownership token (verified in constant time
   * against the Scrypt hash stored in the database) before activating the initial Galata Rotary President account.
   * Strictly forbids activating accounts belonging to any other club (Karaköy, Maçka, District 2420).
   */
  public claimInitialAdminBootstrap(params: {
    bootstrapToken?: string;
    clubId?: string;
    rotaryId?: string;
    email?: string;
    newAdminPin: string;
    rolePins?: Record<string, string | undefined>;
  }):
    | { ok: true; account: PilotUserAccount }
    | { ok: false; status: number; error: string; message: string } {
    if (this.state.bootstrapClaimed) {
      return {
        ok: false,
        status: 409,
        error: 'BOOTSTRAP_ALREADY_CLAIMED',
        message:
          'İlk yönetici aktivasyonu daha önce tamamlanmış; bu tek kullanımlık kurulum akışı kalıcı olarak kapatılmıştır.',
      };
    }

    const providedToken = String(params.bootstrapToken || '').trim();
    if (!providedToken) {
      return {
        ok: false,
        status: 401,
        error: 'BOOTSTRAP_OWNERSHIP_TOKEN_REQUIRED',
        message:
          'İlk yönetici aktivasyonu için tek kullanımlık sunucu sahiplik doğrulama anahtarı (bootstrapToken) zorunludur (#22, #76).',
      };
    }

    if (
      !this.state.bootstrapTokenSalt ||
      !this.state.bootstrapTokenHash ||
      !verifySecretConstantTime(
        providedToken,
        this.state.bootstrapTokenSalt,
        this.state.bootstrapTokenHash
      )
    ) {
      return {
        ok: false,
        status: 403,
        error: 'INVALID_BOOTSTRAP_OWNERSHIP_TOKEN',
        message:
          'Sunucu sahiplik doğrulama anahtarı (bootstrapToken) geçersiz; yetkisiz ilk yönetici aktivasyon girişimi reddedildi (#22, #76).',
      };
    }

    // Issue #70 Fix: Prevent initial bootstrap from targeting or activating any club other than club-galata!
    if (params.clubId && String(params.clubId).trim() !== 'club-galata') {
      return {
        ok: false,
        status: 403,
        error: 'CROSS_TENANT_BOOTSTRAP_FORBIDDEN',
        message:
          'İlk kurulum yalnızca Galata Rotary Kulübü (club-galata) için yetkilendirilmiştir; başka kulüplerin hesapları ilk kurulumda etkinleştirilemez (#70).',
      };
    }

    if (params.rotaryId) {
      const requestedAcc = findPilotAccount(
        String(params.rotaryId).trim(),
        this.state.accounts
      );
      if (requestedAcc && requestedAcc.clubId !== 'club-galata') {
        return {
          ok: false,
          status: 403,
          error: 'CROSS_TENANT_BOOTSTRAP_FORBIDDEN',
          message:
            'İlk kurulumda başka bir kulübün yönetici veya üye hesabı etkinleştirilemez (#70).',
        };
      }
    }

    if (params.email) {
      const requestedAcc = findPilotAccount(
        String(params.email).trim(),
        this.state.accounts
      );
      if (requestedAcc && requestedAcc.clubId !== 'club-galata') {
        return {
          ok: false,
          status: 403,
          error: 'CROSS_TENANT_BOOTSTRAP_FORBIDDEN',
          message:
            'İlk kurulumda başka bir kulübün yönetici veya üye hesabı etkinleştirilemez (#70).',
        };
      }
    }

    // Strictly restrict optional officer PIN provisioning to club-galata roles ONLY (#70)
    const galataRolePinMap: Record<string, string> = {
      uye: 'm-rifat',
      sekreter: 'm-nazli',
      sayman: 'm-levent',
    };

    if (params.rolePins && typeof params.rolePins === 'object') {
      for (const [roleKey, pinVal] of Object.entries(params.rolePins)) {
        if (!Object.prototype.hasOwnProperty.call(galataRolePinMap, roleKey)) {
          return {
            ok: false,
            status: 403,
            error: 'CROSS_TENANT_BOOTSTRAP_FORBIDDEN',
            message: `İlk kurulumda başka kulüplerin (${roleKey}) hesapları etkinleştirilemez (#70).`,
          };
        }
        if (pinVal && String(pinVal).trim()) {
          const check = validateStrongCredential(String(pinVal));
          if (!check.valid) {
            return {
              ok: false,
              status: 400,
              error: 'WEAK_PIN_REJECTED',
              message: check.reason!,
            };
          }
        }
      }
    }

    const baskanAcc = this.state.accounts.find(
      (a) => a.memberId === 'm-emre' && a.clubId === 'club-galata'
    );
    if (!baskanAcc) {
      return {
        ok: false,
        status: 404,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'Başlangıç yönetici hesabı bulunamadı.',
      };
    }

    if (
      params.rotaryId &&
      String(params.rotaryId).trim().toUpperCase() !==
        baskanAcc.rotaryId.toUpperCase()
    ) {
      return {
        ok: false,
        status: 403,
        error: 'BOOTSTRAP_IDENTITY_MISMATCH',
        message: 'Kurucu Başkan Rotary Sicil No doğrulaması başarısız oldu.',
      };
    }

    if (
      params.email &&
      String(params.email).trim().toLowerCase() !==
        baskanAcc.email.toLowerCase()
    ) {
      return {
        ok: false,
        status: 403,
        error: 'BOOTSTRAP_IDENTITY_MISMATCH',
        message: 'Kurucu Başkan kurumsal e-posta doğrulaması başarısız oldu.',
      };
    }

    const strength = validateStrongCredential(params.newAdminPin);
    if (!strength.valid) {
      return {
        ok: false,
        status: 400,
        error: 'WEAK_PIN_REJECTED',
        message: strength.reason!,
      };
    }

    const adminSalt = crypto.randomBytes(16).toString('hex');
    baskanAcc.passwordSalt = adminSalt;
    baskanAcc.passwordHash = hashPinWithSalt(
      params.newAdminPin.trim(),
      adminSalt
    );
    baskanAcc.activated = true;

    if (params.rolePins && typeof params.rolePins === 'object') {
      for (const [roleKey, pinVal] of Object.entries(params.rolePins)) {
        const targetMemberId = galataRolePinMap[roleKey];
        if (!targetMemberId || !pinVal || !String(pinVal).trim()) continue;
        const acc = this.state.accounts.find(
          (a) => a.memberId === targetMemberId && a.clubId === 'club-galata'
        );
        if (acc) {
          const s = crypto.randomBytes(16).toString('hex');
          acc.passwordSalt = s;
          acc.passwordHash = hashPinWithSalt(String(pinVal).trim(), s);
          acc.activated = true;
        }
      }
    }

    this.state.bootstrapClaimed = true;
    this.state.bootstrapTokenSalt = '';
    this.state.bootstrapTokenHash = '';
    this.runtimeBootstrapToken = null;
    this.state.updatedAt = new Date().toISOString();
    this.atomicWriteToDisk(this.state);

    try {
      if (fs.existsSync(this.bootstrapTokenFile)) {
        fs.unlinkSync(this.bootstrapTokenFile);
      }
    } catch {
      // Ignore file removal error
    }

    return { ok: true, account: baskanAcc };
  }

  public adminSetAccountPin(
    targetIdentifier: string,
    newPin: string,
    actorClubId: AllowedTenantClubId = 'club-galata'
  ):
    | { ok: true; account: PilotUserAccount }
    | { ok: false; status?: number; error: string; message: string } {
    const strength = validateStrongCredential(newPin);
    if (!strength.valid) {
      return {
        ok: false,
        status: 400,
        error: 'WEAK_PIN_REJECTED',
        message: strength.reason!,
      };
    }
    const account = findPilotAccount(targetIdentifier, this.state.accounts);
    if (!account) {
      return {
        ok: false,
        status: 404,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'Hedef üye hesabı bulunamadı.',
      };
    }
    if (
      account.clubId !== actorClubId ||
      !getAccountClubMembership(account, actorClubId)
    ) {
      return {
        ok: false,
        status: 403,
        error: 'CLUB_MEMBERSHIP_FORBIDDEN',
        message:
          'Yalnızca kendi kulübünüzdeki üye ve görevlilerin parolasını tanımlayabilirsiniz (#70).',
      };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    account.passwordSalt = salt;
    account.passwordHash = hashPinWithSalt(newPin.trim(), salt);
    account.activated = true;
    this.state.updatedAt = new Date().toISOString();
    this.atomicWriteToDisk(this.state);
    return { ok: true, account };
  }

  public provisionNewMemberAccount(params: {
    memberId: string;
    rotaryId: string;
    fullName: string;
    email: string;
    role: ClubRole;
    clubId: AllowedTenantClubId;
    initialPinOrPassword: string;
  }):
    | { ok: true; account: PilotUserAccount }
    | { ok: false; error: string; message: string } {
    const strength = validateStrongCredential(params.initialPinOrPassword);
    if (!strength.valid) {
      return {
        ok: false,
        error: 'WEAK_PIN_REJECTED',
        message: strength.reason!,
      };
    }

    const duplicate = this.state.accounts.some(
      (a) =>
        a.memberId.toLowerCase() === params.memberId.toLowerCase() ||
        a.rotaryId.toLowerCase() === params.rotaryId.toLowerCase() ||
        a.email.toLowerCase() === params.email.toLowerCase()
    );
    if (duplicate) {
      return {
        ok: false,
        error: 'ACCOUNT_ALREADY_EXISTS',
        message: 'Bu Rotary ID, üye kimliği veya e-posta adresiyle kayıtlı bir hesap zaten mevcut.',
      };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newAccount: PilotUserAccount = {
      memberId: params.memberId,
      rotaryId: params.rotaryId,
      fullName: params.fullName,
      email: params.email,
      role: params.role,
      clubId: params.clubId,
      clubMemberships: [{ clubId: params.clubId, role: params.role }],
      passwordSalt: salt,
      passwordHash: hashPinWithSalt(params.initialPinOrPassword.trim(), salt),
      activated: true,
      webauthnCredentials: [],
    };

    this.state.accounts.push(newAccount);
    this.state.updatedAt = new Date().toISOString();
    this.atomicWriteToDisk(this.state);
    return { ok: true, account: newAccount };
  }

  public changeAccountPin(
    memberId: string,
    currentPin: string,
    newPin: string
  ):
    | { ok: true }
    | { ok: false; reason: 'INVALID_CURRENT_PIN' | 'WEAK_PIN_REJECTED'; message: string } {
    const strength = validateStrongCredential(newPin);
    if (!strength.valid) {
      return {
        ok: false,
        reason: 'WEAK_PIN_REJECTED',
        message: strength.reason!,
      };
    }

    const account = this.state.accounts.find((a) => a.memberId === memberId);
    if (!account) {
      return {
        ok: false,
        reason: 'INVALID_CURRENT_PIN',
        message: 'Hesap bulunamadı.',
      };
    }
    const currentHash = hashPinWithSalt(currentPin.trim(), account.passwordSalt);
    const bufA = Buffer.from(currentHash, 'hex');
    const bufB = Buffer.from(account.passwordHash, 'hex');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return {
        ok: false,
        reason: 'INVALID_CURRENT_PIN',
        message: 'Mevcut PIN kodu doğrulanamadı.',
      };
    }
    const newSalt = crypto.randomBytes(16).toString('hex');
    account.passwordSalt = newSalt;
    account.passwordHash = hashPinWithSalt(newPin.trim(), newSalt);
    this.state.updatedAt = new Date().toISOString();
    this.atomicWriteToDisk(this.state);
    return { ok: true };
  }

  public registerWebAuthnCredential(
    memberId: string,
    cred: WebAuthnCredentialRecord
  ): PilotUserAccount | null {
    const account = this.state.accounts.find((a) => a.memberId === memberId);
    if (!account) return null;
    const existingIdx = account.webauthnCredentials.findIndex(
      (c) => c.credentialId === cred.credentialId
    );
    if (existingIdx >= 0) {
      account.webauthnCredentials[existingIdx] = cred;
    } else {
      account.webauthnCredentials.push(cred);
    }
    this.state.updatedAt = new Date().toISOString();
    this.atomicWriteToDisk(this.state);
    return account;
  }

  public updateWebAuthnSignCount(
    memberId: string,
    credentialId: string,
    newSignCount: number
  ): void {
    const account = this.state.accounts.find((a) => a.memberId === memberId);
    if (!account) return;
    const cred = account.webauthnCredentials.find(
      (c) => c.credentialId === credentialId
    );
    if (cred) {
      cred.signCount = newSignCount;
      this.state.updatedAt = new Date().toISOString();
      this.atomicWriteToDisk(this.state);
    }
  }

  public revokeToken(jti: string): void {
    if (!jti) return;
    runtimeRevokedJtis.add(jti);
    if (!this.state.revokedTokenJtis.includes(jti)) {
      this.state.revokedTokenJtis.push(jti);
      this.atomicWriteToDisk(this.state);
    }
  }

  public getTenantState(clubId: string): TenantClubDatabaseState {
    if (!isAllowedTenantClubId(clubId)) {
      throw new Error(`UNKNOWN_CLUB_TENANT: ${clubId}`);
    }
    if (!this.state.tenants[clubId]) {
      this.state.tenants[clubId] = createTenantClubState(clubId, clubId);
      this.atomicWriteToDisk(this.state);
    }
    return this.state.tenants[clubId];
  }

  public getAuditLedger(clubId = 'club-galata'): ChainedAuditLogEntry[] {
    const tenant = this.getTenantState(clubId);
    return tenant.auditLedger;
  }

  public getTenantBackupSnapshot(clubId: string) {
    const tenant = this.getTenantState(clubId);
    const chainVerification = verifyAuditChain(tenant.auditLedger, clubId);
    const payload = {
      schemaVersion: this.state.schemaVersion,
      exportedAt: new Date().toISOString(),
      clubId: tenant.clubId,
      clubName: tenant.clubName,
      district: tenant.district,
      tenantState: tenant,
      auditLedger: tenant.auditLedger,
      auditChainVerification: chainVerification,
    };
    const backupChecksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload.tenantState), 'utf8')
      .digest('hex');
    return {
      ...payload,
      backupChecksum,
    };
  }

  public restoreTenantFromVerifiedBackup(params: {
    clubId: string;
    backupPayload: {
      clubId?: string;
      tenantState?: TenantClubDatabaseState;
      auditLedger?: ChainedAuditLogEntry[];
      backupChecksum?: string;
    };
    actor: AuthenticatedUser;
    timestamp: string;
  }):
    | { ok: true; state: TenantClubDatabaseState }
    | { ok: false; error: string; message: string } {
    const { clubId, backupPayload, actor, timestamp } = params;
    if (
      !backupPayload ||
      backupPayload.clubId !== clubId ||
      !backupPayload.tenantState ||
      !backupPayload.backupChecksum
    ) {
      return {
        ok: false,
        error: 'INVALID_BACKUP_PAYLOAD',
        message: 'Yedek dosyası kulüp kimliği veya veri yapısı geçersiz.',
      };
    }

    const computedChecksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(backupPayload.tenantState), 'utf8')
      .digest('hex');
    if (computedChecksum !== backupPayload.backupChecksum) {
      return {
        ok: false,
        error: 'BACKUP_CHECKSUM_MISMATCH',
        message: 'Yedek dosyasının SHA-256 bütünlük özeti (backupChecksum) doğrulanamadı.',
      };
    }

    const incomingAudit =
      backupPayload.auditLedger || backupPayload.tenantState.auditLedger || [];
    const chainCheck = verifyAuditChain(incomingAudit, clubId);
    if (!chainCheck.valid) {
      return {
        ok: false,
        error: 'CORRUPT_BACKUP_AUDIT_CHAIN',
        message: 'Yedek dosyasındaki SHA-256 denetim zinciri bozulmuş; geri yükleme reddedildi.',
      };
    }

    const current = this.getTenantState(clubId);
    // Preserve whichever audit chain is longer/current so audit history can never be truncated
    const preservedAudit =
      current.auditLedger.length >= incomingAudit.length
        ? current.auditLedger
        : incomingAudit;

    const restored: TenantClubDatabaseState = {
      ...backupPayload.tenantState,
      clubId,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      auditLedger: preservedAudit,
    };
    this.state.tenants[clubId] = restored;
    this.appendAuditEntry({
      clubId,
      actorName: `${actor.fullName} (${actor.rotaryId})`,
      actorRole: actor.role,
      module: 'Yönetim & Güvenlik',
      action: `Kulüp Yedeğinden Veri Geri Yükleme Tamamlandı (Rev #${restored.revision})`,
      detail: `SHA-256 checksum (${computedChecksum.slice(
        0,
        12
      )}...) doğrulanarak operasyonel durum geri yüklendi.`,
      timestamp,
    });
    return { ok: true, state: this.state.tenants[clubId] };
  }

  public appendAuditEntry(params: {
    clubId: string;
    actorName: string;
    actorRole: ClubRole;
    module: AuditLogEntry['module'];
    action: string;
    detail: string;
    timestamp: string;
  }): ChainedAuditLogEntry {
    const tenant = this.getTenantState(params.clubId);
    const ledger = tenant.auditLedger || [];
    const latestEntry =
      ledger.length > 0
        ? [...ledger].sort((a, b) => b.sequenceNo - a.sequenceNo)[0]
        : null;
    const prevHash = latestEntry
      ? latestEntry.entryHash
      : getGenesisHashForClub(params.clubId);
    const nextSeq = latestEntry ? latestEntry.sequenceNo + 1 : 1;

    const partial: Omit<ChainedAuditLogEntry, 'entryHash'> = {
      id: `aud-${params.clubId}-${1000 + nextSeq}`,
      sequenceNo: nextSeq,
      timestamp: params.timestamp,
      clubId: params.clubId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      module: params.module,
      action: params.action,
      detail: params.detail,
      verifiedByServer: true,
      prevHash,
    };
    const entryHash = computeAuditHash(partial);
    const fullEntry: ChainedAuditLogEntry = { ...partial, entryHash };

    tenant.auditLedger = [fullEntry, ...ledger];
    tenant.updatedAt = new Date().toISOString();
    this.state.updatedAt = tenant.updatedAt;
    this.atomicWriteToDisk(this.state);
    return fullEntry;
  }

  /**
   * Mandatory Compare-And-Swap (CAS) Tenant Update (#14)
   * Requires an explicit integer expectedRevision matching current.revision before mutating state.
   */
  public updateTenant(
    clubId: string,
    updater: (current: TenantClubDatabaseState) => TenantClubDatabaseState,
    expectedRevision: number
  ):
    | { ok: true; state: TenantClubDatabaseState }
    | {
        ok: false;
        reason: 'REVISION_REQUIRED' | 'REVISION_CONFLICT';
        currentRevision: number;
      } {
    const current = this.getTenantState(clubId);
    if (
      typeof expectedRevision !== 'number' ||
      !Number.isInteger(expectedRevision)
    ) {
      return {
        ok: false,
        reason: 'REVISION_REQUIRED',
        currentRevision: current.revision,
      };
    }
    if (expectedRevision !== current.revision) {
      return {
        ok: false,
        reason: 'REVISION_CONFLICT',
        currentRevision: current.revision,
      };
    }
    const preservedAuditLedger = current.auditLedger;
    const updated = updater(current);
    updated.auditLedger = preservedAuditLedger;
    updated.revision = (current.revision || 1) + 1;
    updated.updatedAt = new Date().toISOString();
    this.state.tenants[clubId] = updated;
    this.state.updatedAt = updated.updatedAt;
    this.atomicWriteToDisk(this.state);
    return { ok: true, state: updated };
  }

  /**
   * Resets a specific tenant's operational demo data while strictly preserving
   * that tenant's immutable audit ledger (#18, #70).
   */
  public resetTenantOperationalData(
    clubId: string,
    actor: AuthenticatedUser,
    timestamp: string
  ): TenantClubDatabaseState {
    const existing = this.getTenantState(clubId);
    const preservedLedger = [...existing.auditLedger];
    const fresh = createTenantClubState(
      clubId,
      existing.clubName,
      existing.district
    );
    fresh.revision = existing.revision + 1;
    fresh.auditLedger = preservedLedger;
    this.state.tenants[clubId] = fresh;
    this.appendAuditEntry({
      clubId,
      actorName: `${actor.fullName} (${actor.rotaryId})`,
      actorRole: actor.role,
      module: 'Yönetim & Güvenlik',
      action:
        'Pilot Operasyonel Verisi Başlangıç Durumuna Sıfırlandı (Denetim Defteri Korundu)',
      detail: `${existing.clubName} operasyonel tabloları sıfırlandı; SHA-256 denetim geçmişi silinmeden korundu.`,
      timestamp,
    });
    return this.state.tenants[clubId];
  }
}
