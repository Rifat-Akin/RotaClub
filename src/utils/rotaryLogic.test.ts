import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBulkMemberAccrual,
  calculateHotelBanquetCommitment,
  calculateKuverSummary,
  calculateMeetingCostSharingAndExemptions,
  calculateMeetingKuverSummary,
  calculateMemberExtraMakeups,
  calculateMemberFinanceSummary,
  calculateProjectProgress,
  calculateSpecializedModulesSummary,
  calculateTermAttendanceMetrics,
  calculateTreasurySummary,
  calculateUpdatedAttendance,
  calculateVolunteerShiftMetrics,
  createSpeakerProposal,
  deriveLiveMeetingCostSharing,
  evaluateLcvReminderBatch,
  executeJulyFirstRollover,
  filterMembersByQueryAndClassification,
  generateKuverCsvContent,
  generateMeetingIcsContent,
  generateMembersFinanceCsvContent,
  hasDuplicateMakeupActivity,
  maskGuestNameForPublicVerification,
  maskPhoneForKvkk,
  resolveUnambiguousLegacyMemberId,
  SYNTHETIC_SPECIALIZED_MODULES,
  SYNTHETIC_VOLUNTEER_SHIFTS,
  toggleVolunteerShiftAssignment,
  toggleVoteSpeakerProposal,
  validateMemberLifecycleTransition,
} from './rotaryLogic';
import {
  FinancialLineItem,
  MakeupSubmission,
  MemberRsvp,
  PaymentNotification,
  RotaryMember,
  TermBoardInfo,
  TreasuryLedgerEntry,
  WeeklyMeeting,
} from '../types/rotary';

const SAMPLE_MEMBERS: RotaryMember[] = [
  {
    id: 'm-rifat',
    rotaryId: 'TR-2420-88412',
    fullName: 'Rifat Akın',
    clubTitle: 'Üye & Dijital Dönüşüm Komitesi Başkanı',
    classification: 'Kurumsal Yazılım Mimarisi & Yapay Zeka',
    industryCategory: 'Yazılım & Teknoloji',
    companyName: 'Bosphorus Cloud Systems A.Ş.',
    position: 'Kurucu Ortak & CTO',
    bloodGroup: 'A Rh(+)',
    phfLevel: 'PHF +2',
    phfStars: 3,
    joinYear: 2019,
    attendancePercent: 92,
    email: 'rifat.akin@galatarotary.org',
    phone: '+90 532 410 24 20',
    sponsorMember: 'GDB. Haluk Şahin',
    spouseName: 'Selin Akın',
    birthday: '14 Mayıs',
    weddingAnniversary: '12 Eylül',
    sponsorName: 'GDB. Haluk Şahin',
    committees: ['Gençlik & RYLA', 'Halkla İlişkiler & Dijital İmaj'],
    duesBalance: 0,
    mealBalance: 4800,
    foundationBalance: 4500,
    rsvpStatus: 'attending',
    mealPreference: 'Standart',
  },
  {
    id: 'm-deniz',
    rotaryId: 'TR-2420-77104',
    fullName: 'Av. Nazlı Denizmen',
    clubTitle: 'Kulüp Genel Sekreteri',
    classification: 'Uluslararası Deniz Ticareti ve P&I Hukuku',
    industryCategory: 'Deniz Hukuku',
    companyName: 'Denizmen & Partners Maritime Law',
    position: 'Kıdemli Yönetici Ortak',
    bloodGroup: '0 Rh(+)',
    phfLevel: 'PHF +3',
    phfStars: 4,
    joinYear: 2016,
    attendancePercent: 98,
    email: 'nazli.denizmen@galatarotary.org',
    phone: '+90 533 218 88 10',
    sponsorMember: 'GDB. Emre Karaca',
    spouseName: 'Mert Denizmen',
    birthday: '22 Mart',
    weddingAnniversary: '08 Haziran',
    sponsorName: 'GDB. Emre Karaca',
    committees: ['Kulüp Yönetimi', 'Üyelik'],
    duesBalance: 0,
    mealBalance: 2400,
    foundationBalance: 0,
    rsvpStatus: 'with_spouse',
    mealPreference: 'Balık',
  },
];

test('calculateKuverSummary accurately totals members, spouses, guests, and menu preferences', () => {
  const baseRsvps: MemberRsvp[] = [
    { memberId: 'm-1', memberName: 'Emre Karaca', status: 'attending', menu: 'Standart', guestCount: 0 },
    { memberId: 'm-2', memberName: 'Zeynep Yalçın', status: 'with_spouse', menu: 'Balık', guestCount: 0 },
    { memberId: 'm-3', memberName: 'Canan Erk', status: 'with_guest', menu: 'Vejetaryen', guestCount: 2 },
    { memberId: 'm-4', memberName: 'Bora Aksoy', status: 'excused', menu: 'Standart', guestCount: 0 },
  ];

  const summary = calculateKuverSummary(baseRsvps, 'with_spouse', 'Balık');

  assert.equal(summary.attendingMembers, 4);
  assert.equal(summary.spousesCount, 2);
  assert.equal(summary.guestsCount, 2);
  assert.equal(summary.excusedMembers, 1);
  assert.equal(summary.totalKuver, 8);
  assert.equal(summary.menuBreakdown.Balık, 4);
  assert.equal(summary.menuBreakdown.Vejetaryen, 3);
  assert.equal(summary.menuBreakdown.Standart, 1);
});

test('calculateUpdatedAttendance increments attendance rate and caps at 100%', () => {
  assert.equal(calculateUpdatedAttendance(92, 0, false), 92);
  assert.equal(calculateUpdatedAttendance(92, 1, false), 95);
  assert.equal(calculateUpdatedAttendance(92, 1, true), 97);
  assert.equal(calculateUpdatedAttendance(95, 3, true), 100);
});

test('calculateMemberFinanceSummary tracks pending and approved payments accurately', () => {
  const items: FinancialLineItem[] = [
    {
      id: 'f-1',
      category: 'Dönem Aidatı',
      title: '1. Yarıyıl Aidatı',
      period: '2026-2027',
      totalAmount: 18000,
      paidAmount: 12000,
      dueDate: '15 Kasım 2026',
    },
    {
      id: 'f-2',
      category: 'Toplantı Kuver Bakiyesi',
      title: 'Ekim Kuver Bakiyesi',
      period: 'Ekim 2026',
      totalAmount: 4500,
      paidAmount: 0,
      dueDate: '30 Ekim 2026',
    },
  ];

  const notifications: PaymentNotification[] = [
    {
      id: 'p-1',
      memberId: 'm-rifat',
      memberName: 'Rifat Akın',
      category: 'Toplantı Kuver Bakiyesi',
      amount: 4500,
      description: 'Ekim Kuver EFT',
      submittedAt: '22 Ekim 2026',
      receiptRef: 'DK-9041',
      status: 'Bekliyor',
    },
  ];

  const initialSummary = calculateMemberFinanceSummary(items, notifications, 'm-rifat');
  assert.equal(initialSummary.totalObligation, 22500);
  assert.equal(initialSummary.totalPaid, 12000);
  assert.equal(initialSummary.remainingBalance, 10500);
  assert.equal(initialSummary.pendingApprovalAmount, 4500);

  const approvedNotifications: PaymentNotification[] = [
    { ...notifications[0], status: 'Onaylandı' },
  ];
  const afterApproval = calculateMemberFinanceSummary(items, approvedNotifications, 'm-rifat');
  assert.equal(afterApproval.totalPaid, 16500);
  assert.equal(afterApproval.remainingBalance, 6000);
  assert.equal(afterApproval.pendingApprovalAmount, 0);
});

test('calculateProjectProgress computes percentage and remaining goal', () => {
  const res = calculateProjectProgress(500000, 410000);
  assert.equal(res.percent, 82);
  assert.equal(res.remainingAmount, 90000);
  assert.equal(res.isGoalReached, false);

  const done = calculateProjectProgress(500000, 525000);
  assert.equal(done.percent, 100);
  assert.equal(done.remainingAmount, 0);
  assert.equal(done.isGoalReached, true);
});

test('filterMembersByQueryAndClassification filters by Turkish query and category', () => {
  const byCategory = filterMembersByQueryAndClassification(SAMPLE_MEMBERS, '', 'Deniz Hukuku');
  assert.equal(byCategory.length, 1);
  assert.equal(byCategory[0].fullName, 'Av. Nazlı Denizmen');

  const byBloodGroup = filterMembersByQueryAndClassification(SAMPLE_MEMBERS, 'A Rh(+)', 'Tümü');
  assert.equal(byBloodGroup.length, 1);
  assert.equal(byBloodGroup[0].fullName, 'Rifat Akın');
});

test('executeJulyFirstRollover transitions term to 2027-2028 and creates digital yearbook archive', () => {
  const initialTerm: TermBoardInfo = {
    termLabel: '2026-2027 Dönemi',
    district: '2420. Bölge',
    themeTitle: 'İyilik İçin Sihir Yaratın',
    president: 'Rtn. Emre Karaca',
    secretary: 'Av. Nazlı Denizmen',
    treasurer: 'YMM. Levent Soydan',
    pastPresident: 'GDB. Sinan Vardar',
    vicePresident: 'Rtn. Selim Koçak',
    isRolloverCompleted: false,
  };

  const rolled = executeJulyFirstRollover(initialTerm);
  assert.equal(rolled.isRolloverCompleted, true);
  assert.equal(rolled.termLabel, '2027-2028 Dönemi');
  assert.ok(rolled.archivedYearbook);
  assert.equal(rolled.archivedYearbook?.termLabel, '2026-2027 Dönemi');
});

test('toggleVoteSpeakerProposal and createSpeakerProposal manage speaker pool votes and ordering', () => {
  const initialPool = [
    {
      id: 'sp-1',
      speakerName: 'Prof. Dr. Özgür Demirtaş',
      speakerTitle: 'Sabancı Üniversitesi Finans Kürsüsü Başkanı',
      proposedTopic: 'Küresel Ekonomi ve Yapay Zeka Devrimi',
      proposedBy: 'Rtn. Selim Koçak',
      votes: 14,
      hasVoted: false,
      targetMonth: 'Kasım 2026',
    },
  ];

  const afterVote = toggleVoteSpeakerProposal(initialPool, 'sp-1');
  assert.equal(afterVote[0].votes, 15);
  assert.equal(afterVote[0].hasVoted, true);

  const afterAdd = createSpeakerProposal(afterVote, {
    speakerName: 'Doç. Dr. Ferhat Çelik',
    speakerTitle: 'İTÜ Denizcilik Fakültesi',
    proposedTopic: 'Boğaziçi Deniz Ekosistemi',
    proposedBy: 'Rtn. Rifat Akın',
    targetMonth: 'Aralık 2026',
  });
  assert.equal(afterAdd.length, 2);
});

test('applyBulkMemberAccrual, calculateTreasurySummary and CSV generators work accurately', () => {
  const updated = applyBulkMemberAccrual(SAMPLE_MEMBERS, 'Toplantı Kuver Bakiyesi', 2400);
  assert.equal(updated[0].mealBalance, 7200);
  assert.equal(updated[1].mealBalance, 4800);

  const ledger: TreasuryLedgerEntry[] = [
    {
      id: 'tr-1',
      date: '20 Ekim 2026',
      type: 'Gelir',
      category: 'Aidat & Kuver Tahsilatı',
      title: '1. Yarıyıl Aidat Tahsilatları',
      amount: 180000,
      referenceNo: 'BNK-101',
      counterparty: 'Kulüp Üyeleri',
    },
    {
      id: 'tr-2',
      date: '21 Ekim 2026',
      type: 'Gider',
      category: 'Otel & Banket Gideri',
      title: 'Pera Palace #1841 Banket Ödemesi',
      amount: 80000,
      referenceNo: 'BNK-102',
      counterparty: 'Pera Palace Hotel',
    },
  ];

  const treasury = calculateTreasurySummary(ledger, updated, 1000000);
  assert.equal(treasury.totalIncome, 180000);
  assert.equal(treasury.totalExpense, 80000);
  assert.equal(treasury.netBankBalance, 1100000);
  assert.equal(treasury.totalMemberReceivables, 7200 + 4500 + 4800);

  const kuverCsv = generateKuverCsvContent(SAMPLE_MEMBERS, 1842);
  assert.ok(kuverCsv.includes('Rifat Akın'));
  assert.ok(kuverCsv.includes('Mert Denizmen'));

  const financeCsv = generateMembersFinanceCsvContent(SAMPLE_MEMBERS);
  assert.ok(financeCsv.includes('TR-2420-88412'));

  const masked = maskPhoneForKvkk('+90 532 411 24 20', true);
  assert.ok(masked.includes('***'));
  assert.equal(maskPhoneForKvkk('+90 532 411 24 20', false), '+90 532 411 24 20');

  const ics = generateMeetingIcsContent({
    meetingNo: 1842,
    date: '27 Ekim 2026 Salı',
    time: '19:30 – 21:45',
    venue: 'Pera Palace Hotel',
    hall: 'Galata Salonu',
    speakerName: 'Prof. Dr. Çiğdem Kafescioğlu',
    speakerTitle: 'Boğaziçi Üniversitesi Tarih Bölümü',
    topic: 'Ceneviz Sur İçi ve Galata Kulesi',
    speakerBio: 'Tarihçi',
    certificateStatus: 'Hazır — İmzalandı',
    certificateDonationTree: 'End Polio Now 50 Aşı Bağışı',
  });
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('Pera Palace Hotel'));
});

test('Issue #29: calculateHotelBanquetCommitment enforces two-step LCV lock and explicit hotel confirmation reference', () => {
  const sampleKuver = {
    attendingMembers: 16,
    spousesCount: 4,
    guestsCount: 2,
    excusedMembers: 3,
    pendingMembers: 0,
    totalKuver: 22,
    menuBreakdown: { Standart: 12, Balık: 6, Vejetaryen: 4 },
  };

  // Step 1: LCV locked, but no hotel confirmation reference yet -> awaiting hotel banquet confirmation
  const lockedAwaitingHotel = calculateHotelBanquetCommitment(
    sampleKuver,
    30,
    true,
    2
  );

  assert.equal(lockedAwaitingHotel.reportedMemberAndGuestKuver, 22);
  assert.equal(lockedAwaitingHotel.protocolSpeakerKuver, 2);
  assert.equal(lockedAwaitingHotel.actualHeadcount, 24);
  assert.equal(lockedAwaitingHotel.minHotelGuarantee, 30);
  assert.equal(lockedAwaitingHotel.guaranteedBillableKuver, 30);
  assert.equal(lockedAwaitingHotel.unfilledGuaranteeSeats, 6);
  assert.equal(lockedAwaitingHotel.isLockedForHotel, true);
  assert.equal(lockedAwaitingHotel.isHotelConfirmed, false);
  assert.equal(
    lockedAwaitingHotel.hotelConfirmationStatus,
    'LCV Kilitlendi — Otel Banket Teyidi Bekleniyor'
  );

  // Step 2: LCV locked AND explicit hotel confirmation reference recorded -> confirmed & locked
  const confirmedWithHotel = calculateHotelBanquetCommitment(
    sampleKuver,
    30,
    true,
    2,
    'PP-BNQ-2026-1842',
    'Rtn. Dr. Kerem Aydın'
  );
  assert.equal(confirmedWithHotel.isHotelConfirmed, true);
  assert.equal(
    confirmedWithHotel.hotelConfirmationRef,
    'PP-BNQ-2026-1842'
  );
  assert.equal(
    confirmedWithHotel.hotelConfirmationStatus,
    'Kesin Kuver Otele Onaylandı (Kilitli)'
  );

  // Step 3: Actual headcount (22 + 1 protocol = 23) exceeds minimum guarantee (20), LCV open
  const fullCommitment = calculateHotelBanquetCommitment(
    sampleKuver,
    20,
    false,
    1
  );

  assert.equal(fullCommitment.actualHeadcount, 23);
  assert.equal(fullCommitment.guaranteedBillableKuver, 23);
  assert.equal(fullCommitment.unfilledGuaranteeSeats, 0);
  assert.equal(fullCommitment.isHotelConfirmed, false);
  assert.equal(
    fullCommitment.hotelConfirmationStatus,
    'LCV Bildirimi Açık — Otel Onayı Bekleniyor'
  );
});

test('Issue #42: calculateMeetingCostSharingAndExemptions and deriveLiveMeetingCostSharing compute live per-capita share and exemptions', () => {
  // 30 billable kuver * 2000 TL = 60,000 TL hotel invoice
  // 20 paying members + 4 paying companions + 2 exemptions (1 speaker + 1 honorary) = 26 occupied seats -> 4 unfilled guarantee seats
  // Exemption cost = 2 * 2000 = 4,000 TL; unfilled cost = 4 * 2000 = 8,000 TL; sharedPool = 12,000 TL / 20 paying members = 600 TL surcharge
  const result = calculateMeetingCostSharingAndExemptions({
    unitKuverCostTL: 2000,
    billableKuverCount: 30,
    attendingPayingMembersCount: 20,
    payingCompanionsCount: 4,
    exemptSpeakerCount: 1,
    exemptHonoraryOrYouthCount: 1,
  });

  assert.equal(result.totalHotelInvoiceTL, 60000);
  assert.equal(result.totalExemptionsCount, 2);
  assert.equal(result.clubSubsidizedExemptionCostTL, 4000);
  assert.equal(result.unfilledGuaranteeCostTL, 8000);
  assert.equal(result.sharedPoolCostTL, 12000);
  assert.equal(result.perPayingMemberSharedSurchargeTL, 600);
  assert.equal(result.effectivePerMemberTotalTL, 2600);

  // Live derivation from KuverSummaryResult (no hardcoded member/companion numbers)
  const liveKuver = calculateKuverSummary(
    SAMPLE_MEMBERS.map((m) => ({
      memberId: m.id,
      memberName: m.fullName,
      status: m.rsvpStatus,
      menu: m.mealPreference,
      guestCount: m.rsvpStatus === 'with_guest' ? 1 : 0,
    })),
    'attending',
    'Standart'
  );
  const liveShared = deriveLiveMeetingCostSharing({
    kuverSummary: liveKuver,
    unitKuverCostTL: 1850,
    minHotelGuarantee: 10,
    exemptSpeakerCount: 1,
    exemptHonoraryOrYouthCount: 1,
  });
  assert.equal(
    liveShared.attendingPayingMembersCount,
    liveKuver.attendingMembers - 1
  );
  assert.equal(
    liveShared.payingCompanionsCount,
    liveKuver.spousesCount + liveKuver.guestsCount
  );
  assert.equal(liveShared.billableKuverCount, 10);
});

test('Issue #46: Volunteer, task, and shift management computes coverage metrics, toggles assignments, and blocks over-capacity', () => {
  const initialMetrics = calculateVolunteerShiftMetrics(SYNTHETIC_VOLUNTEER_SHIFTS);
  assert.equal(SYNTHETIC_VOLUNTEER_SHIFTS.length, 3);
  assert.equal(initialMetrics.totalRequired, 10);
  assert.equal(initialMetrics.totalAssigned, 8);
  assert.equal(initialMetrics.openSlotsCount, 2);
  assert.equal(initialMetrics.fillRatePercent, 80);

  // Assign Rtn. Selim Koçak to shift-galatart-1 (currently 2/3)
  const afterJoin = toggleVolunteerShiftAssignment(
    SYNTHETIC_VOLUNTEER_SHIFTS,
    'shift-galatart-1',
    'Rtn. Selim Koçak'
  );
  const updatedShift = afterJoin.find((s) => s.id === 'shift-galatart-1')!;
  assert.equal(
    updatedShift.assignedVolunteers.includes('Rtn. Selim Koçak'),
    true
  );
  assert.equal(updatedShift.assignedVolunteers.length, 3);

  // Attempt to assign another volunteer ('Rtn. Dr. Kerem Aydın') to shift-galatart-1 now that it is at capacity (3/3) -> MUST be blocked!
  const afterOverCapacityAttempt = toggleVolunteerShiftAssignment(
    afterJoin,
    'shift-galatart-1',
    'Rtn. Dr. Kerem Aydın'
  );
  const fullShift = afterOverCapacityAttempt.find(
    (s) => s.id === 'shift-galatart-1'
  )!;
  assert.equal(fullShift.assignedVolunteers.length, 3);
  assert.equal(
    fullShift.assignedVolunteers.includes('Rtn. Dr. Kerem Aydın'),
    false
  );

  // Toggle again to remove Rtn. Selim Koçak from shift-galatart-1
  const afterLeave = toggleVolunteerShiftAssignment(
    afterJoin,
    'shift-galatart-1',
    'Rtn. Selim Koçak'
  );
  const leftShift = afterLeave.find((s) => s.id === 'shift-galatart-1')!;
  assert.equal(
    leftShift.assignedVolunteers.includes('Rtn. Selim Koçak'),
    false
  );
});

test('Issue #51: Kermes, GALATART, and RYLA specialized modules summary strictly separates Gross Revenue, Program Expenses, and Net Club Impact Fund', () => {
  const summary = calculateSpecializedModulesSummary(SYNTHETIC_SPECIALIZED_MODULES);
  assert.equal(summary.kermesFillPercent, 83);
  assert.equal(summary.kermesNetSurplusTL, 205000);
  assert.equal(summary.galatartNetCommissionTL, 420000);
  assert.equal(summary.galatartExhibitionExpenseTL, 60000);
  assert.equal(summary.rylaFillPercent, 83);
  assert.equal(summary.rylaProgramExpenseBudgetTL, 142500);
  assert.equal(summary.rylaNetReserveTL, 28500);
  assert.equal(summary.totalGrossRevenueTL, 250000 + 1200000 + 171000);
  assert.equal(summary.totalProgramExpensesTL, 45000 + 720000 + 60000 + 142500);
  assert.equal(summary.combinedNetImpactFundTL, 205000 + 420000 + 28500);
  assert.equal(
    summary.totalGrossRevenueTL - summary.totalProgramExpensesTL,
    summary.combinedNetImpactFundTL
  );
});

test('Issue #35: calculateMemberExtraMakeups isolates approved make-ups per memberId even when two members share the exact same fullName', () => {
  const initialMakeups: MakeupSubmission[] = [
    {
      id: 'mk-init-1',
      memberId: 'm-ahmet-1',
      memberName: 'Rtn. Ahmet Yılmaz',
      targetClubOrEvent: 'Karaköy Rotary Kulübü',
      activityType: 'Kulüp Toplantısı',
      date: '10 Ekim 2026',
      description: 'İlk katılım',
      status: 'Onaylandı',
      attendanceBoost: 3,
    },
  ];

  const currentMakeups: MakeupSubmission[] = [
    ...initialMakeups,
    {
      id: 'mk-ahmet1-approved',
      memberId: 'm-ahmet-1',
      memberName: 'Rtn. Ahmet Yılmaz',
      targetClubOrEvent: 'Maçka Rotary Kulübü',
      activityType: 'Kulüp Toplantısı',
      date: '18 Ekim 2026',
      description: 'Onaylı katılım',
      status: 'Onaylandı',
      attendanceBoost: 3,
    },
    {
      id: 'mk-ahmet1-pending',
      memberId: 'm-ahmet-1',
      memberName: 'Rtn. Ahmet Yılmaz',
      targetClubOrEvent: 'Beşiktaş Rotary Kulübü',
      activityType: 'Kulüp Toplantısı',
      date: '20 Ekim 2026',
      description: 'Henüz inceleniyor',
      status: 'İnceleniyor',
      attendanceBoost: 0,
    },
    {
      id: 'mk-ahmet2-approved',
      memberId: 'm-ahmet-2',
      memberName: 'Rtn. Ahmet Yılmaz',
      targetClubOrEvent: 'Şişli Rotary Kulübü',
      activityType: 'Hizmet Projesi',
      date: '21 Ekim 2026',
      description: 'Aynı isimli ikinci üyenin onaylı katılımı',
      status: 'Onaylandı',
      attendanceBoost: 3,
    },
  ];

  // m-ahmet-1 had 1 initial approved and now has 2 approved (+1 extra), ignoring m-ahmet-2's approved make-up and pending ones
  assert.equal(
    calculateMemberExtraMakeups(
      currentMakeups,
      initialMakeups,
      'm-ahmet-1',
      'Rtn. Ahmet Yılmaz'
    ),
    1
  );

  // m-ahmet-2 had 0 initial approved and now has 1 approved (+1 extra), ignoring m-ahmet-1's make-ups
  assert.equal(
    calculateMemberExtraMakeups(
      currentMakeups,
      initialMakeups,
      'm-ahmet-2',
      'Rtn. Ahmet Yılmaz'
    ),
    1
  );

  // Legacy record WITHOUT memberId when two members share the exact same name ('Ahmet Yılmaz'):
  // resolveUnambiguousLegacyMemberId returns undefined and calculateMemberExtraMakeups refuses to credit either member ambiguously
  const duplicateNamedMembers: RotaryMember[] = [
    { ...SAMPLE_MEMBERS[0], id: 'm-ahmet-1', fullName: 'Ahmet Yılmaz' },
    { ...SAMPLE_MEMBERS[1], id: 'm-ahmet-2', fullName: 'Ahmet Yılmaz' },
  ];
  assert.equal(
    resolveUnambiguousLegacyMemberId(
      'Rtn. Ahmet Yılmaz',
      duplicateNamedMembers
    ),
    undefined
  );

  const legacyAmbiguousMakeups: MakeupSubmission[] = [
    {
      id: 'mk-legacy-no-id',
      memberName: 'Rtn. Ahmet Yılmaz',
      targetClubOrEvent: 'Kadıköy Rotary Kulübü',
      activityType: 'Kulüp Toplantısı',
      date: '22 Ekim 2026',
      description: 'MemberId olmayan eski kayıt',
      status: 'Onaylandı',
      attendanceBoost: 3,
    },
  ];
  assert.equal(
    calculateMemberExtraMakeups(
      legacyAmbiguousMakeups,
      [],
      'm-ahmet-1',
      'Rtn. Ahmet Yılmaz',
      duplicateNamedMembers
    ),
    0
  );

  // Duplicate activity prevention (#35): same memberId, date, activityType, and targetClubOrEvent is detected
  assert.equal(
    hasDuplicateMakeupActivity(currentMakeups, {
      memberId: 'm-ahmet-1',
      targetClubOrEvent: 'Maçka Rotary Kulübü',
      activityType: 'Kulüp Toplantısı',
      date: '18 Ekim 2026',
    }),
    true
  );
  // Different memberId for the same event is NOT a duplicate for that member
  assert.equal(
    hasDuplicateMakeupActivity(currentMakeups, {
      memberId: 'm-ahmet-2',
      targetClubOrEvent: 'Maçka Rotary Kulübü',
      activityType: 'Kulüp Toplantısı',
      date: '18 Ekim 2026',
    }),
    false
  );
});

test('evaluateLcvReminderBatch enforces quiet hours in Europe/Istanbul, per-meeting meetingRsvps, dynamic club/venue templates, opt-out, 6h cooldown, and honest draft-only status (#32)', () => {
  // 2026-10-23T11:00:00.000Z is 14:00 in Europe/Istanbul (UTC+3)
  const daytimeEpochMs = Date.parse('2026-10-23T11:00:00.000Z');
  // 2026-10-23T20:00:00.000Z is 23:00 in Europe/Istanbul (UTC+3, quiet hours)
  const quietEpochMs = Date.parse('2026-10-23T20:00:00.000Z');

  const membersForReminder: RotaryMember[] = [
    {
      ...SAMPLE_MEMBERS[0],
      id: 'm-pending-ok',
      fullName: 'Caner Erkin',
      rsvpStatus: 'attending', // Global status is attending, but meeting #1842 is pending!
      meetingRsvps: { '1842': 'pending', '1841': 'attending' },
      preferredReminderChannel: 'E-Posta',
    },
    {
      ...SAMPLE_MEMBERS[0],
      id: 'm-responded-for-meeting',
      fullName: 'Emre Belözoğlu',
      rsvpStatus: 'pending', // Global status is pending, but meeting #1842 is already attending!
      meetingRsvps: { '1842': 'attending' },
    },
    {
      ...SAMPLE_MEMBERS[1],
      id: 'm-pending-optout',
      fullName: 'Selim Yalçın',
      rsvpStatus: 'pending',
      meetingRsvps: { '1842': 'pending' },
      reminderOptOut: true,
    },
    {
      ...SAMPLE_MEMBERS[0],
      id: 'm-pending-cooldown',
      fullName: 'Zeynep Korkmaz',
      rsvpStatus: 'pending',
      meetingRsvps: { '1842': 'pending' },
    },
  ];

  const existingQueue = [
    {
      id: 'rem-1842-m-pending-cooldown-prev',
      meetingNo: 1842,
      memberId: 'm-pending-cooldown',
      memberName: 'Zeynep Korkmaz',
      channel: 'WhatsApp Taslağı' as const,
      draftMessage: 'Önceki taslak',
      status: 'Taslak Kuyrukta (Dış Gönderim Kapalı)' as const,
      createdAt: '23 Ekim 2026 · 12:00',
      createdAtEpochMs: daytimeEpochMs - 2 * 60 * 60 * 1000, // 2 hours ago (within 6h cooldown)
      createdBy: 'Dr. Zeynep Kaya',
    },
  ];

  // Quiet hours (23:00 TR derived from quietEpochMs) blocks batch queueing even without passing currentHourTR
  const quietBatch = evaluateLcvReminderBatch({
    clubName: 'Karaköy Rotary Kulübü',
    meetingNo: 1842,
    meetingDate: '27 Ekim 2026 Salı',
    meetingVenue: 'JW Marriott Bosphorus',
    members: membersForReminder,
    existingQueue,
    actorName: 'Dr. Zeynep Kaya',
    nowEpochMs: quietEpochMs,
  });
  assert.equal(quietBatch.isQuietHours, true);
  assert.equal(quietBatch.queuedItems.length, 0);

  // Normal daytime hour (14:00 TR derived from daytimeEpochMs)
  const daytimeBatch = evaluateLcvReminderBatch({
    clubName: 'Karaköy Rotary Kulübü',
    meetingNo: 1842,
    meetingDate: '27 Ekim 2026 Salı',
    meetingVenue: 'JW Marriott Bosphorus',
    members: membersForReminder,
    existingQueue,
    actorName: 'Dr. Zeynep Kaya',
    nowEpochMs: daytimeEpochMs,
  });
  assert.equal(daytimeBatch.isQuietHours, false);
  assert.equal(daytimeBatch.queuedItems.length, 1);
  assert.equal(daytimeBatch.queuedItems[0].memberId, 'm-pending-ok');
  assert.equal(daytimeBatch.queuedItems[0].channel, 'E-Posta');
  assert.equal(
    daytimeBatch.queuedItems[0].draftMessage.includes('Karaköy Rotary Kulübü'),
    true
  );
  assert.equal(
    daytimeBatch.queuedItems[0].draftMessage.includes('JW Marriott Bosphorus'),
    true
  );
  assert.equal(
    daytimeBatch.queuedItems[0].draftMessage.includes('Galata Rotary'),
    false
  );
  assert.equal(
    daytimeBatch.queuedItems[0].status,
    'Taslak Kuyrukta (Dış Gönderim Kapalı)'
  );
  assert.equal(daytimeBatch.queuedItems[0].providerReceiptId, undefined);
  assert.deepEqual(daytimeBatch.skippedOptOutMembers, ['Selim Yalçın']);
  assert.deepEqual(daytimeBatch.skippedCooldownMembers, ['Zeynep Korkmaz']);
});

test('maskGuestNameForPublicVerification masks guest full name under KVKK for unauthenticated public queries (#36)', () => {
  assert.equal(
    maskGuestNameForPublicVerification('Rtn. Hakan Çelik'),
    'Rtn. H*** Ç***'
  );
  assert.equal(
    maskGuestNameForPublicVerification('Sinan Kuyumcu'),
    'S*** K***'
  );
});

test('Issue #27 / #28 / #34: calculateMeetingKuverSummary and calculateTermAttendanceMetrics compute real per-meeting LCV and term attendance with Rotary 60% rule', () => {
  const meetings: WeeklyMeeting[] = [
    {
      meetingNo: 1840,
      date: '13 Ekim 2026',
      time: '19:30',
      venue: 'Pera Palace Hotel',
      hall: 'Grand Pera',
      speakerName: 'Konuşmacı 1',
      speakerTitle: 'Unvan',
      topic: 'Konu 1',
      speakerBio: 'Biyo',
      certificateStatus: 'Takdim Edildi',
      certificateDonationTree: 'PolioPlus',
      isPast: true,
      status: 'Tamamlandı',
    },
    {
      meetingNo: 1841,
      date: '20 Ekim 2026',
      time: '19:30',
      venue: 'Pera Palace Hotel',
      hall: 'Grand Pera',
      speakerName: 'Konuşmacı 2',
      speakerTitle: 'Unvan',
      topic: 'Konu 2',
      speakerBio: 'Biyo',
      certificateStatus: 'Takdim Edildi',
      certificateDonationTree: 'PolioPlus',
      isPast: true,
      status: 'Tamamlandı',
    },
    {
      meetingNo: 1842,
      date: '27 Ekim 2026',
      time: '19:30',
      venue: 'Pera Palace Hotel',
      hall: 'Grand Pera',
      speakerName: 'Konuşmacı 3',
      speakerTitle: 'Unvan',
      topic: 'Konu 3',
      speakerBio: 'Biyo',
      certificateStatus: 'Hazır — İmzalandı',
      certificateDonationTree: 'PolioPlus',
      status: 'Aktif',
    },
    {
      meetingNo: 1843,
      date: '3 Kasım 2026',
      time: '19:30',
      venue: 'Pera Palace Hotel',
      hall: 'Grand Pera',
      speakerName: 'İptal Toplantı',
      speakerTitle: 'Unvan',
      topic: 'Resmi Tatil',
      speakerBio: 'Biyo',
      certificateStatus: 'Hazır — İmzalandı',
      certificateDonationTree: 'PolioPlus',
      status: 'İptal Edildi',
    },
  ];

  const meetingAttendances: Record<string, string[]> = {
    '1840': ['m-rifat'],
    '1841': [], // m-rifat missed 1841
    '1842': [], // m-rifat missed 1842 so far
  };

  // Without make-ups: 1 attended out of 3 held non-cancelled meetings = 33% (< 60%)
  const metricsBeforeMakeup = calculateTermAttendanceMetrics({
    member: SAMPLE_MEMBERS[0],
    meetings,
    meetingAttendances,
    makeupSubmissions: [],
    allMembers: SAMPLE_MEMBERS,
  });
  assert.equal(metricsBeforeMakeup.heldMeetingsCount, 3);
  assert.equal(metricsBeforeMakeup.directAttendedMeetingsCount, 1);
  assert.equal(metricsBeforeMakeup.attendancePercentage, 33);
  assert.equal(metricsBeforeMakeup.meetsRotary60PercentRule, false);

  // With 1 approved make-up (plus a duplicate of the same make-up that must be deduplicated): 2 / 3 = 67% (>= 60%)
  const makeups: MakeupSubmission[] = [
    {
      id: 'mk-1',
      memberId: 'm-rifat',
      memberName: 'Rifat Akın',
      targetClubOrEvent: 'Beşiktaş Rotary Kulübü',
      activityType: 'Kulüp Toplantısı',
      date: '21 Ekim 2026',
      description: 'Ziyaret',
      status: 'Onaylandı',
      attendanceBoost: 3,
    },
    {
      id: 'mk-1-dup',
      memberId: 'm-rifat',
      memberName: 'Rifat Akın',
      targetClubOrEvent: 'Beşiktaş Rotary Kulübü',
      activityType: 'Kulüp Toplantısı',
      date: '21 Ekim 2026',
      description: 'Aynı ziyaret mükerrer kayıt',
      status: 'Onaylandı',
      attendanceBoost: 3,
    },
  ];

  const metricsAfterMakeup = calculateTermAttendanceMetrics({
    member: SAMPLE_MEMBERS[0],
    meetings,
    meetingAttendances,
    makeupSubmissions: makeups,
    allMembers: SAMPLE_MEMBERS,
  });
  assert.equal(metricsAfterMakeup.approvedMakeupsApplied, 1);
  assert.equal(metricsAfterMakeup.creditedMeetingsCount, 2);
  assert.equal(metricsAfterMakeup.attendancePercentage, 67);
  assert.equal(metricsAfterMakeup.meetsRotary60PercentRule, true);

  // Per-meeting Kuver summary excludes resigned members and uses meetingRsvps / meetingMenus
  const rosterWithResigned: RotaryMember[] = [
    {
      ...SAMPLE_MEMBERS[0],
      meetingRsvps: { '1842': 'with_spouse', '1841': 'excused' },
      meetingMenus: { '1842': 'Balık' },
    },
    {
      ...SAMPLE_MEMBERS[1],
      membershipStatus: 'İstifa / Ayrıldı',
      meetingRsvps: { '1842': 'attending' },
    },
  ];
  const kuver1842 = calculateMeetingKuverSummary(rosterWithResigned, 1842, 1842);
  assert.equal(kuver1842.attendingMembers, 1);
  assert.equal(kuver1842.spousesCount, 1);
  assert.equal(kuver1842.totalKuver, 2);
  assert.equal(kuver1842.menuBreakdown.Balık, 2);
});

test('Issue #24-#26 & #38-#44: validateMemberLifecycleTransition blocks exit with debt and applyBulkMemberAccrual exempts Honorary/Resigned/Candidate/Leave members', () => {
  const memberWithDebt: RotaryMember = {
    ...SAMPLE_MEMBERS[0],
    duesBalance: 4500,
    mealBalance: 0,
    foundationBalance: 0,
  };

  // Exiting ('İstifa / Ayrıldı') with unsettled debt fails with UNSETTLED_MEMBER_BALANCE_ON_EXIT
  const blockedExit = validateMemberLifecycleTransition({
    member: memberWithDebt,
    targetStatus: 'İstifa / Ayrıldı',
    reason: 'İş yoğunluğu nedeniyle ayrılma talebi',
  });
  assert.equal(blockedExit.ok, false);
  if (!blockedExit.ok) {
    assert.equal(blockedExit.error, 'UNSETTLED_MEMBER_BALANCE_ON_EXIT');
  }

  // Transitioning to 'İzinli (Muaf)' without leaveStartDate / leaveEndDate fails with LEAVE_DETAILS_REQUIRED
  const blockedLeave = validateMemberLifecycleTransition({
    member: SAMPLE_MEMBERS[1],
    targetStatus: 'İzinli (Muaf)',
    reason: 'Yurt dışı görevlendirme',
  });
  assert.equal(blockedLeave.ok, false);
  if (!blockedLeave.ok) {
    assert.equal(blockedLeave.error, 'LEAVE_DETAILS_REQUIRED');
  }

  // Bulk accrual exempts Onur Üyesi, İstifa / Ayrıldı, Aday, and exempts İzinli (Muaf) from Toplantı Kuver Bakiyesi
  const mixedRoster: RotaryMember[] = [
    { ...SAMPLE_MEMBERS[0], id: 'm-active', membershipStatus: 'Aktif', duesBalance: 0, mealBalance: 0 },
    { ...SAMPLE_MEMBERS[1], id: 'm-honorary', membershipStatus: 'Onur Üyesi', duesBalance: 0, mealBalance: 0 },
    { ...SAMPLE_MEMBERS[0], id: 'm-leave', membershipStatus: 'İzinli (Muaf)', duesBalance: 0, mealBalance: 0 },
    { ...SAMPLE_MEMBERS[1], id: 'm-resigned', membershipStatus: 'İstifa / Ayrıldı', duesBalance: 0, mealBalance: 0 },
  ];

  const afterDues = applyBulkMemberAccrual(mixedRoster, 'Dönem Aidatı', 9000);
  assert.equal(afterDues.find((m) => m.id === 'm-active')!.duesBalance, 9000);
  assert.equal(afterDues.find((m) => m.id === 'm-honorary')!.duesBalance, 0);
  assert.equal(afterDues.find((m) => m.id === 'm-leave')!.duesBalance, 9000);
  assert.equal(afterDues.find((m) => m.id === 'm-resigned')!.duesBalance, 0);

  const afterKuver = applyBulkMemberAccrual(mixedRoster, 'Toplantı Kuver Bakiyesi', 1500);
  assert.equal(afterKuver.find((m) => m.id === 'm-active')!.mealBalance, 1500);
  assert.equal(afterKuver.find((m) => m.id === 'm-leave')!.mealBalance, 0);
  assert.equal(afterKuver.find((m) => m.id === 'm-honorary')!.mealBalance, 0);
});



