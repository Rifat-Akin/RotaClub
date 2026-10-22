import React, { useEffect, useState } from 'react';
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

const STORAGE_KEY = 'rotaclub_v3_galata_state';

function loadPersistedState<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && parsed[key] !== undefined ? parsed[key] : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  // Core Navigation, Multi-Tenant & Role State
  const [activeRole, setActiveRole] = useState<ClubRole>(() =>
    loadPersistedState('activeRole', 'uye')
  );
  const [activeTenantClubName, setActiveTenantClubName] = useState<string>(() =>
    loadPersistedState('activeTenantClubName', 'Galata Rotary Kulübü')
  );
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isSplashModalOpen, setIsSplashModalOpen] = useState(false);

  // Term & Rollover State
  const [termInfo, setTermInfo] = useState<TermBoardInfo>(() =>
    loadPersistedState('termInfo', INITIAL_TERM_BOARD)
  );

  // Tab 1: Home, Meetings Archive, Speaker Pool & Meeting Cockpit State
  const [meetings, setMeetings] = useState<WeeklyMeeting[]>(() =>
    loadPersistedState('meetings', INITIAL_MEETINGS_LIST)
  );
  const [selectedMeetingNo, setSelectedMeetingNo] = useState<number>(() =>
    loadPersistedState('selectedMeetingNo', 1842)
  );
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>(() =>
    loadPersistedState('rsvpStatus', 'attending')
  );
  const [menuPreference, setMenuPreference] = useState<MenuPreference>(() =>
    loadPersistedState('menuPreference', 'Standart')
  );
  const [guestNameInput, setGuestNameInput] = useState<string>(() =>
    loadPersistedState('guestNameInput', 'Mim. Caner Erkin — Kentsel Tasarım')
  );
  const [ritualSteps, setRitualSteps] = useState<RitualStep[]>(() =>
    loadPersistedState('ritualSteps', INITIAL_RITUAL_STEPS)
  );
  const [celebrations, setCelebrations] = useState<CelebrationItem[]>(() =>
    loadPersistedState('celebrations', INITIAL_CELEBRATIONS)
  );
  const [speakerProposals, setSpeakerProposals] = useState<SpeakerProposal[]>(() =>
    loadPersistedState('speakerProposals', INITIAL_SPEAKER_PROPOSALS)
  );

  // Tab 2: Operations (QR, Make-up, Fireside) State
  const [qrCheckedIn, setQrCheckedIn] = useState<boolean>(() =>
    loadPersistedState('qrCheckedIn', false)
  );
  const [makeupSubmissions, setMakeupSubmissions] = useState<MakeupSubmission[]>(
    () => loadPersistedState('makeupSubmissions', INITIAL_MAKEUP_SUBMISSIONS)
  );
  const [guestMakeupCards, setGuestMakeupCards] = useState<GuestRotaryMakeupCard[]>(
    () => loadPersistedState('guestMakeupCards', INITIAL_GUEST_MAKEUP_CARDS)
  );
  const [activeCertificateCard, setActiveCertificateCard] =
    useState<GuestRotaryMakeupCard | null>(null);
  const [firesideGroups, setFiresideGroups] = useState<FiresideGroup[]>(() =>
    loadPersistedState('firesideGroups', INITIAL_FIRESIDE_GROUPS)
  );

  // Tab 3: Finance, Member Cari Matrix & Club Treasury Ledger State
  const [financialItems, setFinancialItems] = useState<FinancialLineItem[]>(() =>
    loadPersistedState('financialItems', INITIAL_FINANCIAL_ITEMS)
  );
  const [paymentNotifications, setPaymentNotifications] = useState<
    PaymentNotification[]
  >(() => loadPersistedState('paymentNotifications', INITIAL_PAYMENT_NOTIFICATIONS));
  const [overdueMembers, setOverdueMembers] = useState<OverdueMemberItem[]>(() =>
    loadPersistedState('overdueMembers', INITIAL_OVERDUE_MEMBERS)
  );
  const [treasuryLedger, setTreasuryLedger] = useState<TreasuryLedgerEntry[]>(() =>
    loadPersistedState('treasuryLedger', INITIAL_TREASURY_LEDGER)
  );

  // Tab 4: Galata Projects & Scholars Fund State
  const [projects, setProjects] = useState<GalataProject[]>(() =>
    loadPersistedState('projects', INITIAL_GALATA_PROJECTS)
  );
  const [scholars, setScholars] = useState<ScholarStudent[]>(() =>
    loadPersistedState('scholars', INITIAL_SCHOLARS)
  );

  // Tab 5: Classification Directory, Committees, Past Presidents & Apple Wallet Modal State
  const [members, setMembers] = useState<RotaryMember[]>(() =>
    loadPersistedState('members', GALATA_ROTARY_MEMBERS)
  );
  const [committees, setCommittees] = useState<ClubCommittee[]>(() =>
    loadPersistedState('committees', INITIAL_CLUB_COMMITTEES)
  );
  const [pastPresidents, setPastPresidents] = useState<PastPresidentRecord[]>(() =>
    loadPersistedState('pastPresidents', INITIAL_PAST_PRESIDENTS)
  );
  const [walletModalMember, setWalletModalMember] = useState<RotaryMember | null>(
    null
  );
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [serverSyncedAt, setServerSyncedAt] = useState<string | null>(null);
  const [boardResolutions, setBoardResolutions] = useState<BoardResolutionItem[]>(() =>
    loadPersistedState('boardResolutions', INITIAL_BOARD_RESOLUTIONS)
  );
  const [kvkkMaskPhone, setKvkkMaskPhone] = useState<boolean>(() =>
    loadPersistedState('kvkkMaskPhone', false)
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() =>
    loadPersistedState('auditLogs', [
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
    ])
  );

  // Sync document.title and hydrate shared state from Pilot Express Server on mount
  useEffect(() => {
    document.title = `RotaClub — ${activeTenantClubName} · 2420. Bölge`;
  }, [activeTenantClubName]);

  useEffect(() => {
    const hasLocalOverride = Boolean(window.localStorage.getItem(STORAGE_KEY));
    fetch('/api/pilot/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((serverData) => {
        if (!serverData) return;
        if (serverData.updatedAt) setServerSyncedAt(serverData.updatedAt);
        if (Array.isArray(serverData.auditLogs) && serverData.auditLogs.length > 0) {
          setAuditLogs(serverData.auditLogs);
        }
        if (!hasLocalOverride) {
          if (serverData.termInfo) setTermInfo(serverData.termInfo);
          if (serverData.meetings) setMeetings(serverData.meetings);
          if (serverData.selectedMeetingNo) setSelectedMeetingNo(serverData.selectedMeetingNo);
          if (serverData.rsvpStatus) setRsvpStatus(serverData.rsvpStatus);
          if (serverData.menuPreference) setMenuPreference(serverData.menuPreference);
          if (serverData.members) setMembers(serverData.members);
          if (serverData.paymentNotifications) setPaymentNotifications(serverData.paymentNotifications);
          if (serverData.treasuryLedger) setTreasuryLedger(serverData.treasuryLedger);
          if (serverData.projects) setProjects(serverData.projects);
          if (serverData.scholars) setScholars(serverData.scholars);
          if (serverData.boardResolutions) setBoardResolutions(serverData.boardResolutions);
        }
      })
      .catch(() => {
        // Fallback to localStorage state if offline
      });
  }, []);

  useEffect(() => {
    try {
      const stateToPersist = {
        activeRole,
        activeTenantClubName,
        termInfo,
        meetings,
        selectedMeetingNo,
        rsvpStatus,
        menuPreference,
        guestNameInput,
        ritualSteps,
        celebrations,
        speakerProposals,
        qrCheckedIn,
        makeupSubmissions,
        guestMakeupCards,
        firesideGroups,
        financialItems,
        paymentNotifications,
        overdueMembers,
        treasuryLedger,
        projects,
        scholars,
        members,
        committees,
        pastPresidents,
        boardResolutions,
        kvkkMaskPhone,
        auditLogs,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToPersist));
    } catch {
      // Ignore storage quota errors in restricted contexts
    }
  }, [
    activeRole,
    activeTenantClubName,
    termInfo,
    meetings,
    selectedMeetingNo,
    rsvpStatus,
    menuPreference,
    guestNameInput,
    ritualSteps,
    celebrations,
    speakerProposals,
    qrCheckedIn,
    makeupSubmissions,
    guestMakeupCards,
    firesideGroups,
    financialItems,
    paymentNotifications,
    overdueMembers,
    treasuryLedger,
    projects,
    scholars,
    members,
    committees,
    pastPresidents,
    boardResolutions,
    kvkkMaskPhone,
    auditLogs,
  ]);

  const recordServerAudit = (
    module: AuditLogEntry['module'],
    action: string,
    detail: string,
    requiredRoles?: ClubRole[]
  ) => {
    fetch('/api/pilot/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rotaclub-role': activeRole,
      },
      body: JSON.stringify({
        activeRole,
        auditEvent: {
          module,
          action,
          detail,
          requiredRoles,
        },
        state: {
          termInfo,
          meetings,
          selectedMeetingNo,
          rsvpStatus,
          menuPreference,
          guestNameInput,
          ritualSteps,
          celebrations,
          speakerProposals,
          qrCheckedIn,
          makeupSubmissions,
          guestMakeupCards,
          firesideGroups,
          financialItems,
          paymentNotifications,
          overdueMembers,
          treasuryLedger,
          projects,
          scholars,
          members,
          committees,
          pastPresidents,
          boardResolutions,
          kvkkMaskPhone,
        },
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.auditLogs) setAuditLogs(data.auditLogs);
        if (data?.updatedAt) setServerSyncedAt(data.updatedAt);
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

  // Demo Reset Handler
  const handleResetDemoData = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setActiveRole('uye');
    setActiveTenantClubName('Galata Rotary Kulübü');
    setTermInfo(INITIAL_TERM_BOARD);
    setMeetings(INITIAL_MEETINGS_LIST);
    setSelectedMeetingNo(1842);
    setRsvpStatus('attending');
    setMenuPreference('Standart');
    setGuestNameInput('Mim. Caner Erkin — Kentsel Tasarım');
    setRitualSteps(INITIAL_RITUAL_STEPS);
    setCelebrations(INITIAL_CELEBRATIONS);
    setSpeakerProposals(INITIAL_SPEAKER_PROPOSALS);
    setQrCheckedIn(false);
    setMakeupSubmissions(INITIAL_MAKEUP_SUBMISSIONS);
    setGuestMakeupCards(INITIAL_GUEST_MAKEUP_CARDS);
    setFiresideGroups(INITIAL_FIRESIDE_GROUPS);
    setFinancialItems(INITIAL_FINANCIAL_ITEMS);
    setPaymentNotifications(INITIAL_PAYMENT_NOTIFICATIONS);
    setOverdueMembers(INITIAL_OVERDUE_MEMBERS);
    setTreasuryLedger(INITIAL_TREASURY_LEDGER);
    setProjects(INITIAL_GALATA_PROJECTS);
    setScholars(INITIAL_SCHOLARS);
    setMembers(GALATA_ROTARY_MEMBERS);
    setCommittees(INITIAL_CLUB_COMMITTEES);
    setPastPresidents(INITIAL_PAST_PRESIDENTS);
    setBoardResolutions(INITIAL_BOARD_RESOLUTIONS);
    setKvkkMaskPhone(false);
    fetch('/api/pilot/reset', {
      method: 'POST',
      headers: { 'x-rotaclub-role': activeRole },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.auditLogs) setAuditLogs(data.auditLogs);
        if (data?.updatedAt) setServerSyncedAt(data.updatedAt);
      })
      .catch(() => {});
    showToast(
      'RotaClub Pilot Veritabanı Sıfırlandı',
      'Tüm LCV matrisi, kasa defteri, bursiyer fonu, toplantı bültenleri ve sunucu verileri başlangıç durumuna döndürüldü.'
    );
  };

  const handleDownloadBackup = () => {
    window.location.href = '/api/pilot/backup';
    recordServerAudit(
      'Yönetim & Güvenlik',
      'Tam Veritabanı & Denetim İzi Yedeği İndirildi (.JSON)',
      'Galata Rotary Kulübü ortak veritabanı ve denetim geçmişi dışa aktarıldı.'
    );
    showToast(
      'Tam Veritabanı Yedeği İndirildi (.JSON)',
      'RotaClub_Galata_Pilot_Backup_v4.json dosyası sunucudan bilgisayarınıza indirildi.'
    );
  };

  const handleAddBoardResolution = (payload: {
    resolutionNo: string;
    title: string;
    summary: string;
    category: BoardResolutionItem['category'];
  }) => {
    const created: BoardResolutionItem = {
      id: `yk-${Date.now()}`,
      resolutionNo: payload.resolutionNo,
      date: '22 Ekim 2026',
      title: payload.title,
      summary: payload.summary,
      category: payload.category,
      status: 'Oybirliği ile Kabul',
    };
    setBoardResolutions((prev) => [created, ...prev]);
    recordServerAudit(
      'Yönetim & Güvenlik',
      `YK Karar Defterine Kayıt: ${payload.resolutionNo}`,
      `${payload.title} (${payload.category}) Yönetim Kurulu Karar Defterine işlendi.`,
      ['sekreter', 'baskan']
    );
    showToast(
      `YK Kararı Kaydedildi (${payload.resolutionNo})`,
      `"${payload.title}" oybirliği ile Yönetim Kurulu Karar Defterine eklendi.`
    );
  };

  const handleToggleKvkkMaskPhone = () => {
    const nextState = !kvkkMaskPhone;
    setKvkkMaskPhone(nextState);
    recordServerAudit(
      'Yönetim & Güvenlik',
      `KVKK Telefon Maskeleme ${nextState ? 'Aktif Edildi' : 'Kapatıldı'}`,
      `Üye rehberi telefon numaraları KVKK gizlilik modu kapsamında ${nextState ? 'maskelendi' : 'tam görünüme açıldı'}.`
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

  // Merge detailed members RSVP with additional baseline club members for live Pera Palace Kuver summary
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
  const handleSelectRole = (role: ClubRole) => {
    setActiveRole(role);
    const roleNames: Record<ClubRole, string> = {
      uye: 'Üye: Rifat Akın',
      sekreter: 'Genel Sekreter (Rtn. Av. Nazlı Denizmen)',
      sayman: 'Kulüp Saymanı (Rtn. YMM Levent Soydan)',
      baskan: 'Dönem Başkanı (Rtn. Mimar Emre Karaca)',
    };
    showToast(
      `Aktif Rol: ${roleNames[role]}`,
      'Yetkili yönetim panelleri ve onay kontrolleri seçilen role göre güncellendi.'
    );
  };

  const handleSelectTenantClub = (tenant: TenantClubOption) => {
    setActiveTenantClubName(tenant.name);
    if (tenant.id === 'club-galata') {
      showToast(
        'Galata Rotary Kulübü (Aktif Oturum)',
        'RotaClub çoklu kulüp (Multi-Tenant) mimarisinde Galata Rotary Kulübü verileri görüntüleniyor.'
      );
    } else {
      showToast(
        `RotaClub Çoklu Kulüp Geçişi: ${tenant.name}`,
        `${tenant.district} (${tenant.meetingDay}) kulüp çalışma alanı RotaClub SaaS altyapısında aktif edildi.`
      );
    }
  };

  const handleChangeRsvpStatus = (status: RsvpStatus) => {
    setRsvpStatus(status);
    setMembers((prev) =>
      prev.map((m) => (m.id === 'm-rifat' ? { ...m, rsvpStatus: status } : m))
    );
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
      `Rtn. Rifat Akın #${selectedMeetingNo} toplantı LCV durumunu "${statusLabels[status]}" olarak güncelledi.`
    );
  };

  const handleChangeMenuPreference = (menu: MenuPreference) => {
    setMenuPreference(menu);
    setMembers((prev) =>
      prev.map((m) => (m.id === 'm-rifat' ? { ...m, mealPreference: menu } : m))
    );
    showToast(
      `Menü Tercihi: ${menu}`,
      `Toplantı akşam yemeği tercihiniz "${menu} Menü" olarak kaydedildi.`
    );
    recordServerAudit(
      'LCV & Kuver',
      `Menü Tercihi Güncellendi (${menu})`,
      `Rtn. Rifat Akın akşam yemeği menü tercihini "${menu}" olarak güncelledi.`
    );
  };

  const handleUpdateMemberRsvp = (
    memberId: string,
    status: RsvpStatus,
    menu?: MenuPreference
  ) => {
    const target = members.find((m) => m.id === memberId);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? {
              ...m,
              rsvpStatus: status,
              mealPreference: menu || m.mealPreference,
            }
          : m
      )
    );
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
        ['sekreter', 'baskan']
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
    setMeetings((prev) => [...prev, newMeeting]);
    setSelectedMeetingNo(newMeeting.meetingNo);
    showToast(
      `Yeni Toplantı Planlandı (#${newMeeting.meetingNo})`,
      `${newMeeting.date} tarihli "${newMeeting.topic}" toplantısı bülten takvimine eklendi.`
    );
    recordServerAudit(
      'LCV & Kuver',
      `Yeni Haftalık Toplantı Planlandı (#${newMeeting.meetingNo})`,
      `${newMeeting.date} · ${newMeeting.speakerName} (${newMeeting.topic}) bülten takvimine eklendi.`,
      ['sekreter', 'baskan']
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
      'TR-2420-88412 (Rtn. Rifat Akın) #1842. Haftalık Toplantı salon giriş yoklaması sunucuya işlendi.'
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
    setMakeupSubmissions((prev) => [newEntry, ...prev]);
    showToast(
      'Make-up Bildirimi Onaylandı (+%3 Katılım)',
      `${payload.targetClubOrEvent} katılımınız devam oranınıza eklendi.`
    );
    recordServerAudit(
      'QR Yoklama & Make-up',
      `Make-up Bildirimi Kaydedildi: ${payload.targetClubOrEvent}`,
      `${payload.activityType} (${payload.date}) katılımı devam oranına +%3 olarak işlendi.`
    );
  };

  const handleSendGuestMakeupCard = (
    payload: Omit<GuestRotaryMakeupCard, 'id' | 'sentAt' | 'verificationCode'>
  ) => {
    const newCard: GuestRotaryMakeupCard = {
      id: `gmk-${Date.now()}`,
      ...payload,
      sentAt: '22 Ekim 2026 · Şimdi',
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
      submittedAt: '22 Ekim 2026 · Şimdi',
      receiptRef: payload.receiptRef,
      status: 'Bekliyor',
    };
    setPaymentNotifications((prev) => [newPayment, ...prev]);
    showToast(
      'Dekont & Ödeme Bildirimi Alındı',
      `${formatTL(payload.amount)} tutarındaki ödeme bildiriminiz Sayman onay listesine eklendi.`
    );
  };

  const handleApprovePayment = (paymentId: string) => {
    const target = paymentNotifications.find((p) => p.id === paymentId);
    setPaymentNotifications((prev) =>
      prev.map((p) => (p.id === paymentId ? { ...p, status: 'Onaylandı' } : p))
    );
    if (target) {
      // Also deduct from the member's balance in Cari Matrix and add to Treasury Ledger
      setMembers((prev) =>
        prev.map((m) => {
          if (m.id !== target.memberId && !target.memberName.includes(m.fullName)) {
            return m;
          }
          if (target.category === 'Dönem Aidatı') {
            return { ...m, duesBalance: Math.max(0, m.duesBalance - target.amount) };
          }
          if (target.category === 'Toplantı Kuver Bakiyesi') {
            return { ...m, mealBalance: Math.max(0, m.mealBalance - target.amount) };
          }
          return {
            ...m,
            foundationBalance: Math.max(0, m.foundationBalance - target.amount),
          };
        })
      );
      setTreasuryLedger((prev) => [
        {
          id: `tr-${Date.now()}`,
          date: '22 Ekim 2026',
          type: 'Gelir',
          category:
            target.category === 'Vakıf / Proje Katkı Payı'
              ? 'UR Bölge & Vakıf'
              : 'Aidat & Kuver Tahsilatı',
          title: `${target.memberName} — ${target.description}`,
          counterparty: target.memberName,
          amount: target.amount,
          referenceNo: target.receiptRef,
        },
        ...prev,
      ]);
      showToast(
        'Ödeme Onaylandı & Cari Bakiyeden Düşüldü',
        `${target.memberName} tarafından bildirilen ${formatTL(target.amount)} ödeme cari matristen düşüldü ve kasa defterine gelir işlendi.`
      );
      recordServerAudit(
        'Saymanlık & Kasa',
        `Dekont Onaylandı & Cari Hesaptan Düşüldü (${target.receiptRef})`,
        `${target.memberName} (${formatTL(target.amount)} · ${target.category}) ödemesi Saymanlık tarafından onaylandı.`,
        ['sayman', 'baskan']
      );
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
        `${target.memberName} (${target.receiptRef}) dekont kaydı kontrol edilmek üzere reddedildi.`
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

  const handleBulkAccrual = (
    category: FinancialLineItem['category'],
    amount: number,
    description: string
  ) => {
    setMembers((prev) => applyBulkMemberAccrual(prev, category, amount));
    setFinancialItems((prev) => [
      ...prev,
      {
        id: `fin-${Date.now()}`,
        category,
        title: description,
        period: 'Ekim 2026 Tahakkuku',
        totalAmount: amount,
        paidAmount: 0,
        dueDate: '15 Kasım 2026',
      },
    ]);
    showToast(
      `Toplu Tahakkuk Uygulandı (${formatTL(amount)})`,
      `Tüm kulüp üyelerinin "${category}" cari bakiyesine "${description}" kalemi eklendi.`
    );
  };

  const handleAddTreasuryEntry = (entry: Omit<TreasuryLedgerEntry, 'id'>) => {
    const created: TreasuryLedgerEntry = {
      id: `tr-${Date.now()}`,
      ...entry,
    };
    setTreasuryLedger((prev) => [created, ...prev]);
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

  const handleSupportProject = (
    projectId: string,
    amount: number,
    supportType: string
  ) => {
    const target = projects.find((p) => p.id === projectId);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              collectedAmount: p.collectedAmount + amount,
              supportersCount: p.supportersCount + 1,
            }
          : p
      )
    );
    if (target) {
      showToast(
        `${target.title} Desteğiniz Kaydedildi`,
        `${formatTL(amount)} (${supportType}) katkınız proje termometresine anında yansıtıldı.`
      );
      recordServerAudit(
        'Projeler & Burslar',
        `Proje Bağış & Davetiye Katkısı: ${target.title}`,
        `Rtn. Rifat Akın tarafından ${formatTL(amount)} (${supportType}) proje katkısı işlendi.`
      );
    }
  };

  const handleToggleProjectVolunteer = (projectId: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const currentList = target.volunteers || ['Rtn. Deniz Arslan', 'Rtn. Zeynep Yıldırım'];
    const isAlreadyVolunteer = currentList.includes('Rtn. Rifat Akın');
    const nextList = isAlreadyVolunteer
      ? currentList.filter((v) => v !== 'Rtn. Rifat Akın')
      : [...currentList, 'Rtn. Rifat Akın'];

    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, volunteers: nextList } : p
      )
    );
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
      `Rtn. Rifat Akın "${target.title}" saha gönüllüsü listesine ${isAlreadyVolunteer ? 'çıkarıldı' : 'eklendi'}.`
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
    setProjects((prev) => [created, ...prev]);
    showToast(
      `Yeni Hizmet Projesi Başlatıldı: ${newProject.title}`,
      `Hedef bütçesi ${formatTL(newProject.targetBudget)} olan proje bağış termometresiyle yayına alındı.`
    );
  };

  const handleSponsorScholarMonth = (scholarId: string) => {
    const target = scholars.find((s) => s.id === scholarId);
    setScholars((prev) =>
      prev.map((s) => {
        if (s.id !== scholarId) return s;
        const nextFunded = Math.min(s.totalMonths, s.fundedMonths + 1);
        return {
          ...s,
          fundedMonths: nextFunded,
          statusNote:
            nextFunded >= s.totalMonths
              ? 'Dönem Bursu Tamamlandı'
              : s.statusNote,
        };
      })
    );
    if (target) {
      setTreasuryLedger((prev) => [
        {
          id: `tr-${Date.now()}`,
          date: '22 Ekim 2026',
          type: 'Gelir',
          category: 'Burs & Proje Fonu',
          title: `${target.fullName} (${target.university}) 1 Aylık Burs Katkısı`,
          counterparty: 'Rtn. Rifat Akın',
          amount: target.monthlyStipend,
          referenceNo: `GLR-BURS-${Math.floor(100 + Math.random() * 899)}`,
        },
        ...prev,
      ]);
      showToast(
        `1 Aylık Eğitim Bursu Üstlenildi: ${target.fullName}`,
        `${target.university} öğrencimiz için ${formatTL(target.monthlyStipend)} burs katkınız kaydedildi.`
      );
    }
  };

  const handleAddNewMember = (newMember: RotaryMember) => {
    setMembers((prev) => [newMember, ...prev]);
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
      ['sekreter', 'baskan']
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
        onSelectRole={handleSelectRole}
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
            onSelectRole={handleSelectRole}
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
            onSelectRole={handleSelectRole}
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
            onSelectRole={handleSelectRole}
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
            onSelectRole={handleSelectRole}
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
            onSelectRole={handleSelectRole}
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

      {/* Full-Screen iOS Splash / Lock Screen Modal */}
      <SplashLockScreenModal
        isOpen={isSplashModalOpen}
        activeRole={activeRole}
        onUnlock={(selectedRole) => {
          setIsSplashModalOpen(false);
          if (selectedRole && selectedRole !== activeRole) {
            setActiveRole(selectedRole);
          }
          showToast(
            'Face ID & KVKK Doğrulaması Başarılı',
            'RotaClub — Galata Rotary Kulübü güvenli oturumu doğrulandı.'
          );
        }}
      />

      {/* Printable Official Digital Make-up Certificate Modal */}
      <OfficialMakeupCertificateModal
        card={activeCertificateCard}
        termInfo={termInfo}
        onClose={() => setActiveCertificateCard(null)}
      />

      {/* Server RBAC, Audit Log, YK Karar Defteri & KVKK Modal (Epics #2, #3, #7) */}
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

