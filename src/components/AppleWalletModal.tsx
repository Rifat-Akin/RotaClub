import React from 'react';
import { Check, Copy, QrCode, Smartphone, Star, X } from 'lucide-react';
import { RotaryMember, TermBoardInfo } from '../types/rotary';
import { RotaryWheelIcon } from './RotaryArtwork';

interface AppleWalletModalProps {
  member: RotaryMember | null;
  termInfo: TermBoardInfo;
  onClose: () => void;
  onCopyVCard: (member: RotaryMember) => void;
}

export const AppleWalletModal: React.FC<AppleWalletModalProps> = ({
  member,
  termInfo,
  onClose,
  onCopyVCard,
}) => {
  if (!member) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-pass-title"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="max-w-sm w-full rounded-3xl overflow-hidden bg-gradient-to-b from-[#09152B] via-[#0C3C7C] to-[#0F172A] text-white border border-white/20 shadow-2xl">
        {/* Top Pass Bar */}
        <div className="p-5 pb-4 flex items-center justify-between border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-[#F7A81B]/50 flex items-center justify-center text-[#F7A81B]">
              <RotaryWheelIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-[#F7A81B]">
                ULUSLARARASI ROTARY · {termInfo.district}
              </div>
              <h2
                id="wallet-pass-title"
                className="font-serif-display text-lg font-bold text-white leading-tight"
              >
                GALATA ROTARY KULÜBÜ
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Apple Wallet Kartını Kapat"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pass Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] text-slate-300">ÜYE ADI SOYADI</div>
              <div className="font-serif-display text-2xl font-bold text-white mt-0.5">
                Rtn. {member.fullName}
              </div>
              <div className="text-xs text-[#F7A81B] font-medium mt-0.5">
                {member.clubTitle}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-300">PAUL HARRIS DOSTU</div>
              <div className="inline-flex items-center gap-1 text-xs font-bold text-[#F7A81B] mt-1">
                {Array.from({ length: member.phfStars }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-3.5 h-3.5 fill-[#F7A81B] text-[#F7A81B]"
                  />
                ))}
              </div>
              <div className="text-xs font-bold text-white mt-0.5">
                {member.phfLevel}
              </div>
            </div>
          </div>

          {/* Classification & Company */}
          <div className="p-3.5 rounded-2xl bg-white/10 border border-white/10 space-y-2 text-xs">
            <div>
              <div className="text-[10px] text-slate-300">MESLEK SINIFLANDIRMASI</div>
              <div className="font-semibold text-white mt-0.5">
                {member.classification}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
              <div>
                <div className="text-[10px] text-slate-300">ROTARY ID</div>
                <div className="font-mono-num font-bold text-[#F7A81B] mt-0.5">
                  {member.rotaryId}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-300">KAN GRUBU</div>
                <div className="font-mono-num font-bold text-white mt-0.5">
                  {member.bloodGroup}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-300">KATILIM YILI</div>
                <div className="font-mono-num font-bold text-white mt-0.5">
                  {member.joinYear}
                </div>
              </div>
            </div>
          </div>

          {/* vCard QR Code Area */}
          <div className="bg-white rounded-2xl p-4 text-[#0F172A] flex flex-col items-center space-y-2">
            <div className="w-32 h-32 p-1.5 border border-slate-200 rounded-xl flex items-center justify-center">
              <svg
                viewBox="0 0 120 120"
                className="w-full h-full text-[#0F172A]"
                aria-label={`${member.fullName} vCard QR Kodu`}
              >
                <rect x="6" y="6" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="6" />
                <rect x="14" y="14" width="14" height="14" fill="currentColor" />
                <rect x="84" y="6" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="6" />
                <rect x="92" y="14" width="14" height="14" fill="currentColor" />
                <rect x="6" y="84" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="6" />
                <rect x="14" y="92" width="14" height="14" fill="currentColor" />
                <rect x="46" y="12" width="10" height="10" fill="currentColor" />
                <rect x="64" y="12" width="10" height="18" fill="currentColor" />
                <rect x="14" y="46" width="18" height="10" fill="currentColor" />
                <rect x="48" y="48" width="24" height="24" rx="4" fill="#0C3C7C" />
                <rect x="82" y="50" width="24" height="10" fill="currentColor" />
                <rect x="46" y="82" width="14" height="12" fill="currentColor" />
                <rect x="68" y="84" width="16" height="22" fill="currentColor" />
                <rect x="92" y="88" width="18" height="18" fill="currentColor" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-xs font-bold font-mono-num text-[#0F172A]">
                vCard · {member.rotaryId}
              </div>
              <div className="text-[11px] text-slate-500">
                {member.email} · {member.phone}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => onCopyVCard(member)}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-[#F7A81B] text-[#0F172A] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#f9b53b] transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>vCard Kopyala</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer"
            >
              Tamam
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
