import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBulkMemberAccrual,
  calculateKuverSummary,
  calculateMemberFinanceSummary,
  calculateProjectProgress,
  calculateTreasurySummary,
  calculateUpdatedAttendance,
  createSpeakerProposal,
  executeJulyFirstRollover,
  filterMembersByQueryAndClassification,
  generateKuverCsvContent,
  generateMeetingIcsContent,
  generateMembersFinanceCsvContent,
  maskPhoneForKvkk,
  toggleVoteSpeakerProposal,
} from './rotaryLogic';
import {
  FinancialLineItem,
  MemberRsvp,
  PaymentNotification,
  RotaryMember,
  TermBoardInfo,
  TreasuryLedgerEntry,
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

