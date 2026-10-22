import React, { useState } from 'react';
import {
  Award,
  Building2,
  Check,
  ChevronDown,
  Lock,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { ClubRole, TenantClubOption, TermBoardInfo } from '../types/rotary';
import { ROTA_CLUB_TENANTS } from '../data/mockGalataData';
import { RotaryWheelIcon } from './RotaryArtwork';

interface HeaderAndRoleBarProps {
  activeRole: ClubRole;
  onSelectRole: (role: ClubRole) => void;
  attendancePercent: number;
  termInfo: TermBoardInfo;
  onOpenWalletModal: () => void;
  onOpenSplashModal: () => void;
  onResetDemoData: () => void;
  onSelectTenantClub: (tenant: TenantClubOption) => void;
}

const ROLE_OPTIONS: {
  id: ClubRole;
  label: string;
}[] = [
  { id: 'uye', label: 'Üye: Rifat Akın' },
  { id: 'sekreter', label: 'Genel Sekreter' },
  { id: 'sayman', label: 'Sayman' },
  { id: 'baskan', label: 'Başkan' },
];

export const HeaderAndRoleBar: React.FC<HeaderAndRoleBarProps> = ({
  activeRole,
  onSelectRole,
  attendancePercent,
  termInfo,
  onOpenWalletModal,
  onOpenSplashModal,
  onResetDemoData,
  onSelectTenantClub,
}) => {
  const [isClubMenuOpen, setIsClubMenuOpen] = useState(false);

  return (
    <header className="bg-gradient-to-r from-[#091E42] via-[#0C3C7C] to-[#17458F] text-white border-b border-white/10 shadow-sm relative z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        {/* Top Row: RotaClub Brand + Multi-Tenant Club Switcher + Splash Screen & Digital ID */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-[#F7A81B]/40 flex items-center justify-center text-[#F7A81B] shrink-0">
              <RotaryWheelIcon className="w-6 h-6" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-serif-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  RotaClub
                </span>
                <span className="text-xs text-[#F7A81B] font-mono-num font-semibold">
                  v2.0
                </span>
              </div>

              {/* Clickable Active Club Switcher Trigger */}
              <button
                type="button"
                onClick={() => setIsClubMenuOpen((prev) => !prev)}
                aria-expanded={isClubMenuOpen}
                aria-label="RotaClub Kulüp Değiştirici Menüsünü Aç"
                className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-200 hover:text-[#F7A81B] transition-colors cursor-pointer group"
              >
                <span className="font-semibold text-white group-hover:text-[#F7A81B]">
                  Galata Rotary Kulübü · {termInfo.district}
                </span>
                <span className="hidden md:inline text-slate-300">
                  ({termInfo.termLabel})
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#F7A81B] shrink-0" />
              </button>
            </div>

            {/* Multi-Tenant Club Switcher Popover Menu */}
            {isClubMenuOpen && (
              <div
                role="menu"
                aria-label="RotaClub Kulüp Değiştirici (Bölge Demosu)"
                className="absolute left-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-[#0F172A] text-white border border-white/15 shadow-2xl p-3 space-y-2 z-50"
              >
                <div className="flex items-center justify-between px-2 py-1 border-b border-white/10">
                  <span className="text-xs font-bold text-[#F7A81B]">
                    RotaClub Kulüp Değiştirici (Bölge Demosu)
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsClubMenuOpen(false)}
                    className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>

                <div className="space-y-1">
                  {ROTA_CLUB_TENANTS.map((tenant) => {
                    const isActive = tenant.id === 'club-galata';
                    return (
                      <button
                        key={tenant.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onSelectTenantClub(tenant);
                          setIsClubMenuOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#0C3C7C] text-white border border-[#F7A81B]/40'
                            : 'hover:bg-white/10 text-slate-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-[#F7A81B] shrink-0" />
                            <span className="truncate">{tenant.name}</span>
                          </div>
                          <div className="text-[11px] text-slate-300 mt-0.5 truncate">
                            {tenant.district} · {tenant.meetingDay}
                          </div>
                        </div>
                        <span className="text-[11px] font-mono-num text-[#F7A81B] shrink-0">
                          {isActive ? 'Seçili' : tenant.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Controls: Attendance + Splash Screen Button + Digital Wallet ID Button */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div
              className="text-right mr-1"
              aria-label={`Devamlılık Oranı Yüzde ${attendancePercent}`}
            >
              <div className="text-[11px] text-slate-300">Devamlılık Oranı</div>
              <div className="text-sm font-semibold font-mono-num text-[#F7A81B]">
                %{attendancePercent} Katılım
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenSplashModal}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[#F7A81B] shrink-0" />
              <span className="hidden sm:inline">Giriş / Kilit Ekranı</span>
              <span className="sm:hidden">Kilit Ekranı</span>
            </button>

            <button
              type="button"
              onClick={onOpenWalletModal}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#F7A81B] text-[#0F172A] font-semibold text-xs hover:bg-[#f9b53b] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Award className="w-4 h-4 shrink-0" />
              <span>Rotary Kimliğim</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Instant Role Simulator Bar + Demo Reset Action */}
        <div className="mt-3 pt-2.5 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-200">
            <ShieldCheck className="w-4 h-4 text-[#F7A81B] shrink-0" />
            <span className="font-medium">Rol Simülatörü:</span>
            <span className="text-slate-300 hidden md:inline">
              Yetkili ekranları test etmek için rol seçin
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Rol Seçici"
              className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 bg-[#09152B]/60 p-1 rounded-xl border border-white/10 flex-1 sm:flex-initial"
            >
              {ROLE_OPTIONS.map((roleOption) => {
                const isSelected = activeRole === roleOption.id;
                return (
                  <button
                    key={roleOption.id}
                    type="button"
                    onClick={() => onSelectRole(roleOption.id)}
                    aria-pressed={isSelected}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#F7A81B] text-[#0F172A] shadow-xs'
                        : 'text-slate-200 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {isSelected && <UserCheck className="w-3.5 h-3.5 shrink-0" />}
                    <span>{roleOption.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onResetDemoData}
              title="Sunum öncesi tüm demo verilerini ilk haline sıfırla"
              aria-label="Demoyu Sıfırla"
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#F7A81B]" />
              <span>Demoyu Sıfırla</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
