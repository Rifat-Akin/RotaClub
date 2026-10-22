import React, { useState } from 'react';
import {
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  FileUp,
  Receipt,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  ClubRole,
  FinancialLineItem,
  OverdueMemberItem,
  PaymentNotification,
} from '../types/rotary';
import { formatTL, MemberFinanceSummary } from '../utils/rotaryLogic';

interface FinanceTabProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  financialItems: FinancialLineItem[];
  financeSummary: MemberFinanceSummary;
  paymentNotifications: PaymentNotification[];
  overdueMembers: OverdueMemberItem[];
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
  onCopyIban,
  onSubmitPaymentNotification,
  onApprovePayment,
  onRejectPayment,
  onSendGentleReminder,
}) => {
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

  const isTreasurerOrPresident = activeRole === 'sayman' || activeRole === 'baskan';

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
      receiptRef: receiptRef.trim() || `DK-2026-${Math.floor(10000 + Math.random() * 89999)}`,
    });
    setIsPaymentModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Member Personal Current Account (Cari Özet) + Bank IBAN + Payment History */}
        <div className="lg:col-span-7 space-y-6">
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

          {/* 3 Mandatory Line Items Breakdown: Dönem Aidatı, Toplantı Kuver Bakiyesi, Vakıf / Proje Katkı Payı */}
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

        {/* Right Column: Treasurer Panel (Sayman Paneli) */}
        <div className="lg:col-span-5 space-y-6">
          {!isTreasurerOrPresident ? (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="font-serif-display text-xl font-bold text-slate-900">
                  Sayman Yönetim Paneli
                </h2>
                <span className="text-xs text-slate-500">Yetkili Modül</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Üyelerden gelen dekont bildirimlerini <strong>Onayla / Reddet</strong> butonuyla cari bakiyeden düşmek ve geciken ödemeler için <strong>Nazik Hatırlatma Bildirimi</strong> göndermek üzere üst bardan veya aşağıdaki butondan <strong>Sayman</strong> rolüne geçebilirsiniz.
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
              <div className="border-b border-slate-100 pb-4">
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Sayman Özel Yönetim Ekranı · Rtn. YMM Levent Soydan
                </div>
                <h2
                  id="treasurer-panel-heading"
                  className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5"
                >
                  Ödeme Onay Merkezi & Geciken Bakiyeler
                </h2>
              </div>

              {/* Pending Payment Notifications for Approval/Rejection */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-700">
                  Onay Bekleyen Dekont Bildirimleri (
                  {paymentNotifications.filter((p) => p.status === 'Bekliyor').length})
                </div>

                {paymentNotifications.filter((p) => p.status === 'Bekliyor').length === 0 ? (
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
            </section>
          )}
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
                    setPaymentCategory(e.target.value as FinancialLineItem['category'])
                  }
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                >
                  <option value="Toplantı Kuver Bakiyesi">Toplantı Kuver Bakiyesi</option>
                  <option value="Dönem Aidatı">Dönem Aidatı</option>
                  <option value="Vakıf / Proje Katkı Payı">Vakıf / Proje Katkı Payı</option>
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
    </div>
  );
};
