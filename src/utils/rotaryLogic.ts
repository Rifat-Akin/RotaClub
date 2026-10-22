import {
  FinancialLineItem,
  MemberRsvp,
  MenuPreference,
  PaymentNotification,
  RotaryMember,
  RsvpStatus,
  TermBoardInfo,
} from '../types/rotary';

export interface KuverSummaryResult {
  attendingMembers: number;
  spousesCount: number;
  guestsCount: number;
  excusedMembers: number;
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
    totalKuver,
    menuBreakdown,
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
