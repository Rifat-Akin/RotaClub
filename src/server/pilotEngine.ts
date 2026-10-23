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
import { maskPhoneForKvkk } from '../utils/rotaryLogic';

export const ALLOWED_TENANT_CLUB_IDS = [
  'club-galata',
  'club-karakoy',
  'club-macka',
  'club-district2420',
] as const;

export type AllowedTenantClubId = (typeof ALLOWED_TENANT_CLUB_IDS)[number];

export function isAllowedTenantClubId(clubId: string): clubId is AllowedTenantClubId {
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
  webauthnCredentials: WebAuthnCredentialRecord[];
}

export interface BankStatementEntry {
  bankRef: string;
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
  kvkkMaskPhone: boolean;
  bankStatements: BankStatementEntry[];
  auditLedger: ChainedAuditLogEntry[];
}

export interface MultiTenantDatabaseFile {
  schemaVersion: '5.2.0-hardened';
  updatedAt: string;
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
        return Buffer.concat([Buffer.from([0x02, sliced.length + 1, 0x00]), sliced]);
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

function buildInitialAccount(params: {
  memberId: string;
  rotaryId: string;
  fullName: string;
  email: string;
  role: ClubRole;
  clubId: AllowedTenantClubId;
  clubMemberships: ClubMembershipBinding[];
  envPinVar: string;
  precomputedSalt: string;
  precomputedHash: string;
}): PilotUserAccount {
  const customEnvPin = process.env[params.envPinVar]?.trim();
  const salt = customEnvPin
    ? crypto.randomBytes(16).toString('hex')
    : params.precomputedSalt;
  const hash = customEnvPin
    ? hashPinWithSalt(customEnvPin, salt)
    : params.precomputedHash;

  return {
    memberId: params.memberId,
    rotaryId: params.rotaryId,
    fullName: params.fullName,
    email: params.email,
    role: params.role,
    clubId: params.clubId,
    clubMemberships: params.clubMemberships,
    passwordSalt: salt,
    passwordHash: hash,
    // Credentials must be registered with a real ECDSA P-256 SPKI public key via /api/auth/webauthn-register-verify
    webauthnCredentials: [],
  };
}

export function createInitialPilotAccounts(): PilotUserAccount[] {
  return [
    buildInitialAccount({
      memberId: 'm-rifat',
      rotaryId: 'TR-2420-88412',
      fullName: 'Rtn. Rifat Akın',
      email: 'rifat.akin@galatarotary.org',
      role: 'uye',
      clubId: 'club-galata',
      // Regular member belongs ONLY to club-galata (#70)
      clubMemberships: [{ clubId: 'club-galata', role: 'uye' }],
      envPinVar: 'ROTACLUB_PIN_UYE',
      precomputedSalt: '9f8e7d6c5b4a39281726354453627180',
      precomputedHash:
        '1d5ab304ffd47117df5743c7320bea0197a5fcd9d4a1a9ca313294cab41d44f9',
    }),
    buildInitialAccount({
      memberId: 'm-nazli',
      rotaryId: 'TR-2420-81024',
      fullName: 'Rtn. Av. Nazlı Denizmen',
      email: 'sekreter@galatarotary.org',
      role: 'sekreter',
      clubId: 'club-galata',
      // Club secretary belongs ONLY to club-galata (#70)
      clubMemberships: [{ clubId: 'club-galata', role: 'sekreter' }],
      envPinVar: 'ROTACLUB_PIN_SEKRETER',
      precomputedSalt: '1a2b3c4d5e6f708192a3b4c5d6e7f809',
      precomputedHash:
        'b034352ba57a189a42fd1b0cf190efae4843cbc4ab5ae90af697f98daf11a418',
    }),
    buildInitialAccount({
      memberId: 'm-levent',
      rotaryId: 'TR-2420-79310',
      fullName: 'Rtn. YMM Levent Soydan',
      email: 'sayman@galatarotary.org',
      role: 'sayman',
      clubId: 'club-galata',
      // Club treasurer belongs ONLY to club-galata (#70)
      clubMemberships: [{ clubId: 'club-galata', role: 'sayman' }],
      envPinVar: 'ROTACLUB_PIN_SAYMAN',
      precomputedSalt: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      precomputedHash:
        'ccc5a073f09744e1bc2545d64b75dcf67dc05a738bfc0541e3d7187210c97901',
    }),
    buildInitialAccount({
      memberId: 'm-emre',
      rotaryId: 'TR-2420-74105',
      fullName: 'Rtn. Mimar Emre Karaca',
      email: 'baskan@galatarotary.org',
      role: 'baskan',
      clubId: 'club-galata',
      // District 2420 Multi-Club Governance Officer & Galata President (#70)
      clubMemberships: [
        { clubId: 'club-galata', role: 'baskan' },
        { clubId: 'club-karakoy', role: 'baskan' },
        { clubId: 'club-macka', role: 'baskan' },
        { clubId: 'club-district2420', role: 'baskan' },
      ],
      envPinVar: 'ROTACLUB_PIN_BASKAN',
      precomputedSalt: 'f0e1d2c3b4a5968778695a4b3c2d1e0f',
      precomputedHash:
        'c042c479a593355ef36883d44f896c4d713052cf9b8b514493859134ed7101f6',
    }),
  ];
}

export const PILOT_ACCOUNTS: PilotUserAccount[] = createInitialPilotAccounts();

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
  accounts: PilotUserAccount[] = PILOT_ACCOUNTS
): PilotUserAccount | undefined {
  const normalized = String(identifier || '').trim().toLowerCase();
  return accounts.find(
    (acc) =>
      acc.role === normalized ||
      acc.rotaryId.toLowerCase() === normalized ||
      acc.email.toLowerCase() === normalized ||
      acc.memberId.toLowerCase() === normalized
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
  accounts: PilotUserAccount[] = PILOT_ACCOUNTS
):
  | { ok: true; user: AuthenticatedUser; token: string }
  | {
      ok: false;
      reason: 'INVALID_CREDENTIALS' | 'UNKNOWN_CLUB_TENANT' | 'CLUB_MEMBERSHIP_FORBIDDEN';
    } {
  if (!isAllowedTenantClubId(clubId)) {
    return { ok: false, reason: 'UNKNOWN_CLUB_TENANT' };
  }

  const account = findPilotAccount(identifier, accounts);
  if (!account) {
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  const computedHash = hashPinWithSalt(pinOrPassword.trim(), account.passwordSalt);
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
          action: 'Galata Rotary Pilot Veritabanı & Kriptografik Denetim Zinciri Başlatıldı',
          detail: 'SHA-256 hash zincirli denetim defteri, HMAC-SHA256 oturum doğrulaması ve çoklu kulüp izolasyonu başlatıldı.',
        },
        {
          id: 'aud-1002',
          timestamp: '20 Ekim 2026 · 18:45:00',
          actorName: 'Rtn. YMM Levent Soydan (Sayman)',
          actorRole: 'sayman',
          module: 'Saymanlık & Kasa',
          action: 'Banka Mutabakatlı Kasa Tahsilat Kaydı (GAR-2026-99120)',
          detail: '14 üyenin Ekim ayı aidat ve kuver tahsilatı (168.000 TL) banka ekstresiyle eşleştirilerek kasa defterine işlendi.',
        },
        {
          id: 'aud-1003',
          timestamp: '22 Ekim 2026 · 11:15:00',
          actorName: 'Rtn. Kerem Soylu (Üye · TR-2420-83190)',
          actorRole: 'uye',
          module: 'Saymanlık & Kasa',
          action: 'FAST Dekont Bildirimi (GAR-2026-88341)',
          detail: '9.000 TL 1. Yarıyıl Aidat 2. Taksit ödemesi banka mutabakatı ve Sayman onayı kuyruğuna eklendi.',
        },
        {
          id: 'aud-1004',
          timestamp: '22 Ekim 2026 · 14:20:00',
          actorName: 'Rtn. Av. Nazlı Denizmen (Genel Sekreter)',
          actorRole: 'sekreter',
          module: 'LCV & Kuver',
          action: '1842. Toplantı Kuver Matrisi Senkronizasyonu',
          detail: 'Pera Palace Hotel mutfak kuver listesi (35 Kuver) sunucu veritabanında doğrulandı.',
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

function createInitialBankStatementsForClub(clubId: string): BankStatementEntry[] {
  if (clubId !== 'club-galata') {
    const prefix = clubId.replace('club-', '').toUpperCase();
    return [
      {
        bankRef: `${prefix}-2026-1001`,
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
      amount: 9000,
      senderName: 'Rtn. Kerem Soylu',
      date: '22 Ekim 2026 · 10:42',
      description: 'Garanti BBVA FAST — 1. Yarıyıl Aidat 2. Taksit',
      reconciled: false,
    },
    {
      bankRef: 'ISBK-2026-44120',
      amount: 12000,
      senderName: 'Rtn. Defne Serezli',
      date: '21 Ekim 2026 · 16:40',
      description: 'İş Bankası FAST — GALATART Sergi Fonu ve PolioPlus Katkı Payı',
      reconciled: false,
    },
    {
      bankRef: 'GAR-2026-99501',
      amount: 5000,
      senderName: 'Rtn. Rifat Akın',
      date: '23 Ekim 2026 · 15:00',
      description: 'Garanti BBVA FAST — Galata Rotary Proje / Burs / Aidat Ödemesi #1',
      reconciled: false,
    },
    {
      bankRef: 'GAR-2026-99502',
      amount: 4500,
      senderName: 'Rtn. Rifat Akın',
      date: '23 Ekim 2026 · 15:10',
      description: 'Garanti BBVA FAST — Galata Rotary Eğitim Bursu Katkı Ödemesi #2',
      reconciled: false,
    },
    {
      bankRef: 'GAR-2026-99503',
      amount: 7500,
      senderName: 'Rtn. Rifat Akın',
      date: '23 Ekim 2026 · 15:20',
      description: 'Garanti BBVA FAST — Galata Rotary Hizmet Projesi Bağışı #3',
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
      rsvpStatus: 'attending',
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
    makeupSubmissions: isGalata
      ? INITIAL_MAKEUP_SUBMISSIONS.map((m) => ({ ...m }))
      : [],
    guestMakeupCards: isGalata
      ? INITIAL_GUEST_MAKEUP_CARDS.map((g) => ({ ...g }))
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
    members: isGalata
      ? GALATA_ROTARY_MEMBERS.map((m) => ({ ...m }))
      : createIsolatedNonGalataMembers(clubId, clubPrefix),
    committees: isGalata ? INITIAL_CLUB_COMMITTEES.map((c) => ({ ...c })) : [],
    pastPresidents: isGalata
      ? INITIAL_PAST_PRESIDENTS.map((pp) => ({ ...pp }))
      : [],
    boardResolutions: isGalata
      ? INITIAL_BOARD_RESOLUTIONS.map((br) => ({ ...br }))
      : [],
    kvkkMaskPhone: false,
    bankStatements: createInitialBankStatementsForClub(clubId),
    auditLedger: createInitialAuditChainForClub(clubId, clubPrefix),
  };
}

export function createDefaultMultiTenantDb(): MultiTenantDatabaseFile {
  return {
    schemaVersion: '5.2.0-hardened',
    updatedAt: new Date().toISOString(),
    tenants: {
      'club-galata': createTenantClubState('club-galata', 'Galata Rotary Kulübü'),
      'club-karakoy': createTenantClubState('club-karakoy', 'Karaköy Rotary Kulübü'),
      'club-macka': createTenantClubState('club-macka', 'Maçka Rotary Kulübü'),
      'club-district2420': createTenantClubState(
        'club-district2420',
        'UR 2420. Bölge Guvernörlüğü'
      ),
    },
    accounts: createInitialPilotAccounts(),
    revokedTokenJtis: [],
  };
}

/**
 * Redacts sensitive club-wide financial data and applies strict KVKK PII masking
 * when a regular 'uye' fetches the club state (#12, #16, #20).
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
      email: isSelf ? m.email : maskEmailForKvkk(m.email, shouldMaskSensitivePii),
      bloodGroup: isSelf || isPrivilegedBoard ? m.bloodGroup : 'KVKK Gizli',
      spouseName: isSelf || isPrivilegedBoard ? m.spouseName : undefined,
      weddingAnniversary:
        isSelf || isPrivilegedBoard ? m.weddingAnniversary : undefined,
      duesBalance: isPrivilegedFinance || isSelf ? m.duesBalance : 0,
      mealBalance: isPrivilegedFinance || isSelf ? m.mealBalance : 0,
      foundationBalance: isPrivilegedFinance || isSelf ? m.foundationBalance : 0,
    };
  });

  const sanitizedPayments = isPrivilegedFinance
    ? tenantState.paymentNotifications
    : tenantState.paymentNotifications.filter((p) => p.memberId === user.memberId);

  const sanitizedOverdue = isPrivilegedFinance ? tenantState.overdueMembers : [];

  const sanitizedTreasuryLedger = isPrivilegedFinance
    ? tenantState.treasuryLedger
    : tenantState.treasuryLedger.map((entry) => ({
        ...entry,
        counterparty:
          entry.type === 'Gelir' && entry.counterparty.startsWith('Rtn.')
            ? 'Rtn. *** (KVKK Maskeli)'
            : entry.counterparty,
      }));

  const chainVerification = verifyAuditChain(auditLedger, tenantState.clubId);

  return {
    ...tenantState,
    members: sanitizedMembers,
    paymentNotifications: sanitizedPayments,
    overdueMembers: sanitizedOverdue,
    treasuryLedger: sanitizedTreasuryLedger,
    bankStatements: isPrivilegedFinance ? tenantState.bankStatements : [],
    auditLogs: auditLedger,
    auditVerification: chainVerification,
    redactedForRole: user.role,
    kvkkPhoneProtected: shouldMaskPhones,
    canExportBackup: isPrivilegedBoard,
    canResetDatabase: user.role === 'baskan',
  };
}

/**
 * Atomic File Persistence with Write-Ahead Temp File + fsync + rename
 * Enforces Compare-And-Swap (CAS) revision locking (#14, #18, #70).
 */
export class AtomicMultiTenantStore {
  private dbDir: string;
  private dbFile: string;
  private state: MultiTenantDatabaseFile;

  constructor(customDbFile?: string) {
    this.dbDir = customDbFile
      ? path.dirname(customDbFile)
      : path.resolve(process.cwd(), '.aistudio');
    this.dbFile =
      customDbFile || path.join(this.dbDir, 'rotaclub_pilot_v5_2_db.json');
    this.state = this.loadFromDisk();
    if (Array.isArray(this.state.revokedTokenJtis)) {
      for (const jti of this.state.revokedTokenJtis) {
        runtimeRevokedJtis.add(jti);
      }
    }
  }

  private loadFromDisk(): MultiTenantDatabaseFile {
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }
    if (!fs.existsSync(this.dbFile)) {
      const initial = createDefaultMultiTenantDb();
      this.atomicWriteToDisk(initial);
      return initial;
    }
    const raw = fs.readFileSync(this.dbFile, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<MultiTenantDatabaseFile>;
    if (
      !parsed ||
      parsed.schemaVersion !== '5.2.0-hardened' ||
      !parsed.tenants ||
      !parsed.accounts
    ) {
      const upgraded = createDefaultMultiTenantDb();
      this.atomicWriteToDisk(upgraded);
      return upgraded;
    }
    return parsed as MultiTenantDatabaseFile;
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

  public changeAccountPin(
    memberId: string,
    currentPin: string,
    newPin: string
  ): boolean {
    const account = this.state.accounts.find((a) => a.memberId === memberId);
    if (!account) return false;
    const currentHash = hashPinWithSalt(currentPin.trim(), account.passwordSalt);
    const bufA = Buffer.from(currentHash, 'hex');
    const bufB = Buffer.from(account.passwordHash, 'hex');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return false;
    }
    const newSalt = crypto.randomBytes(16).toString('hex');
    account.passwordSalt = newSalt;
    account.passwordHash = hashPinWithSalt(newPin.trim(), newSalt);
    this.state.updatedAt = new Date().toISOString();
    this.atomicWriteToDisk(this.state);
    return true;
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
   * Atomic Compare-And-Swap (CAS) Tenant Update (#14)
   * Validates expectedRevision inside the critical section before applying updater and fsyncing to disk.
   */
  public updateTenant(
    clubId: string,
    updater: (current: TenantClubDatabaseState) => TenantClubDatabaseState,
    expectedRevision?: number
  ):
    | { ok: true; state: TenantClubDatabaseState }
    | { ok: false; currentRevision: number } {
    const current = this.getTenantState(clubId);
    if (
      typeof expectedRevision === 'number' &&
      expectedRevision !== current.revision
    ) {
      return { ok: false, currentRevision: current.revision };
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
