import React, { useState } from 'react';
import {
  Archive,
  Award,
  BookOpen,
  Building2,
  Droplet,
  Mail,
  Phone,
  QrCode,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Star,
} from 'lucide-react';
import { ClubRole, RotaryMember, TermBoardInfo } from '../types/rotary';
import {
  filterMembersByQueryAndClassification,
  formatTL,
} from '../utils/rotaryLogic';
import { RotaryWheelIcon } from './RotaryArtwork';

interface DirectoryAndProfileTabProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  members: RotaryMember[];
  termInfo: TermBoardInfo;
  onTriggerRollover: () => void;
  onOpenWalletModalForMember: (member: RotaryMember) => void;
}

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
  termInfo,
  onTriggerRollover,
  onOpenWalletModalForMember,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tümü');

  const filteredMembers = filterMembersByQueryAndClassification(
    members,
    searchQuery,
    selectedCategory
  );

  const currentUserMember =
    members.find((m) => m.id === 'm-rifat') || members[0];
  const isBoardLeader = activeRole === 'baskan' || activeRole === 'sekreter';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Classification Directory (Sınıflandırma Rehberi) */}
        <div className="lg:col-span-8 space-y-5">
          <section
            aria-labelledby="classification-directory-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Galata Rotary Kulübü · Üye & Meslek Sınıflandırması
                </div>
                <h1
                  id="classification-directory-heading"
                  className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5"
                >
                  Meslek Sınıflandırması (Classification) Rehberi
                </h1>
              </div>
              <span className="text-xs font-mono-num text-slate-500">
                {filteredMembers.length} / {members.length} Üye Listeleniyor
              </span>
            </div>

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
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
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
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 font-mono-num truncate">
                        {member.phone}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenWalletModalForMember(member)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-[#0C3C7C] hover:text-white text-[#0C3C7C] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Apple Wallet Kimliği
                      </button>
                    </div>
                  </div>
                ))}
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
    </div>
  );
};
