import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
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

function base64UrlToBytes(b64url: string): ArrayBuffer {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binStr = atob(padded + '='.repeat(padLen));
  const out = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    out[i] = binStr.charCodeAt(i);
  }
  return out.buffer;
}

/**
 * Hardware-Only W3C WebAuthn Passkey Enrollment (#12, #22, #76).
 * Strictly requires genuine platform/hardware authenticator (`window.PublicKeyCredential` and `navigator.credentials.create`)
 * and sends the full CBOR `attestationObject` for server-side Attested Credential Data (AT=0x40, AAGUID, COSE_Key P-256) verification.
 * Zero software WebCrypto fallback or client-synthesized authenticatorData flags in production!
 */
async function enrollHardwareWebAuthnPasskey(
  bearerToken: string
): Promise<{ ok: true; credentialId: string } | { ok: false; message: string }> {
  if (
    typeof window === 'undefined' ||
    typeof window.PublicKeyCredential === 'undefined' ||
    !navigator.credentials ||
    typeof navigator.credentials.create !== 'function'
  ) {
    return {
      ok: false,
      message:
        'Bu tarayıcı veya ortam donanım tabanlı W3C WebAuthn (Face ID / Touch ID / Windows Hello) açık anahtar kaydını desteklemiyor.',
    };
  }

  if (!window.isSecureContext) {
    return {
      ok: false,
      message:
        'Donanım WebAuthn Passkey kaydı yalnızca güvenilir HTTPS origin (https://) üzerinde gerçekleştirilebilir (#22).',
    };
  }

  const optionsRes = await fetch('/api/auth/webauthn-register-options', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
  });
  if (!optionsRes.ok) {
    return {
      ok: false,
      message: 'WebAuthn kayıt seçenekleri sunucudan alınamadı.',
    };
  }
  const optionsData = await optionsRes.json();

  const createdCred = (await navigator.credentials.create({
    publicKey: {
      challenge: base64UrlToBytes(optionsData.challenge),
      rp: optionsData.rp,
      user: {
        id: base64UrlToBytes(optionsData.user.id),
        name: optionsData.user.name,
        displayName: optionsData.user.displayName,
      },
      pubKeyCredParams: optionsData.pubKeyCredParams,
      authenticatorSelection: optionsData.authenticatorSelection || {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      excludeCredentials: Array.isArray(optionsData.excludeCredentials)
        ? optionsData.excludeCredentials.map(
            (c: { id: string; type: PublicKeyCredentialType }) => ({
              id: base64UrlToBytes(c.id),
              type: c.type,
            })
          )
        : undefined,
      timeout: optionsData.timeout || 60000,
      attestation: optionsData.attestation || 'direct',
    },
  })) as PublicKeyCredential | null;

  if (!createdCred || !createdCred.response) {
    return {
      ok: false,
      message: 'Donanım doğrulayıcı (Authenticator) yanıt döndürmedi.',
    };
  }

  const attestationRes =
    createdCred.response as AuthenticatorAttestationResponse & {
      getPublicKey?: () => ArrayBuffer | null;
      getAuthenticatorData?: () => ArrayBuffer;
    };

  if (
    !attestationRes.attestationObject ||
    attestationRes.attestationObject.byteLength < 55
  ) {
    return {
      ok: false,
      message:
        'Cihaz doğrulayıcısı geçerli bir W3C CBOR attestationObject döndürmedi.',
    };
  }

  const spkiBuf =
    typeof attestationRes.getPublicKey === 'function'
      ? attestationRes.getPublicKey()
      : null;
  const authDataBuf =
    typeof attestationRes.getAuthenticatorData === 'function'
      ? attestationRes.getAuthenticatorData()
      : null;

  const credentialId = bytesToBase64Url(new Uint8Array(createdCred.rawId));
  const clientDataJSON = bytesToBase64Url(
    new Uint8Array(attestationRes.clientDataJSON)
  );
  const attestationObject = bytesToBase64Url(
    new Uint8Array(attestationRes.attestationObject)
  );
  const authenticatorData = authDataBuf
    ? bytesToBase64Url(new Uint8Array(authDataBuf))
    : undefined;
  const publicKeySpkiB64 = spkiBuf
    ? bytesToBase64Url(new Uint8Array(spkiBuf))
    : undefined;

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
      attestationObject,
      authenticatorData,
      publicKeySpkiB64,
      authenticatorAttachment: createdCred.authenticatorAttachment || 'platform',
    }),
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData.ok) {
    return {
      ok: false,
      message:
        verifyData?.message || 'Donanım Passkey sunucu doğrulaması başarısız oldu.',
    };
  }

  return { ok: true, credentialId };
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

  // One-Time Initial Admin Activation State with Ownership Verification (#22, #76)
  const [bootstrapRequired, setBootstrapRequired] = useState<boolean>(false);
  const [bootstrapTokenInput, setBootstrapTokenInput] = useState<string>('');
  const [newAdminPinInput, setNewAdminPinInput] = useState<string>('');

  useEffect(() => {
    const preset =
      PILOT_ACCOUNT_PROFILES.find((a) => a.role === activeRole) ||
      PILOT_ACCOUNT_PROFILES[0];
    setSelectedRole(activeRole);
    setIdentifierInput(preset.rotaryId);
    setErrorMessage(null);

    if (isOpen) {
      fetch('/api/auth/bootstrap-status')
        .then((r) => (r.ok ? r.json() : null))
        .then((status) => {
          if (status && typeof status.bootstrapClaimRequired === 'boolean') {
            setBootstrapRequired(status.bootstrapClaimRequired);
          }
        })
        .catch(() => {});
    }
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
   * One-Time First-Admin Claim Handler with Ownership Verification (POST /api/auth/bootstrap-claim) (#22, #76)
   */
  const handleBootstrapClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authenticating || !kvkkAccepted) return;
    if (!bootstrapTokenInput.trim()) {
      setErrorMessage(
        'Lütfen tek kullanımlık sunucu sahiplik doğrulama anahtarını (bootstrapToken) girin.'
      );
      return;
    }
    if (!newAdminPinInput.trim()) {
      setErrorMessage(
        'Lütfen Dönem Başkanı (TR-2420-74105) için en az 6 karakterli güçlü bir kurumsal parola/PIN belirleyin.'
      );
      return;
    }
    setAuthenticating(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/bootstrap-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bootstrapToken: bootstrapTokenInput.trim(),
          rotaryId: 'TR-2420-74105',
          email: 'baskan@galatarotary.org',
          newAdminPin: newAdminPinInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.token) {
        setErrorMessage(
          data?.message || 'İlk yönetici aktivasyonu tamamlanamadı.'
        );
        setAuthenticating(false);
        return;
      }

      setBootstrapRequired(false);
      setAuthenticating(false);
      onUnlock(data.user.role as ClubRole, data.token, data.user.rotaryId);
    } catch {
      setErrorMessage('Sunucu kurulum servisine ulaşılamadı.');
      setAuthenticating(false);
    }
  };

  /**
   * Real Server Authentication via POST /api/auth/login (#22, #23)
   */
  const handleServerAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authenticating || !kvkkAccepted) return;
    if (!pinInput.trim()) {
      setErrorMessage(
        'Lütfen kurumsal PIN şifrenizi girin veya donanım WebAuthn Passkey ile doğrulama yapın.'
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
   * Strict Hardware-Only W3C WebAuthn Passkey Enrollment & Assertion (`navigator.credentials.create` / `navigator.credentials.get`) (#12, #22, #76)
   * Enforces trusted HTTPS SecureContext and never falls back to software keypairs!
   */
  const handleWebAuthnVerify = async () => {
    if (!kvkkAccepted || authenticating) return;
    setErrorMessage(null);

    if (
      typeof window === 'undefined' ||
      !window.isSecureContext ||
      typeof window.PublicKeyCredential === 'undefined' ||
      !navigator.credentials ||
      typeof navigator.credentials.get !== 'function'
    ) {
      setErrorMessage(
        'Gerçek cihaz doğrulaması ve güvenilir HTTPS origin zorunludur (#22): Bu tarayıcıda donanım W3C WebAuthn (iPhone Face ID / Touch ID / FIDO2) bulunamadı.'
      );
      return;
    }

    setAuthenticating(true);
    setWebAuthnStatus(
      '1/2 · Sunucudan tek kullanımlık donanım WebAuthn challenge alınıyor...'
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
        setWebAuthnStatus(null);
        return;
      }

      if (
        !Array.isArray(challengeData.allowCredentials) ||
        challengeData.allowCredentials.length === 0
      ) {
        if (pinInput.trim()) {
          setWebAuthnStatus(
            '1/2 · Kurumsal PIN doğrulanıyor ve iPhone / Donanım Passkey kaydı başlatılıyor...'
          );
          const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identifier: identifierInput.trim(),
              pinCode: pinInput.trim(),
              clubId: 'club-galata',
            }),
          });
          const loginData = await loginRes.json();
          if (!loginRes.ok || !loginData.ok || !loginData.token) {
            setErrorMessage(
              loginData?.message ||
                'İlk Passkey cihaz kaydı için Kurumsal PIN doğrulaması başarısız oldu.'
            );
            setAuthenticating(false);
            setWebAuthnStatus(null);
            return;
          }
          const enrollResult = await enrollHardwareWebAuthnPasskey(
            loginData.token
          );
          if (!enrollResult.ok) {
            setErrorMessage(enrollResult.message);
            setAuthenticating(false);
            setWebAuthnStatus(null);
            return;
          }
          setAuthenticating(false);
          setWebAuthnStatus(null);
          onUnlock(
            loginData.user.role as ClubRole,
            loginData.token,
            loginData.user.rotaryId
          );
          return;
        } else {
          setErrorMessage(
            'Bu hesap için sunucuda kayıtlı donanım WebAuthn Passkey bulunamadı. Cihazınızı kaydetmek için Kurumsal PIN alanını doldurup tekrar bu butona dokunun.'
          );
          setAuthenticating(false);
          setWebAuthnStatus(null);
          return;
        }
      }

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: base64UrlToBytes(challengeData.challenge),
          rpId: challengeData.rpId,
          allowCredentials: challengeData.allowCredentials.map(
            (c: { id: string; type: PublicKeyCredentialType }) => ({
              type: c.type,
              id: base64UrlToBytes(c.id),
            })
          ),
          userVerification: 'required',
          timeout: 30000,
        },
      })) as PublicKeyCredential | null;

      if (!assertion || !assertion.response) {
        setErrorMessage(
          'Donanım doğrulaması tamamlanamadı. Yazılımsal anahtar yedeklemesi güvenlik politikası gereği devre dışıdır.'
        );
        setAuthenticating(false);
        setWebAuthnStatus(null);
        return;
      }

      const assertionRes = assertion.response as AuthenticatorAssertionResponse;
      const credentialId = bytesToBase64Url(new Uint8Array(assertion.rawId));
      const clientDataJSON = bytesToBase64Url(
        new Uint8Array(assertionRes.clientDataJSON)
      );
      const authenticatorData = bytesToBase64Url(
        new Uint8Array(assertionRes.authenticatorData)
      );
      const signature = bytesToBase64Url(
        new Uint8Array(assertionRes.signature)
      );

      setWebAuthnStatus(
        `2/2 · Donanım WebAuthn P-256 İmzası ve Challenge #${String(
          challengeData.challengeId
        ).slice(0, 8)} sunucuda doğrulanıyor...`
      );

      const verifyRes = await fetch('/api/auth/webauthn-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeData.challengeId,
          credentialId,
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
        setWebAuthnStatus(null);
        return;
      }

      setAuthenticating(false);
      setWebAuthnStatus(null);
      onUnlock(
        verifyData.user.role as ClubRole,
        verifyData.token,
        verifyData.user.rotaryId
      );
    } catch {
      setErrorMessage(
        'Gerçek cihaz doğrulaması (Face ID / Touch ID / Güvenlik Anahtarı) iptal edildi veya başarısız oldu. Yazılımsal alternatif güvenlik gereği kapalıdır.'
      );
      setAuthenticating(false);
      setWebAuthnStatus(null);
    }
  };

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
          UR 2420 · RotaClub v5.3 Hardened
        </span>
        <div className="flex items-center gap-1.5 text-[#F7A81B]">
          <Lock className="w-3.5 h-3.5" />
          <span>HMAC-SHA256 + Donanım WebAuthn P-256</span>
        </div>
      </div>

      {/* Center Brand & Real Server Login / First-Run Activation Form */}
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
            Gerçek Sunucu Oturumu (CSPRNG Scrypt + Donanım W3C WebAuthn + HMAC-SHA256)
          </p>
        </div>

        {bootstrapRequired ? (
          <form
            onSubmit={handleBootstrapClaim}
            className="p-5 rounded-3xl bg-white/10 border border-[#F7A81B]/50 backdrop-blur-md space-y-3.5 text-left"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-[#F7A81B]">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Tek Kullanımlık İlk Yönetici Aktivasyonu (Sahiplik Doğrulamalı)</span>
            </div>
            <p className="text-[11px] text-slate-200 leading-relaxed">
              Dönem Başkanı (<strong>Rtn. Mimar Emre Karaca · TR-2420-74105</strong>) hesabını etkinleştirmek için tek kullanımlık sunucu sahiplik doğrulama anahtarını (<code>bootstrapToken</code>) ve yeni kurumsal parola/PIN değerinizi girin. Bu adım tamamlandığında kurulum uç noktası ve sahiplik anahtarı kalıcı olarak imha edilir.
            </p>

            <div className="space-y-2.5">
              <div>
                <label
                  htmlFor="bootstrap-ownership-token"
                  className="block text-[11px] font-semibold text-[#F7A81B] mb-1"
                >
                  Tek Kullanımlık Sunucu Sahiplik Anahtarı (bootstrapToken · Zorunlu)
                </label>
                <input
                  id="bootstrap-ownership-token"
                  type="password"
                  value={bootstrapTokenInput}
                  onChange={(e) => setBootstrapTokenInput(e.target.value)}
                  placeholder="RC2420-..."
                  className="w-full text-xs font-mono-num bg-[#09152B]/90 border border-white/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#F7A81B]"
                />
              </div>

              <div>
                <label
                  htmlFor="bootstrap-admin-pin"
                  className="block text-[11px] font-semibold text-slate-200 mb-1"
                >
                  Dönem Başkanı Yeni Parola / PIN (Zorunlu)
                </label>
                <input
                  id="bootstrap-admin-pin"
                  type="password"
                  value={newAdminPinInput}
                  onChange={(e) => setNewAdminPinInput(e.target.value)}
                  placeholder="Örn: GalataBsk#2026"
                  className="w-full text-xs font-mono-num bg-[#09152B]/90 border border-white/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#F7A81B]"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/30 text-[10px] text-amber-100/90 leading-relaxed">
                Güvenlik gereği (#76) ilk kurulum anahtarı yalnızca kurucu Dönem Başkanı hesabını etkinleştirir. Diğer yönetim kurulu üyeleri ve kulüp üyeleri kendi e-posta/Rotary kimliklerine gönderilen tek kullanımlık davet anahtarıyla bireysel parolalarını belirler.
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

            <button
              type="submit"
              disabled={!kvkkAccepted || authenticating}
              className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 bg-[#F7A81B] hover:bg-[#f9b53b] text-[#0F172A] cursor-pointer shadow-lg"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {authenticating
                  ? 'Sahiplik Doğrulanıyor ve Hesap Etkinleştiriliyor...'
                  : 'Sahipliği Doğrula ve İlk Yönetici Hesabını Etkinleştir'}
              </span>
            </button>
          </form>
        ) : (
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
                  Kurumsal PIN / Parola
                </label>
                <input
                  id="login-pin-code"
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Kurumsal PIN"
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
                  Donanım W3C WebAuthn Passkey ile Doğrula (/api/auth/webauthn-verify)
                </span>
              </button>
            </div>
          </form>
        )}
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
