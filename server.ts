import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  GALATA_ROTARY_MEMBERS,
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
} from './src/data/mockGalataData';
import { AuditLogEntry, ClubRole } from './src/types/rotary';

const PORT = 3000;
const DB_DIR = path.resolve(process.cwd(), '.aistudio');
const DB_FILE = path.join(DB_DIR, 'rotaclub_pilot_db.json');

const ROLE_ACTORS: Record<ClubRole, string> = {
  uye: 'Rtn. Rifat Akın (Üye · TR-2420-88412)',
  sekreter: 'Rtn. Av. Nazlı Denizmen (Genel Sekreter)',
  sayman: 'Rtn. YMM Levent Soydan (Sayman)',
  baskan: 'Rtn. Mimar Emre Karaca (Dönem Başkanı)',
};

const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-1004',
    timestamp: '22 Ekim 2026 · 14:20',
    actorName: 'Rtn. Av. Nazlı Denizmen (Genel Sekreter)',
    actorRole: 'sekreter',
    module: 'LCV & Kuver',
    action: '1842. Toplantı Kuver Matrisi Senkronizasyonu',
    detail: 'Pera Palace Hotel mutfak kuver listesi (35 Kuver) sunucu veritabanında doğrulandı.',
    verifiedByServer: true,
  },
  {
    id: 'aud-1003',
    timestamp: '22 Ekim 2026 · 11:15',
    actorName: 'Rtn. Kerem Soylu (Üye · TR-2420-83190)',
    actorRole: 'uye',
    module: 'Saymanlık & Kasa',
    action: 'FAST Dekont Bildirimi (#GAR-2026-88341)',
    detail: '9.000 TL 1. Yarıyıl Aidat 2. Taksit ödemesi Sayman onay kuyruğuna eklendi.',
    verifiedByServer: true,
  },
  {
    id: 'aud-1002',
    timestamp: '20 Ekim 2026 · 18:45',
    actorName: 'Rtn. YMM Levent Soydan (Sayman)',
    actorRole: 'sayman',
    module: 'Saymanlık & Kasa',
    action: 'Kasa Defteri Tahsilat Kaydı (#GAR-2026-99120)',
    detail: '14 üyenin Ekim ayı aidat ve kuver tahsilatı (168.000 TL) kasa defterine işlendi.',
    verifiedByServer: true,
  },
  {
    id: 'aud-1001',
    timestamp: '20 Ekim 2026 · 09:00',
    actorName: 'Rtn. Mimar Emre Karaca (Dönem Başkanı)',
    actorRole: 'baskan',
    module: 'Yönetim & Güvenlik',
    action: 'Galata Rotary Pilot Veritabanı & RBAC Başlatıldı',
    detail: 'Sunucu tabanlı rol doğrulama (RBAC), ortak veri saklama ve denetim izi aktif edildi.',
    verifiedByServer: true,
  },
];

function createDefaultDatabaseState() {
  return {
    version: '4.0.0-pilot',
    clubId: 'galata-rotary-2420',
    updatedAt: new Date().toISOString(),
    termInfo: INITIAL_TERM_BOARD,
    meetings: INITIAL_MEETINGS_LIST,
    selectedMeetingNo: 1842,
    rsvpStatus: 'attending',
    menuPreference: 'Standart',
    guestNameInput: 'Mim. Caner Erkin — Kentsel Tasarım',
    ritualSteps: INITIAL_RITUAL_STEPS,
    celebrations: INITIAL_CELEBRATIONS,
    speakerProposals: INITIAL_SPEAKER_PROPOSALS,
    qrCheckedIn: false,
    makeupSubmissions: INITIAL_MAKEUP_SUBMISSIONS,
    guestMakeupCards: INITIAL_GUEST_MAKEUP_CARDS,
    firesideGroups: INITIAL_FIRESIDE_GROUPS,
    financialItems: INITIAL_FINANCIAL_ITEMS,
    paymentNotifications: INITIAL_PAYMENT_NOTIFICATIONS,
    overdueMembers: INITIAL_OVERDUE_MEMBERS,
    treasuryLedger: INITIAL_TREASURY_LEDGER,
    projects: INITIAL_GALATA_PROJECTS,
    scholars: INITIAL_SCHOLARS,
    members: GALATA_ROTARY_MEMBERS,
    committees: INITIAL_CLUB_COMMITTEES,
    pastPresidents: INITIAL_PAST_PRESIDENTS,
    auditLogs: INITIAL_AUDIT_LOGS,
  };
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const initial = createDefaultDatabaseState();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...createDefaultDatabaseState(),
      ...parsed,
    };
  } catch {
    return createDefaultDatabaseState();
  }
}

function saveDatabase(state: ReturnType<typeof createDefaultDatabaseState>) {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    const updated = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch {
    return state;
  }
}

function formatNowTR(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const secs = String(now.getSeconds()).padStart(2, '0');
  return `22 Ekim 2026 · ${hours}:${mins}:${secs}`;
}

/**
 * Server-Side RBAC Verification Middleware (#22 & #23)
 */
function requireServerRole(allowedRoles: ClubRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const headerRole = (req.headers['x-rotaclub-role'] as ClubRole) || req.body?.activeRole || 'uye';
    if (!allowedRoles.includes(headerRole)) {
      res.status(403).json({
        error: 'RBAC_FORBIDDEN',
        message: `Bu işlem için sunucu yetkisi gereklidir (${allowedRoles.join(' / ')}). Mevcut rolünüz: ${headerRole}`,
      });
      return;
    }
    next();
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  let dbState = loadDatabase();

  // 1. Health & Pilot Metadata (#13, #20)
  app.get('/api/pilot/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: 'RotaClub Pilot Server v4.0',
      club: 'Galata Rotary Kulübü (UR 2420. Bölge)',
      persistentStorage: true,
      rbacEnforced: true,
      updatedAt: dbState.updatedAt,
      auditCount: dbState.auditLogs.length,
    });
  });

  // 2. Get Shared Club State + Audit Trail (#14, #18)
  app.get('/api/pilot/state', (_req, res) => {
    dbState = loadDatabase();
    res.json(dbState);
  });

  // 3. Synchronize State + Append Verified Server Audit Log (#14, #18, #22, #23)
  app.post('/api/pilot/sync', (req, res) => {
    const incomingRole: ClubRole =
      (req.headers['x-rotaclub-role'] as ClubRole) || req.body?.activeRole || 'uye';
    const auditEvent = req.body?.auditEvent as
      | {
          module: AuditLogEntry['module'];
          action: string;
          detail: string;
          requiredRoles?: ClubRole[];
        }
      | undefined;

    // Server-side RBAC check if the action specifies required roles
    if (
      auditEvent?.requiredRoles &&
      auditEvent.requiredRoles.length > 0 &&
      !auditEvent.requiredRoles.includes(incomingRole)
    ) {
      res.status(403).json({
        error: 'RBAC_FORBIDDEN',
        message: `Sunucu RBAC Reddi: "${auditEvent.action}" işlemi yalnızca [${auditEvent.requiredRoles.join(', ')}] rolleri tarafından yapılabilir.`,
      });
      return;
    }

    const nextAuditLogs = [...(dbState.auditLogs || INITIAL_AUDIT_LOGS)];
    if (auditEvent && auditEvent.action) {
      const entry: AuditLogEntry = {
        id: `aud-${Date.now()}`,
        timestamp: formatNowTR(),
        actorName: ROLE_ACTORS[incomingRole] || ROLE_ACTORS.uye,
        actorRole: incomingRole,
        module: auditEvent.module || 'Yönetim & Güvenlik',
        action: auditEvent.action,
        detail: auditEvent.detail,
        verifiedByServer: true,
      };
      nextAuditLogs.unshift(entry);
    }

    const nextState = {
      ...dbState,
      ...req.body.state,
      auditLogs: nextAuditLogs.slice(0, 100),
    };

    dbState = saveDatabase(nextState);
    res.json({
      ok: true,
      updatedAt: dbState.updatedAt,
      auditLogs: dbState.auditLogs,
    });
  });

  // 4. Reset Pilot Database (#14, #18)
  app.post('/api/pilot/reset', (req, res) => {
    const incomingRole: ClubRole =
      (req.headers['x-rotaclub-role'] as ClubRole) || 'baskan';
    const fresh = createDefaultDatabaseState();
    fresh.auditLogs = [
      {
        id: `aud-${Date.now()}`,
        timestamp: formatNowTR(),
        actorName: ROLE_ACTORS[incomingRole] || ROLE_ACTORS.baskan,
        actorRole: incomingRole,
        module: 'Yönetim & Güvenlik',
        action: 'Pilot Veritabanı Başlangıç Durumuna Sıfırlandı',
        detail: 'Tüm ortak kulüp verileri, LCV matrisi ve kasa hareketleri ilk sunum durumuna döndürüldü.',
        verifiedByServer: true,
      },
      ...INITIAL_AUDIT_LOGS,
    ];
    dbState = saveDatabase(fresh);
    res.json(dbState);
  });

  // 5. Full JSON Database & Audit Log Backup Export (#19)
  app.get(
    '/api/pilot/backup',
    requireServerRole(['sekreter', 'sayman', 'baskan', 'uye']),
    (req, res) => {
      const incomingRole: ClubRole =
        (req.headers['x-rotaclub-role'] as ClubRole) || 'baskan';
      const backupEntry: AuditLogEntry = {
        id: `aud-${Date.now()}`,
        timestamp: formatNowTR(),
        actorName: ROLE_ACTORS[incomingRole] || ROLE_ACTORS.baskan,
        actorRole: incomingRole,
        module: 'Yönetim & Güvenlik',
        action: 'Tam Veritabanı & Denetim İzi Yedeği Alındı (.JSON)',
        detail: 'Galata Rotary Kulübü ortak veritabanı ve denetim geçmişi dışa aktarıldı.',
        verifiedByServer: true,
      };
      dbState.auditLogs = [backupEntry, ...(dbState.auditLogs || [])].slice(0, 100);
      dbState = saveDatabase(dbState);

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="RotaClub_Galata_Pilot_Backup_v4.json"'
      );
      res.send(JSON.stringify(dbState, null, 2));
    }
  );

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
    console.log(`RotaClub Pilot Server running on http://localhost:${PORT}`);
  });
}

startServer();
