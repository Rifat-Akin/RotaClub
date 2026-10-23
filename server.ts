import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  AtomicMultiTenantStore,
  AuthenticatedUser,
  PILOT_ACCOUNTS,
  authenticatePilotCredentials,
  issueSignedToken,
  redactStateForRole,
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

function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return undefined;
}

/**
 * Cryptographic Session Authentication Middleware (#12, #20, #22, #23)
 * Rejects unauthenticated requests and prevents client-side header spoofing.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = extractBearerToken(req);
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

export function createPilotExpressApp(customDbFile?: string) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Prevent browser/proxy caching of sensitive club & financial API responses
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  const store = new AtomicMultiTenantStore(customDbFile);
  const activeChallenges = new Map<string, { challenge: string; expiresAt: number }>();

  // 1. Public Health & Security Posture Endpoint (#13, #20)
  app.get('/api/pilot/health', (_req, res) => {
    const ledger = store.getAuditLedger();
    const chainStatus = verifyAuditChain(ledger);
    res.json({
      status: 'ok',
      engine: 'RotaClub Hardened Pilot Server v5.0',
      authMode: 'HMAC-SHA256 Signed Bearer Token + Scrypt PIN + WebAuthn Challenge',
      rbacEnforced: true,
      headerSpoofingBlocked: true,
      multiTenantIsolation: true,
      auditChainValid: chainStatus.valid,
      auditHeadHash: chainStatus.headHash,
      auditTotalEntries: chainStatus.totalEntries,
    });
  });

  // 2. Real Credential Login Endpoint (#22, #23)
  app.post('/api/auth/login', (req, res) => {
    const { identifier, pinCode, clubId } = req.body || {};
    if (!identifier || !pinCode) {
      res.status(400).json({
        error: 'MISSING_CREDENTIALS',
        message: 'Rotary ID / E-posta ve Kurumsal PIN kodu zorunludur.',
      });
      return;
    }

    const targetClubId = typeof clubId === 'string' && clubId ? clubId : 'club-galata';
    const authResult = authenticatePilotCredentials(
      String(identifier),
      String(pinCode),
      targetClubId
    );
    if (!authResult) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Rotary ID veya Kurumsal PIN kodu hatalı.',
      });
      return;
    }

    store.appendAuditEntry({
      clubId: targetClubId,
      actorName: `${authResult.user.fullName} (${authResult.user.rotaryId})`,
      actorRole: authResult.user.role,
      module: 'Yönetim & Güvenlik',
      action: `Sunucu Oturumu Açıldı (${authResult.user.role.toUpperCase()})`,
      detail: `${authResult.user.fullName} kriptografik PIN doğrulaması ile ${targetClubId} oturumu başlattı.`,
      timestamp: formatNowTR(),
    });

    res.json({
      ok: true,
      token: authResult.token,
      user: authResult.user,
    });
  });

  // 3. WebAuthn Passkey Challenge Generator (#12, #22)
  app.post('/api/auth/webauthn-challenge', (req, res) => {
    const { identifier } = req.body || {};
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeId = crypto.randomUUID();
    activeChallenges.set(challengeId, {
      challenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    res.json({
      challengeId,
      challenge,
      rpId: req.hostname || 'localhost',
      userIdentifier: identifier || 'TR-2420-88412',
    });
  });

  // 4. Verify Current Session Token
  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({
      authenticated: true,
      user: req.authUser,
    });
  });

  // 5. Protected Shared Club State with Role-Based Data Redaction & Multi-Tenant Isolation (#12, #14, #20)
  app.get('/api/pilot/state', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const requestedClubId =
        (typeof req.query.clubId === 'string' && req.query.clubId.trim()) ||
        user.clubId ||
        'club-galata';
      const tenant = store.getTenantState(requestedClubId);
      const ledger = store.getAuditLedger();
      const redacted = redactStateForRole(tenant, ledger, user);
      res.json(redacted);
    } catch (err) {
      res.status(500).json({
        error: 'STORAGE_READ_ERROR',
        message: err instanceof Error ? err.message : 'Veritabanı okuma hatası',
      });
    }
  });

  // 6. Verify SHA-256 Audit Hash Chain Integrity (#18)
  app.get('/api/pilot/audit-verify', requireAuth, (_req, res) => {
    const ledger = store.getAuditLedger();
    const verification = verifyAuditChain(ledger);
    res.json(verification);
  });

  // 7. Bank Statement Reconciliation Endpoint for Sayman / Başkan (#6, #76)
  app.post(
    '/api/pilot/reconcile-payment',
    requireServerRole(['sayman', 'baskan']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const { paymentId, bankRef, clubId } = req.body || {};
        const targetClubId = clubId || user.clubId || 'club-galata';

        if (!paymentId || !bankRef) {
          res.status(400).json({
            error: 'MISSING_RECONCILIATION_DATA',
            message: 'Ödeme ID ve Banka Ekstre Referans Kodu (bankRef) zorunludur.',
          });
          return;
        }

        const tenant = store.getTenantState(targetClubId);
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

        const cleanRef = String(bankRef).trim();
        const matchingStatement = tenant.bankStatements.find(
          (b) =>
            b.bankRef.toLowerCase() === cleanRef.toLowerCase() &&
            b.amount === payment.amount
        );

        if (!matchingStatement) {
          res.status(422).json({
            error: 'BANK_RECONCILIATION_MISMATCH',
            message: `Banka ekstresinde "${cleanRef}" referanslı ve ${payment.amount} TL tutarlı doğrulanmış bir FAST/EFT hareketi bulunamadı.`,
          });
          return;
        }

        const updatedTenant = store.updateTenant(targetClubId, (curr) => {
          const nextPayments = curr.paymentNotifications.map((p) =>
            p.id === paymentId
              ? { ...p, status: 'Onaylandı' as const, receiptRef: matchingStatement.bankRef }
              : p
          );

          const nextStatements = curr.bankStatements.map((b) =>
            b.bankRef === matchingStatement.bankRef
              ? {
                  ...b,
                  reconciled: true,
                  reconciledAt: formatNowTR(),
                  reconciledBy: user.fullName,
                }
              : b
          );

          const nextMembers = curr.members.map((m) => {
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

          const newLedgerEntry = {
            id: `tr-${Date.now()}`,
            date: '23 Ekim 2026',
            type: 'Gelir' as const,
            category:
              payment.category === 'Vakıf / Proje Katkı Payı'
                ? ('UR Bölge & Vakıf' as const)
                : ('Aidat & Kuver Tahsilatı' as const),
            title: `${payment.memberName} — ${payment.description} (Banka Mutabakatlı)`,
            counterparty: payment.memberName,
            amount: payment.amount,
            referenceNo: matchingStatement.bankRef,
          };

          return {
            ...curr,
            paymentNotifications: nextPayments,
            bankStatements: nextStatements,
            members: nextMembers,
            treasuryLedger: [newLedgerEntry, ...curr.treasuryLedger],
          };
        });

        store.appendAuditEntry({
          clubId: targetClubId,
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Saymanlık & Kasa',
          action: `Banka Mutabakatlı Tahsilat Onayı (${matchingStatement.bankRef})`,
          detail: `${payment.memberName} (${payment.amount} TL) ödemesi banka ekstresiyle eşleştirildi, cari bakiyeden düşüldü ve kasa defterine işlendi.`,
          timestamp: formatNowTR(),
        });

        res.json({
          ok: true,
          state: redactStateForRole(
            updatedTenant,
            store.getAuditLedger(),
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

  // 8. Authenticated State Synchronization & Granular RBAC Enforcement (#14, #18, #22, #23)
  app.post('/api/pilot/sync', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const targetClubId =
        (typeof req.body?.clubId === 'string' && req.body.clubId.trim()) ||
        user.clubId ||
        'club-galata';

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
      const updatedTenant = store.updateTenant(targetClubId, (curr) => {
        // Prevent regular 'uye' from overwriting club-wide treasuryLedger, overdueMembers, or other members' balances
        const isFinanceAdmin = user.role === 'sayman' || user.role === 'baskan';
        const isBoardAdmin =
          user.role === 'sekreter' || user.role === 'sayman' || user.role === 'baskan';

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
          projects: incomingPatch.projects ?? curr.projects,
          scholars: incomingPatch.scholars ?? curr.scholars,
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
            typeof incomingPatch.kvkkMaskPhone === 'boolean'
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
              ? incomingPatch.paymentNotifications
              : [
                  ...incomingPatch.paymentNotifications.filter(
                    (p: { memberId: string; status: string }) =>
                      p.memberId === user.memberId && p.status === 'Bekliyor'
                  ),
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

      if (auditEvent && auditEvent.action) {
        store.appendAuditEntry({
          clubId: targetClubId,
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: auditEvent.module || 'Yönetim & Güvenlik',
          action: auditEvent.action,
          detail: auditEvent.detail,
          timestamp: formatNowTR(),
        });
      }

      const ledger = store.getAuditLedger();
      res.json({
        ok: true,
        revision: updatedTenant.revision,
        updatedAt: updatedTenant.updatedAt,
        auditLogs: ledger,
        auditVerification: verifyAuditChain(ledger),
      });
    } catch (err) {
      res.status(500).json({
        error: 'SYNC_WRITE_ERROR',
        message: err instanceof Error ? err.message : 'Senkronizasyon yazma hatası',
      });
    }
  });

  // 9. Protected Reset Endpoint — Strictly 'baskan' Only & Preserves Audit Ledger (#14, #18, #23)
  app.post(
    '/api/pilot/reset',
    requireServerRole(['baskan']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        const targetClubId =
          (typeof req.body?.clubId === 'string' && req.body.clubId.trim()) ||
          user.clubId ||
          'club-galata';

        const freshTenant = store.resetTenantOperationalData(
          targetClubId,
          user,
          formatNowTR()
        );
        const ledger = store.getAuditLedger();
        res.json(redactStateForRole(freshTenant, ledger, user));
      } catch (err) {
        res.status(500).json({
          error: 'RESET_WRITE_ERROR',
          message: err instanceof Error ? err.message : 'Sıfırlama hatası',
        });
      }
    }
  );

  // 10. Protected Full JSON Database & Hash-Chained Audit Backup — Strictly Board Officers Only (#19, #20)
  app.get(
    '/api/pilot/backup',
    requireServerRole(['baskan', 'sekreter', 'sayman']),
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.authUser!;
        store.appendAuditEntry({
          clubId: user.clubId || 'club-galata',
          actorName: `${user.fullName} (${user.rotaryId})`,
          actorRole: user.role,
          module: 'Yönetim & Güvenlik',
          action: 'Tam Veritabanı & SHA-256 Denetim Zinciri Yedeği Alındı (.JSON)',
          detail: `${user.fullName} (${user.role}) tarafından çoklu kulüp veritabanı ve kriptografik denetim defteri dışa aktarıldı.`,
          timestamp: formatNowTR(),
        });

        const snapshot = store.getFullSnapshot();
        const chainVerification = verifyAuditChain(snapshot.auditLedger);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="RotaClub_Galata_Pilot_Backup_v5.json"'
        );
        res.send(
          JSON.stringify(
            {
              ...snapshot,
              auditChainVerification: chainVerification,
              exportedBy: user,
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

  // Helper endpoint to list demo officer accounts (without password hashes) for the Pilot Login UI
  app.get('/api/auth/pilot-accounts', (_req, res) => {
    res.json({
      accounts: PILOT_ACCOUNTS.map((a) => ({
        memberId: a.memberId,
        rotaryId: a.rotaryId,
        fullName: a.fullName,
        email: a.email,
        role: a.role,
        clubId: a.clubId,
        demoPinHint: a.pinCode,
      })),
    });
  });

  return { app, store, issueSignedToken };
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
    console.log(`RotaClub Hardened Pilot Server v5.0 running on http://localhost:${PORT}`);
  });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  startServer();
}
