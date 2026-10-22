import React, { useState } from 'react';
import {
  Copy,
  Globe,
  HeartPulse,
  MapPin,
  PhoneCall,
  RotateCw,
  Star,
  X,
} from 'lucide-react';
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
  const [isFlipped, setIsFlipped] = useState(false);

  if (!member) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-pass-title"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="max-w-sm w-full space-y-3">
        {/* Top Helper & Flip Trigger Bar */}
        <div className="flex items-center justify-between text-xs text-white px-1">
          <button
            type="button"
            onClick={() => setIsFlipped((prev) => !prev)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-[#F7A81B] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
            <span>
              {isFlipped
                ? 'Ön Yüze Dön (QR & Kimlik)'
                : 'Kartı Çevir (3D Arka Yüz · İkiz Kulüpler)'}
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Apple Wallet Kartını Kapat"
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold flex items-center gap-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Kapat</span>
          </button>
        </div>

        {/* 3D Flip Card Container */}
        <div className="perspective-1000 w-full">
          <div
            onClick={() => setIsFlipped((prev) => !prev)}
            role="button"
            tabIndex={0}
            aria-label="Apple Wallet Rotary Kimlik Kartını 3 Boyutlu Çevir"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsFlipped((prev) => !prev);
              }
            }}
            className={`relative w-full transition-transform duration-500 transform-style-3d cursor-pointer ${
              isFlipped ? 'rotate-y-180' : ''
            }`}
          >
            {/* FRONT FACE */}
            <div
              data-testid="wallet-card-front"
              className={`w-full rounded-3xl overflow-hidden bg-gradient-to-b from-[#09152B] via-[#0C3C7C] to-[#0F172A] text-white border border-white/20 shadow-2xl backface-hidden ${
                isFlipped ? 'pointer-events-none' : ''
              }`}
            >
              {/* Top Pass Bar */}
              <div className="p-5 pb-4 flex items-center justify-between border-b border-white/15">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-[#F7A81B]/50 flex items-center justify-center text-[#F7A81B]">
                    <RotaryWheelIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold tracking-wider text-[#F7A81B]">
                      ROTACLUB · {termInfo.district}
                    </div>
                    <h2
                      id="wallet-pass-title"
                      className="font-serif-display text-lg font-bold text-white leading-tight"
                    >
                      GALATA ROTARY KULÜBÜ
                    </h2>
                  </div>
                </div>
                <span className="text-[10px] font-mono-num text-slate-300">
                  ÖN YÜZ · 3D
                </span>
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

                {/* Classification & Metadata */}
                <div className="p-3.5 rounded-2xl bg-white/10 border border-white/10 space-y-2 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-300">
                      MESLEK SINIFLANDIRMASI ({member.industryCategory})
                    </div>
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
                  <div className="w-28 h-28 p-1.5 border border-slate-200 rounded-xl flex items-center justify-center">
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
                      Arka yüz için karta dokunun
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* BACK FACE (Rotated 180deg in 3D space) */}
            <div
              data-testid="wallet-card-back"
              className="absolute inset-0 w-full rounded-3xl overflow-hidden bg-gradient-to-b from-[#0F172A] via-[#09152B] to-[#0C3C7C] text-white border border-[#F7A81B]/40 shadow-2xl backface-hidden rotate-y-180 flex flex-col justify-between p-5"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/15 pb-3">
                  <div className="flex items-center gap-2">
                    <RotaryWheelIcon className="w-5 h-5 text-[#F7A81B]" />
                    <span className="font-serif-display text-base font-bold text-white">
                      GALATA ROTARY · ARKA YÜZ
                    </span>
                  </div>
                  <span className="text-[10px] font-mono-num text-[#F7A81B]">
                    TWIN CLUBS & ACİL
                  </span>
                </div>

                {/* Twin Clubs (İkiz Kulüpler) */}
                <div className="p-3.5 rounded-2xl bg-white/10 border border-white/10 space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-[#F7A81B] font-semibold">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Galata Rotary İkiz Kulüpleri (Twin Clubs)</span>
                  </div>
                  <div className="text-white font-medium">
                    · RC Genova Centro Storico (İtalya · Bölge 2032)
                  </div>
                  <div className="text-white font-medium">
                    · RC Wien-Ring (Avusturya · Bölge 1910)
                  </div>
                  <div className="text-white font-medium">
                    · RC Athina-Lycabettus (Yunanistan · Bölge 2475)
                  </div>
                </div>

                {/* Club Meeting Schedule & Venue */}
                <div className="p-3.5 rounded-2xl bg-white/10 border border-white/10 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 text-[#F7A81B] font-semibold">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Kulüp Toplantı Günü & Mekanı</span>
                  </div>
                  <div className="text-white font-semibold">
                    Her Salı · 19:30 (Kokteyl) / 20:00 (Toplantı)
                  </div>
                  <div className="text-slate-300">
                    Pera Palace Hotel — Galata Salonu, Beyoğlu / İstanbul
                  </div>
                </div>

                {/* Blood Group & Emergency Contact Info */}
                <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-400/30 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-rose-200 font-semibold">
                      <HeartPulse className="w-4 h-4 text-rose-400" />
                      <span>Sağlık & Acil Durum Bilgisi</span>
                    </span>
                    <span className="font-mono-num font-bold text-white">
                      Kan Grubu: {member.bloodGroup}
                    </span>
                  </div>
                  <div className="text-slate-200 flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-[#F7A81B]" />
                    <span>Kulüp Sekreterliği Acil Hat: +90 533 218 88 10</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Sponsor Üye: {member.sponsorMember}
                  </div>
                </div>
              </div>

              <div className="text-center text-[11px] text-slate-300 pt-2 border-t border-white/10">
                Ön yüze dönmek için karta tekrar dokunun
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action Buttons */}
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
            className="min-h-[42px] px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
