import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
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
  verifyAuditChain,
  verifySignedToken,
} from './src/server/pilotEngine';
import { AuditLogEntry, ClubRole, RotaryMember } from './src/types/rotary';

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
): string | null {
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
      engine: 'RotaClub Hardened Pilot Server v5.2',
      authMode:
        'HMAC-SHA256 Signed Bearer Token + Pre-Salted Scrypt PIN + ECDSA P-256 WebAuthn Verification',
      rbacEnforced: true,
      headerSpoofingBlocked: true,
      queryTokenBlocked: true,
      multiTenantIsolation: true,
      clubMembershipEnforced: true,
      atomicCasRevisionEnforced: true,
      auditChainValid: chainStatus.valid,
      auditHeadHash: chainStatus.headHash,
      auditTotalEntries: chainStatus.totalEntries,
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

  // 3a. Authenticated WebAuthn Passkey Registration Options (#12, #22)
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

      const challenge = crypto.randomBytes(32).toString('base64url');
      const challengeId = crypto.randomUUID();
      const rpId = req.hostname || 'localhost';

      activeChallenges.set(challengeId, {
        challenge,
        memberId: account.memberId,
        identifier: account.rotaryId,
        clubId: user.clubId,
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
          { type: 'public-key', alg: -7 }, // ES256 (ECDSA P-256 with SHA-256)
          { type: 'public-key', alg: -257 }, // RS256
        ],
        timeout: 30000,
        attestation: 'none',
      });
    }
  );

  // 3b. Authenticated WebAuthn Passkey Registration Verification (#12, #22)
  // Requires an authenticated session matching the challenge's memberId and a valid SPKI public key!
  app.post(
    '/api/auth/webauthn-register-verify',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const { challengeId, credentialId, clientDataJSON, publicKeySpkiB64 } =
        req.body || {};
      if (!challengeId || !credentialId || !clientDataJSON || !publicKeySpkiB64) {
        res.status(400).json({
          error: 'MISSING_WEBAUTHN_REGISTRATION_DATA',
          message:
            'WebAuthn kayıt doğrulaması için challengeId, credentialId, clientDataJSON ve publicKeySpkiB64 (ECDSA P-256 SPKI) zorunludur.',
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

      let parsedClientData: { type?: string; challenge?: string; origin?: string };
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
        parsedClientData.challenge !== stored.challenge ||
        !parsedClientData.origin
      ) {
        res.status(401).json({
          error: 'WEBAUTHN_CHALLENGE_MISMATCH',
          message:
            'WebAuthn clientDataJSON challenge, origin veya ceremony tipi sunucu kaydıyla eşleşmiyor.',
        });
        return;
      }

      // Validate that publicKeySpkiB64 is a genuine cryptographic SPKI public key
      try {
        crypto.createPublicKey({
          key: Buffer.from(String(publicKeySpkiB64), 'base64url'),
          format: 'der',
          type: 'spki',
        });
      } catch {
        res.status(400).json({
          error: 'INVALID_PUBLIC_KEY_SPKI',
          message: 'Sunulan publicKeySpkiB64 geçerli bir DER SPKI açık anahtar değil.',
        });
        return;
      }

      const account = store.registerWebAuthnCredential(user.memberId, {
        credentialId: String(credentialId),
        publicKeySpkiB64: String(publicKeySpkiB64),
        signCount: 0,
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

      store.appendAuditEntry({
        clubId: user.clubId,
        actorName: `${account.fullName} (${account.rotaryId})`,
        actorRole: user.role,
        module: 'Yönetim & Güvenlik',
        action: 'WebAuthn ECDSA P-256 Passkey Açık Anahtarı Kaydedildi',
        detail: `${account.fullName} için doğrulanmış SPKI açık anahtarlı Passkey (${String(
          credentialId
        ).slice(0, 14)}...) kaydedildi.`,
        timestamp: formatNowTR(),
      });

      res.json({
        ok: true,
        credentialId: String(credentialId),
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

    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeId = crypto.randomUUID();
    const rpId = req.hostname || 'localhost';

    activeChallenges.set(challengeId, {
      challenge,
      memberId: account.memberId,
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

    let parsedClientData: { type?: string; challenge?: string; origin?: string };
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
      parsedClientData.challenge !== stored.challenge ||
      !parsedClientData.origin
    ) {
      res.status(401).json({
        error: 'WEBAUTHN_ASSERTION_MISMATCH',
        message:
          'WebAuthn clientDataJSON challenge, origin veya ceremony tipi doğrulanamadı.',
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

  // 4c. Change Account PIN (#22)
  app.post(
    '/api/auth/change-pin',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
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
        action: `Kulüp Oturumu Değiştirildi (${membership.clubId})`,
        detail: `${user.fullName} doğrulanmış kulüp üyeliği ile oturum kapsamını "${user.clubId}" kulübünden "${membership.clubId}" kulübüne taşıdı.`,
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

        const casResult = store.updateTenant(authorizedClubId, (curr) => {
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

  // 8. Authenticated State Synchronization, Atomic CAS Revision Check & Granular Accounting Protection (#14, #16, #18, #20, #39, #70)
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

      // Issue #39 Fix: Strict validation of incoming paymentNotifications
      if (Array.isArray(incomingPatch.paymentNotifications)) {
        const existingById = new Map(
          currentTenant.paymentNotifications.map((p) => [p.id, p])
        );
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
          if (!p || typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) {
            res.status(422).json({
              error: 'INVALID_PAYMENT_AMOUNT',
              message: 'Ödeme bildirimi tutarı 0’dan büyük geçerli bir sayı olmalıdır.',
            });
            return;
          }

          const existing = existingById.get(p.id);
          // Nobody can mark a payment 'Onaylandı' via /api/pilot/sync — must use /api/pilot/reconcile-payment!
          if (p.status === 'Onaylandı' && (!existing || existing.status !== 'Onaylandı')) {
            res.status(422).json({
              error: 'UNRECONCILED_PAYMENT_APPROVAL_FORBIDDEN',
              message:
                'Ödeme bildirimleri doğrudan senkronizasyon ile onaylanamaz; /api/pilot/reconcile-payment üzerinden banka ekstresi mutabakatı zorunludur.',
            });
            return;
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

            // If this is a new or still-pending notification, ensure normRef is not already used by another member or already reconciled in ledger/bankStatements
            const isAlreadyApprovedSameRecord =
              existing &&
              existing.status === 'Onaylandı' &&
              normalizeBankRef(existing.receiptRef) === normRef;

            if (!isAlreadyApprovedSameRecord && reservedServerRefs.has(normRef)) {
              res.status(409).json({
                error: 'DUPLICATE_RECEIPT_REF',
                message: `Mükerrer dekont referansı engellendi (#39): "${normRef}" referans kodu başka bir ödeme veya mutabakat kaydında zaten kullanılmış.`,
              });
              return;
            }
          }
        }
      }

      // Issue #39 Fix: Validate manual treasuryLedger additions by Sayman/Başkan
      if (isFinanceAdmin && Array.isArray(incomingPatch.treasuryLedger)) {
        const seenLedgerRefs = new Set<string>();
        for (const item of incomingPatch.treasuryLedger) {
          if (!item || typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0) {
            res.status(422).json({
              error: 'INVALID_LEDGER_AMOUNT',
              message: 'Kasa defteri tutarı 0’dan büyük olmalıdır.',
            });
            return;
          }
          const ref = normalizeBankRef(item.referenceNo || '');
          if (ref) {
            if (seenLedgerRefs.has(ref)) {
              res.status(409).json({
                error: 'DUPLICATE_LEDGER_REFERENCE',
                message: `Kasa defterinde mükerrer referans numarası (${ref}) kullanılamaz.`,
              });
              return;
            }
            seenLedgerRefs.add(ref);
          }
        }
      }

      const expectedRevision =
        typeof req.body?.expectedRevision === 'number'
          ? req.body.expectedRevision
          : undefined;

      const casResult = store.updateTenant(
        authorizedClubId,
        (curr) => {
          // Issue #39 Fix: Existing projects' collectedAmount & supportersCount can ONLY increase via /api/pilot/reconcile-payment
          const sanitizedProjects = Array.isArray(incomingPatch.projects)
            ? isBoardAdmin
              ? incomingPatch.projects.map((incProj: { id: string; volunteers?: string[] }) => {
                  const existingProj = curr.projects.find((p) => p.id === incProj.id);
                  if (!existingProj) {
                    // Newly created project by board officer
                    return {
                      ...incProj,
                      collectedAmount: 0,
                      supportersCount: 0,
                    };
                  }
                  return {
                    ...existingProj,
                    ...incProj,
                    // Preserve server-reconciled financial totals
                    collectedAmount: existingProj.collectedAmount,
                    supportersCount: existingProj.supportersCount,
                  };
                })
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

          // Issue #14 & #16 Fix: Safe member merge that NEVER overwrites server state with KVKK-redacted fields or zeroed balances!
          const sanitizedMembers: RotaryMember[] = Array.isArray(
            incomingPatch.members
          )
            ? isBoardAdmin
              ? incomingPatch.members.map((incMember: RotaryMember) => {
                  const existing = curr.members.find(
                    (m) => m.id === incMember.id
                  );
                  if (!existing) {
                    return incMember;
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
                    spouseName: incMember.spouseName ?? existing.spouseName,
                    weddingAnniversary:
                      incMember.weddingAnniversary ??
                      existing.weddingAnniversary,
                    // Only Sayman or Başkan can mutate member debt balances
                    duesBalance: isFinanceAdmin
                      ? incMember.duesBalance
                      : existing.duesBalance,
                    mealBalance: isFinanceAdmin
                      ? incMember.mealBalance
                      : existing.mealBalance,
                    foundationBalance: isFinanceAdmin
                      ? incMember.foundationBalance
                      : existing.foundationBalance,
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

          // Preserve existing treasuryLedger entries and only allow finance admins to prepend new entries
          const sanitizedTreasuryLedger =
            isFinanceAdmin && Array.isArray(incomingPatch.treasuryLedger)
              ? [
                  ...incomingPatch.treasuryLedger.filter(
                    (inc: { id: string }) =>
                      !curr.treasuryLedger.some((ex) => ex.id === inc.id)
                  ),
                  ...curr.treasuryLedger,
                ]
              : curr.treasuryLedger;

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
            treasuryLedger: sanitizedTreasuryLedger,
            financialItems:
              isFinanceAdmin && incomingPatch.financialItems
                ? incomingPatch.financialItems
                : curr.financialItems,
            overdueMembers:
              isFinanceAdmin && incomingPatch.overdueMembers
                ? incomingPatch.overdueMembers
                : curr.overdueMembers,
            paymentNotifications: Array.isArray(
              incomingPatch.paymentNotifications
            )
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
            members: sanitizedMembers,
          };
        },
        expectedRevision
      );

      if (!casResult.ok) {
        res.status(409).json({
          error: 'REVISION_CONFLICT',
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

  // 10. Protected Tenant-Scoped Database & Hash-Chained Audit Backup — Strictly Board Officers Only (#19, #20, #70)
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
          `attachment; filename="RotaClub_${authorizedClubId}_Backup_v5_2.json"`
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
      `RotaClub Hardened Pilot Server v5.2 running on http://localhost:${PORT}`
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
