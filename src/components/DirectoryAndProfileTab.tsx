import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  Building2,
  CalendarHeart,
  Droplet,
  Heart,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  ClubCommittee,
  ClubRole,
  PastPresidentRecord,
  RotaryMember,
  TermBoardInfo,
} from '../types/rotary';
import {
  filterMembersByQueryAndClassification,
  formatTL,
} from '../utils/rotaryLogic';
import { RotaryWheelIcon } from './RotaryArtwork';

interface DirectoryAndProfileTabProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  members: RotaryMember[];
  committees: ClubCommittee[];
  pastPresidents: PastPresidentRecord[];
  termInfo: TermBoardInfo;
  onTriggerRollover: () => void;
  onOpenWalletModalForMember: (member: RotaryMember) => void;
  onAddNewMember: (newMember: RotaryMember) => void;
}

type DirectorySubTab = 'members' | 'committees' | 'past_presidents' | 'four_way_test';

const INDUSTRY_CATEGORIES = [
  'Tümü',
  'Yazılım & Teknoloji',
  'Deniz Hukuku',
  'Mimarlık',
  'Tekstil',
  'Finans',
  'Sağlık & Tıp',
  'Kültür & Sanat',
];

export const DirectoryAndProfileTab: React.FC<DirectoryAndProfileTabProps> = ({
  activeRole,
  onSelectRole,
  members,
  committees,
  pastPresidents,
  termInfo,
  onTriggerRollover,
  onOpenWalletModalForMember,
  onAddNewMember,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<DirectorySubTab>('members');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tümü');
  const [selectedProfileMember, setSelectedProfileMember] =
    useState<RotaryMember | null>(null);

  // Add New Member Modal State (Secretary / President)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('Doç. Dr. Kaan Özdemir');
  const [newClassification, setNewClassification] = useState(
    'Biyoteknoloji & Genetik Araştırmalar'
  );
  const [newIndustry, setNewIndustry] =
    useState<RotaryMember['industryCategory']>('Sağlık & Tıp');
  const [newCompany, setNewCompany] = useState('Boğaziçi Biyoteknoloji Enstitüsü');
  const [newPosition, setNewPosition] = useState('Enstitü Direktörü');
  const [newPhone, setNewPhone] = useState('+90 532 880 45 12');
  const [newEmail, setNewEmail] = useState('kaan.ozdemir@bosphorusbio.org');
  const [newBloodGroup, setNewBloodGroup] =
    useState<RotaryMember['bloodGroup']>('A Rh+');
  const [newSpouseName, setNewSpouseName] = useState('Dr. Elif Özdemir');
  const [newSponsorName, setNewSponsorName] = useState('Rtn. Dr. Kerem Aydın');
  const [newCommittee, setNewCommittee] = useState('Hizmet Projeleri Komitesi');

  const filteredMembers = filterMembersByQueryAndClassification(
    members,
    searchQuery,
    selectedCategory
  );

  const currentUserMember =
    members.find((m) => m.id === 'm-rifat') || members[0];
  const isBoardLeader = activeRole === 'baskan' || activeRole === 'sekreter';

  const handleAddMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newClassification.trim()) return;
    const randomRotaryId = `TR-2420-${Math.floor(89500 + Math.random() * 900)}`;
    const createdMember: RotaryMember = {
      id: `m-${Date.now()}`,
      rotaryId: randomRotaryId,
      fullName: newFullName.trim(),
      clubTitle: 'Üye (Yeni Kabul — 2026)',
      classification: newClassification.trim(),
      industryCategory: newIndustry,
      companyName: newCompany.trim() || 'Bağımsız Kuruluş',
      position: newPosition.trim() || 'Yönetici Ortak',
      phone: newPhone.trim() || '+90 532 000 00 00',
      email: newEmail.trim() || 'uye@galatarotary.org',
      bloodGroup: newBloodGroup,
      phfLevel: 'PHF Adayı',
      phfStars: 0,
      attendancePercent: 100,
      spouseName: newSpouseName.trim() || undefined,
      birthday: '15 Nisan',
      weddingAnniversary: newSpouseName.trim() ? '20 Eylül' : undefined,
      joinYear: 2026,
      sponsorMember: newSponsorName.trim() || 'Rtn. Mimar Emre Karaca',
      sponsorName: newSponsorName.trim() || 'Rtn. Mimar Emre Karaca',
      committees: [newCommittee],
      duesBalance: 0,
      mealBalance: 0,
      foundationBalance: 0,
      rsvpStatus: 'attending',
      mealPreference: 'Standart',
    };
    onAddNewMember(createdMember);
    setIsAddMemberModalOpen(false);
    setSelectedProfileMember(createdMember);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 4 Sub-Tabs (Members, Committees, Past Presidents, Four-Way Test & Bylaws) */}
        <div className="lg:col-span-8 space-y-5">
          <section
            aria-labelledby="classification-directory-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
          >
            {/* Header & + Yeni Üye Ekle Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Galata Rotary Kulübü · Kurumsal Hafıza & Meslek Sınıflandırması
                </div>
                <h1
                  id="classification-directory-heading"
                  className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5"
                >
                  Kulüp Rehberi, Komiteler & Kurumsal Tüzük
                </h1>
              </div>

              {isBoardLeader ? (
                <button
                  type="button"
                  onClick={() => setIsAddMemberModalOpen(true)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#F7A81B]" />
                  <span>+ Yeni Üye Ekle</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectRole('sekreter')}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
                >
                  Üye Eklemek İçin Sekreter Rolüne Geç
                </button>
              )}
            </div>

            {/* 4 Sub-Tab Navigation */}
            <div
              role="tablist"
              aria-label="Rehber ve Kurumsal Alt Sekmeleri"
              className="flex items-center gap-1.5 overflow-x-auto bg-slate-100 p-1.5 rounded-xl"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeSubTab === 'members'}
                onClick={() => setActiveSubTab('members')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeSubTab === 'members'
                    ? 'bg-white text-[#0C3C7C] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Üye Rehberi ({members.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSubTab === 'committees'}
                onClick={() => setActiveSubTab('committees')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeSubTab === 'committees'
                    ? 'bg-white text-[#0C3C7C] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kulüp Komiteleri ({committees.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSubTab === 'past_presidents'}
                onClick={() => setActiveSubTab('past_presidents')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeSubTab === 'past_presidents'
                    ? 'bg-white text-[#0C3C7C] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Geçmiş Dönem Başkanları (GDB)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSubTab === 'four_way_test'}
                onClick={() => setActiveSubTab('four_way_test')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeSubTab === 'four_way_test'
                    ? 'bg-white text-[#0C3C7C] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dörtlü Özdenetim & Tüzük
              </button>
            </div>

            {/* SUB-TAB 1: ÜYE REHBERİ */}
            {activeSubTab === 'members' && (
              <div className="space-y-4">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    aria-label="Üye adı, meslek kolu, şirket veya kan grubu ara"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Üye adı, sınıflandırma (örn: Deniz Hukuku, Yazılım, Mimarlık), şirket veya kan grubu ara..."
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-slate-900 focus:outline-none focus:bg-white focus:border-[#0C3C7C]"
                  />
                </div>

                {/* Interactive Category Filter Buttons */}
                <div
                  role="group"
                  aria-label="Meslek Kolu Filtresi"
                  className="flex items-center gap-1.5 overflow-x-auto pb-1"
                >
                  {INDUSTRY_CATEGORIES.map((category) => {
                    const isSelected = selectedCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedCategory(category)}
                        aria-pressed={isSelected}
                        className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#0C3C7C] text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>

                {/* Filtered Members List */}
                {filteredMembers.length === 0 ? (
                  <div className="p-8 text-center rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <p className="text-sm font-semibold text-slate-700">
                      Arama kriterlerinize uygun kulüp üyesi bulunamadı.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('Tümü');
                      }}
                      className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#0C3C7C] text-white text-xs font-semibold cursor-pointer"
                    >
                      Filtreleri Temizle
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredMembers.map((member) => (
                      <div
                        key={member.id}
                        className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#0C3C7C]/50 transition-all flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-semibold text-[#0C3C7C]">
                                {member.industryCategory} · {member.rotaryId}
                              </div>
                              <h2 className="font-serif-display text-xl font-bold text-slate-900">
                                {member.fullName}
                              </h2>
                              <div className="text-xs text-slate-500 font-medium">
                                {member.clubTitle}
                              </div>
                            </div>

                            {/* Paul Harris Fellow (PHF) Star Indicator */}
                            <div className="text-right shrink-0">
                              <div className="inline-flex items-center gap-1 text-xs font-bold text-[#0F172A]">
                                <Star className="w-3.5 h-3.5 fill-[#F7A81B] text-[#F7A81B]" />
                                <span>{member.phfLevel}</span>
                              </div>
                              <div className="text-[11px] font-mono-num text-slate-500 mt-0.5">
                                Kan: <strong className="text-slate-800">{member.bloodGroup}</strong>
                              </div>
                            </div>
                          </div>

                          <div className="pt-1 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                            <div>
                              <span className="font-semibold text-slate-800">Sınıflandırma: </span>
                              <span>{member.classification}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-800">Kurum: </span>
                              <span>
                                {member.companyName} ({member.position})
                              </span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-800">Giriş Yılı & Komite: </span>
                              <span>
                                {member.joinYear} · {member.committees[0] || 'Kulüp Üyesi'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setSelectedProfileMember(member)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0C3C7C] hover:bg-[#17458F] text-white font-semibold transition-colors cursor-pointer"
                          >
                            Detaylı Üye Profili & İletişim
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenWalletModalForMember(member)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0C3C7C] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Wallet Kartı
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2: KULÜP KOMİTELERİ */}
            {activeSubTab === 'committees' && (
              <div className="space-y-4">
                <p className="text-xs sm:text-sm text-slate-600">
                  Uluslararası Rotary Kulüp Liderlik Planı çerçevesinde faaliyet gösteren 6 ana Galata Rotary komitesi, dönem başkanları ve stratejik hedefleri:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {committees.map((com) => (
                    <div
                      key={com.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold text-[#0C3C7C]">
                              Başkan: {com.chairName}
                            </div>
                            <h3 className="font-serif-display text-lg font-bold text-slate-900 mt-0.5">
                              {com.name}
                            </h3>
                          </div>
                          <Users className="w-4 h-4 text-[#F7A81B] shrink-0" />
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          <strong className="text-slate-800">Dönem Hedefi: </strong>
                          {com.termGoal}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-200/80 space-y-1">
                        <div className="text-[11px] font-semibold text-slate-500">
                          Komite Üyeleri ({com.members.length}) · Bşk. Yrd: {com.viceChairName}
                        </div>
                        <div className="text-xs font-medium text-slate-800">
                          {com.members.join(' · ')}
                        </div>
                        <div className="text-[11px] text-[#0C3C7C] font-semibold pt-1">
                          Aktif Proje: {com.activeProjectsCount} · Tahsis Bütçe: {formatTL(com.budgetAllocated)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-TAB 3: GEÇMİŞ DÖNEM BAŞKANLARI (GDB ŞEREF LİSTESİ) */}
            {activeSubTab === 'past_presidents' && (
              <div className="space-y-4">
                <p className="text-xs sm:text-sm text-slate-600">
                  Galata Rotary Kulübü’ne liderlik etmiş Geçmiş Dönem Başkanlarımız (GDB), Uluslararası Rotary dönem temaları ve kalıcı eserleri:
                </p>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
                  {pastPresidents.map((gdb) => (
                    <div
                      key={gdb.id}
                      className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-xs font-bold text-[#0C3C7C]">
                            {gdb.termYears} Dönemi
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="text-xs font-semibold text-amber-700">
                            UR Teması: “{gdb.rotaryTheme}”
                          </span>
                        </div>
                        <h3 className="font-serif-display text-lg font-bold text-slate-900">
                          {gdb.presidentName}
                        </h3>
                        <p className="text-xs text-slate-600">
                          <strong className="text-slate-800">Dönem İz Bırakan Projesi: </strong>
                          {gdb.flagshipProject}
                        </p>
                      </div>

                      <div className="shrink-0 sm:text-right">
                        <div className="inline-flex items-center gap-1 text-xs font-bold text-[#0F172A]">
                          <Award className="w-4 h-4 text-[#F7A81B]" />
                          <span>{gdb.phfHonors}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-TAB 4: DÖRTLÜ ÖZDENETİM (FOUR-WAY TEST) & KULÜP TÜZÜĞÜ */}
            {activeSubTab === 'four_way_test' && (
              <div className="space-y-5">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-[#09152B] via-[#0C3C7C] to-[#0F172A] text-white space-y-4">
                  <div className="flex items-center justify-between border-b border-white/15 pb-3">
                    <div>
                      <div className="text-xs text-[#F7A81B] font-semibold">
                        Herbert J. Taylor (1932) · Uluslararası Rotary Etik Pusulası
                      </div>
                      <h3 className="font-serif-display text-xl font-bold mt-0.5">
                        Rotary Dörtlü Özdenetim (The Four-Way Test)
                      </h3>
                    </div>
                    <Scale className="w-6 h-6 text-[#F7A81B]" />
                  </div>

                  <p className="text-xs text-slate-200">
                    Düşündüğümüz, söylediğimiz veya yaptığımız şeyler:
                  </p>

                  <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <li className="p-3 rounded-xl bg-white/10 border border-white/15">
                      <span className="font-mono-num text-[#F7A81B] font-bold">1. </span>
                      <strong>GERÇEĞE UYGUN MU?</strong>
                    </li>
                    <li className="p-3 rounded-xl bg-white/10 border border-white/15">
                      <span className="font-mono-num text-[#F7A81B] font-bold">2. </span>
                      <strong>İLGİLİLERİN TÜMÜ İÇİN ADİL Mİ?</strong>
                    </li>
                    <li className="p-3 rounded-xl bg-white/10 border border-white/15">
                      <span className="font-mono-num text-[#F7A81B] font-bold">3. </span>
                      <strong>İYİ NİYET VE DAHA İYİ DOSTLUKLAR SAĞLAYACAK MI?</strong>
                    </li>
                    <li className="p-3 rounded-xl bg-white/10 border border-white/15">
                      <span className="font-mono-num text-[#F7A81B] font-bold">4. </span>
                      <strong>İLGİLİLERİN TÜMÜ İÇİN YARARLI MI?</strong>
                    </li>
                  </ol>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3 text-xs text-slate-700 leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                    <ShieldCheck className="w-4 h-4 text-[#0C3C7C]" />
                    <span>Galata Rotary Kulübü Tüzük & İçtüzük Esasları Özeti</span>
                  </div>
                  <p>
                    <strong>Madde 1 — Toplantı Düzeni:</strong> Kulüp olağan toplantıları her Salı günü saat 19:30’da Pera Palace Hotel Galata Salonu’nda gerçekleştirilir.
                  </p>
                  <p>
                    <strong>Madde 2 — Devamlılık ve Make-up:</strong> Üyelerin dönem içi toplantı devam oranının en az %60 olması esastır. Mazeretli olunan haftadan önceki veya sonraki 14 gün içinde başka bir Rotary kulübü toplantısına, Ocakbaşı buluşmasına veya komite projesine katılarak dijital Make-up bildirimi yapılabilir.
                  </p>
                  <p>
                    <strong>Madde 3 — Sınıflandırma İlkesi:</strong> Kulüp üyeliği iş ve meslek kollarının dengeli temsili (Classification) esasına dayanır. Her asil üye kendi meslek etiğiyle topluma hizmet eder.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Apple Wallet Digital Rotary ID Preview + 1 Temmuz Rollover Engine */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card 1: Apple Wallet Digital Rotary ID Trigger Card */}
          <section
            aria-labelledby="apple-wallet-preview-heading"
            className="bg-gradient-to-br from-[#09152B] via-[#0C3C7C] to-[#0F172A] text-white rounded-3xl p-5 sm:p-6 space-y-5 shadow-md border border-white/10"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 border border-[#F7A81B]/40 flex items-center justify-center text-[#F7A81B]">
                  <RotaryWheelIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-[#F7A81B] font-semibold">
                    Apple Wallet · Dijital Rotary Kimliği
                  </div>
                  <h2
                    id="apple-wallet-preview-heading"
                    className="font-serif-display text-lg font-bold text-white"
                  >
                    GALATA ROTARY · 2420. BÖLGE
                  </h2>
                </div>
              </div>
              <Smartphone className="w-5 h-5 text-[#F7A81B]" />
            </div>

            <div className="space-y-2">
              <div className="text-xs text-slate-300">Asil Üye & PHF Dostu</div>
              <div className="font-serif-display text-2xl font-bold text-white">
                Rtn. {currentUserMember.fullName}
              </div>
              <div className="text-xs text-[#F7A81B] font-medium">
                {currentUserMember.classification}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-xs border-t border-white/10">
              <div>
                <div className="text-[10px] text-slate-400">ROTARY ID</div>
                <div className="font-mono-num font-semibold text-white mt-0.5">
                  {currentUserMember.rotaryId}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">PHF SEVİYESİ</div>
                <div className="font-semibold text-[#F7A81B] mt-0.5">
                  {currentUserMember.phfLevel}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">KAN GRUBU</div>
                <div className="font-mono-num font-semibold text-white mt-0.5">
                  {currentUserMember.bloodGroup}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenWalletModalForMember(currentUserMember)}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#F7A81B] hover:bg-[#f9b53b] text-[#0F172A] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>Tam Ekran Apple Wallet & vCard QR Kimliği Aç</span>
            </button>
          </section>

          {/* Card 2: 1 Temmuz Dönem Devir-Teslim (Rollover) Motoru */}
          <section
            aria-labelledby="july-rollover-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs"
          >
            <div className="border-b border-slate-100 pb-3.5">
              <div className="text-xs font-semibold text-[#0C3C7C]">
                Kulüp Süreklilik & Dijital Hafıza Motoru
              </div>
              <h2
                id="july-rollover-heading"
                className="font-serif-display text-xl font-bold text-slate-900 mt-0.5"
              >
                1 Temmuz Dönem Devir-Teslim (Rollover) Motoru
              </h2>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Aktif Dönem:</span>
                <span className="font-semibold text-slate-900">{termInfo.termLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Dönem Başkanı:</span>
                <span className="font-semibold text-[#0C3C7C]">{termInfo.president}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Genel Sekreter:</span>
                <span className="font-semibold text-slate-800">{termInfo.secretary}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Kulüp Saymanı:</span>
                <span className="font-semibold text-slate-800">{termInfo.treasurer}</span>
              </div>
            </div>

            {termInfo.archivedYearbook && (
              <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                  <BookOpen className="w-4 h-4 text-[#0C3C7C]" />
                  <span>
                    Galata Dijital Yıllığı Arşivlendi ({termInfo.archivedYearbook.termLabel})
                  </span>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed">
                  {termInfo.archivedYearbook.president} başkanlığındaki dönem;{' '}
                  <strong>{termInfo.archivedYearbook.totalMeetings} toplantı</strong>,{' '}
                  <strong>{termInfo.archivedYearbook.totalProjects} hizmet projesi</strong> ve{' '}
                  <strong>{formatTL(termInfo.archivedYearbook.totalDonationsTL)}</strong> toplam fon
                  ile Galata Dijital Yıllığı’na kaydedilmiştir.
                </p>
              </div>
            )}

            {!isBoardLeader ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  1 Temmuz Dönem Devir-Teslim (Rollover) simülasyonu yalnızca <strong>Başkan</strong> ve <strong>Genel Sekreter</strong> rolündeyken aktiftir.
                </p>
                <button
                  type="button"
                  onClick={() => onSelectRole('baskan')}
                  className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-[#0F172A] text-[#F7A81B] text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Devir-Teslim İçin Başkan Rolüne Geç
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onTriggerRollover}
                disabled={termInfo.isRolloverCompleted}
                className={`w-full min-h-[46px] py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  termInfo.isRolloverCompleted
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                    : 'bg-[#0C3C7C] hover:bg-[#17458F] text-white'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>
                  {termInfo.isRolloverCompleted
                    ? '2027-2028 Dönemi Devir-Teslimi Tamamlandı'
                    : '1 Temmuz Devir-Teslimi Başlat & 2027-2028 Yönetimini Aktif Et'}
                </span>
              </button>
            )}
          </section>
        </div>
      </div>

      {/* NEW v3.0: Detaylı Üye Profili Modalı */}
      {selectedProfileMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-detail-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  {selectedProfileMember.rotaryId} · {selectedProfileMember.industryCategory}
                </div>
                <h3
                  id="member-detail-modal-title"
                  className="font-serif-display text-2xl font-bold text-slate-900 mt-0.5"
                >
                  Rtn. {selectedProfileMember.fullName}
                </h3>
                <p className="text-xs text-slate-600 font-medium">
                  {selectedProfileMember.clubTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfileMember(null)}
                className="min-h-[36px] px-3 rounded-lg bg-slate-100 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            {/* One-Tap Action Buttons: Call, WhatsApp, Email */}
            <div className="grid grid-cols-3 gap-2.5">
              <a
                href={`tel:${selectedProfileMember.phone.replace(/\s+/g, '')}`}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-[#F7A81B]" />
                <span>Hemen Ara</span>
              </a>
              <a
                href={`https://wa.me/${selectedProfileMember.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
              <a
                href={`mailto:${selectedProfileMember.email}`}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-[#F7A81B]" />
                <span>E-Posta</span>
              </a>
            </div>

            {/* Member Profile Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-slate-500 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-[#0C3C7C]" />
                  <span>Şirket & Pozisyon</span>
                </div>
                <div className="font-bold text-slate-900">
                  {selectedProfileMember.companyName}
                </div>
                <div className="text-slate-600">{selectedProfileMember.position}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-slate-500 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-[#F7A81B]" />
                  <span>PHF Rozeti & Kan Grubu</span>
                </div>
                <div className="font-bold text-slate-900">
                  {selectedProfileMember.phfLevel} · Kan: {selectedProfileMember.bloodGroup}
                </div>
                <div className="text-slate-600">
                  Devamlılık: %{selectedProfileMember.attendancePercent}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-slate-500 flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-rose-600" />
                  <span>Eş Adı & Mutlu Günler</span>
                </div>
                <div className="font-bold text-slate-900">
                  Eşi: {selectedProfileMember.spouseName || 'Belirtilmedi'}
                </div>
                <div className="text-slate-600">
                  Doğum Günü: {selectedProfileMember.birthday}
                  {selectedProfileMember.weddingAnniversary
                    ? ` · Evlilik YD: ${selectedProfileMember.weddingAnniversary}`
                    : ''}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-slate-500 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-[#0C3C7C]" />
                  <span>Kulübe Giriş & Rehber Üye</span>
                </div>
                <div className="font-bold text-slate-900">
                  Giriş Yılı: {selectedProfileMember.joinYear}
                </div>
                <div className="text-slate-600">
                  Rehber (Sponsor): {selectedProfileMember.sponsorName}
                </div>
              </div>
            </div>

            {/* Committees List */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div className="font-semibold text-slate-700">
                Görev Aldığı Kulüp Komiteleri:
              </div>
              <div className="font-medium text-[#0C3C7C]">
                {selectedProfileMember.committees.join(' · ')}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500 font-mono-num">
                {selectedProfileMember.phone} · {selectedProfileMember.email}
              </div>
              <button
                type="button"
                onClick={() => {
                  const target = selectedProfileMember;
                  setSelectedProfileMember(null);
                  onOpenWalletModalForMember(target);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F7A81B] text-[#0F172A] text-xs font-semibold hover:bg-[#f9b53b] cursor-pointer"
              >
                3D Apple Wallet Kimliğini Aç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW v3.0: + Yeni Üye Ekle Modalı */}
      {isAddMemberModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-member-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Üyelik ve Sınıflandırma Komitesi · Yeni Üye Kabulü
                </div>
                <h3
                  id="add-member-modal-title"
                  className="font-serif-display text-xl font-bold text-slate-900"
                >
                  Galata Rotary Rehberine Yeni Üye Ekle
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMemberModalOpen(false)}
                className="min-h-[36px] px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-member-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Adı Soyadı & Ünvanı
                  </label>
                  <input
                    id="new-member-name"
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-member-industry"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Sektör / Sınıflandırma Grubu
                  </label>
                  <select
                    id="new-member-industry"
                    value={newIndustry}
                    onChange={(e) =>
                      setNewIndustry(e.target.value as RotaryMember['industryCategory'])
                    }
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  >
                    <option value="Sağlık & Tıp">Sağlık & Tıp</option>
                    <option value="Yazılım & Teknoloji">Yazılım & Teknoloji</option>
                    <option value="Deniz Hukuku">Deniz Hukuku</option>
                    <option value="Mimarlık">Mimarlık</option>
                    <option value="Tekstil">Tekstil</option>
                    <option value="Finans">Finans</option>
                    <option value="Kültür & Sanat">Kültür & Sanat</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-member-classification"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Meslek Sınıflandırması (Classification)
                </label>
                <input
                  id="new-member-classification"
                  type="text"
                  value={newClassification}
                  onChange={(e) => setNewClassification(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-member-company"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Kurum / Şirket Adı
                  </label>
                  <input
                    id="new-member-company"
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-member-position"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Pozisyon
                  </label>
                  <input
                    id="new-member-position"
                    type="text"
                    value={newPosition}
                    onChange={(e) => setNewPosition(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="new-member-phone"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    GSM Telefon
                  </label>
                  <input
                    id="new-member-phone"
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full text-sm font-mono-num bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-member-email"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    E-Posta
                  </label>
                  <input
                    id="new-member-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-member-blood"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Kan Grubu
                  </label>
                  <select
                    id="new-member-blood"
                    value={newBloodGroup}
                    onChange={(e) =>
                      setNewBloodGroup(e.target.value as RotaryMember['bloodGroup'])
                    }
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  >
                    <option value="A Rh+">A Rh+</option>
                    <option value="0 Rh+">0 Rh+</option>
                    <option value="B Rh+">B Rh+</option>
                    <option value="AB Rh+">AB Rh+</option>
                    <option value="A Rh-">A Rh-</option>
                    <option value="0 Rh-">0 Rh-</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="new-member-spouse"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Eş Adı (Opsiyonel)
                  </label>
                  <input
                    id="new-member-spouse"
                    type="text"
                    value={newSpouseName}
                    onChange={(e) => setNewSpouseName(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-member-sponsor"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Rehber (Sponsor) Üye
                  </label>
                  <input
                    id="new-member-sponsor"
                    type="text"
                    value={newSponsorName}
                    onChange={(e) => setNewSponsorName(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-member-committee"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Atanacağı Komite
                  </label>
                  <input
                    id="new-member-committee"
                    type="text"
                    value={newCommittee}
                    onChange={(e) => setNewCommittee(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddMemberModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] cursor-pointer"
                >
                  Üyeyi Rehbere Kaydet & Rozet Tanımla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
