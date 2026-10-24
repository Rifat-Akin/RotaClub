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
  LcvReminderQueueItem,
  MakeupSubmission,
  MemberRsvp,
  MenuPreference,
  OverdueMemberItem,
  PastPresidentRecord,
  PaymentNotification,
  ReminderChannel,
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
  calculateKuverSummary,
  calculateMemberExtraMakeups,
  calculateMemberFinanceSummary,
  calculateUpdatedAttendance,
  createSpeakerProposal,
  executeJulyFirstRollover,
  formatTL,
  SpecializedModuleData,
  SYNTHETIC_SPECIALIZED_MODULES,
  SYNTHETIC_VOLUNTEER_SHIFTS,
  toggleVolunteerShiftAssignment,
  toggleVoteSpeakerProposal,
  VolunteerShiftSlot,
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

interface SessionUserIdentity {
  memberId: string;
  rotaryId: string;
  fullName: string;
  email: string;
  role: ClubRole;
  clubId: string;
}

export default function App() {
  // Core Navigation, Multi-Tenant & Cryptographic Session State (No localStorage full-state overwrite!)
  const [activeRole, setActiveRole] = useState<ClubRole>('uye');
  const [sessionToken, setSessionToken] = useState<string>('');
  const [sessionUser, setSessionUser] = useState<SessionUserIdentity | null>(null);
  const sessionTokenRef = useRef<string>('');
  const roleTokensRef = useRef<Partial<Record<ClubRole, string>>>({});
  const serverRevisionRef = useRef<number | undefined>(undefined);
  const lastSyncedStateRef = useRef<Record<string, unknown> | null>(null);
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
  const [lcvReminderQueue, setLcvReminderQueue] = useState<LcvReminderQueueItem[]>([]);
  const [outboundMessagingEnabled, setOutboundMessagingEnabled] =
    useState<boolean>(false);

  // Tab 2: Operations (QR, Make-up, Fireside) State
  const [qrCheckedIn, setQrCheckedIn] = useState<boolean>(false);
  const [meetingAttendances, setMeetingAttendances] = useState<
    Record<string, string[]>
  >({});
  const [activeSalonQrToken, setActiveSalonQrToken] = useState<string>('');
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
  const [committees] = useState<ClubCommittee[]>(
    INITIAL_CLUB_COMMITTEES
  );
  const [pastPresidents] = useState<PastPresidentRecord[]>(
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
  const [volunteerShifts, setVolunteerShifts] = useState<VolunteerShiftSlot[]>(
    SYNTHETIC_VOLUNTEER_SHIFTS
  );
  const [specializedModules, setSpecializedModules] =
    useState<SpecializedModuleData>(SYNTHETIC_SPECIALIZED_MODULES);

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
    if (
      serverData.authenticatedUser &&
      typeof serverData.authenticatedUser === 'object'
    ) {
      setSessionUser(serverData.authenticatedUser as SessionUserIdentity);
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
    if (typeof serverData.qrCheckedIn === 'boolean') {
      setQrCheckedIn(serverData.qrCheckedIn);
    }
    if (
      serverData.meetingAttendances &&
      typeof serverData.meetingAttendances === 'object'
    ) {
      setMeetingAttendances(
        serverData.meetingAttendances as Record<string, string[]>
      );
    }
    if (Array.isArray(serverData.lcvReminderQueue)) {
      setLcvReminderQueue(serverData.lcvReminderQueue as LcvReminderQueueItem[]);
    }
    if (typeof serverData.outboundMessagingEnabled === 'boolean') {
      setOutboundMessagingEnabled(serverData.outboundMessagingEnabled);
    }
    if (Array.isArray(serverData.makeupSubmissions)) {
      setMakeupSubmissions(serverData.makeupSubmissions as MakeupSubmission[]);
    }
    if (Array.isArray(serverData.guestMakeupCards)) {
      setGuestMakeupCards(serverData.guestMakeupCards as GuestRotaryMakeupCard[]);
    }
    if (Array.isArray(serverData.firesideGroups)) {
      setFiresideGroups(serverData.firesideGroups as FiresideGroup[]);
    }
    if (Array.isArray(serverData.ritualSteps)) {
      setRitualSteps(serverData.ritualSteps as RitualStep[]);
    }
    if (Array.isArray(serverData.celebrations)) {
      setCelebrations(serverData.celebrations as CelebrationItem[]);
    }
    if (Array.isArray(serverData.speakerProposals)) {
      setSpeakerProposals(serverData.speakerProposals as SpeakerProposal[]);
    }
    if (Array.isArray(serverData.financialItems)) {
      setFinancialItems(serverData.financialItems as FinancialLineItem[]);
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
    if (Array.isArray(serverData.volunteerShifts)) {
      setVolunteerShifts(serverData.volunteerShifts as VolunteerShiftSlot[]);
    }
    if (
      serverData.specializedModules &&
      typeof serverData.specializedModules === 'object'
    ) {
      setSpecializedModules(
        serverData.specializedModules as SpecializedModuleData
      );
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
        sessionTokenRef.current = '';
        setSessionToken('');
        setSessionUser(null);
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
      if (!stateRes.ok) {
        sessionTokenRef.current = '';
        setSessionToken('');
        setSessionUser(null);
        return false;
      }
      const serverData = await stateRes.json();
      applyServerTenantState(serverData);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Sends ONLY the changed delta patch with optimistic concurrency control (expectedRevision) (#14, #18, #76)
   * Strictly requires an active authenticated session token — never claims success without server verification!
   */
  const recordServerAudit = async (
    module: AuditLogEntry['module'],
    action: string,
    detail: string,
    requiredRoles?: ClubRole[],
    patchOverride?: Record<string, unknown>
  ): Promise<boolean> => {
    const token = sessionTokenRef.current || sessionToken;
    if (!token) {
      showToast(
        'Sunucu Oturumu Gerekli (401)',
        'Doğrulanmış sunucu oturumu (Bearer Token) olmadan işlem kaydedilemez. Lütfen Kilit Ekranından PIN veya Passkey ile giriş yapın.'
      );
      return false;
    }

    try {
      const res = await fetch('/api/pilot/sync', {
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
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        await authenticateAndFetchClubState(
          activeRole,
          activeTenantClubId,
          token
        );
        showToast(
          'Sunucu Doğrulama Uyarısı',
          errData?.message || 'İşlem sunucu tarafından onaylanmadı.'
        );
        return false;
      }

      const data = await res.json();
      if (typeof data?.revision === 'number') {
        serverRevisionRef.current = data.revision;
      }
      if (data?.state) {
        lastSyncedStateRef.current = data.state as Record<string, unknown>;
        applyServerTenantState(data.state);
      } else if (data) {
        if (data.auditLogs) setAuditLogs(data.auditLogs);
        if (data.updatedAt) setServerSyncedAt(data.updatedAt);
        if (data.auditVerification) {
          setAuditChainValid(Boolean(data.auditVerification.valid));
          if (data.auditVerification.headHash) {
            setAuditHeadHash(data.auditVerification.headHash);
          }
        }
      }
      return true;
    } catch {
      showToast('Bağlantı Uyarısı', 'Sunucu senkronizasyon servisine ulaşılamadı.');
      return false;
    }
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

  const handleAddBoardResolution = async (
    payload: Omit<BoardResolutionItem, 'id' | 'signedBy'>
  ) => {
    const created: BoardResolutionItem = {
      id: `yk-${Date.now()}`,
      ...payload,
      signedBy:
        'Rtn. Mimar Emre Karaca (Başkan) · Rtn. Av. Nazlı Denizmen (Sekreter)',
    };
    const nextList = [created, ...boardResolutions];
    const ok = await recordServerAudit(
      'Yönetim & Güvenlik',
      `YK Karar Defterine Kayıt: ${payload.resolutionNo}`,
      `${payload.title} (${payload.voteStatus}) Yönetim Kurulu Karar Defterine işlendi.`,
      ['sekreter', 'baskan'],
      { boardResolutions: nextList }
    );
    if (!ok) return;
    setBoardResolutions(nextList);
    showToast(
      `YK Kararı Kaydedildi (${payload.resolutionNo})`,
      `"${payload.title}" Yönetim Kurulu Karar Defterine eklendi.`
    );
  };

  const handleToggleKvkkMaskPhone = async () => {
    const nextState = !kvkkMaskPhone;
    const ok = await recordServerAudit(
      'Yönetim & Güvenlik',
      `KVKK Telefon Maskeleme ${nextState ? 'Aktif Edildi' : 'Kapatıldı'}`,
      `Üye rehberi telefon numaraları KVKK gizlilik modu kapsamında ${nextState ? 'maskelendi' : 'tam görünüme açıldı'}.`,
      ['sekreter', 'sayman', 'baskan'],
      { kvkkMaskPhone: nextState }
    );
    if (!ok) return;
    setKvkkMaskPhone(nextState);
    showToast(
      nextState ? 'KVKK Telefon Maskeleme Aktif' : 'KVKK Telefon Maskeleme Kapatıldı',
      nextState
        ? 'Rehberdeki üye telefon numaraları KVKK kapsamında maskelendi (+90 532 *** ** 18).'
        : 'Yetkili oturum için telefon numaraları tam görünüme açıldı.'
    );
  };

  // Authenticated Member Identity (#46, #76) — bound to verified server session user
  const activeMemberId = sessionUser?.memberId || 'm-rifat';
  const activeMemberDisplayName =
    sessionUser?.fullName || 'Rtn. Rifat Akın';

  // Derived Calculations via Pure Logic (#33 & #35: Per-member, per-meeting QR attendance + memberId-bound approved make-up boost)
  const extraMakeupsCount = calculateMemberExtraMakeups(
    makeupSubmissions,
    INITIAL_MAKEUP_SUBMISSIONS,
    activeMemberId,
    activeMemberDisplayName,
    members
  );

  const selectedMeetingAttendees =
    meetingAttendances[String(selectedMeetingNo)] || [];
  const isCurrentMemberCheckedInForMeeting =
    selectedMeetingAttendees.includes(activeMemberId) ||
    (Object.keys(meetingAttendances).length === 0 && qrCheckedIn);

  const activeMemberObj = members.find((m) => m.id === activeMemberId);
  const baseMemberAttendance = activeMemberObj?.attendancePercent ?? 92;

  const attendancePercent = calculateUpdatedAttendance(
    baseMemberAttendance,
    extraMakeupsCount,
    isCurrentMemberCheckedInForMeeting
  );

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const combinedRsvpList: MemberRsvp[] = [
    ...members
      .filter((m) => m.id !== activeMemberId)
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
    activeMemberId
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
        showToast('Bağlantı Uyarısı', 'Kulüp değiştirme servisine ulaşılamadı.');
        return;
      }
    }
    setActiveTenantClubId(tenant.id);
    setActiveTenantClubName(tenant.name);
    showToast(
      `Çoklu Kulüp Görünümü: ${tenant.name}`,
      `${tenant.name} (${tenant.district}) seçildi.`
    );
  };

  const handleChangeRsvpStatus = async (status: RsvpStatus) => {
    const nextMembers = members.map((m) =>
      m.id === activeMemberId ? { ...m, rsvpStatus: status } : m
    );
    const statusLabels: Record<RsvpStatus, string> = {
      attending: 'Katılıyorum (1 Kuver)',
      with_spouse: 'Eşli Katılıyorum (+1 · 2 Kuver)',
      with_guest: 'Konuğum Var (2 Kuver)',
      excused: 'Mazeretliyim (Kuver Düşüldü)',
      pending: 'Yanıt Bekleniyor',
    };
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `LCV Bildirimi Güncellendi (${statusLabels[status]})`,
      `${activeMemberDisplayName} #${selectedMeetingNo} toplantı LCV durumunu "${statusLabels[status]}" olarak güncelledi.`,
      undefined,
      { rsvpStatus: status, members: nextMembers }
    );
    if (!ok) return;
    setRsvpStatus(status);
    setMembers(nextMembers);
    showToast(
      `LCV Güncellendi: ${statusLabels[status]}`,
      'Pera Palace Hotel canlı kuver listesi ve İsim İsim LCV Matrisi sunucu onayıyla güncellendi.'
    );
  };

  const handleChangeMenuPreference = async (menu: MenuPreference) => {
    const nextMembers = members.map((m) =>
      m.id === activeMemberId ? { ...m, mealPreference: menu } : m
    );
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Menü Tercihi Güncellendi (${menu})`,
      `${activeMemberDisplayName} akşam yemeği menü tercihini "${menu}" olarak güncelledi.`,
      undefined,
      { menuPreference: menu, members: nextMembers }
    );
    if (!ok) return;
    setMenuPreference(menu);
    setMembers(nextMembers);
    showToast(
      `Menü Tercihi: ${menu}`,
      `Toplantı akşam yemeği tercihiniz "${menu} Menü" olarak kaydedildi.`
    );
  };

  const handleUpdateMemberRsvp = async (
    memberId: string,
    status: RsvpStatus,
    menu?: MenuPreference
  ) => {
    const target = members.find((m) => m.id === memberId);
    if (!target) return;
    const nextMembers = members.map((m) =>
      m.id === memberId
        ? {
            ...m,
            rsvpStatus: status,
            mealPreference: menu || m.mealPreference,
          }
        : m
    );
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Sekreterlik Kuver Matrisi Güncellemesi: ${target.fullName}`,
      `${target.fullName} üyesinin LCV durumu "${status}" olarak Sekreterlik/Başkanlık tarafından güncellendi.`,
      ['sekreter', 'baskan'],
      { members: nextMembers }
    );
    if (!ok) return;
    setMembers(nextMembers);
    if (memberId === activeMemberId) {
      setRsvpStatus(status);
      if (menu) setMenuPreference(menu);
    }
    showToast(
      `Üye LCV Durumu Güncellendi: ${target.fullName}`,
      'Pera Palace Hotel canlı kuver toplamı yeni LCV durumuna göre yeniden hesaplandı.'
    );
  };

  const handleUpdateCommunicationPrefs = async (
    reminderOptOut: boolean,
    preferredReminderChannel: ReminderChannel
  ) => {
    const token = sessionTokenRef.current || sessionToken;
    if (!token) {
      showToast(
        'Sunucu Oturumu Gerekli (401)',
        'Bildirim tercihlerini güncellemek için doğrulanmış kulüp oturumu gereklidir.'
      );
      return;
    }
    try {
      const res = await fetch('/api/pilot/member-communication-prefs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clubId: activeTenantClubId,
          reminderOptOut,
          preferredReminderChannel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          `İletişim Tercihi Güncellenemedi (${res.status})`,
          data?.message || 'İletişim tercihi sunucuya kaydedilemedi.'
        );
        return;
      }
      if (data?.state) applyServerTenantState(data.state);
      showToast(
        'İletişim & Hatırlatma Tercihi Güncellendi (#32)',
        reminderOptOut
          ? 'LCV hatırlatmaları sessize alındı (Opt-Out aktif).'
          : `Tercih edilen taslak kanalı "${preferredReminderChannel}" olarak kaydedildi.`
      );
    } catch {
      showToast('Bağlantı Hatası', 'Sunucu tercih servisine ulaşılamadı.');
    }
  };

  const handleRemindUnrespondedMembers = async () => {
    const pendingList = members.filter((m) => m.rsvpStatus === 'pending');
    if (pendingList.length === 0) {
      showToast(
        'LCV Durumu Güncel',
        'Tüm üyelerin LCV yanıtı güncel durumda.'
      );
      return;
    }

    const token = sessionTokenRef.current || sessionToken;
    if (token) {
      try {
        const res = await fetch('/api/pilot/lcv-reminders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            clubId: activeTenantClubId,
            meetingNo: selectedMeetingNo,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(
            `LCV Hatırlatma Kuyruğu Uyarısı (${res.status})`,
            data?.message || 'LCV hatırlatma kuyruğu oluşturulamadı.'
          );
          return;
        }
        if (data?.state) applyServerTenantState(data.state);
      } catch {
        // Proceed to clipboard check below if offline
      }
    }

    const draftMessage = `Galata Rotary Kulübü Toplantı #${selectedMeetingNo} LCV Hatırlatması — Yanıt beklenen üyeler: ${pendingList
      .map((m) => m.fullName)
      .join(', ')}`;
    const copied = await copyTextToClipboard(draftMessage);
    if (!copied) {
      showToast(
        'Panoya Kopyalama Başarısız (#32)',
        'Tarayıcı pano erişim izni reddedildi veya kullanılamıyor; hatırlatma metni kopyalanamadı.'
      );
      return;
    }
    showToast(
      'LCV Hatırlatma Taslağı Panoya Kopyalandı',
      `Henüz yanıt vermeyen ${pendingList
        .map((m) => m.fullName)
        .join(', ')} için hatırlatma taslağı panoya kopyalandı (Dış gönderim kapalıdır).`
    );
  };

  const handleDownloadKuverCsvNotify = (meetingNo: number) => {
    showToast(
      `Kuver Listesi CSV İndirildi (#${meetingNo})`,
      `Galata_Rotary_Toplantı_${meetingNo}_Kuver_Listesi.csv dosyası otel banket yönetimine iletilmek üzere indirildi.`
    );
  };

  const handleCreateNewMeeting = async (newMeeting: WeeklyMeeting) => {
    const nextMeetings = [...meetings, newMeeting];
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Yeni Haftalık Toplantı Planlandı (#${newMeeting.meetingNo})`,
      `${newMeeting.date} · ${newMeeting.speakerName} (${newMeeting.topic}) bülten takvimine eklendi.`,
      ['sekreter', 'baskan'],
      { meetings: nextMeetings, selectedMeetingNo: newMeeting.meetingNo }
    );
    if (!ok) return;
    setMeetings(nextMeetings);
    setSelectedMeetingNo(newMeeting.meetingNo);
    showToast(
      `Yeni Toplantı Planlandı (#${newMeeting.meetingNo})`,
      `${newMeeting.date} tarihli "${newMeeting.topic}" toplantısı bülten takvimine eklendi.`
    );
  };

  const handleToggleVoteSpeaker = async (proposalId: string) => {
    const nextProposals = toggleVoteSpeakerProposal(speakerProposals, proposalId);
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Konuk Konuşmacı Oylaması Güncellendi (${proposalId})`,
      `${activeMemberDisplayName} konuşmacı havuzu oylamasını güncelledi.`,
      undefined,
      { speakerProposals: nextProposals }
    );
    if (!ok) return;
    setSpeakerProposals(nextProposals);
    showToast(
      'Konuk Konuşmacı Oylaması Güncellendi',
      'Oyunuz sunucu onayıyla Program Komitesi konuşmacı havuzuna işlendi.'
    );
  };

  const handleAddSpeakerProposal = async (input: {
    speakerName: string;
    speakerTitle: string;
    proposedTopic: string;
    targetMonth: string;
  }) => {
    const nextProposals = createSpeakerProposal(speakerProposals, {
      ...input,
      proposedBy: activeMemberDisplayName,
    });
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Yeni Konuşmacı Önerisi: ${input.speakerName}`,
      `${activeMemberDisplayName} tarafından "${input.proposedTopic}" başlığı konuşmacı havuzuna eklendi.`,
      undefined,
      { speakerProposals: nextProposals }
    );
    if (!ok) return;
    setSpeakerProposals(nextProposals);
    showToast(
      `Yeni Konuşmacı Önerisi: ${input.speakerName}`,
      `“${input.proposedTopic}” başlığı sunucu onayıyla konuşmacı havuzuna eklendi ve oylamaya açıldı.`
    );
  };

  const handleToggleRitualStep = async (id: string) => {
    const nextSteps = ritualSteps.map((step) =>
      step.id === id ? { ...step, completed: !step.completed } : step
    );
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Toplantı Ritüel Akışı Güncellendi (${id})`,
      `Kürsü akış maddesi durumu Başkan Kokpitinde güncellendi.`,
      ['sekreter', 'baskan'],
      { ritualSteps: nextSteps }
    );
    if (!ok) return;
    setRitualSteps(nextSteps);
    showToast(
      'Toplantı Ritüel Akışı Güncellendi',
      'Kürsü akış maddesi durumu sunucu onayıyla Başkan Kokpitinde işaretlendi.'
    );
  };

  const handleCongratulateMember = async (id: string) => {
    const target = celebrations.find((c) => c.id === id);
    if (!target) return;
    const nextCelebrations = celebrations.map((c) =>
      c.id === id ? { ...c, congratulated: true } : c
    );
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Mutlu Günler Kutlaması: ${target.memberName}`,
      `${target.memberName} (${target.type}) kutlama durumu güncellendi.`,
      undefined,
      { celebrations: nextCelebrations }
    );
    if (!ok) return;
    setCelebrations(nextCelebrations);
    showToast(
      `Mutlu Günler Kutlaması: ${target.memberName}`,
      `${target.type} kürsü anonsu yapıldı ve tebrik mesajı sunucu onayıyla kaydedildi.`
    );
  };

  const handleAdvanceCertificateStatus = async () => {
    const activeMeeting =
      meetings.find((m) => m.meetingNo === selectedMeetingNo) || meetings[0];
    const nextMeetings = meetings.map((m) =>
      m.meetingNo === selectedMeetingNo
        ? { ...m, certificateStatus: 'Takdim Edildi' as const }
        : m
    );
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Konuşmacı Teşekkür Sertifikası Takdim Edildi (#${selectedMeetingNo})`,
      `${activeMeeting.speakerName} adına düzenlenen End Polio Now bağış sertifikası takdim edildi.`,
      ['sekreter', 'baskan'],
      { meetings: nextMeetings }
    );
    if (!ok) return;
    setMeetings(nextMeetings);
    showToast(
      'Konuşmacı Teşekkür Sertifikası Takdim Edildi',
      `${activeMeeting.speakerName} adına düzenlenen End Polio Now bağış sertifikası sunucu onayıyla kaydedildi.`
    );
  };

  const handleSendHotelKuverReport = async () => {
    const activeMeeting =
      meetings.find((m) => m.meetingNo === selectedMeetingNo) || meetings[0];
    if (!activeMeeting.isLcvLockedForHotel) {
      showToast(
        'Önce LCV Listesi Kilitlenmelidir (#29)',
        `Toplantı #${activeMeeting.meetingNo} kuver özetini otele kaydetmeden önce lütfen kesin LCV listesini kilitleyin.`
      );
      return;
    }
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Pera Palace Banket Kuver Özeti Kaydedildi (#${activeMeeting.meetingNo})`,
      `Toplantı #${activeMeeting.meetingNo} için toplam ${kuverSummary.totalKuver} Kuver (${kuverSummary.attendingMembers} Üye, ${kuverSummary.spousesCount} Eş, ${kuverSummary.guestsCount} Konuk) mutfak dağılım özeti sunucu denetim kaydına işlendi.`,
      ['sekreter', 'baskan']
    );
    if (!ok) return;
    showToast(
      'Pera Palace Banket Kuver Özeti Sunucuya Kaydedildi',
      `Toplam ${kuverSummary.totalKuver} Kuver (${kuverSummary.attendingMembers} Üye, ${kuverSummary.spousesCount} Eş, ${kuverSummary.guestsCount} Konuk) mutfak dağılım özeti sunucu onayıyla kayıt altına alındı.`
    );
  };

  const handleGenerateMeetingQrToken = async (): Promise<string | null> => {
    const token = sessionTokenRef.current || sessionToken;
    if (!token) {
      showToast(
        'Sunucu Oturumu Gerekli (401)',
        'Salon QR kodu üretmek için doğrulanmış Genel Sekreter veya Dönem Başkanı oturumu gereklidir.'
      );
      return null;
    }

    try {
      const tokenRes = await fetch(
        `/api/pilot/meeting-qr-token?clubId=${encodeURIComponent(
          activeTenantClubId
        )}&meetingNo=${selectedMeetingNo}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData?.qrToken) {
        showToast(
          `Salon QR Kodu Üretilemedi (${tokenRes.status})`,
          tokenData?.message ||
            'Toplantı QR doğrulama anahtarı yalnızca Genel Sekreter veya Dönem Başkanı tarafından üretilebilir.'
        );
        return null;
      }

      setActiveSalonQrToken(tokenData.qrToken);
      showToast(
        `Kısa Ömürlü Salon QR Kodu Üretildi (#${selectedMeetingNo})`,
        `5 dakika geçerli masa QR kodu (${tokenData.qrToken}) oluşturuldu. Salon girişindeki üyeler bu kodu okutarak yoklama yapabilir.`
      );
      return tokenData.qrToken as string;
    } catch {
      showToast(
        'Bağlantı Hatası',
        'Sunucu QR üretim servisine ulaşılamadı.'
      );
      return null;
    }
  };

  const handleSimulateQrCheckIn = async (customQrToken?: string) => {
    const token = sessionTokenRef.current || sessionToken;
    if (!token) {
      showToast(
        'Sunucu Oturumu Gerekli (401)',
        'QR yoklama doğrulaması için sağ üstteki kilit ekranından doğrulanmış kulüp oturumu açmalısınız.'
      );
      return;
    }

    const qrToken = (customQrToken || activeSalonQrToken || '').trim();
    if (!qrToken) {
      showToast(
        'Salon Masa QR Kodu Gerekli (#33)',
        'Yoklama için Genel Sekreter veya Dönem Başkanı tarafından salonda üretilen 5 dk geçerli QR doğrulama kodunu giriniz.'
      );
      return;
    }

    try {
      const res = await fetch('/api/pilot/qr-checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clubId: activeTenantClubId,
          meetingNo: selectedMeetingNo,
          qrToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          `QR Yoklama Reddedildi (${res.status})`,
          data?.message || 'Toplantı QR kodu sunucu tarafından doğrulanamadı.'
        );
        return;
      }

      if (data?.state) {
        applyServerTenantState(data.state);
      } else {
        setQrCheckedIn(true);
      }
      if (data?.idempotentReplay) {
        showToast(
          'Yoklama Zaten Kayıtlı (İdempotent Yanıt #33)',
          data?.message ||
            `Toplantı #${selectedMeetingNo} için yoklama kaydınız zaten mevcuttur; mükerrer kayıt oluşturulmadı.`
        );
        return;
      }
      showToast(
        'QR Yoklama Sunucuda Doğrulandı (+%2 Katılım)',
        `Toplantı #${selectedMeetingNo} kısa ömürlü imzalı QR kodu (${qrToken}) sunucu tarafından doğrulandı ve yoklamanız işlendi.`
      );
    } catch {
      showToast(
        'QR Yoklama Bağlantı Hatası',
        'Sunucu QR doğrulama servisine ulaşılamadı.'
      );
    }
  };

  const handleManualCheckIn = async (
    targetMemberId: string,
    reason: string
  ) => {
    const token = sessionTokenRef.current || sessionToken;
    if (!token) {
      showToast(
        'Sunucu Oturumu Gerekli (401)',
        'Yetkili manuel yoklama için doğrulanmış Genel Sekreter veya Dönem Başkanı oturumu gereklidir.'
      );
      return;
    }
    try {
      const res = await fetch('/api/pilot/manual-checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clubId: activeTenantClubId,
          meetingNo: selectedMeetingNo,
          targetMemberId,
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          `Manuel Yoklama Reddedildi (${res.status})`,
          data?.message || 'Manuel yoklama kaydedilemedi.'
        );
        return;
      }
      if (data?.state) applyServerTenantState(data.state);
      showToast(
        data?.idempotentReplay
          ? 'Manuel Yoklama Zaten Kayıtlı (#33)'
          : 'Yetkili Manuel Yoklama Kaydedildi (#33)',
        data?.message || 'Üye yoklaması denetim iziyle kaydedildi.'
      );
    } catch {
      showToast('Bağlantı Hatası', 'Manuel yoklama servisine ulaşılamadı.');
    }
  };

  const handleAddMakeupSubmission = async (
    payload: Omit<
      MakeupSubmission,
      'id' | 'status' | 'attendanceBoost' | 'memberName'
    > & { status?: MakeupSubmission['status'] }
  ) => {
    const initialStatus = payload.status === 'Taslak' ? 'Taslak' : 'İnceleniyor';
    const newEntry: MakeupSubmission = {
      id: `mk-${Date.now()}`,
      memberId: activeMemberId,
      memberName: activeMemberDisplayName,
      ...payload,
      status: initialStatus,
      attendanceBoost: 0,
    };
    const nextMakeups = [newEntry, ...makeupSubmissions];
    const ok = await recordServerAudit(
      'QR Yoklama & Make-up',
      initialStatus === 'Taslak'
        ? `Make-up Taslağı Kaydedildi: ${payload.targetClubOrEvent}`
        : `Make-up Bildirimi Onaya Sunuldu: ${payload.targetClubOrEvent}`,
      `${activeMemberDisplayName} · ${payload.activityType} (${payload.date}) katılım bildirimi ${initialStatus} durumunda kaydedildi.`,
      undefined,
      { makeupSubmissions: nextMakeups }
    );
    if (!ok) return;
    showToast(
      initialStatus === 'Taslak'
        ? 'Make-up Taslağı Kaydedildi (#35)'
        : 'Make-up Bildirimi Onay Kuyruğuna Eklendi',
      initialStatus === 'Taslak'
        ? `${payload.targetClubOrEvent} taslak olarak kaydedildi; dilediğiniz zaman incelemeye gönderebilirsiniz.`
        : `${payload.targetClubOrEvent} katılımınız Genel Sekreter / Başkan onayından sonra devam oranınıza (+%3) işlenecektir.`
    );
  };

  const handleApproveMakeupSubmission = async (makeupId: string) => {
    const target = makeupSubmissions.find((m) => m.id === makeupId);
    if (!target) return;
    const nextMakeups = makeupSubmissions.map((m) =>
      m.id === makeupId
        ? { ...m, status: 'Onaylandı' as const, attendanceBoost: 3 }
        : m
    );
    const ok = await recordServerAudit(
      'QR Yoklama & Make-up',
      `Make-up Bildirimi Onaylandı (+%3): ${target.targetClubOrEvent}`,
      `${target.memberName} (${target.targetClubOrEvent}) make-up bildirimi yetkili tarafından onaylandı ve devam oranına +%3 eklendi.`,
      ['sekreter', 'baskan'],
      { makeupSubmissions: nextMakeups }
    );
    if (!ok) return;
    showToast(
      `Make-up Onaylandı (+%3 Katılım): ${target.memberName}`,
      `${target.targetClubOrEvent} katılımı sunucu onayıyla devam oranına işlendi.`
    );
  };

  const handleRejectMakeupSubmission = async (makeupId: string) => {
    const target = makeupSubmissions.find((m) => m.id === makeupId);
    if (!target) return;
    const nextMakeups = makeupSubmissions.map((m) =>
      m.id === makeupId
        ? { ...m, status: 'Reddedildi' as const, attendanceBoost: 0 }
        : m
    );
    const ok = await recordServerAudit(
      'QR Yoklama & Make-up',
      `Make-up Bildirimi Reddedildi: ${target.targetClubOrEvent}`,
      `${target.memberName} (${target.targetClubOrEvent}) make-up bildirimi yetkili incelemesinde reddedildi.`,
      ['sekreter', 'baskan'],
      { makeupSubmissions: nextMakeups }
    );
    if (!ok) return;
    showToast(
      `Make-up Bildirimi Reddedildi: ${target.memberName}`,
      `${target.targetClubOrEvent} katılım kaydı sunucu onayıyla reddedildi.`
    );
  };

  const handleRequestMakeupRevision = async (
    makeupId: string,
    reviewerNote: string
  ) => {
    const target = makeupSubmissions.find((m) => m.id === makeupId);
    if (!target) return;
    const nextMakeups = makeupSubmissions.map((m) =>
      m.id === makeupId
        ? {
            ...m,
            status: 'Düzeltme İstendi' as const,
            reviewerNote,
            attendanceBoost: 0,
          }
        : m
    );
    const ok = await recordServerAudit(
      'QR Yoklama & Make-up',
      `Make-up Düzeltme Talebi: ${target.targetClubOrEvent}`,
      `${target.memberName} (${target.targetClubOrEvent}) için düzeltme/kanıt talep edildi: ${reviewerNote}`,
      ['sekreter', 'baskan'],
      { makeupSubmissions: nextMakeups }
    );
    if (!ok) return;
    showToast(
      `Düzeltme İstendi (#35): ${target.memberName}`,
      `Üyeden ek kanıt veya açıklama talep edildi.`
    );
  };

  const handleUpdateOwnMakeupSubmission = async (
    makeupId: string,
    patch: Partial<MakeupSubmission>
  ) => {
    const target = makeupSubmissions.find((m) => m.id === makeupId);
    if (!target) return;
    const nextMakeups = makeupSubmissions.map((m) =>
      m.id === makeupId ? { ...m, ...patch } : m
    );
    const ok = await recordServerAudit(
      'QR Yoklama & Make-up',
      `Make-up Kaydı Güncellendi (${patch.status || target.status}): ${target.targetClubOrEvent}`,
      `${activeMemberDisplayName} kendi make-up kaydını "${patch.status || target.status}" durumuna güncelledi.`,
      undefined,
      { makeupSubmissions: nextMakeups }
    );
    if (!ok) return;
    showToast(
      `Make-up Durumu Güncellendi: ${patch.status || target.status}`,
      `${target.targetClubOrEvent} kaydınız sunucu onayıyla güncellendi.`
    );
  };

  const handleRevokeGuestMakeupCard = async (
    cardId: string,
    reason: string
  ) => {
    const token = sessionTokenRef.current || sessionToken;
    if (!token) {
      showToast(
        'Sunucu Oturumu Gerekli (401)',
        'Katılım belgesi iptali için doğrulanmış Sekreter veya Başkan oturumu gereklidir.'
      );
      return;
    }
    try {
      const res = await fetch('/api/pilot/revoke-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clubId: activeTenantClubId,
          certificateId: cardId,
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(
          `Belge İptali Reddedildi (${res.status})`,
          data?.message || 'Katılım belgesi iptal edilemedi.'
        );
        return;
      }
      if (data?.state) applyServerTenantState(data.state);
      showToast(
        'Misafir Katılım Belgesi İptal Edildi (#36)',
        data?.message || 'Belge iptal edildi ve doğrulama uç noktasında geçersiz kılındı.'
      );
    } catch {
      showToast('Bağlantı Hatası', 'Belge iptal servisine ulaşılamadı.');
    }
  };

  const handleSendGuestMakeupCard = async (
    payload: Omit<GuestRotaryMakeupCard, 'id' | 'sentAt' | 'verificationCode'>
  ) => {
    const newCard: GuestRotaryMakeupCard = {
      id: `gmk-${Date.now()}`,
      ...payload,
      sentAt: '23 Ekim 2026 · Şimdi',
      verificationCode: `GLR-2420-${payload.meetingNo}-PENDING`,
    };
    const nextCards = [newCard, ...guestMakeupCards];
    const ok = await recordServerAudit(
      'QR Yoklama & Make-up',
      `Misafir Rotaryen Make-up Sertifikası Düzenlendi: ${payload.guestName}`,
      `${payload.guestName} (${payload.guestClub}) için resmi dijital katılım belgesi oluşturuldu.`,
      ['sekreter', 'baskan'],
      { guestMakeupCards: nextCards }
    );
    if (!ok) return;
    const syncedCards = Array.isArray(
      lastSyncedStateRef.current?.guestMakeupCards
    )
      ? (lastSyncedStateRef.current.guestMakeupCards as GuestRotaryMakeupCard[])
      : null;
    const serverIssuedCard =
      syncedCards?.find((c) => c.id === newCard.id) || newCard;
    setActiveCertificateCard(serverIssuedCard);
    showToast(
      'Resmi Dijital Make-up Sertifikası Hazır',
      `${payload.guestName} (${payload.guestClub}) için sunucu doğrulama kodlu (${serverIssuedCard.verificationCode}) dijital katılım belgesi sunucu onayıyla oluşturuldu.`
    );
  };

  const handleSubmitFiresideReport = async (
    groupId: string,
    summary: string,
    attendanceRate: string
  ) => {
    const nextGroups = firesideGroups.map((group) =>
      group.id === groupId
        ? {
            ...group,
            reportSubmitted: true,
            reportSummary: summary,
            attendanceRate,
          }
        : group
    );
    const ok = await recordServerAudit(
      'QR Yoklama & Make-up',
      `Ocakbaşı (Fireside) Raporu Yüklendi (${groupId})`,
      `${activeMemberDisplayName} tarafından Ocakbaşı toplantı tutanağı (${attendanceRate}) kaydedildi.`,
      undefined,
      { firesideGroups: nextGroups }
    );
    if (!ok) return;
    setFiresideGroups(nextGroups);
    showToast(
      'Ocakbaşı (Fireside) Raporu Yüklendi',
      'Toplantı tutanağı ve katılım listesi sunucu onayıyla Kulüp Genel Sekreterliğine iletildi.'
    );
  };

  const handleCreateFiresideGroup = async (
    newGroup: Omit<FiresideGroup, 'id' | 'reportSubmitted'>
  ) => {
    const created: FiresideGroup = {
      id: `fs-${Date.now()}`,
      ...newGroup,
      reportSubmitted: false,
    };
    const nextGroups = [created, ...firesideGroups];
    const ok = await recordServerAudit(
      'QR Yoklama & Make-up',
      `Yeni Ocakbaşı Grubu Kuruldu: ${newGroup.groupName}`,
      `Ev sahibi ${newGroup.hostMember} ve ${newGroup.participants.length} katılımcı üye ile yeni Ocakbaşı grubu oluşturuldu.`,
      ['sekreter', 'baskan'],
      { firesideGroups: nextGroups }
    );
    if (!ok) return;
    setFiresideGroups(nextGroups);
    showToast(
      `Yeni Ocakbaşı Grubu Kuruldu: ${newGroup.groupName}`,
      `Ev sahibi ${newGroup.hostMember} ve ${newGroup.participants.length} katılımcı üyeye davet sunucu onayıyla kaydedildi.`
    );
  };

  const handleCopyIban = async (iban: string) => {
    const copied = await copyTextToClipboard(iban);
    if (!copied) {
      showToast(
        'Panoya Kopyalama Başarısız (#32)',
        'Tarayıcı pano erişimi kullanılamadığı için IBAN kopyalanamadı.'
      );
      return;
    }
    showToast(
      'Kulüp IBAN Adresi Kopyalandı',
      `${iban} panoya kopyalandı. Mobil bankacılıktan FAST/EFT yapabilirsiniz.`
    );
  };

  const handleSubmitPaymentNotification = async (payload: {
    category: FinancialLineItem['category'];
    amount: number;
    description: string;
    receiptRef: string;
  }) => {
    const newPayment: PaymentNotification = {
      id: `pay-${Date.now()}`,
      memberId: activeMemberId,
      memberName: activeMemberDisplayName,
      category: payload.category,
      amount: payload.amount,
      description: payload.description,
      submittedAt: '23 Ekim 2026 · Şimdi',
      receiptRef: payload.receiptRef,
      status: 'Bekliyor',
    };
    const nextPayments = [newPayment, ...paymentNotifications];
    const ok = await recordServerAudit(
      'Saymanlık & Kasa',
      `Dekont Bildirimi Alındı (${payload.receiptRef})`,
      `${activeMemberDisplayName} ${formatTL(payload.amount)} tutarlı dekontu Sayman banka mutabakat kuyruğuna iletti.`,
      undefined,
      { paymentNotifications: nextPayments }
    );
    if (!ok) return;
    setPaymentNotifications(nextPayments);
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
    if (!token) {
      showToast(
        'Sunucu Oturumu Gerekli (401)',
        'Ödeme mutabakatı için doğrulanmış Sayman veya Başkan oturumu gereklidir.'
      );
      return;
    }

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

  const handleRejectPayment = async (paymentId: string) => {
    const target = paymentNotifications.find((p) => p.id === paymentId);
    if (!target) return;
    const nextPayments = paymentNotifications.map((p) =>
      p.id === paymentId ? { ...p, status: 'Reddedildi' as const } : p
    );
    const ok = await recordServerAudit(
      'Saymanlık & Kasa',
      `Ödeme Bildirimi Reddedildi (${target.receiptRef})`,
      `${target.memberName} (${target.receiptRef}) dekont kaydı banka ekstresiyle uyuşmadığı için reddedildi.`,
      ['sayman', 'baskan'],
      { paymentNotifications: nextPayments }
    );
    if (!ok) return;
    setPaymentNotifications(nextPayments);
    showToast(
      'Ödeme Bildirimi Reddedildi',
      `${target.memberName} (${target.receiptRef}) dekont kaydı sunucu onayıyla reddedildi.`
    );
  };

  const handleSendGentleReminder = async (overdueId: string) => {
    const target = overdueMembers.find((o) => o.id === overdueId);
    if (!target) return;
    const reminderText = `Sayın ${target.memberName}, Galata Rotary Kulübü cari bakiyeniz (${formatTL(
      target.overdueAmount
    )}) için nazik hatırlatma bilginize sunulur.`;
    const copied = await copyTextToClipboard(reminderText);
    if (!copied) {
      showToast(
        'Panoya Kopyalama Başarısız (#32)',
        'Tarayıcı pano erişim izni reddedildi veya kullanılamıyor; hatırlatma metni kopyalanamadı.'
      );
      return;
    }
    showToast(
      'Nazik Hatırlatma Metni Panoya Kopyalandı',
      `${target.memberName} için Rotary dostluk dilinde hazırlanan hatırlatma metni panoya kopyalandı.`
    );
  };

  const handleRemindMemberBalance = async (
    memberName: string,
    totalDebt: number
  ) => {
    const reminderText = `Sayın Rtn. ${memberName}, Galata Rotary Kulübü güncel cari bakiyeniz ${formatTL(
      totalDebt
    )} olarak görünmektedir.`;
    const copied = await copyTextToClipboard(reminderText);
    if (!copied) {
      showToast(
        'Panoya Kopyalama Başarısız (#32)',
        'Tarayıcı pano erişim izni reddedildi veya kullanılamıyor; bakiye hatırlatma metni kopyalanamadı.'
      );
      return;
    }
    showToast(
      `Cari Bakiye Metni Kopyalandı: ${memberName}`,
      `Rtn. ${memberName} için ${formatTL(totalDebt)} cari bakiye hatırlatma taslağı panoya kopyalandı.`
    );
  };

  const handleBulkAccrual = async (
    category: FinancialLineItem['category'],
    amount: number,
    description: string
  ) => {
    const token = sessionTokenRef.current || sessionToken;
    if (!token) {
      showToast(
        'Sunucu Oturumu Gerekli (401)',
        'Toplu tahakkuk işlemi için doğrulanmış Sayman veya Başkan oturumu gereklidir.'
      );
      return;
    }

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
    } catch {
      showToast('Bağlantı Uyarısı', 'Sunucu tahakkuk servisine ulaşılamadı.');
    }
  };

  const handleAddTreasuryEntry = async (entry: Omit<TreasuryLedgerEntry, 'id'>) => {
    const token = sessionTokenRef.current || sessionToken;
    if (!token) {
      showToast(
        'Sunucu Oturumu Gerekli (401)',
        'Kasa defteri kaydı eklemek için doğrulanmış Sayman veya Başkan oturumu gereklidir.'
      );
      return;
    }

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
    } catch {
      showToast('Bağlantı Uyarısı', 'Sunucu kasa defteri servisine ulaşılamadı.');
    }
  };

  const handleDownloadFinanceCsvNotify = () => {
    showToast(
      'Tüm Üyeler Cari Matrisi CSV İndirildi',
      'Galata_Rotary_Tum_Uyeler_Cari_Bakiye_Matrisi.csv dosyası bilgisayarınıza indirildi.'
    );
  };

  /**
   * Hardened Financial Integrity (#6, #39, #76):
   * Member project support creates a pending payment notification with a unique bank reference
   * and waits for server confirmation before updating state or displaying a toast.
   * Project collectedAmount is ONLY incremented when the Treasurer reconciles the bank statement via /api/pilot/reconcile-payment.
   */
  const handleSupportProject = async (
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
      memberId: activeMemberId,
      memberName: activeMemberDisplayName,
      category: 'Vakıf / Proje Katkı Payı',
      amount,
      description: `${target.title} — ${supportType}`,
      submittedAt: '23 Ekim 2026 · Şimdi',
      receiptRef: candidateRef,
      status: 'Bekliyor',
      targetProjectId: projectId,
    };
    const nextPayments = [newPayment, ...paymentNotifications];

    const ok = await recordServerAudit(
      'Projeler & Burslar',
      `Proje Katkı Bildirimi (Mutabakat Bekliyor): ${target.title}`,
      `${activeMemberDisplayName} tarafından ${formatTL(amount)} (${supportType}) proje katkısı bildirildi; banka mutabakatı (${candidateRef}) sonrası proje fonuna işlenecek.`,
      undefined,
      { paymentNotifications: nextPayments }
    );
    if (!ok) return;
    setPaymentNotifications(nextPayments);
    showToast(
      `${target.title} Katkı Bildiriminiz Alındı (${candidateRef})`,
      `${formatTL(amount)} (${supportType}) katkınız sunucu onayıyla Sayman banka mutabakat kuyruğuna eklendi; banka ekstresi eşleştiğinde proje bütçesine eklenecektir.`
    );
  };

  const handleToggleProjectVolunteer = async (projectId: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const currentList = target.volunteers || [
      'Rtn. Deniz Arslan',
      'Rtn. Zeynep Yıldırım',
    ];
    const isAlreadyVolunteer = currentList.includes(activeMemberDisplayName);
    const nextList = isAlreadyVolunteer
      ? currentList.filter((v) => v !== activeMemberDisplayName)
      : [...currentList, activeMemberDisplayName];

    const nextProjects = projects.map((p) =>
      p.id === projectId ? { ...p, volunteers: nextList } : p
    );
    const ok = await recordServerAudit(
      'Projeler & Burslar',
      `Proje Saha Gönüllüsü Kaydı: ${target.title}`,
      `${activeMemberDisplayName} "${target.title}" saha gönüllüsü listesine ${isAlreadyVolunteer ? 'çıkarıldı' : 'eklendi'}.`,
      undefined,
      { projects: nextProjects }
    );
    if (!ok) return;
    setProjects(nextProjects);
    showToast(
      isAlreadyVolunteer
        ? `Gönüllü Kaydı Güncellendi: ${target.title}`
        : `Saha Gönüllüsü Oldunuz: ${target.title}`,
      isAlreadyVolunteer
        ? 'Proje saha gönüllüsü kaydınız sunucu onayıyla kaldırıldı.'
        : `${activeMemberDisplayName} saha gönüllüsü listesine sunucu onayıyla eklendi.`
    );
  };

  const handleCreateProject = async (
    newProject: Omit<GalataProject, 'id' | 'collectedAmount' | 'supportersCount'>
  ) => {
    const created: GalataProject = {
      id: `proj-${Date.now()}`,
      ...newProject,
      collectedAmount: 0,
      supportersCount: 0,
      volunteers: [newProject.committeeChair, activeMemberDisplayName],
    };
    const nextProjects = [created, ...projects];
    const ok = await recordServerAudit(
      'Projeler & Burslar',
      `Yeni Hizmet Projesi Başlatıldı: ${newProject.title}`,
      `Hedef bütçesi ${formatTL(newProject.targetBudget)} olan proje 0 TL başlangıç tahsilatıyla yayına alındı.`,
      ['sekreter', 'baskan'],
      { projects: nextProjects }
    );
    if (!ok) return;
    showToast(
      `Yeni Hizmet Projesi Başlatıldı: ${newProject.title}`,
      `Hedef bütçesi ${formatTL(newProject.targetBudget)} olan proje 0 TL başlangıç bakiyesiyle yayına alındı.`
    );
  };

  const handleSponsorScholarMonth = async (scholarId: string) => {
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
      memberId: activeMemberId,
      memberName: activeMemberDisplayName,
      category: 'Vakıf / Proje Katkı Payı',
      amount: target.monthlyStipend,
      description: `${target.fullName} (${target.university}) 1 Aylık Burs Taahhüdü`,
      submittedAt: '23 Ekim 2026 · Şimdi',
      receiptRef: candidateRef,
      status: 'Bekliyor',
      targetScholarId: scholarId,
    };
    const nextPayments = [newPayment, ...paymentNotifications];

    const ok = await recordServerAudit(
      'Projeler & Burslar',
      `1 Aylık Eğitim Bursu Bildirimi (Mutabakat Bekliyor): ${target.fullName}`,
      `${target.university} öğrencisi için ${formatTL(target.monthlyStipend)} burs katkısı Sayman banka mutabakat kuyruğuna (${candidateRef}) eklendi.`,
      undefined,
      { paymentNotifications: nextPayments }
    );
    if (!ok) return;
    setPaymentNotifications(nextPayments);
    showToast(
      `1 Aylık Eğitim Bursu Bildirimi Kaydedildi (${candidateRef})`,
      `${target.university} öğrencimiz için ${formatTL(target.monthlyStipend)} burs katkınız Sayman banka mutabakat kuyruğuna eklendi; mutabakat onayıyla burs ay sayısına eklenecektir.`
    );
  };

  const handleAddNewMember = async (newMember: RotaryMember) => {
    const nextMembers = [newMember, ...members];
    const ok = await recordServerAudit(
      'Yönetim & Güvenlik',
      `Yeni Kulüp Üyesi Kabulü: Rtn. ${newMember.fullName}`,
      `${newMember.classification} (${newMember.rotaryId}) Galata Rotary Üye Rehberine eklendi.`,
      ['sekreter', 'baskan'],
      { members: nextMembers }
    );
    if (!ok) return;
    setMembers(nextMembers);
    showToast(
      `Yeni Kulüp Üyesi Eklendi: Rtn. ${newMember.fullName}`,
      `${newMember.classification} sınıflandırmasıyla Galata Rotary Üye Rehberine ve LCV/Cari matrislere kaydedildi.`
    );
  };

  const handleTriggerRollover = async () => {
    const nextTerm = executeJulyFirstRollover(termInfo);
    const ok = await recordServerAudit(
      'Yönetim & Güvenlik',
      '1 Temmuz Dönem Devir-Teslim (Rollover) Tamamlandı',
      '2026-2027 Dönemi Galata Dijital Yıllığı olarak arşivlendi ve 2027-2028 Yönetim Kurulu aktif edildi.',
      ['sekreter', 'baskan'],
      { termInfo: nextTerm }
    );
    if (!ok) return;
    setTermInfo(nextTerm);
    showToast(
      '1 Temmuz Dönem Devir-Teslimi Tamamlandı',
      '2026-2027 Dönemi "Galata Dijital Yıllığı" olarak arşivlendi ve 2027-2028 Yönetim Kurulu aktif edildi.'
    );
  };

  const handleCopyVCard = async (member: RotaryMember) => {
    const vcardText = `BEGIN:VCARD\nVERSION:3.0\nFN:Rtn. ${member.fullName}\nORG:${member.companyName}\nTITLE:${member.classification}\nTEL:${member.phone}\nEMAIL:${member.email}\nEND:VCARD`;
    const copied = await copyTextToClipboard(vcardText);
    if (!copied) {
      showToast(
        'Panoya Kopyalama Başarısız (#32)',
        'Tarayıcı pano erişimi kullanılamadığı için vCard kartvizit bilgisi kopyalanamadı.'
      );
      return;
    }
    showToast(
      'vCard Kartvizit Bilgisi Kopyalandı',
      `Rtn. ${member.fullName} (${member.rotaryId}) dijital iletişim kartı panoya kopyalandı.`
    );
  };

  const handleUpdateMeetingHotelCommitment = async (
    meetingNo: number,
    patch: Partial<WeeklyMeeting>
  ) => {
    const nextMeetings = meetings.map((m) =>
      m.meetingNo === meetingNo ? { ...m, ...patch } : m
    );
    const ok = await recordServerAudit(
      'LCV & Kuver',
      `Otel Banket & LCV Mutabakatı Güncellendi (#${meetingNo})`,
      patch.hotelConfirmationRef
        ? `Toplantı #${meetingNo} kuver listesi kilitlendi ve otel teyidi (${patch.hotelConfirmationRef}) kaydedildi.`
        : `Toplantı #${meetingNo} LCV kilidi / garanti kuver parametreleri güncellendi.`,
      ['sekreter', 'baskan'],
      { meetings: nextMeetings }
    );
    if (!ok) return;
    setMeetings(nextMeetings);
    if (patch.hotelConfirmationRef) {
      showToast(
        `Otel Banket Teyidi Kaydedildi (${patch.hotelConfirmationRef})`,
        `Toplantı #${meetingNo} kesin kuver listesi sunucu onayıyla otele onaylandı ve kilitlendi (#29).`
      );
    } else if (typeof patch.isLcvLockedForHotel === 'boolean') {
      showToast(
        patch.isLcvLockedForHotel
          ? `Toplantı #${meetingNo} Kesin LCV Listesi Kilitlendi (#29)`
          : `Toplantı #${meetingNo} LCV Kilidi Açıldı (#29)`,
        patch.isLcvLockedForHotel
          ? 'Üye LCV/menü değişiklikleri kilitlendi; otel banket teyit referansı kaydedilebilir.'
          : 'Toplantı LCV bildirimleri yeniden üye güncellemesine açıldı.'
      );
    }
  };

  const handleToggleVolunteerShift = async (
    shiftId: string,
    volunteerName: string
  ) => {
    const effectiveName = sessionUser?.fullName || volunteerName;
    const targetSlot = volunteerShifts.find((s) => s.id === shiftId);
    if (!targetSlot) return;
    const isAlreadyIn = targetSlot.assignedVolunteers.includes(effectiveName);
    if (
      !isAlreadyIn &&
      targetSlot.assignedVolunteers.length >= targetSlot.requiredCount
    ) {
      showToast(
        'Vardiya Kontenjanı Dolu (#46)',
        `"${targetSlot.taskTitle}" vardiyası maksimum kapasiteye (${targetSlot.requiredCount} gönüllü) ulaşmıştır.`
      );
      return;
    }

    const nextShifts = toggleVolunteerShiftAssignment(
      volunteerShifts,
      shiftId,
      effectiveName
    );
    const ok = await recordServerAudit(
      'QR Yoklama & Make-up',
      `Vardiya Gönüllü Ataması: ${targetSlot.taskTitle}`,
      `${effectiveName} "${targetSlot.taskTitle}" vardiyasına ${isAlreadyIn ? 'ayrıldı' : 'katıldı'}.`,
      undefined,
      { volunteerShifts: nextShifts }
    );
    if (!ok) return;
    setVolunteerShifts(nextShifts);
    showToast(
      isAlreadyIn
        ? `Vardiya Görevinden Ayrıldınız: ${targetSlot.taskTitle}`
        : `Vardiya Görevi Atandı: ${targetSlot.taskTitle}`,
      isAlreadyIn
        ? `${effectiveName} sunucu onayıyla vardiya listesinden çıkarıldı.`
        : `${effectiveName} (${targetSlot.shiftWindow}) sunucu onayıyla vardiya çizelgesine kaydedildi.`
    );
  };

  const selectedMeetingObj =
    meetings.find((m) => m.meetingNo === selectedMeetingNo) ||
    meetings[meetings.length - 1];

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
            members.find((m) => m.id === activeMemberId) || members[0]
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
            onUpdateMeetingHotelCommitment={handleUpdateMeetingHotelCommitment}
            lcvReminderQueue={lcvReminderQueue}
            outboundMessagingEnabled={outboundMessagingEnabled}
            activeMemberId={activeMemberId}
            onUpdateCommunicationPrefs={handleUpdateCommunicationPrefs}
          />
        )}

        {activeTab === 'operations' && (
          <OperationsTab
            activeRole={activeRole}
            onSelectRole={(role) => handleSelectRole(role)}
            qrCheckedIn={isCurrentMemberCheckedInForMeeting}
            onSimulateQrCheckIn={handleSimulateQrCheckIn}
            onGenerateMeetingQrToken={handleGenerateMeetingQrToken}
            onManualCheckIn={handleManualCheckIn}
            activeSalonQrToken={activeSalonQrToken}
            makeupSubmissions={makeupSubmissions}
            onAddMakeupSubmission={handleAddMakeupSubmission}
            onApproveMakeupSubmission={handleApproveMakeupSubmission}
            onRejectMakeupSubmission={handleRejectMakeupSubmission}
            onRequestMakeupRevision={handleRequestMakeupRevision}
            onUpdateOwnMakeupSubmission={handleUpdateOwnMakeupSubmission}
            guestMakeupCards={guestMakeupCards}
            onSendGuestMakeupCard={handleSendGuestMakeupCard}
            onRevokeGuestMakeupCard={handleRevokeGuestMakeupCard}
            onOpenOfficialCertificateModal={(card) =>
              setActiveCertificateCard(card)
            }
            firesideGroups={firesideGroups}
            onSubmitFiresideReport={handleSubmitFiresideReport}
            members={members}
            onCreateFiresideGroup={handleCreateFiresideGroup}
            activeMemberId={activeMemberId}
            activeMemberName={activeMemberDisplayName}
            volunteerShifts={volunteerShifts}
            onToggleVolunteerShift={handleToggleVolunteerShift}
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
            kuverSummary={kuverSummary}
            minHotelGuarantee={selectedMeetingObj?.minHotelGuarantee ?? 35}
            defaultUnitKuverCostTL={selectedMeetingObj?.unitKuverCostTL ?? 1850}
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
            specializedModules={specializedModules}
            activeMemberName={activeMemberDisplayName}
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
