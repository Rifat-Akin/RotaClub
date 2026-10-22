import React from 'react';
import { Award, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { ClubRole, TermBoardInfo } from '../types/rotary';
import { RotaryWheelIcon } from './RotaryArtwork';

interface HeaderAndRoleBarProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  attendancePercent: number;
  termInfo: TermBoardInfo;
  onOpenWalletModal: () => void;
}

const ROLE_OPTIONS: {
  id: ClubRole;
  label: string;
  shortLabel: string;
  holderName: string;
}[] = [
  {
    id: 'uye',
    label: 'Üye: Rifat Akın',
    shortLabel: 'Üye: Rifat Akın',
    holderName: 'Rtn. Rifat Akın',
  },
  {
    id: 'sekreter',
    label: 'Genel Sekreter',
    shortLabel: 'Genel Sekreter',
    holderName: 'Rtn. Av. Nazlı Denizmen',
  },
  {
    id: 'sayman',
    label: 'Sayman',
    shortLabel: 'Sayman',
    holderName: 'Rtn. YMM Levent Soydan',
  },
  {
    id: 'baskan',
    label: 'Başkan',
    shortLabel: 'Başkan',
    holderName: 'Rtn. Mimar Emre Karaca',
  },
];

export const HeaderAndRoleBar: React.FC<HeaderAndRoleBarProps> = ({
  activeRole,
  onSelectRole,
  attendancePercent,
  termInfo,
  onOpenWalletModal,
}) => {
  return (
    <header className="bg-gradient-to-r from-[#091E42] via-[#0C3C7C] to-[#17458F] text-white border-b border-white/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        {/* Top Row: Club Identity + Term Metadata + Attendance & Digital ID Action */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-[#F7A81B]/40 flex items-center justify-center text-[#F7A81B] shrink-0">
              <RotaryWheelIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-serif-display text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
                  Galata Rotary Kulübü
                </span>
              </div>
              <p className="text-xs text-slate-200/90 truncate">
                <span>{termInfo.termLabel}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>{termInfo.district}</span>
                <span className="hidden sm:inline mx-1.5" aria-hidden="true">·</span>
                <span className="hidden sm:inline text-[#F7A81B]">
                  Başkan: {termInfo.president}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div
              className="text-right"
              aria-label={`Devamlılık Oranı Yüzde ${attendancePercent}`}
            >
              <div className="text-[11px] text-slate-300">Devamlılık Oranı</div>
              <div className="text-sm font-semibold font-mono-num text-[#F7A81B]">
                %{attendancePercent} Katılım
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenWalletModal}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#F7A81B] text-[#0F172A] font-semibold text-xs hover:bg-[#f9b53b] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
            >
              <Award className="w-4 h-4 shrink-0" />
              <span>Rotary Kimliğim</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Instant Role Simulator Bar */}
        <div className="mt-3 pt-2.5 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-200">
            <ShieldCheck className="w-4 h-4 text-[#F7A81B] shrink-0" />
            <span className="font-medium">Rol Simülatörü:</span>
            <span className="text-slate-300 hidden md:inline">
              Yönetim yetkilerini test etmek için rol seçin
            </span>
          </div>

          <div
            role="group"
            aria-label="Rol Seçici"
            className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 bg-[#09152B]/60 p-1 rounded-xl border border-white/10"
          >
            {ROLE_OPTIONS.map((roleOption) => {
              const isSelected = activeRole === roleOption.id;
              return (
                <button
                  key={roleOption.id}
                  type="button"
                  onClick={() => onSelectRole(roleOption.id)}
                  aria-pressed={isSelected}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#F7A81B] text-[#0F172A] shadow-sm'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {isSelected && <UserCheck className="w-3.5 h-3.5 shrink-0" />}
                  <span>{roleOption.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
};
