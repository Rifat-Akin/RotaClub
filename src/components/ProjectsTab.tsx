import React, { useState } from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  HeartHandshake,
  MapPin,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react';
import { GalataProject, GalleryArchivePhoto } from '../types/rotary';
import { calculateProjectProgress, formatTL } from '../utils/rotaryLogic';
import { ProjectVisualArtwork } from './RotaryArtwork';

interface ProjectsTabProps {
  projects: GalataProject[];
  galleryPhotos: GalleryArchivePhoto[];
  onSupportProject: (projectId: string, amount: number, supportType: string) => void;
}

export const ProjectsTab: React.FC<ProjectsTabProps> = ({
  projects,
  galleryPhotos,
  onSupportProject,
}) => {
  const [selectedProject, setSelectedProject] = useState<GalataProject | null>(null);
  const [supportTier, setSupportTier] = useState<'ticket' | 'double_ticket' | 'patron'>('ticket');
  const [customAmount, setCustomAmount] = useState<number>(5000);
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryArchivePhoto | null>(null);

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

        <div className="sm:text-right shrink-0">
          <div className="text-xs text-slate-500">Toplam Dönem Proje Fonu</div>
          <div className="text-2xl font-bold font-mono-num text-[#0C3C7C]">
            {formatTL(projects.reduce((acc, p) => acc + p.collectedAmount, 0))}
          </div>
        </div>
      </div>

      {/* 4 Core Galata Projects Grid */}
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
                </div>
              </div>

              {/* Live Budget / Donation Thermometer & CTA */}
              <div className="p-5 sm:p-6 pt-0 space-y-4">
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

                <button
                  type="button"
                  onClick={() => openSupportModal(project)}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Ticket className="w-4 h-4 text-[#F7A81B]" />
                  <span>
                    Projeye Destek Ol / Davetiye Al ({formatTL(project.ticketPrice)})
                  </span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

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
