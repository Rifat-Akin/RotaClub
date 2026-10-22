import React, { useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Lock,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AuditLogEntry, ClubRole } from '../types/rotary';

interface PilotAuditAndBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRole: ClubRole;
  auditLogs: AuditLogEntry[];
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
  serverSyncedAt,
  onDownloadBackup,
}) => {
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>('Tümü');

  if (!isOpen) return null;

  const filteredLogs =
    selectedModuleFilter === 'Tümü'
      ? auditLogs
      : auditLogs.filter((log) => log.module === selectedModuleFilter);

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
                Galata Rotary Pilot Altyapısı · Kalıcı Sunucu Veritabanı & RBAC Denetim Merkezi
              </span>
            </div>
            <h2
              id="pilot-audit-modal-title"
              className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5"
            >
              Sunucu Yetkilendirme (RBAC), Denetim Geçmişi & Yedekleme
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

        {/* Filter Bar for Audit Trail */}
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
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
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

        {/* Scrollable Audit Log Table (#18) */}
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
                  İşlemi Yapan: <strong className="text-slate-800">{log.actorName}</strong>
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
      </div>
    </div>
  );
};
