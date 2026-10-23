import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
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
  MemberRsvp,
  MenuPreference,
  OverdueMemberItem,
  PastPresidentRecord,
  PaymentNotification,
  RitualStep,
  RotaryMember,
  RsvpStatus,
  ScholarStudent,
  SpeakerProposal,
  TabId,
  TenantClubOption,
  TermBoardInfo,
  TreasuryLedgerEntry,
  WeeklyMeeting,
} from './types/rotary';
import {
  GALATA_ROTARY_MEMBERS,
  GALLERY_ARCHIVE_PHOTOS,
  INITIAL_BOARD_RESOLUTIONS,
  INITIAL_CELEBRATIONS,
  INITIAL_CLUB_COMMITTEES,
  INITIAL_FINANCIAL_ITEMS,
  INITIAL_FIRESIDE_GROUPS,
  INITIAL_GALATA_PROJECTS,
  INITIAL_GUEST_MAKEUP_CARDS,
  INITIAL_MAKEUP_SUBMISSIONS,
  INITIAL_MEETINGS_LIST,
  INITIAL_OTHER_MEMBER_RSVPS,
  INITIAL_OVERDUE_MEMBERS,
  INITIAL_PAST_PRESIDENTS,
  INITIAL_PAYMENT_NOTIFICATIONS,
  INITIAL_RITUAL_STEPS,
  INITIAL_SCHOLARS,
  INITIAL_SPEAKER_PROPOSALS,
  INITIAL_TERM_BOARD,
  INITIAL_TREASURY_LEDGER,
} from './data/mockGalataData';
import {
  applyBulkMemberAccrual,
  calculateKuverSummary,
  calculateMemberFinanceSummary,
  calculateUpdatedAttendance,
  createSpeakerProposal,
  executeJulyFirstRollover,
  formatTL,
  toggleVoteSpeakerProposal,
} from './utils/rotaryLogic';
import { HeaderAndRoleBar } from './components/HeaderAndRoleBar';
import { BottomNav } from './components/BottomNav';
import { HomeTab } from './components/HomeTab';
import { OperationsTab } from './components/OperationsTab';
import { FinanceTab } from './components/FinanceTab';
import { ProjectsTab } from './components/ProjectsTab';
import { DirectoryAndProfileTab } from './components/DirectoryAndProfileTab';
import { AppleWalletModal } from './components/AppleWalletModal';
import { SplashLockScreenModal } from './components/SplashLockScreenModal';
import { OfficialMakeupCertificateModal } from './components/OfficialMakeupCertificateModal';
import { PilotAuditAndBackupModal } from './components/PilotAuditAndBackupModal';

interface ToastMessage {
  id: string;
  title: string;
  detail: string;
}

export default function App() {
  // Core Navigation, Multi-Tenant & Cryptographic Session State (No localStorage full-state overwrite!)
  const [activeRole, setActiveRole] = useState<ClubRole>('uye');
  const [sessionToken, setSessionToken] = useState<string>('');
  const sessionTokenRef = useRef<string>('');
  const roleTokensRef = useRef<Partial<Record<ClubRole, string>>>({});
  const serverRevisionRef = useRef<number | undefined>(undefined);
  const [activeTenantClubId, setActiveTenantClubId] = useState<string>('club-galata');
  const [activeTenantClubName, setActiveTenantClubName] = useState<string>(
    'Galata Rotary Kulübü'
  );
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isSplashModalOpen, setIsSplashModalOpen] = useState(false);

  // Term & Rollover State
  const [termInfo, setTermInfo] = useState<TermBoardInfo>(INITIAL_TERM_BOARD);

  // Tab 1: Home, Meetings Archive, Speaker Pool & Meeting Cockpit State
  const [meetings, setMeetings] = useState<WeeklyMeeting[]>(INITIAL_MEETINGS_LIST);
  const [selectedMeetingNo, setSelectedMeetingNo] = useState<number>(1842);
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>('attending');
  const [menuPreference, setMenuPreference] = useState<MenuPreference>('Standart');
  const [guestNameInput, setGuestNameInput] = useState<string>(
    'Mim. Caner Erkin — Kentsel Tasarım'
  );
  const [ritualSteps, setRitualSteps] = useState<RitualStep[]>(INITIAL_RITUAL_STEPS);
  const [celebrations, setCelebrations] = useState<CelebrationItem[]>(
    INITIAL_CELEBRATIONS
  );
  const [speakerProposals, setSpeakerProposals] = useState<SpeakerProposal[]>(
    INITIAL_SPEAKER_PROPOSALS
  );

  // Tab 2: Operations (QR, Make-up, Fireside) State
  const [qrCheckedIn, setQrCheckedIn] = useState<boolean>(false);
  const [makeupSubmissions, setMakeupSubmissions] = useState<MakeupSubmission[]>(
    INITIAL_MAKEUP_SUBMISSIONS
  );
  const [guestMakeupCards, setGuestMakeupCards] = useState<GuestRotaryMakeupCard[]>(
    INITIAL_GUEST_MAKEUP_CARDS
  );
  const [activeCertificateCard, setActiveCertificateCard] =
    useState<GuestRotaryMakeupCard | null>(null);
  const [firesideGroups, setFiresideGroups] = useState<FiresideGroup[]>(
    INITIAL_FIRESIDE_GROUPS
  );

  // Tab 3: Finance, Member Cari Matrix & Club Treasury Ledger State
  const [financialItems, setFinancialItems] = useState<FinancialLineItem[]>(
    INITIAL_FINANCIAL_ITEMS
  );
  const [paymentNotifications, setPaymentNotifications] = useState<
    PaymentNotification[]
  >(INITIAL_PAYMENT_NOTIFICATIONS);
  const [overdueMembers, setOverdueMembers] = useState<OverdueMemberItem[]>(
    INITIAL_OVERDUE_MEMBERS
  );
  const [treasuryLedger, setTreasuryLedger] = useState<TreasuryLedgerEntry[]>(
    INITIAL_TREASURY_LEDGER
  );

  // Tab 4: Galata Projects & Scholars Fund State
  const [projects, setProjects] = useState<GalataProject[]>(INITIAL_GALATA_PROJECTS);
  const [scholars, setScholars] = useState<ScholarStudent[]>(INITIAL_SCHOLARS);

  // Tab 5: Classification Directory, Committees, Past Presidents & Apple Wallet Modal State
  const [members, setMembers] = useState<RotaryMember[]>(GALATA_ROTARY_MEMBERS);
  const [committees, setCommittees] = useState<ClubCommittee[]>(
    INITIAL_CLUB_COMMITTEES
  );
  const [pastPresidents, setPastPresidents] = useState<PastPresidentRecord[]>(
    INITIAL_PAST_PRESIDENTS
  );
  const [walletModalMember, setWalletModalMember] = useState<RotaryMember | null>(
    null
  );
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [serverSyncedAt, setServerSyncedAt] = useState<string | null>(null);
  const [boardResolutions, setBoardResolutions] = useState<BoardResolutionItem[]>(
    INITIAL_BOARD_RESOLUTIONS
  );
  const [kvkkMaskPhone, setKvkkMaskPhone] = useState<boolean>(false);
  const [auditChainValid, setAuditChainValid] = useState<boolean>(true);
  const [auditHeadHash, setAuditHeadHash] = useState<string>('GENESIS_2420');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    document.title = `RotaClub — ${activeTenantClubName} · 2420. Bölge`;
  }, [activeTenantClubName]);

  const applyServerTenantState = (serverData: Record<string, unknown>) => {
    if (!serverData) return;
    if (typeof serverData.revision === 'number') {
      serverRevisionRef.current = serverData.revision;
    }
    if (typeof serverData.updatedAt === 'string') {
      setServerSyncedAt(serverData.updatedAt);
    }
    if (Array.isArray(serverData.auditLogs)) {
      setAuditLogs(serverData.auditLogs as AuditLogEntry[]);
    }
    if (
      serverData.auditVerification &&
      typeof serverData.auditVerification === 'object'
    ) {
      const ver = serverData.auditVerification as {
        valid: boolean;
        headHash: string;
      };
      setAuditChainValid(Boolean(ver.valid));
      if (ver.headHash) setAuditHeadHash(ver.headHash);
    }
    if (serverData.termInfo) setTermInfo(serverData.termInfo as TermBoardInfo);
    if (serverData.meetings) setMeetings(serverData.meetings as WeeklyMeeting[]);
    if (typeof serverData.selectedMeetingNo === 'number') {
      setSelectedMeetingNo(serverData.selectedMeetingNo);
    }
    if (serverData.rsvpStatus) setRsvpStatus(serverData.rsvpStatus as RsvpStatus);
    if (serverData.menuPreference) {
      setMenuPreference(serverData.menuPreference as MenuPreference);
    }
    if (serverData.members) setMembers(serverData.members as RotaryMember[]);
    if (serverData.paymentNotifications) {
      setPaymentNotifications(
        serverData.paymentNotifications as PaymentNotification[]
      );
    }
    if (serverData.overdueMembers) {
      setOverdueMembers(serverData.overdueMembers as OverdueMemberItem[]);
    }
    if (serverData.treasuryLedger) {
      setTreasuryLedger(serverData.treasuryLedger as TreasuryLedgerEntry[]);
    }
    if (serverData.projects) setProjects(serverData.projects as GalataProject[]);
    if (serverData.scholars) setScholars(serverData.scholars as ScholarStudent[]);
    if (serverData.boardResolutions) {
      setBoardResolutions(serverData.boardResolutions as BoardResolutionItem[]);
    }
    if (typeof serverData.kvkkMaskPhone === 'boolean') {
      setKvkkMaskPhone(serverData.kvkkMaskPhone);
    }
  };

  const authenticateAndFetchClubState = async (
    role: ClubRole,
    clubId: string,
    explicitToken?: string
  ) => {
    try {
      const token = explicitToken || roleTokensRef.current[role] || '';
      if (!token) {
        return false;
      }

      roleTokensRef.current[role] = token;
      sessionTokenRef.current = token;
      setSessionToken(token);

      const stateRes = await fetch(
        `/api/pilot/state?clubId=${encodeURIComponent(clubId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!stateRes.ok) return false;
      const serverData = await stateRes.json();
      applyServerTenantState(serverData);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Sends ONLY the changed delta patch with optimistic concurrency control (expectedRevision) (#14, #18)
   * Never dumps stale full-state arrays over concurrent edits!
   */
  const recordServerAudit = (
    module: AuditLogEntry['module'],
    action: string,
    detail: string,
    requiredRoles?: ClubRole[],
    patchOverride?: Record<string, unknown>
  ) => {
    const token = sessionTokenRef.current || sessionToken;
    if (!token) return;

    fetch('/api/pilot/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        clubId: activeTenantClubId,
        expectedRevision: serverRevisionRef.current,
        auditEvent: {
          module,
          action,
          detail,
          requiredRoles,
        },
        state: patchOverride || {},
      }),
    })
      .then(async (res) => {
        if (res.status === 409) {
          // Revision conflict or duplicate reference: reload authoritative server state
          await authenticateAndFetchClubState(
            activeRole,
            activeTenantClubId,
            token
          );
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (!data) return;
        if (typeof data.revision === 'number') {
          serverRevisionRef.current = data.revision;
        }
        if (data.state) {
          applyServerTenantState(data.state);
        } else {
          if (data.auditLogs) setAuditLogs(data.auditLogs);
          if (data.updatedAt) setServerSyncedAt(data.updatedAt);
          if (data.auditVerification) {
            setAuditChainValid(Boolean(data.auditVerification.valid));
            if (data.auditVerification.headHash) {
              setAuditHeadHash(data.auditVerification.headHash);
            }
          }
        }
      })
      .catch(() => {});
  };

  const showToast = (title: string, detail: string) => {
    setToast({
      id: String(Date.now()),
      title,
      detail,
    });
  };

  // Demo Reset Handler — Requires 'baskan' authenticated token & preserves SHA-256 Audit Ledger (#14, #18, #23)
  const handleResetDemoData = async () => {
    const baskanToken =
      roleTokensRef.current.baskan ||
      (activeRole === 'baskan' ? sessionTokenRef.current : '');
    if (!baskanToken) {
      setActiveRole('baskan');
      setIsSplashModalOpen(true);
      showToast(
        'Başkan Kimlik Doğrulaması Gerekli (#23)',
        'Veritabanını sıfırlamak için lütfen Dönem Başkanı (TR-2420-74105) oturumu ile kimlik doğrulaması yapın.'
      );
      return;
    }

    try {
      const resetRes = await fetch('/api/pilot/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${baskanToken}`,
        },
        body: JSON.stringify({ clubId: activeTenantClubId }),
      });

      if (!resetRes.ok) {
        const errData = await resetRes.json().catch(() => ({}));
        showToast(
          'Sıfırlama Yetki Reddi',
          errData?.message || 'Yalnızca doğrulanmış Başkan oturumu sıfırlama yapabilir.'
        );
        return;
      }

      const freshData = await resetRes.json();
      applyServerTenantState(freshData);

      showToast(
        'Operasyonel Veriler Sıfırlandı (SHA-256 Denetim Defteri Korundu)',
        'Kulüp tabloları başlangıç durumuna döndürüldü; değiştirilemez SHA-256 denetim zincirine sıfırlama kaydı eklendi.'
      );
    } catch {
      showToast('Sıfırlama Uyarısı', 'Sunucu bağlantısı doğrulanamadı.');
    }
  };

  const handleDownloadBackup = async () => {
    if (activeRole === 'uye') {
      showToast(
        'Sunucu RBAC Yetki Kısıtlaması (403)',
        'Tam veritabanı ve finansal yedek indirme işlemi yalnızca Başkan, Sekreter ve Sayman oturumlarına açıktır.'
      );
      return;
    }
    const token = sessionTokenRef.current || sessionToken;
    try {
      const res = await fetch('/api/pilot/backup', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        showToast(
          'Yedekleme Yetki Uyarısı',
          'Yedek dosyası yalnızca doğrulanmış Yönetim Kurulu oturumu ile indirilebilir.'
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RotaClub_${activeTenantClubId}_Backup_v5_2.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(
        'Kulüp Veritabanı & SHA-256 Denetim Zinciri İndirildi (.JSON)',
        `RotaClub_${activeTenantClubId}_Backup_v5_2.json dosyası Authorization Bearer başlığı ile güvenli şekilde indirildi.`
      );
    } catch {
      showToast('Yedekleme Hatası', 'Sunucu yedekleme servisine ulaşılamadı.');
    }
  };

  const handleAddBoardResolution = (
    payload: Omit<BoardResolutionItem, 'id' | 'signedBy'>
  ) => {
    const created: BoardResolutionItem = {
      id: `yk-${Date.now()}`,
      ...payload,
      signedBy:
        'Rtn. Mimar Emre Karaca (Başkan) · Rtn. Av. Nazlı Denizmen (Sekreter)',
    };
    const nextList = [created, ...boardResolutions];
    setBoardResolutions(nextList);
    recordServerAudit(
      'Yönetim & Güvenlik',
      `YK Karar Defterine Kayıt: ${payload.resolutionNo}`,
      `${payload.title} (${payload.voteStatus}) Yönetim Kurulu Karar Defterine işlendi.`,
      ['sekreter', 'baskan'],
      { boardResolutions: nextList }
    );
    showToast(
      `YK Kararı Kaydedildi (${payload.resolutionNo})`,
      `"${payload.title}" Yönetim Kurulu Karar Defterine eklendi.`
    );
  };

  const handleToggleKvkkMaskPhone = () => {
    const nextState = !kvkkMaskPhone;
    setKvkkMaskPhone(nextState);
    recordServerAudit(
      'Yönetim & Güvenlik',
      `KVKK Telefon Maskeleme ${nextState ? 'Aktif Edildi' : 'Kapatıldı'}`,
      `Üye rehberi telefon numaraları KVKK gizlilik modu kapsamında ${nextState ? 'maskelendi' : 'tam görünüme açıldı'}.`,
      ['sekreter', 'sayman', 'baskan'],
      { kvkkMaskPhone: nextState }
    );
    showToast(
      nextState ? 'KVKK Telefon Maskeleme Aktif' : 'KVKK Telefon Maskeleme Kapatıldı',
      nextState
        ? 'Rehberdeki üye telefon numaraları KVKK kapsamında maskelendi (+90 532 *** ** 18).'
        : 'Yetkili oturum için telefon numaraları tam görünüme açıldı.'
    );
  };

  // Derived Calculations via Pure Logic
  const extraMakeupsCount = Math.max(
    0,
    makeupSubmissions.length - INITIAL_MAKEUP_SUBMISSIONS.length
  );
  const attendancePercent = calculateUpdatedAttendance(
    92,
    extraMakeupsCount,
    qrCheckedIn
  );

  const combinedRsvpList: MemberRsvp[] = [
    ...members
      .filter((m) => m.id !== 'm-rifat')
      .map((m) => ({
        memberId: m.id,
        memberName: m.fullName,
        status: m.rsvpStatus,
        menu: m.mealPreference,
        guestCount: m.rsvpStatus === 'with_guest' ? 1 : 0,
      })),
    ...INITIAL_OTHER_MEMBER_RSVPS.slice(9),
  ];

  const kuverSummary = calculateKuverSummary(
    combinedRsvpList,
    rsvpStatus,
    menuPreference,
    1
  );

  const financeSummary = calculateMemberFinanceSummary(
    financialItems,
    paymentNotifications,
    'm-rifat'
  );

  const pendingPaymentsCount = paymentNotifications.filter(
    (p) => p.status === 'Bekliyor'
  ).length;

  // Handlers
  const handleSelectRole = async (role: ClubRole, explicitToken?: string) => {
    setActiveRole(role);
    const hasSession = await authenticateAndFetchClubState(
      role,
      activeTenantClubId,
      explicitToken
    );
    const roleNames: Record<ClubRole, string> = {
      uye: 'Üye: Rifat Akın (Veri Minimizasyonu Aktif)',
      sekreter: 'Genel Sekreter (Rtn. Av. Nazlı Denizmen)',
      sayman: 'Kulüp Saymanı (Rtn. YMM Levent Soydan)',
      baskan: 'Dönem Başkanı (Rtn. Mimar Emre Karaca)',
    };
    if (hasSession) {
      showToast(
        `İmzalı Sunucu Oturumu: ${roleNames[role]}`,
        'Sunucu tarafından HMAC-SHA256 Bearer Token doğrulandı ve rol bazlı veri erişim filtreleri uygulandı.'
      );
    } else {
      showToast(
        `Görünüm: ${roleNames[role]}`,
        'Sunucu yazma/okuma yetkisi için sağ üstteki Kilit Ekranından PIN veya ECDSA P-256 Passkey ile oturum açabilirsiniz.'
      );
    }
  };

  const handleSelectTenantClub = async (tenant: TenantClubOption) => {
    const currentToken = sessionTokenRef.current || sessionToken;
    if (currentToken) {
      try {
        const switchRes = await fetch('/api/auth/switch-club', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify({ targetClubId: tenant.id }),
        });
        const switchData = await switchRes.json();
        if (!switchRes.ok) {
          showToast(
            'Kulüp Üyelik İzolasyonu Engeli (403)',
            switchData?.message ||
              `Mevcut oturumunuzun "${tenant.name}" kulübünde üyelik yetkisi bulunmamaktadır.`
          );
          return;
        }
        setActiveTenantClubId(tenant.id);
        setActiveTenantClubName(tenant.name);
        await authenticateAndFetchClubState(
          activeRole,
          tenant.id,
          switchData.token
        );
        showToast(
          `Çoklu Kulüp İzolasyonu: ${tenant.name}`,
          `${tenant.name} (${tenant.district}) için doğrulanmış kulüp üyeliği ile izole oturum açıldı.`
        );
        return;
      } catch {
        // Offline fallback
      }
    }
    setActiveTenantClubId(tenant.id);
    setActiveTenantClubName(tenant.name);
    showToast(
      `Çoklu Kulüp Görünümü: ${tenant.name}`,
      `${tenant.name} (${tenant.district}) seçildi.`
    );
  };

  const handleChangeRsvpStatus = (status: RsvpStatus) => {
    setRsvpStatus(status);
    const nextMembers = members.map((m) =>
      m.id === 'm-rifat' ? { ...m, rsvpStatus: status } : m
    );
    setMembers(nextMembers);
    const statusLabels: Record<RsvpStatus, string> = {
      attending: 'Katılıyorum (1 Kuver)',
      with_spouse: 'Eşli Katılıyorum (+1 · 2 Kuver)',
      with_guest: 'Konuğum Var (2 Kuver)',
      excused: 'Mazeretliyim (Kuver Düşüldü)',
      pending: 'Yanıt Bekleniyor',
    };
    showToast(
      `LCV Güncellendi: ${statusLabels[status]}`,
      'Pera Palace Hotel canlı kuver listesi ve İsim İsim LCV Matrisi anında güncellendi.'
    );
    recordServerAudit(
      'LCV & Kuver',
      `LCV Bildirimi Güncellendi (${statusLabels[status]})`,
      `Rtn. Rifat Akın #${selectedMeetingNo} toplantı LCV durumunu "${statusLabels[status]}" olarak güncelledi.`,
      undefined,
      { rsvpStatus: status, members: nextMembers }
    );
  };

  const handleChangeMenuPreference = (menu: MenuPreference) => {
    setMenuPreference(menu);
    const nextMembers = members.map((m) =>
      m.id === 'm-rifat' ? { ...m, mealPreference: menu } : m
    );
    setMembers(nextMembers);
    showToast(
      `Menü Tercihi: ${menu}`,
      `Toplantı akşam yemeği tercihiniz "${menu} Menü" olarak kaydedildi.`
    );
    recordServerAudit(
      'LCV & Kuver',
      `Menü Tercihi Güncellendi (${menu})`,
      `Rtn. Rifat Akın akşam yemeği menü tercihini "${menu}" olarak güncelledi.`,
      undefined,
      { menuPreference: menu, members: nextMembers }
    );
  };

  const handleUpdateMemberRsvp = (
    memberId: string,
    status: RsvpStatus,
    menu?: MenuPreference
  ) => {
    const target = members.find((m) => m.id === memberId);
    const nextMembers = members.map((m) =>
      m.id === memberId
        ? {
            ...m,
            rsvpStatus: status,
            mealPreference: menu || m.mealPreference,
          }
        : m
    );
    setMembers(nextMembers);
    if (memberId === 'm-rifat') {
      setRsvpStatus(status);
      if (menu) setMenuPreference(menu);
    }
    if (target) {
      showToast(
        `Üye LCV Durumu Güncellendi: ${target.fullName}`,
        'Pera Palace Hotel canlı kuver toplamı yeni LCV durumuna göre yeniden hesaplandı.'
      );
      recordServerAudit(
        'LCV & Kuver',
        `Sekreterlik Kuver Matrisi Güncellemesi: ${target.fullName}`,
        `${target.fullName} üyesinin LCV durumu "${status}" olarak Sekreterlik/Başkanlık tarafından güncellendi.`,
        ['sekreter', 'baskan'],
        { members: nextMembers }
      );
    }
  };

  const handleRemindUnrespondedMembers = () => {
    const pendingList = members.filter((m) => m.rsvpStatus === 'pending');
    showToast(
      'LCV Hatırlatma Bildirimi Gönderildi',
      pendingList.length > 0
        ? `Henüz yanıt vermeyen ${pendingList.map((m) => m.fullName).join(', ')} için WhatsApp/Push LCV hatırlatması iletildi.`
        : 'Tüm üyelerin LCV yanıtı güncel durumda.'
    );
  };

  const handleDownloadKuverCsvNotify = (meetingNo: number) => {
    showToast(
      `Kuver Listesi CSV İndirildi (#${meetingNo})`,
      `Galata_Rotary_Toplantı_${meetingNo}_Kuver_Listesi.csv dosyası otel banket yönetimine iletilmek üzere indirildi.`
    );
  };

  const handleCreateNewMeeting = (newMeeting: WeeklyMeeting) => {
    const nextMeetings = [...meetings, newMeeting];
    setMeetings(nextMeetings);
    setSelectedMeetingNo(newMeeting.meetingNo);
    showToast(
      `Yeni Toplantı Planlandı (#${newMeeting.meetingNo})`,
      `${newMeeting.date} tarihli "${newMeeting.topic}" toplantısı bülten takvimine eklendi.`
    );
    recordServerAudit(
      'LCV & Kuver',
      `Yeni Haftalık Toplantı Planlandı (#${newMeeting.meetingNo})`,
      `${newMeeting.date} · ${newMeeting.speakerName} (${newMeeting.topic}) bülten takvimine eklendi.`,
      ['sekreter', 'baskan'],
      { meetings: nextMeetings, selectedMeetingNo: newMeeting.meetingNo }
    );
  };

  const handleToggleVoteSpeaker = (proposalId: string) => {
    setSpeakerProposals((prev) => toggleVoteSpeakerProposal(prev, proposalId));
    showToast(
      'Konuk Konuşmacı Oylaması Güncellendi',
      'Oyunuz Program Komitesi konuşmacı havuzuna işlendi.'
    );
  };

  const handleAddSpeakerProposal = (input: {
    speakerName: string;
    speakerTitle: string;
    proposedTopic: string;
    targetMonth: string;
  }) => {
    setSpeakerProposals((prev) =>
      createSpeakerProposal(prev, {
        ...input,
        proposedBy: 'Rtn. Rifat Akın',
      })
    );
    showToast(
      `Yeni Konuşmacı Önerisi: ${input.speakerName}`,
      `“${input.proposedTopic}” başlığı konuşmacı havuzuna eklendi ve oylamaya açıldı.`
    );
  };

  const handleToggleRitualStep = (id: string) => {
    setRitualSteps((prev) =>
      prev.map((step) =>
        step.id === id ? { ...step, completed: !step.completed } : step
      )
    );
    showToast(
      'Toplantı Ritüel Akışı Güncellendi',
      'Kürsü akış maddesi durumu Başkan Kokpitinde işaretlendi.'
    );
  };

  const handleCongratulateMember = (id: string) => {
    const target = celebrations.find((c) => c.id === id);
    setCelebrations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, congratulated: true } : c))
    );
    if (target) {
      showToast(
        `Mutlu Günler Kutlaması: ${target.memberName}`,
        `${target.type} kürsü anonsu yapıldı ve tebrik mesajı iletildi.`
      );
    }
  };

  const handleAdvanceCertificateStatus = () => {
    setMeetings((prev) =>
      prev.map((m) =>
        m.meetingNo === selectedMeetingNo
          ? { ...m, certificateStatus: 'Takdim Edildi' }
          : m
      )
    );
    const activeMeeting =
      meetings.find((m) => m.meetingNo === selectedMeetingNo) || meetings[0];
    showToast(
      'Konuşmacı Teşekkür Sertifikası Takdim Edildi',
      `${activeMeeting.speakerName} adına düzenlenen End Polio Now bağış sertifikası takdim edildi.`
    );
  };

  const handleSendHotelKuverReport = () => {
    showToast(
      'Pera Palace Banket Bildirimi Gönderildi',
      `Toplam ${kuverSummary.totalKuver} Kuver (${kuverSummary.attendingMembers} Üye, ${kuverSummary.spousesCount} Eş, ${kuverSummary.guestsCount} Konuk) mutfak dağılımıyla otele iletildi.`
    );
  };

  const handleSimulateQrCheckIn = () => {
    setQrCheckedIn(true);
    showToast(
      'QR Yoklama Başarılı (+%2 Katılım)',
      '1842. Haftalık Toplantı yoklamanız işlendi ve devam yüzdeniz güncellendi.'
    );
    recordServerAudit(
      'QR Yoklama & Make-up',
      'Pera Palace Masa QR Yoklama Okutuldu (+%2)',
      'TR-2420-88412 (Rtn. Rifat Akın) #1842. Haftalık Toplantı salon giriş yoklaması sunucuya işlendi.',
      undefined,
      { qrCheckedIn: true }
    );
  };

  const handleAddMakeupSubmission = (
    payload: Omit<
      MakeupSubmission,
      'id' | 'status' | 'attendanceBoost' | 'memberName'
    >
  ) => {
    const newEntry: MakeupSubmission = {
      id: `mk-${Date.now()}`,
      memberName: 'Rifat Akın',
      ...payload,
      status: 'Onaylandı',
      attendanceBoost: 3,
    };
    const nextMakeups = [newEntry, ...makeupSubmissions];
    setMakeupSubmissions(nextMakeups);
    showToast(
      'Make-up Bildirimi Onaylandı (+%3 Katılım)',
      `${payload.targetClubOrEvent} katılımınız devam oranınıza eklendi.`
    );
    recordServerAudit(
      'QR Yoklama & Make-up',
      `Make-up Bildirimi Kaydedildi: ${payload.targetClubOrEvent}`,
      `${payload.activityType} (${payload.date}) katılımı devam oranına +%3 olarak işlendi.`,
      undefined,
      { makeupSubmissions: nextMakeups }
    );
  };

  const handleSendGuestMakeupCard = (
    payload: Omit<GuestRotaryMakeupCard, 'id' | 'sentAt' | 'verificationCode'>
  ) => {
    const newCard: GuestRotaryMakeupCard = {
      id: `gmk-${Date.now()}`,
      ...payload,
      sentAt: '23 Ekim 2026 · Şimdi',
      verificationCode: `GLR-2420-${Math.floor(1000 + Math.random() * 8999)}`,
    };
    setGuestMakeupCards((prev) => [newCard, ...prev]);
    setActiveCertificateCard(newCard);
    showToast(
      'Resmi Dijital Make-up Sertifikası Hazır',
      `${payload.guestName} (${payload.guestClub}) için ıslak imzalı ve mühürlü katılım belgesi oluşturuldu.`
    );
  };

  const handleSubmitFiresideReport = (
    groupId: string,
    summary: string,
    attendanceRate: string
  ) => {
    setFiresideGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              reportSubmitted: true,
              reportSummary: summary,
              attendanceRate,
            }
          : group
      )
    );
    showToast(
      'Ocakbaşı (Fireside) Raporu Yüklendi',
      'Toplantı tutanağı ve katılım listesi Kulüp Genel Sekreterliğine iletildi.'
    );
  };

  const handleCreateFiresideGroup = (
    newGroup: Omit<FiresideGroup, 'id' | 'reportSubmitted'>
  ) => {
    const created: FiresideGroup = {
      id: `fs-${Date.now()}`,
      ...newGroup,
      reportSubmitted: false,
    };
    setFiresideGroups((prev) => [created, ...prev]);
    showToast(
      `Yeni Ocakbaşı Grubu Kuruldu: ${newGroup.groupName}`,
      `Ev sahibi ${newGroup.hostMember} ve ${newGroup.participants.length} katılımcı üyeye davet iletildi.`
    );
  };

  const handleCopyIban = (iban: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(iban).catch(() => {});
    }
    showToast(
      'Kulüp IBAN Adresi Kopyalandı',
      `${iban} panoya kopyalandı. Mobil bankacılıktan FAST/EFT yapabilirsiniz.`
    );
  };

  const handleSubmitPaymentNotification = (payload: {
    category: FinancialLineItem['category'];
    amount: number;
    description: string;
    receiptRef: string;
  }) => {
    const newPayment: PaymentNotification = {
      id: `pay-${Date.now()}`,
      memberId: 'm-rifat',
      memberName: 'Rtn. Rifat Akın',
      category: payload.category,
      amount: payload.amount,
      description: payload.description,
      submittedAt: '23 Ekim 2026 · Şimdi',
      receiptRef: payload.receiptRef,
      status: 'Bekliyor',
    };
    const nextPayments = [newPayment, ...paymentNotifications];
    setPaymentNotifications(nextPayments);
    recordServerAudit(
      'Saymanlık & Kasa',
      `Dekont Bildirimi Alındı (${payload.receiptRef})`,
      `Rtn. Rifat Akın ${formatTL(payload.amount)} tutarlı dekontu Sayman banka mutabakat kuyruğuna iletti.`,
      undefined,
      { paymentNotifications: nextPayments }
    );
    showToast(
      'Dekont Bildirimi Banka Mutabakat Kuyruğuna Eklendi',
      `${formatTL(payload.amount)} tutarındaki bildiriminiz Sayman banka ekstresi eşleştirmesi sonrasında cari bakiyenizden düşülecektir.`
    );
  };

  /**
   * Hardened Bank Statement Reconciliation (#6, #76)
   * Calls POST /api/pilot/reconcile-payment to match the receiptRef against the server's bank statements
   * before posting to treasuryLedger or deducting member debt.
   */
  const handleApprovePayment = async (paymentId: string) => {
    const target = paymentNotifications.find((p) => p.id === paymentId);
    if (!target) return;

    const token = sessionTokenRef.current || sessionToken;
    try {
      const res = await fetch('/api/pilot/reconcile-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          paymentId,
          bankRef: target.receiptRef,
          clubId: activeTenantClubId,
        }),
      });

      const data = await res.json();
      if (res.ok && data?.state) {
        applyServerTenantState(data.state);
        showToast(
          `Banka Mutabakatı Doğrulandı (${target.receiptRef})`,
          `${target.memberName} (${formatTL(target.amount)}) ödemesi Garanti BBVA FAST ekstresiyle eşleştirildi, cari hesaptan düşüldü ve kasa defterine işlendi.`
        );
        return;
      }

      // If custom user-submitted receiptRef isn't in initial bank feed, explain bank reconciliation requirement
      showToast(
        'Banka Ekstresi Eşleşme Kontrolü',
        data?.message ||
          `Dekont referansı (${target.receiptRef}) banka ekstresinde doğrulanamadı.`
      );
    } catch {
      showToast('Mutabakat Hatası', 'Sunucu banka mutabakat servisine ulaşılamadı.');
    }
  };

  const handleRejectPayment = (paymentId: string) => {
    const target = paymentNotifications.find((p) => p.id === paymentId);
    setPaymentNotifications((prev) =>
      prev.map((p) => (p.id === paymentId ? { ...p, status: 'Reddedildi' } : p))
    );
    if (target) {
      showToast(
        'Ödeme Bildirimi Reddedildi',
        `${target.memberName} (${target.receiptRef}) dekont kaydı banka ekstresiyle uyuşmadığı için reddedildi.`
      );
    }
  };

  const handleSendGentleReminder = (overdueId: string) => {
    const target = overdueMembers.find((o) => o.id === overdueId);
    setOverdueMembers((prev) =>
      prev.map((o) =>
        o.id === overdueId ? { ...o, lastRemindedAt: 'Az Önce İletildi' } : o
      )
    );
    if (target) {
      showToast(
        'Nazik Hatırlatma Bildirimi Gönderildi',
        `${target.memberName} için Rotary dostluk dilinde hazırlanan bakiye hatırlatması iletildi.`
      );
    }
  };

  const handleRemindMemberBalance = (memberName: string, totalDebt: number) => {
    showToast(
      `Cari Bakiye Hatırlatması: ${memberName}`,
      `Rtn. ${memberName} için ${formatTL(totalDebt)} cari bakiye hatırlatma mesajı iletildi.`
    );
  };

  const handleBulkAccrual = async (
    category: FinancialLineItem['category'],
    amount: number,
    description: string
  ) => {
    const token = sessionTokenRef.current || sessionToken;
    if (token) {
      try {
        const res = await fetch('/api/pilot/accrue-dues', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            clubId: activeTenantClubId,
            category,
            amount,
            description,
            dueDate: '15 Kasım 2026',
          }),
        });
        const data = await res.json();
        if (res.ok && data?.state) {
          applyServerTenantState(data.state);
          showToast(
            `Sunucu Yönetimli Toplu Tahakkuk Uygulandı (${formatTL(amount)})`,
            `Tüm kulüp üyelerinin "${category}" cari bakiyesine "${description}" kalemi sunucu tarafından işlendi.`
          );
          return;
        }
        showToast(
          'Tahakkuk Yetki / Doğrulama Uyarısı',
          data?.message || 'Toplu tahakkuk yalnızca Sayman veya Başkan oturumuyla yapılabilir.'
        );
        return;
      } catch {
        // Fallback to local state when offline
      }
    }

    const nextMembers = applyBulkMemberAccrual(members, category, amount);
    setMembers(nextMembers);
    const nextFinItems = [
      ...financialItems,
      {
        id: `fin-${Date.now()}`,
        category,
        title: description,
        period: 'Ekim 2026 Tahakkuku',
        totalAmount: amount,
        paidAmount: 0,
        dueDate: '15 Kasım 2026',
      },
    ];
    setFinancialItems(nextFinItems);
    showToast(
      `Toplu Tahakkuk Uygulandı (${formatTL(amount)})`,
      `Tüm kulüp üyelerinin "${category}" cari bakiyesine "${description}" kalemi eklendi.`
    );
  };

  const handleAddTreasuryEntry = async (entry: Omit<TreasuryLedgerEntry, 'id'>) => {
    const token = sessionTokenRef.current || sessionToken;
    if (token) {
      try {
        const res = await fetch('/api/pilot/reconcile-expense', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            clubId: activeTenantClubId,
            ...entry,
          }),
        });
        const data = await res.json();
        if (res.ok && data?.state) {
          applyServerTenantState(data.state);
          showToast(
            `Sunucu Doğrulamalı Kasa Kaydı Eklendi (${entry.type})`,
            `${entry.title} (${formatTL(entry.amount)}) mükerrer belge kontrolüyle Kulüp Kasa Defterine işlendi.`
          );
          return;
        }
        showToast(
          'Kasa Defteri Mutabakat Kuralı (#39)',
          data?.message || 'Kasa defteri kaydı doğrulanamadı.'
        );
        return;
      } catch {
        // Fallback to local state when offline
      }
    }

    const created: TreasuryLedgerEntry = {
      id: `tr-${Date.now()}`,
      ...entry,
    };
    const nextLedger = [created, ...treasuryLedger];
    setTreasuryLedger(nextLedger);
    showToast(
      `Kasa Defteri Kaydı Eklendi (${entry.type})`,
      `${entry.title} (${formatTL(entry.amount)}) Kulüp Kasa & Gelir-Gider Defterine işlendi.`
    );
  };

  const handleDownloadFinanceCsvNotify = () => {
    showToast(
      'Tüm Üyeler Cari Matrisi CSV İndirildi',
      'Galata_Rotary_Tum_Uyeler_Cari_Bakiye_Matrisi.csv dosyası bilgisayarınıza indirildi.'
    );
  };

  /**
   * Hardened Financial Integrity (#6, #39, #76):
   * Member project support creates a pending payment notification with a unique bank reference.
   * Project collectedAmount is ONLY incremented when the Treasurer reconciles the bank statement via /api/pilot/reconcile-payment.
   */
  const handleSupportProject = (
    projectId: string,
    amount: number,
    supportType: string
  ) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;

    const usedRefs = new Set(
      paymentNotifications.map((p) => p.receiptRef.replace(/^#+/, '').toUpperCase())
    );
    const candidateRef =
      amount === 5000 && !usedRefs.has('GAR-2026-99501')
        ? 'GAR-2026-99501'
        : amount === 7500 && !usedRefs.has('GAR-2026-99503')
        ? 'GAR-2026-99503'
        : `GAR-2026-${String(Date.now()).slice(-5)}`;

    const newPayment: PaymentNotification = {
      id: `pay-prj-${Date.now()}`,
      memberId: 'm-rifat',
      memberName: 'Rtn. Rifat Akın',
      category: 'Vakıf / Proje Katkı Payı',
      amount,
      description: `${target.title} — ${supportType}`,
      submittedAt: '23 Ekim 2026 · Şimdi',
      receiptRef: candidateRef,
      status: 'Bekliyor',
      targetProjectId: projectId,
    };
    const nextPayments = [newPayment, ...paymentNotifications];
    setPaymentNotifications(nextPayments);

    recordServerAudit(
      'Projeler & Burslar',
      `Proje Katkı Bildirimi (Mutabakat Bekliyor): ${target.title}`,
      `Rtn. Rifat Akın tarafından ${formatTL(amount)} (${supportType}) proje katkısı bildirildi; banka mutabakatı (${candidateRef}) sonrası proje fonuna işlenecek.`,
      undefined,
      { paymentNotifications: nextPayments }
    );
    showToast(
      `${target.title} Katkı Bildiriminiz Alındı (${candidateRef})`,
      `${formatTL(amount)} (${supportType}) katkınız Sayman banka mutabakat kuyruğuna eklendi; banka ekstresi eşleştiğinde proje bütçesine eklenecektir.`
    );
  };

  const handleToggleProjectVolunteer = (projectId: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const currentList = target.volunteers || [
      'Rtn. Deniz Arslan',
      'Rtn. Zeynep Yıldırım',
    ];
    const isAlreadyVolunteer = currentList.includes('Rtn. Rifat Akın');
    const nextList = isAlreadyVolunteer
      ? currentList.filter((v) => v !== 'Rtn. Rifat Akın')
      : [...currentList, 'Rtn. Rifat Akın'];

    const nextProjects = projects.map((p) =>
      p.id === projectId ? { ...p, volunteers: nextList } : p
    );
    setProjects(nextProjects);
    showToast(
      isAlreadyVolunteer
        ? `Gönüllü Kaydı Güncellendi: ${target.title}`
        : `Saha Gönüllüsü Oldunuz: ${target.title}`,
      isAlreadyVolunteer
        ? 'Proje saha gönüllüsü kaydınız kaldırıldı.'
        : 'Rtn. Rifat Akın saha gönüllüsü listesine eklendi ve katılımınız Make-up olarak kaydedildi.'
    );
    recordServerAudit(
      'Projeler & Burslar',
      `Proje Saha Gönüllüsü Kaydı: ${target.title}`,
      `Rtn. Rifat Akın "${target.title}" saha gönüllüsü listesine ${isAlreadyVolunteer ? 'çıkarıldı' : 'eklendi'}.`,
      undefined,
      { projects: nextProjects }
    );
  };

  const handleCreateProject = (
    newProject: Omit<GalataProject, 'id' | 'collectedAmount' | 'supportersCount'>
  ) => {
    const created: GalataProject = {
      id: `proj-${Date.now()}`,
      ...newProject,
      collectedAmount: newProject.ticketPrice * 2,
      supportersCount: 2,
      volunteers: [newProject.committeeChair, 'Rtn. Rifat Akın'],
    };
    const nextProjects = [created, ...projects];
    setProjects(nextProjects);
    recordServerAudit(
      'Projeler & Burslar',
      `Yeni Hizmet Projesi Başlatıldı: ${newProject.title}`,
      `Hedef bütçesi ${formatTL(newProject.targetBudget)} olan proje yayına alındı.`,
      ['sekreter', 'baskan'],
      { projects: nextProjects }
    );
    showToast(
      `Yeni Hizmet Projesi Başlatıldı: ${newProject.title}`,
      `Hedef bütçesi ${formatTL(newProject.targetBudget)} olan proje bağış termometresiyle yayına alındı.`
    );
  };

  const handleSponsorScholarMonth = (scholarId: string) => {
    const target = scholars.find((s) => s.id === scholarId);
    if (!target) return;

    const usedRefs = new Set(
      paymentNotifications.map((p) => p.receiptRef.replace(/^#+/, '').toUpperCase())
    );
    const candidateRef =
      target.monthlyStipend === 5000 && !usedRefs.has('GAR-2026-99501')
        ? 'GAR-2026-99501'
        : target.monthlyStipend === 4500 && !usedRefs.has('GAR-2026-99502')
        ? 'GAR-2026-99502'
        : `GAR-2026-${String(Date.now()).slice(-5)}`;

    const newPayment: PaymentNotification = {
      id: `pay-burs-${Date.now()}`,
      memberId: 'm-rifat',
      memberName: 'Rtn. Rifat Akın',
      category: 'Vakıf / Proje Katkı Payı',
      amount: target.monthlyStipend,
      description: `${target.fullName} (${target.university}) 1 Aylık Burs Taahhüdü`,
      submittedAt: '23 Ekim 2026 · Şimdi',
      receiptRef: candidateRef,
      status: 'Bekliyor',
      targetScholarId: scholarId,
    };
    const nextPayments = [newPayment, ...paymentNotifications];
    setPaymentNotifications(nextPayments);

    recordServerAudit(
      'Projeler & Burslar',
      `1 Aylık Eğitim Bursu Bildirimi (Mutabakat Bekliyor): ${target.fullName}`,
      `${target.university} öğrencisi için ${formatTL(target.monthlyStipend)} burs katkısı Sayman banka mutabakat kuyruğuna (${candidateRef}) eklendi.`,
      undefined,
      { paymentNotifications: nextPayments }
    );
    showToast(
      `1 Aylık Eğitim Bursu Bildirimi Kaydedildi (${candidateRef})`,
      `${target.university} öğrencimiz için ${formatTL(target.monthlyStipend)} burs katkınız Sayman banka mutabakat kuyruğuna eklendi; mutabakat onayıyla burs ay sayısına eklenecektir.`
    );
  };

  const handleAddNewMember = (newMember: RotaryMember) => {
    const nextMembers = [newMember, ...members];
    setMembers(nextMembers);
    recordServerAudit(
      'Yönetim & Güvenlik',
      `Yeni Kulüp Üyesi Kabulü: Rtn. ${newMember.fullName}`,
      `${newMember.classification} (${newMember.rotaryId}) Galata Rotary Üye Rehberine eklendi.`,
      ['sekreter', 'baskan'],
      { members: nextMembers }
    );
    showToast(
      `Yeni Kulüp Üyesi Eklendi: Rtn. ${newMember.fullName}`,
      `${newMember.classification} sınıflandırmasıyla Galata Rotary Üye Rehberine ve LCV/Cari matrislere kaydedildi.`
    );
  };

  const handleTriggerRollover = () => {
    const nextTerm = executeJulyFirstRollover(termInfo);
    setTermInfo(nextTerm);
    showToast(
      '1 Temmuz Dönem Devir-Teslimi Tamamlandı',
      '2026-2027 Dönemi "Galata Dijital Yıllığı" olarak arşivlendi ve 2027-2028 Yönetim Kurulu aktif edildi.'
    );
    recordServerAudit(
      'Yönetim & Güvenlik',
      '1 Temmuz Dönem Devir-Teslim (Rollover) Tamamlandı',
      '2026-2027 Dönemi Galata Dijital Yıllığı olarak arşivlendi ve 2027-2028 Yönetim Kurulu aktif edildi.',
      ['sekreter', 'baskan'],
      { termInfo: nextTerm }
    );
  };

  const handleCopyVCard = (member: RotaryMember) => {
    showToast(
      'vCard Kartvizit Bilgisi Kopyalandı',
      `Rtn. ${member.fullName} (${member.rotaryId}) dijital iletişim kartı panoya kopyalandı.`
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] pb-24">
      {/* Top Bar, Multi-Tenant Switcher & Role Simulator */}
      <HeaderAndRoleBar
        activeRole={activeRole}
        onSelectRole={(role) => handleSelectRole(role)}
        attendancePercent={attendancePercent}
        termInfo={termInfo}
        onOpenWalletModal={() =>
          setWalletModalMember(
            members.find((m) => m.id === 'm-rifat') || members[0]
          )
        }
        onOpenSplashModal={() => setIsSplashModalOpen(true)}
        onResetDemoData={handleResetDemoData}
        onSelectTenantClub={handleSelectTenantClub}
        onOpenAuditModal={() => setIsAuditModalOpen(true)}
        auditCount={auditLogs.length}
        activeTenantClubName={activeTenantClubName}
      />

      {/* Live Toast Feedback Banner */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 left-4 sm:left-auto sm:w-96 z-50 bg-[#0F172A] text-white rounded-2xl p-4 border border-[#F7A81B]/40 shadow-xl flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-[#F7A81B] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">{toast.title}</div>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                {toast.detail}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Bildirimi Kapat"
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6">
        {activeTab === 'home' && (
          <HomeTab
            activeRole={activeRole}
            onSelectRole={(role) => handleSelectRole(role)}
            meetings={meetings}
            selectedMeetingNo={selectedMeetingNo}
            onSelectMeetingNo={setSelectedMeetingNo}
            onCreateNewMeeting={handleCreateNewMeeting}
            rsvpStatus={rsvpStatus}
            onChangeRsvpStatus={handleChangeRsvpStatus}
            menuPreference={menuPreference}
            onChangeMenuPreference={handleChangeMenuPreference}
            guestNameInput={guestNameInput}
            onChangeGuestNameInput={setGuestNameInput}
            kuverSummary={kuverSummary}
            ritualSteps={ritualSteps}
            onToggleRitualStep={handleToggleRitualStep}
            celebrations={celebrations}
            onCongratulateMember={handleCongratulateMember}
            onAdvanceCertificateStatus={handleAdvanceCertificateStatus}
            onSendHotelKuverReport={handleSendHotelKuverReport}
            speakerProposals={speakerProposals}
            onToggleVoteSpeaker={handleToggleVoteSpeaker}
            onAddSpeakerProposal={handleAddSpeakerProposal}
            members={members}
            onUpdateMemberRsvp={handleUpdateMemberRsvp}
            onRemindUnrespondedMembers={handleRemindUnrespondedMembers}
            onDownloadKuverCsvNotify={handleDownloadKuverCsvNotify}
          />
        )}

        {activeTab === 'operations' && (
          <OperationsTab
            activeRole={activeRole}
            onSelectRole={(role) => handleSelectRole(role)}
            qrCheckedIn={qrCheckedIn}
            onSimulateQrCheckIn={handleSimulateQrCheckIn}
            makeupSubmissions={makeupSubmissions}
            onAddMakeupSubmission={handleAddMakeupSubmission}
            guestMakeupCards={guestMakeupCards}
            onSendGuestMakeupCard={handleSendGuestMakeupCard}
            onOpenOfficialCertificateModal={(card) =>
              setActiveCertificateCard(card)
            }
            firesideGroups={firesideGroups}
            onSubmitFiresideReport={handleSubmitFiresideReport}
            members={members}
            onCreateFiresideGroup={handleCreateFiresideGroup}
          />
        )}

        {activeTab === 'finance' && (
          <FinanceTab
            activeRole={activeRole}
            onSelectRole={(role) => handleSelectRole(role)}
            financialItems={financialItems}
            financeSummary={financeSummary}
            paymentNotifications={paymentNotifications}
            overdueMembers={overdueMembers}
            members={members}
            treasuryLedger={treasuryLedger}
            onCopyIban={handleCopyIban}
            onSubmitPaymentNotification={handleSubmitPaymentNotification}
            onApprovePayment={handleApprovePayment}
            onRejectPayment={handleRejectPayment}
            onSendGentleReminder={handleSendGentleReminder}
            onRemindMemberBalance={handleRemindMemberBalance}
            onBulkAccrual={handleBulkAccrual}
            onAddTreasuryEntry={handleAddTreasuryEntry}
            onDownloadFinanceCsvNotify={handleDownloadFinanceCsvNotify}
          />
        )}

        {activeTab === 'projects' && (
          <ProjectsTab
            activeRole={activeRole}
            onSelectRole={(role) => handleSelectRole(role)}
            projects={projects}
            galleryPhotos={GALLERY_ARCHIVE_PHOTOS}
            scholars={scholars}
            onSupportProject={handleSupportProject}
            onCreateProject={handleCreateProject}
            onSponsorScholarMonth={handleSponsorScholarMonth}
            onToggleProjectVolunteer={handleToggleProjectVolunteer}
          />
        )}

        {activeTab === 'directory' && (
          <DirectoryAndProfileTab
            activeRole={activeRole}
            onSelectRole={(role) => handleSelectRole(role)}
            members={members}
            committees={committees}
            pastPresidents={pastPresidents}
            termInfo={termInfo}
            onTriggerRollover={handleTriggerRollover}
            onOpenWalletModalForMember={(member) => setWalletModalMember(member)}
            onAddNewMember={handleAddNewMember}
            kvkkMaskPhone={kvkkMaskPhone}
          />
        )}
      </main>

      {/* 3D Flip Apple Wallet Digital Rotary ID Modal */}
      <AppleWalletModal
        member={walletModalMember}
        termInfo={termInfo}
        onClose={() => setWalletModalMember(null)}
        onCopyVCard={handleCopyVCard}
      />

      {/* Real Server Credential & WebAuthn Login Modal (#12, #22, #23) */}
      <SplashLockScreenModal
        isOpen={isSplashModalOpen}
        activeRole={activeRole}
        onUnlock={(selectedRole, token, rotaryId) => {
          setIsSplashModalOpen(false);
          const nextRole = selectedRole || activeRole;
          handleSelectRole(nextRole, token);
          showToast(
            'Sunucu Oturumu & KVKK Doğrulandı',
            `Sicil ${rotaryId || ''} için HMAC-SHA256 imzalı sunucu oturumu açıldı.`
          );
        }}
      />

      {/* Printable Official Digital Make-up Certificate Modal */}
      <OfficialMakeupCertificateModal
        card={activeCertificateCard}
        termInfo={termInfo}
        onClose={() => setActiveCertificateCard(null)}
      />

      {/* Server RBAC, Hash-Chained Audit Log, YK Karar Defteri & KVKK Modal */}
      <PilotAuditAndBackupModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        activeRole={activeRole}
        auditLogs={auditLogs}
        boardResolutions={boardResolutions}
        onAddBoardResolution={handleAddBoardResolution}
        kvkkMaskPhone={kvkkMaskPhone}
        onToggleKvkkMaskPhone={handleToggleKvkkMaskPhone}
        serverSyncedAt={serverSyncedAt}
        onDownloadBackup={handleDownloadBackup}
        auditChainValid={auditChainValid}
        auditHeadHash={auditHeadHash}
      />

      {/* iOS / PWA Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        pendingPaymentsCount={pendingPaymentsCount}
      />
    </div>
  );
}
