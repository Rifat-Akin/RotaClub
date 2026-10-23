import React, { useState } from 'react';
import {
  BellRing,
  BookOpen,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileCheck2,
  Gift,
  MapPin,
  Mic,
  PlusCircle,
  Send,
  ThumbsUp,
  UserPlus,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  CelebrationItem,
  ClubRole,
  MenuPreference,
  RitualStep,
  RotaryMember,
  RsvpStatus,
  SpeakerProposal,
  WeeklyMeeting,
} from '../types/rotary';
import {
  calculateHotelBanquetCommitment,
  formatTL,
  generateKuverCsvContent,
  generateMeetingIcsContent,
  KuverSummaryResult,
} from '../utils/rotaryLogic';
import { PeraPalaceBannerIllustration } from './RotaryArtwork';

interface HomeTabProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  meetings: WeeklyMeeting[];
  selectedMeetingNo: number;
  onSelectMeetingNo: (meetingNo: number) => void;
  onCreateNewMeeting: (newMeeting: WeeklyMeeting) => void;
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
  members: RotaryMember[];
  onUpdateMemberRsvp: (
    memberId: string,
    status: RsvpStatus,
    menu?: MenuPreference
  ) => void;
  onRemindUnrespondedMembers: () => void;
  onDownloadKuverCsvNotify: (meetingNo: number) => void;
  onUpdateMeetingHotelCommitment?: (
    meetingNo: number,
    patch: Partial<WeeklyMeeting>
  ) => void;
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
  meetings,
  selectedMeetingNo,
  onSelectMeetingNo,
  onCreateNewMeeting,
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
  members,
  onUpdateMemberRsvp,
  onRemindUnrespondedMembers,
  onDownloadKuverCsvNotify,
  onUpdateMeetingHotelCommitment,
}) => {
  const [isSpeakerPoolOpen, setIsSpeakerPoolOpen] = useState(true);
  const [showAddSpeakerForm, setShowAddSpeakerForm] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [newSpeakerTitle, setNewSpeakerTitle] = useState('');
  const [newSpeakerTopic, setNewSpeakerTopic] = useState('');
  const [newSpeakerMonth, setNewSpeakerMonth] = useState('Aralık 2026');
  const [speakerFormError, setSpeakerFormError] = useState('');

  // New Meeting Planning Modal State (#1843+)
  const [isPlanMeetingModalOpen, setIsPlanMeetingModalOpen] = useState(false);
  const nextMeetingNo =
    Math.max(...meetings.map((m) => m.meetingNo), 1842) + 1;
  const [planDate, setPlanDate] = useState('03 Kasım 2026 Salı');
  const [planVenue, setPlanVenue] = useState('Pera Palace Hotel');
  const [planHall, setPlanHall] = useState(
    'Galata Balo Salonu — Meşrutiyet Cad. No:52 Beyoğlu'
  );
  const [planSpeakerName, setPlanSpeakerName] = useState('Prof. Dr. Bülent Somay');
  const [planSpeakerTitle, setPlanSpeakerTitle] = useState(
    'Kültür Araştırmacısı & Yazar'
  );
  const [planTopic, setPlanTopic] = useState(
    'Beyoğlu ve Pera’da Edebiyat, Sinema ve Kent Belleği'
  );
  const [planBio, setPlanBio] = useState(
    'Karşılaştırmalı edebiyat, kent kültürü ve modern düşünce tarihi alanlarında eserleriyle tanınan akademisyen ve yazar.'
  );

  const meeting =
    meetings.find((m) => m.meetingNo === selectedMeetingNo) ||
    meetings[meetings.length - 1];

  const isBoardManager = activeRole === 'sekreter' || activeRole === 'baskan';
  const completedRitualsCount = ritualSteps.filter((s) => s.completed).length;

  // Issue #29 Live Meeting Hotel Banquet Commitment & Two-Step Confirmation State
  const [localMinGuarantee, setLocalMinGuarantee] = useState<number>(
    meeting.minHotelGuarantee ?? 35
  );
  const [localUnitKuverPrice, setLocalUnitKuverPrice] = useState<number>(
    meeting.unitKuverCostTL ?? 1850
  );
  const [localLcvLocked, setLocalLcvLocked] = useState<boolean>(
    meeting.isLcvLockedForHotel ?? true
  );
  const [localHotelRef, setLocalHotelRef] = useState<string>(
    meeting.hotelConfirmationRef ?? 'PP-BNQ-2026-1842'
  );
  const [hotelRefDraft, setHotelRefDraft] = useState<string>(
    meeting.hotelConfirmationRef || 'PP-BNQ-2026-1842'
  );

  const hotelMinGuarantee = onUpdateMeetingHotelCommitment
    ? meeting.minHotelGuarantee ?? 35
    : localMinGuarantee;
  const hotelUnitKuverPrice = onUpdateMeetingHotelCommitment
    ? meeting.unitKuverCostTL ?? 1850
    : localUnitKuverPrice;
  const isLcvLockedForHotel = onUpdateMeetingHotelCommitment
    ? meeting.isLcvLockedForHotel ?? false
    : localLcvLocked;
  const activeHotelConfirmationRef = onUpdateMeetingHotelCommitment
    ? meeting.hotelConfirmationRef
    : localHotelRef;
  const activeHotelConfirmedBy = onUpdateMeetingHotelCommitment
    ? meeting.hotelConfirmedBy
    : activeHotelConfirmationRef
    ? 'Rtn. Dr. Kerem Aydın (Genel Sekreter)'
    : undefined;

  const hotelCommitment = calculateHotelBanquetCommitment(
    kuverSummary,
    hotelMinGuarantee,
    isLcvLockedForHotel,
    meeting.protocolSpeakerKuver ?? 2,
    activeHotelConfirmationRef,
    activeHotelConfirmedBy
  );

  const handleToggleLcvLock = () => {
    const nextLocked = !isLcvLockedForHotel;
    if (onUpdateMeetingHotelCommitment) {
      onUpdateMeetingHotelCommitment(meeting.meetingNo, {
        isLcvLockedForHotel: nextLocked,
        ...(nextLocked
          ? {}
          : {
              hotelConfirmationRef: undefined,
              hotelConfirmedBy: undefined,
              hotelConfirmedAt: undefined,
            }),
      });
    } else {
      setLocalLcvLocked(nextLocked);
      if (!nextLocked) {
        setLocalHotelRef('');
      }
    }
  };

  const handleConfirmHotelBanquetRef = () => {
    const cleanedRef = hotelRefDraft.trim() || `PP-BNQ-2026-${meeting.meetingNo}`;
    const officerLabel =
      activeRole === 'baskan'
        ? 'Rtn. Av. Nazlı Denizmen (Dönem Başkanı)'
        : 'Rtn. Dr. Kerem Aydın (Genel Sekreter)';
    if (onUpdateMeetingHotelCommitment) {
      onUpdateMeetingHotelCommitment(meeting.meetingNo, {
        isLcvLockedForHotel: true,
        hotelConfirmationRef: cleanedRef,
        hotelConfirmedBy: officerLabel,
        hotelConfirmedAt: new Date().toISOString(),
      });
    } else {
      setLocalLcvLocked(true);
      setLocalHotelRef(cleanedRef);
    }
  };

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

  const handlePlanMeetingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planSpeakerName.trim() || !planTopic.trim()) return;
    const created: WeeklyMeeting = {
      meetingNo: nextMeetingNo,
      date: planDate.trim(),
      time: '19:30 (Kokteyl) · 20:00 (Toplantı)',
      venue: planVenue.trim(),
      hall: planHall.trim(),
      speakerName: planSpeakerName.trim(),
      speakerTitle: planSpeakerTitle.trim(),
      topic: planTopic.trim(),
      speakerBio: planBio.trim(),
      certificateStatus: 'Hazır — İmzalandı',
      certificateDonationTree: `Uluslararası Rotary Çocuk Felci (End Polio Now) Fonu — 50 Çocuk Aşı Bağışı Sertifikası (#PL-2420-${nextMeetingNo})`,
      isPast: false,
    };
    onCreateNewMeeting(created);
    setIsPlanMeetingModalOpen(false);
  };

  const handleDownloadKuverCsv = () => {
    const csvContent = generateKuverCsvContent(members, meeting.meetingNo);
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `galata-rotary-toplanti-${meeting.meetingNo}-kuver-listesi.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onDownloadKuverCsvNotify(meeting.meetingNo);
  };

  const handleDownloadMeetingIcs = () => {
    const icsContent = generateMeetingIcsContent(meeting);
    const blob = new Blob([icsContent], {
      type: 'text/calendar;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `galata-rotary-toplanti-${meeting.meetingNo}.ics`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Meeting Selector Bar (#1840, #1841 Bülten Özeti, #1842 Aktif Toplantı & + Yeni Toplantı Planla) */}
      <section
        aria-label="Toplantı ve Bülten Arşivi Seçici"
        className="bg-white rounded-2xl border border-slate-200 p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 shadow-xs"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 mr-1">
            Toplantı & Bülten Seçici:
          </span>
          {meetings.map((m) => {
            const isSelected = m.meetingNo === meeting.meetingNo;
            return (
              <button
                key={m.meetingNo}
                type="button"
                onClick={() => onSelectMeetingNo(m.meetingNo)}
                aria-pressed={isSelected}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#0C3C7C] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span className="font-mono-num">#{m.meetingNo}</span>
                <span>{m.isPast ? 'Bülten Özeti' : 'Aktif Toplantı'}</span>
              </button>
            );
          })}
        </div>

        {isBoardManager && (
          <button
            type="button"
            onClick={() => setIsPlanMeetingModalOpen(true)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#F7A81B] hover:bg-[#f9b53b] text-[#0F172A] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>+ Yeni Toplantı Planla (#{nextMeetingNo})</span>
          </button>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Weekly Meeting + Speaker Pool Drawer + One-Tap LCV */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Weekly Meeting Card */}
          <section
            aria-labelledby="upcoming-meeting-heading"
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
          >
            <div className="relative">
              <PeraPalaceBannerIllustration />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#F7A81B] font-medium mb-1">
                  <span>
                    {meeting.isPast
                      ? 'Geçmiş Toplantı Bülteni Arşivi'
                      : 'Yaklaşan Haftalık Toplantı'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">Toplantı #{meeting.meetingNo}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {meeting.isPast
                      ? `Katılım: ${meeting.attendanceCount || 39} Kuver`
                      : 'Eşli & Konuklu Gündem'}
                  </span>
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
              {/* Date, Time & Venue Metadata + ICS Calendar Export (#9) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-4 border-b border-slate-100 text-sm items-center">
                <div className="sm:col-span-4 flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-[#0C3C7C] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-900">{meeting.date}</div>
                    <div className="text-xs text-slate-500">{meeting.time}</div>
                  </div>
                </div>
                <div className="sm:col-span-5 flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#0C3C7C] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-900">{meeting.venue}</div>
                    <div className="text-xs text-slate-500">{meeting.hall}</div>
                  </div>
                </div>
                <div className="sm:col-span-3 sm:text-right">
                  <button
                    type="button"
                    onClick={handleDownloadMeetingIcs}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-[#0C3C7C] hover:text-white text-[#0C3C7C] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span>Takvime Ekle (.ICS)</span>
                  </button>
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

              {/* Past Meeting Bulletin Summary (shown if past meeting is selected) */}
              {meeting.isPast && meeting.bulletinSummary && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0C3C7C]">
                    <BookOpen className="w-4 h-4" />
                    <span>
                      Toplantı #{meeting.meetingNo} Resmi Haftalık Bülten Özeti
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                    {meeting.bulletinSummary}
                  </p>
                  {meeting.highlights && (
                    <div className="pt-1 text-xs font-semibold text-slate-800">
                      Öne Çıkanlar: {meeting.highlights.join(' · ')}
                    </div>
                  )}
                </div>
              )}
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

        {/* Right Column: Live Kuver Summary + Member RSVP Matrix + President Cockpit */}
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
                Şu anda <strong>{activeRole === 'uye' ? 'Üye: Rifat Akın' : 'Sayman'}</strong> rolündesiniz. Pera Palace Hotel canlı kuver özetini, isim isim üye LCV matrisini, CSV dışa aktarımı ve toplantı ritüel akışını yönetmek için üst bardan veya aşağıdaki kısayoldan <strong>Genel Sekreter</strong> ya da <strong>Başkan</strong> rolüne geçebilirsiniz.
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
              {/* Live Hotel Kuver Summary + Name-by-Name LCV Matrix Card */}
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

                {/* İsim İsim LCV & Kuver Matrisi Table */}
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-[#F7A81B]">
                      İsim İsim LCV & Kuver Matrisi ({members.length} Asil Üye)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={onRemindUnrespondedMembers}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <BellRing className="w-3 h-3 text-[#F7A81B]" />
                        <span>LCV Hatırlatma Metnini Kopyala</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadKuverCsv}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#F7A81B] hover:bg-[#f9b53b] text-[#0F172A] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Kuver Listesini CSV İndir</span>
                      </button>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/10 bg-white/5">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            Rtn. {member.fullName}
                          </div>
                          <div className="text-[11px] text-slate-300">
                            <span>Menü: {member.mealPreference}</span>
                            {member.rsvpStatus === 'with_spouse' &&
                              member.spouseName && (
                                <>
                                  <span className="mx-1">·</span>
                                  <span>Eşi: {member.spouseName}</span>
                                </>
                              )}
                            {member.rsvpStatus === 'with_guest' &&
                              member.guestName && (
                                <>
                                  <span className="mx-1">·</span>
                                  <span>Konuk: {member.guestName}</span>
                                </>
                              )}
                          </div>
                        </div>

                        <select
                          aria-label={`${member.fullName} LCV Durumu`}
                          value={member.rsvpStatus}
                          onChange={(e) =>
                            onUpdateMemberRsvp(
                              member.id,
                              e.target.value as RsvpStatus
                            )
                          }
                          className="text-[11px] font-semibold bg-[#09152B] text-white border border-white/20 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#F7A81B] cursor-pointer"
                        >
                          <option value="attending">Katılıyor (1 Kuver)</option>
                          <option value="with_spouse">Eşli (+1 · 2 Kuver)</option>
                          <option value="with_guest">Konuklu (2 Kuver)</option>
                          <option value="excused">Mazeretli (0 Kuver)</option>
                          <option value="pending">Yanıt Bekleniyor</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Issue #29 Live Module: Kesin LCV Kilidi, Minimum Garanti & İki Aşamalı Otel Banket Mutabakatı */}
                <div
                  data-testid="hotel-banquet-commitment-panel"
                  className="p-3.5 rounded-xl bg-white/5 border border-white/15 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold text-[#F7A81B]">
                        Kesin LCV, Kuver Garantisi & Otel Banket Mutabakatı (#29)
                      </div>
                      <div className="text-xs font-bold text-white">
                        {hotelCommitment.hotelConfirmationStatus}
                      </div>
                      {hotelCommitment.isHotelConfirmed && (
                        <div className="text-[11px] text-emerald-300 font-mono-num mt-0.5">
                          Teyit Ref: {hotelCommitment.hotelConfirmationRef} ·{' '}
                          {hotelCommitment.hotelConfirmedBy}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleLcvLock}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white cursor-pointer"
                    >
                      {isLcvLockedForHotel
                        ? 'LCV Kilidini Aç'
                        : '1. Adım: Kesin LCV Listesini Kilitle'}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="text"
                      aria-label="Otel Banket Teyit Referans No"
                      value={hotelRefDraft}
                      onChange={(e) => setHotelRefDraft(e.target.value)}
                      placeholder="Örn: PP-BNQ-2026-1842"
                      className="flex-1 min-w-[160px] text-xs font-mono-num bg-[#09152B]/90 border border-white/15 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#F7A81B]"
                    />
                    <button
                      type="button"
                      onClick={handleConfirmHotelBanquetRef}
                      className="min-h-[32px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                    >
                      2. Adım: Otel Banket Teyidini Kaydet
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-[#09152B]/80 border border-white/10">
                      <label htmlFor="min-guarantee-input" className="block text-slate-400">
                        Min. Garanti Kuver
                      </label>
                      <input
                        id="min-guarantee-input"
                        type="number"
                        min={10}
                        max={100}
                        value={hotelMinGuarantee}
                        onChange={(e) => {
                          const nextVal = Number(e.target.value) || 35;
                          if (onUpdateMeetingHotelCommitment) {
                            onUpdateMeetingHotelCommitment(meeting.meetingNo, {
                              minHotelGuarantee: nextVal,
                            });
                          } else {
                            setLocalMinGuarantee(nextVal);
                          }
                        }}
                        className="w-full mt-0.5 bg-transparent font-mono-num font-bold text-white text-xs focus:outline-none"
                      />
                    </div>
                    <div className="p-2 rounded-lg bg-[#09152B]/80 border border-white/10">
                      <label htmlFor="unit-kuver-input" className="block text-slate-400">
                        Birim Kuver (TL)
                      </label>
                      <input
                        id="unit-kuver-input"
                        type="number"
                        min={500}
                        step={50}
                        value={hotelUnitKuverPrice}
                        onChange={(e) => {
                          const nextPrice = Number(e.target.value) || 1850;
                          if (onUpdateMeetingHotelCommitment) {
                            onUpdateMeetingHotelCommitment(meeting.meetingNo, {
                              unitKuverCostTL: nextPrice,
                            });
                          } else {
                            setLocalUnitKuverPrice(nextPrice);
                          }
                        }}
                        className="w-full mt-0.5 bg-transparent font-mono-num font-bold text-white text-xs focus:outline-none"
                      />
                    </div>
                    <div className="p-2 rounded-lg bg-[#09152B]/80 border border-white/10">
                      <div className="text-slate-400">Faturalanan / Boş Garanti</div>
                      <div className="font-mono-num font-bold text-white text-xs mt-0.5">
                        {hotelCommitment.guaranteedBillableKuver} Kuver ({hotelCommitment.unfilledGuaranteeSeats} Boş)
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#09152B]/80 border border-white/10">
                      <div className="text-slate-400">Tahmini Otel Faturası</div>
                      <div className="font-mono-num font-bold text-[#F7A81B] text-xs mt-0.5">
                        {formatTL(hotelCommitment.guaranteedBillableKuver * hotelUnitKuverPrice)}
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
                  <span>Kesin Kuver Mutabakat Özetini Sunucuya Kaydet</span>
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
                    <span>Toplantı Ritüel Akışı (#{meeting.meetingNo}. Toplantı)</span>
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

      {/* Modal: + Yeni Toplantı Planla (#1843) */}
      {isPlanMeetingModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-meeting-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Genel Sekreterlik & Program Komitesi
                </div>
                <h3
                  id="plan-meeting-modal-title"
                  className="font-serif-display text-xl font-bold text-slate-900"
                >
                  Yeni Haftalık Toplantı Planla (#{nextMeetingNo})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPlanMeetingModalOpen(false)}
                className="min-h-[36px] px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handlePlanMeetingSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="plan-meeting-date"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Toplantı Tarihi
                  </label>
                  <input
                    id="plan-meeting-date"
                    type="text"
                    value={planDate}
                    onChange={(e) => setPlanDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="plan-meeting-venue"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Toplantı Mekanı
                  </label>
                  <input
                    id="plan-meeting-venue"
                    type="text"
                    value={planVenue}
                    onChange={(e) => setPlanVenue(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="plan-speaker-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Konuk Konuşmacı Adı
                  </label>
                  <input
                    id="plan-speaker-name"
                    type="text"
                    value={planSpeakerName}
                    onChange={(e) => setPlanSpeakerName(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="plan-speaker-title"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Konuşmacı Unvanı
                  </label>
                  <input
                    id="plan-speaker-title"
                    type="text"
                    value={planSpeakerTitle}
                    onChange={(e) => setPlanSpeakerTitle(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="plan-speaker-topic"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Konuşma Konusu
                </label>
                <input
                  id="plan-speaker-topic"
                  type="text"
                  value={planTopic}
                  onChange={(e) => setPlanTopic(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="plan-speaker-bio"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Kısa Özgeçmiş Notu
                </label>
                <textarea
                  id="plan-speaker-bio"
                  rows={2}
                  value={planBio}
                  onChange={(e) => setPlanBio(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPlanMeetingModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] cursor-pointer"
                >
                  Toplantı #{nextMeetingNo} Gündemini Yayınla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
