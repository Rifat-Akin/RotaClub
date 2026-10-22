import React, { useState } from 'react';
import {
  Award,
  Bell,
  Building2,
  Calendar,
  CheckCheck,
  ChevronDown,
  Database,
  Flame,
  Gift,
  Lock,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  Wallet,
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
  onOpenAuditModal: () => void;
  auditCount: number;
  activeTenantClubName?: string;
}

interface ClubNotificationItem {
  id: string;
  category: 'Toplantı & LCV' | 'Mutlu Günler' | 'Saymanlık & Ocakbaşı';
  title: string;
  detail: string;
  timeLabel: string;
  unread: boolean;
}

const INITIAL_NOTIFICATIONS: ClubNotificationItem[] = [
  {
    id: 'notif-lcv',
    category: 'Toplantı & LCV',
    title: '1842. Toplantı LCV & Kuver Hatırlatması',
    detail:
      '27 Ekim Salı 19:30 Pera Palace Hotel (Prof. Dr. Çiğdem Kafescioğlu) toplantısı için mutfak kuver bildirim süresi yarın 14:00’te kapanıyor.',
    timeLabel: '15 dk önce',
    unread: true,
  },
  {
    id: 'notif-celebrations',
    category: 'Mutlu Günler',
    title: 'Bu Hafta Doğum Günü & Evlilik Yıldönümü Olan Üyeler',
    detail:
      'Rtn. Defne Serezli (Doğum Günü · 28 Ekim), GDB. Dr. Sinan Vardar & Eşi Elif Vardar (18. Evlilik Yıldönümü · 29 Ekim) ve Rtn. Rifat Akın (7. Kulüp Yılı · 30 Ekim).',
    timeLabel: '1 saat önce',
    unread: true,
  },
  {
    id: 'notif-ops-finance',
    category: 'Saymanlık & Ocakbaşı',
    title: 'Bekleyen Saymanlık Dekontları & Ocakbaşı Raporu',
    detail:
      'Sayman onayında bekleyen 2 yeni FAST dekontu (Rtn. Kerem Soylu & Rtn. Defne Serezli) ve 3. Grup Bebek Ocakbaşı toplantı tutanağı bekleniyor.',
    timeLabel: 'Bugün · 09:40',
    unread: true,
  },
];

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
  onOpenAuditModal,
  auditCount,
  activeTenantClubName = 'Galata Rotary Kulübü',
}) => {
  const [isClubMenuOpen, setIsClubMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<ClubNotificationItem[]>(
    INITIAL_NOTIFICATIONS
  );

  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleMarkSingleAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n))
    );
  };

  const renderCategoryIcon = (category: ClubNotificationItem['category']) => {
    if (category === 'Toplantı & LCV') {
      return <Calendar className="w-4 h-4 text-[#F7A81B] shrink-0" />;
    }
    if (category === 'Mutlu Günler') {
      return <Gift className="w-4 h-4 text-rose-400 shrink-0" />;
    }
    return <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />;
  };

  return (
    <header className="bg-gradient-to-r from-[#091E42] via-[#0C3C7C] to-[#17458F] text-white border-b border-white/10 shadow-sm relative z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        {/* Top Row: RotaClub Brand + Multi-Tenant Club Switcher + Notification Center + Splash Screen & Digital ID */}
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
                  v3.0
                </span>
              </div>

              {/* Clickable Active Club Switcher Trigger */}
              <button
                type="button"
                onClick={() => {
                  setIsClubMenuOpen((prev) => !prev);
                  setIsNotifOpen(false);
                }}
                aria-expanded={isClubMenuOpen}
                aria-label="RotaClub Kulüp Değiştirici Menüsünü Aç"
                className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-200 hover:text-[#F7A81B] transition-colors cursor-pointer group"
              >
                <span className="font-semibold text-white group-hover:text-[#F7A81B]">
                  {activeTenantClubName} · {termInfo.district}
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
                    const isActive = tenant.name === activeTenantClubName;
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

          {/* Right Controls: Attendance + Notification Center Bell + Splash Screen Button + Digital Wallet ID Button */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 relative">
            <div
              className="text-right mr-1 hidden sm:block"
              aria-label={`Devamlılık Oranı Yüzde ${attendancePercent}`}
            >
              <div className="text-[11px] text-slate-300">Devamlılık Oranı</div>
              <div className="text-sm font-semibold font-mono-num text-[#F7A81B]">
                %{attendancePercent} Katılım
              </div>
            </div>

            {/* Notification Center Trigger Button (Bell Icon) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsNotifOpen((prev) => !prev);
                  setIsClubMenuOpen(false);
                }}
                aria-expanded={isNotifOpen}
                aria-label={`Bildirim Merkezi (${unreadCount} okunmamış bildirim)`}
                className="relative min-h-[42px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Bell className="w-4 h-4 text-[#F7A81B] shrink-0" />
                <span className="hidden md:inline">Bildirimler</span>
                {unreadCount > 0 && (
                  <span
                    aria-label={`${unreadCount} okunmamış`}
                    className="min-w-[18px] h-[18px] px-1 rounded-md bg-[#F7A81B] text-[#0F172A] font-mono-num text-[11px] font-bold flex items-center justify-center"
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Center Popover Panel */}
              {isNotifOpen && (
                <div
                  role="dialog"
                  aria-label="RotaClub Bildirim Merkezi"
                  className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-[#0F172A] text-white border border-white/15 shadow-2xl p-4 space-y-3 z-50"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                    <div>
                      <div className="text-xs font-bold text-[#F7A81B]">
                        Bildirim Merkezi · Galata Rotary
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {unreadCount > 0
                          ? `${unreadCount} okunmamış kulüp bildirimi`
                          : 'Tüm bildirimler okundu'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      disabled={unreadCount === 0}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                        unreadCount > 0
                          ? 'bg-[#0C3C7C] hover:bg-[#17458F] text-[#F7A81B]'
                          : 'bg-white/5 text-slate-500 cursor-default'
                      }`}
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Tümünü Okundu İşaretle</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                    {notifications.map((notif) => (
                      <button
                        key={notif.id}
                        type="button"
                        onClick={() => handleMarkSingleAsRead(notif.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer space-y-1 ${
                          notif.unread
                            ? 'bg-[#0C3C7C]/40 border-[#F7A81B]/40 hover:bg-[#0C3C7C]/60'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#F7A81B]">
                            {renderCategoryIcon(notif.category)}
                            <span>{notif.category}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono-num text-slate-400">
                              {notif.timeLabel}
                            </span>
                            {notif.unread && (
                              <span
                                className="w-2 h-2 rounded-full bg-[#F7A81B]"
                                title="Okunmadı"
                              />
                            )}
                          </div>
                        </div>

                        <div className="text-xs font-bold text-white">
                          {notif.title}
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {notif.detail}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                    <span>UR 2420. Bölge Canlı Senkronizasyon</span>
                    <button
                      type="button"
                      onClick={() => setIsNotifOpen(false)}
                      className="text-slate-300 hover:text-white font-semibold cursor-pointer"
                    >
                      Paneli Kapat
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenSplashModal}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[#F7A81B] shrink-0" />
              <span className="hidden sm:inline">Giriş / Kilit Ekranı</span>
              <span className="sm:hidden">Kilit</span>
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
          <div className="flex items-center justify-between sm:justify-start gap-2 text-xs text-slate-200">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#F7A81B] shrink-0" />
              <span className="font-medium">Rol Simülatörü:</span>
              <span className="text-slate-300 hidden md:inline">
                Yetkili ekranları test etmek için rol seçin
              </span>
            </div>
            <span className="sm:hidden font-mono-num text-[#F7A81B] font-semibold">
              %{attendancePercent} Katılım
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
              onClick={onOpenAuditModal}
              title="Sunucu RBAC yetkilendirme durumu, denetim geçmişi ve tam JSON yedekleme"
              aria-label="Denetim Geçmişi ve Yedekleme"
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Database className="w-3.5 h-3.5 text-[#F7A81B]" />
              <span>Denetim & Yedek ({auditCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNotifications(INITIAL_NOTIFICATIONS);
                onResetDemoData();
              }}
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
