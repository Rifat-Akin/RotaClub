import React, { useState } from 'react';
import {
  CheckCircle2,
  Flame,
  Mail,
  MapPin,
  PlusCircle,
  QrCode,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  ClubRole,
  FiresideGroup,
  GuestRotaryMakeupCard,
  MakeupSubmission,
} from '../types/rotary';
import { RotaryWheelIcon } from './RotaryArtwork';

interface OperationsTabProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  qrCheckedIn: boolean;
  onSimulateQrCheckIn: () => void;
  makeupSubmissions: MakeupSubmission[];
  onAddMakeupSubmission: (submission: Omit<MakeupSubmission, 'id' | 'status' | 'attendanceBoost' | 'memberName'>) => void;
  guestMakeupCards: GuestRotaryMakeupCard[];
  onSendGuestMakeupCard: (card: Omit<GuestRotaryMakeupCard, 'id' | 'sentAt' | 'verificationCode'>) => void;
  firesideGroups: FiresideGroup[];
  onSubmitFiresideReport: (groupId: string, summary: string, attendanceRate: string) => void;
}

export const OperationsTab: React.FC<OperationsTabProps> = ({
  activeRole,
  onSelectRole,
  qrCheckedIn,
  onSimulateQrCheckIn,
  makeupSubmissions,
  onAddMakeupSubmission,
  guestMakeupCards,
  onSendGuestMakeupCard,
  firesideGroups,
  onSubmitFiresideReport,
}) => {
  const [makeupSubTab, setMakeupSubTab] = useState<'member_makeup' | 'guest_makeup'>('member_makeup');

  // Member Make-up Form State
  const [targetClub, setTargetClub] = useState('Karaköy Rotary Kulübü Toplantısı');
  const [activityType, setActivityType] = useState<MakeupSubmission['activityType']>('Kulüp Toplantısı');
  const [makeupDate, setMakeupDate] = useState('2026-10-22');
  const [makeupDesc, setMakeupDesc] = useState('');
  const [makeupError, setMakeupError] = useState('');

  // Guest Rotarian Make-up Card Form State (Secretary Special)
  const [guestName, setGuestName] = useState('Rtn. Sinan Kuyumcu');
  const [guestClub, setGuestClub] = useState('Karaköy Rotary Kulübü');
  const [guestDistrict, setGuestDistrict] = useState('UR 2420. Bölge');
  const [guestEmail, setGuestEmail] = useState('sekreterlik@karakoyrotary.org');
  const [guestFormError, setGuestFormError] = useState('');

  // Fireside (Ocakbaşı) Report Modal State
  const [activeReportGroupId, setActiveReportGroupId] = useState<string | null>(null);
  const [reportText, setReportText] = useState('');
  const [reportAttendance, setReportAttendance] = useState('%100 (6/6 Üye)');
  const [reportError, setReportError] = useState('');

  const handleMemberMakeupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClub.trim() || !makeupDesc.trim()) {
      setMakeupError('Lütfen katıldığınız kulüp/etkinlik adını ve kısa açıklamayı giriniz.');
      return;
    }
    setMakeupError('');
    onAddMakeupSubmission({
      targetClubOrEvent: targetClub.trim(),
      activityType,
      date: makeupDate,
      description: makeupDesc.trim(),
    });
    setMakeupDesc('');
  };

  const handleGuestCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !guestClub.trim() || !guestEmail.trim()) {
      setGuestFormError('Lütfen misafir Rotaryenin adını, kulübünü ve e-posta adresini eksiksiz giriniz.');
      return;
    }
    setGuestFormError('');
    onSendGuestMakeupCard({
      guestName: guestName.trim(),
      guestClub: guestClub.trim(),
      guestDistrict: guestDistrict.trim() || 'UR 2420. Bölge',
      guestEmail: guestEmail.trim(),
      meetingNo: 1842,
      meetingDate: '27 Ekim 2026',
    });
  };

  const handleFiresideReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReportGroupId) return;
    if (!reportText.trim()) {
      setReportError('Lütfen Ocakbaşı toplantı tutanağı özetini giriniz.');
      return;
    }
    setReportError('');
    onSubmitFiresideReport(activeReportGroupId, reportText.trim(), reportAttendance);
    setActiveReportGroupId(null);
    setReportText('');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Simulated QR Attendance Pass + Digital Make-up Engine */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 1: QR Yoklama Simulator */}
          <section
            aria-labelledby="qr-attendance-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Hızlı Toplantı Yoklaması
                </div>
                <h1
                  id="qr-attendance-heading"
                  className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900"
                >
                  Pera Palace Masa QR Yoklama Ekranı
                </h1>
              </div>
              <span className="text-xs font-mono-num text-slate-500">
                Toplantı #1842 · Salon Girişi
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
              {/* Simulated High-Contrast QR Code Frame */}
              <div className="sm:col-span-5 flex flex-col items-center justify-center p-4 rounded-2xl bg-[#0F172A] text-white border border-slate-800">
                <div className="w-36 h-36 bg-white p-3 rounded-xl flex items-center justify-center relative">
                  <svg
                    viewBox="0 0 120 120"
                    className="w-full h-full text-[#0F172A]"
                    aria-label="Galata Rotary Toplantı QR Kodu"
                  >
                    <rect x="6" y="6" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="6" />
                    <rect x="14" y="14" width="16" height="16" fill="currentColor" />
                    <rect x="82" y="6" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="6" />
                    <rect x="90" y="14" width="16" height="16" fill="currentColor" />
                    <rect x="6" y="82" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="6" />
                    <rect x="14" y="90" width="16" height="16" fill="currentColor" />
                    {/* QR Data Matrix Pattern */}
                    <rect x="46" y="10" width="8" height="8" fill="currentColor" />
                    <rect x="62" y="10" width="8" height="16" fill="currentColor" />
                    <rect x="46" y="26" width="12" height="8" fill="currentColor" />
                    <rect x="12" y="48" width="16" height="8" fill="currentColor" />
                    <rect x="36" y="48" width="8" height="16" fill="currentColor" />
                    <rect x="52" y="48" width="16" height="16" fill="#0C3C7C" />
                    <rect x="76" y="48" width="8" height="12" fill="currentColor" />
                    <rect x="92" y="46" width="18" height="8" fill="currentColor" />
                    <rect x="46" y="74" width="16" height="8" fill="currentColor" />
                    <rect x="70" y="70" width="12" height="16" fill="currentColor" />
                    <rect x="90" y="78" width="20" height="12" fill="currentColor" />
                    <rect x="48" y="94" width="24" height="16" fill="currentColor" />
                    <rect x="82" y="98" width="12" height="12" fill="currentColor" />
                  </svg>
                </div>
                <div className="mt-2.5 text-center">
                  <div className="text-xs font-mono-num text-[#F7A81B] font-semibold">
                    TR-2420-88412 · Rifat Akın
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {qrCheckedIn ? 'Yoklama Kaydedildi' : 'Okutmaya Hazır'}
                  </div>
                </div>
              </div>

              {/* QR Action & Status Details */}
              <div className="sm:col-span-7 space-y-3">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Toplantı girişinde Sekreterlik masasında bulunan karekod okuyucuya ekranınızı gösterin veya simülasyon butonuyla anında yoklama kaydınızı oluşturun.
                </p>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Üye Sicil No:</span>
                    <span className="font-mono-num font-semibold text-slate-900">TR-2420-88412</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Toplantı Durumu:</span>
                    <span className="font-semibold text-[#0C3C7C]">
                      {qrCheckedIn ? 'Salonda — Yoklama Alındı (+%2)' : 'Henüz Okutulmadı'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onSimulateQrCheckIn}
                  disabled={qrCheckedIn}
                  className={`w-full min-h-[46px] px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    qrCheckedIn
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                      : 'bg-[#0C3C7C] text-white hover:bg-[#17458F]'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>
                    {qrCheckedIn
                      ? 'QR Yoklama Başarıyla Kaydedildi'
                      : 'QR Kodu Simüle Et & Yoklamaya Katıl (+%2 Katılım)'}
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Section 2: Digital Make-up Engine with 2 Sub-tabs */}
          <section
            aria-labelledby="makeup-engine-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Dijital Make-up Motoru
                </div>
                <h2
                  id="makeup-engine-heading"
                  className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900"
                >
                  Make-up Bildirimi & Misafir Rotaryen Kartı
                </h2>
              </div>

              {/* Sub-tab Switcher */}
              <div
                role="tablist"
                aria-label="Make-up Alt Sekmeleri"
                className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={makeupSubTab === 'member_makeup'}
                  onClick={() => setMakeupSubTab('member_makeup')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    makeupSubTab === 'member_makeup'
                      ? 'bg-white text-[#0C3C7C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Make-up Bildir
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={makeupSubTab === 'guest_makeup'}
                  onClick={() => setMakeupSubTab('guest_makeup')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    makeupSubTab === 'guest_makeup'
                      ? 'bg-white text-[#0C3C7C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Misafir Make-up Gönder (Sekreter)
                </button>
              </div>
            </div>

            {makeupSubTab === 'member_makeup' ? (
              <div className="space-y-5">
                <form onSubmit={handleMemberMakeupSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="makeup-club-input"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Ziyaret Edilen Kulüp veya Proje
                      </label>
                      <input
                        id="makeup-club-input"
                        type="text"
                        value={targetClub}
                        onChange={(e) => setTargetClub(e.target.value)}
                        placeholder="Örn: Maçka Rotary Kulübü Toplantısı"
                        className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="makeup-type-select"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Etkinlik Türü
                      </label>
                      <select
                        id="makeup-type-select"
                        value={activityType}
                        onChange={(e) =>
                          setActivityType(e.target.value as MakeupSubmission['activityType'])
                        }
                        className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                      >
                        <option value="Kulüp Toplantısı">Başka Kulüp Toplantısı</option>
                        <option value="Hizmet Projesi">Kulüp Hizmet Projesi</option>
                        <option value="Bölge Semineri">UR 2420. Bölge Semineri</option>
                        <option value="Komite Toplantısı">Bölge / Kulüp Komite Toplantısı</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label
                        htmlFor="makeup-date-input"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Katılım Tarihi
                      </label>
                      <input
                        id="makeup-date-input"
                        type="date"
                        value={makeupDate}
                        onChange={(e) => setMakeupDate(e.target.value)}
                        className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-mono-num focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="makeup-desc-input"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Make-up Notu / Konuşmacı veya Proje Detayı
                      </label>
                      <input
                        id="makeup-desc-input"
                        type="text"
                        value={makeupDesc}
                        onChange={(e) => setMakeupDesc(e.target.value)}
                        placeholder="Örn: Ortak Boğaziçi Çevre Projesi komite çalışmasına katılım"
                        className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                      />
                    </div>
                  </div>

                  {makeupError && (
                    <p role="alert" className="text-xs font-medium text-rose-600">
                      {makeupError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Make-up Bildir ve Devam Yüzdemi Artır (+%3 Katılım)</span>
                  </button>
                </form>

                {/* Recent Make-ups List */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-700">
                    Dönem İçi Kayıtlı Make-up Bildirimleriniz ({makeupSubmissions.length})
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {makeupSubmissions.map((mk) => (
                      <div key={mk.id} className="p-3 bg-white flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900">
                            {mk.targetClubOrEvent}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            <span>{mk.activityType}</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="font-mono-num">{mk.date}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{mk.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-emerald-700">
                            {mk.status}
                          </div>
                          <div className="text-[11px] font-mono-num text-[#0C3C7C] font-semibold">
                            +%{mk.attendanceBoost} Katılım
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Sub-tab B: Misafir Rotaryen Make-up Gönder (Sekreter Özel) */
              <div className="space-y-5">
                {activeRole !== 'sekreter' && activeRole !== 'baskan' && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-amber-900">
                      Resmi antetli <strong>Dijital Make-up Kartı</strong> gönderimi Genel Sekreter ve Başkan yetkisindedir. Önizlemeyi test edebilir veya tek tuşla Genel Sekreter rolüne geçebilirsiniz.
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelectRole('sekreter')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0C3C7C] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Genel Sekreter Rolüne Geç
                    </button>
                  </div>
                )}

                <form onSubmit={handleGuestCardSubmit} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label
                        htmlFor="guest-rotarian-name"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Misafir Rotaryen Adı Soyadı
                      </label>
                      <input
                        id="guest-rotarian-name"
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Örn: Rtn. Sinan Kuyumcu"
                        className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="guest-rotarian-club"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Üyesi Olduğu Kulüp
                      </label>
                      <input
                        id="guest-rotarian-club"
                        type="text"
                        value={guestClub}
                        onChange={(e) => setGuestClub(e.target.value)}
                        placeholder="Örn: Karaköy Rotary / Maçka Rotary"
                        className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="guest-rotarian-email"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Kulüp Sekreterliği E-Postası
                      </label>
                      <input
                        id="guest-rotarian-email"
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="sekreter@karakoyrotary.org"
                        className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                      />
                    </div>
                  </div>

                  {guestFormError && (
                    <p role="alert" className="text-xs font-medium text-rose-600">
                      {guestFormError}
                    </p>
                  )}

                  {/* Official Galata Rotary Letterhead Digital Make-up Card Preview */}
                  <div className="rounded-2xl border-2 border-[#0C3C7C]/25 bg-gradient-to-br from-white via-slate-50 to-[#F8FAFC] p-5 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-[#0C3C7C] text-[#F7A81B] flex items-center justify-center shrink-0">
                          <RotaryWheelIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-serif-display text-base font-bold text-[#0C3C7C]">
                            GALATA ROTARY KULÜBÜ — UR 2420. BÖLGE
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Resmi Dijital Make-up Katılım Belgesi (Official Attendance Make-up Card)
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono-num text-[11px] text-slate-500">
                        <div>Toplantı #1842</div>
                        <div>27 Ekim 2026</div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-700 space-y-2 leading-relaxed">
                      <p>
                        Sayın <strong>{guestClub || 'İlgili Rotary Kulübü'}</strong> Genel Sekreterliği’ne,
                      </p>
                      <p>
                        Kulübünüzün değerli üyesi{' '}
                        <strong className="text-[#0C3C7C]">{guestName || 'Misafir Rotaryen'}</strong>,
                        27 Ekim 2026 Salı günü Pera Palace Hotel Galata Salonu’nda gerçekleştirdiğimiz{' '}
                        <strong>1842. Haftalık Kulüp Toplantımıza</strong> katılarak bizleri onurlandırmıştır.
                        Üyenizin devam çizelgesinde <strong>Make-up</strong> olarak işlenmesini rica eder,
                        Rotaryen sevgi ve saygılarımızı sunarız.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                      <div>
                        <span>Alıcı E-Posta: </span>
                        <span className="font-mono-num font-semibold text-slate-800">
                          {guestEmail || '—'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-slate-800">
                          Rtn. Av. Nazlı Denizmen
                        </span>
                        <span className="mx-1">·</span>
                        <span>Galata RK Genel Sekreteri</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      Galata Rotary Antetli Dijital Make-up Kartını Kulübüne Gönder
                    </span>
                  </button>
                </form>

                {/* Sent Guest Make-up History */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-700">
                    Gönderilen Misafir Rotaryen Make-up Kartları ({guestMakeupCards.length})
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {guestMakeupCards.map((card) => (
                      <div
                        key={card.id}
                        className="p-3 bg-white flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">
                            {card.guestName} · {card.guestClub}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <span>{card.guestEmail}</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="font-mono-num">{card.sentAt}</span>
                          </div>
                        </div>
                        <div className="text-right font-mono-num text-[11px] text-emerald-700 font-semibold">
                          İletildi ({card.verificationCode})
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Ocakbaşı (Fireside) Planner & Host Report Upload */}
        <div className="lg:col-span-5 space-y-6">
          <section
            aria-labelledby="fireside-planner-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
          >
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0C3C7C]">
                <Flame className="w-4 h-4 text-[#F7A81B]" />
                <span>Ocakbaşı (Fireside) Planlayıcı</span>
              </div>
              <h2
                id="fireside-planner-heading"
                className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5"
              >
                Aktif Ocakbaşı Grupları & Raporlama
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Ev sahibi üyeler toplantı sonrası Ocakbaşı karar ve yoklama özetini buradan yükler.
              </p>
            </div>

            <div className="space-y-4">
              {firesideGroups.map((group) => (
                <div
                  key={group.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {group.groupName}
                      </h3>
                      <div className="text-xs text-[#0C3C7C] font-semibold mt-0.5">
                        Ev Sahibi: {group.hostMember}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        group.reportSubmitted ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {group.reportSubmitted ? 'Rapor Yüklendi' : 'Rapor Bekleniyor'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1">
                    <div>
                      <span className="font-semibold text-slate-800">Tarih & Saat: </span>
                      <span>{group.date} · {group.time}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Konum: </span>
                      <span>{group.location} ({group.addressDetail})</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Gündem: </span>
                      <span>{group.topic}</span>
                    </div>
                  </div>

                  {/* Participant List */}
                  <div className="pt-1">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">
                      Katılımcı Üyeler ({group.participants.length} Rotaryen):
                    </div>
                    <div className="text-xs text-slate-700 leading-relaxed">
                      {group.participants.join(' · ')}
                    </div>
                  </div>

                  {group.reportSubmitted && group.reportSummary && (
                    <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between font-semibold text-emerald-800">
                        <span>Ev Sahibi Ocakbaşı Tutanağı</span>
                        <span className="font-mono-num">{group.attendanceRate}</span>
                      </div>
                      <p className="text-slate-600 leading-relaxed">{group.reportSummary}</p>
                    </div>
                  )}

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveReportGroupId(group.id);
                        setReportText(
                          group.reportSummary ||
                            'Grup üyelerinin tam katılımıyla gündem maddeleri görüşüldü, proje komite önerileri kayıt altına alındı.'
                        );
                        setReportError('');
                      }}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white border border-slate-300 hover:border-[#0C3C7C] text-xs font-semibold text-[#0C3C7C] transition-colors cursor-pointer"
                    >
                      {group.reportSubmitted
                        ? 'Ocakbaşı Raporunu Güncelle'
                        : 'Ev Sahibi Olarak Ocakbaşı Raporu Yükle'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Modal for Uploading Fireside (Ocakbaşı) Report */}
      {activeReportGroupId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fireside-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3
                id="fireside-modal-title"
                className="font-serif-display text-xl font-bold text-slate-900"
              >
                Ocakbaşı Toplantı Raporu Yükle
              </h3>
              <button
                type="button"
                onClick={() => setActiveReportGroupId(null)}
                className="min-h-[36px] px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handleFiresideReportSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="fireside-attendance-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Grup Katılım Oranı
                </label>
                <select
                  id="fireside-attendance-select"
                  value={reportAttendance}
                  onChange={(e) => setReportAttendance(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                >
                  <option value="%100 (Tam Katılım)">%100 (Tam Katılım)</option>
                  <option value="%85 (1 Mazeretli)">%85 (1 Mazeretli)</option>
                  <option value="%80 (Konuklu Katılım)">%80 (Konuklu Katılım)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="fireside-report-textarea"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Toplantı Kararları ve Dostluk Notları Özeti
                </label>
                <textarea
                  id="fireside-report-textarea"
                  rows={4}
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Ocakbaşı toplantısında alınan kararları ve katılımcı görüşlerini yazınız..."
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                />
              </div>

              {reportError && (
                <p role="alert" className="text-xs font-medium text-rose-600">
                  {reportError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveReportGroupId(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] cursor-pointer"
                >
                  Raporu Kaydet & Sekreterliğe İlet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
