import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  AllowedTenantClubId,
  AtomicMultiTenantStore,
  AuthenticatedUser,
  authenticatePilotCredentials,
  ensureDerEcdsaSignature,
  findPilotAccount,
  getAccountClubMembership,
  getServerSecret,
  isAllowedTenantClubId,
   issueSignedToken,
  normalizeBankRef,
  normalizePersonName,
  POSTGRESQL_RELATIONAL_SCHEMA_V5_4,
  redactStateForRole,
  revokeTokenJti,
  verifyAndExtractWebAuthnRegistration,
  verifyAuditChain,
  verifySignedToken,
  verifyTransactionalIntegrity,
} from './src/server/pilotEngine';
import {
  AuditLogEntry,
  BoardResolutionItem,
  BoardResolutionVoteEntry,
  CertificateApprovalHistoryEntry,
  ClubAttendancePolicy,
  ClubRole,
  DebtWaiverWriteOffJournalEntry,
  FinancialLineItem,
  GuestRotaryMakeupCard,
  MakeupAuditHistoryEntry,
  MakeupStatus,
  MakeupSubmission,
  MemberLifecycleHistoryEntry,
  MembershipLifecycleStatus,
  ReminderChannel,
  RotaryMember,
  TreasuryLedgerEntry,
  VerifiedGuestAttendanceRecord,
} from './src/types/rotary';
import {
  applyBulkMemberAccrual,
  buildMakeupActivityKey,
  calculateMeetingKuverSummary,
  calculateTermAttendanceMetrics,
  DEFAULT_CLUB_ATTENDANCE_POLICY,
  evaluateLcvReminderBatch,
  getIstanbulHourFromEpochMs,
  hasDuplicateInMakeupBatch,
  hasDuplicateMakeupActivity,
  maskGuestNameForPublicVerification,
  resolveUnambiguousLegacyMemberId,
  SERVER_LCV_REMINDER_COOLDOWN_MS,
  validateMemberLifecycleTransition,
  verifyBoardDebtWaiverQuorum,
} from './src/utils/rotaryLogic';
import { SqlRelationalVerificationEngine } from './src/server/sqlRelationalEngine';

const PORT = 3000;

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
}

function formatNowTR(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const secs = String(now.getSeconds()).padStart(2, '0');
  return `23 Ekim 2026 · ${hours}:${mins}:${secs}`;
}

function extractBearerToken(req: Request): {
  token?: string;
  queryTokenAttempted: boolean;
} {
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return { token: undefined, queryTokenAttempted: true };
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return {
      token: authHeader.slice('Bearer '.length).trim(),
      queryTokenAttempted: false,
    };
  }
  return { token: undefined, queryTokenAttempted: false };
}

/**
 * Cryptographic Session Authentication Middleware (#12, #20, #22, #23)
 * Rejects unauthenticated requests, blocks URL query tokens, and prevents header spoofing.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const { token, queryTokenAttempted } = extractBearerToken(req);
  if (queryTokenAttempted) {
    res.status(401).json({
      error: 'QUERY_TOKEN_FORBIDDEN',
      message:
        'Güvenlik ihlali engellendi: Oturum anahtarları URL sorgu parametresi (?token=) ile gönderilemez. Authorization: Bearer başlığı zorunludur.',
    });
    return;
  }

  const verified = verifySignedToken(token);
  if (!verified) {
    res.status(401).json({
      error: 'AUTH_REQUIRED',
      message:
        'Geçerli bir sunucu oturum anahtarı (HMAC-SHA256 Bearer Token) bulunamadı. Lütfen kimlik doğrulaması yapın.',
    });
    return;
  }

  // Detect and block header spoofing if client sends a mismatched x-rotaclub-role
  const spoofedHeaderRole = req.headers['x-rotaclub-role'] as ClubRole | undefined;
  if (spoofedHeaderRole && spoofedHeaderRole !== verified.role) {
    res.status(403).json({
      error: 'ROLE_SPOOFING_DETECTED',
      message: `İstemci başlığındaki rol (${spoofedHeaderRole}) imzalı sunucu oturumundaki rolle (${verified.role}) uyuşmuyor.`,
    });
    return;
  }

  req.authUser = verified;
  next();
}

/**
 * Strict Server-Side RBAC Middleware (#22, #23)
 * Reads role exclusively from the cryptographically verified session token.
 */
export function requireServerRole(allowedRoles: ClubRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    requireAuth(req, res, () => {
      const user = req.authUser!;
      if (!allowedRoles.includes(user.role)) {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message: `Bu işlem için sunucu yetkisi gereklidir (${allowedRoles.join(' / ')}). Doğrulanmış oturum rolünüz: ${user.role}`,
        });
        return;
      }
      next();
    });
  };
}

/**
 * Strict P0 Multi-Club Tenant & Membership Isolation Guard (#70)
 * 1. Rejects unknown club IDs (404 UNKNOWN_CLUB_TENANT)
 * 2. Prevents a token issued for club A from accessing club B (403 CROSS_TENANT_FORBIDDEN)
 * 3. Verifies the user still holds an active membership and role in that club (403 CLUB_MEMBERSHIP_FORBIDDEN)
 */
function verifyTenantBoundary(
  user: AuthenticatedUser,
  requestedClubId: string | undefined,
  store: AtomicMultiTenantStore,
  res: Response
): AllowedTenantClubId | null {
  const effectiveClubId = (requestedClubId && requestedClubId.trim()) || user.clubId;
  if (!isAllowedTenantClubId(effectiveClubId)) {
    res.status(404).json({
      error: 'UNKNOWN_CLUB_TENANT',
      message: `Tanımsız kulüp kimliği: "${effectiveClubId}".`,
    });
    return null;
  }
  if (effectiveClubId !== user.clubId) {
    res.status(403).json({
      error: 'CROSS_TENANT_FORBIDDEN',
      message: `Kulüpler arası yetkisiz erişim engellendi (#70): İmzalı oturumunuz "${user.clubId}" kulübüne aittir; "${effectiveClubId}" kulübünün verilerine doğrudan erişemezsiniz. Önce /api/auth/switch-club ile kulüp oturumu değiştirin.`,
    });
    return null;
  }
  const account = findPilotAccount(user.memberId, store.getAccounts());
  const membership = account
    ? getAccountClubMembership(account, effectiveClubId)
    : null;
  if (!membership || membership.role !== user.role) {
    res.status(403).json({
      error: 'CLUB_MEMBERSHIP_FORBIDDEN',
      message: `"${effectiveClubId}" kulübünde aktif üyelik veya "${user.role}" yetki kaydınız doğrulanamadı.`,
    });
    return null;
  }
  return effectiveClubId;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);
const DEFAULT_CANONICAL_WEBAUTHN_ORIGINS = [
  'https://rotaclub.galatarotary.org',
  'https://galata.rotary2420.org',
];

function resolveTrustedWebAuthnRpAndOrigin(
  req: Request,
  extraTrustedOrigins?: string[]
):
  | {
      ok: true;
      rpId: string;
      expectedOrigin: string;
    }
  | {
      ok: false;
      error: string;
      message: string;
    } {
  const configuredPrimary = process.env.ROTACLUB_WEBAUTHN_ORIGIN?.trim();
  const envTrustedList = (process.env.ROTACLUB_WEBAUTHN_TRUSTED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const appUrlOrigin = process.env.APP_URL?.trim();

  const trustedOriginStrings = [
    ...DEFAULT_CANONICAL_WEBAUTHN_ORIGINS,
    ...(configuredPrimary ? [configuredPrimary] : []),
    ...envTrustedList,
    ...(appUrlOrigin ? [appUrlOrigin] : []),
    ...(extraTrustedOrigins || []),
  ];

  const trustedOriginsMap = new Map<
    string,
    { rpId: string; expectedOrigin: string }
  >();
  for (const rawOrigin of trustedOriginStrings) {
    try {
      const parsed = new URL(rawOrigin);
      const hostKey = parsed.host.toLowerCase();
      const rpId = parsed.hostname.toLowerCase();
      const isLoopback = LOOPBACK_HOSTS.has(rpId);
      if (!isLoopback && parsed.protocol !== 'https:') {
        continue;
      }
      const expectedOrigin = isLoopback
        ? parsed.origin
        : `https://${parsed.host.toLowerCase()}`;
      trustedOriginsMap.set(hostKey, { rpId, expectedOrigin });
    } catch {
      // Ignore malformed origin entries
    }
  }

  const forwardedHostHeader = String(req.get('x-forwarded-host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const hostHeader = String(req.get('host') || '')
    .trim()
    .toLowerCase();

  // Security Audit (#76, #22): If X-Forwarded-Host is supplied, it MUST match a pinned trusted origin or loopback in non-prod
  if (forwardedHostHeader) {
    const forwardedHostname = forwardedHostHeader.split(':')[0] || '';
    const isForwardedLoopback =
      process.env.NODE_ENV !== 'production' &&
      LOOPBACK_HOSTS.has(forwardedHostname);
    const matchedForwarded = trustedOriginsMap.get(forwardedHostHeader);
    if (!matchedForwarded && !isForwardedLoopback) {
      return {
        ok: false,
        error: 'WEBAUTHN_UNTRUSTED_ORIGIN_HOST',
        message: `WebAuthn güvenilir origin ihlali (#22, #76): Gönderilen X-Forwarded-Host ("${forwardedHostHeader}") sabitlenmiş güvenilir HTTPS origin listesinde yer almıyor.`,
      };
    }
  }

  // If ROTACLUB_WEBAUTHN_ORIGIN is explicitly pinned, always enforce it
  if (configuredPrimary) {
    try {
      const parsed = new URL(configuredPrimary);
      const rpId = parsed.hostname.toLowerCase();
      const isLoopback = LOOPBACK_HOSTS.has(rpId);
      const expectedOrigin = isLoopback
        ? parsed.origin
        : `https://${parsed.host.toLowerCase()}`;
      return { ok: true, rpId, expectedOrigin };
    } catch {
      // Fall through to allowlist verification
    }
  }

  const effectiveRawHost = (
    forwardedHostHeader ||
    hostHeader ||
    req.hostname ||
    'localhost'
  )
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/.test(effectiveRawHost)) {
    return {
      ok: false,
      error: 'WEBAUTHN_UNTRUSTED_ORIGIN_HOST',
      message: 'WebAuthn için geçersiz Host başlığı formatı reddedildi (#22).',
    };
  }

  const pinnedMatch = trustedOriginsMap.get(effectiveRawHost);
  if (pinnedMatch) {
    return { ok: true, ...pinnedMatch };
  }

  const candidateRpId = effectiveRawHost.split(':')[0] || 'localhost';
  const isLoopback = LOOPBACK_HOSTS.has(candidateRpId);
  if (isLoopback && process.env.NODE_ENV !== 'production') {
    const forwardedProto = String(req.get('x-forwarded-proto') || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const scheme =
      forwardedProto === 'https' || req.protocol === 'https' ? 'https' : 'http';
    return {
      ok: true,
      rpId: candidateRpId,
      expectedOrigin: `${scheme}://${effectiveRawHost}`,
    };
  }

  return {
    ok: false,
    error: 'WEBAUTHN_UNTRUSTED_ORIGIN_HOST',
    message: `WebAuthn güvenilir origin ihlali (#22, #76): "${effectiveRawHost}" sabitlenmiş güvenilir HTTPS origin listesinde (ROTACLUB_WEBAUTHN_ORIGIN) tanımlı değil.`,
  };
}

/**
 * Strict W3C WebAuthn Trusted HTTPS Origin Verifier (#22, #17):
 * - Rejects crossOrigin: true iframes.
 * - Rejects plaintext http:// origins on all non-loopback domains (only localhost / 127.0.0.1 may use http:// in local dev/CI).
 * - Never trusts the incoming verify request's Host header, blocking Host-header origin spoofing.
 */
function isTrustedWebAuthnOrigin(
  clientOrigin: string | undefined,
  crossOrigin: boolean | undefined,
  storedRpId: string,
  storedExpectedOrigin: string
): boolean {
  if (crossOrigin === true || !clientOrigin || typeof clientOrigin !== 'string') {
    return false;
  }
  let parsedClient: URL;
  let parsedExpected: URL;
  try {
    parsedClient = new URL(clientOrigin);
    parsedExpected = new URL(storedExpectedOrigin);
  } catch {
    return false;
  }

  const normalizedRpId = storedRpId.toLowerCase();
  const isLoopback = LOOPBACK_HOSTS.has(normalizedRpId);

  if (parsedClient.hostname.toLowerCase() !== normalizedRpId) {
    return false;
  }

  if (!isLoopback) {
    if (parsedClient.protocol !== 'https:') {
      return false;
    }
    return (
      parsedClient.origin.toLowerCase() ===
        parsedExpected.origin.toLowerCase() ||
      parsedClient.origin.toLowerCase() === `https://${normalizedRpId}`
    );
  }

  if (parsedClient.protocol !== 'http:' && parsedClient.protocol !== 'https:') {
    return false;
  }
  return parsedClient.port === parsedExpected.port;
}

export function createPilotExpressApp(
  customDbFile?: string,
  options?: {
    trustedWebAuthnRootPems?: string[];
    trustedWebAuthnOrigins?: string[];
    trustProxy?: boolean | number | string;
    clock?: () => Date;
    trustedMessagingProvider?: (params: {
      clubId: string;
      meetingNo: number;
      memberId: string;
      channel: ReminderChannel;
    }) => string | undefined;
  }
) {
  const app = express();
  if (options?.trustProxy !== undefined) {
    app.set('trust proxy', options.trustProxy);
  } else if (process.env.ROTACLUB_TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  } else {
    app.set('trust proxy', false);
  }
  app.use(express.json({ limit: '2mb' }));

  const getServerNow = (): Date =>
    options?.clock ? options.clock() : new Date();

  // Prevent browser/proxy caching of sensitive club & financial API responses
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  const store = new AtomicMultiTenantStore(customDbFile);

  // Single-use WebAuthn challenges with 5-minute TTL (#12, #22)
  const activeChallenges = new Map<
    string,
    {
      challenge: string;
      memberId: string;
      identifier: string;
      clubId: string;
      ceremony: 'webauthn.get' | 'webauthn.create';
      rpId: string;
      expectedOrigin: string;
      expiresAt: number;
    }
  >();

  // Brute-force login rate limiter (#22)
  const loginAttempts = new Map<
    string,
    { failedCount: number; windowStartMs: number }
  >();

  // 1. Public Health & Security Posture Endpoint (#13, #20)
  app.get('/api/pilot/health', (_req, res) => {
    const ledger = store.getAuditLedger('club-galata');
    const chainStatus = verifyAuditChain(ledger, 'club-galata');
    const bootstrapStatus = store.getBootstrapStatus();
    res.json({
      status: 'ok',
      engine: 'RotaClub Hardened Pilot Server v5.3',
      authMode:
        'HMAC-SHA256 Signed Bearer Token + CSPRNG Scrypt Credential + Hardware W3C WebAuthn P-256 Origin & Signature Verification',
      rbacEnforced: true,
      headerSpoofingBlocked: true,
      queryTokenBlocked: true,
      multiTenantIsolation: true,
      clubMembershipEnforced: true,
      atomicCasRevisionMandatory: true,
      serverManagedAccountingLedger: true,
      immutablePaymentRecords: true,
      idempotentAccrualsEnforced: true,
      bootstrapClaimRequired: bootstrapStatus.bootstrapClaimRequired,
      auditChainValid: chainStatus.valid,
      auditHeadHash: chainStatus.headHash,
      auditTotalEntries: chainStatus.totalEntries,
    });
  });

  // Brute-force bootstrap ownership verification rate limiter (#22, #76)
  const bootstrapAttempts = new Map<
    string,
    { failedCount: number; windowStartMs: number }
  >();

  // 1b. One-Time Initial Admin Activation Status (#22, #76)
  app.get('/api/auth/bootstrap-status', (_req, res) => {
    res.json(store.getBootstrapStatus());
  });

  // 1c. One-Time Initial Admin Claim & Activation Endpoint with Ownership Verification (#22, #76)
  // Strictly verifies the one-time CSPRNG bootstrap ownership token in constant time and permanently locks after first use!
  app.post('/api/auth/bootstrap-claim', (req, res) => {
    const rateKey = String(req.ip || 'bootstrap-global');
    const now = Date.now();
    const record = bootstrapAttempts.get(rateKey);
    if (
      record &&
      now - record.windowStartMs < 5 * 60 * 1000 &&
      record.failedCount >= 5
    ) {
      res.status(429).json({
        error: 'TOO_MANY_BOOTSTRAP_ATTEMPTS',
        message:
          'Çok fazla başarısız kurulum sahiplik doğrulama denemesi tespit edildi. Lütfen 5 dakika sonra tekrar deneyin.',
      });
      return;
    }

    const {
      bootstrapToken,
      ownershipToken,
      clubId,
      rotaryId,
      email,
      newAdminPin,
      baskanPin,
      rolePins,
      sekreterPin,
      saymanPin,
      uyePin,
      karakoyBaskanPin,
      mackaBaskanPin,
      districtGovPin,
    } = req.body || {};

    const headerBootstrapToken = req.headers['x-rotaclub-bootstrap-token'];
    const effectiveBootstrapToken =
      bootstrapToken ||
      ownershipToken ||
      (typeof headerBootstrapToken === 'string'
        ? headerBootstrapToken
        : undefined);

    const effectiveAdminPin = newAdminPin || baskanPin;
    if (!effectiveAdminPin) {
      res.status(400).json({
        error: 'MISSING_ADMIN_PIN',
        message:
          'İlk yönetici aktivasyonu için güçlü bir parola/PIN (newAdminPin) zorunludur.',
      });
      return;
    }

    const mergedRolePins: Record<string, string> = {
      ...(rolePins && typeof rolePins === 'object' ? rolePins : {}),
      ...(sekreterPin ? { sekreter: String(sekreterPin) } : {}),
      ...(saymanPin ? { sayman: String(saymanPin) } : {}),
      ...(uyePin ? { uye: String(uyePin) } : {}),
      ...(karakoyBaskanPin ? { karakoyBaskan: String(karakoyBaskanPin) } : {}),
      ...(mackaBaskanPin ? { mackaBaskan: String(mackaBaskanPin) } : {}),
      ...(districtGovPin ? { districtGov: String(districtGovPin) } : {}),
    };

    const claimResult = store.claimInitialAdminBootstrap({
      bootstrapToken: effectiveBootstrapToken
        ? String(effectiveBootstrapToken)
        : undefined,
      clubId: clubId ? String(clubId) : undefined,
      rotaryId: rotaryId ? String(rotaryId) : undefined,
      email: email ? String(email) : undefined,
      newAdminPin: String(effectiveAdminPin),
      rolePins:
        Object.keys(mergedRolePins).length > 0 ? mergedRolePins : undefined,
    });

    if (!claimResult.ok) {
      if (
        claimResult.error === 'INVALID_BOOTSTRAP_OWNERSHIP_TOKEN' ||
        claimResult.error === 'BOOTSTRAP_IDENTITY_MISMATCH' ||
        claimResult.error === 'CROSS_TENANT_BOOTSTRAP_FORBIDDEN'
      ) {
        const prevCount =
          record && now - record.windowStartMs < 5 * 60 * 1000
            ? record.failedCount
            : 0;
        bootstrapAttempts.set(rateKey, {
          failedCount: prevCount + 1,
          windowStartMs: record ? record.windowStartMs : now,
        });
      }
      res.status(claimResult.status).json({
        error: claimResult.error,
        message: claimResult.message,
      });
      return;
    }

    bootstrapAttempts.delete(rateKey);

    const account = claimResult.account;
    const token = issueSignedToken({
      memberId: account.memberId,
      rotaryId: account.rotaryId,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      clubId: account.clubId,
      authMethod: 'pin',
    });
    const verifiedUser = verifySignedToken(token)!;

    store.appendAuditEntry({
      clubId: account.clubId,
      actorName: `${account.fullName} (${account.rotaryId})`,
      actorRole: account.role,
      module: 'Yönetim & Güvenlik',
      action:
        'Tek Kullanımlık İlk Yönetici Aktivasyonu Tamamlandı (Sahiplik Doğrulandı)',
      detail: `${account.fullName} sunucu sahiplik doğrulama anahtarı (bootstrapToken) ve CSPRNG Scrypt ile ilk kurulum yönetici hesabını etkinleştirdi; kurulum uç noktası kalıcı olarak kilitlendi.`,
      timestamp: formatNowTR(),
    });

    res.status(201).json({
      ok: true,
      token,
      user: verifiedUser,
    });
  });

  // 1d. Authenticated President Account PIN Provisioning for Club Officers/Members (#22, #70)
  app.post(
    '/api/auth/admin-provision-pin',
    requireServerRole(['baskan']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const { targetIdentifier, identifier, newPin, clubId } = req.body || {};
      const effectiveTarget = targetIdentifier || identifier;
      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      if (!effectiveTarget || !newPin) {
        res.status(400).json({
          error: 'MISSING_PROVISION_DATA',
          message: 'Hedef kullanıcı (targetIdentifier) ve yeni parola/PIN (newPin) zorunludur.',
        });
        return;
      }

      const targetAcc = findPilotAccount(
        String(effectiveTarget),
        store.getAccounts()
      );
      if (!targetAcc) {
        res.status(404).json({
          error: 'ACCOUNT_NOT_FOUND',
          message: 'Hedef üye hesabı bulunamadı.',
        });
        return;
      }

      const targetMembership = getAccountClubMembership(
        targetAcc,
        authorizedClubId
      );
      if (!targetMembership || targetAcc.clubId !== authorizedClubId) {
        res.status(403).json({
          error: 'CLUB_MEMBERSHIP_FORBIDDEN',
          message: 'Yalnızca kendi kulübünüzdeki üye ve görevlilerin parolasını tanımlayabilirsiniz (#70).',
        });
        return;
      }

      const provisioned = store.adminSetAccountPin(
        targetAcc.memberId,
        String(newPin),
        authorizedClubId,
        user.memberId
      );
      if (!provisioned.ok) {
        res.status(provisioned.status || 400).json({
          error: provisioned.error,
          message: provisioned.message,
        });
        return;
      }

      store.appendAuditEntry({
        clubId: authorizedClubId,
        actorName: `${user.fullName} (${user.rotaryId})`,
        actorRole: user.role,
        module: 'Yönetim & Güvenlik',
        action: `Bireysel Hesap Parolası Güncellendi: ${targetAcc.fullName}`,
        detail: `${targetAcc.fullName} (${targetAcc.rotaryId}) hesabı yeni CSPRNG salt ve Scrypt özetiyle güncellendi.`,
        timestamp: formatNowTR(),
      });

      res.json({
        ok: true,
        rotaryId: targetAcc.rotaryId,
        activated: true,
      });
    }
  );

  // 1e. Issue One-Time Personal Member Invitation Token (#22, #70, #76)
  // President or Secretary issues a scoped, single-use CSPRNG invitation token for a specific member in their club.
  // The officer NEVER sets the member's PIN directly; the member activates their own account via /api/auth/claim-member-invite.
  app.post(
    '/api/auth/issue-member-invite',
    requireServerRole(['baskan', 'sekreter']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const { targetIdentifier, identifier, clubId, expiresInHours } =
        req.body || {};
      const effectiveTarget = targetIdentifier || identifier;
      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      if (!effectiveTarget || typeof effectiveTarget !== 'string') {
        res.status(400).json({
          error: 'MISSING_INVITE_TARGET',
          message:
            'Davet anahtarı üretilecek hedef üye kimliği (targetIdentifier) zorunludur (#76).',
        });
        return;
      }

      const issued = store.issueMemberInvitationToken({
        targetIdentifier: effectiveTarget.trim(),
        actorClubId: authorizedClubId,
        issuedByMemberId: user.memberId,
        nowDate: getServerNow(),
        expiresInHours:
          typeof expiresInHours === 'number' && Number.isFinite(expiresInHours)
            ? expiresInHours
            : undefined,
      });

      if (!issued.ok) {
        res.status(issued.status).json({
          error: issued.error,
          message: issued.message,
        });
        return;
      }

      store.appendAuditEntry({
        clubId: authorizedClubId,
        actorName: `${user.fullName} (${user.rotaryId})`,
        actorRole: user.role,
        module: 'Yönetim & Güvenlik',
        action: `Tek Kullanımlık Bireysel Üye Davet Anahtarı Üretildi: ${issued.fullName} (${issued.rotaryId})`,
        detail: `${issued.fullName} (${issued.email}) için tek kullanımlık bireysel hesap aktivasyon daveti üretildi (Son geçerlilik: ${issued.expiresAtIso}).`,
        timestamp: formatNowTR(),
      });

      res.status(201).json({
        ok: true,
        invitationToken: issued.invitationToken,
        expiresAtIso: issued.expiresAtIso,
        targetAccount: {
          memberId: issued.memberId,
          rotaryId: issued.rotaryId,
          email: issued.email,
          fullName: issued.fullName,
          clubId: issued.clubId,
        },
      });
    }
  );

  // 1f. Claim One-Time Personal Member Invitation & Self-Activate Account (#22, #70, #76)
  // The invited member proves their identity (rotaryId + email) + single-use invitationToken and sets their own strong PIN.
  app.post('/api/auth/claim-member-invite', (req, res) => {
    const {
      invitationToken,
      rotaryId,
      email,
      newPin,
      pinCode,
    } = req.body || {};

    const effectivePin = newPin || pinCode;
    if (!invitationToken || !rotaryId || !email || !effectivePin) {
      res.status(400).json({
        error: 'MISSING_INVITATION_CLAIM_DATA',
        message:
          'Bireysel hesap aktivasyonu için invitationToken, rotaryId, email ve newPin zorunludur (#76).',
      });
      return;
    }

    const claimed = store.claimMemberInvitationToken({
      invitationToken: String(invitationToken),
      rotaryId: String(rotaryId),
      email: String(email),
      newPin: String(effectivePin),
      nowDate: getServerNow(),
    });

    if (!claimed.ok) {
      res.status(claimed.status).json({
        error: claimed.error,
        message: claimed.message,
      });
      return;
    }

    const account = claimed.account;
    const token = issueSignedToken({
      memberId: account.memberId,
      rotaryId: account.rotaryId,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      clubId: account.clubId,
      authMethod: 'pin',
    });
    const verifiedUser = verifySignedToken(token)!;

    store.appendAuditEntry({
      clubId: account.clubId,
      actorName: `${account.fullName} (${account.rotaryId})`,
      actorRole: account.role,
      module: 'Yönetim & Güvenlik',
      action: `Tek Kullanımlık Davet ile Bireysel Üye Hesabı Etkinleştirildi (${account.role.toUpperCase()})`,
      detail: `${account.fullName} (${account.rotaryId}) kendisine özel tek kullanımlık davet anahtarıyla bireysel Scrypt parolasını belirleyerek hesabını etkinleştirdi; davet anahtarı kalıcı olarak tüketildi (#76).`,
      timestamp: formatNowTR(),
    });

    res.status(201).json({
      ok: true,
      activated: true,
      token,
      user: verifiedUser,
    });
  });

  // 2. Real Credential Login Endpoint with Club Membership Check & Brute-Force Protection (#22, #23, #70)
  app.post('/api/auth/login', (req, res) => {
    const { identifier, pinCode, clubId } = req.body || {};
    if (!identifier || !pinCode) {
      res.status(400).json({
        error: 'MISSING_CREDENTIALS',
        message: 'Rotary ID / E-posta ve Kurumsal PIN kodu zorunludur.',
      });
      return;
    }

    const rateKey = String(identifier).trim().toLowerCase();
    const now = Date.now();
    const record = loginAttempts.get(rateKey);
    if (
      record &&
      now - record.windowStartMs < 5 * 60 * 1000 &&
      record.failedCount >= 5
    ) {
      res.status(429).json({
        error: 'TOO_MANY_ATTEMPTS',
        message:
          'Çok fazla başarısız giriş denemesi tespit edildi. Lütfen 5 dakika sonra tekrar deneyin.',
      });
      return;
    }

    const targetClubId =
      typeof clubId === 'string' && clubId.trim() ? clubId.trim() : 'club-galata';
    const authResult = authenticatePilotCredentials(
      String(identifier),
      String(pinCode),
      targetClubId,
      store.getAccounts()
    );

    if (!authResult.ok) {
      if (authResult.reason === 'UNKNOWN_CLUB_TENANT') {
        res.status(404).json({
          error: 'UNKNOWN_CLUB_TENANT',
          message: `Tanımsız kulüp kimliği: "${targetClubId}".`,
        });
        return;
      }
      if (authResult.reason === 'ACCOUNT_ACTIVATION_REQUIRED') {
        res.status(403).json({
          error: 'ACCOUNT_ACTIVATION_REQUIRED',
          message:
            'Bu hesap henüz etkinleştirilmemiş. Lütfen Tek Kullanımlık İlk Yönetici Aktivasyonu (/api/auth/bootstrap-claim) veya Kulüp Başkanı üzerinden hesap aktivasyonunu tamamlayın.',
        });
        return;
      }
      if (authResult.reason === 'CLUB_MEMBERSHIP_FORBIDDEN') {
        res.status(403).json({
          error: 'CLUB_MEMBERSHIP_FORBIDDEN',
          message: `Kulüp üyelik yetkisi reddedildi (#70): Bu hesabın "${targetClubId}" kulübünde aktif üyelik kaydı bulunmamaktadır.`,
        });
        return;
      }

      const prevCount =
        record && now - record.windowStartMs < 5 * 60 * 1000
          ? record.failedCount
          : 0;
      loginAttempts.set(rateKey, {
        failedCount: prevCount + 1,
        windowStartMs: record ? record.windowStartMs : now,
      });
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Rotary ID veya Kurumsal PIN kodu hatalı.',
      });
      return;
    }

    loginAttempts.delete(rateKey);

    store.appendAuditEntry({
      clubId: targetClubId,
      actorName: `${authResult.user.fullName} (${authResult.user.rotaryId})`,
      actorRole: authResult.user.role,
      module: 'Yönetim & Güvenlik',
      action: `Sunucu Oturumu Açıldı (${authResult.user.role.toUpperCase()})`,
      detail: `${authResult.user.fullName} kriptografik Scrypt PIN doğrulaması ile ${targetClubId} oturumu başlattı.`,
      timestamp: formatNowTR(),
    });

    res.json({
      ok: true,
      token: authResult.token,
      user: authResult.user,
    });
  });

  // 2b. Secure Server-Side Member Account Registration Endpoint (#22, #70)
  // Strictly requires 'baskan' or 'sekreter' role and enforces strong PIN/password rules and CSPRNG salt.
  app.post(
    '/api/auth/register-member-account',
    requireServerRole(['baskan', 'sekreter']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const {
        memberId,
        rotaryId,
        fullName,
        email,
        role,
        clubId,
        initialPinOrPassword,
      } = req.body || {};

      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      if (
        !memberId ||
        !rotaryId ||
        !fullName ||
        !email ||
        !initialPinOrPassword
      ) {
        res.status(400).json({
          error: 'MISSING_ACCOUNT_FIELDS',
          message:
            'Yeni üye hesabı oluşturmak için memberId, rotaryId, fullName, email ve initialPinOrPassword zorunludur.',
        });
        return;
      }

      const assignedRole: ClubRole =
        role === 'sekreter' || role === 'sayman' || role === 'baskan'
          ? role
          : 'uye';
      if (assignedRole !== 'uye' && user.role !== 'baskan') {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message:
            'Yönetim Kurulu rolüne sahip hesaplar yalnızca Dönem Başkanı tarafından tanımlanabilir.',
        });
        return;
      }

      const created = store.provisionNewMemberAccount({
        memberId: String(memberId).trim(),
        rotaryId: String(rotaryId).trim(),
        fullName: String(fullName).trim(),
        email: String(email).trim(),
        role: assignedRole,
        clubId: authorizedClubId,
        initialPinOrPassword: String(initialPinOrPassword),
      });

      if (!created.ok) {
        const status = created.error === 'ACCOUNT_ALREADY_EXISTS' ? 409 : 400;
        res.status(status).json({
          error: created.error,
          message: created.message,
        });
        return;
      }

      store.appendAuditEntry({
        clubId: authorizedClubId,
        actorName: `${user.fullName} (${user.rotaryId})`,
        actorRole: user.role,
        module: 'Yönetim & Güvenlik',
        action: `Yeni Üye Hesabı Oluşturuldu: ${created.account.fullName} (${created.account.rotaryId})`,
        detail: `${created.account.fullName} için CSPRNG salt ve Scrypt özetli güvenli sunucu hesabı (${assignedRole}) tanımlandı.`,
        timestamp: formatNowTR(),
      });

      res.status(201).json({
        ok: true,
        account: {
          memberId: created.account.memberId,
          rotaryId: created.account.rotaryId,
          fullName: created.account.fullName,
          email: created.account.email,
          role: created.account.role,
          clubId: created.account.clubId,
        },
      });
    }
  );

  // 3a. Authenticated WebAuthn Passkey Registration Options (#12, #22, #76)
  // Requires an authenticated session so an unauthenticated caller can NEVER register a passkey on someone else's account!
  app.post(
    '/api/auth/webauthn-register-options',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const account = findPilotAccount(user.memberId, store.getAccounts());
      if (!account) {
        res.status(404).json({
          error: 'ACCOUNT_NOT_FOUND',
          message: 'Oturumla ilişkili üye hesabı bulunamadı.',
        });
        return;
      }

      const originResolution = resolveTrustedWebAuthnRpAndOrigin(
        req,
        options?.trustedWebAuthnOrigins
      );
      if (!originResolution.ok) {
        res.status(403).json({
          error: originResolution.error,
          message: originResolution.message,
        });
        return;
      }
      const { rpId, expectedOrigin } = originResolution;
      const challenge = crypto.randomBytes(32).toString('base64url');
      const challengeId = crypto.randomUUID();

      activeChallenges.set(challengeId, {
        challenge,
        memberId: account.memberId,
        identifier: account.rotaryId,
        clubId: user.clubId,
        ceremony: 'webauthn.create',
        rpId,
        expectedOrigin,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      res.json({
        challengeId,
        challenge,
        rpId,
        expectedOrigin,
        rp: { name: 'RotaClub UR 2420. Bölge', id: rpId },
        user: {
          id: Buffer.from(account.memberId, 'utf8').toString('base64url'),
          name: account.email,
          displayName: account.fullName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256 (ECDSA P-256 with SHA-256)
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'required',
        },
        excludeCredentials: (account.webauthnCredentials || []).map((c) => ({
          id: c.credentialId,
          type: 'public-key' as const,
        })),
        timeout: 60000,
        attestation: 'direct',
      });
    }
  );

  // 3b. Authenticated WebAuthn Passkey Registration Verification (#12, #22, #76)
  // Requires an authenticated session matching the challenge's memberId, strict HTTPS origin check,
  // and full W3C CBOR attestationObject + X.509 Hardware PKI Trust Chain + Attested Credential Data verification.
  app.post(
    '/api/auth/webauthn-register-verify',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const {
        challengeId,
        credentialId,
        clientDataJSON,
        attestationObject,
        authenticatorData,
        publicKeySpkiB64,
        authenticatorAttachment,
      } = req.body || {};
      if (!challengeId || !credentialId || !clientDataJSON) {
        res.status(400).json({
          error: 'MISSING_WEBAUTHN_REGISTRATION_DATA',
          message:
            'WebAuthn donanım kayıt doğrulaması için challengeId, credentialId, clientDataJSON ve CBOR attestationObject zorunludur.',
        });
        return;
      }

      const stored = activeChallenges.get(String(challengeId));
      activeChallenges.delete(String(challengeId));

      if (
        !stored ||
        stored.ceremony !== 'webauthn.create' ||
        stored.expiresAt < Date.now() ||
        stored.memberId !== user.memberId
      ) {
        res.status(401).json({
          error: 'INVALID_OR_EXPIRED_CHALLENGE',
          message:
            'WebAuthn kayıt challenge anahtarı geçersiz, süresi dolmuş veya oturum sahibiyle eşleşmiyor.',
        });
        return;
      }

      let parsedClientData: {
        type?: string;
        challenge?: string;
        origin?: string;
        crossOrigin?: boolean;
      };
      try {
        const jsonStr = Buffer.from(
          String(clientDataJSON),
          'base64url'
        ).toString('utf8');
        parsedClientData = JSON.parse(jsonStr);
      } catch {
        res.status(400).json({
          error: 'INVALID_CLIENT_DATA_JSON',
          message: 'clientDataJSON çözümlenemedi.',
        });
        return;
      }

      if (
        parsedClientData.type !== 'webauthn.create' ||
        parsedClientData.challenge !== stored.challenge
      ) {
        res.status(401).json({
          error: 'WEBAUTHN_CHALLENGE_MISMATCH',
          message:
            'WebAuthn clientDataJSON challenge veya ceremony tipi sunucu kaydıyla eşleşmiyor.',
        });
        return;
      }

      if (
        !isTrustedWebAuthnOrigin(
          parsedClientData.origin,
          parsedClientData.crossOrigin,
          stored.rpId,
          stored.expectedOrigin
        )
      ) {
        res.status(401).json({
          error: 'WEBAUTHN_ORIGIN_MISMATCH',
          message: `WebAuthn güvenilir HTTPS origin doğrulaması reddedildi (#22): "${parsedClientData.origin}" beklenen sunucu origin değeri (${stored.expectedOrigin}) ile eşleşmiyor.`,
        });
        return;
      }

      const verifiedReg = verifyAndExtractWebAuthnRegistration({
        attestationObjectB64Url:
          typeof attestationObject === 'string' ? attestationObject : undefined,
        clientDataJSONB64Url: String(clientDataJSON),
        credentialIdB64Url: String(credentialId),
        expectedRpId: stored.rpId,
        authenticatorDataB64Url:
          typeof authenticatorData === 'string' ? authenticatorData : undefined,
        publicKeySpkiB64Url:
          typeof publicKeySpkiB64 === 'string' ? publicKeySpkiB64 : undefined,
        authenticatorAttachment:
          typeof authenticatorAttachment === 'string'
            ? authenticatorAttachment
            : undefined,
        trustedRootPems: options?.trustedWebAuthnRootPems,
      });

      if (!verifiedReg.ok) {
        res.status(verifiedReg.status).json({
          error: verifiedReg.error,
          message: verifiedReg.message,
        });
        return;
      }

      const account = store.registerWebAuthnCredential(user.memberId, {
        credentialId: String(credentialId),
        publicKeySpkiB64: verifiedReg.publicKeySpkiB64,
        signCount: verifiedReg.signCount,
        registeredAt: new Date().toISOString(),
        rpId: stored.rpId,
        aaguid: verifiedReg.aaguidHex,
        attestationFmt: verifiedReg.fmt,
      });

      if (!account) {
        res.status(404).json({
          error: 'ACCOUNT_NOT_FOUND',
          message: 'WebAuthn kaydı yapılacak üye hesabı bulunamadı.',
        });
        return;
      }

      store.appendAuditEntry({
        clubId: user.clubId,
        actorName: `${account.fullName} (${account.rotaryId})`,
        actorRole: user.role,
        module: 'Yönetim & Güvenlik',
        action: 'Donanım WebAuthn ECDSA P-256 Passkey Açık Anahtarı Kaydedildi',
        detail: `${account.fullName} için CBOR Attestation (${verifiedReg.fmt}, AAGUID: ${verifiedReg.aaguidHex.slice(
          0,
          8
        )}...) ve COSE_Key P-256 doğrulamalı Passkey (${String(
          credentialId
        ).slice(0, 14)}...) kaydedildi.`,
        timestamp: formatNowTR(),
      });

      res.json({
        ok: true,
        credentialId: String(credentialId),
        aaguid: verifiedReg.aaguidHex,
        fmt: verifiedReg.fmt,
      });
    }
  );

  // 3c. WebAuthn Passkey Assertion Challenge Generator (#12, #22, #70)
  app.post('/api/auth/webauthn-challenge', (req, res) => {
    const { identifier, clubId } = req.body || {};
    if (!identifier) {
      res.status(400).json({
        error: 'MISSING_IDENTIFIER',
        message: 'WebAuthn challenge için kullanıcı Rotary ID veya e-posta zorunludur.',
      });
      return;
    }

    const targetClubId =
      typeof clubId === 'string' && clubId.trim() ? clubId.trim() : 'club-galata';
    if (!isAllowedTenantClubId(targetClubId)) {
      res.status(404).json({
        error: 'UNKNOWN_CLUB_TENANT',
        message: `Tanımsız kulüp kimliği: "${targetClubId}".`,
      });
      return;
    }

    const account = findPilotAccount(String(identifier), store.getAccounts());
    if (!account) {
      res.status(404).json({
        error: 'ACCOUNT_NOT_FOUND',
        message: 'Belirtilen kullanıcı hesabı bulunamadı.',
      });
      return;
    }

    const membership = getAccountClubMembership(account, targetClubId);
    if (!membership) {
      res.status(403).json({
        error: 'CLUB_MEMBERSHIP_FORBIDDEN',
        message: `Bu hesabın "${targetClubId}" kulübünde aktif üyelik kaydı bulunmamaktadır.`,
      });
      return;
    }

    const originResolution = resolveTrustedWebAuthnRpAndOrigin(
      req,
      options?.trustedWebAuthnOrigins
    );
    if (!originResolution.ok) {
      res.status(403).json({
        error: originResolution.error,
        message: originResolution.message,
      });
      return;
    }
    const { rpId, expectedOrigin } = originResolution;
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeId = crypto.randomUUID();

    activeChallenges.set(challengeId, {
      challenge,
      memberId: account.memberId,
      identifier: account.rotaryId,
      clubId: targetClubId,
      ceremony: 'webauthn.get',
      rpId,
      expectedOrigin,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({
      challengeId,
      challenge,
      rpId,
      expectedOrigin,
      userIdentifier: account.rotaryId,
      allowCredentials: account.webauthnCredentials.map((c) => ({
        type: 'public-key',
        id: c.credentialId,
      })),
    });
  });

  // 3d. Full Cryptographic WebAuthn Passkey Assertion Verification (#12, #22, #70)
  app.post('/api/auth/webauthn-verify', (req, res) => {
    const {
      challengeId,
      credentialId,
      clientDataJSON,
      authenticatorData,
      signature,
    } = req.body || {};

    if (
      !challengeId ||
      !credentialId ||
      !clientDataJSON ||
      !authenticatorData ||
      !signature
    ) {
      res.status(400).json({
        error: 'MISSING_WEBAUTHN_ASSERTION',
        message:
          'WebAuthn doğrulaması için challengeId, credentialId, clientDataJSON, authenticatorData ve signature zorunludur.',
      });
      return;
    }

    const stored = activeChallenges.get(String(challengeId));
    // Single-use consumption prevents replay attacks
    activeChallenges.delete(String(challengeId));

    if (
      !stored ||
      stored.ceremony !== 'webauthn.get' ||
      stored.expiresAt < Date.now()
    ) {
      res.status(401).json({
        error: 'INVALID_OR_EXPIRED_CHALLENGE',
        message:
          'WebAuthn challenge geçersiz, süresi dolmuş veya daha önce kullanılmış.',
      });
      return;
    }

    let parsedClientData: {
      type?: string;
      challenge?: string;
      origin?: string;
      crossOrigin?: boolean;
    };
    const rawClientDataBytes = Buffer.from(String(clientDataJSON), 'base64url');
    try {
      parsedClientData = JSON.parse(rawClientDataBytes.toString('utf8'));
    } catch {
      res.status(400).json({
        error: 'INVALID_CLIENT_DATA_JSON',
        message: 'WebAuthn clientDataJSON geçerli bir Base64URL JSON değil.',
      });
      return;
    }

    if (
      parsedClientData.type !== 'webauthn.get' ||
      parsedClientData.challenge !== stored.challenge
    ) {
      res.status(401).json({
        error: 'WEBAUTHN_ASSERTION_MISMATCH',
        message:
          'WebAuthn clientDataJSON challenge veya ceremony tipi doğrulanamadı.',
      });
      return;
    }

    if (
      !isTrustedWebAuthnOrigin(
        parsedClientData.origin,
        parsedClientData.crossOrigin,
        stored.rpId,
        stored.expectedOrigin
      )
    ) {
      res.status(401).json({
        error: 'WEBAUTHN_ORIGIN_MISMATCH',
        message: `WebAuthn güvenilir HTTPS origin doğrulaması reddedildi (#22): "${parsedClientData.origin}" sunucu origin değeri (${stored.expectedOrigin}) ile eşleşmiyor.`,
      });
      return;
    }

    const authDataBuf = Buffer.from(String(authenticatorData), 'base64url');
    // Authenticator data must be at least 37 bytes (32-byte rpIdHash + 1-byte flags + 4-byte signCount)
    if (authDataBuf.length < 37) {
      res.status(401).json({
        error: 'INVALID_AUTHENTICATOR_DATA',
        message: 'WebAuthn authenticatorData en az 37 byte olmalıdır.',
      });
      return;
    }

    // Verify rpIdHash (first 32 bytes of authenticatorData == SHA-256(rpId))
    const expectedRpIdHash = crypto
      .createHash('sha256')
      .update(stored.rpId, 'utf8')
      .digest();
    const providedRpIdHash = authDataBuf.subarray(0, 32);
    if (!crypto.timingSafeEqual(expectedRpIdHash, providedRpIdHash)) {
      res.status(401).json({
        error: 'INVALID_RP_ID_HASH',
        message: 'WebAuthn authenticatorData rpIdHash değeri sunucu rpId özetiyle eşleşmiyor.',
      });
      return;
    }

    // Verify User Present (0x01) and User Verified (0x04) flags
    const flags = authDataBuf[32];
    if ((flags & 0x01) === 0 || (flags & 0x04) === 0) {
      res.status(401).json({
        error: 'USER_VERIFICATION_REQUIRED',
        message:
          'WebAuthn authenticatorData User Present (UP) ve User Verified (UV) bayrakları zorunludur.',
      });
      return;
    }

    const incomingSignCount = authDataBuf.readUInt32BE(33);

    const account = findPilotAccount(stored.memberId, store.getAccounts());
    if (!account) {
      res.status(404).json({
        error: 'ACCOUNT_NOT_FOUND',
        message: 'WebAuthn ile ilişkili hesap bulunamadı.',
      });
      return;
    }

    const membership = getAccountClubMembership(account, stored.clubId);
    if (!membership) {
      res.status(403).json({
        error: 'CLUB_MEMBERSHIP_FORBIDDEN',
        message: `Bu hesabın "${stored.clubId}" kulübünde aktif üyeliği bulunmamaktadır.`,
      });
      return;
    }

    const registeredCred = account.webauthnCredentials.find(
      (c) => c.credentialId === String(credentialId)
    );
    if (!registeredCred || !registeredCred.publicKeySpkiB64) {
      res.status(401).json({
        error: 'UNKNOWN_CREDENTIAL_ID',
        message:
          'Sunulan WebAuthn Passkey bu kullanıcı hesabına kayıtlı değil veya açık anahtarı bulunamadı.',
      });
      return;
    }

    // Enforce monotonic signCount to detect cloned authenticators
    if (incomingSignCount <= registeredCred.signCount) {
      res.status(401).json({
        error: 'CLONED_AUTHENTICATOR_DETECTED',
        message: `WebAuthn imza sayacı (signCount: ${incomingSignCount}) önceki sayaçtan (${registeredCred.signCount}) büyük olmalıdır.`,
      });
      return;
    }

    // MANDATORY Cryptographic ECDSA P-256 Signature Verification over authenticatorData || SHA-256(clientDataJSON)
    try {
      const clientDataHash = crypto
        .createHash('sha256')
        .update(rawClientDataBytes)
        .digest();
      const signedBytes = Buffer.concat([authDataBuf, clientDataHash]);
      const pubKeyObj = crypto.createPublicKey({
        key: Buffer.from(registeredCred.publicKeySpkiB64, 'base64url'),
        format: 'der',
        type: 'spki',
      });
      const rawSigBuf = Buffer.from(String(signature), 'base64url');
      const derSigBuf = ensureDerEcdsaSignature(rawSigBuf);
      const sigValid = crypto.verify(
        'sha256',
        signedBytes,
        pubKeyObj,
        derSigBuf
      );
      if (!sigValid) {
        res.status(401).json({
          error: 'INVALID_WEBAUTHN_SIGNATURE',
          message: 'WebAuthn ECDSA P-256 kriptografik imza doğrulaması başarısız oldu.',
        });
        return;
      }
    } catch {
      res.status(401).json({
        error: 'INVALID_WEBAUTHN_SIGNATURE',
        message: 'WebAuthn açık anahtar imza doğrulaması başarısız oldu.',
      });
      return;
    }

    store.updateWebAuthnSignCount(
      account.memberId,
      registeredCred.credentialId,
      incomingSignCount
    );

    const token = issueSignedToken({
      memberId: account.memberId,
      rotaryId: account.rotaryId,
      fullName: account.fullName,
      email: account.email,
      role: membership.role,
      clubId: membership.clubId,
      authMethod: 'webauthn',
    });
    const verifiedUser = verifySignedToken(token)!;

    store.appendAuditEntry({
      clubId: membership.clubId,
      actorName: `${account.fullName} (${account.rotaryId})`,
      actorRole: membership.role,
      module: 'Yönetim & Güvenlik',
      action: `WebAuthn Passkey Oturumu Doğrulandı (${membership.role.toUpperCase()})`,
      detail: `${account.fullName} ECDSA P-256 imzalı WebAuthn assertion (signCount #${incomingSignCount}) ile ${membership.clubId} oturumu açtı.`,
      timestamp: formatNowTR(),
    });

    res.json({
      ok: true,
      token,
      user: verifiedUser,
    });
  });

  // 4a. Verify Current Session Token
  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({
      authenticated: true,
      user: req.authUser,
    });
  });

  // 4b. Revoke Session Token / Logout (#22)
  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    store.revokeToken(user.jti);
    store.appendAuditEntry({
      clubId: user.clubId,
      actorName: `${user.fullName} (${user.rotaryId})`,
      actorRole: user.role,
      module: 'Yönetim & Güvenlik',
      action: 'Sunucu Oturumu Sonlandırıldı (Token JTI İptal Edildi)',
      detail: `${user.fullName} oturum anahtarı (${user.jti.slice(0, 8)}...) sunucu iptal listesine alındı.`,
      timestamp: formatNowTR(),
    });
    res.json({ ok: true, revokedJti: user.jti });
  });

  // 4c. Change Account PIN with Complexity Validation (#22)
  app.post(
    '/api/auth/change-pin',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const { currentPin, newPin } = req.body || {};
      if (!currentPin || !newPin) {
        res.status(400).json({
          error: 'INVALID_PIN_FORMAT',
          message: 'Mevcut PIN ve yeni PIN kodu zorunludur.',
        });
        return;
      }
      const result = store.changeAccountPin(
        user.memberId,
        String(currentPin),
        String(newPin)
      );
      if (!result.ok) {
        const status = result.reason === 'WEAK_PIN_REJECTED' ? 400 : 401;
        res.status(status).json({
          error: result.reason,
          message: result.message,
        });
        return;
      }
      store.appendAuditEntry({
        clubId: user.clubId,
        actorName: `${user.fullName} (${user.rotaryId})`,
        actorRole: user.role,
        module: 'Yönetim & Güvenlik',
        action: 'Kurumsal PIN Şifresi & Kriptografik Salt Yenilendi',
        detail: `${user.fullName} hesap PIN kodunu ve benzersiz Scrypt salt değerini güncelledi.`,
        timestamp: formatNowTR(),
      });
      res.json({ ok: true });
    }
  );

  // 4d. Explicit Multi-Tenant Club Switcher with Club Membership Verification (#70)
  app.post(
    '/api/auth/switch-club',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const { targetClubId } = req.body || {};
      if (!targetClubId || typeof targetClubId !== 'string') {
        res.status(400).json({
          error: 'MISSING_CLUB_ID',
          message: 'Geçiş yapılacak kulüp kimliği (targetClubId) zorunludur.',
        });
        return;
      }
      const cleanClubId = targetClubId.trim();
      if (!isAllowedTenantClubId(cleanClubId)) {
        res.status(404).json({
          error: 'UNKNOWN_CLUB_TENANT',
          message: `Tanımsız kulüp kimliği: "${cleanClubId}".`,
        });
        return;
      }

      const account = findPilotAccount(user.memberId, store.getAccounts());
      const membership = account
        ? getAccountClubMembership(account, cleanClubId)
        : null;
      if (!membership) {
        res.status(403).json({
          error: 'CLUB_MEMBERSHIP_FORBIDDEN',
          message: `Kulüpler arası yetkisiz geçiş engellendi (#70): "${user.fullName}" hesabının "${cleanClubId}" kulübünde aktif üyelik veya yönetim yetkisi bulunmamaktadır.`,
        });
        return;
      }

      // Revoke previous club-scoped token so only the new tenant token is active
      store.revokeToken(user.jti);

      const nextToken = issueSignedToken({
        memberId: user.memberId,
        rotaryId: user.rotaryId,
        fullName: user.fullName,
        email: user.email,
        role: membership.role,
        clubId: membership.clubId,
        authMethod: user.authMethod || 'pin',
      });
      const verifiedUser = verifySignedToken(nextToken)!;

      store.appendAuditEntry({
        clubId: membership.clubId,
        actorName: `${user.fullName} (${user.rotaryId})`,
        actorRole: membership.role,
        module: 'Yönetim & Güvenlik',
        action: `Kulüp Oturumu Değiştirildi (${membership.clubId} · Rol: ${membership.role.toUpperCase()})`,
        detail: `${user.fullName} doğrulanmış kulüp üyeliği ile oturum kapsamını "${user.clubId}" kulübünden "${membership.clubId}" kulübüne (${membership.role}) taşıdı.`,
        timestamp: formatNowTR(),
      });

      res.json({
        ok: true,
        token: nextToken,
        user: verifiedUser,
      });
    }
  );

  // 5. Protected Shared Club State with Strict Tenant Boundary & KVKK Redaction (#12, #16, #20, #70)
  app.get('/api/pilot/state', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const requestedClubId =
        typeof req.query.clubId === 'string' ? req.query.clubId.trim() : undefined;
      const authorizedClubId = verifyTenantBoundary(
        user,
        requestedClubId,
        store,
        res
      );
      if (!authorizedClubId) return;

      const tenant = store.getTenantState(authorizedClubId);
      const ledger = store.getAuditLedger(authorizedClubId);
      const redacted = redactStateForRole(tenant, ledger, user);
      res.json(redacted);
    } catch (err) {
      res.status(500).json({
        error: 'STORAGE_READ_ERROR',
        message:
          err instanceof Error ? err.message : 'Veritabanı okuma hatası',
      });
    }
  });

  // 6. Verify SHA-256 Audit Hash Chain Integrity (#18, #70)
  app.get(
    '/api/pilot/audit-verify',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const requestedClubId =
        typeof req.query.clubId === 'string' ? req.query.clubId.trim() : undefined;
      const authorizedClubId = verifyTenantBoundary(
        user,
        requestedClubId,
        store,
        res
      );
      if (!authorizedClubId) return;

      const ledger = store.getAuditLedger(authorizedClubId);
      const verification = verifyAuditChain(ledger, authorizedClubId);
      res.json(verification);
    }
  );

  // 6b. Relational & Transactional Database Integrity Health Check (#13, #14, #18, #19)
  app.get(
    '/api/pilot/db-health',
    requireServerRole(['sekreter', 'sayman', 'baskan']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const requestedClubId =
        typeof req.query.clubId === 'string' ? req.query.clubId.trim() : undefined;
      const authorizedClubId = verifyTenantBoundary(
        user,
        requestedClubId,
        store,
        res
      );
      if (!authorizedClubId) return;

      const tenant = store.getTenantState(authorizedClubId);
      const integrity = verifyTransactionalIntegrity(tenant);
      res.status(integrity.healthy ? 200 : 500).json({
        ok: integrity.healthy,
        ...integrity,
        relationalSchema: POSTGRESQL_RELATIONAL_SCHEMA_V5_4,
      });
    }
  );

  // 6c. Per-Meeting LCV & Real Term Attendance Metrics Endpoint (#27, #28, #34)
  app.get(
    '/api/pilot/attendance-metrics',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const requestedClubId =
        typeof req.query.clubId === 'string' ? req.query.clubId.trim() : undefined;
      const authorizedClubId = verifyTenantBoundary(
        user,
        requestedClubId,
        store,
        res
      );
      if (!authorizedClubId) return;

      const tenant = store.getTenantState(authorizedClubId);
      const parsedMeetingNo = Number(req.query.meetingNo);
      const targetMeetingNo =
        Number.isInteger(parsedMeetingNo) && parsedMeetingNo > 0
          ? parsedMeetingNo
          : tenant.selectedMeetingNo || 1842;

      const meetingKuverSummary = calculateMeetingKuverSummary(
        tenant.members,
        targetMeetingNo,
        tenant.selectedMeetingNo
      );

      const policyOverride: Partial<ClubAttendancePolicy> = {};
      if (
        typeof req.query.policyVersion === 'string' &&
        req.query.policyVersion.trim()
      ) {
        policyOverride.policyVersion = req.query.policyVersion.trim();
      }
      if (
        typeof req.query.termStartDate === 'string' &&
        req.query.termStartDate.trim()
      ) {
        policyOverride.termStartDate = req.query.termStartDate.trim();
      }
      if (
        typeof req.query.termEndDate === 'string' &&
        req.query.termEndDate.trim()
      ) {
        policyOverride.termEndDate = req.query.termEndDate.trim();
      }
      if (req.query.minimumAttendancePercent !== undefined) {
        const parsedMin = Number(req.query.minimumAttendancePercent);
        if (Number.isFinite(parsedMin) && parsedMin > 0 && parsedMin <= 100) {
          policyOverride.minimumAttendancePercent = parsedMin;
        }
      }
      if (req.query.maxMakeupsPerTerm !== undefined) {
        const parsedCap = Number(req.query.maxMakeupsPerTerm);
        if (Number.isInteger(parsedCap) && parsedCap >= 0) {
          policyOverride.maxMakeupsPerTerm = parsedCap;
        }
      }

      const effectivePolicy: ClubAttendancePolicy = {
        ...DEFAULT_CLUB_ATTENDANCE_POLICY,
        ...policyOverride,
      };
      const evaluationDateParam =
        typeof req.query.evaluationDate === 'string' &&
        req.query.evaluationDate.trim()
          ? req.query.evaluationDate.trim()
          : getServerNow().toISOString();

      const memberMetrics = tenant.members.map((m) =>
        calculateTermAttendanceMetrics({
          member: m,
          meetings: tenant.meetings,
          meetingAttendances: tenant.meetingAttendances || {},
          makeupSubmissions: tenant.makeupSubmissions || [],
          allMembers: tenant.members,
          policy: effectivePolicy,
          evaluationDate: evaluationDateParam,
        })
      );

      res.json({
        ok: true,
        clubId: authorizedClubId,
        meetingNo: targetMeetingNo,
        policy: effectivePolicy,
        policyApplied: effectivePolicy,
        meetingKuverSummary,
        memberMetrics,
      });
    }
  );

  // 6d-0. Narrow Server-Verified Board Debt Waiver Resolution Proposal Command (#24, #26, #39)
  // A single officer ('sayman' or 'baskan') CANNOT unilaterally mint an 'Oybirliği ile Kabul' & 'Onaylandı' waiver.
  // Calling this endpoint creates a 'Taslak' (Draft) resolution with only the proposer's vote recorded.
  // Independent quorum approval via POST /api/pilot/board-debt-waiver-vote is required before the resolution becomes 'Onaylandı'.
  app.post(
    '/api/pilot/board-debt-waiver-resolution',
    requireServerRole(['sayman', 'baskan']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const {
        clubId,
        targetMemberId,
        decisionNo,
        resolutionNo,
        boardMeetingNo,
        boardMeetingDate,
        quorumRequiredCount,
        title,
        waivedAmountTL,
        reason,
        summary,
        expiresAtIso,
        expiresInHours,
        boardVotes,
        approvalStatus,
        voteStatus,
      } = req.body || {};

      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      // Reject attempts by a single caller to inject pre-forged boardVotes or force immediate 'Onaylandı' / 'Oybirliği ile Kabul'
      if (
        Array.isArray(boardVotes) &&
        boardVotes.some(
          (v: { memberId?: string }) =>
            !v || typeof v.memberId !== 'string' || v.memberId !== user.memberId
        )
      ) {
        res.status(422).json({
          error: 'FORGED_BOARD_VOTES_REJECTED',
          message:
            'YK oylama bütünlüğü ihlali (#24, #39): Tek bir yönetici isteğiyle başka YK üyeleri adına toplu oy (boardVotes) gönderilemez; her YK yetkilisi kendi oturumuyla oy kullanmalıdır.',
        });
        return;
      }

      if (
        approvalStatus === 'Onaylandı' ||
        voteStatus === 'Oybirliği ile Kabul' ||
        voteStatus === 'Oyçokluğu ile Kabul'
      ) {
        res.status(422).json({
          error: 'SINGLE_OFFICER_AUTO_APPROVAL_FORBIDDEN',
          message:
            'YK nisap ve oylama zorunluluğu (#24, #39): Tek bir yöneticinin isteği kendiliğinden "Oybirliği ile Kabul" veya "Onaylandı" olarak kaydedilemez; karar taslak açılır ve ikinci yetkili onayı gerekir.',
        });
        return;
      }

      const cleanMemberId =
        typeof targetMemberId === 'string' ? targetMemberId.trim() : '';
      const rawDecisionNo =
        typeof decisionNo === 'string' && decisionNo.trim()
          ? decisionNo.trim()
          : typeof resolutionNo === 'string' && resolutionNo.trim()
          ? resolutionNo.trim()
          : typeof title === 'string' && title.trim()
          ? `YK-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
          : '';
      const cleanDecisionNo = rawDecisionNo.trim();
      const cleanReason =
        typeof reason === 'string' && reason.trim()
          ? reason.trim()
          : typeof summary === 'string' && summary.trim()
          ? summary.trim()
          : typeof title === 'string' && title.trim()
          ? title.trim()
          : '';
      const numWaived = Number(waivedAmountTL);

      if (!cleanMemberId || !cleanDecisionNo || cleanDecisionNo.length < 4) {
        res.status(422).json({
          error: 'INVALID_BOARD_RESOLUTION_DATA',
          message:
            'YK borç feragat kararı için geçerli targetMemberId ve en az 4 karakterlik karar numarası (decisionNo) zorunludur (#24, #26).',
        });
        return;
      }

      if (!Number.isFinite(numWaived) || numWaived <= 0) {
        res.status(422).json({
          error: 'INVALID_WAIVED_AMOUNT',
          message:
            'YK borç feragat tutarı (waivedAmountTL) 0’dan büyük geçerli bir sayı olmalıdır (#24, #26).',
        });
        return;
      }

      if (cleanReason.length < 6) {
        res.status(422).json({
          error: 'REASON_REQUIRED',
          message:
            'YK borç feragat kararı için en az 6 karakterlik resmi gerekçe (reason/title) zorunludur (#24, #26).',
        });
        return;
      }

      const cleanBoardMeetingNo =
        typeof boardMeetingNo === 'string' && boardMeetingNo.trim()
          ? boardMeetingNo.trim()
          : typeof boardMeetingNo === 'number' && Number.isFinite(boardMeetingNo)
          ? `YK-TOP-${boardMeetingNo}`
          : undefined;

      if (
        boardMeetingNo !== undefined &&
        (!cleanBoardMeetingNo || cleanBoardMeetingNo.length < 3)
      ) {
        res.status(422).json({
          error: 'INVALID_BOARD_MEETING_METADATA',
          message:
            'YK toplantı numarası (boardMeetingNo) en az 3 karakter olmalıdır (#24, #39).',
        });
        return;
      }

      const tenant = store.getTenantState(authorizedClubId);
      const targetMember = tenant.members.find((m) => m.id === cleanMemberId);
      if (!targetMember) {
        res.status(404).json({
          error: 'MEMBER_NOT_FOUND',
          message: `Üye bulunamadı (#24, #26): "${cleanMemberId}" kimliğine sahip üye "${authorizedClubId}" kulüp listesinde yer almıyor.`,
        });
        return;
      }

      const duplicateDecision = (tenant.boardResolutions || []).some(
        (r) =>
          normalizeBankRef(r.decisionNo || r.resolutionNo || '') ===
            normalizeBankRef(cleanDecisionNo) ||
          normalizeBankRef(r.id) === normalizeBankRef(cleanDecisionNo)
      );
      if (duplicateDecision) {
        res.status(409).json({
          error: 'DUPLICATE_BOARD_RESOLUTION',
          message: `Mükerrer YK kararı (#24, #26): "${cleanDecisionNo}" sayılı Yönetim Kurulu kararı defterde zaten kayıtlıdır.`,
        });
        return;
      }

      const serverNow = getServerNow();
      let effectiveExpiresAtIso: string;
      if (typeof expiresAtIso === 'string' && expiresAtIso.trim()) {
        const parsedExp = Date.parse(expiresAtIso.trim());
        if (Number.isNaN(parsedExp)) {
          res.status(422).json({
            error: 'INVALID_EXPIRES_AT',
            message: 'Geçersiz expiresAtIso tarih formatı (#24, #26).',
          });
          return;
        }
        effectiveExpiresAtIso = new Date(parsedExp).toISOString();
      } else {
        const ttlHours =
          typeof expiresInHours === 'number' && Number.isFinite(expiresInHours)
            ? Math.max(1, Math.min(720, expiresInHours))
            : 72;
        effectiveExpiresAtIso = new Date(
          serverNow.getTime() + ttlHours * 60 * 60 * 1000
        ).toISOString();
      }

      const nowStr = formatNowTR();
      const effectiveMeetingDate =
        typeof boardMeetingDate === 'string' && boardMeetingDate.trim()
          ? boardMeetingDate.trim()
          : nowStr.split(' · ')[0] || '23 Ekim 2026';
      const requiredQuorum =
        typeof quorumRequiredCount === 'number' &&
        Number.isInteger(quorumRequiredCount) &&
        quorumRequiredCount >= 2
          ? Math.min(3, quorumRequiredCount)
          : 2;

      const proposerVote: BoardResolutionVoteEntry = {
        memberId: user.memberId,
        memberName: user.fullName,
        role: user.role,
        decision: 'KABUL',
        votedAtIso: serverNow.toISOString(),
        note: 'Karar teklifi ve ilk YK yetkili onayı',
      };

      const newResolution: BoardResolutionItem = {
        id: `res-waiver-${crypto.randomUUID().slice(0, 8)}`,
        resolutionNo: cleanDecisionNo,
        decisionNo: cleanDecisionNo,
        boardMeetingNo: cleanBoardMeetingNo,
        boardMeetingDate: effectiveMeetingDate,
        date: effectiveMeetingDate,
        title:
          typeof title === 'string' && title.trim()
            ? title.trim()
            : `${targetMember.fullName} — Ayrılış / Nakil Açık Bakiye İbra & Feragat Karar Taslağı`,
        category: 'Üyelik',
        summary: cleanReason,
        voteStatus: 'Taslak (YK Nisabı Bekleniyor)',
        signedBy: `${user.fullName} (${user.role.toUpperCase()}) [1/${requiredQuorum} YK Oyu]`,
        clubId: authorizedClubId,
        resolutionScope: 'DEBT_WAIVER_ON_EXIT',
        targetMemberId: cleanMemberId,
        targetMemberName: targetMember.fullName,
        waivedAmountTL: numWaived,
        approvalStatus: 'Taslak',
        quorumRequiredCount: requiredQuorum,
        boardVotes: [proposerVote],
        expiresAtIso: effectiveExpiresAtIso,
        serverVerified: true,
      };

      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => ({
          ...curr,
          boardResolutions: [newResolution, ...(curr.boardResolutions || [])],
        }),
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Yönetim & Güvenlik',
          action: `YK Borç Feragat Karar Taslağı Açıldı (${cleanDecisionNo} — Nisap Bekleniyor)`,
          detail: `${targetMember.fullName} (${cleanMemberId}) için ${numWaived} TL kapsamlı "${cleanDecisionNo}" sayılı YK ayrılış borç feragat karar taslağı oluşturuldu. Yürürlüğe girmesi için YK toplantı numarası ve ikinci YK yetkilisi (Başkan+Sayman) oyu zorunludur (#24, #39).`,
          timestamp: nowStr,
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      res.status(201).json({
        ok: true,
        revision: casResult.state.revision,
        resolution: newResolution,
        quorumSatisfied: false,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  // 6d-0b. Independent Board Officer Vote & Quorum Verification Command (#24, #26, #39)
  // Allows distinct board officers ('baskan', 'sayman', 'sekreter') to record their authenticated vote on a draft resolution.
  // Only transitions the resolution to 'Onaylandı' when boardMeetingNo, resolutionNo, and multi-officer quorum (including both 'baskan' and 'sayman') are satisfied.
  app.post(
    '/api/pilot/board-debt-waiver-vote',
    requireServerRole(['baskan', 'sayman', 'sekreter']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const {
        clubId,
        resolutionId,
        decisionNo,
        resolutionNo,
        voteDecision,
        boardMeetingNo,
        boardMeetingDate,
        note,
      } = req.body || {};

      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      const lookupRef =
        typeof resolutionId === 'string' && resolutionId.trim()
          ? resolutionId.trim()
          : typeof decisionNo === 'string' && decisionNo.trim()
          ? decisionNo.trim()
          : typeof resolutionNo === 'string' && resolutionNo.trim()
          ? resolutionNo.trim()
          : '';

      if (!lookupRef) {
        res.status(400).json({
          error: 'MISSING_RESOLUTION_REFERENCE',
          message:
            'Oylanacak YK kararı için resolutionId veya decisionNo zorunludur (#24, #39).',
        });
        return;
      }

      const cleanVoteDecision: 'KABUL' | 'RED' | 'ÇEKİMSER' =
        voteDecision === 'RED' || voteDecision === 'ÇEKİMSER'
          ? voteDecision
          : 'KABUL';

      const tenant = store.getTenantState(authorizedClubId);
      const normalizedRef = lookupRef.toUpperCase();
      const existingRes = (tenant.boardResolutions || []).find(
        (r) =>
          r.id.toUpperCase() === normalizedRef ||
          (r.decisionNo && r.decisionNo.trim().toUpperCase() === normalizedRef) ||
          (r.resolutionNo &&
            r.resolutionNo.trim().toUpperCase() === normalizedRef)
      );

      if (!existingRes) {
        res.status(404).json({
          error: 'BOARD_RESOLUTION_NOT_FOUND',
          message: `YK kararı bulunamadı (#24, #39): "${lookupRef}" referanslı karar "${authorizedClubId}" kulüp defterinde mevcut değil.`,
        });
        return;
      }

      if (existingRes.clubId && existingRes.clubId !== authorizedClubId) {
        res.status(403).json({
          error: 'CROSS_TENANT_BOARD_RESOLUTION_FORBIDDEN',
          message:
            'Başka bir kulübe ait YK kararı üzerinde oy kullanılamaz (#70).',
        });
        return;
      }

      if (existingRes.consumedAtIso) {
        res.status(409).json({
          error: 'BOARD_RESOLUTION_ALREADY_CONSUMED',
          message: `Bu YK kararı (${existingRes.decisionNo || existingRes.id}) daha önce tüketildiği için oylaması değiştirilemez (#24, #39).`,
        });
        return;
      }

      const existingVotes = Array.isArray(existingRes.boardVotes)
        ? existingRes.boardVotes
        : [];
      if (existingVotes.some((v) => v.memberId === user.memberId)) {
        res.status(409).json({
          error: 'DUPLICATE_BOARD_OFFICER_VOTE',
          message: `Mükerrer YK oyu engellendi (#24, #39): "${user.fullName}" (${user.role}) bu karar için zaten oy kullanmış. Nisap için farklı bir YK yetkilisinin oyu gereklidir.`,
        });
        return;
      }

      if (
        cleanVoteDecision === 'KABUL' &&
        existingVotes.some((v) => v.decision === 'KABUL' && v.role === user.role)
      ) {
        res.status(409).json({
          error: 'DUPLICATE_BOARD_ROLE_VOTE',
          message: `Bu YK rolü (${user.role}) adına zaten kabul oyu kayıtlıdır (#24, #39).`,
        });
        return;
      }

      const serverNow = getServerNow();
      const nowStr = formatNowTR();
      const newVote: BoardResolutionVoteEntry = {
        memberId: user.memberId,
        memberName: user.fullName,
        role: user.role,
        decision: cleanVoteDecision,
        votedAtIso: serverNow.toISOString(),
        ...(typeof note === 'string' && note.trim()
          ? { note: note.trim() }
          : {}),
      };

      const nextVotes = [...existingVotes, newVote];
      const nextBoardMeetingNo =
        typeof boardMeetingNo === 'string' && boardMeetingNo.trim()
          ? boardMeetingNo.trim()
          : typeof boardMeetingNo === 'number' && Number.isFinite(boardMeetingNo)
          ? `YK-TOP-${boardMeetingNo}`
          : existingRes.boardMeetingNo;
      const nextBoardMeetingDate =
        typeof boardMeetingDate === 'string' && boardMeetingDate.trim()
          ? boardMeetingDate.trim()
          : existingRes.boardMeetingDate || existingRes.date;

      const requiredQuorum = Math.max(2, existingRes.quorumRequiredCount ?? 2);
      const approvingVotes = nextVotes.filter((v) => v.decision === 'KABUL');
      const rejectingVotes = nextVotes.filter((v) => v.decision === 'RED');
      const approvingRoles = new Set(approvingVotes.map((v) => v.role));
      const allThreeBoardRolesApproved =
        approvingRoles.has('baskan') &&
        approvingRoles.has('sayman') &&
        approvingRoles.has('sekreter') &&
        rejectingVotes.length === 0 &&
        nextVotes.every((v) => v.decision === 'KABUL');

      const candidateForQuorum: BoardResolutionItem = {
        ...existingRes,
        boardMeetingNo: nextBoardMeetingNo,
        boardMeetingDate: nextBoardMeetingDate,
        quorumRequiredCount: requiredQuorum,
        boardVotes: nextVotes,
        approvalStatus:
          rejectingVotes.length > 0 ? 'Reddedildi' : 'Onaylandı',
        voteStatus:
          rejectingVotes.length > 0
            ? 'Reddedildi'
            : allThreeBoardRolesApproved
            ? 'Oybirliği ile Kabul'
            : 'Oyçokluğu ile Kabul',
      };

      const quorumVerification = verifyBoardDebtWaiverQuorum(candidateForQuorum);

      let finalApprovalStatus: 'Taslak' | 'Onaylandı' | 'Reddedildi';
      let finalVoteStatus: BoardResolutionItem['voteStatus'];
      if (rejectingVotes.length > 0) {
        finalApprovalStatus = 'Reddedildi';
        finalVoteStatus = 'Reddedildi';
      } else if (quorumVerification.ok) {
        finalApprovalStatus = 'Onaylandı';
        finalVoteStatus = allThreeBoardRolesApproved
          ? 'Oybirliği ile Kabul'
          : 'Oyçokluğu ile Kabul';
      } else {
        finalApprovalStatus = 'Taslak';
        finalVoteStatus = 'Taslak (YK Nisabı Bekleniyor)';
      }

      const updatedResolution: BoardResolutionItem = {
        ...existingRes,
        boardMeetingNo: nextBoardMeetingNo,
        boardMeetingDate: nextBoardMeetingDate,
        quorumRequiredCount: requiredQuorum,
        boardVotes: nextVotes,
        approvalStatus: finalApprovalStatus,
        voteStatus: finalVoteStatus,
        signedBy: nextVotes
          .map(
            (v) =>
              `${v.memberName} (${v.role.toUpperCase()}: ${v.decision})`
          )
          .join(' · '),
        ...(finalApprovalStatus === 'Onaylandı'
          ? {
              approvedByMemberId: user.memberId,
              approvedByRole: user.role,
              approvedAtIso: serverNow.toISOString(),
            }
          : {}),
      };

      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => ({
          ...curr,
          boardResolutions: (curr.boardResolutions || []).map((r) =>
            r.id === existingRes.id ? updatedResolution : r
          ),
        }),
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Yönetim & Güvenlik',
          action: `YK Borç Feragat Kararı Oylandı (${updatedResolution.decisionNo} · Durum: ${finalApprovalStatus})`,
          detail: `${user.fullName} (${user.role}) "${updatedResolution.decisionNo}" sayılı YK borç feragat kararına "${cleanVoteDecision}" oyu verdi. Güncel karar durumu: ${finalApprovalStatus} (${finalVoteStatus}).`,
          timestamp: nowStr,
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      res.json({
        ok: true,
        revision: casResult.state.revision,
        resolution: updatedResolution,
        quorumSatisfied: quorumVerification.ok && rejectingVotes.length === 0,
        quorumError: quorumVerification.ok
          ? undefined
          : quorumVerification.error,
        quorumMessage: quorumVerification.ok
          ? undefined
          : quorumVerification.message,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  // 6d. Member Lifecycle Management Endpoint (Candidate -> Active -> Leave -> Honorary -> Resigned/Transferred) (#24-#26, #39)
  app.post(
    '/api/pilot/member-lifecycle',
    requireServerRole(['sekreter', 'baskan']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const {
        clubId,
        targetMemberId,
        targetStatus,
        reason,
        leaveStartDate,
        leaveEndDate,
        boardResolutionRef,
        boardResolutionId,
        boardDebtWaiverApproved,
        skipWriteOffJournal,
        suppressWriteOffJournal,
      } = req.body || {};

      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      if (skipWriteOffJournal === true || suppressWriteOffJournal === true) {
        res.status(422).json({
          error: 'WRITE_OFF_JOURNAL_MANDATORY',
          message:
            'Finansal bütünlük ihlali (#24, #39): Üye borç bakiyesi silinirken değiştirilemez finansal terkin yevmiye kaydı (debtWriteOffJournal) devre dışı bırakılamaz.',
        });
        return;
      }

      const cleanMemberId =
        typeof targetMemberId === 'string' ? targetMemberId.trim() : '';
      const tenant = store.getTenantState(authorizedClubId);
      const targetMember = tenant.members.find((m) => m.id === cleanMemberId);
      if (!targetMember) {
        res.status(404).json({
          error: 'MEMBER_NOT_FOUND',
          message: `Üye bulunamadı (#24-#26): "${cleanMemberId}" kimliğine sahip üye kulüp listesinde yer almıyor.`,
        });
        return;
      }

      const effectiveResolutionRef =
        typeof boardResolutionRef === 'string' && boardResolutionRef.trim()
          ? boardResolutionRef.trim()
          : typeof boardResolutionId === 'string' && boardResolutionId.trim()
          ? boardResolutionId.trim()
          : undefined;

      const serverNow = getServerNow();
      const validation = validateMemberLifecycleTransition({
        member: targetMember,
        clubId: authorizedClubId,
        targetStatus: targetStatus as MembershipLifecycleStatus,
        reason: typeof reason === 'string' ? reason : undefined,
        leaveStartDate:
          typeof leaveStartDate === 'string' ? leaveStartDate : undefined,
        leaveEndDate:
          typeof leaveEndDate === 'string' ? leaveEndDate : undefined,
        boardResolutionRef: effectiveResolutionRef,
        boardResolutions: tenant.boardResolutions || [],
        nowEpochMs: serverNow.getTime(),
        boardDebtWaiverApproved: Boolean(boardDebtWaiverApproved),
        requireWriteOffJournal: true,
      });

      if (!validation.ok) {
        res.status(422).json({
          error: validation.error,
          message: validation.message,
        });
        return;
      }

      const nowStr = formatNowTR();
      const matchedWaiverResolution = validation.matchedResolution;
      const writeOffBreakdown = validation.writeOffBreakdown;

      let writeOffJournalEntry: DebtWaiverWriteOffJournalEntry | undefined;
      if (matchedWaiverResolution && writeOffBreakdown) {
        const existingJournals = tenant.debtWriteOffJournals || [];
        const duplicateJournal = existingJournals.some(
          (j) =>
            j.resolutionId === matchedWaiverResolution.id ||
            normalizeBankRef(j.decisionNo || j.resolutionNo) ===
              normalizeBankRef(
                matchedWaiverResolution.decisionNo ||
                  matchedWaiverResolution.resolutionNo ||
                  matchedWaiverResolution.id
              )
        );
        if (duplicateJournal) {
          res.status(409).json({
            error: 'WRITE_OFF_JOURNAL_ALREADY_EXISTS',
            message: `Mükerrer borç terkin yevmiye kaydı engellendi (#24, #39): "${matchedWaiverResolution.decisionNo || matchedWaiverResolution.id}" sayılı YK kararı için terkin kaydı zaten oluşturulmuş.`,
          });
          return;
        }

        const sourceReceivableIds: string[] = [];
        if (writeOffBreakdown.duesWaivedTL > 0) {
          const duesItem = (tenant.financialItems || []).find(
            (f) => f.category === 'Dönem Aidatı'
          );
          sourceReceivableIds.push(
            duesItem
              ? `${duesItem.id}:member:${targetMember.id}:dues:${writeOffBreakdown.duesWaivedTL}`
              : `fin-dues:member:${targetMember.id}:dues:${writeOffBreakdown.duesWaivedTL}`
          );
        }
        if (writeOffBreakdown.mealWaivedTL > 0) {
          const mealItem = (tenant.financialItems || []).find(
            (f) => f.category === 'Toplantı Kuver Bakiyesi'
          );
          sourceReceivableIds.push(
            mealItem
              ? `${mealItem.id}:member:${targetMember.id}:meal:${writeOffBreakdown.mealWaivedTL}`
              : `fin-meal:member:${targetMember.id}:meal:${writeOffBreakdown.mealWaivedTL}`
          );
        }
        if (writeOffBreakdown.foundationWaivedTL > 0) {
          const trfItem = (tenant.financialItems || []).find(
            (f) => f.category === 'Vakıf / Proje Katkı Payı'
          );
          sourceReceivableIds.push(
            trfItem
              ? `${trfItem.id}:member:${targetMember.id}:trf:${writeOffBreakdown.foundationWaivedTL}`
              : `fin-trf:member:${targetMember.id}:trf:${writeOffBreakdown.foundationWaivedTL}`
          );
        }

        const overdueEntry = (tenant.overdueMembers || []).find(
          (o) =>
            normalizePersonName(o.memberName) ===
            normalizePersonName(targetMember.fullName)
        );
        if (overdueEntry) {
          sourceReceivableIds.push(
            `overdue:${targetMember.id}:${overdueEntry.overdueAmount}`
          );
        }

        if (sourceReceivableIds.length === 0) {
          res.status(422).json({
            error: 'MISSING_SOURCE_RECEIVABLES_FOR_WRITEOFF',
            message:
              'Borç terkin yevmiye kaydı için kaynak alacak kalemi bulunamadı (#24, #39).',
          });
          return;
        }

        const canonicalResNo =
          matchedWaiverResolution.decisionNo ||
          matchedWaiverResolution.resolutionNo ||
          matchedWaiverResolution.id;
        const canonicalMeetingNo =
          matchedWaiverResolution.boardMeetingNo || 'YK-RESMI-OTURUM';
        const canonicalMeetingDate =
          matchedWaiverResolution.boardMeetingDate ||
          matchedWaiverResolution.date ||
          '23 Ekim 2026';
        const approvedByMemberIds = Array.from(
          new Set(
            (matchedWaiverResolution.boardVotes || [])
              .filter((v) => v.decision === 'KABUL')
              .map((v) => v.memberId)
          )
        );
        const idempotencyKey = `WOJ:${authorizedClubId}:${targetMember.id}:${matchedWaiverResolution.id}`;
        const recordedAtIso = serverNow.toISOString();
        const entryHash = crypto
          .createHash('sha256')
          .update(
            `${idempotencyKey}|${canonicalResNo}|${canonicalMeetingNo}|${writeOffBreakdown.duesWaivedTL}|${writeOffBreakdown.mealWaivedTL}|${writeOffBreakdown.foundationWaivedTL}|${writeOffBreakdown.totalWaivedTL}|${sourceReceivableIds.join(',')}|${recordedAtIso}`
          )
          .digest('hex');

        writeOffJournalEntry = {
          id: `woj-${authorizedClubId}-${matchedWaiverResolution.id}`,
          clubId: authorizedClubId,
          idempotencyKey,
          memberId: targetMember.id,
          memberName: targetMember.fullName,
          resolutionId: matchedWaiverResolution.id,
          resolutionNo: canonicalResNo,
          decisionNo: canonicalResNo,
          boardMeetingNo: canonicalMeetingNo,
          boardMeetingDate: canonicalMeetingDate,
          targetLifecycleStatus: targetStatus as 'İstifa / Ayrıldı' | 'Nakil',
          waivedDuesAmountTL: writeOffBreakdown.duesWaivedTL,
          waivedMealAmountTL: writeOffBreakdown.mealWaivedTL,
          waivedFoundationAmountTL: writeOffBreakdown.foundationWaivedTL,
          totalWaivedAmountTL: writeOffBreakdown.totalWaivedTL,
          duesWaivedTL: writeOffBreakdown.duesWaivedTL,
          mealWaivedTL: writeOffBreakdown.mealWaivedTL,
          foundationWaivedTL: writeOffBreakdown.foundationWaivedTL,
          totalWaivedTL: writeOffBreakdown.totalWaivedTL,
          sourceReceivableIds,
          debitAccountCode: '689-YK-Onayli-Borc-Terkin-Gideri',
          creditAccountCode: '120-Uye-Aidat-ve-Kuver-Alacaklari',
          approvedByMemberIds,
          recordedAtIso,
          recordedByMemberId: user.memberId,
          recordedByRole: user.role,
          entryHash,
        };
      }

      const historyEntry: MemberLifecycleHistoryEntry = {
        timestamp: nowStr,
        fromStatus: validation.currentStatus,
        toStatus: targetStatus as MembershipLifecycleStatus,
        actorId: user.memberId,
        actorName: user.fullName,
        actorRole: user.role,
        reason: String(reason).trim(),
        ...(leaveStartDate ? { leaveStartDate: String(leaveStartDate).trim() } : {}),
        ...(leaveEndDate ? { leaveEndDate: String(leaveEndDate).trim() } : {}),
        ...(matchedWaiverResolution
          ? {
              boardResolutionRef:
                matchedWaiverResolution.decisionNo ||
                matchedWaiverResolution.resolutionNo ||
                matchedWaiverResolution.id,
            }
          : effectiveResolutionRef
          ? { boardResolutionRef: effectiveResolutionRef }
          : {}),
        ...(writeOffJournalEntry
          ? { writeOffJournalId: writeOffJournalEntry.id }
          : {}),
      };

      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => ({
          ...curr,
          boardResolutions: matchedWaiverResolution
            ? (curr.boardResolutions || []).map((r) =>
                r.id === matchedWaiverResolution.id
                  ? {
                      ...r,
                      consumedAtIso: serverNow.toISOString(),
                      consumedByMemberId: user.memberId,
                      ...(writeOffJournalEntry
                        ? { writeOffJournalId: writeOffJournalEntry.id }
                        : {}),
                    }
                  : r
              )
            : curr.boardResolutions,
          debtWriteOffJournals: writeOffJournalEntry
            ? [...(curr.debtWriteOffJournals || []), writeOffJournalEntry]
            : curr.debtWriteOffJournals || [],
          memberLifecycleHistory: [
            ...(curr.memberLifecycleHistory || []),
            {
              id: `mlh-${authorizedClubId}-${cleanMemberId}-${curr.revision + 1}`,
              clubId: authorizedClubId,
              memberId: cleanMemberId,
              ...historyEntry,
            },
          ],
          overdueMembers: matchedWaiverResolution
            ? (curr.overdueMembers || []).filter(
                (o) =>
                  normalizePersonName(o.memberName) !==
                  normalizePersonName(targetMember.fullName)
              )
            : curr.overdueMembers,
          members: curr.members.map((m) =>
            m.id === cleanMemberId
              ? {
                  ...m,
                  membershipStatus: targetStatus as MembershipLifecycleStatus,
                  ...(matchedWaiverResolution && writeOffJournalEntry
                    ? {
                        duesBalance: 0,
                        mealBalance: 0,
                        foundationBalance: 0,
                      }
                    : {}),
                  leaveStartDate:
                    targetStatus === 'İzinli (Muaf)'
                      ? String(leaveStartDate).trim()
                      : undefined,
                  leaveEndDate:
                    targetStatus === 'İzinli (Muaf)'
                      ? String(leaveEndDate).trim()
                      : undefined,
                  leaveReason:
                    targetStatus === 'İzinli (Muaf)'
                      ? String(reason).trim()
                      : undefined,
                  ...(targetStatus === 'İstifa / Ayrıldı' ||
                  targetStatus === 'Nakil'
                    ? { reminderOptOut: true, rsvpStatus: 'excused' as const }
                    : {}),
                  lifecycleHistory: [
                    ...(m.lifecycleHistory || []),
                    historyEntry,
                  ],
                }
              : m
          ),
        }),
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Yönetim & Güvenlik',
          action: `Üyelik Yaşam Döngüsü Güncellendi: ${targetMember.fullName} (${validation.currentStatus} -> ${targetStatus})`,
          detail: `${targetMember.fullName} (${targetMember.rotaryId}) üyelik statüsü "${validation.currentStatus}" durumundan "${targetStatus}" durumuna geçirildi.${
            matchedWaiverResolution && writeOffJournalEntry
              ? ` [YK Borç Feragat Kararı: ${matchedWaiverResolution.decisionNo} · Terkin Yevmiye No: ${writeOffJournalEntry.id} · Terkin Tutarı: ${writeOffJournalEntry.totalWaivedTL} TL]`
              : ''
          } Gerekçe: ${String(reason).trim()}`,
          timestamp: nowStr,
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      const updatedMember = casResult.state.members.find(
        (m) => m.id === cleanMemberId
      );

      res.json({
        ok: true,
        revision: casResult.state.revision,
        member: updatedMember,
        consumedBoardResolution: matchedWaiverResolution
          ? matchedWaiverResolution.decisionNo
          : undefined,
        writeOffJournal: writeOffJournalEntry,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  // 7a. Bank Statement Reconciliation Endpoint for Sayman / Başkan (#6, #39, #70, #76)
  app.post(
    '/api/pilot/reconcile-payment',
    requireServerRole(['sayman', 'baskan']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const { paymentId, bankRef, clubId } = req.body || {};
        const authorizedClubId = verifyTenantBoundary(
          user,
          typeof clubId === 'string' ? clubId : undefined,
          store,
          res
        );
        if (!authorizedClubId) return;

        if (!paymentId || !bankRef) {
          res.status(400).json({
            error: 'MISSING_RECONCILIATION_DATA',
            message:
              'Ödeme ID ve Banka Ekstre Referans Kodu (bankRef) zorunludur.',
          });
          return;
        }

        const tenant = store.getTenantState(authorizedClubId);
        const payment = tenant.paymentNotifications.find(
          (p) => p.id === paymentId
        );
        if (!payment) {
          res.status(404).json({
            error: 'PAYMENT_NOT_FOUND',
            message: 'İlgili ödeme bildirimi bulunamadı.',
          });
          return;
        }

        if (payment.status === 'Onaylandı') {
          res.status(409).json({
            error: 'ALREADY_RECONCILED',
            message: 'Bu ödeme zaten banka mutabakatıyla onaylanmış.',
          });
          return;
        }

        if (payment.status === 'Reddedildi') {
          res.status(409).json({
            error: 'PAYMENT_ALREADY_REJECTED',
            message: 'Reddedilmiş bir ödeme bildirimi mutabakata alınamaz.',
          });
          return;
        }

        if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
          res.status(422).json({
            error: 'INVALID_PAYMENT_AMOUNT',
            message: 'Ödeme tutarı pozitif bir sayı olmalıdır.',
          });
          return;
        }

        const normalizedInputRef = normalizeBankRef(String(bankRef));
        const matchingStatement = tenant.bankStatements.find(
          (b) => normalizeBankRef(b.bankRef) === normalizedInputRef
        );

        if (!matchingStatement || matchingStatement.amount !== payment.amount) {
          res.status(422).json({
            error: 'BANK_RECONCILIATION_MISMATCH',
            message: `Banka ekstresinde "${normalizedInputRef}" referanslı ve ${payment.amount} TL tutarlı doğrulanmış bir FAST/EFT hareketi bulunamadı.`,
          });
          return;
        }

        // Issue #39 Fix: Verify sender identity matches payment memberName
        if (
          normalizePersonName(matchingStatement.senderName) !==
          normalizePersonName(payment.memberName)
        ) {
          res.status(422).json({
            error: 'BANK_SENDER_MISMATCH',
            message: `Banka ekstresindeki gönderici (${matchingStatement.senderName}) ile ödeme bildirimindeki üye (${payment.memberName}) eşleşmiyor.`,
          });
          return;
        }

        // Issue #39 Fix: Prevent reusing an already-reconciled bank statement reference!
        if (matchingStatement.reconciled) {
          res.status(409).json({
            error: 'BANK_REF_ALREADY_USED',
            message: `Mükerrer muhasebe engellendi (#39): "${matchingStatement.bankRef}" banka ekstre referansı daha önce başka bir tahsilat mutabakatında kullanılmış.`,
          });
          return;
        }

        const canonicalRef = normalizeBankRef(matchingStatement.bankRef);

        // Prevent duplicate reference number in treasury ledger
        const duplicateInLedger = tenant.treasuryLedger.some(
          (t) => normalizeBankRef(t.referenceNo) === canonicalRef
        );
        if (duplicateInLedger) {
          res.status(409).json({
            error: 'DUPLICATE_LEDGER_REFERENCE',
            message: `"${canonicalRef}" referans kodu kasa defterinde zaten mevcut.`,
          });
          return;
        }

        if (
          payment.targetProjectId &&
          !tenant.projects.some((p) => p.id === payment.targetProjectId)
        ) {
          res.status(422).json({
            error: 'INVALID_TARGET_PROJECT',
            message: 'Ödeme bildiriminin hedeflediği proje kaydı bulunamadı.',
          });
          return;
        }

        if (
          payment.targetScholarId &&
          !tenant.scholars.some((s) => s.id === payment.targetScholarId)
        ) {
          res.status(422).json({
            error: 'INVALID_TARGET_SCHOLAR',
            message: 'Ödeme bildiriminin hedeflediği bursiyer kaydı bulunamadı.',
          });
          return;
        }

        const casResult = store.updateTenant(
          authorizedClubId,
          (curr) => {
            const nextPayments = curr.paymentNotifications.map((p) =>
              p.id === paymentId
                ? { ...p, status: 'Onaylandı' as const, receiptRef: canonicalRef }
                : p
            );

            const nextStatements = curr.bankStatements.map((b) =>
              normalizeBankRef(b.bankRef) === canonicalRef
                ? {
                    ...b,
                    reconciled: true,
                    reconciledPaymentId: payment.id,
                    reconciledAt: formatNowTR(),
                    reconciledBy: user.fullName,
                  }
                : b
            );

            const nextProjects = payment.targetProjectId
              ? curr.projects.map((proj) =>
                  proj.id === payment.targetProjectId
                    ? {
                        ...proj,
                        collectedAmount: proj.collectedAmount + payment.amount,
                        supportersCount: proj.supportersCount + 1,
                      }
                    : proj
                )
              : curr.projects;

            const nextScholars = payment.targetScholarId
              ? curr.scholars.map((sch) => {
                  if (sch.id !== payment.targetScholarId) return sch;
                  const nextFunded = Math.min(
                    sch.totalMonths,
                    sch.fundedMonths + 1
                  );
                  return {
                    ...sch,
                    fundedMonths: nextFunded,
                    statusNote:
                      nextFunded >= sch.totalMonths
                        ? 'Dönem Bursu Tamamlandı'
                        : sch.statusNote,
                  };
                })
              : curr.scholars;

            const isDirectContribution = Boolean(
              payment.targetProjectId || payment.targetScholarId
            );

            const nextMembers = isDirectContribution
              ? curr.members
              : curr.members.map((m) => {
                  if (
                    m.id !== payment.memberId &&
                    normalizePersonName(m.fullName) !==
                      normalizePersonName(payment.memberName)
                  ) {
                    return m;
                  }
                  if (payment.category === 'Dönem Aidatı') {
                    return {
                      ...m,
                      duesBalance: Math.max(0, m.duesBalance - payment.amount),
                    };
                  }
                  if (payment.category === 'Toplantı Kuver Bakiyesi') {
                    return {
                      ...m,
                      mealBalance: Math.max(0, m.mealBalance - payment.amount),
                    };
                  }
                  return {
                    ...m,
                    foundationBalance: Math.max(
                      0,
                      m.foundationBalance - payment.amount
                    ),
                  };
                });

            const nextOverdue = isDirectContribution
              ? curr.overdueMembers
              : curr.overdueMembers
                  .map((o) => {
                    if (
                      normalizePersonName(o.memberName) !==
                      normalizePersonName(payment.memberName)
                    ) {
                      return o;
                    }
                    const remaining = Math.max(
                      0,
                      o.overdueAmount - payment.amount
                    );
                    return { ...o, overdueAmount: remaining };
                  })
                  .filter((o) => o.overdueAmount > 0);

            const nextFinancialItems = !isDirectContribution
              ? curr.financialItems.map((item) =>
                  item.category === payment.category
                    ? {
                        ...item,
                        paidAmount: Math.min(
                          item.totalAmount,
                          item.paidAmount + payment.amount
                        ),
                      }
                    : item
                )
              : curr.financialItems;

            const newLedgerEntry: TreasuryLedgerEntry = {
              id: `tr-${Date.now()}`,
              date: '23 Ekim 2026',
              type: 'Gelir',
              category:
                payment.targetProjectId || payment.targetScholarId
                  ? 'Burs & Proje Fonu'
                  : payment.category === 'Vakıf / Proje Katkı Payı'
                  ? 'UR Bölge & Vakıf'
                  : 'Aidat & Kuver Tahsilatı',
              title: `${payment.memberName} — ${payment.description} (Banka Mutabakatlı)`,
              counterparty: payment.memberName,
              amount: payment.amount,
              referenceNo: canonicalRef,
            };

            return {
              ...curr,
              paymentNotifications: nextPayments,
              bankStatements: nextStatements,
              projects: nextProjects,
              scholars: nextScholars,
              members: nextMembers,
              overdueMembers: nextOverdue,
              financialItems: nextFinancialItems,
              treasuryLedger: [newLedgerEntry, ...curr.treasuryLedger],
            };
          },
          tenant.revision,
          {
            actorName: `${user.fullName} (${user.rotaryId})`,
            actorRole: user.role,
            module: 'Saymanlık & Kasa',
            action: `Banka Mutabakatlı Tahsilat Onayı (${canonicalRef})`,
            detail: `${payment.memberName} (${payment.amount} TL) ödemesi banka ekstresiyle eşleştirildi ve mükerrer kayıt korumasıyla kasa defterine işlendi.`,
            timestamp: formatNowTR(),
          }
        );

        if (!casResult.ok) {
          res.status(409).json({
            error: 'REVISION_CONFLICT',
            currentRevision: casResult.currentRevision,
          });
          return;
        }

        res.json({
          ok: true,
          state: redactStateForRole(
            casResult.state,
            store.getAuditLedger(authorizedClubId),
            user
          ),
        });
      } catch (err) {
        res.status(500).json({
          error: 'RECONCILIATION_WRITE_ERROR',
          message:
            err instanceof Error ? err.message : 'Mutabakat kayıt hatası',
        });
      }
    }
  );

  // 7b. Server-Managed Club Expense & Voucher Recording Endpoint (#39, #70)
  // Replaces direct client treasuryLedger array syncs; strictly validates unique referenceNo and positive amount.
  app.post(
    '/api/pilot/reconcile-expense',
    requireServerRole(['sayman', 'baskan']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const {
          clubId,
          type,
          category,
          title,
          counterparty,
          amount,
          referenceNo,
          date,
        } = req.body || {};

        const authorizedClubId = verifyTenantBoundary(
          user,
          typeof clubId === 'string' ? clubId : undefined,
          store,
          res
        );
        if (!authorizedClubId) return;

        // Income entries for member dues/projects MUST use /api/pilot/reconcile-payment against bank statements!
        if (type === 'Gelir') {
          res.status(422).json({
            error: 'INCOME_REQUIRES_BANK_RECONCILIATION',
            message:
              'Gelir kayıtları kasa defterine doğrudan eklenemez; /api/pilot/reconcile-payment üzerinden banka ekstresi eşleştirmesi zorunludur (#39).',
          });
          return;
        }

        const numAmount = Number(amount);
        if (!Number.isFinite(numAmount) || numAmount <= 0) {
          res.status(422).json({
            error: 'INVALID_LEDGER_AMOUNT',
            message: 'Gider tutarı 0’dan büyük geçerli bir sayı olmalıdır.',
          });
          return;
        }

        const canonicalRef = normalizeBankRef(String(referenceNo || ''));
        if (!canonicalRef || canonicalRef.length < 4) {
          res.status(400).json({
            error: 'MISSING_VOUCHER_REFERENCE',
            message: 'Geçerli bir fatura veya banka dekont referans kodu (referenceNo) zorunludur.',
          });
          return;
        }

        if (!title || !counterparty) {
          res.status(400).json({
            error: 'MISSING_EXPENSE_FIELDS',
            message: 'Gider açıklaması (title) ve karşı taraf (counterparty) zorunludur.',
          });
          return;
        }

        const tenant = store.getTenantState(authorizedClubId);
        const duplicateInLedger = tenant.treasuryLedger.some(
          (t) => normalizeBankRef(t.referenceNo) === canonicalRef
        );
        if (duplicateInLedger) {
          res.status(409).json({
            error: 'DUPLICATE_LEDGER_REFERENCE',
            message: `Mükerrer muhasebe kaydı engellendi (#39): "${canonicalRef}" referans numaralı belge kasa defterinde zaten mevcut.`,
          });
          return;
        }

        const allowedCategories: TreasuryLedgerEntry['category'][] = [
          'Otel & Banket Gideri',
          'Burs & Proje Fonu',
          'UR Bölge & Vakıf',
          'Aidat & Kuver Tahsilatı',
        ];
        const safeCategory: TreasuryLedgerEntry['category'] =
          allowedCategories.includes(category)
            ? category
            : 'Otel & Banket Gideri';

        const newEntry: TreasuryLedgerEntry = {
          id: `tr-exp-${Date.now()}`,
          date: typeof date === 'string' && date.trim() ? date.trim() : '23 Ekim 2026',
          type: 'Gider',
          category: safeCategory,
          title: String(title).trim(),
          counterparty: String(counterparty).trim(),
          amount: numAmount,
          referenceNo: canonicalRef,
        };

        const casResult = store.updateTenant(
          authorizedClubId,
          (curr) => ({
            ...curr,
            treasuryLedger: [newEntry, ...curr.treasuryLedger],
          }),
          tenant.revision,
          {
            actorName: `${user.fullName} (${user.rotaryId})`,
            actorRole: user.role,
            module: 'Saymanlık & Kasa',
            action: `Sunucu Doğrulamalı Gider Kaydı (${canonicalRef})`,
            detail: `${newEntry.title} (${newEntry.counterparty} · ${newEntry.amount} TL) mükerrer belge kontrolüyle kasa defterine işlendi.`,
            timestamp: formatNowTR(),
          }
        );

        if (!casResult.ok) {
          res.status(409).json({
            error: 'REVISION_CONFLICT',
            currentRevision: casResult.currentRevision,
          });
          return;
        }

        res.json({
          ok: true,
          revision: casResult.state.revision,
          state: redactStateForRole(
            casResult.state,
            store.getAuditLedger(authorizedClubId),
            user
          ),
        });
      } catch (err) {
        res.status(500).json({
          error: 'EXPENSE_WRITE_ERROR',
          message: err instanceof Error ? err.message : 'Gider kayıt hatası',
        });
      }
    }
  );

  // 7c. Server-Managed Bulk Member Dues/Kuver Accrual Endpoint with Idempotency & Lifecycle Exemption Protection (#24-#26, #38-#44, #70, #76)
  const handleBulkAccrualRequest = (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const {
        clubId,
        category,
        amount,
        amountPerMember,
        description,
        title,
        period,
        dueDate,
        idempotencyKey,
      } = req.body || {};

      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      const numAmount = Number(amount ?? amountPerMember);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        res.status(422).json({
          error: 'INVALID_ACCRUAL_AMOUNT',
          message: 'Tahakkuk tutarı 0’dan büyük geçerli bir sayı olmalıdır.',
        });
        return;
      }

      const rawDesc = description ?? title;
      if (!rawDesc || !String(rawDesc).trim()) {
        res.status(400).json({
          error: 'MISSING_ACCRUAL_DESCRIPTION',
          message: 'Tahakkuk açıklaması (description / title) zorunludur.',
        });
        return;
      }

      const validCategories: FinancialLineItem['category'][] = [
        'Dönem Aidatı',
        'Toplantı Kuver Bakiyesi',
        'Vakıf / Proje Katkı Payı',
      ];
      const safeCategory: FinancialLineItem['category'] =
        validCategories.includes(category) ? category : 'Dönem Aidatı';
      const safePeriod =
        typeof period === 'string' && period.trim()
          ? period.trim()
          : 'Ekim 2026 Tahakkuku';
      const normalizedDesc = normalizePersonName(String(rawDesc));
      const canonicalIdempotencyKey =
        typeof idempotencyKey === 'string' && idempotencyKey.trim()
          ? idempotencyKey.trim()
          : `${safeCategory}::${safePeriod}::${normalizedDesc}`;

      const tenant = store.getTenantState(authorizedClubId);

      // Issue #38-#44 / #76 Fix: Block duplicate bulk accruals (idempotency check) so members can never be double-charged!
      const duplicateAccrual = tenant.financialItems.some(
        (item) =>
          item.idempotencyKey === canonicalIdempotencyKey ||
          (item.category === safeCategory &&
            item.period === safePeriod &&
            normalizePersonName(item.title) === normalizedDesc)
      );
      if (duplicateAccrual) {
        res.status(409).json({
          error: 'DUPLICATE_ACCRUAL_IDEMPOTENCY',
          code: 'DUPLICATE_PERIOD_ACCRUAL',
          message: `Mükerrer tahakkuk engellendi (#39, #41): "${String(
            rawDesc
          ).trim()}" (${safePeriod}) için toplu borç tahakkuku zaten uygulanmış; çift borç oluşturulamaz.`,
        });
        return;
      }

      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => {
          const nextMembers = applyBulkMemberAccrual(
            curr.members,
            safeCategory,
            numAmount
          );

          const nextFinancialItems: FinancialLineItem[] = [
            ...curr.financialItems,
            {
              id: `fin-${Date.now()}`,
              category: safeCategory,
              title: String(rawDesc).trim(),
              period: safePeriod,
              totalAmount: numAmount,
              paidAmount: 0,
              dueDate:
                typeof dueDate === 'string' && dueDate.trim()
                  ? dueDate.trim()
                  : '15 Kasım 2026',
              idempotencyKey: canonicalIdempotencyKey,
            },
          ];

          return {
            ...curr,
            members: nextMembers,
            financialItems: nextFinancialItems,
          };
        },
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Saymanlık & Kasa',
          action: `Sunucu Yönetimli Tekil Tahakkuk (${safeCategory}: ${numAmount} TL)`,
          detail: `Aktif kulüp üyelerinin "${safeCategory}" cari bakiyesine "${String(
            rawDesc
          ).trim()}" kalemi tekil işlem anahtarıyla (${canonicalIdempotencyKey}) tahakkuk ettirildi (Onur üyeleri ve ayrılan üyeler muaf tutuldu).`,
          timestamp: formatNowTR(),
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      res.json({
        ok: true,
        revision: casResult.state.revision,
        idempotencyKey: canonicalIdempotencyKey,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    } catch (err) {
      res.status(500).json({
        error: 'ACCRUAL_WRITE_ERROR',
        message: err instanceof Error ? err.message : 'Tahakkuk kayıt hatası',
      });
    }
  };

  app.post(
    '/api/pilot/accrue-dues',
    requireServerRole(['sayman', 'baskan']),
    handleBulkAccrualRequest
  );

  app.post(
    '/api/pilot/bulk-accrual',
    requireServerRole(['sayman', 'baskan']),
    handleBulkAccrualRequest
  );

  // 7d. Cryptographic Short-Lived Meeting QR Token Generator (Officer-Only) & Per-Member Check-in Endpoints (#33, #76)
  const getQrSigningSecret = (): string => {
    if (
      process.env.ROTACLUB_QR_SECRET &&
      process.env.ROTACLUB_QR_SECRET.trim().length >= 32
    ) {
      return process.env.ROTACLUB_QR_SECRET.trim();
    }
    return getServerSecret();
  };

  const computeMeetingQrHmacHex = (
    clubId: string,
    meetingNo: number,
    expiresAtEpochSec: number
  ): string => {
    return crypto
      .createHmac('sha256', getQrSigningSecret())
      .update(`rotaclub-qr-v2:${clubId}:${meetingNo}:${expiresAtEpochSec}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();
  };

  const generateMeetingQrToken = (
    clubId: string,
    meetingNo: number,
    expiresAtEpochSec: number
  ): string => {
    const digest = computeMeetingQrHmacHex(
      clubId,
      meetingNo,
      expiresAtEpochSec
    );
    return `RCQR-${meetingNo}-${expiresAtEpochSec}-${digest}`;
  };

  app.get(
    '/api/pilot/meeting-qr-token',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      // Issue #33 Fix: Only authorized venue officers (Genel Sekreter or Dönem Başkanı) may generate the meeting QR token
      if (user.role !== 'sekreter' && user.role !== 'baskan') {
        res.status(403).json({
          error: 'QR_GENERATION_FORBIDDEN',
          message:
            'QR yoklama güvenlik sınırı (#33): Toplantı salonu masa QR kodu yalnızca Genel Sekreter veya Dönem Başkanı tarafından üretilebilir; standart üyeler kendi kendine QR anahtarı alamaz.',
        });
        return;
      }

      const requestedClubId =
        typeof req.query.clubId === 'string' ? req.query.clubId.trim() : undefined;
      const authorizedClubId = verifyTenantBoundary(
        user,
        requestedClubId,
        store,
        res
      );
      if (!authorizedClubId) return;

      const tenant = store.getTenantState(authorizedClubId);
      const parsedMeetingNo = Number(req.query.meetingNo);
      const targetMeetingNo =
        Number.isInteger(parsedMeetingNo) && parsedMeetingNo > 0
          ? parsedMeetingNo
          : tenant.selectedMeetingNo || 1842;
      const meetingObj = tenant.meetings.find(
        (m) => m.meetingNo === targetMeetingNo
      );
      if (!meetingObj) {
        res.status(404).json({
          error: 'MEETING_NOT_FOUND',
          message: `Toplantı bulunamadı (#33): #${targetMeetingNo} numaralı toplantı kulüp takviminde kayıtlı değildir.`,
        });
        return;
      }
      if (meetingObj.status === 'İptal Edildi') {
        res.status(422).json({
          error: 'MEETING_CANCELLED',
          message: `İptal edilmiş toplantı (#33): Toplantı #${targetMeetingNo} iptal edildiği için QR yoklama kodu üretilemez.`,
        });
        return;
      }
      if (meetingObj.isPast === true || meetingObj.status === 'Tamamlandı') {
        res.status(422).json({
          error: 'MEETING_CLOSED',
          message: `Kapanmış toplantı (#33): Geçmiş veya tamamlanmış Toplantı #${targetMeetingNo} için canlı QR yoklama kodu üretilemez.`,
        });
        return;
      }

      const rawTtl =
        req.query.ttlSeconds !== undefined ? Number(req.query.ttlSeconds) : 300;
      const ttlSeconds = Number.isFinite(rawTtl)
        ? Math.max(-3600, Math.min(300, Math.trunc(rawTtl)))
        : 300;
      const nowEpochSec = Math.floor(Date.now() / 1000);
      const expiresAtEpochSec = nowEpochSec + ttlSeconds;

      const qrToken = generateMeetingQrToken(
        authorizedClubId,
        targetMeetingNo,
        expiresAtEpochSec
      );
      res.json({
        ok: true,
        clubId: authorizedClubId,
        meetingNo: targetMeetingNo,
        venue: meetingObj.venue || 'Pera Palace Hotel',
        qrToken,
        expiresAt: expiresAtEpochSec * 1000,
        ttlSeconds,
      });
    }
  );

  app.post(
    '/api/pilot/qr-checkin',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const { clubId, meetingNo, qrToken } = req.body || {};
        const authorizedClubId = verifyTenantBoundary(
          user,
          typeof clubId === 'string' ? clubId.trim() : undefined,
          store,
          res
        );
        if (!authorizedClubId) return;

        const tenant = store.getTenantState(authorizedClubId);
        const targetMeetingNo =
          typeof meetingNo === 'number' &&
          Number.isInteger(meetingNo) &&
          meetingNo > 0
            ? meetingNo
            : tenant.selectedMeetingNo || 1842;

        const submittedToken =
          typeof qrToken === 'string' ? qrToken.trim().toUpperCase() : '';
        const match = submittedToken.match(
          /^RCQR-(\d+)-(\d+)-([0-9A-F]{16})$/
        );

        if (!match) {
          res.status(422).json({
            error: 'INVALID_MEETING_QR_TOKEN',
            message:
              'QR yoklama doğrulama hatası (#33): Sunulan toplantı salonu QR kodu geçersiz formatta veya doğrulanamadı.',
          });
          return;
        }

        const tokenMeetingNo = Number(match[1]);
        const tokenExpiresAtSec = Number(match[2]);
        const tokenSignatureHex = match[3];

        if (tokenMeetingNo !== targetMeetingNo) {
          res.status(422).json({
            error: 'INVALID_MEETING_QR_TOKEN',
            message: `QR yoklama doğrulama hatası (#33): QR kodu farklı bir toplantı (#${tokenMeetingNo}) için üretilmiş.`,
          });
          return;
        }

        const meetingObj = tenant.meetings.find(
          (m) => m.meetingNo === targetMeetingNo
        );
        if (!meetingObj) {
          res.status(404).json({
            error: 'MEETING_NOT_FOUND',
            message: `Toplantı bulunamadı (#33): #${targetMeetingNo} numaralı toplantı kulüp takviminde mevcut değildir.`,
          });
          return;
        }
        if (meetingObj.status === 'İptal Edildi') {
          res.status(422).json({
            error: 'MEETING_CANCELLED',
            message: `İptal edilmiş toplantı (#33): Toplantı #${targetMeetingNo} iptal edildiği için yoklama yapılamaz.`,
          });
          return;
        }
        if (meetingObj.isPast === true || meetingObj.status === 'Tamamlandı') {
          res.status(422).json({
            error: 'MEETING_CLOSED',
            message: `Kapanmış toplantı (#33): Geçmiş veya tamamlanmış Toplantı #${targetMeetingNo} için canlı QR yoklama yapılamaz.`,
          });
          return;
        }

        const expectedHmacHex = computeMeetingQrHmacHex(
          authorizedClubId,
          targetMeetingNo,
          tokenExpiresAtSec
        );
        const sigBufA = Buffer.from(tokenSignatureHex, 'hex');
        const sigBufB = Buffer.from(expectedHmacHex, 'hex');

        if (
          sigBufA.length !== sigBufB.length ||
          !crypto.timingSafeEqual(sigBufA, sigBufB)
        ) {
          res.status(422).json({
            error: 'INVALID_MEETING_QR_TOKEN',
            message:
              'QR yoklama doğrulama hatası (#33): Sunulan toplantı salonu QR kodunun kriptografik imzası doğrulanamadı.',
          });
          return;
        }

        const nowEpochSec = Math.floor(Date.now() / 1000);
        if (nowEpochSec > tokenExpiresAtSec) {
          res.status(422).json({
            error: 'EXPIRED_MEETING_QR_TOKEN',
            message:
              'QR yoklama süresi doldu (#33): Bu salon QR kodunun geçerlilik süresi (5 dk) sona ermiştir. Lütfen Sekreterlik masasından güncel QR kodunu okutun.',
          });
          return;
        }

        const meetingKey = String(targetMeetingNo);
        const alreadyCheckedInMembers = Array.isArray(
          tenant.meetingAttendances?.[meetingKey]
        )
          ? tenant.meetingAttendances![meetingKey]
          : [];
        if (alreadyCheckedInMembers.includes(user.memberId)) {
          res.status(200).json({
            ok: true,
            idempotentReplay: true,
            alreadyCheckedIn: true,
            code: 'ALREADY_CHECKED_IN',
            error: 'ALREADY_CHECKED_IN',
            revision: tenant.revision,
            qrToken: submittedToken,
            meetingNo: targetMeetingNo,
            memberId: user.memberId,
            message: `Mükerrer QR yoklama (İdempotent Yanıt #33): ${user.fullName} Toplantı #${targetMeetingNo} için zaten kayıtlıdır; ek katılım puanı eklenmedi.`,
            state: redactStateForRole(
              tenant,
              store.getAuditLedger(authorizedClubId),
              user
            ),
          });
          return;
        }

        const casResult = store.updateTenant(
          authorizedClubId,
          (curr) => {
            const prevAttendances = curr.meetingAttendances || {};
            const existingForMeeting = Array.isArray(
              prevAttendances[meetingKey]
            )
              ? prevAttendances[meetingKey]
              : [];
            const nextForMeeting = existingForMeeting.includes(user.memberId)
              ? existingForMeeting
              : [...existingForMeeting, user.memberId];

            return {
              ...curr,
              meetingAttendances: {
                ...prevAttendances,
                [meetingKey]: nextForMeeting,
              },
            };
          },
          tenant.revision,
          {
            actorName: `${user.fullName} (${user.rotaryId})`,
            actorRole: user.role,
            module: 'QR Yoklama & Make-up',
            action: `Sunucu Doğrulamalı Masa QR Yoklama (Toplantı #${targetMeetingNo})`,
            detail: `${user.fullName} (${user.rotaryId}) Toplantı #${targetMeetingNo} salon giriş yoklamasını kısa ömürlü imzalı QR kodu ile doğruladı (+%2 katılım).`,
            timestamp: formatNowTR(),
          }
        );

        if (!casResult.ok) {
          res.status(409).json({
            error: 'REVISION_CONFLICT',
            currentRevision: casResult.currentRevision,
          });
          return;
        }

        res.json({
          ok: true,
          idempotentReplay: false,
          alreadyCheckedIn: false,
          revision: casResult.state.revision,
          qrToken: submittedToken,
          meetingNo: targetMeetingNo,
          memberId: user.memberId,
          state: redactStateForRole(
            casResult.state,
            store.getAuditLedger(authorizedClubId),
            user
          ),
        });
      } catch (err) {
        res.status(500).json({
          error: 'QR_CHECKIN_ERROR',
          message: err instanceof Error ? err.message : 'QR yoklama hatası',
        });
      }
    }
  );

  // Issue #33: Authorized Manual / Offline Sync Attendance Endpoint (Secretary / President only)
  app.post(
    '/api/pilot/manual-checkin',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (user.role !== 'sekreter' && user.role !== 'baskan') {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message:
            'Manuel / çevrimdışı yoklama yetki sınırı (#33): Yalnızca Genel Sekreter veya Dönem Başkanı manuel yoklama kaydı girebilir.',
        });
        return;
      }

      const { clubId, meetingNo, targetMemberId, reason, mode } = req.body || {};
      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      const tenant = store.getTenantState(authorizedClubId);
      const targetMeetingNo =
        typeof meetingNo === 'number' &&
        Number.isInteger(meetingNo) &&
        meetingNo > 0
          ? meetingNo
          : tenant.selectedMeetingNo || 1842;

      const meetingObj = tenant.meetings.find(
        (m) => m.meetingNo === targetMeetingNo
      );
      if (!meetingObj) {
        res.status(404).json({
          error: 'MEETING_NOT_FOUND',
          message: `Toplantı bulunamadı (#33): #${targetMeetingNo} numaralı toplantı mevcut değildir.`,
        });
        return;
      }
      if (meetingObj.status === 'İptal Edildi') {
        res.status(422).json({
          error: 'MEETING_CANCELLED',
          message: `İptal edilmiş toplantı (#33): Toplantı #${targetMeetingNo} iptal edildiği için manuel yoklama işlenemez.`,
        });
        return;
      }

      const cleanMemberId =
        typeof targetMemberId === 'string' ? targetMemberId.trim() : '';
      const rosterMember = tenant.members.find((m) => m.id === cleanMemberId);
      const authAccount = store
        .getAccounts()
        .find(
          (a) =>
            a.memberId === cleanMemberId &&
            (a.clubId === authorizedClubId ||
              a.clubMemberships?.some((cm) => cm.clubId === authorizedClubId))
        );
      if (!rosterMember && !authAccount) {
        res.status(404).json({
          error: 'MEMBER_NOT_FOUND',
          message: `Kulüp üyesi bulunamadı (#33): "${cleanMemberId}" kimliğine sahip üye kulüp listesinde yer almıyor.`,
        });
        return;
      }
      const targetMemberName =
        rosterMember?.fullName || authAccount?.fullName || cleanMemberId;

      const cleanReason = typeof reason === 'string' ? reason.trim() : '';
      if (cleanReason.length < 5) {
        res.status(422).json({
          error: 'REASON_REQUIRED',
          message:
            'Manuel / çevrimdışı yoklama için en az 5 karakterlik denetim gerekçesi (reason) zorunludur (#33).',
        });
        return;
      }

      const meetingKey = String(targetMeetingNo);
      const existingAttendees = Array.isArray(
        tenant.meetingAttendances?.[meetingKey]
      )
        ? tenant.meetingAttendances![meetingKey]
        : [];

      if (existingAttendees.includes(cleanMemberId)) {
        res.status(200).json({
          ok: true,
          idempotentReplay: true,
          alreadyCheckedIn: true,
          code: 'ALREADY_CHECKED_IN',
          revision: tenant.revision,
          meetingNo: targetMeetingNo,
          memberId: cleanMemberId,
          state: redactStateForRole(
            tenant,
            store.getAuditLedger(authorizedClubId),
            user
          ),
        });
        return;
      }

      const entryModeLabel =
        mode === 'offline_sync' ? 'Çevrimdışı Senkronizasyon' : 'Yetkili Manuel';
      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => {
          const prev = curr.meetingAttendances || {};
          const list = Array.isArray(prev[meetingKey]) ? prev[meetingKey] : [];
          return {
            ...curr,
            meetingAttendances: {
              ...prev,
              [meetingKey]: list.includes(cleanMemberId)
                ? list
                : [...list, cleanMemberId],
            },
          };
        },
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'QR Yoklama & Make-up',
          action: `${entryModeLabel} Yoklama Kaydı (Toplantı #${targetMeetingNo})`,
          detail: `${targetMemberName} (${cleanMemberId}) için ${user.fullName} tarafından manuel/çevrimdışı yoklama işlendi. Gerekçe: ${cleanReason}`,
          timestamp: formatNowTR(),
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      res.json({
        ok: true,
        idempotentReplay: false,
        alreadyCheckedIn: false,
        revision: casResult.state.revision,
        meetingNo: targetMeetingNo,
        memberId: cleanMemberId,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  // Issue #32: LCV Reminder Queue & Member Communication Preferences Endpoints
  app.post(
    '/api/pilot/lcv-reminders',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (user.role !== 'sekreter' && user.role !== 'baskan') {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message:
            'LCV hatırlatma kuyruğu oluşturma yetkisi (#32): Yalnızca Genel Sekreter veya Dönem Başkanı toplu LCV hatırlatması başlatabilir.',
        });
        return;
      }

      const bodyObj =
        req.body && typeof req.body === 'object'
          ? (req.body as Record<string, unknown>)
          : {};

      // Security Audit (#32): Reject any client attempt to override server clock, quiet hours, or cooldown policy
      if (
        'simulatedHourTR' in bodyObj ||
        'simulatedNowIso' in bodyObj ||
        'cooldownWindowMs' in bodyObj
      ) {
        res.status(422).json({
          error: 'CLIENT_CLOCK_OVERRIDE_FORBIDDEN',
          message:
            'Saat ve bekleme süresi (cooldown) politikası güvenliği (#32): İstemci üzerinden saat veya cooldown parametresi gönderilemez; gerçek zaman sunucu tarafından (Europe/Istanbul) hesaplanır.',
        });
        return;
      }

      // Security Audit (#32): Reject any client attempt to forge provider delivery receipts
      if ('providerReceiptsByMemberId' in bodyObj) {
        res.status(422).json({
          error: 'UNTRUSTED_PROVIDER_RECEIPT',
          message:
            'Teslimat kanıtı güvenliği (#32): Sağlayıcı teslimat makbuzları istemciden gönderilemez; yalnızca sunucu tarafı doğrulanmış entegrasyondan üretilebilir.',
        });
        return;
      }

      const { clubId, meetingNo } = bodyObj;
      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      const tenant = store.getTenantState(authorizedClubId);
      const targetMeetingNo =
        typeof meetingNo === 'number' &&
        Number.isInteger(meetingNo) &&
        meetingNo > 0
          ? meetingNo
          : tenant.selectedMeetingNo || 1842;

      const meetingObj = tenant.meetings.find(
        (m) => m.meetingNo === targetMeetingNo
      );
      if (!meetingObj) {
        res.status(404).json({
          error: 'MEETING_NOT_FOUND',
          message: `Toplantı bulunamadı (#32): #${targetMeetingNo} numaralı toplantı kulüp takviminde kayıtlı değildir.`,
        });
        return;
      }

      const serverNow = getServerNow();
      const effectiveNowMs = serverNow.getTime();
      const effectiveHourTR = getIstanbulHourFromEpochMs(effectiveNowMs);

      let trustedReceipts: Record<string, string> | undefined;
      if (
        Boolean(tenant.outboundMessagingEnabled) &&
        typeof options?.trustedMessagingProvider === 'function'
      ) {
        trustedReceipts = {};
        for (const m of tenant.members) {
          const ch: ReminderChannel =
            m.preferredReminderChannel || 'WhatsApp Taslağı';
          const receipt = options.trustedMessagingProvider({
            clubId: authorizedClubId,
            meetingNo: targetMeetingNo,
            memberId: m.id,
            channel: ch,
          });
          if (typeof receipt === 'string' && receipt.trim()) {
            trustedReceipts[m.id] = receipt.trim();
          }
        }
      }

      const batch = evaluateLcvReminderBatch({
        meetingNo: targetMeetingNo,
        selectedMeetingNo: tenant.selectedMeetingNo,
        meetingDate: meetingObj.date,
        clubName: tenant.clubName,
        meetingVenue: meetingObj.venue,
        members: tenant.members,
        existingQueue: tenant.lcvReminderQueue || [],
        actorName: `${user.fullName} (${user.role})`,
        currentHourTR: effectiveHourTR,
        nowEpochMs: effectiveNowMs,
        cooldownWindowMs: SERVER_LCV_REMINDER_COOLDOWN_MS,
        outboundDispatchEnabled: Boolean(tenant.outboundMessagingEnabled),
        providerReceiptsByMemberId: trustedReceipts,
      });

      if (batch.isQuietHours) {
        res.status(422).json({
          error: 'QUIET_HOURS_ACTIVE',
          message:
            'Sessiz saat kuralı (#32): Europe/Istanbul saatiyle 22:00 ile 08:00 saatleri arasında üyelere LCV hatırlatma bildirimi kuyruğa alınamaz veya gönderilemez.',
          batchSummary: batch,
        });
        return;
      }

      const queuedMemberIds = new Set(batch.queuedItems.map((q) => q.memberId));
      const nowIso = new Date(effectiveNowMs).toISOString();
      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => ({
          ...curr,
          lcvReminderQueue: [
            ...batch.queuedItems,
            ...(curr.lcvReminderQueue || []),
          ],
          members: curr.members.map((m) =>
            queuedMemberIds.has(m.id)
              ? {
                  ...m,
                  lastRemindedMeetingNo: targetMeetingNo,
                  lastRemindedAtIso: nowIso,
                }
              : m
          ),
        }),
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'LCV & Kuver',
          action: `LCV Hatırlatma Kuyruğu İşlendi (Toplantı #${targetMeetingNo})`,
          detail: `Toplantı #${targetMeetingNo} (${meetingObj.venue}) için ${batch.queuedItems.length} üye taslak kuyruğa eklendi (Dış gönderim: ${
            tenant.outboundMessagingEnabled ? 'Açık' : 'Kapalı'
          }, Opt-out atlanan: ${batch.skippedOptOutMembers.length}, Mükerrer atlanan: ${
            batch.skippedCooldownMembers.length
          }).`,
          timestamp: formatNowTR(),
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      res.json({
        ok: true,
        revision: casResult.state.revision,
        outboundMessagingEnabled: Boolean(tenant.outboundMessagingEnabled),
        queued: batch.queuedItems,
        skippedOptOut: batch.skippedOptOutMembers,
        skippedCooldown: batch.skippedCooldownMembers,
        batchSummary: batch,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  app.post(
    '/api/pilot/member-communication-prefs',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const { clubId, targetMemberId, reminderOptOut, preferredReminderChannel } =
        req.body || {};
      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      const effectiveMemberId =
        typeof targetMemberId === 'string' && targetMemberId.trim()
          ? targetMemberId.trim()
          : user.memberId;

      const isOfficer = user.role === 'sekreter' || user.role === 'baskan';
      if (effectiveMemberId !== user.memberId && !isOfficer) {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message:
            'İletişim tercihi yetki sınırı (#32): Standart üye yalnızca kendi LCV bildirim ve opt-out tercihini güncelleyebilir.',
        });
        return;
      }

      const tenant = store.getTenantState(authorizedClubId);
      const memberExists = tenant.members.some((m) => m.id === effectiveMemberId);
      if (!memberExists) {
        res.status(404).json({
          error: 'MEMBER_NOT_FOUND',
          message: 'İletişim tercihi güncellenecek üye bulunamadı (#32).',
        });
        return;
      }

      const allowedChannels: ReminderChannel[] = [
        'E-Posta',
        'SMS',
        'WhatsApp Taslağı',
      ];
      const nextChannel = allowedChannels.includes(
        preferredReminderChannel as ReminderChannel
      )
        ? (preferredReminderChannel as ReminderChannel)
        : undefined;

      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => ({
          ...curr,
          members: curr.members.map((m) =>
            m.id === effectiveMemberId
              ? {
                  ...m,
                  ...(typeof reminderOptOut === 'boolean'
                    ? { reminderOptOut }
                    : {}),
                  ...(nextChannel
                    ? { preferredReminderChannel: nextChannel }
                    : {}),
                }
              : m
          ),
        }),
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'LCV & Kuver',
          action: `LCV İletişim ve Opt-Out Tercihi Güncellendi (${effectiveMemberId})`,
          detail: `Üye (${effectiveMemberId}) LCV hatırlatma tercihi güncellendi: Opt-out=${String(
            reminderOptOut
          )}, Kanal=${nextChannel || 'Mevcut'}.`,
          timestamp: formatNowTR(),
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      res.json({
        ok: true,
        revision: casResult.state.revision,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  // Issue #36: Cryptographic Guest Make-up Certificate Verification Code Generator (64-bit / 16-Hex HMAC-SHA256), Bounded IP Rate Limiter, Guest-Specific Attendance Gate, Approval Gate, Re-Verification & Revocation
  const computeGuestCertificateVerificationCode = (
    clubId: string,
    card: {
      id: string;
      guestName: string;
      guestClub: string;
      guestDistrict?: string;
      meetingNo: number;
      meetingDate: string;
      issuedByMemberId?: string;
      approvedByMemberId?: string;
      guestAttendanceRecordId?: string;
      attendanceEvidence?: string;
      status?: 'Taslak' | 'Aktif' | 'İptal Edildi';
      schemaVersion?: number;
    }
  ): string => {
    const version = card.schemaVersion || 1;
    const issuer = card.issuedByMemberId || 'officer';
    const approver =
      card.status === 'Aktif' && card.approvedByMemberId
        ? `:${card.approvedByMemberId}`
        : '';
    const guestAttRef =
      card.status === 'Aktif' && card.guestAttendanceRecordId
        ? `:${card.guestAttendanceRecordId}`
        : '';
    const evidencePart =
      card.status === 'Aktif' && card.attendanceEvidence
        ? `:${normalizePersonName(card.attendanceEvidence)}`
        : '';
    const district = card.guestDistrict || 'UR 2420. Bölge';
    const digest = crypto
      .createHmac('sha256', getServerSecret())
      .update(
        `RotaclubGuestCertificate:v${version}:${clubId}:${card.id}:${card.meetingNo}:${card.guestName}:${card.guestClub}:${district}:${card.meetingDate}:${issuer}${approver}${guestAttRef}${evidencePart}`
      )
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();
    return `GLR-2420-${card.meetingNo}-${digest}`;
  };

  // Issue #36: Authorized Guest Rotarian Check-in Endpoint (Secretary / President only)
  // Records person-, club-, and meeting-bound attendance proof required before approving any Guest Make-up Certificate.
  app.post(
    '/api/pilot/guest-checkin',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (user.role !== 'sekreter' && user.role !== 'baskan') {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message:
            'Misafir yoklama kayıt yetkisi (#36): Yalnızca Genel Sekreter veya Dönem Başkanı misafir Rotaryen salon giriş yoklamasını doğrulayabilir.',
        });
        return;
      }

      const {
        clubId,
        meetingNo,
        guestName,
        guestClub,
        guestDistrict,
        checkinMethod,
        evidenceNote,
      } = req.body || {};

      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      const tenant = store.getTenantState(authorizedClubId);
      const targetMeetingNo =
        typeof meetingNo === 'number' &&
        Number.isInteger(meetingNo) &&
        meetingNo > 0
          ? meetingNo
          : tenant.selectedMeetingNo || 1842;

      const meetingObj = tenant.meetings.find(
        (m) => m.meetingNo === targetMeetingNo
      );
      if (!meetingObj) {
        res.status(404).json({
          error: 'MEETING_NOT_FOUND',
          message: `Toplantı bulunamadı (#36): #${targetMeetingNo} numaralı toplantı kulüp takviminde mevcut değildir.`,
        });
        return;
      }
      if (meetingObj.status === 'İptal Edildi') {
        res.status(422).json({
          error: 'MEETING_CANCELLED',
          message: `İptal edilmiş toplantı (#36): Toplantı #${targetMeetingNo} iptal edildiği için misafir yoklaması kaydedilemez.`,
        });
        return;
      }

      const cleanGuestName =
        typeof guestName === 'string' ? guestName.trim() : '';
      const cleanGuestClub =
        typeof guestClub === 'string' ? guestClub.trim() : '';
      const cleanEvidence =
        typeof evidenceNote === 'string' ? evidenceNote.trim() : '';

      if (
        cleanGuestName.length < 3 ||
        cleanGuestClub.length < 3 ||
        cleanEvidence.length < 5
      ) {
        res.status(422).json({
          error: 'INVALID_GUEST_CHECKIN_DATA',
          message:
            'Misafir yoklama kaydı için geçerli misafir adı (guestName), kulübü (guestClub) ve en az 5 karakterlik salon katılım kanıtı (evidenceNote) zorunludur (#36).',
        });
        return;
      }

      const allowedMethods: VerifiedGuestAttendanceRecord['checkinMethod'][] = [
        'Salon Kayıt Masası',
        'QR Teyit',
        'Protokol Defteri',
      ];
      const safeMethod: VerifiedGuestAttendanceRecord['checkinMethod'] =
        allowedMethods.includes(checkinMethod)
          ? checkinMethod
          : 'Salon Kayıt Masası';

      const existingRecord = (tenant.verifiedGuestAttendances || []).find(
        (v) =>
          v.meetingNo === targetMeetingNo &&
          !v.revoked &&
          normalizePersonName(v.guestName) ===
            normalizePersonName(cleanGuestName) &&
          normalizePersonName(v.guestClub) ===
            normalizePersonName(cleanGuestClub)
      );

      if (existingRecord) {
        res.status(200).json({
          ok: true,
          idempotentReplay: true,
          revision: tenant.revision,
          guestAttendanceRecord: existingRecord,
          state: redactStateForRole(
            tenant,
            store.getAuditLedger(authorizedClubId),
            user
          ),
        });
        return;
      }

      const nowStr = formatNowTR();
      const newRecord: VerifiedGuestAttendanceRecord = {
        id: `vga-${targetMeetingNo}-${Date.now()}`,
        meetingNo: targetMeetingNo,
        guestName: cleanGuestName,
        guestClub: cleanGuestClub,
        guestDistrict:
          typeof guestDistrict === 'string' && guestDistrict.trim()
            ? guestDistrict.trim()
            : 'UR 2420. Bölge',
        verifiedByMemberId: user.memberId,
        verifiedByName: user.fullName,
        verifiedByRole: user.role,
        verifiedAt: nowStr,
        checkinMethod: safeMethod,
        evidenceNote: cleanEvidence,
      };

      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => ({
          ...curr,
          verifiedGuestAttendances: [
            newRecord,
            ...(curr.verifiedGuestAttendances || []),
          ],
        }),
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'QR Yoklama & Make-up',
          action: `Misafir Rotaryen Salon Yoklaması Doğrulandı (Toplantı #${targetMeetingNo})`,
          detail: `${cleanGuestName} (${cleanGuestClub}) için Toplantı #${targetMeetingNo} misafir katılımı (${safeMethod}: ${cleanEvidence}) doğrulandı.`,
          timestamp: nowStr,
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      res.json({
        ok: true,
        idempotentReplay: false,
        revision: casResult.state.revision,
        guestAttendanceRecord: newRecord,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  // Issue #36: Revoke a Guest Attendance Check-in Record (Secretary / President only)
  // If a guest attendance record is revoked, any certificate relying on it immediately fails verification!
  app.post(
    '/api/pilot/revoke-guest-checkin',
    requireServerRole(['sekreter', 'baskan']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const { clubId, guestAttendanceRecordId, reason } = req.body || {};
      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      const cleanRecordId =
        typeof guestAttendanceRecordId === 'string'
          ? guestAttendanceRecordId.trim()
          : '';
      const cleanReason = typeof reason === 'string' ? reason.trim() : '';
      if (!cleanRecordId || cleanReason.length < 5) {
        res.status(422).json({
          error: 'INVALID_GUEST_CHECKIN_REVOCATION',
          message:
            'Misafir yoklama kaydı iptali (#36) için geçerli guestAttendanceRecordId ve en az 5 karakterlik iptal gerekçesi (reason) zorunludur.',
        });
        return;
      }

      const tenant = store.getTenantState(authorizedClubId);
      const targetRecord = (tenant.verifiedGuestAttendances || []).find(
        (v) => v.id === cleanRecordId
      );
      if (!targetRecord) {
        res.status(404).json({
          error: 'GUEST_ATTENDANCE_RECORD_NOT_FOUND',
          message: 'İptal edilecek misafir yoklama kaydı bulunamadı (#36).',
        });
        return;
      }

      const nowStr = formatNowTR();
      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => ({
          ...curr,
          verifiedGuestAttendances: (curr.verifiedGuestAttendances || []).map(
            (v) =>
              v.id === cleanRecordId
                ? {
                    ...v,
                    revoked: true,
                    revokedAt: nowStr,
                    revokedBy: `${user.fullName} (${user.role})`,
                    revocationReason: cleanReason,
                  }
                : v
          ),
        }),
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'QR Yoklama & Make-up',
          action: `Misafir Salon Yoklama Kaydı İptal Edildi (${cleanRecordId})`,
          detail: `${targetRecord.guestName} (${targetRecord.guestClub}) adına kayıtlı Toplantı #${targetRecord.meetingNo} misafir yoklama kanıtı iptal edildi. Gerekçe: ${cleanReason}`,
          timestamp: nowStr,
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      res.json({
        ok: true,
        revision: casResult.state.revision,
        revokedGuestAttendanceRecordId: cleanRecordId,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  const VERIFY_CERT_RATE_WINDOW_MS = 60_000;
  const VERIFY_CERT_MAX_REQUESTS = 20;
  const MAX_VERIFY_RATE_BUCKETS = 2000;
  const verifyCertRateBuckets = new Map<
    string,
    { count: number; windowStartMs: number }
  >();

  const pruneVerifyCertRateBuckets = (nowMs: number) => {
    for (const [k, v] of verifyCertRateBuckets.entries()) {
      if (nowMs - v.windowStartMs > VERIFY_CERT_RATE_WINDOW_MS) {
        verifyCertRateBuckets.delete(k);
      }
    }
    while (verifyCertRateBuckets.size >= MAX_VERIFY_RATE_BUCKETS) {
      const oldestKey = verifyCertRateBuckets.keys().next().value;
      if (!oldestKey) break;
      verifyCertRateBuckets.delete(oldestKey);
    }
  };

  app.get('/api/pilot/verify-certificate', (req: AuthenticatedRequest, res) => {
    // Security Audit (#36): Never use client-controlled request headers for rate limiting
    const rateKey =
      req.ip || req.socket?.remoteAddress || 'unknown-verify-client';
    const nowMs = getServerNow().getTime();
    pruneVerifyCertRateBuckets(nowMs);

    const bucket = verifyCertRateBuckets.get(rateKey);
    if (!bucket || nowMs - bucket.windowStartMs > VERIFY_CERT_RATE_WINDOW_MS) {
      verifyCertRateBuckets.set(rateKey, { count: 1, windowStartMs: nowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > VERIFY_CERT_MAX_REQUESTS) {
        res.status(429).json({
          valid: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message:
            'Sertifika doğrulama hız sınırı aşıldı (#36): Çok fazla doğrulama sorgusu gönderildi. Lütfen 1 dakika sonra tekrar deneyin.',
        });
        return;
      }
    }

    const clubId =
      typeof req.query.clubId === 'string' && req.query.clubId.trim()
        ? req.query.clubId.trim()
        : 'club-galata';
    const code =
      typeof req.query.code === 'string'
        ? req.query.code.trim().toUpperCase()
        : '';
    if (!code) {
      res.status(400).json({
        valid: false,
        error: 'MISSING_VERIFICATION_CODE',
        message: 'Doğrulama kodu (code) parametresi zorunludur (#36).',
      });
      return;
    }
    if (!isAllowedTenantClubId(clubId)) {
      res.status(404).json({
        valid: false,
        error: 'CLUB_NOT_FOUND',
        message: 'Kulüp kaydı bulunamadı.',
      });
      return;
    }
    const tenant = store.getTenantState(clubId);
    const card = (tenant.guestMakeupCards || []).find(
      (c) => String(c.verificationCode || '').toUpperCase() === code
    );
    if (!card) {
      res.status(404).json({
        valid: false,
        error: 'CERTIFICATE_NOT_FOUND',
        message: `Sunucu kayıtlarında "${code}" doğrulama koduna ait geçerli bir katılım belgesi bulunamadı (#36).`,
      });
      return;
    }

    if (card.status === 'İptal Edildi') {
      res.status(410).json({
        valid: false,
        error: 'CERTIFICATE_REVOKED',
        status: 'İptal Edildi',
        revokedAt: card.revokedAt,
        revocationReason: card.revocationReason,
        message: `Bu katılım belgesi (${code}) kulüp yetkilisi tarafından iptal edilmiştir (#36).`,
      });
      return;
    }

    if (card.status === 'Taslak') {
      res.status(422).json({
        valid: false,
        error: 'CERTIFICATE_NOT_APPROVED',
        status: 'Taslak',
        message:
          'Bu belge henüz taslak aşamasındadır ve resmi katılım/yetkili onayı almamıştır (#36).',
      });
      return;
    }

    // Re-verify HMAC against current stored fields for all v1+ server-issued certificates (#36)
    if (
      card.schemaVersion ||
      /^GLR-2420-\d+-[0-9A-F]{16}$/.test(card.verificationCode)
    ) {
      const recomputedCode = computeGuestCertificateVerificationCode(
        clubId,
        card
      );
      const bufA = Buffer.from(card.verificationCode, 'utf8');
      const bufB = Buffer.from(recomputedCode, 'utf8');
      if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
        res.status(422).json({
          valid: false,
          error: 'CERTIFICATE_INTEGRITY_MISMATCH',
          message:
            'Belge bütünlük hatası (#36): Sertifika içeriği düzenlendikten sonra değiştirilmiş veya imza doğrulaması başarısız.',
        });
        return;
      }
    }

    // Security Audit (#36): Any v1+ active certificate must have verified approval gate metadata, approval history, AND a valid, non-revoked, identity-matched guest attendance record
    if (card.schemaVersion) {
      const hasApprovedHistory =
        Array.isArray(card.approvalHistory) &&
        card.approvalHistory.some((h) => h.action === 'ONAYLANDI');
      if (
        !card.approvedByMemberId ||
        !card.attendanceEvidence ||
        !hasApprovedHistory
      ) {
        res.status(422).json({
          valid: false,
          error: 'CERTIFICATE_NOT_APPROVED',
          message:
            'Belge onay kapısı eksik (#36): Sertifikanın kişi/toplantı bazlı doğrulanmış misafir katılım kanıtı ve yetkili onay geçmişi bulunmamaktadır.',
        });
        return;
      }

      const linkedGuestAttendance = (
        tenant.verifiedGuestAttendances || []
      ).find((v) => v.id === card.guestAttendanceRecordId);

      if (!linkedGuestAttendance) {
        res.status(422).json({
          valid: false,
          error: 'GUEST_ATTENDANCE_EVIDENCE_MISSING',
          message:
            'Misafir katılım kanıtı doğrulaması başarısız (#36): Belgeye bağlı kişi bazlı salon yoklama kaydı (guestAttendanceRecordId) bulunamadı veya silinmiş.',
        });
        return;
      }

      if (linkedGuestAttendance.revoked) {
        res.status(422).json({
          valid: false,
          error: 'GUEST_ATTENDANCE_EVIDENCE_REVOKED',
          message: `Misafir katılım kanıtı iptal edilmiş (#36): Bu sertifikanın dayandığı salon giriş yoklama kaydı (${linkedGuestAttendance.id}) iptal edildiğinden sertifika geçersizdir.`,
        });
        return;
      }

      if (
        linkedGuestAttendance.meetingNo !== card.meetingNo ||
        normalizePersonName(linkedGuestAttendance.guestName) !==
          normalizePersonName(card.guestName) ||
        normalizePersonName(linkedGuestAttendance.guestClub) !==
          normalizePersonName(card.guestClub)
      ) {
        res.status(422).json({
          valid: false,
          error: 'GUEST_ATTENDANCE_IDENTITY_MISMATCH',
          message:
            'Misafir kimlik/toplantı tutarsızlığı (#36): Sertifikadaki misafir kimliği veya toplantı numarası ile salon yoklama kaydındaki veriler eşleşmiyor.',
        });
        return;
      }
    }

    // Check if caller has an authenticated officer token for this club
    const { token } = extractBearerToken(req);
    const verifiedUser = token ? verifySignedToken(token) : null;
    const isAuthorizedClubOfficer =
      Boolean(verifiedUser) &&
      verifiedUser!.clubId === clubId &&
      (verifiedUser!.role === 'sekreter' || verifiedUser!.role === 'baskan');

    res.json({
      valid: true,
      clubId,
      verificationCode: card.verificationCode,
      kvkkRedacted: !isAuthorizedClubOfficer,
      certificate: {
        guestName: isAuthorizedClubOfficer
          ? card.guestName
          : maskGuestNameForPublicVerification(card.guestName),
        guestClub: card.guestClub,
        guestDistrict: card.guestDistrict,
        meetingNo: card.meetingNo,
        meetingDate: card.meetingDate,
        sentAt: card.sentAt,
        status: card.status || 'Aktif',
        schemaVersion: card.schemaVersion || 1,
        issuedByRole: card.issuedByRole || 'sekreter',
        approvedByRole: card.approvedByRole || card.issuedByRole || 'sekreter',
        approvedAt: card.approvedAt || card.sentAt,
        ...(isAuthorizedClubOfficer
          ? {
              id: card.id,
              issuedByName: card.issuedByName,
              approvedByName: card.approvedByName,
              attendanceEvidence: card.attendanceEvidence,
              guestAttendanceRecordId: card.guestAttendanceRecordId,
              approvalHistory: card.approvalHistory,
            }
          : {}),
      },
    });
  });

  app.post(
    '/api/pilot/approve-certificate',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (user.role !== 'sekreter' && user.role !== 'baskan') {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message:
            'Sertifika aktifleştirme yetkisi (#36): Yalnızca Genel Sekreter veya Dönem Başkanı dijital katılım belgesini onaylayarak aktifleştirebilir.',
        });
        return;
      }

      const {
        clubId,
        certificateId,
        attendanceEvidence,
        guestAttendanceRecordId,
      } = req.body || {};
      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      const cleanCertId =
        typeof certificateId === 'string' ? certificateId.trim() : '';
      const cleanEvidence =
        typeof attendanceEvidence === 'string' ? attendanceEvidence.trim() : '';
      if (!cleanCertId || cleanEvidence.length < 5) {
        res.status(422).json({
          error: 'ATTENDANCE_EVIDENCE_REQUIRED',
          message:
            'Sertifika aktifleştirmesi için geçerli certificateId ve en az 5 karakterlik doğrulanmış katılım kanıtı (attendanceEvidence) zorunludur (#36).',
        });
        return;
      }

      const tenant = store.getTenantState(authorizedClubId);
      const targetCard = (tenant.guestMakeupCards || []).find(
        (c) => c.id === cleanCertId || c.verificationCode === cleanCertId
      );
      if (!targetCard) {
        res.status(404).json({
          error: 'CERTIFICATE_NOT_FOUND',
          message: 'Onaylanacak katılım belgesi bulunamadı (#36).',
        });
        return;
      }

      if (targetCard.status === 'İptal Edildi') {
        res.status(409).json({
          error: 'CERTIFICATE_ALREADY_REVOKED',
          message:
            'İptal edilmiş bir katılım belgesi yeniden aktifleştirilemez (#36).',
        });
        return;
      }

      if (targetCard.status === 'Aktif') {
        res.status(409).json({
          error: 'CERTIFICATE_ALREADY_ACTIVE',
          message: 'Bu katılım belgesi zaten onaylanmış ve aktif durumdadır (#36).',
        });
        return;
      }

      const meetingObj = tenant.meetings.find(
        (m) => m.meetingNo === targetCard.meetingNo
      );
      if (!meetingObj) {
        res.status(404).json({
          error: 'MEETING_NOT_FOUND',
          message: `Toplantı bulunamadı (#36): #${targetCard.meetingNo} numaralı toplantı kulüp takviminde kayıtlı değildir.`,
        });
        return;
      }

      if (meetingObj.status === 'İptal Edildi') {
        res.status(422).json({
          error: 'MEETING_CANCELLED',
          message: `İptal edilmiş toplantı (#36): Toplantı #${targetCard.meetingNo} iptal edildiği için katılım belgesi onaylanamaz.`,
        });
        return;
      }

      const meetingAttendees =
        tenant.meetingAttendances?.[String(targetCard.meetingNo)] || [];
      const meetingGuestAttendances = (
        tenant.verifiedGuestAttendances || []
      ).filter((v) => v.meetingNo === targetCard.meetingNo);
      const hasVerifiedSessionAttendance =
        meetingAttendees.length > 0 ||
        meetingGuestAttendances.length > 0 ||
        meetingObj.isPast === true ||
        meetingObj.status === 'Tamamlandı';
      if (!hasVerifiedSessionAttendance) {
        res.status(422).json({
          error: 'MEETING_ATTENDANCE_NOT_VERIFIED',
          message: `Toplantı katılım doğrulaması eksik (#36): Toplantı #${targetCard.meetingNo} için henüz doğrulanmış salon yoklaması (QR veya yetkili yoklama kaydı) bulunmadığından misafir katılım belgesi aktifleştirilemez.`,
        });
        return;
      }

      // Security Audit (#36): Merely having a club member checked in to the meeting does NOT prove the specific guest attended!
      // Require a person-, club-, and meeting-bound VerifiedGuestAttendanceRecord in tenant.verifiedGuestAttendances.
      const matchedGuestAttendance = meetingGuestAttendances.find((v) => {
        if (
          typeof guestAttendanceRecordId === 'string' &&
          guestAttendanceRecordId.trim() &&
          v.id !== guestAttendanceRecordId.trim()
        ) {
          return false;
        }
        return (
          normalizePersonName(v.guestName) ===
            normalizePersonName(targetCard.guestName) &&
          normalizePersonName(v.guestClub) ===
            normalizePersonName(targetCard.guestClub)
        );
      });

      if (!matchedGuestAttendance) {
        res.status(422).json({
          error: 'GUEST_ATTENDANCE_NOT_VERIFIED',
          message: `Misafir bazlı katılım doğrulaması eksik (#36): Toplantı #${targetCard.meetingNo} genel yoklaması açık olsa dahi "${targetCard.guestName}" (${targetCard.guestClub}) adlı misafir için doğrulanmış salon giriş / misafir yoklama kaydı (/api/pilot/guest-checkin) bulunmamaktadır.`,
        });
        return;
      }

      if (matchedGuestAttendance.revoked) {
        res.status(422).json({
          error: 'GUEST_ATTENDANCE_EVIDENCE_REVOKED',
          message: `Misafir katılım kanıtı iptal edilmiş (#36): "${targetCard.guestName}" (${targetCard.guestClub}) adlı misafirin yoklama kaydı (${matchedGuestAttendance.id}) iptal edildiğinden katılım belgesi onaylanamaz.`,
        });
        return;
      }

      const nowStr = formatNowTR();
      const updatedCardForHmac: GuestRotaryMakeupCard = {
        ...targetCard,
        schemaVersion: targetCard.schemaVersion || 1,
        status: 'Aktif',
        issuedByMemberId: targetCard.issuedByMemberId || user.memberId,
        issuedByName: targetCard.issuedByName || user.fullName,
        issuedByRole: targetCard.issuedByRole || user.role,
        approvedByMemberId: user.memberId,
        approvedByName: user.fullName,
        approvedByRole: user.role,
        approvedAt: nowStr,
        attendanceEvidence: cleanEvidence,
        guestAttendanceRecordId: matchedGuestAttendance.id,
      };
      const activeVerificationCode = computeGuestCertificateVerificationCode(
        authorizedClubId,
        updatedCardForHmac
      );
      const approvalEntry: CertificateApprovalHistoryEntry = {
        timestamp: nowStr,
        action: 'ONAYLANDI',
        actorId: user.memberId,
        actorName: user.fullName,
        actorRole: user.role,
        note: `${cleanEvidence} [Misafir Yoklama Kayıt No: ${matchedGuestAttendance.id}]`,
      };

      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => ({
          ...curr,
          guestMakeupCards: (curr.guestMakeupCards || []).map((c) =>
            c.id === targetCard.id
              ? {
                  ...updatedCardForHmac,
                  verificationCode: activeVerificationCode,
                  approvalHistory: [
                    ...(c.approvalHistory || []),
                    approvalEntry,
                  ],
                }
              : c
          ),
        }),
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'QR Yoklama & Make-up',
          action: `Misafir Katılım Belgesi Onaylandı & Aktifleştirildi (${activeVerificationCode})`,
          detail: `${targetCard.guestName} (${targetCard.guestClub}) adına düzenlenen Toplantı #${targetCard.meetingNo} katılım belgesi misafir yoklama kaydı (${matchedGuestAttendance.id}) ve kanıtıyla (${cleanEvidence}) aktifleştirildi.`,
          timestamp: nowStr,
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      const approvedCertificate = (casResult.state.guestMakeupCards || []).find(
        (c) => c.id === targetCard.id
      );

      res.json({
        ok: true,
        revision: casResult.state.revision,
        approvedCertificateCode: activeVerificationCode,
        guestAttendanceRecordId: matchedGuestAttendance.id,
        certificate: approvedCertificate,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  app.post(
    '/api/pilot/revoke-certificate',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (user.role !== 'sekreter' && user.role !== 'baskan') {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message:
            'Sertifika iptal yetkisi (#36): Yalnızca Genel Sekreter veya Dönem Başkanı dijital katılım belgesini iptal edebilir.',
        });
        return;
      }

      const { clubId, certificateId, reason } = req.body || {};
      const authorizedClubId = verifyTenantBoundary(
        user,
        typeof clubId === 'string' ? clubId.trim() : undefined,
        store,
        res
      );
      if (!authorizedClubId) return;

      const cleanCertId =
        typeof certificateId === 'string' ? certificateId.trim() : '';
      const cleanReason = typeof reason === 'string' ? reason.trim() : '';
      if (!cleanCertId || cleanReason.length < 4) {
        res.status(422).json({
          error: 'INVALID_REVOCATION_REQUEST',
          message:
            'Sertifika iptali için geçerli certificateId ve en az 4 karakterlik iptal gerekçesi (reason) zorunludur (#36).',
        });
        return;
      }

      const tenant = store.getTenantState(authorizedClubId);
      const targetCard = (tenant.guestMakeupCards || []).find(
        (c) => c.id === cleanCertId || c.verificationCode === cleanCertId
      );
      if (!targetCard) {
        res.status(404).json({
          error: 'CERTIFICATE_NOT_FOUND',
          message: 'İptal edilecek katılım belgesi bulunamadı (#36).',
        });
        return;
      }

      const nowStr = formatNowTR();
      const revocationHistoryEntry: CertificateApprovalHistoryEntry = {
        timestamp: nowStr,
        action: 'IPTAL_EDILDI',
        actorId: user.memberId,
        actorName: user.fullName,
        actorRole: user.role,
        note: cleanReason,
      };
      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => ({
          ...curr,
          guestMakeupCards: (curr.guestMakeupCards || []).map((c) =>
            c.id === targetCard.id
              ? {
                  ...c,
                  status: 'İptal Edildi' as const,
                  revokedAt: nowStr,
                  revokedBy: `${user.fullName} (${user.role})`,
                  revocationReason: cleanReason,
                  approvalHistory: [
                    ...(c.approvalHistory || []),
                    revocationHistoryEntry,
                  ],
                }
              : c
          ),
        }),
        tenant.revision,
        {
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'QR Yoklama & Make-up',
          action: `Misafir Katılım Belgesi İptal Edildi (${targetCard.verificationCode})`,
          detail: `${targetCard.guestName} (${targetCard.guestClub}) adına düzenlenen ${targetCard.verificationCode} kodlu belge iptal edildi. Gerekçe: ${cleanReason}`,
          timestamp: nowStr,
        }
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      res.json({
        ok: true,
        revision: casResult.state.revision,
        revokedCertificateCode: targetCard.verificationCode,
        state: redactStateForRole(
          casResult.state,
          store.getAuditLedger(authorizedClubId),
          user
        ),
      });
    }
  );

  // 8. Authenticated State Synchronization, Mandatory CAS Revision Check, Immutable Payment Records & Closed Accounting Ledger Bypass (#14, #16, #18, #20, #39, #70, #76)
  app.post('/api/pilot/sync', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const requestedClubId =
        typeof req.body?.clubId === 'string' ? req.body.clubId.trim() : undefined;
      const authorizedClubId = verifyTenantBoundary(
        user,
        requestedClubId,
        store,
        res
      );
      if (!authorizedClubId) return;

      const currentTenant = store.getTenantState(authorizedClubId);

      // Issue #14 Fix: expectedRevision is strictly MANDATORY on /api/pilot/sync
      const expectedRevision = req.body?.expectedRevision;
      if (
        typeof expectedRevision !== 'number' ||
        !Number.isInteger(expectedRevision)
      ) {
        res.status(428).json({
          error: 'REVISION_REQUIRED',
          message:
            'Eşzamanlı veri bütünlüğü (#14): /api/pilot/sync isteklerinde tam sayı expectedRevision alanı zorunludur.',
          currentRevision: currentTenant.revision,
        });
        return;
      }

      if (expectedRevision !== currentTenant.revision) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          message: `Veri sürümü çakışması (#14): İstemci revizyonu (${expectedRevision}) sunucu revizyonu (${currentTenant.revision}) ile eşleşmiyor.`,
          currentRevision: currentTenant.revision,
        });
        return;
      }

      const auditEvent = req.body?.auditEvent as
        | {
            module: AuditLogEntry['module'];
            action: string;
            detail: string;
            requiredRoles?: ClubRole[];
          }
        | undefined;

      // Enforce server-side RBAC using the verified token's role
      if (
        auditEvent?.requiredRoles &&
        auditEvent.requiredRoles.length > 0 &&
        !auditEvent.requiredRoles.includes(user.role)
      ) {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message: `Sunucu RBAC Reddi: "${auditEvent.action}" işlemi yalnızca [${auditEvent.requiredRoles.join(', ')}] rolleri tarafından yapılabilir. Mevcut rolünüz: ${user.role}`,
        });
        return;
      }

      const incomingPatch = req.body?.state || {};
      const isFinanceAdmin = user.role === 'sayman' || user.role === 'baskan';
      const isBoardAdmin =
        user.role === 'sekreter' ||
        user.role === 'sayman' ||
        user.role === 'baskan';
      const isMakeupApprover =
        user.role === 'sekreter' || user.role === 'baskan';

      // Issue #33 Fix: Block direct client mutation of qrCheckedIn or meetingAttendances without cryptographic QR verification
      const currentMeetingKey = String(currentTenant.selectedMeetingNo || 1842);
      const isCurrentlyCheckedIn = Boolean(
        currentTenant.meetingAttendances?.[currentMeetingKey]?.includes(
          user.memberId
        )
      );
      if (
        (incomingPatch.qrCheckedIn === true && !isCurrentlyCheckedIn) ||
        'meetingAttendances' in incomingPatch
      ) {
        res.status(422).json({
          error: 'QR_TOKEN_VERIFICATION_REQUIRED',
          message:
            'QR yoklama bütünlüğü (#33): Salon yoklaması /api/pilot/sync üzerinden doğrudan işaretlenemez; /api/pilot/qr-checkin uç noktasından kısa ömürlü imzalı toplantı QR kodu (qrToken) ile doğrulanmalıdır.',
        });
        return;
      }

      // Issue #33 Fix: Only board officers can change club-wide selectedMeetingNo, and it must exist in meetings
      if (
        incomingPatch.selectedMeetingNo !== undefined &&
        incomingPatch.selectedMeetingNo !== currentTenant.selectedMeetingNo
      ) {
        if (!isBoardAdmin) {
          res.status(403).json({
            error: 'RBAC_FORBIDDEN',
            message:
              'Aktif toplantı seçimi (selectedMeetingNo) kulüp geneli operasyonel bir ayardır; yalnızca Yönetim Kurulu yetkilileri (Sekreter, Sayman, Başkan) tarafından değiştirilebilir (#33).',
          });
          return;
        }
        const targetMeetingExists = (
          Array.isArray(incomingPatch.meetings)
            ? incomingPatch.meetings
            : currentTenant.meetings
        ).some(
          (m: { meetingNo: number }) =>
            m.meetingNo === Number(incomingPatch.selectedMeetingNo)
        );
        if (!targetMeetingExists) {
          res.status(422).json({
            error: 'INVALID_MEETING_NO',
            message: `Seçilen toplantı numarası (#${incomingPatch.selectedMeetingNo}) kulüp takviminde bulunamadı (#33).`,
          });
          return;
        }
      }

      // Issue #35 Fix: Enforce officer-approved Make-up workflow, full lifecycle, duplicate activity prevention, & memberId isolation
      if (Array.isArray(incomingPatch.makeupSubmissions)) {
        const existingMakeupsById = new Map(
          currentTenant.makeupSubmissions.map((mk) => [mk.id, mk])
        );
        const stripTitle = (name: string) =>
          normalizePersonName(String(name || '').replace(/^Rtn\.\s*/i, ''));
        const selfCanonical = stripTitle(user.fullName);

        // Check for duplicate make-up activity both within the incoming batch and against stored records (#35)
        const normalizedBatchForDupCheck = incomingPatch.makeupSubmissions
          .filter((incMk: { id?: string }) => incMk && typeof incMk.id === 'string')
          .map(
            (incMk: {
              id: string;
              memberId?: string;
              memberName?: string;
              date?: string;
              targetClubOrEvent?: string;
              activityType?: string;
              status?: string;
            }) => {
              const existingMk = existingMakeupsById.get(incMk.id);
              const effectiveMemberId =
                existingMk?.memberId ||
                (isMakeupApprover
                  ? incMk.memberId ||
                    resolveUnambiguousLegacyMemberId(
                      incMk.memberName || '',
                      currentTenant.members
                    ) ||
                    user.memberId
                  : user.memberId);
              return {
                id: incMk.id,
                memberId: effectiveMemberId,
                date: incMk.date || existingMk?.date || '',
                targetClubOrEvent:
                  incMk.targetClubOrEvent ||
                  existingMk?.targetClubOrEvent ||
                  '',
                activityType:
                  incMk.activityType ||
                  existingMk?.activityType ||
                  'Kulüp Ziyareti',
                status: incMk.status || existingMk?.status || 'İnceleniyor',
              };
            }
          );

        if (
          hasDuplicateInMakeupBatch(
            normalizedBatchForDupCheck,
            currentTenant.members
          )
        ) {
          res.status(409).json({
            error: 'DUPLICATE_MAKEUP_SUBMISSION',
            message:
              'Mükerrer telafi engellendi (#35): Gönderilen istek paketi (batch) içinde aynı üye, tarih, etkinlik türü ve hedef kulüp/etkinlik adına birden fazla eşdeğer make-up başvurusu bulunmaktadır.',
          });
          return;
        }

        for (const incMk of incomingPatch.makeupSubmissions) {
          if (!incMk || typeof incMk.id !== 'string') continue;
          const existingMk = existingMakeupsById.get(incMk.id);
          const effectiveMemberId =
            existingMk?.memberId ||
            (isMakeupApprover
              ? incMk.memberId ||
                resolveUnambiguousLegacyMemberId(
                  incMk.memberName || '',
                  currentTenant.members
                ) ||
                user.memberId
              : user.memberId);

          const isNewOrReactivatedOrActivityChanged =
            !existingMk ||
            (existingMk.status === 'Reddedildi' &&
              incMk.status !== 'Reddedildi') ||
            existingMk.targetClubOrEvent !== incMk.targetClubOrEvent ||
            existingMk.activityType !== incMk.activityType ||
            existingMk.date !== incMk.date;

          if (
            isNewOrReactivatedOrActivityChanged &&
            incMk.status !== 'Reddedildi' &&
            effectiveMemberId &&
            hasDuplicateMakeupActivity(currentTenant.makeupSubmissions, {
              id: incMk.id,
              memberId: effectiveMemberId,
              targetClubOrEvent: incMk.targetClubOrEvent || '',
              activityType: incMk.activityType || 'Kulüp Ziyareti',
              date: incMk.date || '',
            })
          ) {
            res.status(409).json({
              error: 'DUPLICATE_MAKEUP_SUBMISSION',
              message:
                'Mükerrer telafi engellendi (#35): Aynı üye için aynı tarih, etkinlik türü ve hedef kulüp/etkinlik adına zaten aktif veya onaylanmış bir make-up kaydı bulunmaktadır.',
            });
            return;
          }
        }

        // Prevent officers from approving their OWN make-up submission (#35)
        if (isMakeupApprover) {
          for (const incMk of incomingPatch.makeupSubmissions) {
            const existingMk = existingMakeupsById.get(incMk?.id);
            const targetOwnerId =
              existingMk?.memberId ||
              incMk?.memberId ||
              resolveUnambiguousLegacyMemberId(
                incMk?.memberName || existingMk?.memberName || '',
                currentTenant.members
              );
            if (
              incMk?.status === 'Onaylandı' &&
              (!existingMk || existingMk.status !== 'Onaylandı') &&
              targetOwnerId === user.memberId
            ) {
              res.status(403).json({
                error: 'MAKEUP_SELF_APPROVAL_FORBIDDEN',
                message:
                  'Make-up çıkar çatışması kuralı (#35): Yetkili bir görevli kendi adına açılmış make-up bildirimini bizzat onaylayamaz; diğer yetkili (Başkan/Sekreter) onayı gereklidir.',
              });
              return;
            }
          }
        }

        if (!isMakeupApprover) {
          const incomingIds = new Set(
            incomingPatch.makeupSubmissions
              .filter((mk: { id?: string }) => mk && typeof mk.id === 'string')
              .map((mk: { id: string }) => mk.id)
          );
          for (const existingMk of currentTenant.makeupSubmissions) {
            if (!incomingIds.has(existingMk.id)) {
              res.status(403).json({
                error: 'MAKEUP_FORBIDDEN_MUTATION',
                message:
                  'Make-up yetki sınırı (#35): Standart üye oturumu mevcut make-up kayıtlarını silemez.',
              });
              return;
            }
          }

          for (const incMk of incomingPatch.makeupSubmissions) {
            const existingMk = existingMakeupsById.get(incMk?.id);
            if (existingMk) {
              const existingOwnerId =
                existingMk.memberId ||
                resolveUnambiguousLegacyMemberId(
                  existingMk.memberName,
                  currentTenant.members
                );
              const isOwnSubmission = existingOwnerId === user.memberId;

              if (
                incMk.attendanceBoost !== existingMk.attendanceBoost ||
                (incMk.status !== existingMk.status &&
                  (incMk.status === 'Onaylandı' ||
                    incMk.status === 'Reddedildi' ||
                    incMk.status === 'Düzeltme İstendi'))
              ) {
                res.status(403).json({
                  error: 'MAKEUP_APPROVAL_FORBIDDEN',
                  message:
                    'Make-up onay yetki sınırı (#35): Make-up bildirimlerini onaylama, reddetme veya düzeltme isteme yetkisi yalnızca Genel Sekreter ve Dönem Başkanına aittir.',
                });
                return;
              }

              if (!isOwnSubmission) {
                if (
                  incMk.status !== existingMk.status ||
                  (existingMk.memberId &&
                    incMk.memberId &&
                    incMk.memberId !== existingMk.memberId) ||
                  stripTitle(incMk.memberName) !==
                    stripTitle(existingMk.memberName) ||
                  incMk.targetClubOrEvent !== existingMk.targetClubOrEvent ||
                  incMk.activityType !== existingMk.activityType ||
                  incMk.date !== existingMk.date ||
                  incMk.description !== existingMk.description
                ) {
                  res.status(403).json({
                    error: 'MAKEUP_FORBIDDEN_MUTATION',
                    message:
                      'Make-up yetki sınırı (#35): Başka bir üyeye ait make-up kaydının içeriği veya durumu değiştirilemez.',
                  });
                  return;
                }
              } else {
                // Own submission: allowed transitions for member:
                // - 'Taslak' -> 'Taslak' or 'İnceleniyor' (can edit fields)
                // - 'Düzeltme İstendi' -> 'Düzeltme İstendi' or 'İnceleniyor' (can edit fields & resubmit)
                // - 'Reddedildi' -> 'İtiraz Edildi' (can add appealNote / evidenceRef) or unchanged 'Reddedildi'
                const canMemberEditCoreFields =
                  existingMk.status === 'Taslak' ||
                  existingMk.status === 'Düzeltme İstendi';
                const isValidStatusTransition =
                  incMk.status === existingMk.status ||
                  (existingMk.status === 'Taslak' &&
                    incMk.status === 'İnceleniyor') ||
                  (existingMk.status === 'Düzeltme İstendi' &&
                    incMk.status === 'İnceleniyor') ||
                  (existingMk.status === 'Reddedildi' &&
                    incMk.status === 'İtiraz Edildi');

                if (!isValidStatusTransition) {
                  res.status(403).json({
                    error: 'MAKEUP_APPROVAL_FORBIDDEN',
                    message: `Make-up durum geçiş sınırı (#35): "${existingMk.status}" durumundaki kayıt üye tarafından "${incMk.status}" durumuna geçirilemez.`,
                  });
                  return;
                }

                const coreFieldsChanged =
                  (existingMk.memberId &&
                    incMk.memberId &&
                    incMk.memberId !== existingMk.memberId) ||
                  stripTitle(incMk.memberName) !==
                    stripTitle(existingMk.memberName) ||
                  incMk.targetClubOrEvent !== existingMk.targetClubOrEvent ||
                  incMk.activityType !== existingMk.activityType ||
                  incMk.date !== existingMk.date ||
                  incMk.description !== existingMk.description;

                if (coreFieldsChanged && !canMemberEditCoreFields) {
                  res.status(403).json({
                    error: 'MAKEUP_FORBIDDEN_MUTATION',
                    message:
                      'Make-up yetki sınırı (#35): İncelemede veya sonuçlanmış make-up kayıtlarının temel faaliyet bilgileri değiştirilemez.',
                  });
                  return;
                }
              }
            } else {
              // New Make-up submission by regular member ('Taslak' or 'İnceleniyor')
              if (
                (incMk?.status !== 'İnceleniyor' &&
                  incMk?.status !== 'Taslak') ||
                (typeof incMk?.attendanceBoost === 'number' &&
                  incMk.attendanceBoost > 0)
              ) {
                res.status(403).json({
                  error: 'MAKEUP_APPROVAL_FORBIDDEN',
                  message:
                    'Make-up onay yetki sınırı (#35): Standart üye oturumu doğrudan onaylı make-up oluşturamaz; yeni bildirimler "Taslak" veya "İnceleniyor" durumunda açılmalıdır.',
                });
                return;
              }
              if (
                (incMk?.memberId && incMk.memberId !== user.memberId) ||
                stripTitle(incMk?.memberName || '') !== selfCanonical
              ) {
                res.status(403).json({
                  error: 'MAKEUP_FORBIDDEN_MUTATION',
                  message: `Make-up yetki sınırı (#35): Standart üye oturumu (${user.fullName}) yalnızca kendi adına make-up bildirimi oluşturabilir.`,
                });
                return;
              }
            }
          }
        }
      }

      // Issue #36 Fix: Only Club Secretary or President can issue or modify guest make-up certificates, and new/draft certificates CANNOT be directly created or mutated as 'Aktif' via /api/pilot/sync
      if (Array.isArray(incomingPatch.guestMakeupCards)) {
        if (!isMakeupApprover) {
          res.status(403).json({
            error: 'RBAC_FORBIDDEN',
            message:
              'Misafir Rotaryen katılım belgesi düzenleme yetkisi (#36): Yalnızca Genel Sekreter veya Dönem Başkanı dijital katılım belgesi düzenleyebilir.',
          });
          return;
        }

        const existingCardsById = new Map(
          (currentTenant.guestMakeupCards || []).map((c) => [c.id, c])
        );
        for (const incCard of incomingPatch.guestMakeupCards) {
          if (!incCard || typeof incCard.id !== 'string') continue;
          const existingCard = existingCardsById.get(incCard.id);
          if (
            (!existingCard &&
              ((incCard.status && incCard.status !== 'Taslak') ||
                Boolean(incCard.approvedByMemberId) ||
                Boolean(incCard.approvedAt))) ||
            (existingCard &&
              existingCard.status === 'Taslak' &&
              incCard.status &&
              incCard.status !== 'Taslak')
          ) {
            res.status(422).json({
              error: 'CERTIFICATE_APPROVAL_GATE_REQUIRED',
              message:
                'Sertifika onay kapısı zorunludur (#36): Yeni katılım belgeleri yalnızca "Taslak" olarak oluşturulabilir ve doğrulanmış toplantı/katılım kanıtıyla "/api/pilot/approve-certificate" uç noktasından aktifleştirilebilir.',
            });
            return;
          }
        }
      }

      // Issue #36 Fix: Block direct client mutation of verifiedGuestAttendances via /api/pilot/sync
      if ('verifiedGuestAttendances' in incomingPatch) {
        res.status(422).json({
          error: 'DIRECT_GUEST_ATTENDANCE_MUTATION_FORBIDDEN',
          message:
            'Misafir yoklama kanıt bütünlüğü (#36): Doğrulanmış misafir katılım kayıtları (verifiedGuestAttendances) /api/pilot/sync üzerinden doğrudan eklenemez, değiştirilemez veya silinemez; /api/pilot/guest-checkin ve /api/pilot/revoke-guest-checkin uç noktaları zorunludur.',
        });
        return;
      }

      // Issue #24 / #26 Fix: Block direct client forging or mutation of server-verified board debt waiver resolutions via /api/pilot/sync
      if (Array.isArray(incomingPatch.boardResolutions)) {
        const existingResById = new Map(
          (currentTenant.boardResolutions || []).map((r) => [r.id, r])
        );
        for (const incRes of incomingPatch.boardResolutions) {
          if (!incRes || typeof incRes.id !== 'string') continue;
          const existingRes = existingResById.get(incRes.id);
          if (!existingRes) {
            if (
              incRes.resolutionScope === 'DEBT_WAIVER_ON_EXIT' ||
              incRes.serverVerified === true ||
              typeof incRes.waivedAmountTL === 'number' ||
              typeof incRes.targetMemberId === 'string'
            ) {
              res.status(422).json({
                error: 'DIRECT_BOARD_WAIVER_RESOLUTION_FORBIDDEN',
                message:
                  'YK borç feragat kararı bütünlüğü (#24, #26): Ayrılış borç feragat kararları /api/pilot/sync üzerinden doğrudan oluşturulamaz; yalnızca Sayman veya Başkan tarafından /api/pilot/board-debt-waiver-resolution uç noktasından onaylanabilir.',
              });
              return;
            }
          } else if (
            existingRes.serverVerified ||
            existingRes.resolutionScope === 'DEBT_WAIVER_ON_EXIT'
          ) {
            const tampered =
              incRes.decisionNo !== existingRes.decisionNo ||
              incRes.clubId !== existingRes.clubId ||
              incRes.resolutionScope !== existingRes.resolutionScope ||
              incRes.targetMemberId !== existingRes.targetMemberId ||
              incRes.waivedAmountTL !== existingRes.waivedAmountTL ||
              incRes.approvalStatus !== existingRes.approvalStatus ||
              incRes.approvedByMemberId !== existingRes.approvedByMemberId ||
              incRes.approvedByRole !== existingRes.approvedByRole ||
              incRes.expiresAtIso !== existingRes.expiresAtIso ||
              incRes.consumedAtIso !== existingRes.consumedAtIso ||
              incRes.serverVerified !== existingRes.serverVerified;
            if (tampered) {
              res.status(422).json({
                error: 'IMMUTABLE_BOARD_WAIVER_RESOLUTION',
                message:
                  'YK borç feragat kararı bütünlüğü (#24, #26): Sunucu onaylı YK borç feragat kararları /api/pilot/sync üzerinden değiştirilemez.',
              });
              return;
            }
          }
        }
      }

      // Issue #39 & #24 Fix: Close ALL direct client write paths to treasuryLedger, debtWriteOffJournals, memberLifecycleHistory, bankStatements, financialItems, and overdueMembers!
      if (
        'treasuryLedger' in incomingPatch ||
        'debtWriteOffJournals' in incomingPatch ||
        'memberLifecycleHistory' in incomingPatch ||
        'bankStatements' in incomingPatch ||
        'financialItems' in incomingPatch ||
        'overdueMembers' in incomingPatch
      ) {
        res.status(422).json({
          error: 'DIRECT_LEDGER_MUTATION_FORBIDDEN',
          message:
            'Muhasebe bütünlüğü koruması (#24, #39): Kasa defteri (treasuryLedger), borç terkin yevmiye defteri (debtWriteOffJournals), banka ekstreleri ve finansal tahakkuk tabloları /api/pilot/sync üzerinden doğrudan değiştirilemez. Lütfen yetkili sunucu uç noktalarını kullanın.',
        });
        return;
      }

      // Issue #24-#26 & #39 Fix: Block direct client mutation of member debt balances OR membership lifecycle status via /api/pilot/sync
      if (Array.isArray(incomingPatch.members)) {
        for (const incMember of incomingPatch.members) {
          if (!incMember || typeof incMember.id !== 'string') continue;
          const existing = currentTenant.members.find(
            (m) => m.id === incMember.id
          );
          if (existing) {
            if (isFinanceAdmin) {
              const duesChanged =
                typeof incMember.duesBalance === 'number' &&
                incMember.duesBalance !== existing.duesBalance;
              const mealChanged =
                typeof incMember.mealBalance === 'number' &&
                incMember.mealBalance !== existing.mealBalance;
              const foundChanged =
                typeof incMember.foundationBalance === 'number' &&
                incMember.foundationBalance !== existing.foundationBalance;
              if (duesChanged || mealChanged || foundChanged) {
                res.status(422).json({
                  error: 'DIRECT_LEDGER_MUTATION_FORBIDDEN',
                  message:
                    'Muhasebe bütünlüğü koruması (#39): Üye cari borç bakiyeleri /api/pilot/sync üzerinden doğrudan değiştirilemez; yalnızca banka mutabakatı (/api/pilot/reconcile-payment) veya toplu tahakkuk (/api/pilot/accrue-dues) ile güncellenebilir.',
                });
                return;
              }
            }
            const existingLifecycle = existing.membershipStatus || 'Aktif';
            if (
              typeof incMember.membershipStatus === 'string' &&
              incMember.membershipStatus !== existingLifecycle
            ) {
              res.status(422).json({
                error: 'LIFECYCLE_ENDPOINT_REQUIRED',
                message:
                  'Üyelik yaşam döngüsü bütünlüğü (#24-#26): Üye statüsü (Aday, Aktif, İzinli, Onur Üyesi, İstifa/Nakil) /api/pilot/sync üzerinden doğrudan değiştirilemez; borç kapısı ve karar geçmişi doğrulaması için /api/pilot/member-lifecycle uç noktası kullanılmalıdır.',
              });
              return;
            }
          }
        }
      }

      // Block regular 'uye' from toggling club-wide KVKK phone masking (#16)
      if (
        typeof incomingPatch.kvkkMaskPhone === 'boolean' &&
        incomingPatch.kvkkMaskPhone !== currentTenant.kvkkMaskPhone &&
        !isBoardAdmin
      ) {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message:
            'Kulüp geneli KVKK telefon maskeleme ayarı yalnızca Yönetim Kurulu yetkilileri tarafından değiştirilebilir.',
        });
        return;
      }

      // Issue #39 & #76 Fix: Strict Immutability & Validation of incoming paymentNotifications
      if (Array.isArray(incomingPatch.paymentNotifications)) {
        const existingById = new Map(
          currentTenant.paymentNotifications.map((p) => [p.id, p])
        );

        // Finance admins send the full list; ensure no existing payment record is deleted/dropped!
        if (isFinanceAdmin) {
          const incomingIds = new Set(
            incomingPatch.paymentNotifications
              .filter((p: { id?: string }) => p && typeof p.id === 'string')
              .map((p: { id: string }) => p.id)
          );
          for (const existing of currentTenant.paymentNotifications) {
            if (!incomingIds.has(existing.id)) {
              res.status(422).json({
                error: 'IMMUTABLE_PAYMENT_RECORD_VIOLATION',
                message: `Değişmez ödeme kaydı ihlali (#39): Mevcut ödeme kaydı (${existing.id}) silinemez.`,
              });
              return;
            }
          }
        }

        // Track all active refs belonging to OTHER members or already reconciled on the server
        const reservedServerRefs = new Set<string>();
        for (const existing of currentTenant.paymentNotifications) {
          if (existing.status === 'Reddedildi') continue;
          if (!isFinanceAdmin && existing.memberId !== user.memberId) {
            reservedServerRefs.add(normalizeBankRef(existing.receiptRef));
          }
        }
        for (const stmt of currentTenant.bankStatements) {
          if (stmt.reconciled) {
            reservedServerRefs.add(normalizeBankRef(stmt.bankRef));
          }
        }
        for (const ledgerItem of currentTenant.treasuryLedger) {
          reservedServerRefs.add(normalizeBankRef(ledgerItem.referenceNo));
        }

        const seenInPatchRefs = new Set<string>();
        for (const p of incomingPatch.paymentNotifications) {
          if (
            !p ||
            typeof p.amount !== 'number' ||
            !Number.isFinite(p.amount) ||
            p.amount <= 0
          ) {
            res.status(422).json({
              error: 'INVALID_PAYMENT_AMOUNT',
              message:
                'Ödeme bildirimi tutarı 0’dan büyük geçerli bir sayı olmalıdır.',
            });
            return;
          }

          const existing = existingById.get(p.id);
          // Nobody can mark a payment 'Onaylandı' via /api/pilot/sync — must use /api/pilot/reconcile-payment!
          if (
            p.status === 'Onaylandı' &&
            (!existing || existing.status !== 'Onaylandı')
          ) {
            res.status(422).json({
              error: 'UNRECONCILED_PAYMENT_APPROVAL_FORBIDDEN',
              message:
                'Ödeme bildirimleri doğrudan senkronizasyon ile onaylanamaz; /api/pilot/reconcile-payment üzerinden banka ekstresi mutabakatı zorunludur.',
            });
            return;
          }

          // Issue #39 / #76 Fix: If this record already exists on the server, ALL core fields are 100% immutable!
          // And if existing.status is 'Onaylandı' or 'Reddedildi', even status is 100% immutable!
          if (existing) {
            const coreFieldsMutated =
              p.memberId !== existing.memberId ||
              p.memberName !== existing.memberName ||
              p.category !== existing.category ||
              p.amount !== existing.amount ||
              p.description !== existing.description ||
              p.submittedAt !== existing.submittedAt ||
              normalizeBankRef(p.receiptRef || '') !==
                normalizeBankRef(existing.receiptRef) ||
              (p.targetProjectId ?? undefined) !==
                (existing.targetProjectId ?? undefined) ||
              (p.targetScholarId ?? undefined) !==
                (existing.targetScholarId ?? undefined);

            const finalizedStatusMutated =
              (existing.status === 'Onaylandı' ||
                existing.status === 'Reddedildi') &&
              p.status !== existing.status;

            if (coreFieldsMutated || finalizedStatusMutated) {
              res.status(422).json({
                error: 'IMMUTABLE_PAYMENT_RECORD_VIOLATION',
                message: `Değişmez ödeme kaydı ihlali (#39): Mevcut ödeme kaydının (${existing.id}) tutar, üye, açıklama, referans veya onay durumu değiştirilemez.`,
              });
              return;
            }

            if (
              existing.status === 'Bekliyor' &&
              p.status === 'Reddedildi' &&
              !isFinanceAdmin
            ) {
              res.status(403).json({
                error: 'RBAC_FORBIDDEN',
                message:
                  'Ödeme bildirimlerini reddetme yetkisi yalnızca Sayman ve Başkan rollerine aittir.',
              });
              return;
            }
          }

          const normRef = normalizeBankRef(p.receiptRef || '');
          if (!normRef) {
            res.status(400).json({
              error: 'MISSING_RECEIPT_REF',
              message: 'Dekont referans numarası (receiptRef) zorunludur.',
            });
            return;
          }

          if (p.status !== 'Reddedildi') {
            if (seenInPatchRefs.has(normRef)) {
              res.status(409).json({
                error: 'DUPLICATE_RECEIPT_REF',
                message: `Mükerrer dekont referansı engellendi (#39): "${normRef}" referans kodu birden fazla ödeme bildiriminde kullanılamaz.`,
              });
              return;
            }
            seenInPatchRefs.add(normRef);

            const isAlreadyExistingSameRecord =
              existing &&
              normalizeBankRef(existing.receiptRef) === normRef;

            if (
              !isAlreadyExistingSameRecord &&
              reservedServerRefs.has(normRef)
            ) {
              res.status(409).json({
                error: 'DUPLICATE_RECEIPT_REF',
                message: `Mükerrer dekont referansı engellendi (#39): "${normRef}" referans kodu başka bir ödeme veya mutabakat kaydında zaten kullanılmış.`,
              });
              return;
            }
          }
        }
      }

      // Issue #29 Fix: Validate hotel banquet confirmation workflow & LCV lock rules
      if (Array.isArray(incomingPatch.meetings)) {
        for (const m of incomingPatch.meetings) {
          const hasConfirmationRef =
            typeof m.hotelConfirmationRef === 'string' &&
            m.hotelConfirmationRef.trim().length > 0;
          if (hasConfirmationRef && !m.isLcvLockedForHotel) {
            res.status(422).json({
              error: 'HOTEL_CONFIRMATION_REQUIRES_LCV_LOCK',
              message:
                'Otel banket teyit referansı kaydedilmeden önce toplantı LCV listesi kilitlenmelidir (#29).',
            });
            return;
          }
        }
      }

      const activeMeetingInState =
        currentTenant.meetings.find(
          (m) => m.meetingNo === currentTenant.selectedMeetingNo
        ) || currentTenant.meetings[0];

      if (!isBoardAdmin && activeMeetingInState?.isLcvLockedForHotel) {
        const selfMemberExisting = currentTenant.members.find(
          (m) => m.id === user.memberId
        );
        const selfMemberIncoming = Array.isArray(incomingPatch.members)
          ? incomingPatch.members.find(
              (m: { id: string }) => m.id === user.memberId
            )
          : undefined;
        const rsvpChanged =
          (incomingPatch.rsvpStatus !== undefined &&
            incomingPatch.rsvpStatus !== currentTenant.rsvpStatus) ||
          (selfMemberIncoming &&
            selfMemberExisting &&
            (selfMemberIncoming.rsvpStatus !== selfMemberExisting.rsvpStatus ||
              selfMemberIncoming.mealPreference !==
                selfMemberExisting.mealPreference));

        if (rsvpChanged) {
          res.status(409).json({
            error: 'LCV_LOCKED_FOR_HOTEL',
            message: `Toplantı #${activeMeetingInState.meetingNo} kuver listesi otele bildirildiği ve kilitlendiği için LCV veya menü tercihi değiştirilemez (#29).`,
          });
          return;
        }
      }

      // Issue #46 Fix: Enforce strict volunteer shift capacity AND per-member identity authorization on the server
      if (Array.isArray(incomingPatch.volunteerShifts)) {
        const currentVolunteerShifts = currentTenant.volunteerShifts || [];
        const existingShiftsById = new Map(
          currentVolunteerShifts.map((s) => [s.id, s])
        );
        const selfNormalized = normalizePersonName(user.fullName);

        for (const slot of incomingPatch.volunteerShifts) {
          const existingSlot = existingShiftsById.get(slot?.id);
          const effectiveRequiredCount =
            !isBoardAdmin && existingSlot
              ? existingSlot.requiredCount
              : Number(slot?.requiredCount);

          if (
            Number.isFinite(effectiveRequiredCount) &&
            Array.isArray(slot?.assignedVolunteers) &&
            slot.assignedVolunteers.length > effectiveRequiredCount
          ) {
            res.status(422).json({
              error: 'SHIFT_CAPACITY_EXCEEDED',
              message: `Vardiya kontenjanı aşıldı (#46): "${slot.taskTitle || slot.roleTitle || slot.id}" vardiyası en fazla ${effectiveRequiredCount} gönüllü kabul edebilir.`,
            });
            return;
          }
        }

        if (!isBoardAdmin) {
          if (
            incomingPatch.volunteerShifts.length !==
            currentVolunteerShifts.length
          ) {
            res.status(403).json({
              error: 'VOLUNTEER_SHIFT_FORBIDDEN_MUTATION',
              message:
                'Gönüllü vardiya yetki sınırı (#46): Standart üye oturumu vardiya tanımlarını ekleyemez veya silemez.',
            });
            return;
          }

          for (const slot of incomingPatch.volunteerShifts) {
            const existingSlot = existingShiftsById.get(slot?.id);
            if (
              !existingSlot ||
              slot.eventTitle !== existingSlot.eventTitle ||
              slot.taskTitle !== existingSlot.taskTitle ||
              slot.shiftWindow !== existingSlot.shiftWindow ||
              slot.location !== existingSlot.location ||
              slot.requiredCount !== existingSlot.requiredCount ||
              !Array.isArray(slot.assignedVolunteers)
            ) {
              res.status(403).json({
                error: 'VOLUNTEER_SHIFT_FORBIDDEN_MUTATION',
                message:
                  'Gönüllü vardiya yetki sınırı (#46): Standart üye oturumu vardiya başlığı, saati, lokasyonu veya kontenjanını değiştiremez.',
              });
              return;
            }

            const existingNormList: string[] =
              existingSlot.assignedVolunteers.map(normalizePersonName);
            const incomingNormList: string[] = (
              slot.assignedVolunteers as string[]
            ).map(normalizePersonName);

            const existingOthers = existingNormList.filter(
              (n: string) => n !== selfNormalized
            );
            const incomingOthers = incomingNormList.filter(
              (n: string) => n !== selfNormalized
            );

            const othersUnchanged =
              existingOthers.length === incomingOthers.length &&
              existingOthers.every((val, idx) => val === incomingOthers[idx]);

            const selfCountInIncoming = incomingNormList.filter(
              (n: string) => n === selfNormalized
            ).length;

            if (!othersUnchanged || selfCountInIncoming > 1) {
              res.status(403).json({
                error: 'VOLUNTEER_SHIFT_FORBIDDEN_MUTATION',
                message: `Gönüllü vardiya yetki sınırı (#46): Standart üye oturumu (${user.fullName}) yalnızca kendi vardiya kaydını ekleyebilir veya çıkarabilir; başka üyelerin vardiya atamalarını değiştiremez.`,
              });
              return;
            }
          }
        }
      }

      // Issue #46 Fix: Also prevent regular members from altering other members' names in project volunteer lists
      if (Array.isArray(incomingPatch.projects) && !isBoardAdmin) {
        const selfNormalized = normalizePersonName(user.fullName);
        for (const incProj of incomingPatch.projects) {
          const existingProj = currentTenant.projects.find(
            (p) => p.id === incProj?.id
          );
          if (!existingProj || !Array.isArray(incProj?.volunteers)) continue;
          const existingOthers = (existingProj.volunteers || [])
            .map(normalizePersonName)
            .filter((n) => n !== selfNormalized);
          const incomingOthers = incProj.volunteers
            .map(normalizePersonName)
            .filter((n: string) => n !== selfNormalized);
          const othersUnchanged =
            existingOthers.length === incomingOthers.length &&
            existingOthers.every((val, idx) => val === incomingOthers[idx]);
          if (!othersUnchanged) {
            res.status(403).json({
              error: 'VOLUNTEER_SHIFT_FORBIDDEN_MUTATION',
              message: `Proje gönüllü yetki sınırı (#46): Standart üye oturumu (${user.fullName}) yalnızca kendi gönüllü kaydını güncelleyebilir.`,
            });
            return;
          }
        }
      }

      // Issue #51 Fix: Block regular members from mutating specialized project financial/quota modules
      if (incomingPatch.specializedModules !== undefined && !isBoardAdmin) {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message:
            'Özel proje modülleri (Kermes, GALATART, RYLA) bütçe ve kontenjan parametreleri yalnızca Yönetim Kurulu yetkilileri tarafından güncellenebilir (#51).',
        });
        return;
      }

      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => {
          // Issue #39 Fix: Existing projects' collectedAmount & supportersCount can ONLY increase via /api/pilot/reconcile-payment
          const sanitizedProjects = Array.isArray(incomingPatch.projects)
            ? isBoardAdmin
              ? incomingPatch.projects.map(
                  (incProj: { id: string; volunteers?: string[] }) => {
                    const existingProj = curr.projects.find(
                      (p) => p.id === incProj.id
                    );
                    if (!existingProj) {
                      return {
                        ...incProj,
                        collectedAmount: 0,
                        supportersCount: 0,
                      };
                    }
                    return {
                      ...existingProj,
                      ...incProj,
                      collectedAmount: existingProj.collectedAmount,
                      supportersCount: existingProj.supportersCount,
                    };
                  }
                )
              : curr.projects.map((existingProj) => {
                  const match = incomingPatch.projects.find(
                    (p: { id: string }) => p.id === existingProj.id
                  );
                  if (!match) return existingProj;
                  return {
                    ...existingProj,
                    volunteers: Array.isArray(match.volunteers)
                      ? match.volunteers
                      : existingProj.volunteers,
                  };
                })
            : curr.projects;

          // Issue #39 Fix: Existing scholars' fundedMonths can ONLY increase via /api/pilot/reconcile-payment
          const sanitizedScholars = Array.isArray(incomingPatch.scholars)
            ? curr.scholars.map((existingSch) => {
                const match = incomingPatch.scholars.find(
                  (s: { id: string }) => s.id === existingSch.id
                );
                if (!match || !isBoardAdmin) return existingSch;
                return {
                  ...existingSch,
                  ...match,
                  fundedMonths: existingSch.fundedMonths,
                };
              })
            : curr.scholars;

          const effectiveSelectedMeetingKey = String(
            isBoardAdmin && incomingPatch.selectedMeetingNo !== undefined
              ? incomingPatch.selectedMeetingNo
              : curr.selectedMeetingNo || 1842
          );

          // Issue #14, #16, #32 & #39 Fix: Safe member merge that NEVER overwrites server state with KVKK-redacted fields or altered debt balances, and tracks per-meeting RSVP!
          const sanitizedMembers: RotaryMember[] = Array.isArray(
            incomingPatch.members
          )
            ? isBoardAdmin
              ? incomingPatch.members.map((incMember: RotaryMember) => {
                  const existing = curr.members.find(
                    (m) => m.id === incMember.id
                  );
                  if (!existing) {
                    return {
                      ...incMember,
                      duesBalance: 0,
                      mealBalance: 0,
                      foundationBalance: 0,
                      meetingRsvps: {
                        [effectiveSelectedMeetingKey]:
                          incMember.rsvpStatus || 'pending',
                        ...(incMember.meetingRsvps || {}),
                      },
                    };
                  }
                  const nextRsvp = incMember.rsvpStatus ?? existing.rsvpStatus;
                  return {
                    ...existing,
                    ...incMember,
                    rsvpStatus: nextRsvp,
                    meetingRsvps: {
                      ...(existing.meetingRsvps || {}),
                      ...(incMember.meetingRsvps || {}),
                      [effectiveSelectedMeetingKey]:
                        incMember.meetingRsvps?.[effectiveSelectedMeetingKey] ??
                        nextRsvp,
                    },
                    // Never clobber unmasked PII with KVKK-masked strings
                    phone:
                      incMember.phone && !incMember.phone.includes('***')
                        ? incMember.phone
                        : existing.phone,
                    email:
                      incMember.email && !incMember.email.includes('***@')
                        ? incMember.email
                        : existing.email,
                    bloodGroup:
                      incMember.bloodGroup &&
                      incMember.bloodGroup !== 'KVKK Gizli'
                        ? incMember.bloodGroup
                        : existing.bloodGroup,
                    birthday:
                      incMember.birthday &&
                      incMember.birthday !== 'KVKK Gizli'
                        ? incMember.birthday
                        : existing.birthday,
                    spouseName: incMember.spouseName ?? existing.spouseName,
                    weddingAnniversary:
                      incMember.weddingAnniversary ??
                      existing.weddingAnniversary,
                    // Member debt balances & lifecycle transitions are strictly server-managed (#24-#26, #39)
                    duesBalance: existing.duesBalance,
                    mealBalance: existing.mealBalance,
                    foundationBalance: existing.foundationBalance,
                    membershipStatus: existing.membershipStatus,
                    leaveStartDate: existing.leaveStartDate,
                    leaveEndDate: existing.leaveEndDate,
                    leaveReason: existing.leaveReason,
                    lifecycleHistory: existing.lifecycleHistory,
                  };
                })
              : curr.members.map((existingMember) => {
                  if (existingMember.id !== user.memberId) return existingMember;
                  const selfPatch = incomingPatch.members.find(
                    (m: { id: string }) => m.id === user.memberId
                  );
                  if (!selfPatch) return existingMember;
                  const nextRsvp =
                    selfPatch.rsvpStatus ?? existingMember.rsvpStatus;
                  return {
                    ...existingMember,
                    rsvpStatus: nextRsvp,
                    mealPreference:
                      selfPatch.mealPreference ??
                      existingMember.mealPreference,
                    reminderOptOut:
                      selfPatch.reminderOptOut ??
                      existingMember.reminderOptOut,
                    preferredReminderChannel:
                      selfPatch.preferredReminderChannel ??
                      existingMember.preferredReminderChannel,
                    meetingRsvps: {
                      ...(existingMember.meetingRsvps || {}),
                      ...(selfPatch.meetingRsvps || {}),
                      [effectiveSelectedMeetingKey]:
                        selfPatch.meetingRsvps?.[effectiveSelectedMeetingKey] ??
                        nextRsvp,
                    },
                  };
                })
            : incomingPatch.rsvpStatus !== undefined
            ? curr.members.map((existingMember) =>
                existingMember.id === user.memberId
                  ? {
                      ...existingMember,
                      rsvpStatus: incomingPatch.rsvpStatus,
                      meetingRsvps: {
                        ...(existingMember.meetingRsvps || {}),
                        [effectiveSelectedMeetingKey]: incomingPatch.rsvpStatus,
                      },
                    }
                  : existingMember
              )
            : curr.members;

          const nowTrStamp = formatNowTR();

          const normalizeAuditTrailEntries = (
            entries: MakeupAuditHistoryEntry[] | undefined,
            fallbackActorId: string,
            fallbackActorName: string,
            fallbackStatus: MakeupStatus
          ): MakeupAuditHistoryEntry[] => {
            if (!Array.isArray(entries) || entries.length === 0) return [];
            return entries.map((raw) => {
              const rec = raw as unknown as Record<string, unknown>;
              return {
                timestamp: String(raw.timestamp || rec.at || nowTrStamp),
                actorId: String(
                  raw.actorId || rec.actorMemberId || fallbackActorId
                ),
                actorName: String(raw.actorName || fallbackActorName),
                actorRole: (raw.actorRole as ClubRole) || 'uye',
                ...(raw.fromStatus ? { fromStatus: raw.fromStatus } : {}),
                toStatus: raw.toStatus || fallbackStatus,
                ...(raw.note ? { note: String(raw.note) } : {}),
              };
            });
          };

          const sanitizedMakeupSubmissions: MakeupSubmission[] = Array.isArray(
            incomingPatch.makeupSubmissions
          )
            ? isMakeupApprover
              ? incomingPatch.makeupSubmissions.map(
                  (mk: {
                    id: string;
                    memberId?: string;
                    memberName: string;
                    targetClubOrEvent: string;
                    activityType: MakeupSubmission['activityType'];
                    date: string;
                    description: string;
                    evidenceRef?: string;
                    reviewerNote?: string;
                    appealNote?: string;
                    status: MakeupSubmission['status'];
                  }): MakeupSubmission => {
                    const existingMk = curr.makeupSubmissions.find(
                      (ex) => ex.id === mk.id
                    );
                    const resolvedMemberId =
                      existingMk?.memberId ||
                      mk.memberId ||
                      resolveUnambiguousLegacyMemberId(
                        mk.memberName,
                        curr.members
                      );
                    const prevTrail = normalizeAuditTrailEntries(
                      existingMk?.auditTrail,
                      resolvedMemberId || user.memberId,
                      mk.memberName || user.fullName,
                      existingMk?.status || mk.status
                    );
                    const statusChanged =
                      !existingMk || existingMk.status !== mk.status;
                    const newTrailEntry: MakeupAuditHistoryEntry | null =
                      statusChanged
                        ? {
                            timestamp: nowTrStamp,
                            actorId: user.memberId,
                            actorName: user.fullName,
                            actorRole: user.role,
                            ...(existingMk?.status
                              ? { fromStatus: existingMk.status }
                              : {}),
                            toStatus: mk.status,
                            note:
                              mk.reviewerNote ||
                              mk.appealNote ||
                              (existingMk
                                ? `Durum güncellendi: ${existingMk.status} -> ${mk.status}`
                                : 'Make-up kaydı oluşturuldu'),
                          }
                        : null;
                    return {
                      id: mk.id,
                      ...(resolvedMemberId
                        ? { memberId: resolvedMemberId }
                        : {}),
                      memberName: mk.memberName || existingMk?.memberName || '',
                      targetClubOrEvent: mk.targetClubOrEvent,
                      activityType: mk.activityType,
                      date: mk.date,
                      description: mk.description || '',
                      ...(mk.evidenceRef ?? existingMk?.evidenceRef
                        ? {
                            evidenceRef:
                              mk.evidenceRef ?? existingMk?.evidenceRef,
                          }
                        : {}),
                      ...(mk.reviewerNote ?? existingMk?.reviewerNote
                        ? {
                            reviewerNote:
                              mk.reviewerNote ?? existingMk?.reviewerNote,
                          }
                        : {}),
                      ...(mk.appealNote ?? existingMk?.appealNote
                        ? {
                            appealNote: mk.appealNote ?? existingMk?.appealNote,
                          }
                        : {}),
                      status: mk.status,
                      attendanceBoost: mk.status === 'Onaylandı' ? 3 : 0,
                      reviewedBy: statusChanged
                        ? `${user.fullName} (${user.role})`
                        : existingMk?.reviewedBy,
                      reviewedAt: statusChanged
                        ? nowTrStamp
                        : existingMk?.reviewedAt,
                      auditTrail: newTrailEntry
                        ? [...prevTrail, newTrailEntry]
                        : prevTrail,
                    };
                  }
                )
              : (() => {
                  const updatedExisting: MakeupSubmission[] =
                    curr.makeupSubmissions.map(
                      (existingMk): MakeupSubmission => {
                        const incMatch = incomingPatch.makeupSubmissions.find(
                          (m: { id: string }) => m.id === existingMk.id
                        );
                        if (!incMatch) return existingMk;
                        const ownerId =
                          existingMk.memberId ||
                          resolveUnambiguousLegacyMemberId(
                            existingMk.memberName,
                            curr.members
                          );
                        if (ownerId !== user.memberId) return existingMk;
                        const nextStatus: MakeupStatus =
                          incMatch.status || existingMk.status;
                        const prevTrail = normalizeAuditTrailEntries(
                          existingMk.auditTrail,
                          user.memberId,
                          user.fullName,
                          existingMk.status
                        );
                        const statusChanged = nextStatus !== existingMk.status;
                        const newTrailEntry: MakeupAuditHistoryEntry | null =
                          statusChanged
                            ? {
                                timestamp: nowTrStamp,
                                actorId: user.memberId,
                                actorName: user.fullName,
                                actorRole: user.role,
                                fromStatus: existingMk.status,
                                toStatus: nextStatus,
                                note:
                                  incMatch.appealNote ||
                                  `Üye işlemi: ${existingMk.status} -> ${nextStatus}`,
                              }
                            : null;
                        return {
                          ...existingMk,
                          targetClubOrEvent:
                            incMatch.targetClubOrEvent ??
                            existingMk.targetClubOrEvent,
                          activityType:
                            incMatch.activityType ?? existingMk.activityType,
                          date: incMatch.date ?? existingMk.date,
                          description:
                            incMatch.description ?? existingMk.description,
                          evidenceRef:
                            incMatch.evidenceRef ?? existingMk.evidenceRef,
                          appealNote:
                            incMatch.appealNote ?? existingMk.appealNote,
                          status: nextStatus,
                          memberId: user.memberId,
                          attendanceBoost: existingMk.attendanceBoost,
                          auditTrail: newTrailEntry
                            ? [...prevTrail, newTrailEntry]
                            : prevTrail,
                        };
                      }
                    );
                  const newlyAdded: MakeupSubmission[] =
                    incomingPatch.makeupSubmissions
                      .filter(
                        (mk: { id: string }) =>
                          !curr.makeupSubmissions.some((ex) => ex.id === mk.id)
                      )
                      .map(
                        (mk: {
                          id: string;
                          targetClubOrEvent: string;
                          activityType: MakeupSubmission['activityType'];
                          date: string;
                          description: string;
                          evidenceRef?: string;
                          status?: MakeupStatus;
                        }): MakeupSubmission => {
                          const initialStatus: MakeupStatus =
                            mk.status === 'Taslak' ? 'Taslak' : 'İnceleniyor';
                          const initialTrailEntry: MakeupAuditHistoryEntry = {
                            timestamp: nowTrStamp,
                            actorId: user.memberId,
                            actorName: user.fullName,
                            actorRole: user.role,
                            toStatus: initialStatus,
                            note:
                              initialStatus === 'Taslak'
                                ? 'Üye tarafından taslak olarak kaydedildi'
                                : 'Üye tarafından incelemeye gönderildi',
                          };
                          return {
                            id: mk.id,
                            targetClubOrEvent: mk.targetClubOrEvent,
                            activityType: mk.activityType,
                            date: mk.date,
                            description: mk.description || '',
                            ...(mk.evidenceRef
                              ? { evidenceRef: mk.evidenceRef }
                              : {}),
                            memberId: user.memberId,
                            memberName: user.fullName,
                            status: initialStatus,
                            attendanceBoost: 0,
                            auditTrail: [initialTrailEntry],
                          };
                        }
                      );
                  return [...newlyAdded, ...updatedExisting];
                })()
            : curr.makeupSubmissions;

          const sanitizedGuestMakeupCards: GuestRotaryMakeupCard[] =
            isMakeupApprover && Array.isArray(incomingPatch.guestMakeupCards)
              ? incomingPatch.guestMakeupCards.map(
                  (card: {
                    id: string;
                    guestName: string;
                    guestClub: string;
                    guestDistrict?: string;
                    guestEmail: string;
                    meetingNo: number;
                    meetingDate: string;
                    sentAt: string;
                  }): GuestRotaryMakeupCard => {
                    const existingCard = curr.guestMakeupCards.find(
                      (ex) => ex.id === card.id
                    );
                    if (existingCard) {
                      return existingCard;
                    }
                    const schemaVersion = 1;
                    const issuedByMemberId = user.memberId;
                    const draftStatus = 'Taslak' as const;
                    const cardForHmac = {
                      id: card.id,
                      guestName: card.guestName,
                      guestClub: card.guestClub,
                      guestDistrict: card.guestDistrict || 'UR 2420. Bölge',
                      meetingNo: card.meetingNo,
                      meetingDate: card.meetingDate,
                      schemaVersion,
                      issuedByMemberId,
                      status: draftStatus,
                    };
                    return {
                      id: card.id,
                      guestName: card.guestName,
                      guestClub: card.guestClub,
                      guestDistrict: card.guestDistrict || 'UR 2420. Bölge',
                      guestEmail: card.guestEmail || '',
                      meetingNo: card.meetingNo,
                      meetingDate: card.meetingDate,
                      sentAt: card.sentAt || nowTrStamp,
                      schemaVersion,
                      status: draftStatus,
                      issuedByMemberId,
                      issuedByName: user.fullName,
                      issuedByRole: user.role,
                      approvalHistory: [
                        {
                          timestamp: nowTrStamp,
                          action: 'TASLAK_OLUSTURULDU',
                          actorId: user.memberId,
                          actorName: user.fullName,
                          actorRole: user.role,
                          note: 'Misafir katılım belgesi taslağı oluşturuldu (onay kapısı bekliyor)',
                        },
                      ],
                      verificationCode:
                        computeGuestCertificateVerificationCode(
                          authorizedClubId,
                          cardForHmac
                        ),
                    };
                  }
                )
              : curr.guestMakeupCards;

          return {
            ...curr,
            rsvpStatus: incomingPatch.rsvpStatus ?? curr.rsvpStatus,
            menuPreference: incomingPatch.menuPreference ?? curr.menuPreference,
            guestNameInput: incomingPatch.guestNameInput ?? curr.guestNameInput,
            selectedMeetingNo:
              isBoardAdmin && incomingPatch.selectedMeetingNo !== undefined
                ? incomingPatch.selectedMeetingNo
                : curr.selectedMeetingNo,
            qrCheckedIn: curr.qrCheckedIn,
            meetingAttendances: curr.meetingAttendances || {},
            makeupSubmissions: sanitizedMakeupSubmissions,
            speakerProposals:
              incomingPatch.speakerProposals ?? curr.speakerProposals,
            celebrations: incomingPatch.celebrations ?? curr.celebrations,
            firesideGroups: incomingPatch.firesideGroups ?? curr.firesideGroups,
            projects: sanitizedProjects,
            scholars: sanitizedScholars,
            termInfo:
              isBoardAdmin && incomingPatch.termInfo
                ? incomingPatch.termInfo
                : curr.termInfo,
            meetings:
              isBoardAdmin && incomingPatch.meetings
                ? incomingPatch.meetings
                : curr.meetings,
            ritualSteps:
              isBoardAdmin && incomingPatch.ritualSteps
                ? incomingPatch.ritualSteps
                : curr.ritualSteps,
            guestMakeupCards: sanitizedGuestMakeupCards,
            boardResolutions:
              isBoardAdmin && Array.isArray(incomingPatch.boardResolutions)
                ? (() => {
                    const existingServerVerified = (
                      curr.boardResolutions || []
                    ).filter(
                      (r) =>
                        r.serverVerified ||
                        r.resolutionScope === 'DEBT_WAIVER_ON_EXIT'
                    );
                    const existingServerVerifiedIds = new Set(
                      existingServerVerified.map((r) => r.id)
                    );
                    const sanitizedGeneric = incomingPatch.boardResolutions
                      .filter(
                        (r: { id?: string }) =>
                          r &&
                          typeof r.id === 'string' &&
                          !existingServerVerifiedIds.has(r.id)
                      )
                      .map((r: BoardResolutionItem) => ({
                        id: r.id,
                        resolutionNo: r.resolutionNo || r.decisionNo || r.id,
                        decisionNo: r.decisionNo || r.resolutionNo || r.id,
                        date: r.date,
                        title: r.title,
                        category: r.category,
                        summary: r.summary || r.title,
                        voteStatus: r.voteStatus || 'Oybirliği ile Kabul',
                        signedBy: r.signedBy,
                        clubId: authorizedClubId,
                        resolutionScope: 'GENERAL_GOVERNANCE' as const,
                        serverVerified: false,
                      }));
                    return [...existingServerVerified, ...sanitizedGeneric];
                  })()
                : curr.boardResolutions,
            kvkkMaskPhone:
              isBoardAdmin && typeof incomingPatch.kvkkMaskPhone === 'boolean'
                ? incomingPatch.kvkkMaskPhone
                : curr.kvkkMaskPhone,
            paymentNotifications: Array.isArray(
              incomingPatch.paymentNotifications
            )
              ? isFinanceAdmin
                ? incomingPatch.paymentNotifications.map(
                    (p: { id: string; status: 'Bekliyor' | 'Onaylandı' | 'Reddedildi'; receiptRef: string }) => {
                      const ex = curr.paymentNotifications.find(
                        (item) => item.id === p.id
                      );
                      if (ex) {
                        // Preserve 100% of immutable server fields; only allow status 'Bekliyor' -> 'Reddedildi'
                        return {
                          ...ex,
                          status:
                            ex.status === 'Bekliyor' && p.status === 'Reddedildi'
                              ? ('Reddedildi' as const)
                              : ex.status,
                        };
                      }
                      return {
                        ...p,
                        status: 'Bekliyor' as const,
                        receiptRef: normalizeBankRef(p.receiptRef),
                      };
                    }
                  )
                : [
                    ...incomingPatch.paymentNotifications
                      .filter(
                        (p: { id: string; memberId: string; status: string }) =>
                          p.memberId === user.memberId &&
                          p.status === 'Bekliyor' &&
                          !curr.paymentNotifications.some((ex) => ex.id === p.id)
                      )
                      .map((p: { receiptRef: string }) => ({
                        ...p,
                        memberId: user.memberId,
                        memberName: user.fullName,
                        status: 'Bekliyor' as const,
                        receiptRef: normalizeBankRef(p.receiptRef),
                      })),
                    ...curr.paymentNotifications,
                  ]
              : curr.paymentNotifications,
            volunteerShifts: Array.isArray(incomingPatch.volunteerShifts)
              ? isBoardAdmin
                ? incomingPatch.volunteerShifts.map(
                    (slot: {
                      id: string;
                      eventTitle: string;
                      taskTitle: string;
                      shiftWindow: string;
                      location: string;
                      requiredCount: number;
                      assignedVolunteers: string[];
                    }) => ({
                      ...slot,
                      assignedVolunteers: Array.from(
                        new Set(
                          Array.isArray(slot.assignedVolunteers)
                            ? slot.assignedVolunteers
                            : []
                        )
                      ).slice(0, Math.max(0, Number(slot.requiredCount) || 0)),
                    })
                  )
                : (curr.volunteerShifts || []).map((existingSlot) => {
                    const match = incomingPatch.volunteerShifts.find(
                      (s: { id: string }) => s.id === existingSlot.id
                    );
                    if (!match || !Array.isArray(match.assignedVolunteers)) {
                      return existingSlot;
                    }
                    return {
                      ...existingSlot,
                      assignedVolunteers: Array.from(
                        new Set(match.assignedVolunteers as string[])
                      ).slice(0, Math.max(0, existingSlot.requiredCount)),
                    };
                  })
              : curr.volunteerShifts,
            specializedModules:
              (isBoardAdmin || isFinanceAdmin) &&
              incomingPatch.specializedModules
                ? incomingPatch.specializedModules
                : curr.specializedModules,
            members: sanitizedMembers,
          };
        },
        expectedRevision,
        (updatedState) => {
          // Security Audit (#18): NEVER trust client-supplied auditEvent.action, auditEvent.detail, or auditEvent.module!
          // Derive module, action, and detail strictly on the server from the actual mutated state fields.
          const candidateKeys = Object.keys(incomingPatch);
          const actuallyMutatedKeys = candidateKeys.filter((k) => {
            const key = k as keyof typeof updatedState;
            return (
              JSON.stringify(currentTenant[key]) !==
              JSON.stringify(updatedState[key])
            );
          });
          const effectiveKeys =
            actuallyMutatedKeys.length > 0 ? actuallyMutatedKeys : candidateKeys;

          let serverModule: AuditLogEntry['module'] = 'Yönetim & Güvenlik';
          if (
            effectiveKeys.some((k) =>
              [
                'rsvpStatus',
                'menuPreference',
                'guestNameInput',
                'meetings',
                'ritualSteps',
                'speakerProposals',
                'celebrations',
                'firesideGroups',
              ].includes(k)
            )
          ) {
            serverModule = 'LCV & Kuver';
          } else if (
            effectiveKeys.some((k) =>
              ['makeupSubmissions', 'guestMakeupCards'].includes(k)
            )
          ) {
            serverModule = 'QR Yoklama & Make-up';
          } else if (effectiveKeys.includes('paymentNotifications')) {
            serverModule = 'Saymanlık & Kasa';
          } else if (
            effectiveKeys.some((k) =>
              [
                'projects',
                'scholars',
                'volunteerShifts',
                'specializedModules',
              ].includes(k)
            )
          ) {
            serverModule = 'Projeler & Burslar';
          }

          const serverAction = `Sunucu Doğrulamalı Durum Güncellemesi [Rev #${
            updatedState.revision
          }: ${effectiveKeys.join(', ') || 'no-op'}]`;
          const serverDetail = `Sunucu fark analizi (#18): ${user.fullName} (${
            user.role
          }) oturumu ile [${
            actuallyMutatedKeys.join(', ') || 'değişiklik yok'
          }] alanları doğrulandı ve kaydedildi (İstemci metni yoksayıldı).`;

          return {
            actorName: `${user.fullName} (${user.rotaryId})`,
            actorRole: user.role,
            module: serverModule,
            action: serverAction,
            detail: serverDetail,
            timestamp: formatNowTR(),
          };
        }
      );

      if (!casResult.ok) {
        const status = casResult.reason === 'REVISION_REQUIRED' ? 428 : 409;
        res.status(status).json({
          error: casResult.reason,
          message: `Veri sürümü çakışması (#14): İstemci revizyonu (${expectedRevision}) sunucu revizyonu (${casResult.currentRevision}) ile eşleşmiyor.`,
          currentRevision: casResult.currentRevision,
        });
        return;
      }

      const updatedTenant = casResult.state;
      const ledger = store.getAuditLedger(authorizedClubId);
      const redacted = redactStateForRole(updatedTenant, ledger, user);
      res.json({
        ok: true,
        revision: updatedTenant.revision,
        updatedAt: updatedTenant.updatedAt,
        auditLogs: redacted.auditLogs,
        auditVerification: verifyAuditChain(ledger, authorizedClubId),
        state: redacted,
      });
    } catch (err) {
      res.status(500).json({
        error: 'SYNC_WRITE_ERROR',
        message:
          err instanceof Error ? err.message : 'Senkronizasyon yazma hatası',
      });
    }
  });

  // 9. Protected Reset Endpoint — Strictly 'baskan' Only, Tenant-Scoped & Preserves Audit Ledger (#14, #18, #23, #70)
  app.post(
    '/api/pilot/reset',
    requireServerRole(['baskan']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const requestedClubId =
          typeof req.body?.clubId === 'string' ? req.body.clubId.trim() : undefined;
        const authorizedClubId = verifyTenantBoundary(
          user,
          requestedClubId,
          store,
          res
        );
        if (!authorizedClubId) return;

        const freshTenant = store.resetTenantOperationalData(
          authorizedClubId,
          user,
          formatNowTR()
        );
        const ledger = store.getAuditLedger(authorizedClubId);
        res.json(redactStateForRole(freshTenant, ledger, user));
      } catch (err) {
        res.status(500).json({
          error: 'RESET_WRITE_ERROR',
          message: err instanceof Error ? err.message : 'Sıfırlama hatası',
        });
      }
    }
  );

  // 10a. Protected Tenant-Scoped Database & Hash-Chained Audit Backup — Strictly Board Officers Only (#19, #20, #70)
  app.get(
    '/api/pilot/backup',
    requireServerRole(['baskan', 'sekreter', 'sayman']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const requestedClubId =
          typeof req.query.clubId === 'string' ? req.query.clubId.trim() : undefined;
        const authorizedClubId = verifyTenantBoundary(
          user,
          requestedClubId,
          store,
          res
        );
        if (!authorizedClubId) return;

        store.appendAuditEntry({
          clubId: authorizedClubId,
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Yönetim & Güvenlik',
          action:
            'Kulüp Veritabanı & SHA-256 Denetim Zinciri Yedeği Alındı (.JSON)',
          detail: `${user.fullName} (${user.role}) tarafından yalnızca ${authorizedClubId} kulübüne ait izole veritabanı ve kriptografik denetim defteri dışa aktarıldı.`,
          timestamp: formatNowTR(),
        });

        const tenantBackup = store.getTenantBackupSnapshot(authorizedClubId);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="RotaClub_${authorizedClubId}_Backup_v5_3.json"`
        );
        res.send(
          JSON.stringify(
            {
              ...tenantBackup,
              exportedBy: {
                memberId: user.memberId,
                rotaryId: user.rotaryId,
                fullName: user.fullName,
                role: user.role,
                clubId: user.clubId,
              },
            },
            null,
            2
          )
        );
      } catch (err) {
        res.status(500).json({
          error: 'BACKUP_ERROR',
          message: err instanceof Error ? err.message : 'Yedekleme hatası',
        });
      }
    }
  );

  // 10b. Verified Tenant Backup Restore Endpoint — Strictly 'baskan' Only (#19, #70)
  app.post(
    '/api/pilot/restore',
    requireServerRole(['baskan']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const { clubId, backup } = req.body || {};
        const authorizedClubId = verifyTenantBoundary(
          user,
          typeof clubId === 'string' ? clubId : undefined,
          store,
          res
        );
        if (!authorizedClubId) return;

        const restored = store.restoreTenantFromVerifiedBackup({
          clubId: authorizedClubId,
          backupPayload: backup,
          actor: user,
          timestamp: formatNowTR(),
        });

        if (!restored.ok) {
          res.status(422).json({
            error: restored.error,
            message: restored.message,
          });
          return;
        }

        const ledger = store.getAuditLedger(authorizedClubId);
        res.json({
          ok: true,
          revision: restored.state.revision,
          state: redactStateForRole(restored.state, ledger, user),
        });
      } catch (err) {
        res.status(500).json({
          error: 'RESTORE_ERROR',
          message: err instanceof Error ? err.message : 'Yedek geri yükleme hatası',
        });
      }
    }
  );

  // 11. Public Account Directory Metadata (Zero PIN or password hash exposure! #22)
  app.get('/api/auth/pilot-accounts', (_req, res) => {
    res.json({
      bootstrapClaimRequired: store.getBootstrapStatus().bootstrapClaimRequired,
      accounts: store.getAccounts().map((a) => ({
        memberId: a.memberId,
        rotaryId: a.rotaryId,
        fullName: a.fullName,
        email: a.email,
        role: a.role,
        clubId: a.clubId,
        activated: a.activated !== false,
        allowedClubs: a.clubMemberships.map((m) => m.clubId),
        hasPasskey: a.webauthnCredentials.length > 0,
      })),
    });
  });

  return { app, store, issueSignedToken, revokeTokenJti };
}

async function startServer() {
  const { app } = createPilotExpressApp();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `RotaClub Hardened Pilot Server v5.3 running on http://localhost:${PORT}`
    );
  });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  startServer();
}
