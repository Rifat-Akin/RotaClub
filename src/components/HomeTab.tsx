import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck2,
  Gift,
  MapPin,
  Mic,
  PlusCircle,
  Send,
  ThumbsUp,
  UserPlus,
  Utensils,
} from 'lucide-react';
import {
  CelebrationItem,
  ClubRole,
  MenuPreference,
  RitualStep,
  RsvpStatus,
  SpeakerProposal,
  WeeklyMeeting,
} from '../types/rotary';
import { KuverSummaryResult } from '../utils/rotaryLogic';
import { PeraPalaceBannerIllustration } from './RotaryArtwork';

interface HomeTabProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  meeting: WeeklyMeeting;
  rsvpStatus: RsvpStatus;
  onChangeRsvpStatus: (status: RsvpStatus) => void;
  menuPreference: MenuPreference;
  onChangeMenuPreference: (menu: MenuPreference) => void;
  guestNameInput: string;
  onChangeGuestNameInput: (val: string) => void;
  kuverSummary: KuverSummaryResult;
  ritualSteps: RitualStep[];
  onToggleRitualStep: (id: string) => void;
  celebrations: CelebrationItem[];
  onCongratulateMember: (id: string) => void;
  onAdvanceCertificateStatus: () => void;
  onSendHotelKuverReport: () => void;
  speakerProposals: SpeakerProposal[];
  onToggleVoteSpeaker: (proposalId: string) => void;
  onAddSpeakerProposal: (input: {
    speakerName: string;
    speakerTitle: string;
    proposedTopic: string;
    targetMonth: string;
  }) => void;
}

const RSVP_OPTIONS: {
  id: RsvpStatus;
  label: string;
  sublabel: string;
}[] = [
  { id: 'attending', label: 'Katılıyorum', sublabel: '1 Kuver (Asil Üye)' },
  { id: 'with_spouse', label: 'Eşli Katılıyorum (+1)', sublabel: '2 Kuver (Üye + Eş)' },
  { id: 'with_guest', label: 'Konuğum Var', sublabel: '2 Kuver (Üye + Konuk)' },
  { id: 'excused', label: 'Mazeretliyim', sublabel: 'Make-up Planlanacak' },
];

const MENU_OPTIONS: {
  id: MenuPreference;
  label: string;
  detail: string;
}[] = [
  { id: 'Standart', label: 'Standart Menü', detail: 'Dana Bonfile & Trüflü Püre' },
  { id: 'Balık', label: 'Balık Menüsü', detail: 'Izgara Deniz Levreği & Enginar' },
  { id: 'Vejetaryen', label: 'Vejetaryen Menü', detail: 'Yabani Mantarlı Risotto' },
];

export const HomeTab: React.FC<HomeTabProps> = ({
  activeRole,
  onSelectRole,
  meeting,
  rsvpStatus,
  onChangeRsvpStatus,
  menuPreference,
  onChangeMenuPreference,
  guestNameInput,
  onChangeGuestNameInput,
  kuverSummary,
  ritualSteps,
  onToggleRitualStep,
  celebrations,
  onCongratulateMember,
  onAdvanceCertificateStatus,
  onSendHotelKuverReport,
  speakerProposals,
  onToggleVoteSpeaker,
  onAddSpeakerProposal,
}) => {
  const [isSpeakerPoolOpen, setIsSpeakerPoolOpen] = useState(true);
  const [showAddSpeakerForm, setShowAddSpeakerForm] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [newSpeakerTitle, setNewSpeakerTitle] = useState('');
  const [newSpeakerTopic, setNewSpeakerTopic] = useState('');
  const [newSpeakerMonth, setNewSpeakerMonth] = useState('Aralık 2026');
  const [speakerFormError, setSpeakerFormError] = useState('');

  const isBoardManager = activeRole === 'sekreter' || activeRole === 'baskan';
  const completedRitualsCount = ritualSteps.filter((s) => s.completed).length;

  const handleSpeakerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpeakerName.trim() || !newSpeakerTopic.trim()) {
      setSpeakerFormError('Lütfen konuşmacı adını ve sunum konusunu giriniz.');
      return;
    }
    setSpeakerFormError('');
    onAddSpeakerProposal({
      speakerName: newSpeakerName.trim(),
      speakerTitle: newSpeakerTitle.trim() || 'Akademisyen & Kanaat Önderi',
      proposedTopic: newSpeakerTopic.trim(),
      targetMonth: newSpeakerMonth,
    });
    setNewSpeakerName('');
    setNewSpeakerTitle('');
    setNewSpeakerTopic('');
    setShowAddSpeakerForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Weekly Meeting + Speaker Pool Drawer + One-Tap LCV */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Upcoming Weekly Meeting Card */}
          <section
            aria-labelledby="upcoming-meeting-heading"
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
          >
            <div className="relative">
              <PeraPalaceBannerIllustration />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#F7A81B] font-medium mb-1">
                  <span>Yaklaşan Haftalık Toplantı</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">Toplantı #{meeting.meetingNo}</span>
                  <span aria-hidden="true">·</span>
                  <span>Eşli & Konuklu Gündem</span>
                </div>
                <h1
                  id="upcoming-meeting-heading"
                  className="font-serif-display text-2xl sm:text-3xl font-bold tracking-tight text-white leading-snug"
                >
                  {meeting.venue} — {meeting.hall.split('—')[0].trim()}
                </h1>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              {/* Date, Time & Venue Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-slate-100 text-sm">
                <div className="flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-[#0C3C7C] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-900">{meeting.date}</div>
                    <div className="text-xs text-slate-500">{meeting.time}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#0C3C7C] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-900">{meeting.venue}</div>
                    <div className="text-xs text-slate-500">{meeting.hall}</div>
                  </div>
                </div>
              </div>

              {/* Guest Speaker Spotlight */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Haftanın Onur Konuğu ve Konuşmacısı
                </div>
                <h2 className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900">
                  {meeting.speakerName}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {meeting.speakerTitle}
                </p>
                <div className="pt-1">
                  <div className="text-sm font-semibold text-[#0F172A]">
                    Konu: “{meeting.topic}”
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                    {meeting.speakerBio}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Card 2: Konuk Konuşmacı Havuzu (Konuşmacı Öner & Oyla Çekmecesi) */}
          <section
            aria-labelledby="speaker-pool-heading"
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
          >
            <div className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0C3C7C]/10 text-[#0C3C7C] flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <h2
                    id="speaker-pool-heading"
                    className="font-serif-display text-lg sm:text-xl font-bold text-slate-900"
                  >
                    Konuk Konuşmacı Havuzu — Konuşmacı Öner & Oyla
                  </h2>
                  <p className="text-xs text-slate-500">
                    Gelecek toplantılar için konuşmacı önerin veya mevcut adaylara (+1) oy verin
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSpeakerPoolOpen(true);
                    setShowAddSpeakerForm((prev) => !prev);
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-[#F7A81B]" />
                  <span>Konuşmacı Öner</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSpeakerPoolOpen((prev) => !prev)}
                  aria-expanded={isSpeakerPoolOpen}
                  aria-label="Konuşmacı Havuzu Çekmecesini Aç veya Kapat"
                  className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                >
                  <span>{isSpeakerPoolOpen ? 'Daralt' : 'Göster'}</span>
                  {isSpeakerPoolOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {isSpeakerPoolOpen && (
              <div className="p-4 sm:p-6 space-y-4">
                {showAddSpeakerForm && (
                  <form
                    onSubmit={handleSpeakerSubmit}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <div className="text-xs font-bold text-[#0C3C7C]">
                      Program Komitesine Yeni Konuk Konuşmacı Önerisi
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="speaker-name-input"
                          className="block text-[11px] font-semibold text-slate-700 mb-1"
                        >
                          Konuşmacı Adı ve Unvanı
                        </label>
                        <input
                          id="speaker-name-input"
                          type="text"
                          value={newSpeakerName}
                          onChange={(e) => setNewSpeakerName(e.target.value)}
                          placeholder="Örn: Prof. Dr. İlber Ortaylı"
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="speaker-title-input"
                          className="block text-[11px] font-semibold text-slate-700 mb-1"
                        >
                          Kurum / Uzmanlık Alanı
                        </label>
                        <input
                          id="speaker-title-input"
                          type="text"
                          value={newSpeakerTitle}
                          onChange={(e) => setNewSpeakerTitle(e.target.value)}
                          placeholder="Örn: Tarihçi & Akademisyen"
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="speaker-month-select"
                          className="block text-[11px] font-semibold text-slate-700 mb-1"
                        >
                          Hedef Dönem Ayı
                        </label>
                        <select
                          id="speaker-month-select"
                          value={newSpeakerMonth}
                          onChange={(e) => setNewSpeakerMonth(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                        >
                          <option value="Kasım 2026">Kasım 2026</option>
                          <option value="Aralık 2026">Aralık 2026</option>
                          <option value="Ocak 2027">Ocak 2027</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="speaker-topic-input"
                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                      >
                        Önerilen Konuşma Başlığı
                      </label>
                      <input
                        id="speaker-topic-input"
                        type="text"
                        value={newSpeakerTopic}
                        onChange={(e) => setNewSpeakerTopic(e.target.value)}
                        placeholder="Örn: Doğu Akdeniz’de Kültürel Diplomasi ve Galata Mirası"
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      />
                    </div>

                    {speakerFormError && (
                      <p role="alert" className="text-xs font-medium text-rose-600">
                        {speakerFormError}
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddSpeakerForm(false)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 cursor-pointer"
                      >
                        Vazgeç
                      </button>
                      <button
                        type="submit"
                        className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[#0C3C7C] text-white text-xs font-semibold cursor-pointer"
                      >
                        Havuza Ekle & Oylamaya Aç
                      </button>
                    </div>
                  </form>
                )}

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {speakerProposals.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 bg-white flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-bold text-slate-900">
                            {item.speakerName}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500">{item.speakerTitle}</span>
                        </div>
                        <div className="text-xs font-semibold text-[#0C3C7C]">
                          “{item.proposedTopic}”
                        </div>
                        <div className="text-[11px] text-slate-500">
                          <span>Öneren: {item.proposedBy}</span>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>Hedef: {item.targetMonth}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleVoteSpeaker(item.id)}
                        aria-pressed={item.hasVoted}
                        className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-bold font-mono-num flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                          item.hasVoted
                            ? 'bg-[#0C3C7C] text-white border-[#0C3C7C]'
                            : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-[#0C3C7C]'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5 text-[#F7A81B]" />
                        <span>+1 Oy ({item.votes})</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Card 3: One-Tap LCV & Menu Choice */}
          <section
            aria-labelledby="lcv-section-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2
                  id="lcv-section-heading"
                  className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900"
                >
                  Tek Dokunuşla LCV & Kuver Seçimi
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pera Palace Hotel mutfak bildirimi için katılım ve menü tercihinizi işaretleyin.
                </p>
              </div>
              <div className="text-xs font-medium text-[#0C3C7C]">
                Aktif Durum:{' '}
                <span className="font-semibold">
                  {RSVP_OPTIONS.find((o) => o.id === rsvpStatus)?.label}
                </span>
              </div>
            </div>

            {/* 4 RSVP Status Buttons */}
            <div
              role="group"
              aria-label="LCV Katılım Durumu Seçimi"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            >
              {RSVP_OPTIONS.map((opt) => {
                const isSelected = rsvpStatus === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeRsvpStatus(opt.id)}
                    aria-pressed={isSelected}
                    className={`min-h-[54px] p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-[#0C3C7C] text-white border-[#0C3C7C] shadow-xs'
                        : 'bg-slate-50/70 text-slate-800 border-slate-200 hover:border-[#0C3C7C]/40 hover:bg-white'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold whitespace-nowrap">
                        {opt.label}
                      </div>
                      <div
                        className={`text-xs mt-0.5 ${
                          isSelected ? 'text-slate-200' : 'text-slate-500'
                        }`}
                      >
                        {opt.sublabel}
                      </div>
                    </div>
                    <CheckCircle2
                      className={`w-5 h-5 shrink-0 ${
                        isSelected ? 'text-[#F7A81B]' : 'text-slate-300'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Optional Guest Name Input when "Konuğum Var" is selected */}
            {rsvpStatus === 'with_guest' && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label
                  htmlFor="guest-name-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Konuğunuzun Adı Soyadı ve Meslek Sınıflandırması (Yaka Kartı İçin)
                </label>
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#0C3C7C] shrink-0" />
                  <input
                    id="guest-name-input"
                    type="text"
                    value={guestNameInput}
                    onChange={(e) => onChangeGuestNameInput(e.target.value)}
                    placeholder="Örn: Mim. Caner Erkin — Kentsel Tasarım"
                    className="w-full text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#0C3C7C]"
                  />
                </div>
              </div>
            )}

            {/* Menu Preference Selector (shown unless excused) */}
            {rsvpStatus !== 'excused' && (
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <Utensils className="w-4 h-4 text-[#0C3C7C]" />
                  <span>Diyet & Akşam Yemeği Menü Seçimi</span>
                </div>
                <div
                  role="group"
                  aria-label="Menü Tercihi"
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                >
                  {MENU_OPTIONS.map((menu) => {
                    const isMenuSelected = menuPreference === menu.id;
                    return (
                      <button
                        key={menu.id}
                        type="button"
                        onClick={() => onChangeMenuPreference(menu.id)}
                        aria-pressed={isMenuSelected}
                        className={`min-h-[52px] p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isMenuSelected
                            ? 'bg-[#0F172A] text-white border-[#0F172A]'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold whitespace-nowrap">
                            {menu.label}
                          </span>
                          {isMenuSelected && (
                            <span className="text-[11px] font-semibold text-[#F7A81B]">
                              Seçili
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-[11px] mt-1 truncate ${
                            isMenuSelected ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {menu.detail}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Live Kuver Summary & President Cockpit */}
        <div className="lg:col-span-5 space-y-6">
          {!isBoardManager ? (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-serif-display text-xl font-bold text-slate-900">
                  Başkan & Sekreter Toplantı Kokpiti
                </h2>
                <span className="text-xs text-slate-500">Yönetim Görünümü</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Şu anda <strong>{activeRole === 'uye' ? 'Üye: Rifat Akın' : 'Sayman'}</strong> rolündesiniz. Pera Palace Hotel canlı kuver özetini, mutfak dağılımını, mutlu günler kutlama listesini ve toplantı ritüel akışını yönetmek için üst bardan veya aşağıdaki kısayoldan <strong>Genel Sekreter</strong> ya da <strong>Başkan</strong> rolüne geçebilirsiniz.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onSelectRole('sekreter')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] transition-colors cursor-pointer"
                >
                  Genel Sekreter Görünümü
                </button>
                <button
                  type="button"
                  onClick={() => onSelectRole('baskan')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0F172A] text-[#F7A81B] text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Başkan Kokpitini Aç
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* Live Hotel Kuver Summary Card */}
              <section
                aria-labelledby="kuver-summary-heading"
                className="bg-[#0F172A] text-white rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <div className="text-xs text-[#F7A81B] font-semibold">
                      Genel Sekreter & Başkan Canlı Paneli
                    </div>
                    <h2
                      id="kuver-summary-heading"
                      className="font-serif-display text-xl sm:text-2xl font-bold text-white mt-0.5"
                    >
                      Otele Bildirilecek Canlı Kuver Özeti
                    </h2>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Toplam Kuver</div>
                    <div className="text-2xl font-bold font-mono-num text-[#F7A81B]">
                      {kuverSummary.totalKuver}
                    </div>
                  </div>
                </div>

                {/* Breakdown Formula */}
                <div className="grid grid-cols-4 gap-2 text-center bg-white/5 rounded-xl p-3 border border-white/10">
                  <div>
                    <div className="text-lg font-bold font-mono-num text-white">
                      {kuverSummary.attendingMembers}
                    </div>
                    <div className="text-[11px] text-slate-300">Üye</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold font-mono-num text-white">
                      {kuverSummary.spousesCount}
                    </div>
                    <div className="text-[11px] text-slate-300">Eş (+1)</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold font-mono-num text-white">
                      {kuverSummary.guestsCount}
                    </div>
                    <div className="text-[11px] text-slate-300">Konuk</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold font-mono-num text-slate-400">
                      {kuverSummary.excusedMembers}
                    </div>
                    <div className="text-[11px] text-slate-400">Mazeretli</div>
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-mono-num">
                  Özet: {kuverSummary.attendingMembers} Üye, {kuverSummary.spousesCount} Eş,{' '}
                  {kuverSummary.guestsCount} Konuk = Toplam {kuverSummary.totalKuver} Kuver
                </p>

                {/* Menu Distribution */}
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-semibold text-slate-300">
                    Mutfak Menü Dağılımı (Pera Palace Banket)
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-slate-400">Standart</div>
                      <div className="text-sm font-bold font-mono-num text-white mt-0.5">
                        {kuverSummary.menuBreakdown.Standart} Adet
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-slate-400">Balık</div>
                      <div className="text-sm font-bold font-mono-num text-white mt-0.5">
                        {kuverSummary.menuBreakdown.Balık} Adet
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-slate-400">Vejetaryen</div>
                      <div className="text-sm font-bold font-mono-num text-white mt-0.5">
                        {kuverSummary.menuBreakdown.Vejetaryen} Adet
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onSendHotelKuverReport}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#F7A81B] text-[#0F172A] font-semibold text-xs hover:bg-[#f9b53b] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Pera Palace Banket Yönetimine Nihai Kuver Listesini İlet</span>
                </button>
              </section>

              {/* President Meeting Cockpit Card */}
              <section
                aria-labelledby="president-cockpit-heading"
                className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                  <div>
                    <div className="text-xs font-semibold text-[#0C3C7C]">
                      Başkan Toplantı Kokpiti
                    </div>
                    <h2
                      id="president-cockpit-heading"
                      className="font-serif-display text-xl font-bold text-slate-900"
                    >
                      Toplantı Ritüel Akışı & Mutlu Günler
                    </h2>
                  </div>
                  <span className="text-xs font-mono-num text-slate-500">
                    {completedRitualsCount}/{ritualSteps.length} Tamamlandı
                  </span>
                </div>

                {/* Celebrations */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Gift className="w-4 h-4 text-[#F7A81B]" />
                    <span>Bu Hafta Doğum Günü ve Evlilik Yıldönümü Olan Üyeler</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {celebrations.map((cel) => (
                      <div
                        key={cel.id}
                        className="p-3 bg-white flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {cel.memberName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <span>{cel.type}</span>
                            <span className="mx-1" aria-hidden="true">·</span>
                            <span>{cel.dateLabel}</span>
                            {cel.years && (
                              <>
                                <span className="mx-1" aria-hidden="true">·</span>
                                <span>{cel.years}. Yıl</span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onCongratulateMember(cel.id)}
                          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                            cel.congratulated
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-[#0C3C7C] text-white hover:bg-[#17458F]'
                          }`}
                        >
                          {cel.congratulated ? 'Kürsüde Kutlandı' : 'Kutlama Anonsu Yap'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Meeting Ritual Checklist */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Clock className="w-4 h-4 text-[#0C3C7C]" />
                    <span>Toplantı Ritüel Akışı (#1842. Toplantı)</span>
                  </div>
                  <div className="space-y-2">
                    {ritualSteps.map((step) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => onToggleRitualStep(step.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                          step.completed
                            ? 'bg-slate-50 border-slate-200 text-slate-500'
                            : 'bg-white border-slate-200 hover:border-[#0C3C7C] text-slate-900'
                        }`}
                      >
                        <CheckCircle2
                          className={`w-4 h-4 mt-0.5 shrink-0 ${
                            step.completed ? 'text-emerald-600' : 'text-slate-300'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono-num font-semibold text-[#0C3C7C]">
                              {step.time}
                            </span>
                            <span
                              className={`font-semibold ${
                                step.completed ? 'line-through text-slate-500' : 'text-slate-900'
                              }`}
                            >
                              {step.title}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Sorumlu: {step.responsible}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speaker Certificate Status */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                      <FileCheck2 className="w-4 h-4 text-[#0C3C7C]" />
                      <span>Konuşmacı Teşekkür Belgesi Durumu</span>
                    </div>
                    <span className="text-xs font-semibold text-[#0C3C7C]">
                      {meeting.certificateStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {meeting.certificateDonationTree}
                  </p>
                  <button
                    type="button"
                    onClick={onAdvanceCertificateStatus}
                    className="w-full min-h-[40px] py-2 px-3 rounded-lg bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] transition-colors cursor-pointer"
                  >
                    {meeting.certificateStatus === 'Takdim Edildi'
                      ? 'Teşekkür Belgesi Kürsüde Takdim Edildi'
                      : 'Belgeyi Kürsüde Takdim Edildi Olarak İşaretle'}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
