import React from 'react';

export function RotaryWheelIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer gear teeth */}
      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="4.5" />
      <circle cx="32" cy="32" r="9" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="32" cy="32" r="3.5" fill="currentColor" />
      {/* 6 Spokes */}
      <line x1="32" y1="10" x2="32" y2="23" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="32" y1="41" x2="32" y2="54" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="13" y1="21" x2="24" y2="27.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="40" y1="36.5" x2="51" y2="43" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="51" y1="21" x2="40" y2="27.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="24" y1="36.5" x2="13" y2="43" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* 12 Cogs */}
      <rect x="29.5" y="3" width="5" height="6" rx="1" fill="currentColor" />
      <rect x="29.5" y="55" width="5" height="6" rx="1" fill="currentColor" />
      <rect x="3" y="29.5" width="6" height="5" rx="1" fill="currentColor" />
      <rect x="55" y="29.5" width="6" height="5" rx="1" fill="currentColor" />
      <rect x="11" y="10" width="5" height="5" rx="1" transform="rotate(-35 11 10)" fill="currentColor" />
      <rect x="49" y="7" width="5" height="5" rx="1" transform="rotate(35 49 7)" fill="currentColor" />
      <rect x="8" y="49" width="5" height="5" rx="1" transform="rotate(35 8 49)" fill="currentColor" />
      <rect x="52" y="46" width="5" height="5" rx="1" transform="rotate(-35 52 46)" fill="currentColor" />
    </svg>
  );
}

export function PeraPalaceBannerIllustration() {
  return (
    <div className="relative w-full h-44 sm:h-52 overflow-hidden bg-gradient-to-br from-[#091E42] via-[#0C3C7C] to-[#17458F] text-white select-none">
      {/* Architectural Neoclassical Arches & Galata Silhouette SVG */}
      <svg
        viewBox="0 0 800 260"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full object-cover opacity-90"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="chandelierGlow" cx="50%" cy="20%" r="55%">
            <stop offset="0%" stopColor="#F7A81B" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#F7A81B" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#0C3C7C" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="goldColumn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F7A81B" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#F7A81B" stopOpacity="0.08" />
          </linearGradient>
        </defs>

        {/* Warm Chandelier Glow */}
        <ellipse cx="400" cy="45" rx="320" ry="140" fill="url(#chandelierGlow)" />

        {/* Subtle Neoclassical Ballroom Arches */}
        <path
          d="M60 260 V110 A70 70 0 0 1 200 110 V260"
          stroke="url(#goldColumn)"
          strokeWidth="1.5"
        />
        <path
          d="M230 260 V95 A85 85 0 0 1 400 95 V260"
          stroke="url(#goldColumn)"
          strokeWidth="1.5"
        />
        <path
          d="M600 260 V110 A70 70 0 0 1 740 110 V260"
          stroke="url(#goldColumn)"
          strokeWidth="1.5"
        />

        {/* Galata Tower Architectural Emblem on Right */}
        <g transform="translate(625, 28)" opacity="0.88">
          {/* Cone Roof */}
          <polygon points="45,0 14,52 76,52" fill="#F7A81B" fillOpacity="0.85" />
          <line x1="45" y1="-10" x2="45" y2="0" stroke="#F7A81B" strokeWidth="2.5" />
          {/* Observation Deck */}
          <rect x="12" y="52" width="66" height="8" rx="2" fill="#FDE68A" fillOpacity="0.9" />
          {/* Arched Windows Row */}
          <rect x="17" y="60" width="56" height="165" fill="#0F172A" fillOpacity="0.55" stroke="#F7A81B" strokeWidth="1.5" />
          <rect x="24" y="70" width="8" height="16" rx="4" fill="#F7A81B" fillOpacity="0.85" />
          <rect x="41" y="70" width="8" height="16" rx="4" fill="#F7A81B" fillOpacity="0.85" />
          <rect x="58" y="70" width="8" height="16" rx="4" fill="#F7A81B" fillOpacity="0.85" />
          {/* Masonry Belts */}
          <line x1="15" y1="100" x2="75" y2="100" stroke="#F7A81B" strokeWidth="1.5" strokeOpacity="0.6" />
          <line x1="15" y1="140" x2="75" y2="140" stroke="#F7A81B" strokeWidth="1.5" strokeOpacity="0.6" />
          <rect x="28" y="112" width="6" height="14" rx="3" fill="#F7A81B" fillOpacity="0.5" />
          <rect x="56" y="112" width="6" height="14" rx="3" fill="#F7A81B" fillOpacity="0.5" />
        </g>

        {/* Pera Palace Crystal Chandelier Centerpiece */}
        <g transform="translate(360, 0)">
          <line x1="40" y1="0" x2="40" y2="22" stroke="#F7A81B" strokeWidth="2" />
          <path d="M15 28 Q40 44 65 28" stroke="#FDE68A" strokeWidth="2" fill="none" />
          <path d="M5 38 Q40 62 75 38" stroke="#F7A81B" strokeWidth="1.5" fill="none" />
          <circle cx="15" cy="26" r="2.5" fill="#FEF08A" />
          <circle cx="28" cy="31" r="2.5" fill="#FEF08A" />
          <circle cx="40" cy="33" r="3" fill="#FEF08A" />
          <circle cx="52" cy="31" r="2.5" fill="#FEF08A" />
          <circle cx="65" cy="26" r="2.5" fill="#FEF08A" />
        </g>
      </svg>

      {/* Measured contrast scrim for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#09152B]/95 via-[#09152B]/55 to-transparent" />
    </div>
  );
}

export function ProjectVisualArtwork({
  theme,
  code,
  category,
}: {
  theme: 'galatart' | 'concert' | 'school' | 'ryla' | 'gala';
  code?: string;
  category: string;
}) {
  const bgMap: Record<typeof theme, string> = {
    galatart: 'from-[#0F172A] via-[#1E293B] to-[#0C3C7C]',
    concert: 'from-[#172554] via-[#0C3C7C] to-[#451A03]',
    school: 'from-[#0C3C7C] via-[#1E3A8A] to-[#0F766E]',
    ryla: 'from-[#0F172A] via-[#0C3C7C] to-[#1D4ED8]',
    gala: 'from-[#09152B] via-[#0C3C7C] to-[#78350F]',
  };

  return (
    <div
      className={`relative w-full h-44 overflow-hidden bg-gradient-to-br ${bgMap[theme]} text-white select-none`}
    >
      <svg
        viewBox="0 0 600 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full object-cover opacity-90"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {theme === 'galatart' && (
          <g>
            {/* Contemporary Art Gallery Frames & Abstract Sculpture */}
            <rect x="340" y="25" width="95" height="125" rx="4" fill="#1E293B" stroke="#F7A81B" strokeWidth="2" />
            <circle cx="387" cy="75" r="26" fill="#F7A81B" fillOpacity="0.85" />
            <path d="M352 135 L385 95 L420 135 Z" fill="#38BDF8" fillOpacity="0.65" />
            <rect x="455" y="42" width="105" height="110" rx="4" fill="#0F172A" stroke="#E2E8F0" strokeWidth="1.5" strokeOpacity="0.5" />
            <path d="M470 125 Q505 55 545 125" stroke="#F7A81B" strokeWidth="4" fill="none" />
            <circle cx="508" cy="78" r="10" fill="#F43F5E" fillOpacity="0.8" />
          </g>
        )}
        {theme === 'concert' && (
          <g>
            {/* Symphonic Stage Spotlight & Acoustic Waves */}
            <path d="M420 0 L330 220 L520 220 Z" fill="#F7A81B" fillOpacity="0.16" />
            <path d="M490 0 L410 220 L585 220 Z" fill="#FDE68A" fillOpacity="0.12" />
            <circle cx="445" cy="110" r="62" stroke="#F7A81B" strokeWidth="1.5" strokeOpacity="0.5" />
            <circle cx="445" cy="110" r="42" stroke="#F7A81B" strokeWidth="2" strokeOpacity="0.75" />
            {/* Musical Staff Lines */}
            <path d="M300 95 Q440 65 590 105" stroke="#F7A81B" strokeWidth="1.5" strokeOpacity="0.55" />
            <path d="M300 110 Q440 80 590 120" stroke="#F7A81B" strokeWidth="1.5" strokeOpacity="0.55" />
            <path d="M300 125 Q440 95 590 135" stroke="#F7A81B" strokeWidth="1.5" strokeOpacity="0.55" />
          </g>
        )}
        {theme === 'school' && (
          <g>
            {/* Primary School Vision & Health Care Geometric Illustration */}
            <circle cx="460" cy="105" r="68" fill="#F7A81B" fillOpacity="0.14" />
            <circle cx="460" cy="105" r="46" stroke="#38BDF8" strokeWidth="2" strokeOpacity="0.6" />
            {/* Eyeglass Frame Symbol for Vision Screening */}
            <circle cx="432" cy="105" r="20" stroke="#F7A81B" strokeWidth="3.5" />
            <circle cx="488" cy="105" r="20" stroke="#F7A81B" strokeWidth="3.5" />
            <path d="M452 105 Q460 97 468 105" stroke="#F7A81B" strokeWidth="3.5" fill="none" />
            {/* Medical Care Cross */}
            <rect x="536" y="42" width="8" height="26" rx="2" fill="#34D399" />
            <rect x="527" y="51" width="26" height="8" rx="2" fill="#34D399" />
          </g>
        )}
        {(theme === 'ryla' || theme === 'gala') && (
          <g>
            {/* Compass & Bosphorus Leadership Horizon */}
            <circle cx="465" cy="105" r="64" stroke="#F7A81B" strokeWidth="1.5" strokeDasharray="4 4" strokeOpacity="0.7" />
            <polygon points="465,45 480,95 530,105 480,115 465,165 450,115 400,105 450,95" fill="#F7A81B" fillOpacity="0.75" />
            <circle cx="465" cy="105" r="10" fill="#0F172A" stroke="#FDE68A" strokeWidth="2" />
          </g>
        )}
      </svg>

      <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/90 via-[#0F172A]/35 to-transparent" />

      <div className="relative z-10 h-full flex flex-col justify-between p-4">
        <div className="flex items-center justify-between text-xs text-slate-200/90 font-medium">
          <span>{category}</span>
          {code && <span className="font-mono-num text-[#F7A81B]">{code}</span>}
        </div>
      </div>
    </div>
  );
}
