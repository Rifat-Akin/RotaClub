import React, { useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  ScanFace,
  ShieldCheck,
} from 'lucide-react';
import { ClubRole } from '../types/rotary';
import { RotaryWheelIcon } from './RotaryArtwork';

interface SplashLockScreenModalProps {
  isOpen: boolean;
  activeRole: ClubRole;
  onUnlock: (selectedRole?: ClubRole) => void;
}

const PILOT_ACCOUNTS: {
  role: ClubRole;
  name: string;
  title: string;
  email: string;
  rotaryId: string;
}[] = [
  {
    role: 'uye',
    name: 'Rtn. Rifat Akın · PHF +2',
    title: 'Asil Üye (Yazılım & Teknoloji)',
    email: 'rifat.akin@bosphoruscloud.com',
    rotaryId: 'TR-2420-88412',
  },
  {
    role: 'sekreter',
    name: 'Rtn. Av. Nazlı Denizmen · PHF +1',
    title: 'Genel Sekreter (2026-2027)',
    email: 'nazli.denizmen@galatarotary.org',
    rotaryId: 'TR-2420-84910',
  },
  {
    role: 'sayman',
    name: 'Rtn. YMM Levent Soydan · PHF +2',
    title: 'Kulüp Saymanı (2026-2027)',
    email: 'levent.soydan@galatarotary.org',
    rotaryId: 'TR-2420-81104',
  },
  {
    role: 'baskan',
    name: 'Rtn. Mimar Emre Karaca · PHF +3',
    title: 'Dönem Başkanı (2026-2027)',
    email: 'emre.karaca@galatarotary.org',
    rotaryId: 'TR-2420-79201',
  },
];

export const SplashLockScreenModal: React.FC<SplashLockScreenModalProps> = ({
  isOpen,
  activeRole,
  onUnlock,
}) => {
  const [scanning, setScanning] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ClubRole>(activeRole);
  const [kvkkAccepted, setKvkkAccepted] = useState(true);

  if (!isOpen) return null;

  const activeAccount =
    PILOT_ACCOUNTS.find((a) => a.role === selectedRole) || PILOT_ACCOUNTS[0];

  const handleAuthenticate = () => {
    if (scanning || !kvkkAccepted) return;
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      onUnlock(selectedRole);
    }, 500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotaclub-splash-title"
      className="fixed inset-0 z-50 bg-gradient-to-b from-[#061024] via-[#0C3C7C] to-[#09152B] text-white flex flex-col items-center justify-between p-4 sm:p-6 select-none overflow-y-auto"
    >
      {/* iOS Lock Screen Status Header */}
      <div className="w-full max-w-md flex items-center justify-between text-xs text-slate-300 pt-1">
        <span className="font-mono-num font-semibold">UR 2420 · RotaClub v4.0 Pilot</span>
        <div className="flex items-center gap-1.5 text-[#F7A81B]">
          <Lock className="w-3.5 h-3.5" />
          <span>Sunucu RBAC & KVKK Doğrulamalı Oturum</span>
        </div>
      </div>

      {/* Center Brand & Animated Rotary Gold Wheel */}
      <div className="max-w-md w-full text-center space-y-5 my-auto py-4">
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-2 border-[#F7A81B]/30 animate-spin"
            style={{ animationDuration: '14s' }}
          />
          <div className="w-20 h-20 rounded-3xl bg-white/10 border border-[#F7A81B]/60 backdrop-blur-md flex items-center justify-center text-[#F7A81B] shadow-2xl">
            <RotaryWheelIcon className="w-12 h-12 animate-spin" />
          </div>
        </div>

        <div className="space-y-1.5">
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
        </div>

        {/* Authenticated Account & Face ID Card (#22, #23) */}
        <div className="p-5 rounded-3xl bg-white/10 border border-white/15 backdrop-blur-md space-y-4 text-left">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform ${
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
            <div className="min-w-0">
              <div className="text-[11px] text-slate-300">{activeAccount.title}</div>
              <div className="text-sm font-bold text-white truncate">
                {activeAccount.name}
              </div>
              <div className="text-[11px] font-mono-num text-[#F7A81B]">
                Sicil: {activeAccount.rotaryId} · {activeAccount.email}
              </div>
            </div>
          </div>

          {/* Account / Role Selector for Pilot Testing */}
          <div className="space-y-1.5 pt-2 border-t border-white/10">
            <label
              htmlFor="splash-account-select"
              className="block text-[11px] font-semibold text-slate-300 flex items-center gap-1"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#F7A81B]" />
              <span>Pilot Oturum Hesabı Seçin (Sunucu RBAC Yetkisi):</span>
            </label>
            <select
              id="splash-account-select"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as ClubRole)}
              className="w-full text-xs bg-[#09152B]/90 border border-white/20 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-[#F7A81B]"
            >
              {PILOT_ACCOUNTS.map((acc) => (
                <option key={acc.role} value={acc.role}>
                  {acc.name} — {acc.title}
                </option>
              ))}
            </select>
          </div>

          {/* KVKK Explicit Consent Checkbox (#2, #12, #15) */}
          <label className="flex items-start gap-2 text-[11px] text-slate-200 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={kvkkAccepted}
              onChange={(e) => setKvkkAccepted(e.target.checked)}
              className="mt-0.5 rounded border-white/30 text-[#F7A81B]"
            />
            <span>
              6698 sayılı KVKK Aydınlatma Metni’ni okudum; kulüp içi LCV, kuver ve saymanlık verilerimin yetkilendirilmiş kulüp sunucusunda işlenmesini onaylıyorum.
            </span>
          </label>

          <button
            type="button"
            onClick={handleAuthenticate}
            disabled={!kvkkAccepted}
            className={`w-full min-h-[48px] py-3 px-5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
              kvkkAccepted
                ? 'bg-[#F7A81B] hover:bg-[#f9b53b] text-[#0F172A]'
                : 'bg-white/10 text-slate-400 cursor-not-allowed'
            }`}
          >
            <ScanFace className="w-5 h-5" />
            <span>
              {scanning
                ? 'Sunucu Oturumu Doğrulandı — Bağlanıyor...'
                : 'Face ID & Sunucu Oturumu ile Giriş Yap'}
            </span>
          </button>
        </div>
      </div>

      {/* Bottom Multi-Tenant SaaS Footer */}
      <div className="w-full max-w-md text-center space-y-2 pb-1">
        <div className="text-[11px] text-slate-300 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#F7A81B]" />
          <span>
            Çoklu Kulüp (Multi-Tenant SaaS) · Galata · Karaköy · Maçka · 2420. Bölge
          </span>
        </div>
        <div className="w-32 h-1 bg-white/30 rounded-full mx-auto" />
      </div>
    </div>
  );
};
