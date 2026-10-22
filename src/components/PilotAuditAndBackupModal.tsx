import React, { useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  Lock,
  Plus,
  Scale,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  AuditLogEntry,
  BoardResolutionItem,
  ClubRole,
} from '../types/rotary';

interface PilotAuditAndBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRole: ClubRole;
  auditLogs: AuditLogEntry[];
  boardResolutions: BoardResolutionItem[];
  onAddBoardResolution: (
    resolution: Omit<BoardResolutionItem, 'id' | 'signedBy'>
  ) => void;
  kvkkMaskPhone: boolean;
  onToggleKvkkMaskPhone: () => void;
  serverSyncedAt: string | null;
  onDownloadBackup: () => void;
}

const ROLE_BADGE_LABELS: Record<ClubRole, string> = {
  uye: 'Üye',
  sekreter: 'Genel Sekreter',
  sayman: 'Kulüp Saymanı',
  baskan: 'Dönem Başkanı',
};

export const PilotAuditAndBackupModal: React.FC<PilotAuditAndBackupModalProps> = ({
  isOpen,
  onClose,
  activeRole,
  auditLogs,
  boardResolutions,
  onAddBoardResolution,
  kvkkMaskPhone,
  onToggleKvkkMaskPhone,
  serverSyncedAt,
  onDownloadBackup,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'audit' | 'board_resolutions' | 'kvkk'
  >('audit');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>('Tümü');

  // New Board Resolution Form State (Epic #7)
  const [resNo, setResNo] = useState(`YK-2026/${17 + boardResolutions.length - 3}`);
  const [resDate, setResDate] = useState('22 Ekim 2026');
  const [resTitle, setResTitle] = useState(
    'Karaköy & Maçka Rotary Kulüpleri ile Ortak Boğaziçi Deniz Temizliği Protokolü'
  );
  const [resSummary, setResSummary] = useState(
    'UR 2420. Bölge çevre fonu kapsamında Karaköy ve Maçka Rotary kulüpleriyle ortak saha çalışması yapılmasına ve bütçe payının onaylanmasına karar verildi.'
  );
  const [resVoteStatus, setResVoteStatus] =
    useState<BoardResolutionItem['voteStatus']>('Oybirliği ile Kabul');

  if (!isOpen) return null;

  const isBoardLeader = activeRole === 'baskan' || activeRole === 'sekreter';

  const filteredLogs =
    selectedModuleFilter === 'Tümü'
      ? auditLogs
      : auditLogs.filter((log) => log.module === selectedModuleFilter);

  const handleCreateResolutionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resTitle.trim() || !resSummary.trim()) return;
    onAddBoardResolution({
      resolutionNo: resNo.trim() || `YK-2026/${17 + boardResolutions.length}`,
      date: resDate.trim() || '22 Ekim 2026',
      title: resTitle.trim(),
      summary: resSummary.trim(),
      voteStatus: resVoteStatus,
    });
    setResNo(`YK-2026/${18 + boardResolutions.length - 3}`);
    setResTitle('');
    setResSummary('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pilot-audit-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl border border-slate-200 max-w-4xl w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0C3C7C]">
              <Server className="w-4 h-4 text-[#F7A81B]" />
              <span>
                Galata Rotary Pilot Altyapısı · Kalıcı Sunucu Veritabanı, YK Karar Defteri & KVKK
              </span>
            </div>
            <h2
              id="pilot-audit-modal-title"
              className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5"
            >
              Kurumsal Yönetim, Sunucu RBAC Denetim İzi & Yedekleme
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Kapat</span>
          </button>
        </div>

        {/* Pilot Architecture Status Cards (#13, #14, #18, #19, #22, #23) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <div className="p-3.5 rounded-2xl bg-[#0F172A] text-white space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[#F7A81B] font-semibold">
              <span>Ortak Sunucu Veritabanı</span>
              <Database className="w-3.5 h-3.5" />
            </div>
            <div className="text-sm font-bold">Express API + JSON Kalıcı Depo</div>
            <div className="text-[11px] text-slate-300 font-mono-num">
              Son Senkronizasyon:{' '}
              {serverSyncedAt
                ? new Date(serverSyncedAt).toLocaleTimeString('tr-TR')
                : 'Canlı Bağlı'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[#0C3C7C] font-semibold">
              <span>Sunucu Rol Doğrulaması (RBAC)</span>
              <Lock className="w-3.5 h-3.5 text-[#0C3C7C]" />
            </div>
            <div className="text-sm font-bold text-slate-900">
              Aktif Oturum: {ROLE_BADGE_LABELS[activeRole]}
            </div>
            <div className="text-[11px] text-slate-600">
              Sekreter/Sayman/Başkan işlemleri sunucuda doğrulanır
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col justify-between gap-2">
            <div>
              <div className="flex items-center justify-between text-[11px] text-emerald-900 font-semibold">
                <span>Veritabanı & Denetim Yedeği</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              </div>
              <div className="text-xs text-emerald-800 mt-0.5">
                Tüm kulüp verilerini ve {auditLogs.length} denetim kaydını indir
              </div>
            </div>
            <button
              type="button"
              onClick={onDownloadBackup}
              className="w-full min-h-[36px] px-3 py-1.5 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#F7A81B]" />
              <span>Tam Yedeği İndir (.JSON)</span>
            </button>
          </div>
        </div>

        {/* 3 Sub-Tabs: Denetim Geçmişi | YK Karar Defteri (#7) | KVKK & Veri Güvenliği (#2) */}
        <div
          role="tablist"
          aria-label="Denetim, YK Karar Defteri ve KVKK Alt Sekmeleri"
          className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl shrink-0 overflow-x-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'audit'}
            onClick={() => setActiveSubTab('audit')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeSubTab === 'audit'
                ? 'bg-white text-[#0C3C7C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Denetim Geçmişi ({auditLogs.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'board_resolutions'}
            onClick={() => setActiveSubTab('board_resolutions')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeSubTab === 'board_resolutions'
                ? 'bg-white text-[#0C3C7C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Yönetim Kurulu Karar Defteri ({boardResolutions.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'kvkk'}
            onClick={() => setActiveSubTab('kvkk')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeSubTab === 'kvkk'
                ? 'bg-white text-[#0C3C7C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            KVKK & Veri Gizliliği Kontrolü
          </button>
        </div>

        {/* SUB-TAB 1: AUDIT TRAIL (#18) */}
        {activeSubTab === 'audit' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {[
                  'Tümü',
                  'LCV & Kuver',
                  'QR Yoklama & Make-up',
                  'Saymanlık & Kasa',
                  'Yönetim & Güvenlik',
                ].map((mod) => (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => setSelectedModuleFilter(mod)}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedModuleFilter === mod
                        ? 'bg-[#0C3C7C] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {mod}
                  </button>
                ))}
              </div>

              <span className="text-xs font-mono-num text-slate-500">
                Toplam {filteredLogs.length} Sunucu Onaylı İşlem Kaydı
              </span>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 bg-white hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[#0C3C7C]">{log.module}</span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-semibold text-slate-900">{log.action}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{log.detail}</p>
                    <div className="text-[11px] text-slate-500">
                      İşlemi Yapan:{' '}
                      <strong className="text-slate-800">{log.actorName}</strong>
                    </div>
                  </div>

                  <div className="sm:text-right shrink-0 space-y-1">
                    <div className="font-mono-num text-[11px] text-slate-500">
                      {log.timestamp}
                    </div>
                    {log.verifiedByServer && (
                      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Sunucu RBAC Onaylı</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* SUB-TAB 2: YÖNETİM KURULU KARAR DEFTERİ (Epic #7) */}
        {activeSubTab === 'board_resolutions' && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {isBoardLeader && (
              <form
                onSubmit={handleCreateResolutionSubmit}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="text-xs font-bold text-[#0C3C7C] flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[#F7A81B]" />
                  <span>Yeni Yönetim Kurulu Kararı Kaydet (Başkan / Sekreter Yetkisi)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={resNo}
                    onChange={(e) => setResNo(e.target.value)}
                    placeholder="Karar No (Örn: YK-2026/17)"
                    className="text-xs font-mono-num bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                  <input
                    type="text"
                    value={resDate}
                    onChange={(e) => setResDate(e.target.value)}
                    placeholder="Karar Tarihi"
                    className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  />
                  <select
                    value={resVoteStatus}
                    onChange={(e) =>
                      setResVoteStatus(
                        e.target.value as BoardResolutionItem['voteStatus']
                      )
                    }
                    className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  >
                    <option value="Oybirliği ile Kabul">Oybirliği ile Kabul</option>
                    <option value="Oyçokluğu ile Kabul">Oyçokluğu ile Kabul</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  placeholder="Yönetim Kurulu Karar Başlığı..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
                <textarea
                  rows={2}
                  value={resSummary}
                  onChange={(e) => setResSummary(e.target.value)}
                  placeholder="Karar metni ve uygulama detayları..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="min-h-[36px] px-4 py-1.5 rounded-xl bg-[#0C3C7C] hover:bg-[#17458F] text-white text-xs font-semibold cursor-pointer"
                  >
                    YK Karar Defterine İşle & Sunucuya Kaydet
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
              {boardResolutions.map((res) => (
                <div key={res.id} className="p-4 bg-white space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num font-bold text-[#0C3C7C]">
                        {res.resolutionNo}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-slate-500">{res.date}</span>
                    </div>
                    <span className="font-semibold text-emerald-700 flex items-center gap-1">
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>{res.voteStatus}</span>
                    </span>
                  </div>
                  <h3 className="font-serif-display text-lg font-bold text-slate-900">
                    {res.title}
                  </h3>
                  <p className="text-slate-600 leading-relaxed">{res.summary}</p>
                  <div className="text-[11px] text-slate-500 pt-1">
                    İmzalayanlar: <strong className="text-slate-800">{res.signedBy}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUB-TAB 3: KVKK & VERİ GİZLİLİĞİ KONTROLÜ (Epic #2, #12, #15) */}
        {activeSubTab === 'kvkk' && (
          <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Scale className="w-4 h-4 text-[#0C3C7C]" />
                <span>6698 Sayılı KVKK Aydınlatma ve Kulüp İçi Veri Güvenliği Politikası</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Galata Rotary Kulübü Derneği bünyesinde işlenen üye iletişim, meslek sınıflandırması, eş/mutlu gün ve cari aidat bilgileri; yalnızca kulüp tüzüğü kapsamındaki toplantı kuver planlaması, UR 2420. Bölge raporlaması ve kulüp içi dostluk iletişimi amacıyla RBAC korumalı sunucuda saklanır.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
                <div>
                  <div className="font-bold text-slate-900">
                    Üye Rehberinde GSM Numarası Maskeleme (KVKK Gizlilik Modu)
                  </div>
                  <div className="text-slate-500">
                    Aktif edildiğinde Üye Rehberi kartlarında telefon numaralarının orta haneleri maskelenir (`+90 532 *** ** 20`).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleKvkkMaskPhone}
                  aria-pressed={kvkkMaskPhone}
                  className={`min-h-[38px] px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer ${
                    kvkkMaskPhone
                      ? 'bg-emerald-700 text-white'
                      : 'bg-[#0C3C7C] text-white hover:bg-[#17458F]'
                  }`}
                >
                  {kvkkMaskPhone
                    ? 'KVKK Telefon Maskeleme: Aktif'
                    : 'KVKK Telefon Maskelemeyi Etkinleştir'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
