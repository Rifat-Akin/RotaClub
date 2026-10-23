import React, { useState } from 'react';
import {
  Camera,
  GraduationCap,
  HeartHandshake,
  MapPin,
  Plus,
  Ticket,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  ClubRole,
  GalataProject,
  GalleryArchivePhoto,
  ScholarStudent,
} from '../types/rotary';
import {
  calculateProjectProgress,
  calculateSpecializedModulesSummary,
  formatTL,
  SpecializedModuleData,
  SYNTHETIC_SPECIALIZED_MODULES,
} from '../utils/rotaryLogic';
import { ProjectVisualArtwork } from './RotaryArtwork';

interface ProjectsTabProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  projects: GalataProject[];
  galleryPhotos: GalleryArchivePhoto[];
  scholars: ScholarStudent[];
  onSupportProject: (projectId: string, amount: number, supportType: string) => void;
  onCreateProject: (newProject: Omit<GalataProject, 'id' | 'collectedAmount' | 'supportersCount'>) => void;
  onSponsorScholarMonth: (scholarId: string) => void;
  onToggleProjectVolunteer?: (projectId: string) => void;
  specializedModules?: SpecializedModuleData;
  activeMemberName?: string;
}

export const ProjectsTab: React.FC<ProjectsTabProps> = ({
  activeRole,
  onSelectRole,
  projects,
  galleryPhotos,
  scholars,
  onSupportProject,
  onCreateProject,
  onSponsorScholarMonth,
  onToggleProjectVolunteer,
  specializedModules,
  activeMemberName = 'Rtn. Rifat Akın',
}) => {
  const [selectedProject, setSelectedProject] = useState<GalataProject | null>(null);
  const [supportTier, setSupportTier] = useState<'ticket' | 'double_ticket' | 'patron'>('ticket');
  const [customAmount, setCustomAmount] = useState<number>(5000);
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryArchivePhoto | null>(null);

  // New Project Modal State (President / Secretary)
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('Galata Deniz Temizliği & Su Farkındalık Seferberliği');
  const [newSubtitle, setNewSubtitle] = useState('Haliç & Karaköy Kıyı Ekosistemi Koruma Projesi');
  const [newCategory, setNewCategory] = useState<GalataProject['category']>('Toplum Hizmetleri');
  const [newDateLabel, setNewDateLabel] = useState('24 Nisan 2027 · Cumartesi');
  const [newVenue, setNewVenue] = useState('Haliç Tersanesi & Karaköy Sahil Hattı');
  const [newDescription, setNewDescription] = useState(
    'DenizTemiz Derneği ve üniversite kulüpleri işbirliğiyle Haliç kıyısında dalgıç destekli dip temizliği ve lise öğrencilerine sıfır atık atölyesi.'
  );
  const [newTargetBudget, setNewTargetBudget] = useState<number>(280000);
  const [newTicketPrice, setNewTicketPrice] = useState<number>(3500);
  const [newCommitteeChair, setNewCommitteeChair] = useState('Rtn. Deniz Arslan');
  const [newVisualTheme, setNewVisualTheme] = useState<GalataProject['visualTheme']>('school');

  const isBoardLeader = activeRole === 'baskan' || activeRole === 'sekreter';
  const activeSpecializedModules =
    specializedModules || SYNTHETIC_SPECIALIZED_MODULES;
  const specializedSummary = calculateSpecializedModulesSummary(
    activeSpecializedModules
  );

  const openSupportModal = (project: GalataProject) => {
    setSelectedProject(project);
    setSupportTier('ticket');
    setCustomAmount(project.ticketPrice);
  };

  const handleConfirmSupport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    const labelMap = {
      ticket: '1 Adet Protokol Davetiyesi & Bağış',
      double_ticket: 'Eşli Protokol Davetiyesi (+1) & Bağış',
      patron: 'Kurumsal / PHF Proje Hamisi Katkısı',
    };
    onSupportProject(selectedProject.id, customAmount, labelMap[supportTier]);
    setSelectedProject(null);
  };

  const handleCreateNewProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newVenue.trim() || newTargetBudget <= 0) return;
    onCreateProject({
      code: `GLR-PRJ-0${projects.length + 1}`,
      title: newTitle.trim(),
      subtitle: newSubtitle.trim() || 'Galata Rotary Dönem Hizmet Projesi',
      category: newCategory,
      dateLabel: newDateLabel.trim() || 'Mayıs 2027',
      venue: newVenue.trim(),
      description: newDescription.trim(),
      targetBudget: Number(newTargetBudget),
      ticketPrice: Number(newTicketPrice) || 2500,
      committeeChair: newCommitteeChair.trim() || 'Rtn. Deniz Arslan',
      impactMetrics: ['Yeni Dönem Hizmet Projesi', `Hedef Bütçe: ${formatTL(newTargetBudget)}`],
      visualTheme: newVisualTheme,
    });
    setIsNewProjectModalOpen(false);
  };

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="text-xs font-semibold text-[#0C3C7C]">
            Uluslararası Rotary 2420. Bölge · Galata Kültür, Sanat ve Toplum Hizmetleri
          </div>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5">
            Galata Projeleri & Kültür-Sanat Seferberliği
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Canlı bağış/bütçe termometresi üzerinden projelerimize davetiye alarak veya doğrudan fon katkısıyla destek olabilirsiniz.
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          <div className="sm:text-right">
            <div className="text-xs text-slate-500">Toplam Dönem Proje Fonu</div>
            <div className="text-2xl font-bold font-mono-num text-[#0C3C7C]">
              {formatTL(projects.reduce((acc, p) => acc + p.collectedAmount, 0))}
            </div>
          </div>

          {isBoardLeader ? (
            <button
              type="button"
              onClick={() => setIsNewProjectModalOpen(true)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#F7A81B]" />
              <span>+ Yeni Proje Başlat</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelectRole('baskan')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
            >
              Yeni Proje Başlatmak İçin Başkan Rolüne Geç
            </button>
          )}
        </div>
      </div>

      {/* Core Galata Projects Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {projects.map((project) => {
          const progress = calculateProjectProgress(
            project.targetBudget,
            project.collectedAmount
          );
          return (
            <article
              key={project.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col justify-between shadow-xs"
            >
              <div>
                <ProjectVisualArtwork
                  theme={project.visualTheme}
                  code={project.code}
                  category={project.category}
                />

                <div className="p-5 sm:p-6 space-y-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      <span>{project.dateLabel}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>Komite Bşk: {project.committeeChair}</span>
                    </div>
                    <h2 className="font-serif-display text-2xl font-bold text-slate-900 mt-1">
                      {project.title}
                    </h2>
                    <p className="text-xs font-semibold text-[#0C3C7C] mt-0.5">
                      {project.subtitle}
                    </p>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    {project.description}
                  </p>

                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#0C3C7C] shrink-0" />
                    <span>{project.venue}</span>
                  </div>

                  {/* Impact Metrics unboxed clean metadata */}
                  <div className="pt-1 text-xs font-medium text-slate-700">
                    {project.impactMetrics.join(' · ')}
                  </div>

                  {/* Volunteer Roster (Epic #8) */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Users className="w-3.5 h-3.5 text-[#0C3C7C] shrink-0" />
                      <span className="truncate">
                        <strong className="text-slate-800">Saha Gönüllüleri: </strong>
                        {(project.volunteers && project.volunteers.length > 0
                          ? project.volunteers
                          : ['Rtn. Deniz Arslan', 'Rtn. Zeynep Yıldırım']
                        ).join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Budget / Donation Thermometer & CTA */}
              <div className="p-5 sm:p-6 pt-0 space-y-3">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <div className="text-[11px] text-slate-500">Toplanan Bağış & Gelir</div>
                      <div className="text-base font-bold font-mono-num text-[#0C3C7C]">
                        {formatTL(project.collectedAmount)}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          / Hedef {formatTL(project.targetBudget)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold font-mono-num text-slate-900">
                        %{progress.percent}
                      </span>
                      <div className="text-[11px] text-slate-500">
                        {project.supportersCount} Destekçi
                      </div>
                    </div>
                  </div>

                  {/* Thermometer Progress Bar */}
                  <div
                    role="progressbar"
                    aria-valuenow={progress.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${project.title} bütçe gerçekleşme oranı`}
                    className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-gradient-to-r from-[#0C3C7C] to-[#F7A81B] rounded-full transition-all duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => openSupportModal(project)}
                    className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Ticket className="w-4 h-4 text-[#F7A81B] shrink-0" />
                    <span>
                      Destek Ol / Davetiye ({formatTL(project.ticketPrice)})
                    </span>
                  </button>

                  {onToggleProjectVolunteer && (
                    <button
                      type="button"
                      onClick={() => onToggleProjectVolunteer(project.id)}
                      className={`w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                        (project.volunteers || []).includes('Rtn. Rifat Akın')
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                      }`}
                    >
                      <UserCheck className="w-4 h-4 text-[#0C3C7C] shrink-0" />
                      <span>
                        {(project.volunteers || []).includes(activeMemberName)
                          ? 'Saha Gönüllüsüsünüz (Make-up)'
                          : 'Projede Saha Gönüllüsü Ol'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* NEW v3.0: Galata Rotary Bursiyer Fonu & Öğrenci Takibi */}
      <section
        aria-labelledby="scholars-fund-heading"
        className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0C3C7C]">
              <GraduationCap className="w-4 h-4 text-[#F7A81B]" />
              <span>Eğitim & Gençlik Hizmetleri · Canlı Burs Fonu</span>
            </div>
            <h2
              id="scholars-fund-heading"
              className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5"
            >
              Galata Rotary Bursiyer Fonu & Öğrenci Takibi
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Kulübümüzün desteklediği üniversite öğrencilerinin akademik gelişimini takip edebilir ve tek dokunuşla 1 aylık burs katkısı üstlenebilirsiniz.
            </p>
          </div>
          <div className="sm:text-right shrink-0">
            <div className="text-xs text-slate-500">Aktif Bursiyer Sayısı</div>
            <div className="text-lg font-bold font-mono-num text-[#0C3C7C]">
              {scholars.length} Üniversite Öğrencisi
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scholars.map((scholar) => {
            const percent = Math.min(
              100,
              Math.round((scholar.fundedMonths / scholar.totalMonths) * 100)
            );
            const isFullyFunded = scholar.fundedMonths >= scholar.totalMonths;

            return (
              <div
                key={scholar.id}
                className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#0C3C7C]">
                        {scholar.university}
                      </div>
                      <h3 className="font-serif-display text-xl font-bold text-slate-900">
                        {scholar.fullName}
                      </h3>
                      <div className="text-xs text-slate-600">
                        {scholar.department}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono-num font-bold text-slate-900">
                        {scholar.gradeLevel}
                      </div>
                      <div
                        className={`text-[11px] font-semibold mt-0.5 ${
                          isFullyFunded ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {isFullyFunded ? 'Dönem Bursu Tamamlandı' : scholar.statusNote}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 pt-1 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Mental/Mesleki Rehber: <strong className="text-slate-800">{scholar.mentorMember}</strong>
                    </span>
                    <span className="font-mono-num font-semibold text-[#0C3C7C]">
                      Aylık: {formatTL(scholar.monthlyStipend)}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">
                        Dönem Burs Karşılama Durumu
                      </span>
                      <span className="font-mono-num font-bold text-slate-900">
                        {scholar.fundedMonths} / {scholar.totalMonths} Ay (%{percent})
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#0C3C7C] to-emerald-600 rounded-full transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSponsorScholarMonth(scholar.id)}
                    disabled={isFullyFunded}
                    className={`w-full min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      isFullyFunded
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                        : 'bg-[#0F172A] hover:bg-[#0C3C7C] text-[#F7A81B] hover:text-white'
                    }`}
                  >
                    <HeartHandshake className="w-4 h-4" />
                    <span>
                      {isFullyFunded
                        ? '9 Aylık Eğitim Bursu Tamamlandı'
                        : `1 Aylık Burs Üstlen (${formatTL(scholar.monthlyStipend)})`}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Issue #51 Module: Kermes, GALATART ve RYLA Özel Modülleri (Ayrıştırılmış Brüt Gelir, Program Gideri ve Net Kulüp Fonu) */}
      <section
        aria-labelledby="specialized-modules-heading"
        data-testid="specialized-modules-panel"
        className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="text-xs font-semibold text-[#0C3C7C]">
              Galata İmzalı Özel Programlar · Muhasebe Ayrıştırmalı Modül (#51)
            </div>
            <h2
              id="specialized-modules-heading"
              className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5"
            >
              Kermes, GALATART ve RYLA Operasyon Modülleri
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Brüt etkinlik hasılatı, sanatçı/kamp giderleri ve kulübe kalan net hizmet/burs fonu ayrı muhasebe kalemleri olarak izlenir.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-right shrink-0">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500">Toplam Brüt Hasılat</div>
              <div className="text-sm font-bold font-mono-num text-slate-900">
                {formatTL(specializedSummary.totalGrossRevenueTL)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200">
              <div className="text-[11px] text-rose-700">Program / Sanatçı Gideri</div>
              <div className="text-sm font-bold font-mono-num text-rose-800">
                {formatTL(specializedSummary.totalProgramExpensesTL)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <div className="text-[11px] text-emerald-800">Birleşik Net Etki & Burs Fonu</div>
              <div className="text-sm font-bold font-mono-num text-[#0C3C7C]">
                {formatTL(specializedSummary.combinedNetImpactFundTL)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* KERMES */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono-num font-bold text-[#0C3C7C]">KERMES</span>
                <span className="text-[11px] font-semibold text-slate-600">Galata Rum Okulu</span>
              </div>
              <h3 className="font-serif-display text-lg font-bold text-slate-900">
                Galata Bahar Kermesi & Tasarım Pazarı
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Stant Doluluğu:</span>
                <span className="font-mono-num font-bold text-slate-900">
                  {activeSpecializedModules.kermes.allocatedStalls}/{activeSpecializedModules.kermes.totalStalls} Stant (%{specializedSummary.kermesFillPercent})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Brüt Stant / Lojistik Gideri:</span>
                <span className="font-mono-num font-semibold text-slate-700">
                  {formatTL(activeSpecializedModules.kermes.expectedStallRevenueTL)} / -{formatTL(activeSpecializedModules.kermes.operatingExpenseTL ?? 35000)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-100">
                <span className="text-slate-500">Net Kulüp Hizmet Fonu:</span>
                <span className="font-mono-num font-bold text-emerald-700">
                  {formatTL(specializedSummary.kermesNetSurplusTL)}
                </span>
              </div>
            </div>
          </div>

          {/* GALATART */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono-num font-bold text-[#0C3C7C]">GALATART</span>
                <span className="text-[11px] font-semibold text-slate-600">Tophane-i Amire</span>
              </div>
              <h3 className="font-serif-display text-lg font-bold text-slate-900">
                GALATART Çağdaş Sanat Sergisi & Müzayede
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Koleksiyoner Devri:</span>
                <span className="font-mono-num font-bold text-slate-900">
                  {activeSpecializedModules.galatart.soldArtworksCount}/{activeSpecializedModules.galatart.curatedArtworksCount} Eser
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Brüt Satış / Sanatçı Payı:</span>
                <span className="font-mono-num font-semibold text-slate-700">
                  {formatTL(activeSpecializedModules.galatart.grossArtworkSalesTL)} / -{formatTL(activeSpecializedModules.galatart.artistPayoutTL)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-100">
                <span className="text-slate-500">Net Burs Fonu (%{activeSpecializedModules.galatart.clubCommissionPercent}):</span>
                <span className="font-mono-num font-bold text-emerald-700">
                  {formatTL(specializedSummary.galatartNetCommissionTL)}
                </span>
              </div>
            </div>
          </div>

          {/* RYLA */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono-num font-bold text-[#0C3C7C]">RYLA</span>
                <span className="text-[11px] font-semibold text-slate-600">UR 2420. Bölge</span>
              </div>
              <h3 className="font-serif-display text-lg font-bold text-slate-900">
                Gençlik Liderlik Akademisi & Kampı
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Onaylanan Bursiyer:</span>
                <span className="font-mono-num font-bold text-slate-900">
                  {activeSpecializedModules.ryla.approvedScholars}/{activeSpecializedModules.ryla.totalQuota} Lider (%{specializedSummary.rylaFillPercent})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sponsorlu / Kamp Gideri:</span>
                <span className="font-mono-num font-semibold text-slate-700">
                  {formatTL(activeSpecializedModules.ryla.grossSponsorContributionsTL)} / -{formatTL(specializedSummary.rylaProgramExpenseBudgetTL)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-100">
                <span className="text-slate-500">Net Yeni Liderlik İhtiyatı:</span>
                <span className="font-mono-num font-bold text-emerald-700">
                  {formatTL(specializedSummary.rylaNetReserveTL)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Period Photo Archive Gallery */}
      <section
        aria-labelledby="photo-archive-heading"
        className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0C3C7C]">
              <Camera className="w-4 h-4" />
              <span>Galata Görsel Bellek</span>
            </div>
            <h2
              id="photo-archive-heading"
              className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5"
            >
              Yüksek Çözünürlüklü Dönem Fotoğraf Arşivi
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Detaylı incelemek için esere tıklayın
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {galleryPhotos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setSelectedPhoto(photo)}
              className="group text-left rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 hover:border-[#0C3C7C] transition-all flex flex-col justify-between cursor-pointer"
            >
              <div className="w-full">
                <ProjectVisualArtwork
                  theme={photo.visualTheme}
                  category={photo.date}
                />
              </div>
              <div className="p-3.5 space-y-1">
                <div className="text-xs font-bold text-slate-900 group-hover:text-[#0C3C7C] transition-colors">
                  {photo.title}
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2">
                  {photo.caption}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Support / Ticket Purchase Modal */}
      {selectedProject && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-project-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Proje Fonu & Davetiye Katkısı
                </div>
                <h3
                  id="support-project-modal-title"
                  className="font-serif-display text-xl font-bold text-slate-900"
                >
                  {selectedProject.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                className="min-h-[36px] px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handleConfirmSupport} className="space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  Katkı veya Davetiye Paketi Seçin
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSupportTier('ticket');
                      setCustomAmount(selectedProject.ticketPrice);
                    }}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between cursor-pointer ${
                      supportTier === 'ticket'
                        ? 'bg-[#0C3C7C] text-white border-[#0C3C7C]'
                        : 'bg-slate-50 text-slate-900 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">
                        1 Adet Protokol Davetiyesi & Burs Katkısı
                      </div>
                      <div
                        className={`text-[11px] ${
                          supportTier === 'ticket' ? 'text-slate-200' : 'text-slate-500'
                        }`}
                      >
                        Dijital QR davetiye anında tanımlanır
                      </div>
                    </div>
                    <span className="font-mono-num text-sm font-bold">
                      {formatTL(selectedProject.ticketPrice)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSupportTier('double_ticket');
                      setCustomAmount(selectedProject.ticketPrice * 2);
                    }}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between cursor-pointer ${
                      supportTier === 'double_ticket'
                        ? 'bg-[#0C3C7C] text-white border-[#0C3C7C]'
                        : 'bg-slate-50 text-slate-900 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">
                        Eşli Protokol Davetiyesi (2 Kişilik)
                      </div>
                      <div
                        className={`text-[11px] ${
                          supportTier === 'double_ticket' ? 'text-slate-200' : 'text-slate-500'
                        }`}
                      >
                        Ön sıra masa rezervasyonu dahildir
                      </div>
                    </div>
                    <span className="font-mono-num text-sm font-bold">
                      {formatTL(selectedProject.ticketPrice * 2)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSupportTier('patron');
                      setCustomAmount(selectedProject.ticketPrice * 5);
                    }}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between cursor-pointer ${
                      supportTier === 'patron'
                        ? 'bg-[#0C3C7C] text-white border-[#0C3C7C]'
                        : 'bg-slate-50 text-slate-900 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">
                        Proje Hamisi / Kurumsal Plaket Sponsorluğu
                      </div>
                      <div
                        className={`text-[11px] ${
                          supportTier === 'patron' ? 'text-slate-200' : 'text-slate-500'
                        }`}
                      >
                        Katalogda ve kürsüde teşekkür plaketi takdimi
                      </div>
                    </div>
                    <span className="font-mono-num text-sm font-bold">
                      {formatTL(selectedProject.ticketPrice * 5)}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedProject(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#F7A81B] text-[#0F172A] text-xs font-semibold hover:bg-[#f9b53b] cursor-pointer"
                >
                  {formatTL(customAmount)} Katkıyı Onayla & Termometreyi Güncelle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Project Creation Modal (President / Secretary) */}
      {isNewProjectModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-project-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#0C3C7C]">
                  Hizmet Projeleri Komitesi · Yeni Dönem Projesi
                </div>
                <h3
                  id="new-project-modal-title"
                  className="font-serif-display text-xl font-bold text-slate-900"
                >
                  Yeni Galata Rotary Hizmet Projesi Başlat
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewProjectModalOpen(false)}
                className="min-h-[36px] px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handleCreateNewProjectSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="new-prj-title"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Proje Başlığı
                </label>
                <input
                  id="new-prj-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-prj-category"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Hizmet Alanı / Kategori
                  </label>
                  <select
                    id="new-prj-category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as GalataProject['category'])}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  >
                    <option value="Toplum Hizmetleri">Toplum Hizmetleri</option>
                    <option value="Kültür & Sanat">Kültür & Sanat</option>
                    <option value="Gençlik & Liderlik">Gençlik & Liderlik</option>
                    <option value="Sağlık & Eğitim">Sağlık & Eğitim</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="new-prj-chair"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Proje Komite Başkanı
                  </label>
                  <input
                    id="new-prj-chair"
                    type="text"
                    value={newCommitteeChair}
                    onChange={(e) => setNewCommitteeChair(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-prj-date"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Planlanan Tarih
                  </label>
                  <input
                    id="new-prj-date"
                    type="text"
                    value={newDateLabel}
                    onChange={(e) => setNewDateLabel(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-prj-venue"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Mekan / Uygulama Sahası
                  </label>
                  <input
                    id="new-prj-venue"
                    type="text"
                    value={newVenue}
                    onChange={(e) => setNewVenue(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="new-prj-budget"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Hedef Bütçe (TL)
                  </label>
                  <input
                    id="new-prj-budget"
                    type="number"
                    min={10000}
                    step={5000}
                    value={newTargetBudget}
                    onChange={(e) => setNewTargetBudget(Number(e.target.value))}
                    className="w-full text-sm font-mono-num bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-prj-ticket"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Davetiye / Birim Katkı (TL)
                  </label>
                  <input
                    id="new-prj-ticket"
                    type="number"
                    min={500}
                    step={500}
                    value={newTicketPrice}
                    onChange={(e) => setNewTicketPrice(Number(e.target.value))}
                    className="w-full text-sm font-mono-num bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-prj-theme"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Görsel Tema
                  </label>
                  <select
                    id="new-prj-theme"
                    value={newVisualTheme}
                    onChange={(e) =>
                      setNewVisualTheme(e.target.value as GalataProject['visualTheme'])
                    }
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  >
                    <option value="school">Toplum & Eğitim Sahası</option>
                    <option value="galatart">Galata Çağdaş Sanat Sergisi</option>
                    <option value="concert">Senfonik & Caz Konseri</option>
                    <option value="ryla">RYLA & Akademi Kampı</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-prj-desc"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Proje Kapsamı ve Toplumsal Etki Özeti
                </label>
                <textarea
                  id="new-prj-desc"
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold hover:bg-[#17458F] cursor-pointer"
                >
                  Projeyi Yayınla & Bağış Termometresini Aç
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lightbox-photo-title"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full overflow-hidden shadow-2xl">
            <ProjectVisualArtwork
              theme={selectedPhoto.visualTheme}
              category={selectedPhoto.date}
            />
            <div className="p-6 space-y-3">
              <div className="text-xs text-[#0C3C7C] font-semibold">
                {selectedPhoto.photographer} · {selectedPhoto.date}
              </div>
              <h3
                id="lightbox-photo-title"
                className="font-serif-display text-2xl font-bold text-slate-900"
              >
                {selectedPhoto.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {selectedPhoto.caption}
              </p>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0C3C7C] text-white text-xs font-semibold cursor-pointer"
                >
                  Arşiv Görünümünü Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
