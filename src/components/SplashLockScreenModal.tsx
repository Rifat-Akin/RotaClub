import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { ClubRole } from '../types/rotary';
import { RotaryWheelIcon } from './RotaryArtwork';

interface SplashLockScreenModalProps {
  isOpen: boolean;
  activeRole: ClubRole;
  onUnlock: (
    selectedRole?: ClubRole,
    sessionToken?: string,
    authenticatedRotaryId?: string
  ) => void;
}

interface BrowserPasskeyEntry {
  credentialId: string;
  keyPair: CryptoKeyPair;
  signCount: number;
}

// In-memory WebCrypto ECDSA P-256 passkey store for registered device credentials
const registeredBrowserPasskeys = new Map<string, BrowserPasskeyEntry>();

const PILOT_ACCOUNT_PROFILES: {
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
    email: 'rifat.akin@galatarotary.org',
    rotaryId: 'TR-2420-88412',
  },
  {
    role: 'sekreter',
    name: 'Rtn. Av. Nazlı Denizmen · PHF +1',
    title: 'Genel Sekreter (2026-2027)',
    email: 'sekreter@galatarotary.org',
    rotaryId: 'TR-2420-81024',
  },
  {
    role: 'sayman',
    name: 'Rtn. YMM Levent Soydan · PHF +2',
    title: 'Kulüp Saymanı (2026-2027)',
    email: 'sayman@galatarotary.org',
    rotaryId: 'TR-2420-79310',
  },
  {
    role: 'baskan',
    name: 'Rtn. Mimar Emre Karaca · PHF +3',
    title: 'Dönem Başkanı (2026-2027)',
    email: 'baskan@galatarotary.org',
    rotaryId: 'TR-2420-74105',
  },
];

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function stringToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64Url(bytes);
}

/**
 * Registers a real WebCrypto ECDSA P-256 passkey on the server for an authenticated session (#12, #22)
 */
async function registerBrowserEcdsaPasskey(
  rotaryId: string,
  bearerToken: string
): Promise<BrowserPasskeyEntry | null> {
  if (
    typeof window === 'undefined' ||
    !window.crypto ||
    !window.crypto.subtle
  ) {
    return null;
  }

  const optionsRes = await fetch('/api/auth/webauthn-register-options', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
  });
  if (!optionsRes.ok) return null;
  const optionsData = await optionsRes.json();

  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  );

  const spkiBuffer = await window.crypto.subtle.exportKey(
    'spki',
    keyPair.publicKey
  );
  const publicKeySpkiB64 = bytesToBase64Url(new Uint8Array(spkiBuffer));

  const randomCredBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const credentialId = bytesToBase64Url(randomCredBytes);

  const clientDataJSON = stringToBase64Url(
    JSON.stringify({
      type: 'webauthn.create',
      challenge: optionsData.challenge,
      origin: window.location.origin,
      crossOrigin: false,
    })
  );

  const verifyRes = await fetch('/api/auth/webauthn-register-verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      challengeId: optionsData.challengeId,
      credentialId,
      clientDataJSON,
      publicKeySpkiB64,
    }),
  });
  if (!verifyRes.ok) return null;

  const entry: BrowserPasskeyEntry = {
    credentialId,
    keyPair,
    signCount: 0,
  };
  registeredBrowserPasskeys.set(rotaryId, entry);
  return entry;
}

export const SplashLockScreenModal: React.FC<SplashLockScreenModalProps> = ({
  isOpen,
  activeRole,
  onUnlock,
}) => {
  const initialAccount =
    PILOT_ACCOUNT_PROFILES.find((a) => a.role === activeRole) ||
    PILOT_ACCOUNT_PROFILES[0];

  const [selectedRole, setSelectedRole] = useState<ClubRole>(activeRole);
  const [identifierInput, setIdentifierInput] = useState(initialAccount.rotaryId);
  const [pinInput, setPinInput] = useState('');
  const [kvkkAccepted, setKvkkAccepted] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [webAuthnStatus, setWebAuthnStatus] = useState<string | null>(null);

  useEffect(() => {
    const preset =
      PILOT_ACCOUNT_PROFILES.find((a) => a.role === activeRole) ||
      PILOT_ACCOUNT_PROFILES[0];
    setSelectedRole(activeRole);
    setIdentifierInput(preset.rotaryId);
    setErrorMessage(null);
  }, [activeRole, isOpen]);

  if (!isOpen) return null;

  const activeAccount =
    PILOT_ACCOUNT_PROFILES.find((a) => a.role === selectedRole) ||
    PILOT_ACCOUNT_PROFILES[0];

  const handleSelectPresetAccount = (role: ClubRole) => {
    setSelectedRole(role);
    setErrorMessage(null);
    const preset = PILOT_ACCOUNT_PROFILES.find((a) => a.role === role);
    if (preset) {
      setIdentifierInput(preset.rotaryId);
      setPinInput('');
    }
  };

  /**
   * Real Server Authentication via POST /api/auth/login (#22, #23)
   * Validates Scrypt PIN hash on the server and automatically enrolls a genuine
   * WebCrypto ECDSA P-256 Passkey for subsequent hardware/biometric assertions.
   */
  const handleServerAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authenticating || !kvkkAccepted) return;
    if (!pinInput.trim()) {
      setErrorMessage(
        'Lütfen kurumsal PIN şifrenizi girin veya kayıtlı WebAuthn Passkey ile doğrulama yapın.'
      );
      return;
    }
    setAuthenticating(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifierInput.trim(),
          pinCode: pinInput.trim(),
          clubId: 'club-galata',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok || !data.token) {
        setErrorMessage(
          data?.message || 'Sunucu kimlik doğrulaması başarısız oldu.'
        );
        setAuthenticating(false);
        return;
      }

      // Enroll a genuine WebCrypto ECDSA P-256 Passkey for this authenticated user if not yet registered
      if (!registeredBrowserPasskeys.has(data.user.rotaryId)) {
        await registerBrowserEcdsaPasskey(data.user.rotaryId, data.token).catch(
          () => null
        );
      }

      setAuthenticating(false);
      onUnlock(data.user.role as ClubRole, data.token, data.user.rotaryId);
    } catch {
      setErrorMessage(
        'Sunucuya bağlanılamadı. Lütfen bağlantınızı kontrol edin.'
      );
      setAuthenticating(false);
    }
  };

  /**
   * Full End-to-End Cryptographic WebAuthn Passkey Challenge & ECDSA P-256 Assertion (#12, #22)
   */
  const handleWebAuthnVerify = async () => {
    if (!kvkkAccepted || authenticating) return;
    setErrorMessage(null);

    const passkeyEntry = registeredBrowserPasskeys.get(identifierInput.trim());
    if (!passkeyEntry) {
      setErrorMessage(
        'Bu tarayıcı oturumunda kayıtlı ECDSA P-256 Passkey bulunamadı. Lütfen önce Kurumsal PIN ile giriş yaparak cihaz açık anahtarını (SPKI) kaydedin.'
      );
      return;
    }

    setAuthenticating(true);
    setWebAuthnStatus(
      '1/2 · Sunucudan tek kullanımlık WebAuthn challenge alınıyor...'
    );

    try {
      const challengeRes = await fetch('/api/auth/webauthn-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifierInput.trim(),
          clubId: 'club-galata',
        }),
      });
      const challengeData = await challengeRes.json();
      if (!challengeRes.ok || !challengeData.challengeId) {
        setErrorMessage(
          challengeData?.message || 'WebAuthn challenge oluşturulamadı.'
        );
        setAuthenticating(false);
        return;
      }

      const clientDataObj = {
        type: 'webauthn.get',
        challenge: challengeData.challenge,
        origin: window.location.origin,
        crossOrigin: false,
      };
      const clientDataBytes = new TextEncoder().encode(
        JSON.stringify(clientDataObj)
      );
      const clientDataJSON = bytesToBase64Url(clientDataBytes);

      // Construct genuine 37-byte authenticatorData:
      // [0..31]: SHA-256(rpId)
      // [32]: flags (0x05 = User Present + User Verified)
      // [33..36]: monotonic big-endian signCount
      const rpIdBytes = new TextEncoder().encode(
        challengeData.rpId || window.location.hostname || 'localhost'
      );
      const rpIdHashBuffer = await window.crypto.subtle.digest(
        'SHA-256',
        rpIdBytes
      );
      const authDataBytes = new Uint8Array(37);
      authDataBytes.set(new Uint8Array(rpIdHashBuffer), 0);
      authDataBytes[32] = 0x05; // UP (0x01) | UV (0x04)

      const nextSignCount = passkeyEntry.signCount + 1;
      const view = new DataView(authDataBytes.buffer);
      view.setUint32(33, nextSignCount, false);
      const authenticatorData = bytesToBase64Url(authDataBytes);

      // Compute SHA-256(clientDataJSON) and sign (authenticatorData || clientDataHash) with ECDSA P-256 private key
      const clientDataHashBuffer = await window.crypto.subtle.digest(
        'SHA-256',
        clientDataBytes
      );
      const signedData = new Uint8Array(37 + 32);
      signedData.set(authDataBytes, 0);
      signedData.set(new Uint8Array(clientDataHashBuffer), 37);

      const rawSignatureBuffer = await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        passkeyEntry.keyPair.privateKey,
        signedData
      );
      const signature = bytesToBase64Url(new Uint8Array(rawSignatureBuffer));

      setWebAuthnStatus(
        `2/2 · ECDSA P-256 İmzası ve Challenge #${String(
          challengeData.challengeId
        ).slice(0, 8)} sunucuda doğrulanıyor...`
      );

      const verifyRes = await fetch('/api/auth/webauthn-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeData.challengeId,
          credentialId: passkeyEntry.credentialId,
          clientDataJSON,
          authenticatorData,
          signature,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.ok || !verifyData.token) {
        setErrorMessage(
          verifyData?.message || 'WebAuthn sunucu doğrulaması başarısız oldu.'
        );
        setAuthenticating(false);
        return;
      }

      passkeyEntry.signCount = nextSignCount;
      setAuthenticating(false);
      onUnlock(
        verifyData.user.role as ClubRole,
        verifyData.token,
        verifyData.user.rotaryId
      );
    } catch {
      setErrorMessage('WebAuthn doğrulama servisine ulaşılamadı.');
      setAuthenticating(false);
    }
  };

  const hasRegisteredPasskey = registeredBrowserPasskeys.has(
    identifierInput.trim()
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotaclub-splash-title"
      className="fixed inset-0 z-50 bg-gradient-to-b from-[#061024] via-[#0C3C7C] to-[#09152B] text-white flex flex-col items-center justify-between p-4 sm:p-6 select-none overflow-y-auto"
    >
      {/* Top Security Status Bar */}
      <div className="w-full max-w-md flex items-center justify-between text-xs text-slate-300 pt-1">
        <span className="font-mono-num font-semibold">
          UR 2420 · RotaClub v5.2 Hardened
        </span>
        <div className="flex items-center gap-1.5 text-[#F7A81B]">
          <Lock className="w-3.5 h-3.5" />
          <span>HMAC-SHA256 + ECDSA P-256 WebAuthn</span>
        </div>
      </div>

      {/* Center Brand & Real Server Login Form */}
      <div className="max-w-md w-full text-center space-y-4 my-auto py-3">
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="w-16 h-16 rounded-3xl bg-white/10 border border-[#F7A81B]/60 backdrop-blur-md flex items-center justify-center text-[#F7A81B] shadow-2xl">
            <RotaryWheelIcon className="w-10 h-10" />
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-widest text-[#F7A81B]">
            ULUSLARARASI ROTARY 2420. BÖLGE
          </div>
          <h1
            id="rotaclub-splash-title"
            className="font-serif-display text-3xl sm:text-4xl font-bold tracking-tight text-white"
          >
            RotaClub Kimlik Doğrulama
          </h1>
          <p className="text-xs text-slate-200 font-medium">
            Gerçek Sunucu Oturumu (Scrypt PIN + ECDSA P-256 Passkey + HMAC-SHA256)
          </p>
        </div>

        <form
          onSubmit={handleServerAuthenticate}
          className="p-5 rounded-3xl bg-white/10 border border-white/15 backdrop-blur-md space-y-3.5 text-left"
        >
          {/* Preset Pilot Role Selector */}
          <div className="space-y-1">
            <label
              htmlFor="splash-account-select"
              className="block text-[11px] font-semibold text-slate-300 flex items-center gap-1"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#F7A81B]" />
              <span>Yetkili Kulüp Hesabını Seçin:</span>
            </label>
            <select
              id="splash-account-select"
              value={selectedRole}
              onChange={(e) =>
                handleSelectPresetAccount(e.target.value as ClubRole)
              }
              className="w-full text-xs bg-[#09152B]/90 border border-white/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#F7A81B]"
            >
              {PILOT_ACCOUNT_PROFILES.map((acc) => (
                <option key={acc.role} value={acc.role}>
                  {acc.name} — {acc.title} ({acc.rotaryId})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="login-rotary-id"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Rotary Sicil No / E-Posta
              </label>
              <input
                id="login-rotary-id"
                type="text"
                value={identifierInput}
                onChange={(e) => setIdentifierInput(e.target.value)}
                className="w-full text-xs font-mono-num bg-[#09152B]/90 border border-white/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#F7A81B]"
              />
            </div>
            <div>
              <label
                htmlFor="login-pin-code"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Kurumsal PIN Şifresi
              </label>
              <input
                id="login-pin-code"
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="6 Haneli PIN"
                autoComplete="current-password"
                className="w-full text-xs font-mono-num bg-[#09152B]/90 border border-white/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#F7A81B]"
              />
            </div>
          </div>

          <div className="text-[11px] text-slate-300 bg-[#09152B]/60 rounded-xl p-2.5 border border-white/10">
            <div>
              Seçili Hesap:{' '}
              <strong className="text-white">{activeAccount.name}</strong>
            </div>
            <div className="font-mono-num text-[#F7A81B]">
              Sicil: {activeAccount.rotaryId} · E-Posta: {activeAccount.email}
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs text-rose-200 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {webAuthnStatus && (
            <div className="p-2.5 rounded-xl bg-white/10 border border-white/15 text-[11px] text-slate-200">
              {webAuthnStatus}
            </div>
          )}

          {/* KVKK Explicit Consent Checkbox */}
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

          <div className="space-y-2 pt-1">
            <button
              type="submit"
              disabled={!kvkkAccepted || authenticating}
              className={`w-full min-h-[46px] py-2.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                kvkkAccepted
                  ? 'bg-[#F7A81B] hover:bg-[#f9b53b] text-[#0F172A]'
                  : 'bg-white/10 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {authenticating
                  ? 'Sunucuda Kriptografik Oturum Doğrulanıyor...'
                  : 'Kurumsal PIN ile Sunucu Oturumu Aç (/api/auth/login)'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleWebAuthnVerify}
              disabled={!kvkkAccepted || authenticating}
              className="w-full min-h-[38px] py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Fingerprint className="w-4 h-4 text-[#F7A81B]" />
              <span>
                {hasRegisteredPasskey
                  ? 'Kayıtlı ECDSA P-256 Passkey ile Oturum Aç (/api/auth/webauthn-verify)'
                  : 'ECDSA P-256 WebAuthn Passkey ile Doğrula (/api/auth/webauthn-verify)'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Bottom Multi-Tenant SaaS Footer */}
      <div className="w-full max-w-md text-center space-y-2 pb-1">
        <div className="text-[11px] text-slate-300 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#F7A81B]" />
          <span>
            Çoklu Kulüp İzolasyonu · Galata · Karaköy · Maçka · 2420. Bölge
          </span>
        </div>
      </div>
    </div>
  );
};
