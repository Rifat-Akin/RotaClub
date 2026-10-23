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
  OverdueMemberItem,
  PastPresidentRecord,
  PaymentNotification,
  RitualStep,
  RotaryMember,
  RsvpStatus,
  MenuPreference,
  ScholarStudent,
  SpeakerProposal,
  TermBoardInfo,
  TreasuryLedgerEntry,
  WeeklyMeeting,
} from '../types/rotary';
import { maskPhoneForKvkk } from '../utils/rotaryLogic';

const SERVER_SECRET =
  process.env.ROTACLUB_JWT_SECRET ||
  'rotaclub-2420-galata-hmac-sha256-production-secret-key-2026';

export interface AuthenticatedUser {
  memberId: string;
  rotaryId: string;
  fullName: string;
  email: string;
  role: ClubRole;
  clubId: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface PilotUserAccount {
  memberId: string;
  rotaryId: string;
  fullName: string;
  email: string;
  role: ClubRole;
  clubId: string;
  pinCode: string;
  passwordSalt: string;
  passwordHash: string;
}

export interface BankStatementEntry {
  bankRef: string;
  amount: number;
  senderName: string;
  date: string;
  description: string;
  reconciled: boolean;
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
}

export interface MultiTenantDatabaseFile {
  schemaVersion: '5.0.0-hardened';
  updatedAt: string;
  tenants: Record<string, TenantClubDatabaseState>;
  auditLedger: ChainedAuditLogEntry[];
}

function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 32).toString('hex');
}

const DEFAULT_SALT = 'rotaclub-2420-salt';

export const PILOT_ACCOUNTS: PilotUserAccount[] = [
  {
    memberId: 'm-rifat',
    rotaryId: 'TR-2420-88412',
    fullName: 'Rtn. Rifat Akın',
    email: 'rifat.akin@galatarotary.org',
    role: 'uye',
    clubId: 'club-galata',
    pinCode: '242011',
    passwordSalt: DEFAULT_SALT,
    passwordHash: hashPin('242011', DEFAULT_SALT),
  },
  {
    memberId: 'm-nazli',
    rotaryId: 'TR-2420-81024',
    fullName: 'Rtn. Av. Nazlı Denizmen',
    email: 'sekreter@galatarotary.org',
    role: 'sekreter',
    clubId: 'club-galata',
    pinCode: '242022',
    passwordSalt: DEFAULT_SALT,
    passwordHash: hashPin('242022', DEFAULT_SALT),
  },
  {
    memberId: 'm-levent',
    rotaryId: 'TR-2420-79310',
    fullName: 'Rtn. YMM Levent Soydan',
    email: 'sayman@galatarotary.org',
    role: 'sayman',
    clubId: 'club-galata',
    pinCode: '242033',
    passwordSalt: DEFAULT_SALT,
    passwordHash: hashPin('242033', DEFAULT_SALT),
  },
  {
    memberId: 'm-emre',
    rotaryId: 'TR-2420-74105',
    fullName: 'Rtn. Mimar Emre Karaca',
    email: 'baskan@galatarotary.org',
    role: 'baskan',
    clubId: 'club-galata',
    pinCode: '242044',
    passwordSalt: DEFAULT_SALT,
    passwordHash: hashPin('242044', DEFAULT_SALT),
  },
];

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

export function verifyAuditChain(ledger: ChainedAuditLogEntry[]): {
  valid: boolean;
  totalEntries: number;
  headHash: string;
  brokenAtSequence?: number;
} {
  if (ledger.length === 0) {
    return { valid: true, totalEntries: 0, headHash: 'GENESIS_2420' };
  }
  // Ledger is ordered newest-first in UI, or oldest-first by sequenceNo
  const sorted = [...ledger].sort((a, b) => a.sequenceNo - b.sequenceNo);
  let expectedPrev = 'GENESIS_2420';
  for (const item of sorted) {
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

export function issueSignedToken(user: Omit<AuthenticatedUser, 'iat' | 'exp' | 'jti'>): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload: AuthenticatedUser = {
    ...user,
    iat: nowSec,
    exp: nowSec + 60 * 60 * 12, // 12 hours
    jti: crypto.randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(payloadB64, 'utf8')
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySignedToken(token: string | undefined): AuthenticatedUser | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SERVER_SECRET)
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
    return decoded;
  } catch {
    return null;
  }
}

export function authenticatePilotCredentials(
  identifier: string,
  pinOrPassword: string,
  clubId = 'club-galata'
): { user: AuthenticatedUser; token: string } | null {
  const normalized = identifier.trim().toLowerCase();
  const account = PILOT_ACCOUNTS.find(
    (acc) =>
      acc.role === normalized ||
      acc.rotaryId.toLowerCase() === normalized ||
      acc.email.toLowerCase() === normalized ||
      acc.memberId.toLowerCase() === normalized
  );
  if (!account) return null;

  const computedHash = hashPin(pinOrPassword.trim(), account.passwordSalt);
  const hashA = Buffer.from(computedHash, 'hex');
  const hashB = Buffer.from(account.passwordHash, 'hex');
  if (hashA.length !== hashB.length || !crypto.timingSafeEqual(hashA, hashB)) {
    return null;
  }

  const userPayload = {
    memberId: account.memberId,
    rotaryId: account.rotaryId,
    fullName: account.fullName,
    email: account.email,
    role: account.role,
    clubId,
  };
  const token = issueSignedToken(userPayload);
  const verified = verifySignedToken(token)!;
  return { user: verified, token };
}

function createInitialAuditChain(): ChainedAuditLogEntry[] {
  const seeds: Array<{
    id: string;
    timestamp: string;
    actorName: string;
    actorRole: ClubRole;
    module: AuditLogEntry['module'];
    action: string;
    detail: string;
  }> = [
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
      action: 'Banka Mutabakatlı Kasa Tahsilat Kaydı (#GAR-2026-99120)',
      detail: '14 üyenin Ekim ayı aidat ve kuver tahsilatı (168.000 TL) banka ekstresiyle eşleştirilerek kasa defterine işlendi.',
    },
    {
      id: 'aud-1003',
      timestamp: '22 Ekim 2026 · 11:15:00',
      actorName: 'Rtn. Kerem Soylu (Üye · TR-2420-83190)',
      actorRole: 'uye',
      module: 'Saymanlık & Kasa',
      action: 'FAST Dekont Bildirimi (#GAR-2026-88341)',
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
  ];

  const chain: ChainedAuditLogEntry[] = [];
  let prevHash = 'GENESIS_2420';
  seeds.forEach((seed, idx) => {
    const partial: Omit<ChainedAuditLogEntry, 'entryHash'> = {
      ...seed,
      clubId: 'club-galata',
      sequenceNo: idx + 1,
      verifiedByServer: true,
      prevHash,
    };
    const entryHash = computeAuditHash(partial);
    chain.push({ ...partial, entryHash });
    prevHash = entryHash;
  });

  return chain.reverse(); // newest first for UI consumption
}

function createInitialBankStatements(): BankStatementEntry[] {
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
      bankRef: '#GAR-2026-99501',
      amount: 5000,
      senderName: 'Rtn. Rifat Akın',
      date: '23 Ekim 2026 · 15:00',
      description: 'Garanti BBVA FAST — Galata Rotary Proje / Burs / Aidat Ödemesi',
      reconciled: false,
    },
  ];
}

export function createTenantClubState(
  clubId: string,
  clubName: string,
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
          title: `${clubPrefix} · ${p.title}`,
          collectedAmount: Math.round(p.collectedAmount * 0.75),
        }
  );

  return {
    clubId,
    clubName: clubPrefix,
    district,
    revision: 1,
    updatedAt: new Date().toISOString(),
    termInfo: {
      ...INITIAL_TERM_BOARD,
      clubName: clubPrefix,
      district,
    },
    meetings: baseMeetings,
    selectedMeetingNo: 1842,
    rsvpStatus: 'attending',
    menuPreference: 'Standart',
    guestNameInput: 'Mim. Caner Erkin — Kentsel Tasarım',
    ritualSteps: INITIAL_RITUAL_STEPS.map((s) => ({ ...s })),
    celebrations: INITIAL_CELEBRATIONS.map((c) => ({ ...c })),
    speakerProposals: INITIAL_SPEAKER_PROPOSALS.map((sp) => ({ ...sp })),
    qrCheckedIn: false,
    makeupSubmissions: INITIAL_MAKEUP_SUBMISSIONS.map((m) => ({ ...m })),
    guestMakeupCards: INITIAL_GUEST_MAKEUP_CARDS.map((g) => ({ ...g })),
    firesideGroups: INITIAL_FIRESIDE_GROUPS.map((f) => ({ ...f })),
    financialItems: INITIAL_FINANCIAL_ITEMS.map((fi) => ({ ...fi })),
    paymentNotifications: INITIAL_PAYMENT_NOTIFICATIONS.map((p) => ({ ...p })),
    overdueMembers: INITIAL_OVERDUE_MEMBERS.map((o) => ({ ...o })),
    treasuryLedger: INITIAL_TREASURY_LEDGER.map((t) => ({ ...t })),
    projects: baseProjects,
    scholars: INITIAL_SCHOLARS.map((s) => ({ ...s })),
    members: GALATA_ROTARY_MEMBERS.map((m) => ({ ...m })),
    committees: INITIAL_CLUB_COMMITTEES.map((c) => ({ ...c })),
    pastPresidents: INITIAL_PAST_PRESIDENTS.map((pp) => ({ ...pp })),
    boardResolutions: INITIAL_BOARD_RESOLUTIONS.map((br) => ({ ...br })),
    kvkkMaskPhone: false,
    bankStatements: createInitialBankStatements(),
  };
}

export function createDefaultMultiTenantDb(): MultiTenantDatabaseFile {
  return {
    schemaVersion: '5.0.0-hardened',
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
    auditLedger: createInitialAuditChain(),
  };
}

/**
 * Redacts sensitive club-wide financial data and applies KVKK phone masking
 * when a regular 'uye' fetches the club state (#12, #20).
 */
export function redactStateForRole(
  tenantState: TenantClubDatabaseState,
  auditLedger: ChainedAuditLogEntry[],
  user: AuthenticatedUser
) {
  const isPrivilegedFinance = user.role === 'sayman' || user.role === 'baskan';
  const isPrivilegedBoard =
    user.role === 'sekreter' || user.role === 'sayman' || user.role === 'baskan';

  const shouldMaskPhones = tenantState.kvkkMaskPhone || user.role === 'uye';

  const sanitizedMembers: RotaryMember[] = tenantState.members.map((m) => {
    const isSelf = m.id === user.memberId;
    return {
      ...m,
      phone: isSelf
        ? m.phone
        : maskPhoneForKvkk(m.phone, Boolean(tenantState.kvkkMaskPhone)),
      // Regular 'uye' cannot inspect other members' personal debt balances
      duesBalance: isPrivilegedFinance || isSelf ? m.duesBalance : 0,
      mealBalance: isPrivilegedFinance || isSelf ? m.mealBalance : 0,
      foundationBalance: isPrivilegedFinance || isSelf ? m.foundationBalance : 0,
    };
  });

  const sanitizedPayments = isPrivilegedFinance
    ? tenantState.paymentNotifications
    : tenantState.paymentNotifications.filter((p) => p.memberId === user.memberId);

  const sanitizedOverdue = isPrivilegedFinance ? tenantState.overdueMembers : [];

  const chainVerification = verifyAuditChain(auditLedger);

  return {
    ...tenantState,
    members: sanitizedMembers,
    paymentNotifications: sanitizedPayments,
    overdueMembers: sanitizedOverdue,
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
 * Never swallows write errors silently (#14).
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
      customDbFile || path.join(this.dbDir, 'rotaclub_pilot_v5_db.json');
    this.state = this.loadFromDisk();
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
    if (!parsed || parsed.schemaVersion !== '5.0.0-hardened' || !parsed.tenants) {
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
    const tmpFile = `${this.dbFile}.tmp.${process.pid}.${Date.now()}`;
    const serialized = JSON.stringify(nextState, null, 2);
    const fd = fs.openSync(tmpFile, 'w');
    try {
      fs.writeFileSync(fd, serialized, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpFile, this.dbFile);
  }

  public getTenantState(clubId: string): TenantClubDatabaseState {
    if (!this.state.tenants[clubId]) {
      this.state.tenants[clubId] = createTenantClubState(clubId, clubId);
      this.atomicWriteToDisk(this.state);
    }
    return this.state.tenants[clubId];
  }

  public getAuditLedger(): ChainedAuditLogEntry[] {
    return this.state.auditLedger;
  }

  public getFullSnapshot(): MultiTenantDatabaseFile {
    return this.state;
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
    const ledger = this.state.auditLedger;
    const latestEntry =
      ledger.length > 0
        ? [...ledger].sort((a, b) => b.sequenceNo - a.sequenceNo)[0]
        : null;
    const prevHash = latestEntry ? latestEntry.entryHash : 'GENESIS_2420';
    const nextSeq = latestEntry ? latestEntry.sequenceNo + 1 : 1;

    const partial: Omit<ChainedAuditLogEntry, 'entryHash'> = {
      id: `aud-${1000 + nextSeq}`,
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

    // IMMUTABLE APPEND-ONLY: Never slice or delete previous audit records!
    this.state.auditLedger = [fullEntry, ...this.state.auditLedger];
    this.state.updatedAt = new Date().toISOString();
    this.atomicWriteToDisk(this.state);
    return fullEntry;
  }

  public updateTenant(
    clubId: string,
    updater: (current: TenantClubDatabaseState) => TenantClubDatabaseState
  ): TenantClubDatabaseState {
    const current = this.getTenantState(clubId);
    const updated = updater(current);
    updated.revision = (current.revision || 1) + 1;
    updated.updatedAt = new Date().toISOString();
    this.state.tenants[clubId] = updated;
    this.state.updatedAt = updated.updatedAt;
    this.atomicWriteToDisk(this.state);
    return updated;
  }

  /**
   * Resets a specific tenant's operational demo data while strictly preserving
   * the immutable audit ledger (#18).
   */
  public resetTenantOperationalData(
    clubId: string,
    actor: AuthenticatedUser,
    timestamp: string
  ): TenantClubDatabaseState {
    const existing = this.getTenantState(clubId);
    const fresh = createTenantClubState(clubId, existing.clubName, existing.district);
    fresh.revision = existing.revision + 1;
    this.state.tenants[clubId] = fresh;
    this.appendAuditEntry({
      clubId,
      actorName: `${actor.fullName} (${actor.rotaryId})`,
      actorRole: actor.role,
      module: 'Yönetim & Güvenlik',
      action: 'Pilot Operasyonel Verisi Başlangıç Durumuna Sıfırlandı (Denetim Defteri Korundu)',
      detail: `${existing.clubName} operasyonel tabloları sıfırlandı; SHA-256 denetim geçmişi silinmeden korundu.`,
      timestamp,
    });
    return fresh;
  }
}
