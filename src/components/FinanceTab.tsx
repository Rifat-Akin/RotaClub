import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileUp,
  Landmark,
  Layers,
  PlusCircle,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import {
  ClubRole,
  FinancialLineItem,
  OverdueMemberItem,
  PaymentNotification,
  RotaryMember,
  TreasuryLedgerEntry,
} from '../types/rotary';
import {
  calculateKuverSummary,
  calculateMeetingCostSharingAndExemptions,
  calculateTreasurySummary,
  formatTL,
  generateMembersFinanceCsvContent,
  KuverSummaryResult,
  MemberFinanceSummary,
} from '../utils/rotaryLogic';

interface FinanceTabProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  financialItems: FinancialLineItem[];
  financeSummary: MemberFinanceSummary;
  paymentNotifications: PaymentNotification[];
  overdueMembers: OverdueMemberItem[];
  members: RotaryMember[];
  treasuryLedger: TreasuryLedgerEntry[];
  onCopyIban: (iban: string) => void;
  onSubmitPaymentNotification: (payload: {
    category: FinancialLineItem['category'];
    amount: number;
    description: string;
    receiptRef: string;
  }) => void;
  onApprovePayment: (paymentId: string) => void;
  onRejectPayment: (paymentId: string) => void;
  onSendGentleReminder: (overdueId: string) => void;
  onRemindMemberBalance: (memberName: string, totalDebt: number) => void;
  onBulkAccrual: (
    category: FinancialLineItem['category'],
    amount: number,
    description: string
  ) => void;
  onAddTreasuryEntry: (entry: Omit<TreasuryLedgerEntry, 'id'>) => void;
  onDownloadFinanceCsvNotify: () => void;
  kuverSummary?: KuverSummaryResult;
  minHotelGuarantee?: number;
  defaultUnitKuverCostTL?: number;
}

const CLUB_IBAN = 'TR42 0006 2000 4190 0006 2420 01';
const CLUB_ACCOUNT_NAME = 'Galata Rotary Kulübü Derneği — Garanti BBVA Beyoğlu Şb.';

export const FinanceTab: React.FC<FinanceTabProps> = ({
  activeRole,
  onSelectRole,
  financialItems,
  financeSummary,
  paymentNotifications,
  overdueMembers,
  members,
  treasuryLedger,
  onCopyIban,
  onSubmitPaymentNotification,
  onApprovePayment,
  onRejectPayment,
  onSendGentleReminder,
  onRemindMemberBalance,
  onBulkAccrual,
  onAddTreasuryEntry,
  onDownloadFinanceCsvNotify,
  kuverSummary,
  minHotelGuarantee = 35,
  defaultUnitKuverCostTL = 1850,
}) => {
  const [treasurerSubTab, setTreasurerSubTab] = useState<
    'approvals' | 'member_matrix' | 'treasury_ledger'
  >('approvals');

  // Member Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentCategory, setPaymentCategory] =
    useState<FinancialLineItem['category']>('Toplantı Kuver Bakiyesi');
  const [paymentAmount, setPaymentAmount] = useState('4800');
  const [paymentDescription, setPaymentDescription] = useState(
    'Pera Palace Ekim-Kasım Kuver Bakiyesi EFT'
  );
  const [receiptRef, setReceiptRef] = useState('FAST-2026-94810');
  const [formError, setFormError] = useState('');
  const [copiedJustNow, setCopiedJustNow] = useState(false);

  // Member Cari Matrix Search & Bulk Accrual Modal State
  const [matrixSearch, setMatrixSearch] = useState('');
  const [isBulkAccrualModalOpen, setIsBulkAccrualModalOpen] = useState(false);
  const [bulkCategory, setBulkCategory] =
    useState<FinancialLineItem['category']>('Toplantı Kuver Bakiyesi');
  const [bulkAmount, setBulkAmount] = useState('2400');
  const [bulkDescription, setBulkDescription] = useState(
    'Kasım 2026 Pera Palace Haftalık Toplantı Kuver Tahakkuku'
  );

  // New Treasury Ledger Entry Form State
  const [showAddLedgerForm, setShowAddLedgerForm] = useState(false);
  const [ledgerType, setLedgerType] = useState<'Gelir' | 'Gider'>('Gelir');
  const [ledgerCategory, setLedgerCategory] =
    useState<TreasuryLedgerEntry['category']>('Aidat & Kuver Tahsilatı');
  const [ledgerTitle, setLedgerTitle] = useState('');
  const [ledgerAmount, setLedgerAmount] = useState('45000');
  const [ledgerCounterparty, setLedgerCounterparty] = useState(
    'Galata RK Üye Tahsilatı'
  );

  const isTreasurerOrPresident =
    activeRole === 'sayman' || activeRole === 'baskan';

  const treasurySummary = calculateTreasurySummary(treasuryLedger, members);

  // Issue #42 Live State: Per-capita meeting cost sharing & exemptions bound to live club RSVP summary
  const effectiveKuverSummary =
    kuverSummary ||
    calculateKuverSummary(
      members.map((m) => ({
        memberId: m.id,
        memberName: m.fullName,
        status: m.rsvpStatus,
        menu: m.mealPreference,
        guestCount: m.rsvpStatus === 'with_guest' ? 1 : 0,
      })),
      'attending',
      'Standart'
    );
  const [unitKuverCostTL, setUnitKuverCostTL] = useState<number>(
    defaultUnitKuverCostTL
  );
  const [billableKuverCount, setBillableKuverCount] = useState<number>(
    Math.max(
      minHotelGuarantee,
      effectiveKuverSummary.totalKuver + 3
    )
  );
  const [exemptSpeakerCount, setExemptSpeakerCount] = useState<number>(1);
  const [exemptHonoraryOrYouthCount, setExemptHonoraryOrYouthCount] =
    useState<number>(2);

  const liveAttendingPayingMembers = Math.max(
    1,
    effectiveKuverSummary.attendingMembers
  );
  const livePayingCompanions = Math.max(
    0,
    effectiveKuverSummary.spousesCount + effectiveKuverSummary.guestsCount
  );

  const meetingCostSharing = calculateMeetingCostSharingAndExemptions({
    unitKuverCostTL,
    billableKuverCount,
    attendingPayingMembersCount: liveAttendingPayingMembers,
    payingCompanionsCount: livePayingCompanions,
    exemptSpeakerCount,
    exemptHonoraryOrYouthCount,
  });

  const filteredMatrixMembers = members.filter((m) => {
    const q = matrixSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return true;
    return (
      m.fullName.toLocaleLowerCase('tr-TR').includes(q) ||
      m.classification.toLocaleLowerCase('tr-TR').includes(q)
    );
  });

  const handleCopyIbanClick = () => {
    onCopyIban(CLUB_IBAN);
    setCopiedJustNow(true);
    setTimeout(() => setCopiedJustNow(false), 2000);
  };

  const handlePaymentFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(paymentAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError('Lütfen geçerli bir ödeme tutarı (TL) giriniz.');
      return;
    }
    if (!paymentDescription.trim()) {
      setFormError('Lütfen ödeme açıklaması giriniz.');
      return;
    }
    setFormError('');
    onSubmitPaymentNotification({
      category: paymentCategory,
      amount: numericAmount,
      description: paymentDescription.trim(),
      receiptRef:
        receiptRef.trim() || `DK-2026-${Math.floor(10000 + Math.random() * 89999)}`,
    });
    setIsPaymentModalOpen(false);
  };

  const handleBulkAccrualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(bulkAmount);
    if (!Number.isFinite(num) || num <= 0) return;
    onBulkAccrual(bulkCategory, num, bulkDescription.trim());
    setIsBulkAccrualModalOpen(false);
  };

  const handleAddLedgerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(ledgerAmount);
    if (!Number.isFinite(num) || num <= 0 || !ledgerTitle.trim()) return;
    onAddTreasuryEntry({
      date: '22 Ekim 2026',
      type: ledgerType,
      category: ledgerCategory,
      title: ledgerTitle.trim(),
      amount: num,
      referenceNo: `KASA-2026-${Math.floor(100 + Math.random() * 899)}`,
      counterparty: ledgerCounterparty.trim() || 'Galata Rotary Kulübü',
    });
    setLedgerTitle('');
    setShowAddLedgerForm(false);
  };

  const handleDownloadFinanceCsv = () => {
    const csvContent = generateMembersFinanceCsvContent(members);
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'galata-rotary-tum-uyeler-cari-matrisi.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onDownloadFinanceCsvNotify();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Member Personal Current Account + Bank IBAN + Payment History */}
        <div className="lg:col-span-6 space-y-6">
          {/* Prestige Balance Card */}
          <section
            aria-labelledby="member-wallet-heading"
            className="bg-gradient-to-br from-[#09152B] via-[#0C3C7C] to-[#17458F] text-white rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/15 pb-4">
              <div>
                <div className="text-xs text-[#F7A81B] font-semibold">
                  Üye Kişisel Cari Özeti · Rtn. Rifat Akın
                </div>
                <h1
                  id="member-wallet-heading"
                  className="font-serif-display text-2xl sm:text-3xl font-bold text-white mt-0.5"
                >
                  Şeffaf Saymanlık & Cüzdan
                </h1>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-300">Kalan Toplam Bakiye</div>
                <div
                  data-testid="remaining-balance-amount"
                  className="text-2xl sm:text-3xl font-bold font-mono-num text-[#F7A81B]"
                >
                  {formatTL(financeSummary.remainingBalance)}
                </div>
              </div>
            </div>

            {/* 3 Summary Metrics */}
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                <div className="text-slate-300">Dönem Tahakkuku</div>
                <div className="text-sm sm:text-base font-bold font-mono-num text-white mt-0.5">
                  {formatTL(financeSummary.totalObligation)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                <div className="text-slate-300">Onaylanan Ödeme</div>
                <div className="text-sm sm:text-base font-bold font-mono-num text-emerald-300 mt-0.5">
                  {formatTL(financeSummary.totalPaid)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                <div className="text-slate-300">Onay Bekleyen</div>
                <div className="text-sm sm:text-base font-bold font-mono-num text-[#F7A81B] mt-0.5">
                  {formatTL(financeSummary.pendingApprovalAmount)}
                </div>
              </div>
            </div>

            {/* IBAN & Quick Actions */}
            <div className="p-3.5 rounded-xl bg-[#0F172A]/80 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-300">{CLUB_ACCOUNT_NAME}</div>
                <div className="text-xs sm:text-sm font-mono-num font-semibold text-white tracking-wide mt-0.5 truncate">
                  {CLUB_IBAN}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyIbanClick}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copiedJustNow ? (
                    <Check className="w-4 h-4 text-[#F7A81B]" />
                  ) : (
                    <Copy className="w-4 h-4 text-[#F7A81B]" />
                  )}
                  <span>{copiedJustNow ? 'IBAN Kopyalandı' : 'IBAN Kopyala'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormError('');
                    setIsPaymentModalOpen(true);
                  }}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F7A81B] hover:bg-[#f9b53b] text-[#0F172A] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileUp className="w-4 h-4" />
                  <span>Dekont Yükle / Ödeme Bildir</span>
                </button>
              </div>
            </div>
          </section>

          {/* 3 Mandatory Line Items Breakdown */}
          <section
            aria-labelledby="line-items-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Kalem Bazlı Cari Hesap Dökümü
                </div>
                <h2
                  id="line-items-heading"
                  className="font-serif-display text-xl font-bold text-slate-900"
                >
                  Aidat, Toplantı Kuveri & Vakıf Katkı Payları
                </h2>
              </div>
              <span className="text-xs text-slate-500">2026-2027 Dönemi</span>
            </div>

            <div className="space-y-3">
              {financialItems.map((item) => {
                const remaining = Math.max(0, item.totalAmount - item.paidAmount);
                const isSettled = remaining === 0;
                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-[#0C3C7C]">
                        {item.category}
                      </div>
                      <div className="text-sm font-bold text-slate-900">{item.title}</div>
                      <div className="text-xs text-slate-500">
                        <span>Dönem: {item.period}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>Son Ödeme: {item.dueDate}</span>
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0 space-y-1">
                      <div className="text-xs text-slate-500">
                        Tahakkuk:{' '}
                        <span className="font-mono-num font-semibold text-slate-800">
                          {formatTL(item.totalAmount)}
                        </span>
                      </div>
                      <div className="text-sm font-mono-num font-bold">
                        {isSettled ? (
                          <span className="text-emerald-700">Tamamı Ödendi (0 TL)</span>
                        ) : (
                          <span className="text-slate-900">
                            Kalan: {formatTL(remaining)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Member's Submitted Payment Notifications */}
          <section
            aria-labelledby="submitted-receipts-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <h2
                id="submitted-receipts-heading"
                className="font-serif-display text-xl font-bold text-slate-900"
              >
                Son Dekont ve Ödeme Bildirimleri
              </h2>
              <span className="text-xs font-mono-num text-slate-500">
                {paymentNotifications.length} Kayıt
              </span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {paymentNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="p-3.5 bg-white flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">
                      {notif.memberName} — {notif.category}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">{notif.description}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono-num">
                      <span>Ref: {notif.receiptRef}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{notif.submittedAt}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono-num text-slate-900">
                      {formatTL(notif.amount)}
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        notif.status === 'Onaylandı'
                          ? 'text-emerald-700'
                          : notif.status === 'Reddedildi'
                          ? 'text-rose-600'
                          : 'text-amber-700'
                      }`}
                    >
                      Durum: {notif.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Full-Featured Treasurer & Club Ledger Panel (3 Sub-tabs) */}
        <div className="lg:col-span-6 space-y-6">
          {!isTreasurerOrPresident ? (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="font-serif-display text-xl font-bold text-slate-900">
                  Tam Kapsamlı Saymanlık & Kulüp Kasa Defteri
                </h2>
                <span className="text-xs text-slate-500">Yetkili Modül</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Bekleyen dekont onaylarını yönetmek, <strong>Tüm Üyeler Cari Matrisi</strong> üzerinden toplu tahakkuk/CSV dışa aktarımı yapmak ve <strong>Kulüp Kasa & Gelir-Gider Defterini</strong> incelemek için üst bardan veya aşağıdaki butondan <strong>Sayman</strong> rolüne geçebilirsiniz.
              </p>
              <button
                type="button"
                onClick={() => onSelectRole('sayman')}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] transition-colors cursor-pointer"
              >
                Sayman Rolüne Geç (YMM Levent Soydan)
              </button>
            </section>
          ) : (
            <section
              aria-labelledby="treasurer-panel-heading"
              className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
            >
              <div className="space-y-3 border-b border-slate-100 pb-4">
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Sayman & Başkan Yönetim Merkezi · Rtn. YMM Levent Soydan
                </div>
                <h2
                  id="treasurer-panel-heading"
                  className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900"
                >
                  Saymanlık, Cari Matris & Kasa Defteri
                </h2>

                {/* 3 Sub-tabs Switcher */}
                <div
                  role="tablist"
                  aria-label="Saymanlık Alt Sekmeleri"
                  className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={treasurerSubTab === 'approvals'}
                    onClick={() => setTreasurerSubTab('approvals')}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      treasurerSubTab === 'approvals'
                        ? 'bg-white text-[#0C3C7C] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bekleyen Dekont Onayları
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={treasurerSubTab === 'member_matrix'}
                    onClick={() => setTreasurerSubTab('member_matrix')}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      treasurerSubTab === 'member_matrix'
                        ? 'bg-white text-[#0C3C7C] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tüm Üyeler Cari Matrisi
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={treasurerSubTab === 'treasury_ledger'}
                    onClick={() => setTreasurerSubTab('treasury_ledger')}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      treasurerSubTab === 'treasury_ledger'
                        ? 'bg-white text-[#0C3C7C] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Kulüp Kasa & Gelir-Gider
                  </button>
                </div>
              </div>

              {/* SUB-TAB 1: Bekleyen Dekont Onayları */}
              {treasurerSubTab === 'approvals' && (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-700">
                      Onay Bekleyen Dekont Bildirimleri (
                      {paymentNotifications.filter((p) => p.status === 'Bekliyor').length})
                    </div>

                    {paymentNotifications.filter((p) => p.status === 'Bekliyor').length ===
                    0 ? (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                        Tüm bekleyen ödeme bildirimleri incelendi ve cari hesaplara işlendi.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {paymentNotifications
                          .filter((p) => p.status === 'Bekliyor')
                          .map((pending) => (
                            <div
                              key={pending.id}
                              className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-xs font-bold text-slate-900">
                                    {pending.memberName}
                                  </div>
                                  <div className="text-xs text-[#0C3C7C] font-semibold">
                                    {pending.category}
                                  </div>
                                </div>
                                <div className="text-right font-mono-num text-sm font-bold text-slate-900">
                                  {formatTL(pending.amount)}
                                </div>
                              </div>

                              <div className="text-xs text-slate-600">
                                <div>{pending.description}</div>
                                <div className="text-[11px] text-slate-500 font-mono-num mt-0.5">
                                  Dekont No: {pending.receiptRef} · {pending.submittedAt}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => onApprovePayment(pending.id)}
                                  className="min-h-[40px] px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>Onayla & Bakiyeden Düş</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRejectPayment(pending.id)}
                                  className="min-h-[40px] px-3 py-2 rounded-lg bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <XCircle className="w-4 h-4" />
                                  <span>Reddet</span>
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Overdue Balances & Gentle Reminder Action */}
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div className="text-xs font-semibold text-slate-700">
                      Vadesi Geçen Üye Bakiyeleri & Nazik Hatırlatma
                    </div>

                    <div className="space-y-2.5">
                      {overdueMembers.map((ov) => (
                        <div
                          key={ov.id}
                          className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-slate-900">
                                {ov.memberName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {ov.overdueCategory} · {ov.daysPastDue} gün gecikme
                              </div>
                            </div>
                            <div className="text-right font-mono-num text-xs font-bold text-rose-700">
                              {formatTL(ov.overdueAmount)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onSendGentleReminder(ov.id)}
                            className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-[#0C3C7C] hover:text-white text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <BellRing className="w-3.5 h-3.5" />
                            <span>
                              {ov.lastRemindedAt
                                ? `Hatırlatma Gönderildi (${ov.lastRemindedAt})`
                                : 'Nazik Hatırlatma Bildirimi Gönder'}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: Tüm Üyeler Cari Matrisi */}
              {treasurerSubTab === 'member_matrix' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={matrixSearch}
                        onChange={(e) => setMatrixSearch(e.target.value)}
                        placeholder="Üye adı veya sınıflandırma ara..."
                        className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-2 text-slate-900"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsBulkAccrualModalOpen(true)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Layers className="w-3.5 h-3.5 text-[#F7A81B]" />
                        <span>+ Toplu Tahakkuk (Borçlandırma)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadFinanceCsv}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5 text-[#0C3C7C]" />
                        <span>CSV İndir</span>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="p-2.5">Üye</th>
                          <th className="p-2.5 text-right">Aidat</th>
                          <th className="p-2.5 text-right">Kuver</th>
                          <th className="p-2.5 text-right">Vakıf</th>
                          <th className="p-2.5 text-right">Toplam</th>
                          <th className="p-2.5 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMatrixMembers.map((m) => {
                          const totalDebt =
                            m.duesBalance + m.mealBalance + m.foundationBalance;
                          return (
                            <tr key={m.id} className="hover:bg-slate-50/70">
                              <td className="p-2.5">
                                <div className="font-bold text-slate-900">
                                  Rtn. {m.fullName}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {m.rotaryId}
                                </div>
                              </td>
                              <td className="p-2.5 text-right font-mono-num">
                                {formatTL(m.duesBalance)}
                              </td>
                              <td className="p-2.5 text-right font-mono-num">
                                {formatTL(m.mealBalance)}
                              </td>
                              <td className="p-2.5 text-right font-mono-num">
                                {formatTL(m.foundationBalance)}
                              </td>
                              <td className="p-2.5 text-right font-mono-num font-bold text-[#0C3C7C]">
                                {formatTL(totalDebt)}
                              </td>
                              <td className="p-2.5 text-right">
                                {totalDebt > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onRemindMemberBalance(m.fullName, totalDebt)
                                    }
                                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-[#0C3C7C] text-amber-900 hover:text-white border border-amber-200 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    Hatırlat
                                  </button>
                                ) : (
                                  <span className="text-[11px] font-semibold text-emerald-700">
                                    Borcu Yok
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: Kulüp Kasa & Gelir-Gider Defteri */}
              {treasurerSubTab === 'treasury_ledger' && (
                <div className="space-y-4">
                  {/* Treasury Summary KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-[#0F172A] text-white">
                      <div className="text-slate-300 text-[11px]">
                        Net Banka Kasa Bakiyesi
                      </div>
                      <div className="text-base font-bold font-mono-num text-[#F7A81B] mt-0.5">
                        {formatTL(treasurySummary.netBankBalance)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-emerald-800 text-[11px]">
                        Dönem Tahsilat / Gelir
                      </div>
                      <div className="text-base font-bold font-mono-num text-emerald-900 mt-0.5">
                        +{formatTL(treasurySummary.totalIncome)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 col-span-2 sm:col-span-1">
                      <div className="text-slate-500 text-[11px]">
                        Üye Cari Alacaklar Toplamı
                      </div>
                      <div className="text-base font-bold font-mono-num text-[#0C3C7C] mt-0.5">
                        {formatTL(treasurySummary.totalMemberReceivables)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800">
                      Kulüp Kasa & Banka Hareketleri ({treasuryLedger.length})
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddLedgerForm((prev) => !prev)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-[#F7A81B]" />
                      <span>+ Yeni Gelir/Gider Kaydı Ekle</span>
                    </button>
                  </div>

                  {showAddLedgerForm && (
                    <form
                      onSubmit={handleAddLedgerSubmit}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label
                            htmlFor="ledger-type-select"
                            className="block text-[11px] font-semibold text-slate-700 mb-1"
                          >
                            İşlem Yönü
                          </label>
                          <select
                            id="ledger-type-select"
                            value={ledgerType}
                            onChange={(e) =>
                              setLedgerType(e.target.value as 'Gelir' | 'Gider')
                            }
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                          >
                            <option value="Gelir">Gelir (+ Kasa Girişi)</option>
                            <option value="Gider">Gider (- Kasa Çıkışı)</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="ledger-category-select"
                            className="block text-[11px] font-semibold text-slate-700 mb-1"
                          >
                            Kategori
                          </label>
                          <select
                            id="ledger-category-select"
                            value={ledgerCategory}
                            onChange={(e) =>
                              setLedgerCategory(
                                e.target.value as TreasuryLedgerEntry['category']
                              )
                            }
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                          >
                            <option value="Aidat & Kuver Tahsilatı">
                              Aidat & Kuver Tahsilatı
                            </option>
                            <option value="Otel & Banket Gideri">
                              Otel & Banket Gideri
                            </option>
                            <option value="UR Bölge & Vakıf">UR Bölge & Vakıf</option>
                            <option value="Burs & Proje Fonu">
                              Burs & Proje Fonu
                            </option>
                            <option value="Sponsorluk Geliri">
                              Sponsorluk Geliri
                            </option>
                          </select>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <label
                            htmlFor="ledger-amount-input"
                            className="block text-[11px] font-semibold text-slate-700 mb-1"
                          >
                            Tutar (TL)
                          </label>
                          <input
                            id="ledger-amount-input"
                            type="number"
                            min="100"
                            step="100"
                            value={ledgerAmount}
                            onChange={(e) => setLedgerAmount(e.target.value)}
                            className="w-full text-xs font-mono-num bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label
                            htmlFor="ledger-title-input"
                            className="block text-[11px] font-semibold text-slate-700 mb-1"
                          >
                            İşlem Açıklaması
                          </label>
                          <input
                            id="ledger-title-input"
                            type="text"
                            value={ledgerTitle}
                            onChange={(e) => setLedgerTitle(e.target.value)}
                            placeholder="Örn: Pera Palace #1842 Ön Avans Ödemesi"
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="ledger-counterparty-input"
                            className="block text-[11px] font-semibold text-slate-700 mb-1"
                          >
                            Muhatap Kurum / Kişi
                          </label>
                          <input
                            id="ledger-counterparty-input"
                            type="text"
                            value={ledgerCounterparty}
                            onChange={(e) => setLedgerCounterparty(e.target.value)}
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddLedgerForm(false)}
                          className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 cursor-pointer"
                        >
                          Vazgeç
                        </button>
                        <button
                          type="submit"
                          className="min-h-[34px] px-4 py-1 rounded-lg bg-[#0C3C7C] text-white text-xs font-semibold cursor-pointer"
                        >
                          Kasaya İşle
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {treasuryLedger.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3.5 bg-white flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                              entry.type === 'Gelir'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {entry.type === 'Gelir' ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900">{entry.title}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              <span>{entry.category}</span>
                              <span className="mx-1">·</span>
                              <span>{entry.counterparty}</span>
                              <span className="mx-1">·</span>
                              <span className="font-mono-num">{entry.date}</span>
                            </div>
                          </div>
                        </div>

                        <div
                          className={`text-right font-mono-num font-bold shrink-0 ${
                            entry.type === 'Gelir'
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {entry.type === 'Gelir' ? '+' : '-'}
                          {formatTL(entry.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Issue #42 Synthetic Pilot Module: Kişi Başı Toplantı Maliyeti ve Muafiyetler */}
          <section
            aria-labelledby="meeting-cost-sharing-heading"
            data-testid="meeting-cost-sharing-panel"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs"
          >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3.5">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Toplantı Banket Muhasebesi · Sentetik Pilot Modülü (#42)
                </div>
                <h2
                  id="meeting-cost-sharing-heading"
                  className="font-serif-display text-xl font-bold text-slate-900"
                >
                  Kişi Başı Toplantı Maliyeti & Muafiyet Paylaşımı
                </h2>
              </div>
              <span className="text-xs font-mono-num text-slate-500">
                {liveAttendingPayingMembers} Canlı LCV Üye · {livePayingCompanions} Eş/Konuk
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <label htmlFor="unit-cost-tl-input" className="block text-[11px] text-slate-500">
                  Birim Kuver (TL)
                </label>
                <input
                  id="unit-cost-tl-input"
                  type="number"
                  min={500}
                  step={50}
                  value={unitKuverCostTL}
                  onChange={(e) => setUnitKuverCostTL(Number(e.target.value) || 1850)}
                  className="w-full mt-0.5 font-mono-num font-bold text-slate-900 bg-transparent focus:outline-none"
                />
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <label htmlFor="billable-kuver-input" className="block text-[11px] text-slate-500">
                  Garanti Kuver Adedi
                </label>
                <input
                  id="billable-kuver-input"
                  type="number"
                  min={15}
                  max={80}
                  value={billableKuverCount}
                  onChange={(e) => setBillableKuverCount(Number(e.target.value) || 35)}
                  className="w-full mt-0.5 font-mono-num font-bold text-slate-900 bg-transparent focus:outline-none"
                />
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <label htmlFor="exempt-speaker-input" className="block text-[11px] text-slate-500">
                  Konuşmacı Muafiyeti
                </label>
                <input
                  id="exempt-speaker-input"
                  type="number"
                  min={0}
                  max={5}
                  value={exemptSpeakerCount}
                  onChange={(e) => setExemptSpeakerCount(Number(e.target.value) || 0)}
                  className="w-full mt-0.5 font-mono-num font-bold text-slate-900 bg-transparent focus:outline-none"
                />
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <label htmlFor="exempt-honorary-input" className="block text-[11px] text-slate-500">
                  Onur / Rotaract Muafiyeti
                </label>
                <input
                  id="exempt-honorary-input"
                  type="number"
                  min={0}
                  max={10}
                  value={exemptHonoraryOrYouthCount}
                  onChange={(e) => setExemptHonoraryOrYouthCount(Number(e.target.value) || 0)}
                  className="w-full mt-0.5 font-mono-num font-bold text-slate-900 bg-transparent focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#0F172A] text-white">
                <div className="text-[11px] text-slate-300">Kişi Başı Efektif Tutar</div>
                <div className="text-base font-bold font-mono-num text-[#F7A81B] mt-0.5">
                  {formatTL(meetingCostSharing.effectivePerMemberTotalTL)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">Toplam Otel Faturası</div>
                <div className="text-sm font-bold font-mono-num text-slate-900 mt-0.5">
                  {formatTL(meetingCostSharing.totalHotelInvoiceTL)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">Muafiyet Maliyeti ({meetingCostSharing.totalExemptionsCount} Kişi)</div>
                <div className="text-sm font-bold font-mono-num text-[#0C3C7C] mt-0.5">
                  {formatTL(meetingCostSharing.clubSubsidizedExemptionCostTL)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">Üye Başı Ortak Havuz Farkı</div>
                <div className="text-sm font-bold font-mono-num text-emerald-800 mt-0.5">
                  +{formatTL(meetingCostSharing.perPayingMemberSharedSurchargeTL)}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Modal: Dekont Yükle / Ödeme Bildir */}
      {isPaymentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3
                id="payment-modal-title"
                className="font-serif-display text-xl font-bold text-slate-900"
              >
                Dekont Yükle / Ödeme Bildir
              </h3>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="min-h-[36px] px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handlePaymentFormSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="payment-category-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Ödeme Kalemi
                </label>
                <select
                  id="payment-category-select"
                  value={paymentCategory}
                  onChange={(e) =>
                    setPaymentCategory(
                      e.target.value as FinancialLineItem['category']
                    )
                  }
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                >
                  <option value="Toplantı Kuver Bakiyesi">
                    Toplantı Kuver Bakiyesi
                  </option>
                  <option value="Dönem Aidatı">Dönem Aidatı</option>
                  <option value="Vakıf / Proje Katkı Payı">
                    Vakıf / Proje Katkı Payı
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="payment-amount-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Tutar (TL)
                  </label>
                  <input
                    id="payment-amount-input"
                    type="number"
                    min="100"
                    step="50"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full text-sm font-mono-num bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="payment-ref-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Dekont / Sorgu No
                  </label>
                  <input
                    id="payment-ref-input"
                    type="text"
                    value={receiptRef}
                    onChange={(e) => setReceiptRef(e.target.value)}
                    className="w-full text-sm font-mono-num bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="payment-desc-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Açıklama / Dekont Notu
                </label>
                <input
                  id="payment-desc-input"
                  type="text"
                  value={paymentDescription}
                  onChange={(e) => setPaymentDescription(e.target.value)}
                  placeholder="Örn: Ekim Kuver Bakiyesi EFT"
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              {formError && (
                <p role="alert" className="text-xs font-medium text-rose-600">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] cursor-pointer"
                >
                  Sayman Onayına Gönder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: + Toplu Tahakkuk (Borçlandırma) */}
      {isBulkAccrualModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-accrual-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Saymanlık Toplu Cari İşlemi
                </div>
                <h3
                  id="bulk-accrual-modal-title"
                  className="font-serif-display text-xl font-bold text-slate-900"
                >
                  Tüm Üyelere Toplu Tahakkuk Yansıt
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkAccrualModalOpen(false)}
                className="min-h-[36px] px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handleBulkAccrualSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="bulk-category-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Tahakkuk Kalemi
                </label>
                <select
                  id="bulk-category-select"
                  value={bulkCategory}
                  onChange={(e) =>
                    setBulkCategory(
                      e.target.value as FinancialLineItem['category']
                    )
                  }
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                >
                  <option value="Toplantı Kuver Bakiyesi">
                    Toplantı Kuver Bakiyesi
                  </option>
                  <option value="Dönem Aidatı">Dönem Aidatı</option>
                  <option value="Vakıf / Proje Katkı Payı">
                    Vakıf / Proje Katkı Payı
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="bulk-amount-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Üye Başı Tutar (TL)
                </label>
                <input
                  id="bulk-amount-input"
                  type="number"
                  min="100"
                  step="100"
                  value={bulkAmount}
                  onChange={(e) => setBulkAmount(e.target.value)}
                  className="w-full text-sm font-mono-num bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="bulk-desc-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Tahakkuk Açıklaması
                </label>
                <input
                  id="bulk-desc-input"
                  type="text"
                  value={bulkDescription}
                  onChange={(e) => setBulkDescription(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBulkAccrualModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] cursor-pointer"
                >
                  {members.length} Üyeye Tahakkuk Yansıt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
