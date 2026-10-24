import {
  BoardResolutionItem,
  ClubAttendancePolicy,
  FinancialLineItem,
  LcvReminderQueueItem,
  MakeupSubmission,
  MemberRsvp,
  MembershipLifecycleStatus,
  MenuPreference,
  PaymentNotification,
  ReminderChannel,
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
 * Resolves a member's RSVP status for a specific meeting (#27, #28, #32).
 * Uses `member.meetingRsvps[String(meetingNo)]` when present; falls back to `member.rsvpStatus`
 * only if `selectedMeetingNo` matches `meetingNo` (or is omitted), otherwise defaults to `'pending'`.
 */
export function getMemberRsvpForMeeting(
  member: Pick<RotaryMember, 'rsvpStatus' | 'meetingRsvps' | 'membershipStatus'>,
  meetingNo: number,
  selectedMeetingNo?: number
): RsvpStatus {
  if (
    member.membershipStatus === 'İstifa / Ayrıldı' ||
    member.membershipStatus === 'Nakil'
  ) {
    return 'excused';
  }
  const key = String(meetingNo);
  const specific = member.meetingRsvps?.[key];
  if (specific !== undefined) {
    return specific;
  }
  if (
    typeof selectedMeetingNo === 'number' &&
    selectedMeetingNo !== meetingNo
  ) {
    return 'pending';
  }
  return member.rsvpStatus;
}

/**
 * Resolves a member's menu preference for a specific meeting (#27, #28).
 */
export function getMemberMenuForMeeting(
  member: Pick<RotaryMember, 'mealPreference' | 'meetingMenus'>,
  meetingNo: number
): MenuPreference {
  const key = String(meetingNo);
  return member.meetingMenus?.[key] || member.mealPreference || 'Standart';
}

/**
 * Calculates per-meeting Kuver & Menu summary directly from the club member roster (#27, #28).
 * Excludes resigned/transferred members (`İstifa / Ayrıldı`, `Nakil`) from active headcount.
 */
export function calculateMeetingKuverSummary(
  members: RotaryMember[],
  meetingNo: number,
  selectedMeetingNo?: number
): KuverSummaryResult {
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

  for (const m of members) {
    if (
      m.membershipStatus === 'İstifa / Ayrıldı' ||
      m.membershipStatus === 'Nakil'
    ) {
      continue;
    }
    const status = getMemberRsvpForMeeting(m, meetingNo, selectedMeetingNo);
    const menu = getMemberMenuForMeeting(m, meetingNo);

    if (status === 'excused') {
      excusedMembers += 1;
      continue;
    }
    if (status === 'pending') {
      pendingMembers += 1;
      continue;
    }

    attendingMembers += 1;
    menuBreakdown[menu] = (menuBreakdown[menu] || 0) + 1;

    if (status === 'with_spouse') {
      spousesCount += 1;
      menuBreakdown[menu] += 1;
    } else if (status === 'with_guest') {
      guestsCount += 1;
      menuBreakdown[menu] += 1;
    }
  }

  return {
    attendingMembers,
    spousesCount,
    guestsCount,
    excusedMembers,
    pendingMembers,
    totalKuver: attendingMembers + spousesCount + guestsCount,
    menuBreakdown,
  };
}

/**
 * Generates RFC-4180 compliant CSV string for Pera Palace Hotel Kuver & Menu Matrix (#27, #28).
 */
export function generateKuverCsvContent(
  members: RotaryMember[],
  meetingNo: number,
  selectedMeetingNo?: number
): string {
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

  const activeMembers = members.filter(
    (m) =>
      m.membershipStatus !== 'İstifa / Ayrıldı' &&
      m.membershipStatus !== 'Nakil'
  );

  const rows = activeMembers.map((m) => {
    const rsvp = getMemberRsvpForMeeting(m, meetingNo, selectedMeetingNo);
    const menu = getMemberMenuForMeeting(m, meetingNo);
    const kuverCount =
      rsvp === 'with_spouse' || rsvp === 'with_guest'
        ? 2
        : rsvp === 'attending'
        ? 1
        : 0;
    const companion =
      rsvp === 'with_spouse'
        ? m.spouseName || 'Eşi'
        : rsvp === 'with_guest'
        ? m.guestName || 'Konuğu'
        : '-';
    return [
      m.rotaryId,
      m.fullName,
      statusLabels[rsvp],
      rsvp === 'excused' || rsvp === 'pending' ? '-' : menu,
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
 * Applies a bulk accrual (Toplu Tahakkuk / Borçlandırma) to eligible active members by category (#24-#26, #38-#44).
 * Honorary ('Onur Üyesi'), Resigned ('İstifa / Ayrıldı'), Transferred ('Nakil'), and Candidate ('Aday') members
 * are exempt from mandatory dues/kuver accruals. Members on approved leave ('İzinli (Muaf)') are exempt from
 * mandatory meal/kuver ('Toplantı Kuver Bakiyesi') accruals.
 */
export function applyBulkMemberAccrual(
  members: RotaryMember[],
  category: 'Dönem Aidatı' | 'Toplantı Kuver Bakiyesi' | 'Vakıf / Proje Katkı Payı',
  amount: number
): RotaryMember[] {
  if (amount <= 0) return members;
  return members.map((m) => {
    const status = m.membershipStatus || 'Aktif';
    if (
      status === 'Onur Üyesi' ||
      status === 'İstifa / Ayrıldı' ||
      status === 'Nakil' ||
      status === 'Aday'
    ) {
      return m;
    }
    if (status === 'İzinli (Muaf)' && category === 'Toplantı Kuver Bakiyesi') {
      return m;
    }
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

/**
 * Issue #29 — Kesin LCV, Kuver ve Otel Onayı (Hotel Banquet Commitment & Official Confirmation Reconciliation)
 * Hotel banquet confirmation requires BOTH club LCV lock AND an explicit hotel confirmation reference code.
 */
export interface HotelBanquetCommitmentResult {
  reportedMemberAndGuestKuver: number;
  protocolSpeakerKuver: number;
  actualHeadcount: number;
  minHotelGuarantee: number;
  guaranteedBillableKuver: number;
  unfilledGuaranteeSeats: number;
  isLockedForHotel: boolean;
  isHotelConfirmed: boolean;
  hotelConfirmationRef?: string;
  hotelConfirmedBy?: string;
  hotelConfirmationStatus:
    | 'Kesin Kuver Otele Onaylandı (Kilitli)'
    | 'LCV Kilitlendi — Otel Banket Teyidi Bekleniyor'
    | 'LCV Bildirimi Açık — Otel Onayı Bekleniyor';
}

export function calculateHotelBanquetCommitment(
  kuverSummary: KuverSummaryResult,
  minHotelGuarantee: number = 25,
  isLockedForHotel: boolean = false,
  protocolSpeakerKuver: number = 1,
  hotelConfirmationRef?: string,
  hotelConfirmedBy?: string
): HotelBanquetCommitmentResult {
  const safeMinGuarantee = Math.max(0, minHotelGuarantee);
  const safeProtocol = Math.max(0, protocolSpeakerKuver);
  const actualHeadcount = kuverSummary.totalKuver + safeProtocol;
  const guaranteedBillableKuver = Math.max(safeMinGuarantee, actualHeadcount);
  const unfilledGuaranteeSeats = Math.max(
    0,
    safeMinGuarantee - actualHeadcount
  );
  const cleanRef = hotelConfirmationRef?.trim() || undefined;
  const cleanOfficer = hotelConfirmedBy?.trim() || undefined;
  const isHotelConfirmed = Boolean(isLockedForHotel && cleanRef);

  const hotelConfirmationStatus = !isLockedForHotel
    ? 'LCV Bildirimi Açık — Otel Onayı Bekleniyor'
    : isHotelConfirmed
    ? 'Kesin Kuver Otele Onaylandı (Kilitli)'
    : 'LCV Kilitlendi — Otel Banket Teyidi Bekleniyor';

  return {
    reportedMemberAndGuestKuver: kuverSummary.totalKuver,
    protocolSpeakerKuver: safeProtocol,
    actualHeadcount,
    minHotelGuarantee: safeMinGuarantee,
    guaranteedBillableKuver,
    unfilledGuaranteeSeats,
    isLockedForHotel,
    isHotelConfirmed,
    hotelConfirmationRef: cleanRef,
    hotelConfirmedBy: cleanOfficer,
    hotelConfirmationStatus,
  };
}

/**
 * Issue #42 — Kişi Başı Toplantı Maliyeti ve Muafiyetler (Per-Capita Meeting Cost & Exemption Allocation)
 */
export interface MeetingCostSharingResult {
  unitKuverCostTL: number;
  billableKuverCount: number;
  attendingPayingMembersCount: number;
  payingCompanionsCount: number;
  totalHotelInvoiceTL: number;
  totalExemptionsCount: number;
  clubSubsidizedExemptionCostTL: number;
  unfilledGuaranteeCostTL: number;
  sharedPoolCostTL: number;
  perPayingMemberSharedSurchargeTL: number;
  effectivePerMemberTotalTL: number;
}

export function calculateMeetingCostSharingAndExemptions(params: {
  unitKuverCostTL: number;
  billableKuverCount: number;
  attendingPayingMembersCount: number;
  payingCompanionsCount: number;
  exemptSpeakerCount: number;
  exemptHonoraryOrYouthCount: number;
}): MeetingCostSharingResult {
  const unitCost = Math.max(0, params.unitKuverCostTL);
  const billable = Math.max(0, params.billableKuverCount);
  const payingMembers = Math.max(0, params.attendingPayingMembersCount);
  const payingCompanions = Math.max(0, params.payingCompanionsCount);
  const totalExemptionsCount =
    Math.max(0, params.exemptSpeakerCount) +
    Math.max(0, params.exemptHonoraryOrYouthCount);

  const totalHotelInvoiceTL = billable * unitCost;
  const clubSubsidizedExemptionCostTL = totalExemptionsCount * unitCost;
  const occupiedSeats =
    payingMembers + payingCompanions + totalExemptionsCount;
  const unfilledSeats = Math.max(0, billable - occupiedSeats);
  const unfilledGuaranteeCostTL = unfilledSeats * unitCost;
  const sharedPoolCostTL =
    clubSubsidizedExemptionCostTL + unfilledGuaranteeCostTL;
  const perPayingMemberSharedSurchargeTL =
    payingMembers > 0 ? Math.round(sharedPoolCostTL / payingMembers) : 0;
  const effectivePerMemberTotalTL =
    unitCost + perPayingMemberSharedSurchargeTL;

  return {
    unitKuverCostTL: unitCost,
    billableKuverCount: billable,
    attendingPayingMembersCount: payingMembers,
    payingCompanionsCount: payingCompanions,
    totalHotelInvoiceTL,
    totalExemptionsCount,
    clubSubsidizedExemptionCostTL,
    unfilledGuaranteeCostTL,
    sharedPoolCostTL,
    perPayingMemberSharedSurchargeTL,
    effectivePerMemberTotalTL,
  };
}

/**
 * Derives live per-capita meeting cost sharing directly from the active meeting's KuverSummaryResult
 * (computed from real member RSVPs) and hotel minimum guarantee (#29, #42).
 */
export function deriveLiveMeetingCostSharing(params: {
  kuverSummary: KuverSummaryResult;
  unitKuverCostTL: number;
  minHotelGuarantee: number;
  exemptSpeakerCount: number;
  exemptHonoraryOrYouthCount: number;
}): MeetingCostSharingResult {
  const safeSpeakerExemptions = Math.max(0, params.exemptSpeakerCount);
  const safeMemberExemptions = Math.min(
    params.kuverSummary.attendingMembers,
    Math.max(0, params.exemptHonoraryOrYouthCount)
  );
  const attendingPayingMembersCount = Math.max(
    0,
    params.kuverSummary.attendingMembers - safeMemberExemptions
  );
  const payingCompanionsCount =
    params.kuverSummary.spousesCount + params.kuverSummary.guestsCount;
  const actualHeadcount =
    params.kuverSummary.totalKuver + safeSpeakerExemptions;
  const billableKuverCount = Math.max(
    Math.max(0, params.minHotelGuarantee),
    actualHeadcount
  );

  return calculateMeetingCostSharingAndExemptions({
    unitKuverCostTL: params.unitKuverCostTL,
    billableKuverCount,
    attendingPayingMembersCount,
    payingCompanionsCount,
    exemptSpeakerCount: safeSpeakerExemptions,
    exemptHonoraryOrYouthCount: safeMemberExemptions,
  });
}

/**
 * Issue #46 — Gönüllü, Görev ve Vardiya Yönetimi (Volunteer Task & Shift Scheduling)
 */
export interface VolunteerShiftSlot {
  id: string;
  eventTitle: string;
  taskTitle: string;
  shiftWindow: string;
  location: string;
  requiredCount: number;
  assignedVolunteers: string[];
}

export const SYNTHETIC_VOLUNTEER_SHIFTS: VolunteerShiftSlot[] = [
  {
    id: 'shift-galatart-1',
    eventTitle: 'GALATART 2026 Çağdaş Sanat Sergisi',
    taskTitle: 'VIP Protokol Karşılama & Katalog Kayıt Masası',
    shiftWindow: '10:00 – 13:30 (Sabah Vardiyası)',
    location: 'Tophane-i Amire Kültür ve Sanat Merkezi',
    requiredCount: 3,
    assignedVolunteers: ['Rtn. Rifat Akın', 'Rtn. Av. Nazlı Denizmen'],
  },
  {
    id: 'shift-kermes-1',
    eventTitle: 'Galata Bahar Kermesi & Dayanışma Pazarı',
    taskTitle: 'Stant Tahsis Koordinasyonu & Bağış Makbuzu Masası',
    shiftWindow: '13:30 – 17:00 (Öğleden Sonra Vardiyası)',
    location: 'Galata Rum Okulu Avlusu',
    requiredCount: 4,
    assignedVolunteers: [
      'Rtn. YMM Levent Soydan',
      'Rtn. Zeynep Korkmaz',
      'Rtn. Deniz Arslan',
      'Rtn. Dr. Kerem Aydın',
    ],
  },
  {
    id: 'shift-ryla-1',
    eventTitle: 'UR 2420. Bölge RYLA Gençlik Liderlik Kampı',
    taskTitle: 'Bursiyer Ulaşım Lojistiği & Atölye Mentorluğu',
    shiftWindow: '09:00 – 14:00 (Tam Gün Saha Görevi)',
    location: 'Sarıyer Boğaziçi Gençlik Kampüsü',
    requiredCount: 3,
    assignedVolunteers: ['Rtn. Mimar Emre Karaca', 'Rtn. Rifat Akın'],
  },
];

export function calculateVolunteerShiftMetrics(shifts: VolunteerShiftSlot[]): {
  totalRequired: number;
  totalAssigned: number;
  openSlotsCount: number;
  fillRatePercent: number;
} {
  const totalRequired = shifts.reduce(
    (acc, s) => acc + Math.max(0, s.requiredCount),
    0
  );
  const totalAssigned = shifts.reduce(
    (acc, s) => acc + s.assignedVolunteers.length,
    0
  );
  const openSlotsCount = Math.max(0, totalRequired - totalAssigned);
  const fillRatePercent =
    totalRequired > 0
      ? Math.min(100, Math.round((totalAssigned / totalRequired) * 100))
      : 100;

  return {
    totalRequired,
    totalAssigned,
    openSlotsCount,
    fillRatePercent,
  };
}

/**
 * Toggles a member's volunteer shift assignment while strictly enforcing shift capacity (`requiredCount`).
 * If a shift is already at full capacity (`assignedVolunteers.length >= requiredCount`), new volunteers
 * cannot be added, while already-assigned volunteers can always leave their shift (#46).
 */
export function toggleVolunteerShiftAssignment(
  shifts: VolunteerShiftSlot[],
  shiftId: string,
  memberName: string
): VolunteerShiftSlot[] {
  const cleanMember = memberName.trim();
  if (!cleanMember) return shifts;

  return shifts.map((slot) => {
    if (slot.id !== shiftId) return slot;
    const exists = slot.assignedVolunteers.includes(cleanMember);
    if (exists) {
      return {
        ...slot,
        assignedVolunteers: slot.assignedVolunteers.filter(
          (v) => v !== cleanMember
        ),
      };
    }
    // Enforce strict shift capacity: reject new signups when slot is already full
    if (slot.assignedVolunteers.length >= Math.max(0, slot.requiredCount)) {
      return slot;
    }
    return {
      ...slot,
      assignedVolunteers: [...slot.assignedVolunteers, cleanMember],
    };
  });
}

/**
 * Issue #51 — Kermes, GALATART ve RYLA Özel Modülleri (Specialized Project Modules with Strict Accounting Separation)
 * Strictly separates Gross Revenue, Program/Artist/Camp Expenses, and Net Club Scholarship/Service Fund.
 */
export interface SpecializedModuleData {
  kermes: {
    totalStalls: number;
    allocatedStalls: number;
    stallSponsorFeeTL: number;
    donatedProductItems: number;
    expectedStallRevenueTL: number;
    operatingExpenseTL: number;
    netServiceFundTL: number;
  };
  galatart: {
    curatedArtworksCount: number;
    soldArtworksCount: number;
    grossArtworkSalesTL: number;
    clubCommissionPercent: number;
    artistPayoutTL: number;
    exhibitionExpenseTL: number;
    netScholarshipFundTL: number;
  };
  ryla: {
    totalQuota: number;
    approvedScholars: number;
    waitlistedCandidates: number;
    sponsorCostPerScholarTL: number;
    grossSponsorContributionsTL: number;
    totalSponsoredBudgetTL: number;
    reservedYouthFundSurplusTL: number;
  };
}

export const SYNTHETIC_SPECIALIZED_MODULES: SpecializedModuleData = {
  kermes: {
    totalStalls: 24,
    allocatedStalls: 20,
    stallSponsorFeeTL: 12500,
    donatedProductItems: 340,
    expectedStallRevenueTL: 250000,
    operatingExpenseTL: 45000,
    netServiceFundTL: 205000,
  },
  galatart: {
    curatedArtworksCount: 42,
    soldArtworksCount: 29,
    grossArtworkSalesTL: 1200000,
    clubCommissionPercent: 40,
    artistPayoutTL: 720000,
    exhibitionExpenseTL: 60000,
    netScholarshipFundTL: 420000,
  },
  ryla: {
    totalQuota: 18,
    approvedScholars: 15,
    waitlistedCandidates: 4,
    sponsorCostPerScholarTL: 9500,
    grossSponsorContributionsTL: 171000,
    totalSponsoredBudgetTL: 142500,
    reservedYouthFundSurplusTL: 28500,
  },
};

export function calculateSpecializedModulesSummary(
  data: SpecializedModuleData = SYNTHETIC_SPECIALIZED_MODULES
): {
  kermesFillPercent: number;
  kermesGrossRevenueTL: number;
  kermesOperatingExpenseTL: number;
  kermesNetSurplusTL: number;
  galatartGrossSalesTL: number;
  galatartGrossCommissionTL: number;
  galatartExhibitionExpenseTL: number;
  galatartNetCommissionTL: number;
  rylaFillPercent: number;
  rylaGrossSponsorRevenueTL: number;
  rylaProgramExpenseBudgetTL: number;
  rylaNetReserveTL: number;
  totalGrossRevenueTL: number;
  totalProgramExpensesTL: number;
  combinedNetImpactFundTL: number;
} {
  const kermesFillPercent =
    data.kermes.totalStalls > 0
      ? Math.round(
          (data.kermes.allocatedStalls / data.kermes.totalStalls) * 100
        )
      : 0;
  const kermesGrossRevenueTL = Math.max(
    0,
    data.kermes.allocatedStalls * data.kermes.stallSponsorFeeTL
  );
  const kermesOperatingExpenseTL = Math.max(
    0,
    data.kermes.operatingExpenseTL ?? 0
  );
  const kermesNetSurplusTL = Math.max(
    0,
    kermesGrossRevenueTL - kermesOperatingExpenseTL
  );

  const galatartGrossSalesTL = Math.max(0, data.galatart.grossArtworkSalesTL);
  const galatartGrossCommissionTL = Math.round(
    (galatartGrossSalesTL * data.galatart.clubCommissionPercent) / 100
  );
  const galatartArtistPayoutTL = Math.max(
    0,
    galatartGrossSalesTL - galatartGrossCommissionTL
  );
  const galatartExhibitionExpenseTL = Math.max(
    0,
    data.galatart.exhibitionExpenseTL ?? 0
  );
  const galatartNetCommissionTL = Math.max(
    0,
    galatartGrossCommissionTL - galatartExhibitionExpenseTL
  );

  const rylaFillPercent =
    data.ryla.totalQuota > 0
      ? Math.round((data.ryla.approvedScholars / data.ryla.totalQuota) * 100)
      : 0;
  const rylaGrossSponsorRevenueTL = Math.max(
    0,
    data.ryla.grossSponsorContributionsTL ??
      data.ryla.totalQuota * data.ryla.sponsorCostPerScholarTL
  );
  const rylaProgramExpenseBudgetTL = Math.max(
    0,
    data.ryla.approvedScholars * data.ryla.sponsorCostPerScholarTL
  );
  const rylaNetReserveTL = Math.max(
    0,
    rylaGrossSponsorRevenueTL - rylaProgramExpenseBudgetTL
  );

  const totalGrossRevenueTL =
    kermesGrossRevenueTL + galatartGrossSalesTL + rylaGrossSponsorRevenueTL;
  const totalProgramExpensesTL =
    kermesOperatingExpenseTL +
    galatartArtistPayoutTL +
    galatartExhibitionExpenseTL +
    rylaProgramExpenseBudgetTL;
  const combinedNetImpactFundTL =
    kermesNetSurplusTL + galatartNetCommissionTL + rylaNetReserveTL;

  return {
    kermesFillPercent,
    kermesGrossRevenueTL,
    kermesOperatingExpenseTL,
    kermesNetSurplusTL,
    galatartGrossSalesTL,
    galatartGrossCommissionTL,
    galatartExhibitionExpenseTL,
    galatartNetCommissionTL,
    rylaFillPercent,
    rylaGrossSponsorRevenueTL,
    rylaProgramExpenseBudgetTL,
    rylaNetReserveTL,
    totalGrossRevenueTL,
    totalProgramExpensesTL,
    combinedNetImpactFundTL,
  };
}

/**
 * Resolves a legacy make-up record's `memberId` ONLY when the member roster contains
 * a single unambiguous member with that exact normalized name (#35).
 * If two or more members share the same name, returns undefined so legacy records never cross-contaminate.
 */
export function resolveUnambiguousLegacyMemberId(
  memberName: string,
  allMembers?: Pick<RotaryMember, 'id' | 'fullName'>[]
): string | undefined {
  if (!Array.isArray(allMembers) || allMembers.length === 0) return undefined;
  const normalizeName = (name: string) =>
    String(name || '')
      .toLowerCase()
      .replace(/^rtn\.?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  const targetKey = normalizeName(memberName);
  if (!targetKey) return undefined;
  const matches = allMembers.filter(
    (m) => normalizeName(m.fullName) === targetKey
  );
  return matches.length === 1 ? matches[0].id : undefined;
}

/**
 * Calculates extra approved make-up count strictly bound to the target member (#35).
 * Always binds via immutable `memberId`. Legacy records without `memberId` are only matched
 * if `allMembers` proves the name is 100% unique in the club roster (or when no roster collision exists).
 */
export function calculateMemberExtraMakeups(
  submissions: MakeupSubmission[],
  initialSubmissions: MakeupSubmission[],
  memberId: string,
  memberFullName: string,
  allMembers?: Pick<RotaryMember, 'id' | 'fullName'>[]
): number {
  const normalizeName = (name: string) =>
    String(name || '')
      .toLowerCase()
      .replace(/^rtn\.?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

  const targetNameKey = normalizeName(memberFullName);

  // Check if any other submission or roster member shares the same normalized name with a different memberId
  const allKnownIdsForName = new Set<string>();
  if (Array.isArray(allMembers)) {
    for (const m of allMembers) {
      if (normalizeName(m.fullName) === targetNameKey) {
        allKnownIdsForName.add(m.id);
      }
    }
  }
  for (const s of [...submissions, ...initialSubmissions]) {
    if (s.memberId && normalizeName(s.memberName) === targetNameKey) {
      allKnownIdsForName.add(s.memberId);
    }
  }
  const isNameAmbiguous =
    allKnownIdsForName.size > 1 ||
    (allKnownIdsForName.size === 1 && !allKnownIdsForName.has(memberId));

  const belongsToMember = (m: MakeupSubmission): boolean => {
    if (m.memberId) {
      return m.memberId === memberId;
    }
    if (isNameAmbiguous) {
      return false;
    }
    return normalizeName(m.memberName) === targetNameKey;
  };

  const currentApproved = submissions.filter(
    (m) => m.status === 'Onaylandı' && belongsToMember(m)
  ).length;
  const baselineApproved = initialSubmissions.filter(
    (m) => m.status === 'Onaylandı' && belongsToMember(m)
  ).length;

  return Math.max(0, currentApproved - baselineApproved);
}

/**
 * Generates a normalized activity key to prevent duplicate make-up credit for the same activity (#35).
 */
export function buildMakeupActivityKey(input: {
  memberId: string;
  date: string;
  targetClubOrEvent: string;
  activityType: string;
}): string {
  const norm = (val: string) =>
    String(val || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(input.memberId)}::${norm(input.date)}::${norm(
    input.targetClubOrEvent
  )}::${norm(input.activityType)}`;
}

/**
 * Checks whether a make-up submission duplicates an existing non-rejected make-up record for the same member (#35).
 */
export function hasDuplicateMakeupActivity(
  existingSubmissions: MakeupSubmission[],
  candidate: {
    id?: string;
    memberId: string;
    date: string;
    targetClubOrEvent: string;
    activityType: string;
  }
): boolean {
  const candidateKey = buildMakeupActivityKey(candidate);
  return existingSubmissions.some((ex) => {
    if (candidate.id && ex.id === candidate.id) return false;
    if (ex.status === 'Reddedildi') return false;
    if (!ex.memberId) return false;
    return (
      buildMakeupActivityKey({
        memberId: ex.memberId,
        date: ex.date,
        targetClubOrEvent: ex.targetClubOrEvent,
        activityType: ex.activityType,
      }) === candidateKey
    );
  });
}

/**
 * Checks whether an incoming batch of make-up submissions contains two or more active/non-rejected records
 * for the same member and same activity (#35 intra-batch duplicate prevention).
 */
export function hasDuplicateInMakeupBatch(
  batch: Array<{
    id?: string;
    memberId?: string;
    memberName?: string;
    date: string;
    targetClubOrEvent: string;
    activityType: string;
    status?: string;
  }>,
  allMembers?: RotaryMember[]
): boolean {
  const seenKeys = new Set<string>();
  for (const item of batch) {
    if (item.status === 'Reddedildi') continue;
    const effectiveMemberId =
      item.memberId ||
      (item.memberName
        ? resolveUnambiguousLegacyMemberId(item.memberName, allMembers)
        : undefined);
    if (!effectiveMemberId) continue;
    const key = buildMakeupActivityKey({
      memberId: effectiveMemberId,
      date: item.date || '',
      targetClubOrEvent: item.targetClubOrEvent || '',
      activityType: item.activityType || 'Kulüp Ziyareti',
    });
    if (seenKeys.has(key)) {
      return true;
    }
    seenKeys.add(key);
  }
  return false;
}

/**
 * Computes the current hour (0-23) in Europe/Istanbul timezone from a UTC epoch timestamp (#32).
 */
export function getIstanbulHourFromEpochMs(epochMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  const hourPart = parts.find((p) => p.type === 'hour');
  return hourPart
    ? parseInt(hourPart.value, 10)
    : new Date(epochMs).getUTCHours();
}

export const SERVER_LCV_REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Issue #32: Evaluates an LCV reminder batch for a specific meeting with:
 * - Quiet hours guard (22:00 - 08:00 Europe/Istanbul time)
 * - Per-meeting RSVP targeting (`member.meetingRsvps[String(meetingNo)]`)
 * - Dynamic club & venue message template (`clubName`, `meetingVenue`)
 * - Member opt-out respect (`reminderOptOut === true`)
 * - Server policy cooldown / duplicate prevention per `(meetingNo, memberId)` within 6 hours
 * - Honest delivery status (`Taslak Kuyrukta (Dış Gönderim Kapalı)` unless external dispatch + trusted provider receipt exist)
 */
export function evaluateLcvReminderBatch(params: {
  meetingNo: number;
  selectedMeetingNo?: number;
  meetingDate: string;
  clubName?: string;
  meetingVenue?: string;
  members: RotaryMember[];
  existingQueue: LcvReminderQueueItem[];
  actorName: string;
  currentHourTR?: number;
  nowEpochMs?: number;
  cooldownWindowMs?: number;
  outboundDispatchEnabled?: boolean;
  providerReceiptsByMemberId?: Record<string, string>;
}): {
  isQuietHours: boolean;
  currentHourTR: number;
  pendingMembersCount: number;
  queuedItems: LcvReminderQueueItem[];
  skippedOptOutMembers: string[];
  skippedCooldownMembers: string[];
} {
  const nowMs =
    typeof params.nowEpochMs === 'number' ? params.nowEpochMs : Date.now();
  const hour =
    typeof params.currentHourTR === 'number'
      ? params.currentHourTR
      : getIstanbulHourFromEpochMs(nowMs);
  const cooldownMs =
    typeof params.cooldownWindowMs === 'number'
      ? params.cooldownWindowMs
      : SERVER_LCV_REMINDER_COOLDOWN_MS;
  const isQuietHours = hour >= 22 || hour < 8;

  const meetingKey = String(params.meetingNo);
  const pendingMembers = params.members.filter((m) => {
    const lifecycle = m.membershipStatus || 'Aktif';
    if (
      lifecycle === 'İstifa / Ayrıldı' ||
      lifecycle === 'Nakil' ||
      lifecycle === 'Aday'
    ) {
      return false;
    }
    const specificRsvp = m.meetingRsvps?.[meetingKey];
    if (specificRsvp !== undefined) {
      return specificRsvp === 'pending';
    }
    if (
      typeof params.selectedMeetingNo === 'number' &&
      params.selectedMeetingNo !== params.meetingNo
    ) {
      return true;
    }
    return m.rsvpStatus === 'pending';
  });

  if (isQuietHours) {
    return {
      isQuietHours: true,
      currentHourTR: hour,
      pendingMembersCount: pendingMembers.length,
      queuedItems: [],
      skippedOptOutMembers: [],
      skippedCooldownMembers: [],
    };
  }

  const resolvedClubName = (params.clubName || 'Galata Rotary Kulübü').trim();
  const resolvedVenue = (params.meetingVenue || 'Pera Palace Hotel').trim();

  const queuedItems: LcvReminderQueueItem[] = [];
  const skippedOptOutMembers: string[] = [];
  const skippedCooldownMembers: string[] = [];

  for (const member of pendingMembers) {
    if (member.reminderOptOut) {
      skippedOptOutMembers.push(member.fullName);
      continue;
    }

    const recentExisting = params.existingQueue.find(
      (q) =>
        q.meetingNo === params.meetingNo &&
        q.memberId === member.id &&
        (q.status === 'Taslak Kuyrukta (Dış Gönderim Kapalı)' ||
          q.status === 'Sağlayıcı Kanıtı ile İletildi') &&
        nowMs - (q.createdAtEpochMs || 0) < cooldownMs
    );
    if (recentExisting) {
      skippedCooldownMembers.push(member.fullName);
      continue;
    }

    const channel: ReminderChannel =
      member.preferredReminderChannel || 'WhatsApp Taslağı';
    const providerReceipt = params.providerReceiptsByMemberId?.[member.id];
    const isVerifiedDelivered =
      Boolean(params.outboundDispatchEnabled) &&
      typeof providerReceipt === 'string' &&
      providerReceipt.trim().length > 0;

    queuedItems.push({
      id: `rem-${params.meetingNo}-${member.id}-${nowMs}`,
      meetingNo: params.meetingNo,
      memberId: member.id,
      memberName: member.fullName,
      channel,
      draftMessage: `Sayın Rtn. ${member.fullName}, ${resolvedClubName} #${params.meetingNo} (${params.meetingDate}) toplantısı ${resolvedVenue} kuver bildirimi için LCV yanıtınızı rica ederiz.`,
      status: isVerifiedDelivered
        ? 'Sağlayıcı Kanıtı ile İletildi'
        : 'Taslak Kuyrukta (Dış Gönderim Kapalı)',
      createdAt: '23 Ekim 2026 · Şimdi',
      createdAtEpochMs: nowMs,
      createdBy: params.actorName,
      ...(isVerifiedDelivered
        ? { providerReceiptId: providerReceipt!.trim() }
        : {}),
    });
  }

  return {
    isQuietHours: false,
    currentHourTR: hour,
    pendingMembersCount: pendingMembers.length,
    queuedItems,
    skippedOptOutMembers,
    skippedCooldownMembers,
  };
}

/**
 * Issue #36: Masks a guest Rotarian's full name for KVKK data minimization on unauthenticated public verification responses.
 * Example: "Rtn. Hakan Çelik" -> "Rtn. H*** Ç***"
 */
export function maskGuestNameForPublicVerification(fullName: string): string {
  const raw = String(fullName || '').trim();
  if (!raw) return '***';
  const hasRtnPrefix = /^rtn\.?\s+/i.test(raw);
  const body = raw.replace(/^rtn\.?\s+/i, '').trim();
  const maskedParts = body
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0)}***`);
  return `${hasRtnPrefix ? 'Rtn. ' : ''}${maskedParts.join(' ')}`;
}

const TURKISH_MONTH_MAP: Record<string, number> = {
  ocak: 0,
  şubat: 1,
  subat: 1,
  mart: 2,
  nisan: 3,
  mayıs: 4,
  mayis: 4,
  haziran: 5,
  temmuz: 6,
  ağustos: 7,
  agustos: 7,
  eylül: 8,
  eylul: 8,
  ekim: 9,
  kasım: 10,
  kasim: 10,
  aralık: 11,
  aralik: 11,
};

/**
 * Deterministic date parser supporting ISO-8601 ("2026-10-20"), dot/slash ("20.10.2026"),
 * and Turkish calendar labels ("20 Ekim 2026 Salı", "13 Ekim 2026 · 19:30").
 * Normalizes to UTC midnight (00:00:00Z) for consistent date-window comparisons (#25, #34).
 */
export function parseRotaryDateToEpochMs(dateStr?: string): number | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const raw = dateStr.trim();
  if (!raw) return null;

  // 1. ISO YYYY-MM-DD prefix
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]) - 1;
    const d = Number(isoMatch[3]);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return Date.UTC(y, m, d);
    }
  }

  // 2. DD.MM.YYYY or DD/MM/YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]) - 1;
    const y = Number(dmyMatch[3]);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return Date.UTC(y, m, d);
    }
  }

  // 3. Turkish "<day> <MonthName> <year>" anywhere in string
  const trMatch = raw
    .toLocaleLowerCase('tr-TR')
    .match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})/i);
  if (trMatch) {
    const d = Number(trMatch[1]);
    const monthName = trMatch[2].toLocaleLowerCase('tr-TR');
    const y = Number(trMatch[3]);
    const m = TURKISH_MONTH_MAP[monthName];
    if (m !== undefined && d >= 1 && d <= 31) {
      return Date.UTC(y, m, d);
    }
  }

  const fallback = Date.parse(raw);
  if (!Number.isNaN(fallback)) {
    const dt = new Date(fallback);
    return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  }
  return null;
}

export const DEFAULT_CLUB_ATTENDANCE_POLICY: ClubAttendancePolicy = {
  policyVersion: 'UR-2420-2026.1',
  minimumAttendancePercent: 60,
  termStartDate: '2026-07-01',
  termEndDate: '2027-06-30',
  maxMakeupsPerTerm: 12,
};

export type AttendanceCalculationStatus =
  | 'EVALUATED'
  | 'INSUFFICIENT_DATA'
  | 'EXEMPT_ALL_LEAVE'
  | 'EXEMPT_HONORARY';

export interface TermAttendanceMetrics {
  memberId: string;
  policyVersion: string;
  minimumRequiredPercent: number;
  calculationStatus: AttendanceCalculationStatus;
  isApplicable: boolean;
  heldMeetingsCount: number;
  futureScheduledExcludedCount: number;
  cancelledExcludedCount: number;
  preJoinExcludedMeetingsCount: number;
  outOfTermExcludedMeetingsCount: number;
  exemptMeetingsCount: number;
  obligatoryMeetingsCount: number;
  directAttendedMeetingsCount: number;
  approvedMakeupsCount: number;
  approvedMakeupsApplied: number;
  creditedMeetingsCount: number;
  attendancePercentage: number | null;
  meetsClubAttendancePolicy: boolean | null;
  meetsRotary60PercentRule: boolean;
}

/**
 * Checks whether a specific meeting date (`meetingDateMs`) falls within any approved
 * leave-of-absence (LOA) window for the member (#25, #34).
 */
export function isMeetingDateCoveredByMemberLeave(
  member: Pick<
    RotaryMember,
    'membershipStatus' | 'leaveStartDate' | 'leaveEndDate' | 'lifecycleHistory'
  >,
  meetingDateMs: number | null
): boolean {
  if (meetingDateMs === null) return false;

  const checkWindow = (startStr?: string, endStr?: string): boolean => {
    const startMs = parseRotaryDateToEpochMs(startStr);
    const endMs = parseRotaryDateToEpochMs(endStr);
    if (startMs === null || endMs === null || startMs > endMs) return false;
    return meetingDateMs >= startMs && meetingDateMs <= endMs;
  };

  if (checkWindow(member.leaveStartDate, member.leaveEndDate)) {
    return true;
  }

  if (Array.isArray(member.lifecycleHistory)) {
    for (const h of member.lifecycleHistory) {
      if (
        h.toStatus === 'İzinli (Muaf)' &&
        checkWindow(h.leaveStartDate, h.leaveEndDate)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Issue #27, #28, #34: Real meeting-by-meeting term attendance calculation.
 * - Never counts future scheduled `'Aktif'` or `'Planlandı'` meetings with 0 check-ins as held.
 * - Never fabricates 100% attendance when 0 meetings were held (`calculationStatus: 'INSUFFICIENT_DATA'`, `attendancePercentage: null`).
 * - Binds leave-of-absence (`İzinli (Muaf)`) exemptions strictly to the meeting date falling within `[leaveStartDate, leaveEndDate]`.
 * - Enforces term window (`termStartDate`..`termEndDate`), member join date (`joinDate` / `joinYear`), make-up term cap (`maxMakeupsPerTerm`), and configurable club policy version (`policyVersion`, `minimumAttendancePercent`).
 */
export function calculateTermAttendanceMetrics(params: {
  member: Pick<
    RotaryMember,
    | 'id'
    | 'fullName'
    | 'membershipStatus'
    | 'attendancePercent'
    | 'joinYear'
    | 'joinDate'
    | 'leaveStartDate'
    | 'leaveEndDate'
    | 'lifecycleHistory'
  >;
  meetings: WeeklyMeeting[];
  meetingAttendances: Record<string, string[]>;
  makeupSubmissions: MakeupSubmission[];
  allMembers?: Pick<RotaryMember, 'id' | 'fullName'>[];
  policy?: Partial<ClubAttendancePolicy>;
  evaluationDate?: string;
}): TermAttendanceMetrics {
  const { member, meetings, meetingAttendances, makeupSubmissions, allMembers } =
    params;

  const effectivePolicy: ClubAttendancePolicy = {
    ...DEFAULT_CLUB_ATTENDANCE_POLICY,
    ...(params.policy || {}),
  };
  const termStartMs = parseRotaryDateToEpochMs(effectivePolicy.termStartDate);
  const termEndMs = parseRotaryDateToEpochMs(effectivePolicy.termEndDate);
  const evaluationMs = parseRotaryDateToEpochMs(params.evaluationDate);
  const memberJoinMs = parseRotaryDateToEpochMs(member.joinDate);

  let futureScheduledExcludedCount = 0;
  let cancelledExcludedCount = 0;
  let preJoinExcludedMeetingsCount = 0;
  let outOfTermExcludedMeetingsCount = 0;
  const heldMeetings: Array<{ meeting: WeeklyMeeting; meetingDateMs: number | null }> = [];

  for (const m of meetings) {
    if (m.status === 'İptal Edildi') {
      cancelledExcludedCount += 1;
      continue;
    }

    const meetingDateMs = parseRotaryDateToEpochMs(m.date);
    if (
      meetingDateMs !== null &&
      ((termStartMs !== null && meetingDateMs < termStartMs) ||
        (termEndMs !== null && meetingDateMs > termEndMs))
    ) {
      outOfTermExcludedMeetingsCount += 1;
      continue;
    }

    const attendees = meetingAttendances[String(m.meetingNo)] || [];
    const hasOccurred =
      m.isPast === true ||
      m.status === 'Tamamlandı' ||
      attendees.length > 0;

    // Issue #34 Fix: Never count a future scheduled 'Aktif' or 'Planlandı' meeting as held!
    if (
      !hasOccurred ||
      (evaluationMs !== null &&
        meetingDateMs !== null &&
        meetingDateMs > evaluationMs &&
        attendees.length === 0 &&
        m.status !== 'Tamamlandı')
    ) {
      futureScheduledExcludedCount += 1;
      continue;
    }

    // Exclude meetings held before the member joined the club (#34)
    if (
      (memberJoinMs !== null &&
        meetingDateMs !== null &&
        meetingDateMs < memberJoinMs) ||
      (memberJoinMs === null &&
        typeof member.joinYear === 'number' &&
        meetingDateMs !== null &&
        new Date(meetingDateMs).getUTCFullYear() < member.joinYear)
    ) {
      preJoinExcludedMeetingsCount += 1;
      continue;
    }

    heldMeetings.push({ meeting: m, meetingDateMs });
  }

  const heldMeetingsCount = heldMeetings.length;

  if (member.membershipStatus === 'Onur Üyesi') {
    return {
      memberId: member.id,
      policyVersion: effectivePolicy.policyVersion,
      minimumRequiredPercent: effectivePolicy.minimumAttendancePercent,
      calculationStatus: 'EXEMPT_HONORARY',
      isApplicable: false,
      heldMeetingsCount,
      futureScheduledExcludedCount,
      cancelledExcludedCount,
      preJoinExcludedMeetingsCount,
      outOfTermExcludedMeetingsCount,
      exemptMeetingsCount: heldMeetingsCount,
      obligatoryMeetingsCount: 0,
      directAttendedMeetingsCount: 0,
      approvedMakeupsCount: 0,
      approvedMakeupsApplied: 0,
      creditedMeetingsCount: 0,
      attendancePercentage: null,
      meetsClubAttendancePolicy: null,
      meetsRotary60PercentRule: true,
    };
  }

  // Issue #34 Fix: When 0 meetings have been held, do NOT fabricate 100% attendance!
  if (heldMeetingsCount === 0) {
    return {
      memberId: member.id,
      policyVersion: effectivePolicy.policyVersion,
      minimumRequiredPercent: effectivePolicy.minimumAttendancePercent,
      calculationStatus: 'INSUFFICIENT_DATA',
      isApplicable: false,
      heldMeetingsCount: 0,
      futureScheduledExcludedCount,
      cancelledExcludedCount,
      preJoinExcludedMeetingsCount,
      outOfTermExcludedMeetingsCount,
      exemptMeetingsCount: 0,
      obligatoryMeetingsCount: 0,
      directAttendedMeetingsCount: 0,
      approvedMakeupsCount: 0,
      approvedMakeupsApplied: 0,
      creditedMeetingsCount: 0,
      attendancePercentage: null,
      meetsClubAttendancePolicy: null,
      meetsRotary60PercentRule: false,
    };
  }

  let directAttendedMeetingsCount = 0;
  let exemptMeetingsCount = 0;

  for (const { meeting: m, meetingDateMs } of heldMeetings) {
    const attendees = meetingAttendances[String(m.meetingNo)] || [];
    if (attendees.includes(member.id)) {
      directAttendedMeetingsCount += 1;
    } else if (isMeetingDateCoveredByMemberLeave(member, meetingDateMs)) {
      exemptMeetingsCount += 1;
    }
  }

  const obligatoryMeetingsCount = Math.max(
    0,
    heldMeetingsCount - exemptMeetingsCount
  );

  if (obligatoryMeetingsCount === 0) {
    return {
      memberId: member.id,
      policyVersion: effectivePolicy.policyVersion,
      minimumRequiredPercent: effectivePolicy.minimumAttendancePercent,
      calculationStatus: 'EXEMPT_ALL_LEAVE',
      isApplicable: false,
      heldMeetingsCount,
      futureScheduledExcludedCount,
      cancelledExcludedCount,
      preJoinExcludedMeetingsCount,
      outOfTermExcludedMeetingsCount,
      exemptMeetingsCount,
      obligatoryMeetingsCount: 0,
      directAttendedMeetingsCount,
      approvedMakeupsCount: 0,
      approvedMakeupsApplied: 0,
      creditedMeetingsCount: directAttendedMeetingsCount,
      attendancePercentage: null,
      meetsClubAttendancePolicy: null,
      meetsRotary60PercentRule: true,
    };
  }

  // Deduplicate approved make-up submissions belonging to this member within the active term window
  const seenActivityKeys = new Set<string>();
  let uniqueApprovedMakeups = 0;
  for (const sub of makeupSubmissions) {
    if (sub.status !== 'Onaylandı') continue;
    const effectiveMemberId =
      sub.memberId ||
      resolveUnambiguousLegacyMemberId(sub.memberName, allMembers);
    if (effectiveMemberId !== member.id) continue;

    const subDateMs = parseRotaryDateToEpochMs(sub.date);
    if (
      subDateMs !== null &&
      ((termStartMs !== null && subDateMs < termStartMs) ||
        (termEndMs !== null && subDateMs > termEndMs))
    ) {
      continue;
    }

    const key = buildMakeupActivityKey({
      memberId: member.id,
      date: sub.date,
      targetClubOrEvent: sub.targetClubOrEvent,
      activityType: sub.activityType,
    });
    if (seenActivityKeys.has(key)) continue;
    seenActivityKeys.add(key);
    uniqueApprovedMakeups += 1;
  }

  const maxMakeupsCap =
    typeof effectivePolicy.maxMakeupsPerTerm === 'number' &&
    effectivePolicy.maxMakeupsPerTerm >= 0
      ? effectivePolicy.maxMakeupsPerTerm
      : uniqueApprovedMakeups;
  const cappedMakeups = Math.min(uniqueApprovedMakeups, maxMakeupsCap);

  const missedMeetingsCount = Math.max(
    0,
    obligatoryMeetingsCount - directAttendedMeetingsCount
  );
  const approvedMakeupsApplied = Math.min(missedMeetingsCount, cappedMakeups);
  const creditedMeetingsCount =
    directAttendedMeetingsCount + approvedMakeupsApplied;

  const attendancePercentage = Math.min(
    100,
    Math.round((creditedMeetingsCount / obligatoryMeetingsCount) * 100)
  );
  const meetsPolicy =
    attendancePercentage >= effectivePolicy.minimumAttendancePercent;

  return {
    memberId: member.id,
    policyVersion: effectivePolicy.policyVersion,
    minimumRequiredPercent: effectivePolicy.minimumAttendancePercent,
    calculationStatus: 'EVALUATED',
    isApplicable: true,
    heldMeetingsCount,
    futureScheduledExcludedCount,
    cancelledExcludedCount,
    preJoinExcludedMeetingsCount,
    outOfTermExcludedMeetingsCount,
    exemptMeetingsCount,
    obligatoryMeetingsCount,
    directAttendedMeetingsCount,
    approvedMakeupsCount: uniqueApprovedMakeups,
    approvedMakeupsApplied,
    creditedMeetingsCount,
    attendancePercentage,
    meetsClubAttendancePolicy: meetsPolicy,
    meetsRotary60PercentRule: meetsPolicy,
  };
}

/**
 * Issue #24-#26: Validates a member lifecycle status transition (Candidate -> Active -> Leave -> Honorary -> Resigned/Transferred).
 * Strictly blocks exit/resignation/transfer when the member has unsettled financial obligations unless a
 * server-verified, club-scoped, member-bound, unconsumed, non-expired Board Debt Waiver Resolution (`DEBT_WAIVER_ON_EXIT`)
 * exists in `boardResolutions`. Client-supplied boolean `boardDebtWaiverApproved: true` is NEVER sufficient!
 */
export function validateMemberLifecycleTransition(params: {
  clubId?: string;
  member: Pick<
    RotaryMember,
    | 'id'
    | 'fullName'
    | 'membershipStatus'
    | 'duesBalance'
    | 'mealBalance'
    | 'foundationBalance'
  >;
  targetStatus: MembershipLifecycleStatus;
  reason?: string;
  leaveStartDate?: string;
  leaveEndDate?: string;
  boardResolutionRef?: string;
  boardResolutionId?: string;
  boardResolutions?: BoardResolutionItem[];
  boardDebtWaiverApproved?: boolean;
  nowEpochMs?: number;
}):
  | {
      ok: true;
      currentStatus: MembershipLifecycleStatus;
      verifiedDebtWaiverResolution?: BoardResolutionItem;
      matchedResolution?: BoardResolutionItem;
    }
  | { ok: false; error: string; message: string } {
  const allowedStatuses: MembershipLifecycleStatus[] = [
    'Aktif',
    'Aday',
    'İzinli (Muaf)',
    'Onur Üyesi',
    'İstifa / Ayrıldı',
    'Nakil',
  ];
  if (!allowedStatuses.includes(params.targetStatus)) {
    return {
      ok: false,
      error: 'INVALID_LIFECYCLE_STATUS',
      message: `Geçersiz üyelik yaşam döngüsü durumu (#24-#26): "${String(
        params.targetStatus
      )}".`,
    };
  }

  const cleanReason = String(params.reason || '').trim();
  if (cleanReason.length < 5) {
    return {
      ok: false,
      error: 'LIFECYCLE_REASON_REQUIRED',
      message:
        'Üyelik durumu değişikliği için en az 5 karakterlik YK karar/gerekçe açıklaması (reason) zorunludur (#24-#26).',
    };
  }

  if (params.targetStatus === 'İzinli (Muaf)') {
    if (
      !params.leaveStartDate ||
      !String(params.leaveStartDate).trim() ||
      !params.leaveEndDate ||
      !String(params.leaveEndDate).trim()
    ) {
      return {
        ok: false,
        error: 'LEAVE_DETAILS_REQUIRED',
        message:
          'İzinli (Muaf) statüsüne geçişte izin başlangıç (leaveStartDate) ve bitiş (leaveEndDate) tarihleri zorunludur (#25).',
      };
    }
    const startMs = parseRotaryDateToEpochMs(params.leaveStartDate);
    const endMs = parseRotaryDateToEpochMs(params.leaveEndDate);
    if (startMs === null || endMs === null || startMs > endMs) {
      return {
        ok: false,
        error: 'INVALID_LEAVE_DATE_RANGE',
        message:
          'İzin başlangıç ve bitiş tarihleri geçerli bir tarih aralığı olmalı ve başlangıç tarihi bitiş tarihinden sonra olmamalıdır (#25, #34).',
      };
    }
  }

  const totalDebt =
    (params.member.duesBalance || 0) +
    (params.member.mealBalance || 0) +
    (params.member.foundationBalance || 0);

  let verifiedDebtWaiverResolution: BoardResolutionItem | undefined;

  if (
    (params.targetStatus === 'İstifa / Ayrıldı' ||
      params.targetStatus === 'Nakil') &&
    totalDebt > 0
  ) {
    const cleanRef = String(
      params.boardResolutionRef || params.boardResolutionId || ''
    ).trim();
    if (!cleanRef) {
      if (params.boardDebtWaiverApproved) {
        return {
          ok: false,
          error: 'UNVERIFIED_CLIENT_DEBT_WAIVER_FLAG',
          message:
            'Güvenlik reddi (#24, #26): İstemciden gönderilen boolean boardDebtWaiverApproved:true bayrağı tek başına borç ibra kanıtı olarak kabul edilmez; sunucuda onaylanmış YK karar referansı (boardResolutionRef) zorunludur.',
        };
      }
      return {
        ok: false,
        error: 'UNSETTLED_MEMBER_BALANCE_ON_EXIT',
        message: `Borç kapama kontrolü (#26, #38): ${params.member.fullName} üyesinin toplam ${totalDebt} TL kapanmamış cari borcu bulunmaktadır. Borç tahsil edilmeden veya sunucu doğrulamalı YK borç ibra kararı olmadan istifa/nakil işlemi tamamlanamaz.`,
      };
    }

    const resolutions = Array.isArray(params.boardResolutions)
      ? params.boardResolutions
      : [];
    const matchedResolution = resolutions.find(
      (r) =>
        r.resolutionNo === cleanRef ||
        r.decisionNo === cleanRef ||
        r.id === cleanRef
    );

    if (!matchedResolution) {
      return {
        ok: false,
        error: 'BOARD_RESOLUTION_NOT_FOUND',
        message: `YK borç ibra kararı bulunamadı (#24, #26): "${cleanRef}" referanslı bir Yönetim Kurulu kararı sunucu kayıtlarında mevcut değildir.`,
      };
    }

    if (
      params.clubId &&
      matchedResolution.clubId &&
      matchedResolution.clubId !== params.clubId
    ) {
      return {
        ok: false,
        error: 'BOARD_RESOLUTION_CLUB_MISMATCH',
        message: `Kulüp kapsam hatası (#24, #26): "${cleanRef}" kararı farklı bir kulübe (${matchedResolution.clubId}) aittir.`,
      };
    }

    if (
      matchedResolution.serverVerified !== true ||
      matchedResolution.approvalStatus !== 'Onaylandı' ||
      !matchedResolution.approvedByMemberId ||
      (matchedResolution.approvedByRole !== 'baskan' &&
        matchedResolution.approvedByRole !== 'sayman')
    ) {
      return {
        ok: false,
        error: 'BOARD_RESOLUTION_NOT_APPROVED',
        message: `Yetkisiz veya onaylanmamış YK kararı (#24, #26): "${cleanRef}" kararı sunucu tarafında Dönem Başkanı / Sayman yetkisiyle onaylanmış resmi bir karar değildir.`,
      };
    }

    if (matchedResolution.targetMemberId !== params.member.id) {
      return {
        ok: false,
        error: 'BOARD_RESOLUTION_MEMBER_MISMATCH',
        message: `Üye eşleşme hatası (#24, #26): "${cleanRef}" sayılı YK kararı "${params.member.id}" üyesi için değil, "${String(
          matchedResolution.targetMemberId || 'belirsiz'
        )}" üyesi için düzenlenmiştir.`,
      };
    }

    if (
      matchedResolution.resolutionScope !== 'DEBT_WAIVER_ON_EXIT' ||
      typeof matchedResolution.waivedAmountTL !== 'number' ||
      matchedResolution.waivedAmountTL < totalDebt
    ) {
      return {
        ok: false,
        error: 'BOARD_RESOLUTION_SCOPE_MISMATCH',
        message: `Karar kapsam/tutar hatası (#24, #26): "${cleanRef}" kararı DEBT_WAIVER_ON_EXIT kapsamında olmalı ve üyenin toplam açık borcunu (${totalDebt} TL) karşılamalıdır.`,
      };
    }

    if (matchedResolution.consumedAtIso) {
      return {
        ok: false,
        error: 'BOARD_RESOLUTION_ALREADY_CONSUMED',
        message: `Mükerrer karar kullanımı engellendi (#24, #26): "${cleanRef}" sayılı YK borç ibra kararı daha önce kullanılmıştır.`,
      };
    }

    const effectiveNowMs =
      typeof params.nowEpochMs === 'number' ? params.nowEpochMs : Date.now();
    const expiresMs = matchedResolution.expiresAtIso
      ? Date.parse(matchedResolution.expiresAtIso)
      : Number.NaN;
    if (Number.isNaN(expiresMs) || expiresMs < effectiveNowMs) {
      return {
        ok: false,
        error: 'BOARD_RESOLUTION_EXPIRED',
        message: `Süresi geçmiş YK kararı (#24, #26): "${cleanRef}" sayılı borç ibra kararının geçerlilik süresi (${String(
          matchedResolution.expiresAtIso || 'belirsiz'
        )}) dolmuştur.`,
      };
    }

    verifiedDebtWaiverResolution = matchedResolution;
  }

  return {
    ok: true,
    currentStatus: params.member.membershipStatus || 'Aktif',
    ...(verifiedDebtWaiverResolution
      ? {
          verifiedDebtWaiverResolution,
          matchedResolution: verifiedDebtWaiverResolution,
        }
      : {}),
  };
}
