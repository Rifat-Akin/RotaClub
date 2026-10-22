import React, { useState } from 'react';
import { CheckCircle2, Lock, ScanFace, ShieldCheck, Sparkles } from 'lucide-react';
import { RotaryWheelIcon } from './RotaryArtwork';

interface SplashLockScreenModalProps {
  isOpen: boolean;
  onUnlock: () => void;
}

export const SplashLockScreenModal: React.FC<SplashLockScreenModalProps> = ({
  isOpen,
  onUnlock,
}) => {
  const [scanning, setScanning] = useState(false);

  if (!isOpen) return null;

  const handleFaceIdLogin = () => {
    if (scanning) return;
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      onUnlock();
    }, 650);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotaclub-splash-title"
      className="fixed inset-0 z-50 bg-gradient-to-b from-[#061024] via-[#0C3C7C] to-[#09152B] text-white flex flex-col items-center justify-between p-6 select-none"
    >
      {/* iOS Lock Screen Status Header */}
      <div className="w-full max-w-md flex items-center justify-between text-xs text-slate-300 pt-2">
        <span className="font-mono-num font-semibold">UR 2420 · RotaClub v2.0</span>
        <div className="flex items-center gap-1.5 text-[#F7A81B]">
          <Lock className="w-3.5 h-3.5" />
          <span>Uçtan Uca Şifreli Kulüp Ağı</span>
        </div>
      </div>

      {/* Center Brand & Animated Rotary Gold Wheel */}
      <div className="max-w-sm w-full text-center space-y-6 my-auto">
        <div className="relative mx-auto w-28 h-28 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-[#F7A81B]/30 animate-spin" style={{ animationDuration: '14s' }} />
          <div className="w-24 h-24 rounded-3xl bg-white/10 border border-[#F7A81B]/60 backdrop-blur-md flex items-center justify-center text-[#F7A81B] shadow-2xl">
            <RotaryWheelIcon className="w-14 h-14 animate-spin" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold tracking-widest text-[#F7A81B]">
            ULUSLARARASI ROTARY 2420. BÖLGE
          </div>
          <h1
            id="rotaclub-splash-title"
            className="font-serif-display text-4xl sm:text-5xl font-bold tracking-tight text-white"
          >
            RotaClub
          </h1>
          <p className="text-sm text-slate-200 font-medium">
            RotaClub — Dijital Kulüp & Üye Ağı
          </p>
          <p className="text-xs text-slate-300/90 pt-1">
            Galata Rotary Kulübü · Pera Palace Özel Oturumu
          </p>
        </div>

        {/* Face ID Verification Card */}
        <div className="p-5 rounded-3xl bg-white/10 border border-white/15 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform ${
                scanning
                  ? 'bg-emerald-500/20 text-emerald-300 scale-105'
                  : 'bg-[#F7A81B]/20 text-[#F7A81B]'
              }`}
            >
              {scanning ? (
                <CheckCircle2 className="w-7 h-7" />
              ) : (
                <ScanFace className="w-7 h-7" />
              )}
            </div>
            <div className="text-left">
              <div className="text-xs text-slate-300">Hoş Geldiniz</div>
              <div className="text-sm font-bold text-white">
                Rtn. Rifat Akın · PHF +2
              </div>
              <div className="text-[11px] font-mono-num text-[#F7A81B]">
                Sicil: TR-2420-88412
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFaceIdLogin}
            className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-[#F7A81B] hover:bg-[#f9b53b] text-[#0F172A] font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
          >
            <ScanFace className="w-5 h-5" />
            <span>
              {scanning
                ? 'Face ID Doğrulandı — Kulübe Bağlanıyor...'
                : 'Face ID ile Giriş Yap'}
            </span>
          </button>
        </div>
      </div>

      {/* Bottom Multi-Tenant SaaS Footer */}
      <div className="w-full max-w-md text-center space-y-2 pb-2">
        <div className="text-[11px] text-slate-300">
          Çoklu Kulüp (Multi-Tenant SaaS) Mimarisi · Galata · Karaköy · Maçka · 2420. Bölge
        </div>
        <div className="w-32 h-1 bg-white/30 rounded-full mx-auto" />
      </div>
    </div>
  );
};
