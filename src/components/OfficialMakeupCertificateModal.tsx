import React from 'react';
import { Award, CheckCircle2, Printer, ShieldCheck, X } from 'lucide-react';
import { GuestRotaryMakeupCard, TermBoardInfo } from '../types/rotary';
import { RotaryWheelIcon } from './RotaryArtwork';

interface OfficialMakeupCertificateModalProps {
  card: GuestRotaryMakeupCard | null;
  termInfo: TermBoardInfo;
  onClose: () => void;
}

export const OfficialMakeupCertificateModal: React.FC<
  OfficialMakeupCertificateModalProps
> = ({ card, termInfo, onClose }) => {
  if (!card) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="official-certificate-title"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="max-w-2xl w-full bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden my-auto">
        {/* Top Action Bar (Hidden in Print) */}
        <div className="no-print bg-[#0F172A] text-white px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-4 h-4 text-[#F7A81B]" />
            <span className="font-semibold">
              RotaClub · Resmi Dijital Make-up Katılım Sertifikası
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#F7A81B] hover:bg-[#f9b53b] text-[#0F172A] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>PDF / Yazdır</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Sertifika Modalını Kapat"
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Kapat</span>
            </button>
          </div>
        </div>

        {/* Printable Gold-Framed Official Certificate Body */}
        <div id="printable-makeup-certificate" className="p-5 sm:p-8 bg-white">
          <div className="border-4 border-double border-[#F7A81B] rounded-2xl p-6 sm:p-8 bg-gradient-to-b from-[#FFFDF9] via-white to-[#F8FAFC] space-y-6 relative">
            {/* Certificate Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-[#0C3C7C]/20 pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-[#0C3C7C] text-[#F7A81B] flex items-center justify-center shrink-0 shadow-sm">
                  <RotaryWheelIcon className="w-9 h-9" />
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-widest text-[#0C3C7C]">
                    ROTACLUB RESMİ BELGE SİSTEMİ · {termInfo.district}
                  </div>
                  <h2
                    id="official-certificate-title"
                    className="font-serif-display text-2xl sm:text-3xl font-bold text-[#0F172A]"
                  >
                    GALATA ROTARY KULÜBÜ
                  </h2>
                  <div className="text-xs text-slate-600 font-medium">
                    Resmi Make-up Katılım Belgesi (Official Attendance Make-up Certificate)
                  </div>
                </div>
              </div>

              <div className="sm:text-right font-mono-num text-xs text-slate-600 space-y-0.5">
                <div className="font-bold text-[#0C3C7C]">
                  Belge No: {card.verificationCode}
                </div>
                <div>Toplantı #{card.meetingNo}</div>
                <div>Tarih: {card.meetingDate}</div>
              </div>
            </div>

            {/* Certificate Main Statement */}
            <div className="space-y-4 text-sm text-slate-800 leading-relaxed py-2">
              <p className="font-semibold text-[#0F172A]">
                Sayın {card.guestClub} ({card.guestDistrict}) Genel Sekreterliği’ne,
              </p>
              <p>
                Kulübünüzün değerli üyesi{' '}
                <strong className="text-[#0C3C7C] text-base underline decoration-[#F7A81B] underline-offset-4">
                  {card.guestName}
                </strong>
                , <strong>{card.meetingDate}</strong> tarihinde Pera Palace Hotel Galata Balo Salonu’nda
                gerçekleştirdiğimiz <strong>{card.meetingNo}. Haftalık Kulüp Toplantımıza</strong>{' '}
                onur konuğumuz olarak katılmış ve kulüp çalışmalarına katkı sunmuştur.
              </p>
              <p>
                Uluslararası Rotary Tüzüğü gereğince işbu resmi katılım belgesinin üyenizin devam
                çizelgesinde <strong>Make-up (+1 Toplantı Katılımı)</strong> olarak işlenmesini rica
                eder, Rotaryen sevgi ve saygılarımızı sunarız.
              </p>
            </div>

            {/* Official Seal & Digital Server Verification Row (#36: No fake wet signature claims) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center pt-5 border-t border-slate-200">
              {/* Dönem Başkanı Digital Record Confirmation */}
              <div className="text-center sm:text-left space-y-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  GALATA RK DÖNEM BAŞKANI
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0C3C7C]/5 border border-[#0C3C7C]/20 text-[11px] font-mono-num font-semibold text-[#0C3C7C]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#0C3C7C]" />
                  <span>Sunucu Kayıt Onayı</span>
                </div>
                <div className="text-xs font-bold text-slate-900">
                  {termInfo.president}
                </div>
                <div className="text-[11px] text-slate-500">{termInfo.termLabel}</div>
              </div>

              {/* Center Gold Rotary & RotaClub Digital Verification Seal */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full border-2 border-[#F7A81B] bg-[#0C3C7C]/5 flex flex-col items-center justify-center p-2 text-center shadow-inner">
                  <RotaryWheelIcon className="w-7 h-7 text-[#0C3C7C]" />
                  <span className="text-[8px] font-bold tracking-wider text-[#0C3C7C] mt-1">
                    GALATA ROTARY
                  </span>
                  <span className="text-[7px] font-mono-num text-slate-600">
                    DİJİTAL KAYIT
                  </span>
                </div>
              </div>

              {/* Genel Sekreter Digital Record Confirmation */}
              <div className="text-center sm:text-right space-y-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  GALATA RK GENEL SEKRETERİ
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0C3C7C]/5 border border-[#0C3C7C]/20 text-[11px] font-mono-num font-semibold text-[#0C3C7C]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0C3C7C]" />
                  <span>Doğrulama: {card.verificationCode}</span>
                </div>
                <div className="text-xs font-bold text-slate-900">
                  {termInfo.secretary}
                </div>
                <div className="text-[11px] text-slate-500">
                  Alıcı: {card.guestEmail}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
