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
  isAllowedTenantClubId,
  issueSignedToken,
  normalizeBankRef,
  normalizePersonName,
  redactStateForRole,
  revokeTokenJti,
  verifyAndExtractWebAuthnRegistration,
  verifyAuditChain,
  verifySignedToken,
} from './src/server/pilotEngine';
import {
  AuditLogEntry,
  ClubRole,
  FinancialLineItem,
  RotaryMember,
  TreasuryLedgerEntry,
} from './src/types/rotary';

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
  }
) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

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
        authorizedClubId
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
        action: `Üye / Görevli Hesap Parolası Başkan Tarafından Etkinleştirildi: ${targetAcc.fullName}`,
        detail: `${targetAcc.fullName} (${targetAcc.rotaryId}) hesabı yeni CSPRNG salt ve Scrypt özetiyle etkinleştirildi.`,
        timestamp: formatNowTR(),
      });

      res.json({
        ok: true,
        rotaryId: targetAcc.rotaryId,
        activated: true,
      });
    }
  );

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
          tenant.revision
        );

        if (!casResult.ok) {
          res.status(409).json({
            error: 'REVISION_CONFLICT',
            currentRevision: casResult.currentRevision,
          });
          return;
        }

        store.appendAuditEntry({
          clubId: authorizedClubId,
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Saymanlık & Kasa',
          action: `Banka Mutabakatlı Tahsilat Onayı (${canonicalRef})`,
          detail: `${payment.memberName} (${payment.amount} TL) ödemesi banka ekstresiyle eşleştirildi ve mükerrer kayıt korumasıyla kasa defterine işlendi.`,
          timestamp: formatNowTR(),
        });

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
          tenant.revision
        );

        if (!casResult.ok) {
          res.status(409).json({
            error: 'REVISION_CONFLICT',
            currentRevision: casResult.currentRevision,
          });
          return;
        }

        store.appendAuditEntry({
          clubId: authorizedClubId,
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Saymanlık & Kasa',
          action: `Sunucu Doğrulamalı Gider Kaydı (${canonicalRef})`,
          detail: `${newEntry.title} (${newEntry.counterparty} · ${newEntry.amount} TL) mükerrer belge kontrolüyle kasa defterine işlendi.`,
          timestamp: formatNowTR(),
        });

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

  // 7c. Server-Managed Bulk Member Dues/Kuver Accrual Endpoint with Idempotency Protection (#39, #70, #76)
  app.post(
    '/api/pilot/accrue-dues',
    requireServerRole(['sayman', 'baskan']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const {
          clubId,
          category,
          amount,
          amountPerMember,
          description,
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

        if (!description || !String(description).trim()) {
          res.status(400).json({
            error: 'MISSING_ACCRUAL_DESCRIPTION',
            message: 'Tahakkuk açıklaması (description) zorunludur.',
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
        const normalizedDesc = normalizePersonName(String(description));
        const canonicalIdempotencyKey =
          typeof idempotencyKey === 'string' && idempotencyKey.trim()
            ? idempotencyKey.trim()
            : `${safeCategory}::${safePeriod}::${normalizedDesc}`;

        const tenant = store.getTenantState(authorizedClubId);

        // Issue #39 / #76 Fix: Block duplicate bulk accruals (idempotency check) so members can never be double-charged!
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
            message: `Mükerrer tahakkuk engellendi (#39): "${String(
              description
            ).trim()}" (${safePeriod}) için toplu borç tahakkuku zaten uygulanmış; çift borç oluşturulamaz.`,
          });
          return;
        }

        const casResult = store.updateTenant(
          authorizedClubId,
          (curr) => {
            const nextMembers = curr.members.map((m) => {
              if (safeCategory === 'Dönem Aidatı') {
                return { ...m, duesBalance: m.duesBalance + numAmount };
              }
              if (safeCategory === 'Toplantı Kuver Bakiyesi') {
                return { ...m, mealBalance: m.mealBalance + numAmount };
              }
              return {
                ...m,
                foundationBalance: m.foundationBalance + numAmount,
              };
            });

            const nextFinancialItems: FinancialLineItem[] = [
              ...curr.financialItems,
              {
                id: `fin-${Date.now()}`,
                category: safeCategory,
                title: String(description).trim(),
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
          tenant.revision
        );

        if (!casResult.ok) {
          res.status(409).json({
            error: 'REVISION_CONFLICT',
            currentRevision: casResult.currentRevision,
          });
          return;
        }

        store.appendAuditEntry({
          clubId: authorizedClubId,
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Saymanlık & Kasa',
          action: `Sunucu Yönetimli Tekil Tahakkuk (${safeCategory}: ${numAmount} TL)`,
          detail: `Tüm kulüp üyelerinin "${safeCategory}" cari bakiyesine "${String(
            description
          ).trim()}" kalemi tekil işlem anahtarıyla (${canonicalIdempotencyKey}) tahakkuk ettirildi.`,
          timestamp: formatNowTR(),
        });

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

      // Issue #39 Fix: Close ALL direct client write paths to treasuryLedger, bankStatements, financialItems, and overdueMembers!
      if (
        'treasuryLedger' in incomingPatch ||
        'bankStatements' in incomingPatch ||
        'financialItems' in incomingPatch ||
        'overdueMembers' in incomingPatch
      ) {
        res.status(422).json({
          error: 'DIRECT_LEDGER_MUTATION_FORBIDDEN',
          message:
            'Muhasebe bütünlüğü koruması (#39): Kasa defteri (treasuryLedger), banka ekstreleri ve finansal tahakkuk tabloları /api/pilot/sync üzerinden doğrudan değiştirilemez. Lütfen /api/pilot/reconcile-payment, /api/pilot/reconcile-expense veya /api/pilot/accrue-dues uç noktalarını kullanın.',
        });
        return;
      }

      // Issue #39 Fix: Block direct client mutation of member debt balances via /api/pilot/sync
      if (Array.isArray(incomingPatch.members) && isFinanceAdmin) {
        for (const incMember of incomingPatch.members) {
          if (!incMember || typeof incMember.id !== 'string') continue;
          const existing = currentTenant.members.find(
            (m) => m.id === incMember.id
          );
          if (existing) {
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

          // Issue #14, #16 & #39 Fix: Safe member merge that NEVER overwrites server state with KVKK-redacted fields or altered debt balances!
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
                    };
                  }
                  return {
                    ...existing,
                    ...incMember,
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
                    // Member debt balances are strictly server-managed (#39)
                    duesBalance: existing.duesBalance,
                    mealBalance: existing.mealBalance,
                    foundationBalance: existing.foundationBalance,
                  };
                })
              : curr.members.map((existingMember) => {
                  if (existingMember.id !== user.memberId) return existingMember;
                  const selfPatch = incomingPatch.members.find(
                    (m: { id: string }) => m.id === user.memberId
                  );
                  return selfPatch
                    ? {
                        ...existingMember,
                        rsvpStatus:
                          selfPatch.rsvpStatus ?? existingMember.rsvpStatus,
                        mealPreference:
                          selfPatch.mealPreference ??
                          existingMember.mealPreference,
                      }
                    : existingMember;
                })
            : curr.members;

          return {
            ...curr,
            rsvpStatus: incomingPatch.rsvpStatus ?? curr.rsvpStatus,
            menuPreference: incomingPatch.menuPreference ?? curr.menuPreference,
            guestNameInput: incomingPatch.guestNameInput ?? curr.guestNameInput,
            selectedMeetingNo:
              incomingPatch.selectedMeetingNo ?? curr.selectedMeetingNo,
            qrCheckedIn: incomingPatch.qrCheckedIn ?? curr.qrCheckedIn,
            makeupSubmissions:
              incomingPatch.makeupSubmissions ?? curr.makeupSubmissions,
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
            guestMakeupCards:
              isBoardAdmin && incomingPatch.guestMakeupCards
                ? incomingPatch.guestMakeupCards
                : curr.guestMakeupCards,
            boardResolutions:
              isBoardAdmin && incomingPatch.boardResolutions
                ? incomingPatch.boardResolutions
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
        expectedRevision
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
      const changedKeys = Object.keys(incomingPatch);

      const effectiveAction =
        auditEvent?.action?.trim() ||
        `Sunucu Veri Senkronizasyonu (Rev #${updatedTenant.revision})`;
      const effectiveDetail =
        auditEvent?.detail?.trim() ||
        `${user.fullName} tarafından [${
          changedKeys.join(', ') || 'state'
        }] alanları güncellendi.`;
      const effectiveModule: AuditLogEntry['module'] =
        auditEvent?.module || 'Yönetim & Güvenlik';

      store.appendAuditEntry({
        clubId: authorizedClubId,
        actorName: `${user.fullName} (${user.rotaryId})`,
        actorRole: user.role,
        module: effectiveModule,
        action: effectiveAction,
        detail: effectiveDetail,
        timestamp: formatNowTR(),
      });

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
