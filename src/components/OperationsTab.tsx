import React, { useState } from 'react';
import {
  Flame,
  Plus,
  PlusCircle,
  Printer,
  QrCode,
  Send,
  Users,
} from 'lucide-react';
import {
  ClubRole,
  FiresideGroup,
  GuestRotaryMakeupCard,
  MakeupSubmission,
  RotaryMember,
} from '../types/rotary';
import {
  calculateVolunteerShiftMetrics,
  SYNTHETIC_VOLUNTEER_SHIFTS,
  toggleVolunteerShiftAssignment,
  VolunteerShiftSlot,
} from '../utils/rotaryLogic';
import { RotaryWheelIcon } from './RotaryArtwork';

interface OperationsTabProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  qrCheckedIn: boolean;
  onSimulateQrCheckIn: (qrTokenInput?: string) => void;
  onGenerateMeetingQrToken?: () => Promise<string | null>;
  activeSalonQrToken?: string;
  makeupSubmissions: MakeupSubmission[];
  onAddMakeupSubmission: (
    submission: Omit<MakeupSubmission, 'id' | 'status' | 'attendanceBoost' | 'memberName'>
  ) => void;
  onApproveMakeupSubmission?: (makeupId: string) => void;
  onRejectMakeupSubmission?: (makeupId: string) => void;
  guestMakeupCards: GuestRotaryMakeupCard[];
  onSendGuestMakeupCard: (
    card: Omit<GuestRotaryMakeupCard, 'id' | 'sentAt' | 'verificationCode'>
  ) => void;
  onOpenOfficialCertificateModal: (card: GuestRotaryMakeupCard) => void;
  firesideGroups: FiresideGroup[];
  onSubmitFiresideReport: (groupId: string, summary: string, attendanceRate: string) => void;
  members: RotaryMember[];
  onCreateFiresideGroup: (newGroup: Omit<FiresideGroup, 'id' | 'reportSubmitted'>) => void;
  activeMemberName?: string;
  volunteerShifts?: VolunteerShiftSlot[];
  onToggleVolunteerShift?: (shiftId: string, volunteerName: string) => void;
}

export const OperationsTab: React.FC<OperationsTabProps> = ({
  activeRole,
  onSelectRole,
  qrCheckedIn,
  onSimulateQrCheckIn,
  onGenerateMeetingQrToken,
  activeSalonQrToken,
  makeupSubmissions,
  onAddMakeupSubmission,
  onApproveMakeupSubmission,
  onRejectMakeupSubmission,
  guestMakeupCards,
  onSendGuestMakeupCard,
  onOpenOfficialCertificateModal,
  firesideGroups,
  onSubmitFiresideReport,
  members,
  onCreateFiresideGroup,
  activeMemberName,
  volunteerShifts: externalVolunteerShifts,
  onToggleVolunteerShift,
}) => {
  const [makeupSubTab, setMakeupSubTab] = useState<'member_makeup' | 'guest_makeup'>(
    'member_makeup'
  );
  const [qrTokenDraft, setQrTokenDraft] = useState('');

  // Member Make-up Form State
  const [targetClub, setTargetClub] = useState('Karaköy Rotary Kulübü Toplantısı');
  const [activityType, setActivityType] =
    useState<MakeupSubmission['activityType']>('Kulüp Toplantısı');
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

  // New Fireside Group Creation Modal State (Secretary / President)
  const [isNewFiresideModalOpen, setIsNewFiresideModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState(
    '4. Grup Ocakbaşı — Cihangir & Tophane Buluşması'
  );
  const [newGroupHost, setNewGroupHost] = useState('Rtn. Rifat Akın');
  const [newGroupDate, setNewGroupDate] = useState('12 Kasım 2026 Perşembe');
  const [newGroupTime, setNewGroupTime] = useState('20:00');
  const [newGroupLocation, setNewGroupLocation] = useState('Cihangir Savoia Rezidans');
  const [newGroupAddress, setNewGroupAddress] = useState('Sıraselviler Cad. No: 42 Beyoğlu');
  const [newGroupTopic, setNewGroupTopic] = useState(
    'Gençlik Hizmetleri & RYLA Liderlik Kampı Bursiyer Seçimi'
  );
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([
    'Rtn. Rifat Akın',
    'Rtn. Av. Nazlı Denizmen',
    'Rtn. Dr. Kerem Aydın',
    'Rtn. Zeynep Korkmaz',
  ]);

  const isBoardLeader = activeRole === 'sekreter' || activeRole === 'baskan';

  // Issue #46 Live Volunteer, Task & Shift Management bound to authenticated session member
  const effectiveVolunteerName = activeMemberName || 'Rtn. Rifat Akın';

  const [localVolunteerShifts, setLocalVolunteerShifts] = useState<
    VolunteerShiftSlot[]
  >(SYNTHETIC_VOLUNTEER_SHIFTS);
  const volunteerShifts = externalVolunteerShifts || localVolunteerShifts;
  const shiftMetrics = calculateVolunteerShiftMetrics(volunteerShifts);

  const handleToggleShiftSlot = (shiftId: string) => {
    if (onToggleVolunteerShift) {
      onToggleVolunteerShift(shiftId, effectiveVolunteerName);
    } else {
      setLocalVolunteerShifts((prev) =>
        toggleVolunteerShiftAssignment(prev, shiftId, effectiveVolunteerName)
      );
    }
  };

  const handleMemberMakeupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClub.trim() || !makeupDesc.trim()) {
      setMakeupError(
        'Lütfen katıldığınız kulüp/etkinlik adını ve kısa açıklamayı giriniz.'
      );
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
      setGuestFormError(
        'Lütfen misafir Rotaryenin adını, kulübünü ve e-posta adresini eksiksiz giriniz.'
      );
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

  const toggleParticipantSelection = (memberFullName: string) => {
    const label = `Rtn. ${memberFullName}`;
    setSelectedParticipants((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  const handleCreateNewFiresideSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !newGroupLocation.trim()) return;
    const hostInfo = members.find(
      (m) => `Rtn. ${m.fullName}` === newGroupHost || m.fullName === newGroupHost
    );
    onCreateFiresideGroup({
      groupName: newGroupName.trim(),
      hostMember: newGroupHost,
      hostRole: hostInfo?.clubTitle || 'Ev Sahibi Üye',
      date: newGroupDate.trim() || '12 Kasım 2026 Perşembe',
      time: newGroupTime.trim() || '20:00',
      location: newGroupLocation.trim(),
      addressDetail: newGroupAddress.trim() || 'Beyoğlu / İstanbul',
      topic: newGroupTopic.trim() || 'Kulüp İçi Dostluk & Komite Çalışması',
      participants:
        selectedParticipants.length > 0 ? selectedParticipants : [newGroupHost],
    });
    setIsNewFiresideModalOpen(false);
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
                    {effectiveVolunteerName}
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {qrCheckedIn ? 'Yoklama Kaydedildi' : 'Okutmaya Hazır'}
                  </div>
                </div>
              </div>

              {/* QR Action & Status Details */}
              <div className="sm:col-span-7 space-y-3">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Toplantı girişinde Sekreterlik masasında üretilen imzalı salon QR kodunu (HMAC-SHA256) doğrulayarak yoklama kaydınızı oluşturun (#33).
                </p>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Aktif Oturum Üyesi:</span>
                    <span className="font-mono-num font-semibold text-slate-900">
                      {effectiveVolunteerName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Toplantı Durumu:</span>
                    <span className="font-semibold text-[#0C3C7C]">
                      {qrCheckedIn ? 'Salonda — Yoklama Alındı (+%2)' : 'Henüz Okutulmadı'}
                    </span>
                  </div>
                </div>

                {isBoardLeader && onGenerateMeetingQrToken && (
                  <div className="p-3 rounded-xl bg-[#0C3C7C]/5 border border-[#0C3C7C]/20 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#0C3C7C]">
                        Sekreterlik / Başkanlık Salon Görevlisi Paneli (#33)
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          const generated = await onGenerateMeetingQrToken();
                          if (generated) {
                            setQrTokenDraft(generated);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#0C3C7C] hover:bg-[#17458F] text-white text-[11px] font-semibold cursor-pointer"
                      >
                        Salon Masa QR Kodu Üret (5 Dk)
                      </button>
                    </div>
                    {activeSalonQrToken && (
                      <div className="text-[11px] font-mono-num text-slate-700 break-all">
                        Aktif Salon Kodu: <strong>{activeSalonQrToken}</strong>
                      </div>
                    )}
                  </div>
                )}

                {!qrCheckedIn && (
                  <div>
                    <label
                      htmlFor="meeting-qr-token-input"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Salon Masa QR Doğrulama Kodu (Sekreterlik / Başkanlık tarafından üretilen 5 dk geçerli kod)
                    </label>
                    <input
                      id="meeting-qr-token-input"
                      type="text"
                      value={qrTokenDraft || activeSalonQrToken || ''}
                      onChange={(e) => setQrTokenDraft(e.target.value)}
                      placeholder="Örn: RCQR-1842-... (Kısa Ömürlü İmzalı Salon Kodu)"
                      className="w-full text-xs font-mono-num bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    onSimulateQrCheckIn(
                      (qrTokenDraft || activeSalonQrToken || '').trim() || undefined
                    )
                  }
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
                      : 'Masa QR Kodunu Doğrula & Yoklamaya Katıl (+%2 Katılım)'}
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
                  Misafir Make-up Belgesi (Sekreter)
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
                          setActivityType(
                            e.target.value as MakeupSubmission['activityType']
                          )
                        }
                        className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                      >
                        <option value="Kulüp Toplantısı">Başka Kulüp Toplantısı</option>
                        <option value="Hizmet Projesi">Kulüp Hizmet Projesi</option>
                        <option value="Bölge Semineri">UR 2420. Bölge Semineri</option>
                        <option value="Komite Toplantısı">
                          Bölge / Kulüp Komite Toplantısı
                        </option>
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
                    <span>Make-up Bildirimi Gönder (Sekreterlik Onayına İlet)</span>
                  </button>
                </form>

                {/* Recent Make-ups List */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-700">
                    Dönem İçi Kayıtlı Make-up Bildirimleri ({makeupSubmissions.length})
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {makeupSubmissions.map((mk) => (
                      <div
                        key={mk.id}
                        className="p-3 bg-white flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900">
                            {mk.targetClubOrEvent}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            <span className="font-semibold text-[#0C3C7C]">
                              {mk.memberName}
                            </span>
                            <span className="mx-1.5" aria-hidden="true">
                              ·
                            </span>
                            <span>{mk.activityType}</span>
                            <span className="mx-1.5" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono-num">{mk.date}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{mk.description}</p>
                        </div>
                        <div className="sm:text-right shrink-0 space-y-1.5">
                          <div>
                            <div
                              className={`text-xs font-semibold ${
                                mk.status === 'Onaylandı'
                                  ? 'text-emerald-700'
                                  : mk.status === 'Reddedildi'
                                  ? 'text-rose-600'
                                  : 'text-amber-700'
                              }`}
                            >
                              {mk.status}
                            </div>
                            <div className="text-[11px] font-mono-num text-[#0C3C7C] font-semibold">
                              {mk.status === 'Onaylandı'
                                ? `+ %${mk.attendanceBoost} Katılım`
                                : mk.status === 'Reddedildi'
                                ? '0% Katılım'
                                : 'Onay Bekliyor (+%3)'}
                            </div>
                          </div>
                          {mk.status === 'İnceleniyor' &&
                            isBoardLeader &&
                            onApproveMakeupSubmission &&
                            onRejectMakeupSubmission && (
                              <div className="flex items-center sm:justify-end gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => onApproveMakeupSubmission(mk.id)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold cursor-pointer"
                                >
                                  Onayla (+%3)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRejectMakeupSubmission(mk.id)}
                                  className="px-2.5 py-1 rounded-lg bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 text-[11px] font-semibold cursor-pointer"
                                >
                                  Reddet
                                </button>
                              </div>
                            )}
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
                      Resmi antetli <strong>Dijital Make-up Sertifikası</strong> düzenleme yetkisi Genel Sekreter ve Başkana aittir. Önizlemeyi test edebilir veya tek tuşla Genel Sekreter rolüne geçebilirsiniz.
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
                  <div className="rounded-2xl border-2 border-[#F7A81B]/60 bg-gradient-to-br from-[#FFFDF9] via-white to-[#F8FAFC] p-5 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-[#0C3C7C] text-[#F7A81B] flex items-center justify-center shrink-0">
                          <RotaryWheelIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-serif-display text-base font-bold text-[#0C3C7C]">
                            ROTACLUB · GALATA ROTARY KULÜBÜ (UR 2420. BÖLGE)
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Resmi Dijital Make-up Katılım Belgesi (Sunucu Doğrulama Kodlu Sertifika)
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
                        <strong className="text-[#0C3C7C]">
                          {guestName || 'Misafir Rotaryen'}
                        </strong>
                        , 27 Ekim 2026 Salı günü Pera Palace Hotel Galata Salonu’nda gerçekleştirdiğimiz{' '}
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
                          Kulüp Sunucu Doğrulama Kodlu Dijital Kayıt
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4 text-[#F7A81B]" />
                    <span>
                      Resmi Make-up Katılım Belgesini Sunucuda Oluştur & Yazdırılabilir Sertifikayı Aç
                    </span>
                  </button>
                </form>

                {/* Sent Guest Make-up History */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-700">
                    Düzenlenen Misafir Rotaryen Make-up Sertifikaları ({guestMakeupCards.length})
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {guestMakeupCards.map((card) => (
                      <div
                        key={card.id}
                        className="p-3 bg-white flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">
                            {card.guestName} · {card.guestClub}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <span>{card.guestEmail}</span>
                            <span className="mx-1.5" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono-num">{card.sentAt}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-[11px] text-emerald-700 font-semibold">
                            {card.verificationCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenOfficialCertificateModal(card)}
                            className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-100 hover:bg-[#0C3C7C] hover:text-white text-[#0C3C7C] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Sertifikayı Aç / Yazdır</span>
                          </button>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
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

              {isBoardLeader ? (
                <button
                  type="button"
                  onClick={() => setIsNewFiresideModalOpen(true)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#F7A81B]" />
                  <span>+ Yeni Ocakbaşı Grubu Kur</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectRole('sekreter')}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
                >
                  Grup Kurmak İçin Sekreter Rolüne Geç
                </button>
              )}
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
                      <span>
                        {group.date} · {group.time}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Konum: </span>
                      <span>
                        {group.location} ({group.addressDetail})
                      </span>
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
                      <p className="text-slate-600 leading-relaxed">
                        {group.reportSummary}
                      </p>
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

          {/* Issue #46 Synthetic Pilot Module: Gönüllü, Görev ve Vardiya Yönetimi */}
          <section
            aria-labelledby="volunteer-shift-heading"
            data-testid="volunteer-shift-panel"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Saha Operasyonları · Sentetik Pilot Modülü (#46)
                </div>
                <h2
                  id="volunteer-shift-heading"
                  className="font-serif-display text-xl font-bold text-slate-900"
                >
                  Gönüllü, Görev ve Vardiya Çizelgesi
                </h2>
              </div>
              <div className="text-right font-mono-num text-xs">
                <div className="font-bold text-[#0C3C7C]">
                  %{shiftMetrics.fillRatePercent} Doluluk ({shiftMetrics.totalAssigned}/{shiftMetrics.totalRequired})
                </div>
                <div className="text-[11px] text-slate-500">
                  {shiftMetrics.openSlotsCount} Açık Kontenjan
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {volunteerShifts.map((shift) => {
                const isAssigned = shift.assignedVolunteers.includes(
                  effectiveVolunteerName
                );
                const isFull =
                  shift.assignedVolunteers.length >= shift.requiredCount;
                const isBlockedByCapacity = !isAssigned && isFull;
                return (
                  <div
                    key={shift.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900">{shift.taskTitle}</div>
                        <div className="text-[11px] text-[#0C3C7C] font-semibold">
                          {shift.eventTitle} · {shift.shiftWindow}
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          isFull ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {shift.assignedVolunteers.length}/{shift.requiredCount} Gönüllü
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      <strong className="text-slate-800">Konum: </strong>
                      {shift.location} · <strong className="text-slate-800">Vardiya: </strong>
                      {shift.assignedVolunteers.join(', ')}
                    </div>
                    <button
                      type="button"
                      disabled={isBlockedByCapacity}
                      onClick={() => handleToggleShiftSlot(shift.id)}
                      className={`w-full min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        isAssigned
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer'
                          : isBlockedByCapacity
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-[#0C3C7C] text-white hover:bg-[#17458F] cursor-pointer'
                      }`}
                    >
                      {isAssigned
                        ? `Vardiyada Görevlisiniz (${effectiveVolunteerName} · Ayrılmak İçin Dokunun)`
                        : isBlockedByCapacity
                        ? 'Vardiya Kontenjanı Dolu (Maksimum Kapasite)'
                        : `Bu Vardiyada Görev Al (${effectiveVolunteerName} · +Make-up Kredisi)`}
                    </button>
                  </div>
                );
              })}
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

      {/* NEW v3.0: Create New Fireside (Ocakbaşı) Group Modal */}
      {isNewFiresideModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-fireside-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Kulüp Yönetimi & Dostluk Komitesi
                </div>
                <h3
                  id="new-fireside-modal-title"
                  className="font-serif-display text-xl font-bold text-slate-900"
                >
                  Yeni Ocakbaşı (Fireside) Grubu Kur
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewFiresideModalOpen(false)}
                className="min-h-[36px] px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handleCreateNewFiresideSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="new-fs-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Ocakbaşı Grup Adı
                </label>
                <input
                  id="new-fs-name"
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-fs-host"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Ev Sahibi Üye Seçimi
                  </label>
                  <select
                    id="new-fs-host"
                    value={newGroupHost}
                    onChange={(e) => setNewGroupHost(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={`Rtn. ${m.fullName}`}>
                        Rtn. {m.fullName} ({m.clubTitle})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="new-fs-date"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Toplantı Tarihi & Günü
                  </label>
                  <input
                    id="new-fs-date"
                    type="text"
                    value={newGroupDate}
                    onChange={(e) => setNewGroupDate(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="new-fs-time"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Saat
                  </label>
                  <input
                    id="new-fs-time"
                    type="text"
                    value={newGroupTime}
                    onChange={(e) => setNewGroupTime(e.target.value)}
                    className="w-full text-sm font-mono-num bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="new-fs-location"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Ev / Ofis / Mekan Adı
                  </label>
                  <input
                    id="new-fs-location"
                    type="text"
                    value={newGroupLocation}
                    onChange={(e) => setNewGroupLocation(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-fs-topic"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Ocakbaşı Gündem Başlığı
                </label>
                <input
                  id="new-fs-topic"
                  type="text"
                  value={newGroupTopic}
                  onChange={(e) => setNewGroupTopic(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-[#0C3C7C]" />
                    <span>Katılımcı Üye Seçimi ({selectedParticipants.length} Seçili)</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  {members.map((m) => {
                    const label = `Rtn. ${m.fullName}`;
                    const checked = selectedParticipants.includes(label);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 text-xs text-slate-800 p-1.5 rounded-lg hover:bg-white cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParticipantSelection(m.fullName)}
                          className="rounded border-slate-300 text-[#0C3C7C]"
                        />
                        <span className="truncate">{m.fullName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewFiresideModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] cursor-pointer"
                >
                  Ocakbaşı Grubunu Oluştur & Üyelere Bildir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
