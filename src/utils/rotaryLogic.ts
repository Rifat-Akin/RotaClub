import {
  FinancialLineItem,
  MemberRsvp,
  MenuPreference,
  PaymentNotification,
  RotaryMember,
  RsvpStatus,
  SpeakerProposal,
  TermBoardInfo,
  TreasuryLedgerEntry,
  WeeklyMeeting,
} from '../types/rotary';

export interface KuverSummaryResult {
  attendingMembers: number;
  spousesCount: number;
  guestsCount: number;
  excusedMembers: number;
  pendingMembers: number;
  totalKuver: number;
  menuBreakdown: Record<MenuPreference, number>;
}

/**
 * Calculates live hotel catering (Kuver) summary including the current user's active RSVP and menu selection.
 */
export function calculateKuverSummary(
  baseRsvps: MemberRsvp[],
  currentUserStatus: RsvpStatus,
  currentUserMenu: MenuPreference,
  currentUserExtraGuests: number = 1
): KuverSummaryResult {
  const otherRsvps = baseRsvps.filter((r) => r.memberId !== 'm-rifat');

  const currentUserEntry: MemberRsvp = {
    memberId: 'm-rifat',
    memberName: 'Rifat Akın',
    status: currentUserStatus,
    menu: currentUserMenu,
    guestCount:
      currentUserStatus === 'with_guest'
        ? Math.max(1, currentUserExtraGuests)
        : 0,
  };

  const allRsvps = [currentUserEntry, ...otherRsvps];

  let attendingMembers = 0;
  let spousesCount = 0;
  let guestsCount = 0;
  let excusedMembers = 0;
  let pendingMembers = 0;

  const menuBreakdown: Record<MenuPreference, number> = {
    Standart: 0,
    Vejetaryen: 0,
    Balık: 0,
  };

  for (const rsvp of allRsvps) {
    if (rsvp.status === 'excused') {
      excusedMembers += 1;
      continue;
    }
    if (rsvp.status === 'pending') {
      pendingMembers += 1;
      continue;
    }

    attendingMembers += 1;
    menuBreakdown[rsvp.menu] = (menuBreakdown[rsvp.menu] || 0) + 1;

    if (rsvp.status === 'with_spouse') {
      spousesCount += 1;
      menuBreakdown[rsvp.menu] += 1;
    } else if (rsvp.status === 'with_guest') {
      const gCount = rsvp.guestCount > 0 ? rsvp.guestCount : 1;
      guestsCount += gCount;
      menuBreakdown[rsvp.menu] += gCount;
    }
  }

  const totalKuver = attendingMembers + spousesCount + guestsCount;

  return {
    attendingMembers,
    spousesCount,
    guestsCount,
    excusedMembers,
    pendingMembers,
    totalKuver,
    menuBreakdown,
  };
}

/**
 * Generates RFC-4180 compliant CSV string for Pera Palace Hotel Kuver & Menu Matrix.
 */
export function generateKuverCsvContent(members: RotaryMember[], meetingNo: number): string {
  const headers = [
    'Rotary ID',
    'Üye Adı Soyadı',
    'LCV Durumu',
    'Menü Tercihi',
    'Eş / Konuk Adı',
    'Toplam Kuver',
  ];

  const statusLabels: Record<RsvpStatus, string> = {
    attending: 'Katılıyor (1 Kişi)',
    with_spouse: 'Eşli Katılıyor (+1)',
    with_guest: 'Konuklu Katılıyor (+1)',
    excused: 'Mazeretli',
    pending: 'Yanıt Bekleniyor',
  };

  const rows = members.map((m) => {
    const kuverCount =
      m.rsvpStatus === 'with_spouse' || m.rsvpStatus === 'with_guest'
        ? 2
        : m.rsvpStatus === 'attending'
        ? 1
        : 0;
    const companion =
      m.rsvpStatus === 'with_spouse'
        ? m.spouseName || 'Eşi'
        : m.rsvpStatus === 'with_guest'
        ? m.guestName || 'Konuğu'
        : '-';
    return [
      m.rotaryId,
      m.fullName,
      statusLabels[m.rsvpStatus],
      m.rsvpStatus === 'excused' || m.rsvpStatus === 'pending' ? '-' : m.mealPreference,
      companion,
      String(kuverCount),
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',');
  });

  return `# Toplantı #${meetingNo} Pera Palace Kuver Listesi\n` + [headers.join(','), ...rows].join('\n');
}

/**
 * Generates CSV string for All Members Financial Balance Matrix (Tüm Üyeler Cari Matrisi).
 */
export function generateMembersFinanceCsvContent(members: RotaryMember[]): string {
  const headers = [
    'Rotary ID',
    'Üye Adı Soyadı',
    'Sınıflandırma',
    'Aidat Borcu (TL)',
    'Kuver Borcu (TL)',
    'Vakıf/Proje Borcu (TL)',
    'Toplam Borç (TL)',
  ];

  const rows = members.map((m) => {
    const total = m.duesBalance + m.mealBalance + m.foundationBalance;
    return [
      m.rotaryId,
      m.fullName,
      m.classification,
      String(m.duesBalance),
      String(m.mealBalance),
      String(m.foundationBalance),
      String(total),
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Applies a bulk accrual (Toplu Tahakkuk / Borçlandırma) to all members by category.
 */
export function applyBulkMemberAccrual(
  members: RotaryMember[],
  category: 'Dönem Aidatı' | 'Toplantı Kuver Bakiyesi' | 'Vakıf / Proje Katkı Payı',
  amount: number
): RotaryMember[] {
  if (amount <= 0) return members;
  return members.map((m) => {
    if (category === 'Dönem Aidatı') {
      return { ...m, duesBalance: m.duesBalance + amount };
    }
    if (category === 'Toplantı Kuver Bakiyesi') {
      return { ...m, mealBalance: m.mealBalance + amount };
    }
    return { ...m, foundationBalance: m.foundationBalance + amount };
  });
}

/**
 * Calculates Club Treasury Ledger summary (total bank balance, total income, total expenses, total member receivables).
 */
export function calculateTreasurySummary(
  ledger: TreasuryLedgerEntry[],
  members: RotaryMember[],
  initialOpeningBalance: number = 1420000
): {
  totalIncome: number;
  totalExpense: number;
  netBankBalance: number;
  totalMemberReceivables: number;
} {
  const totalIncome = ledger
    .filter((e) => e.type === 'Gelir')
    .reduce((acc, e) => acc + e.amount, 0);
  const totalExpense = ledger
    .filter((e) => e.type === 'Gider')
    .reduce((acc, e) => acc + e.amount, 0);
  const netBankBalance = initialOpeningBalance + totalIncome - totalExpense;
  const totalMemberReceivables = members.reduce(
    (acc, m) => acc + m.duesBalance + m.mealBalance + m.foundationBalance,
    0
  );

  return {
    totalIncome,
    totalExpense,
    netBankBalance,
    totalMemberReceivables,
  };
}

/**
 * Computes updated attendance percentage based on base rate, submitted make-ups, and QR check-in.
 */
export function calculateUpdatedAttendance(
  baseAttendancePercent: number,
  extraMakeupsCount: number,
  qrCheckedIn: boolean
): number {
  const makeupBonus = extraMakeupsCount * 3;
  const qrBonus = qrCheckedIn ? 2 : 0;
  return Math.min(100, Math.max(0, baseAttendancePercent + makeupBonus + qrBonus));
}

export interface MemberFinanceSummary {
  totalObligation: number;
  totalPaid: number;
  remainingBalance: number;
  pendingApprovalAmount: number;
}

/**
 * Computes personal balance breakdown and reflects approved payment notifications.
 */
export function calculateMemberFinanceSummary(
  lineItems: FinancialLineItem[],
  notifications: PaymentNotification[],
  memberId: string = 'm-rifat'
): MemberFinanceSummary {
  const baseObligation = lineItems.reduce((acc, item) => acc + item.totalAmount, 0);
  const basePaid = lineItems.reduce((acc, item) => acc + item.paidAmount, 0);

  const memberNotifications = notifications.filter((n) => n.memberId === memberId);

  const newlyApprovedAmount = memberNotifications
    .filter((n) => n.status === 'Onaylandı')
    .reduce((acc, n) => acc + n.amount, 0);

  const pendingApprovalAmount = memberNotifications
    .filter((n) => n.status === 'Bekliyor')
    .reduce((acc, n) => acc + n.amount, 0);

  const totalPaid = Math.min(baseObligation, basePaid + newlyApprovedAmount);
  const remainingBalance = Math.max(0, baseObligation - totalPaid);

  return {
    totalObligation: baseObligation,
    totalPaid,
    remainingBalance,
    pendingApprovalAmount,
  };
}

/**
 * Computes project fundraising progress percentage and remaining amount.
 */
export function calculateProjectProgress(
  targetBudget: number,
  collectedAmount: number
): { percent: number; remainingAmount: number; isGoalReached: boolean } {
  if (targetBudget <= 0) {
    return { percent: 100, remainingAmount: 0, isGoalReached: true };
  }
  const rawPercent = Math.round((collectedAmount / targetBudget) * 100);
  const percent = Math.min(100, Math.max(0, rawPercent));
  const remainingAmount = Math.max(0, targetBudget - collectedAmount);

  return {
    percent,
    remainingAmount,
    isGoalReached: collectedAmount >= targetBudget,
  };
}

/**
 * Filters Rotary members by search text (name, classification, company, blood group) and industry category.
 */
export function filterMembersByQueryAndClassification(
  members: RotaryMember[],
  searchQuery: string,
  selectedCategory: string
): RotaryMember[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('tr-TR');

  return members.filter((member) => {
    const matchesCategory =
      selectedCategory === 'Tümü' || member.industryCategory === selectedCategory;

    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;

    const haystack = [
      member.fullName,
      member.classification,
      member.industryCategory,
      member.companyName,
      member.bloodGroup,
      member.phfLevel,
      member.clubTitle,
      member.spouseName || '',
      member.committees.join(' '),
    ]
      .join(' ')
      .toLocaleLowerCase('tr-TR');

    return haystack.includes(normalizedQuery);
  });
}

/**
 * Executes the July 1st Rotary Term Rollover (1 Temmuz Dönem Devir-Teslim Motoru),
 * archiving the 2026-2027 term into the Galata Digital Yearbook and activating 2027-2028.
 */
export function executeJulyFirstRollover(currentTerm: TermBoardInfo): TermBoardInfo {
  if (currentTerm.isRolloverCompleted) {
    return currentTerm;
  }

  return {
    termLabel: '2027-2028 Dönemi',
    district: '2420. Bölge',
    themeTitle: 'Birlikte Kalıcı Etki Yaratırız',
    president: 'Rtn. Selim Koçak (2027-28 Dönem Başkanı)',
    secretary: 'Rtn. Rifat Akın (Genel Sekreter)',
    treasurer: 'Rtn. Defne Serezli (Sayman)',
    pastPresident: 'GDB. Emre Karaca (2026-27 Geçmiş Dönem Başkanı)',
    vicePresident: 'Rtn. Kerem Soylu (Gelecek Dönem Başkanı)',
    isRolloverCompleted: true,
    archivedYearbook: {
      termLabel: currentTerm.termLabel,
      president: currentTerm.president,
      totalProjects: 14,
      totalDonationsTL: 3480000,
      totalMeetings: 46,
      averageAttendance: 92,
      archivedAt: '1 Temmuz 2027 · 00:01',
    },
  };
}

/**
 * Formats Turkish Lira currency cleanly with tabular digits and TL suffix.
 */
export function formatTL(amount: number): string {
  const formattedNumber = new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${formattedNumber} TL`;
}

/**
 * Toggles +1 vote for a speaker proposal in the Guest Speaker Pool and sorts descending by votes.
 */
export function toggleVoteSpeakerProposal(
  proposals: SpeakerProposal[],
  proposalId: string
): SpeakerProposal[] {
  return proposals
    .map((p) => {
      if (p.id !== proposalId) return p;
      const nextHasVoted = !p.hasVoted;
      return {
        ...p,
        hasVoted: nextHasVoted,
        votes: nextHasVoted ? p.votes + 1 : Math.max(0, p.votes - 1),
      };
    })
    .sort((a, b) => b.votes - a.votes);
}

/**
 * Adds a new speaker proposal to the pool with 1 initial vote from the proposer.
 */
export function createSpeakerProposal(
  proposals: SpeakerProposal[],
  input: {
    speakerName: string;
    speakerTitle: string;
    proposedTopic: string;
    proposedBy: string;
    targetMonth: string;
  }
): SpeakerProposal[] {
  const newEntry: SpeakerProposal = {
    id: `spk-${Date.now()}`,
    speakerName: input.speakerName.trim(),
    speakerTitle: input.speakerTitle.trim(),
    proposedTopic: input.proposedTopic.trim(),
    proposedBy: input.proposedBy.trim() || 'Rtn. Rifat Akın',
    votes: 1,
    hasVoted: true,
    targetMonth: input.targetMonth.trim() || 'Kasım 2026',
  };
  return [newEntry, ...proposals].sort((a, b) => b.votes - a.votes);
}

/**
 * Generates RFC-5545 compliant iCalendar (.ics) file content for a Rotary club meeting (Epic #9).
 */
export function generateMeetingIcsContent(
  meeting: WeeklyMeeting,
  clubName: string = 'Galata Rotary Kulübü (UR 2420. Bölge)'
): string {
  const summary = `${clubName} — #${meeting.meetingNo}. Haftalık Toplantı: ${meeting.speakerName}`;
  const description = `Konuk Konuşmacı: ${meeting.speakerName} (${meeting.speakerTitle})\\nKonu: ${meeting.topic}\\nMekan: ${meeting.venue} (${meeting.hall})`;
  const location = `${meeting.venue} - ${meeting.hall}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RotaClub//Galata Rotary 2420//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:rotaclub-meeting-${meeting.meetingNo}@galatarotary.org`,
    'DTSTAMP:20261022T120000Z',
    'DTSTART:20261027T163000Z',
    'DTEND:20261027T190000Z',
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Masks a phone number under KVKK privacy settings when masking is enabled (Epic #2).
 */
export function maskPhoneForKvkk(phone: string, maskEnabled: boolean): string {
  if (!maskEnabled) return phone;
  const trimmed = phone.trim();
  if (trimmed.length < 7) return '*** ** **';
  return `${trimmed.slice(0, 7)} *** ** ${trimmed.slice(-2)}`;
}

