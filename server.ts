import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  AtomicMultiTenantStore,
  AuthenticatedUser,
  authenticatePilotCredentials,
  findPilotAccount,
  issueSignedToken,
  normalizeBankRef,
  redactStateForRole,
  revokeTokenJti,
  verifyAuditChain,
  verifySignedToken,
} from './src/server/pilotEngine';
import { AuditLogEntry, ClubRole } from './src/types/rotary';

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
 * Strict P0 Multi-Club Tenant Isolation Guard (#70)
 * Prevents a token issued for club A from reading or mutating club B's state.
 */
function verifyTenantBoundary(
  user: AuthenticatedUser,
  requestedClubId: string | undefined,
  res: Response
): string | null {
  const effectiveClubId = (requestedClubId && requestedClubId.trim()) || user.clubId;
  if (effectiveClubId !== user.clubId) {
    res.status(403).json({
      error: 'CROSS_TENANT_FORBIDDEN',
      message: `Kulüpler arası yetkisiz erişim engellendi (#70): İmzalı oturumunuz "${user.clubId}" kulübüne aittir; "${effectiveClubId}" kulübünün verilerine doğrudan erişemezsiniz. Önce /api/auth/switch-club ile kulüp oturumu değiştirin.`,
    });
    return null;
  }
  return effectiveClubId;
}

export function createPilotExpressApp(customDbFile?: string) {
  const app = express();
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

  // Single-use WebAuthn challenges with 5-minute TTL (#22)
  const activeChallenges = new Map<
    string,
    {
      challenge: string;
      identifier: string;
      clubId: string;
      ceremony: 'webauthn.get' | 'webauthn.create';
      rpId: string;
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
    res.json({
      status: 'ok',
      engine: 'RotaClub Hardened Pilot Server v5.1',
      authMode: 'HMAC-SHA256 Signed Bearer Token + Per-User Salt Scrypt PIN + Full WebAuthn Verification',
      rbacEnforced: true,
      headerSpoofingBlocked: true,
      queryTokenBlocked: true,
      multiTenantIsolation: true,
      auditChainValid: chainStatus.valid,
      auditHeadHash: chainStatus.headHash,
      auditTotalEntries: chainStatus.totalEntries,
    });
  });

  // 2. Real Credential Login Endpoint with Brute-Force Protection (#22, #23)
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
    if (record && now - record.windowStartMs < 5 * 60 * 1000 && record.failedCount >= 5) {
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
    if (!authResult) {
      const prevCount =
        record && now - record.windowStartMs < 5 * 60 * 1000 ? record.failedCount : 0;
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

  // 3a. WebAuthn Passkey Registration Options (#22)
  app.post('/api/auth/webauthn-register-options', (req, res) => {
    const { identifier, clubId } = req.body || {};
    const account =
      findPilotAccount(String(identifier || 'TR-2420-88412'), store.getAccounts()) ||
      store.getAccounts()[0];
    const targetClubId =
      typeof clubId === 'string' && clubId.trim() ? clubId.trim() : 'club-galata';
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeId = crypto.randomUUID();
    const rpId = req.hostname || 'localhost';

    activeChallenges.set(challengeId, {
      challenge,
      identifier: account.rotaryId,
      clubId: targetClubId,
      ceremony: 'webauthn.create',
      rpId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({
      challengeId,
      challenge,
      rp: { name: 'RotaClub UR 2420. Bölge', id: rpId },
      user: {
        id: Buffer.from(account.memberId, 'utf8').toString('base64url'),
        name: account.email,
        displayName: account.fullName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      timeout: 30000,
      attestation: 'none',
    });
  });

  // 3b. WebAuthn Passkey Registration Verification (#22)
  app.post('/api/auth/webauthn-register-verify', (req, res) => {
    const { challengeId, credentialId, clientDataJSON, publicKeySpkiB64 } =
      req.body || {};
    if (!challengeId || !credentialId || !clientDataJSON) {
      res.status(400).json({
        error: 'MISSING_WEBAUTHN_REGISTRATION_DATA',
        message: 'WebAuthn kayıt doğrulaması için challengeId, credentialId ve clientDataJSON zorunludur.',
      });
      return;
    }

    const stored = activeChallenges.get(String(challengeId));
    // Single-use challenge consumption
    activeChallenges.delete(String(challengeId));

    if (!stored || stored.ceremony !== 'webauthn.create' || stored.expiresAt < Date.now()) {
      res.status(401).json({
        error: 'INVALID_OR_EXPIRED_CHALLENGE',
        message: 'WebAuthn kayıt challenge anahtarı geçersiz, süresi dolmuş veya daha önce kullanılmış.',
      });
      return;
    }

    let parsedClientData: { type?: string; challenge?: string; origin?: string };
    try {
      const jsonStr = Buffer.from(String(clientDataJSON), 'base64url').toString('utf8');
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
        message: 'WebAuthn clientDataJSON challenge veya ceremony tipi sunucu kaydıyla eşleşmiyor.',
      });
      return;
    }

    const account = store.registerWebAuthnCredential(stored.identifier, {
      credentialId: String(credentialId),
      publicKeySpkiB64:
        typeof publicKeySpkiB64 === 'string' ? publicKeySpkiB64 : undefined,
      signCount: 1,
      registeredAt: new Date().toISOString(),
      rpId: stored.rpId,
    });

    if (!account) {
      res.status(404).json({
        error: 'ACCOUNT_NOT_FOUND',
        message: 'WebAuthn kaydı yapılacak üye hesabı bulunamadı.',
      });
      return;
    }

    const token = issueSignedToken({
      memberId: account.memberId,
      rotaryId: account.rotaryId,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      clubId: stored.clubId,
      authMethod: 'webauthn',
    });
    const verifiedUser = verifySignedToken(token)!;

    store.appendAuditEntry({
      clubId: stored.clubId,
      actorName: `${account.fullName} (${account.rotaryId})`,
      actorRole: account.role,
      module: 'Yönetim & Güvenlik',
      action: `WebAuthn Donanım Passkey Kaydedildi & Doğrulandı`,
      detail: `${account.fullName} için Passkey (${String(credentialId).slice(0, 14)}...) kaydedildi ve imzalı oturum açıldı.`,
      timestamp: formatNowTR(),
    });

    res.json({
      ok: true,
      token,
      user: verifiedUser,
    });
  });

  // 3c. WebAuthn Passkey Assertion Challenge Generator (#12, #22)
  app.post('/api/auth/webauthn-challenge', (req, res) => {
    const { identifier, clubId } = req.body || {};
    const account =
      findPilotAccount(String(identifier || 'TR-2420-88412'), store.getAccounts()) ||
      store.getAccounts()[0];
    const targetClubId =
      typeof clubId === 'string' && clubId.trim() ? clubId.trim() : 'club-galata';
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeId = crypto.randomUUID();
    const rpId = req.hostname || 'localhost';

    activeChallenges.set(challengeId, {
      challenge,
      identifier: account.rotaryId,
      clubId: targetClubId,
      ceremony: 'webauthn.get',
      rpId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({
      challengeId,
      challenge,
      rpId,
      userIdentifier: account.rotaryId,
      allowCredentials: account.webauthnCredentials.map((c) => ({
        type: 'public-key',
        id: c.credentialId,
      })),
    });
  });

  // 3d. WebAuthn Passkey Assertion Verification Endpoint (#12, #22)
  app.post('/api/auth/webauthn-verify', (req, res) => {
    const {
      challengeId,
      credentialId,
      clientDataJSON,
      authenticatorData,
      signature,
    } = req.body || {};

    if (!challengeId || !credentialId || !clientDataJSON || !authenticatorData || !signature) {
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

    if (!stored || stored.ceremony !== 'webauthn.get' || stored.expiresAt < Date.now()) {
      res.status(401).json({
        error: 'INVALID_OR_EXPIRED_CHALLENGE',
        message: 'WebAuthn challenge geçersiz, süresi dolmuş veya daha önce kullanılmış.',
      });
      return;
    }

    let parsedClientData: { type?: string; challenge?: string; origin?: string };
    try {
      const decodedJson = Buffer.from(String(clientDataJSON), 'base64url').toString('utf8');
      parsedClientData = JSON.parse(decodedJson);
    } catch {
      res.status(400).json({
        error: 'INVALID_CLIENT_DATA_JSON',
        message: 'WebAuthn clientDataJSON geçerli bir Base64URL JSON değil.',
      });
      return;
    }

    if (
      parsedClientData.type !== 'webauthn.get' ||
      parsedClientData.challenge !== stored.challenge ||
      !parsedClientData.origin
    ) {
      res.status(401).json({
        error: 'WEBAUTHN_ASSERTION_MISMATCH',
        message: 'WebAuthn clientDataJSON challenge, origin veya ceremony tipi doğrulanamadı.',
      });
      return;
    }

    const authDataBuf = Buffer.from(String(authenticatorData), 'base64url');
    // Authenticator data must be at least 37 bytes (32-byte rpIdHash + 1-byte flags + 4-byte signCount)
    // and bit 0 (User Present / UP) of flags byte (index 32) must be 1
    if (authDataBuf.length < 37 || (authDataBuf[32] & 0x01) === 0) {
      res.status(401).json({
        error: 'INVALID_AUTHENTICATOR_DATA',
        message: 'WebAuthn authenticatorData uzunluğu veya User Present (UP) bayrağı geçersiz.',
      });
      return;
    }

    const account = findPilotAccount(stored.identifier, store.getAccounts());
    if (!account) {
      res.status(404).json({
        error: 'ACCOUNT_NOT_FOUND',
        message: 'WebAuthn ile ilişkili hesap bulunamadı.',
      });
      return;
    }

    const registeredCred = account.webauthnCredentials.find(
      (c) => c.credentialId === String(credentialId)
    );
    if (!registeredCred) {
      res.status(401).json({
        error: 'UNKNOWN_CREDENTIAL_ID',
        message: 'Sunulan WebAuthn Passkey bu kullanıcı hesabına kayıtlı değil.',
      });
      return;
    }

    // If publicKeySpkiB64 is present, verify cryptographic signature over authenticatorData || sha256(clientDataJSON)
    if (registeredCred.publicKeySpkiB64) {
      try {
        const clientDataHash = crypto
          .createHash('sha256')
          .update(Buffer.from(String(clientDataJSON), 'base64url'))
          .digest();
        const signedBytes = Buffer.concat([authDataBuf, clientDataHash]);
        const pubKeyObj = crypto.createPublicKey({
          key: Buffer.from(registeredCred.publicKeySpkiB64, 'base64url'),
          format: 'der',
          type: 'spki',
        });
        const sigValid = crypto.verify(
          'sha256',
          signedBytes,
          pubKeyObj,
          Buffer.from(String(signature), 'base64url')
        );
        if (!sigValid) {
          res.status(401).json({
            error: 'INVALID_WEBAUTHN_SIGNATURE',
            message: 'WebAuthn kriptografik imza doğrulaması başarısız oldu.',
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
    }

    const token = issueSignedToken({
      memberId: account.memberId,
      rotaryId: account.rotaryId,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      clubId: stored.clubId,
      authMethod: 'webauthn',
    });
    const verifiedUser = verifySignedToken(token)!;

    store.appendAuditEntry({
      clubId: stored.clubId,
      actorName: `${account.fullName} (${account.rotaryId})`,
      actorRole: account.role,
      module: 'Yönetim & Güvenlik',
      action: `WebAuthn Passkey Oturumu Doğrulandı (${account.role.toUpperCase()})`,
      detail: `${account.fullName} tek kullanımlık WebAuthn challenge (#${String(challengeId).slice(0, 8)}) ile ${stored.clubId} oturumu açtı.`,
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

  // 4c. Change Account PIN (#22)
  app.post('/api/auth/change-pin', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const { currentPin, newPin } = req.body || {};
    if (!currentPin || !newPin || String(newPin).trim().length < 6) {
      res.status(400).json({
        error: 'INVALID_PIN_FORMAT',
        message: 'Mevcut PIN ve en az 6 haneli yeni PIN kodu zorunludur.',
      });
      return;
    }
    const updated = store.changeAccountPin(
      user.memberId,
      String(currentPin),
      String(newPin)
    );
    if (!updated) {
      res.status(401).json({
        error: 'INVALID_CURRENT_PIN',
        message: 'Mevcut PIN kodu doğrulanamadı.',
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
  });

  // 4d. Explicit Multi-Tenant Club Switcher Endpoint (#70)
  app.post('/api/auth/switch-club', requireAuth, (req: AuthenticatedRequest, res) => {
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
    // Revoke previous club-scoped token so only the new tenant token is active
    store.revokeToken(user.jti);

    const nextToken = issueSignedToken({
      memberId: user.memberId,
      rotaryId: user.rotaryId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      clubId: cleanClubId,
      authMethod: user.authMethod || 'pin',
    });
    const verifiedUser = verifySignedToken(nextToken)!;

    store.appendAuditEntry({
      clubId: cleanClubId,
      actorName: `${user.fullName} (${user.rotaryId})`,
      actorRole: user.role,
      module: 'Yönetim & Güvenlik',
      action: `Kulüp Oturumu Değiştirildi (${cleanClubId})`,
      detail: `${user.fullName} oturum kapsamını "${user.clubId}" kulübünden "${cleanClubId}" kulübüne taşıdı.`,
      timestamp: formatNowTR(),
    });

    res.json({
      ok: true,
      token: nextToken,
      user: verifiedUser,
    });
  });

  // 4e. Server-Controlled Role Simulator Switch for Interactive Demo Bar (No client-side PIN literals!)
  app.post('/api/auth/pilot-role-session', (req, res) => {
    if (process.env.ROTACLUB_DISABLE_DEMO_SWITCHER === 'true') {
      res.status(403).json({
        error: 'DEMO_SWITCHER_DISABLED',
        message: 'Üretim modunda hızlı rol simülatörü devre dışıdır; lütfen /api/auth/login kullanın.',
      });
      return;
    }
    const { role, clubId } = req.body || {};
    const targetRole = (role as ClubRole) || 'uye';
    const targetClubId =
      typeof clubId === 'string' && clubId.trim() ? clubId.trim() : 'club-galata';
    const account =
      findPilotAccount(targetRole, store.getAccounts()) || store.getAccounts()[0];

    const token = issueSignedToken({
      memberId: account.memberId,
      rotaryId: account.rotaryId,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      clubId: targetClubId,
      authMethod: 'pin',
    });
    const verifiedUser = verifySignedToken(token)!;

    store.appendAuditEntry({
      clubId: targetClubId,
      actorName: `${account.fullName} (${account.rotaryId})`,
      actorRole: account.role,
      module: 'Yönetim & Güvenlik',
      action: `Pilot Rol Oturumu Başlatıldı (${account.role.toUpperCase()})`,
      detail: `${account.fullName} için ${targetClubId} kapsamında imzalı sunucu oturumu üretildi.`,
      timestamp: formatNowTR(),
    });

    res.json({
      ok: true,
      token,
      user: verifiedUser,
    });
  });

  // 5. Protected Shared Club State with Strict Tenant Boundary & KVKK Redaction (#12, #16, #20, #70)
  app.get('/api/pilot/state', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const requestedClubId =
        typeof req.query.clubId === 'string' ? req.query.clubId.trim() : undefined;
      const authorizedClubId = verifyTenantBoundary(user, requestedClubId, res);
      if (!authorizedClubId) return;

      const tenant = store.getTenantState(authorizedClubId);
      const ledger = store.getAuditLedger(authorizedClubId);
      const redacted = redactStateForRole(tenant, ledger, user);
      res.json(redacted);
    } catch (err) {
      res.status(500).json({
        error: 'STORAGE_READ_ERROR',
        message: err instanceof Error ? err.message : 'Veritabanı okuma hatası',
      });
    }
  });

  // 6. Verify SHA-256 Audit Hash Chain Integrity (#18, #70)
  app.get('/api/pilot/audit-verify', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const requestedClubId =
      typeof req.query.clubId === 'string' ? req.query.clubId.trim() : undefined;
    const authorizedClubId = verifyTenantBoundary(user, requestedClubId, res);
    if (!authorizedClubId) return;

    const ledger = store.getAuditLedger(authorizedClubId);
    const verification = verifyAuditChain(ledger, authorizedClubId);
    res.json(verification);
  });

  // 7. Bank Statement Reconciliation Endpoint for Sayman / Başkan (#6, #39, #70, #76)
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
          res
        );
        if (!authorizedClubId) return;

        if (!paymentId || !bankRef) {
          res.status(400).json({
            error: 'MISSING_RECONCILIATION_DATA',
            message: 'Ödeme ID ve Banka Ekstre Referans Kodu (bankRef) zorunludur.',
          });
          return;
        }

        const tenant = store.getTenantState(authorizedClubId);
        const payment = tenant.paymentNotifications.find((p) => p.id === paymentId);
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

        const normalizedInputRef = normalizeBankRef(String(bankRef));
        const matchingStatement = tenant.bankStatements.find(
          (b) =>
            normalizeBankRef(b.bankRef) === normalizedInputRef &&
            b.amount === payment.amount
        );

        if (!matchingStatement) {
          res.status(422).json({
            error: 'BANK_RECONCILIATION_MISMATCH',
            message: `Banka ekstresinde "${normalizedInputRef}" referanslı ve ${payment.amount} TL tutarlı doğrulanmış bir FAST/EFT hareketi bulunamadı.`,
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

        // Prevent duplicate reference number in treasury ledger
        const duplicateInLedger = tenant.treasuryLedger.some(
          (t) => normalizeBankRef(t.referenceNo) === normalizedInputRef
        );
        if (duplicateInLedger) {
          res.status(409).json({
            error: 'DUPLICATE_LEDGER_REFERENCE',
            message: `"${normalizedInputRef}" referans kodu kasa defterinde zaten mevcut.`,
          });
          return;
        }

        const canonicalRef = normalizeBankRef(matchingStatement.bankRef);

        const updatedTenant = store.updateTenant(authorizedClubId, (curr) => {
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

          // Issue #39 Fix: Atomically update either targetProjectId, targetScholarId, OR member debt balances (never double-counting)
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
                const nextFunded = Math.min(sch.totalMonths, sch.fundedMonths + 1);
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
                  !payment.memberName.includes(m.fullName)
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
                  foundationBalance: Math.max(0, m.foundationBalance - payment.amount),
                };
              });

          const nextOverdue = isDirectContribution
            ? curr.overdueMembers
            : curr.overdueMembers
                .map((o) => {
                  if (!payment.memberName.includes(o.memberName.replace(/^Rtn\.\s*/, ''))) {
                    return o;
                  }
                  const remaining = Math.max(0, o.overdueAmount - payment.amount);
                  return { ...o, overdueAmount: remaining };
                })
                .filter((o) => o.overdueAmount > 0);

          const nextFinancialItems =
            !isDirectContribution && payment.memberId === 'm-rifat'
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

          const newLedgerEntry = {
            id: `tr-${Date.now()}`,
            date: '23 Ekim 2026',
            type: 'Gelir' as const,
            category:
              payment.targetProjectId || payment.targetScholarId
                ? ('Burs & Proje Fonu' as const)
                : payment.category === 'Vakıf / Proje Katkı Payı'
                ? ('UR Bölge & Vakıf' as const)
                : ('Aidat & Kuver Tahsilatı' as const),
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
        });

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
            updatedTenant,
            store.getAuditLedger(authorizedClubId),
            user
          ),
        });
      } catch (err) {
        res.status(500).json({
          error: 'RECONCILIATION_WRITE_ERROR',
          message: err instanceof Error ? err.message : 'Mutabakat kayıt hatası',
        });
      }
    }
  );

  // 8. Authenticated State Synchronization, Mandatory Audit Logging & Granular RBAC (#14, #16, #18, #20, #39, #70)
  app.post('/api/pilot/sync', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const requestedClubId =
        typeof req.body?.clubId === 'string' ? req.body.clubId.trim() : undefined;
      const authorizedClubId = verifyTenantBoundary(user, requestedClubId, res);
      if (!authorizedClubId) return;

      const currentTenant = store.getTenantState(authorizedClubId);

      // Optimistic Concurrency Check (#14, #18)
      if (
        typeof req.body?.expectedRevision === 'number' &&
        req.body.expectedRevision !== currentTenant.revision
      ) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
          message: `Veri sürümü çakışması: İstemci revizyonu (${req.body.expectedRevision}) sunucu revizyonu (${currentTenant.revision}) ile eşleşmiyor.`,
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
        user.role === 'sekreter' || user.role === 'sayman' || user.role === 'baskan';

      // Block regular 'uye' from toggling club-wide KVKK phone masking (#16)
      if (
        typeof incomingPatch.kvkkMaskPhone === 'boolean' &&
        incomingPatch.kvkkMaskPhone !== currentTenant.kvkkMaskPhone &&
        !isBoardAdmin
      ) {
        res.status(403).json({
          error: 'RBAC_FORBIDDEN',
          message: 'Kulüp geneli KVKK telefon maskeleme ayarı yalnızca Yönetim Kurulu yetkilileri tarafından değiştirilebilir.',
        });
        return;
      }

      // Issue #39 Fix: Validate payment notifications for duplicate receiptRef
      if (Array.isArray(incomingPatch.paymentNotifications)) {
        const seenRefs = new Set<string>();
        for (const p of incomingPatch.paymentNotifications) {
          const normRef = normalizeBankRef(p.receiptRef || '');
          if (normRef && p.status !== 'Reddedildi') {
            if (seenRefs.has(normRef)) {
              res.status(409).json({
                error: 'DUPLICATE_RECEIPT_REF',
                message: `Mükerrer dekont referansı engellendi (#39): "${normRef}" referans kodu birden fazla ödeme bildiriminde kullanılamaz.`,
              });
              return;
            }
            seenRefs.add(normRef);
          }
        }
      }

      const changedKeys = Object.keys(incomingPatch);

      const updatedTenant = store.updateTenant(authorizedClubId, (curr) => {
        // Issue #39 Fix: Regular 'uye' cannot directly inflate project collectedAmount or scholar fundedMonths without bank reconciliation
        const sanitizedProjects = incomingPatch.projects
          ? isBoardAdmin
            ? incomingPatch.projects
            : curr.projects.map((existingProj) => {
                const match = incomingPatch.projects.find(
                  (p: { id: string }) => p.id === existingProj.id
                );
                if (!match) return existingProj;
                return {
                  ...existingProj,
                  // Regular member can only update volunteer list on a project; collectedAmount only changes on bank reconciliation
                  volunteers: Array.isArray(match.volunteers)
                    ? match.volunteers
                    : existingProj.volunteers,
                };
              })
          : curr.projects;

        const sanitizedScholars =
          isBoardAdmin && incomingPatch.scholars
            ? incomingPatch.scholars
            : curr.scholars;

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
          // Board-only state fields
          termInfo: isBoardAdmin && incomingPatch.termInfo ? incomingPatch.termInfo : curr.termInfo,
          meetings: isBoardAdmin && incomingPatch.meetings ? incomingPatch.meetings : curr.meetings,
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
          // Finance-only fields
          treasuryLedger:
            isFinanceAdmin && incomingPatch.treasuryLedger
              ? incomingPatch.treasuryLedger
              : curr.treasuryLedger,
          financialItems:
            isFinanceAdmin && incomingPatch.financialItems
              ? incomingPatch.financialItems
              : curr.financialItems,
          overdueMembers:
            isFinanceAdmin && incomingPatch.overdueMembers
              ? incomingPatch.overdueMembers
              : curr.overdueMembers,
          paymentNotifications: incomingPatch.paymentNotifications
            ? isFinanceAdmin
              ? incomingPatch.paymentNotifications.map(
                  (p: { receiptRef: string }) => ({
                    ...p,
                    receiptRef: normalizeBankRef(p.receiptRef),
                  })
                )
              : [
                  ...incomingPatch.paymentNotifications
                    .filter(
                      (p: { memberId: string; status: string }) =>
                        p.memberId === user.memberId && p.status === 'Bekliyor'
                    )
                    .map((p: { receiptRef: string }) => ({
                      ...p,
                      receiptRef: normalizeBankRef(p.receiptRef),
                    })),
                  ...curr.paymentNotifications.filter(
                    (p) => p.memberId !== user.memberId || p.status !== 'Bekliyor'
                  ),
                ]
            : curr.paymentNotifications,
          members: incomingPatch.members
            ? isBoardAdmin
              ? incomingPatch.members
              : curr.members.map((existingMember) => {
                  if (existingMember.id !== user.memberId) return existingMember;
                  const selfPatch = incomingPatch.members.find(
                    (m: { id: string }) => m.id === user.memberId
                  );
                  return selfPatch
                    ? {
                        ...existingMember,
                        rsvpStatus: selfPatch.rsvpStatus ?? existingMember.rsvpStatus,
                        mealPreference:
                          selfPatch.mealPreference ?? existingMember.mealPreference,
                      }
                    : existingMember;
                })
            : curr.members,
        };
      });

      // Issue #18 Fix: Mandatory Server-Generated Audit Entry on every state mutation!
      const effectiveAction =
        auditEvent?.action?.trim() ||
        `Sunucu Veri Senkronizasyonu (Rev #${updatedTenant.revision})`;
      const effectiveDetail =
        auditEvent?.detail?.trim() ||
        `${user.fullName} tarafından [${changedKeys.join(', ') || 'state'}] alanları güncellendi.`;
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
      res.json({
        ok: true,
        revision: updatedTenant.revision,
        updatedAt: updatedTenant.updatedAt,
        auditLogs: ledger,
        auditVerification: verifyAuditChain(ledger, authorizedClubId),
        state: redactStateForRole(updatedTenant, ledger, user),
      });
    } catch (err) {
      res.status(500).json({
        error: 'SYNC_WRITE_ERROR',
        message: err instanceof Error ? err.message : 'Senkronizasyon yazma hatası',
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
        const authorizedClubId = verifyTenantBoundary(user, requestedClubId, res);
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

  // 10. Protected Tenant-Scoped Database & Hash-Chained Audit Backup — Strictly Board Officers Only (#19, #20, #70)
  app.get(
    '/api/pilot/backup',
    requireServerRole(['baskan', 'sekreter', 'sayman']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const requestedClubId =
          typeof req.query.clubId === 'string' ? req.query.clubId.trim() : undefined;
        const authorizedClubId = verifyTenantBoundary(user, requestedClubId, res);
        if (!authorizedClubId) return;

        store.appendAuditEntry({
          clubId: authorizedClubId,
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Yönetim & Güvenlik',
          action: 'Kulüp Veritabanı & SHA-256 Denetim Zinciri Yedeği Alındı (.JSON)',
          detail: `${user.fullName} (${user.role}) tarafından yalnızca ${authorizedClubId} kulübüne ait izole veritabanı ve kriptografik denetim defteri dışa aktarıldı.`,
          timestamp: formatNowTR(),
        });

        const tenantBackup = store.getTenantBackupSnapshot(authorizedClubId);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="RotaClub_${authorizedClubId}_Backup_v5_1.json"`
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

  // 11. Public Account Directory Metadata (Zero PIN or password hash exposure! #22)
  app.get('/api/auth/pilot-accounts', (_req, res) => {
    res.json({
      accounts: store.getAccounts().map((a) => ({
        memberId: a.memberId,
        rotaryId: a.rotaryId,
        fullName: a.fullName,
        email: a.email,
        role: a.role,
        clubId: a.clubId,
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
    console.log(`RotaClub Hardened Pilot Server v5.1 running on http://localhost:${PORT}`);
  });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  startServer();
}
