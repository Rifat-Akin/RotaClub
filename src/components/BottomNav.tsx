import React from 'react';
import {
  CalendarCheck2,
  Compass,
  FolderHeart,
  QrCode,
  Users,
  Wallet,
} from 'lucide-react';
import { TabId } from '../types/rotary';

interface BottomNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  pendingPaymentsCount: number;
}

const NAV_ITEMS: {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'home', label: 'Ana Sayfa', icon: CalendarCheck2 },
  { id: 'operations', label: 'Operasyon', icon: QrCode },
  { id: 'finance', label: 'Finans', icon: Wallet },
  { id: 'projects', label: 'Projeler', icon: FolderHeart },
  { id: 'directory', label: 'Rehber & Profil', icon: Users },
];

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  pendingPaymentsCount,
}) => {
  return (
    <nav
      aria-label="Ana Navigasyon"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
    >
      <div className="max-w-4xl mx-auto grid grid-cols-5 items-center h-16 px-1 sm:px-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors cursor-pointer ${
                isActive
                  ? 'text-[#0C3C7C] font-semibold'
                  : 'text-slate-500 hover:text-slate-900 font-medium'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'text-[#0C3C7C] scale-105' : 'text-slate-500'
                  }`}
                />
                {item.id === 'finance' && pendingPaymentsCount > 0 && (
                  <span
                    className="ml-1 text-[10px] font-mono-num font-bold text-[#0C3C7C]"
                    title={`${pendingPaymentsCount} bekleyen bildirim`}
                  >
                    ({pendingPaymentsCount})
                  </span>
                )}
              </div>
              <span className="text-[11px] tracking-tight mt-1 whitespace-nowrap">
                {item.id === 'directory' ? (
                  <>
                    <span className="sm:hidden">Rehber</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </>
                ) : (
                  item.label
                )}
              </span>
              {isActive && (
                <span
                  className="absolute bottom-1 w-6 h-0.5 rounded-full bg-[#F7A81B]"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
