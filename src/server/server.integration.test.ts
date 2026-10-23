import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';
import { createPilotExpressApp } from '../../server';
import {
  APPLE_WEBAUTHN_ROOT_CA_PEM,
  encodeCborAttestationObject,
  encodeCborCoseEc2P256Key,
  extractP256CoordinatesFromSpkiDer,
  loadTrustedWebAuthnRootCerts,
} from './pilotEngine';

function asn1Len(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len <= 0xff) return Buffer.from([0x81, len]);
  const b = Buffer.alloc(3);
  b[0] = 0x82;
  b.writeUInt16BE(len, 1);
  return b;
}

function asn1Tag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), asn1Len(content.length), content]);
}

function asn1Seq(items: Buffer[]): Buffer {
  return asn1Tag(0x30, Buffer.concat(items));
}

function asn1NameCn(cn: string): Buffer {
  const oidCn = Buffer.from('0603550403', 'hex');
  const utf8Cn = asn1Tag(0x0c, Buffer.from(cn, 'utf8'));
  return asn1Seq([asn1Tag(0x31, asn1Seq([oidCn, utf8Cn]))]);
}

function buildX509v3CertificateDer(params: {
  subjectCn: string;
  issuerCn: string;
  subjectPublicKeySpkiDer: Buffer;
  issuerPrivateKey: crypto.KeyObject;
  isCa: boolean;
  fidoAaguidHex?: string;
  appleNonce?: Buffer;
}): { der: Buffer; pem: string } {
  const version = asn1Tag(0xa0, Buffer.from('020102', 'hex'));
  const serial = asn1Tag(0x02, Buffer.concat([Buffer.from([0x01]), crypto.randomBytes(7)]));
  const sigAlg = Buffer.from('300a06082a8648ce3d040302', 'hex'); // ecdsa-with-SHA256
  const issuer = asn1NameCn(params.issuerCn);
  const validity = asn1Seq([
    asn1Tag(0x17, Buffer.from('240101000000Z', 'ascii')),
    asn1Tag(0x17, Buffer.from('350101000000Z', 'ascii')),
  ]);
  const subject = asn1NameCn(params.subjectCn);

  const basicConstraintsOid = Buffer.from('0603551d13', 'hex');
  const basicConstraintsCritical = Buffer.from('0101ff', 'hex');
  const basicConstraintsVal = params.isCa
    ? asn1Tag(0x04, Buffer.from('30030101ff', 'hex'))
    : asn1Tag(0x04, Buffer.from('3000', 'hex'));
  const exts: Buffer[] = [
    asn1Seq([basicConstraintsOid, basicConstraintsCritical, basicConstraintsVal]),
  ];

  if (params.fidoAaguidHex) {
    const aaguidBytes = Buffer.from(
      params.fidoAaguidHex.replace(/-/g, ''),
      'hex'
    );
    const fidoOid = Buffer.from('060b2b0601040182e51c010104', 'hex');
    const fidoVal = asn1Tag(0x04, asn1Tag(0x04, aaguidBytes));
    exts.push(asn1Seq([fidoOid, fidoVal]));
  }

  if (params.appleNonce) {
    const appleOid = Buffer.from('06092a864886f763640802', 'hex');
    const appleInner = asn1Seq([asn1Tag(0xa1, asn1Tag(0x04, params.appleNonce))]);
    exts.push(asn1Seq([appleOid, asn1Tag(0x04, appleInner)]));
  }

  const extensionsWrapper = asn1Tag(0xa3, asn1Seq(exts));
  const tbs = asn1Seq([
    version,
    serial,
    sigAlg,
    issuer,
    validity,
    subject,
    params.subjectPublicKeySpkiDer,
    extensionsWrapper,
  ]);

  const sigDer = crypto.sign('sha256', tbs, params.issuerPrivateKey);
  const bitStringSig = asn1Tag(
    0x03,
    Buffer.concat([Buffer.from([0x00]), sigDer])
  );
  const certDer = asn1Seq([tbs, sigAlg, bitStringSig]);
  const b64 = certDer.toString('base64');
  const lines = b64.match(/.{1,64}/g) || [b64];
  const pem = `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
  return { der: certDer, pem };
}

function createHardwareTestRootCa(cn = 'RotaClub Test Hardware FIDO2 Root CA') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const cert = buildX509v3CertificateDer({
    subjectCn: cn,
    issuerCn: cn,
    subjectPublicKeySpkiDer: spkiDer,
    issuerPrivateKey: privateKey,
    isCa: true,
  });
  return { publicKey, privateKey, spkiDer, der: cert.der, pem: cert.pem, cn };
}

const TRUSTED_TEST_ROOT_CA = createHardwareTestRootCa(
  'Trusted FIDO2 & Apple Hardware Attestation Root CA'
);

function buildTestWebAuthnRegistrationPayload(params: {
  rpId: string;
  challenge: string;
  origin: string;
  credentialIdB64Url: string;
  publicKeySpkiDer: Buffer;
  privateKey: crypto.KeyObject;
  aaguidHex?: string;
  signCount?: number;
  flags?: number;
  fmt?: 'packed' | 'apple' | 'none';
  rootCa?: ReturnType<typeof createHardwareTestRootCa>;
  certAaguidHex?: string;
  omitX5c?: boolean;
  selfSignedLeaf?: boolean;
}) {
  const clientDataBytes = Buffer.from(
    JSON.stringify({
      type: 'webauthn.create',
      challenge: params.challenge,
      origin: params.origin,
      crossOrigin: false,
    }),
    'utf8'
  );
  const clientDataJSON = clientDataBytes.toString('base64url');
  const clientDataHash = crypto
    .createHash('sha256')
    .update(clientDataBytes)
    .digest();

  const rpIdHash = crypto
    .createHash('sha256')
    .update(params.rpId, 'utf8')
    .digest();

  const effectiveAaguidHex =
    params.aaguidHex || 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd';
  const aaguidBuf = Buffer.from(effectiveAaguidHex.replace(/-/g, ''), 'hex');

  const credIdBuf = Buffer.from(params.credentialIdB64Url, 'base64url');
  const credIdLenBuf = Buffer.alloc(2);
  credIdLenBuf.writeUInt16BE(credIdBuf.length, 0);

  const { x, y } = extractP256CoordinatesFromSpkiDer(params.publicKeySpkiDer);
  const coseKeyBuf = encodeCborCoseEc2P256Key(x, y);

  const headerBuf = Buffer.alloc(37);
  rpIdHash.copy(headerBuf, 0);
  headerBuf[32] = typeof params.flags === 'number' ? params.flags : 0x5d;
  headerBuf.writeUInt32BE(params.signCount ?? 0, 33);

  const authData = Buffer.concat([
    headerBuf,
    aaguidBuf,
    credIdLenBuf,
    credIdBuf,
    coseKeyBuf,
  ]);

  const fmt = params.fmt || 'packed';
  const signedBytes = Buffer.concat([authData, clientDataHash]);
  const ca = params.rootCa || TRUSTED_TEST_ROOT_CA;

  let sig: Buffer | undefined;
  let x5c: Buffer[] | undefined;

  if (fmt === 'packed') {
    if (params.omitX5c) {
      // Self-attestation (no x5c)
      sig = crypto.sign('sha256', signedBytes, params.privateKey);
    } else if (params.selfSignedLeaf) {
      const leafKey = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });
      const leafSpki = leafKey.publicKey.export({
        format: 'der',
        type: 'spki',
      }) as Buffer;
      const selfCert = buildX509v3CertificateDer({
        subjectCn: 'Self-Signed Attacker Authenticator',
        issuerCn: 'Self-Signed Attacker Authenticator',
        subjectPublicKeySpkiDer: leafSpki,
        issuerPrivateKey: leafKey.privateKey,
        isCa: false,
        fidoAaguidHex: params.certAaguidHex || effectiveAaguidHex,
      });
      sig = crypto.sign('sha256', signedBytes, leafKey.privateKey);
      x5c = [selfCert.der];
    } else {
      const attKey = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });
      const attSpki = attKey.publicKey.export({
        format: 'der',
        type: 'spki',
      }) as Buffer;
      const leafCert = buildX509v3CertificateDer({
        subjectCn: 'FIDO2 Hardware Authenticator Attestation',
        issuerCn: ca.cn,
        subjectPublicKeySpkiDer: attSpki,
        issuerPrivateKey: ca.privateKey,
        isCa: false,
        fidoAaguidHex: params.certAaguidHex || effectiveAaguidHex,
      });
      sig = crypto.sign('sha256', signedBytes, attKey.privateKey);
      x5c = [leafCert.der, ca.der];
    }
  } else if (fmt === 'apple' && !params.omitX5c) {
    const nonce = crypto.createHash('sha256').update(signedBytes).digest();
    const leafCert = buildX509v3CertificateDer({
      subjectCn: 'Apple iPhone Passkey Anonymous Attestation',
      issuerCn: ca.cn,
      subjectPublicKeySpkiDer: params.publicKeySpkiDer,
      issuerPrivateKey: ca.privateKey,
      isCa: false,
      appleNonce: nonce,
    });
    x5c = [leafCert.der, ca.der];
  }

  const attestationObjectBuf = encodeCborAttestationObject({
    fmt,
    authData,
    alg: fmt === 'packed' ? -7 : undefined,
    sig,
    x5c,
  });

  return {
    credentialId: params.credentialIdB64Url,
    clientDataJSON,
    attestationObject: attestationObjectBuf.toString('base64url'),
    authenticatorData: authData.toString('base64url'),
    publicKeySpkiB64: params.publicKeySpkiDer.toString('base64url'),
    authenticatorAttachment: 'platform' as const,
  };
}

// Configure test environment credentials via environment variables (no hardcoded PINs in production source code)
process.env.ROTACLUB_PIN_UYE = 'GalataUye#2026';
process.env.ROTACLUB_PIN_SEKRETER = 'GalataSek#2026';
process.env.ROTACLUB_PIN_SAYMAN = 'GalataSay#2026';
process.env.ROTACLUB_PIN_BASKAN = 'GalataBsk#2026';
process.env.ROTACLUB_PIN_KARAKOY_BASKAN = 'KarakoyBsk#2026';
process.env.ROTACLUB_PIN_MACKA_BASKAN = 'MackaBsk#2026';
process.env.ROTACLUB_PIN_DISTRICT_GOV = 'DistrictGov#2420';

const TEST_PINS = {
  uye: process.env.ROTACLUB_PIN_UYE,
  sekreter: process.env.ROTACLUB_PIN_SEKRETER,
  sayman: process.env.ROTACLUB_PIN_SAYMAN,
  baskan: process.env.ROTACLUB_PIN_BASKAN,
  karakoyBaskan: process.env.ROTACLUB_PIN_KARAKOY_BASKAN,
  mackaBaskan: process.env.ROTACLUB_PIN_MACKA_BASKAN,
  districtGov: process.env.ROTACLUB_PIN_DISTRICT_GOV,
};

async function withTestServer(
  fn: (baseUrl: string, tmpDbFile: string) => Promise<void>
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotaclub-test-'));
  const tmpDbFile = path.join(tmpDir, 'test_db.json');
  const { app } = createPilotExpressApp(tmpDbFile, {
    trustedWebAuthnRootPems: [TRUSTED_TEST_ROOT_CA.pem],
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn(baseUrl, tmpDbFile);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function loginRole(
  baseUrl: string,
  identifier: string,
  pinCode: string,
  clubId = 'club-galata'
) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, pinCode, clubId }),
  });
  assert.equal(res.status, 200, `Login failed for ${identifier}`);
  return (await res.json()) as {
    ok: boolean;
    token: string;
    user: {
      role: string;
      rotaryId: string;
      memberId: string;
      clubId: string;
      jti: string;
    };
  };
}

test('Issue #76 / #12 / #20: Unauthenticated GET /api/pilot/state, URL ?token= query parameter, and unauthenticated token-minting backdoors are blocked', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/pilot/state`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'AUTH_REQUIRED');

    // Unauthenticated pilot-role-session endpoint must not exist (#12, #22)
    const backdoorRes = await fetch(`${baseUrl}/api/auth/pilot-role-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'baskan', clubId: 'club-galata' }),
    });
    assert.equal(backdoorRes.status, 404);

    // URL query token must be rejected (#20)
    const baskanSession = await loginRole(
      baseUrl,
      'TR-2420-74105',
      TEST_PINS.baskan
    );
    const queryTokenRes = await fetch(
      `${baseUrl}/api/pilot/backup?token=${encodeURIComponent(
        baskanSession.token
      )}`
    );
    assert.equal(queryTokenRes.status, 401);
    const queryTokenBody = await queryTokenRes.json();
    assert.equal(queryTokenBody.error, 'QUERY_TOKEN_FORBIDDEN');
  });
});

test('Issue #76 / #22 / #23: Zero hardcoded PINs in source, weak PIN rejection, secure member account creation, header spoofing block, and session revocation', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. Source code audit: pilotEngine.ts must NOT contain hardcoded precomputedSalt or precomputedHash literals (#22)
    const engineSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/server/pilotEngine.ts'),
      'utf8'
    );
    assert.equal(engineSource.includes('precomputedSalt'), false);
    assert.equal(engineSource.includes('precomputedHash'), false);

    // 2. /api/auth/pilot-accounts must NOT expose plaintext PINs, salts, or passwordHash (#22)
    const accountsRes = await fetch(`${baseUrl}/api/auth/pilot-accounts`);
    const accountsBody = await accountsRes.json();
    for (const acc of accountsBody.accounts) {
      assert.equal('demoPinHint' in acc, false);
      assert.equal('pinCode' in acc, false);
      assert.equal('passwordHash' in acc, false);
      assert.equal('passwordSalt' in acc, false);
    }

    // 3. Authenticate as regular 'uye' and attempt to spoof x-rotaclub-role: baskan
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', TEST_PINS.uye);
    assert.equal(uyeSession.user.role, 'uye');

    const spoofRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: {
        Authorization: `Bearer ${uyeSession.token}`,
        'x-rotaclub-role': 'baskan',
      },
    });
    assert.equal(spoofRes.status, 403);
    const spoofBody = await spoofRes.json();
    assert.equal(spoofBody.error, 'ROLE_SPOOFING_DETECTED');

    // 4. Weak/repeating PINs (e.g. '11111111' or '123456') are rejected on PIN change (#22)
    const weakPinRes = await fetch(`${baseUrl}/api/auth/change-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeSession.token}`,
      },
      body: JSON.stringify({
        currentPin: TEST_PINS.uye,
        newPin: '11111111',
      }),
    });
    assert.equal(weakPinRes.status, 400);
    const weakPinBody = await weakPinRes.json();
    assert.equal(weakPinBody.error, 'WEAK_PIN_REJECTED');

    // 5. Strong credential rotation succeeds, old credential fails, new credential succeeds
    const changePinRes = await fetch(`${baseUrl}/api/auth/change-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeSession.token}`,
      },
      body: JSON.stringify({
        currentPin: TEST_PINS.uye,
        newPin: 'RifatStrong#2026!',
      }),
    });
    assert.equal(changePinRes.status, 200);

    const oldPinLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'TR-2420-88412',
        pinCode: TEST_PINS.uye,
      }),
    });
    assert.equal(oldPinLogin.status, 401);

    const newPinSession = await loginRole(
      baseUrl,
      'TR-2420-88412',
      'RifatStrong#2026!'
    );
    assert.equal(newPinSession.ok, true);

    // 6. Secure member account registration (/api/auth/register-member-account):
    // Regular member cannot register new accounts (403), Başkan can register a new member with strong credential
    const forbiddenRegRes = await fetch(
      `${baseUrl}/api/auth/register-member-account`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newPinSession.token}`,
        },
        body: JSON.stringify({
          memberId: 'm-new-1',
          rotaryId: 'TR-2420-95001',
          fullName: 'Rtn. Canan Ersoy',
          email: 'canan.ersoy@galatarotary.org',
          role: 'uye',
          clubId: 'club-galata',
          initialPinOrPassword: 'CananStrong#2026',
        }),
      }
    );
    assert.equal(forbiddenRegRes.status, 403);

    const baskanSession = await loginRole(
      baseUrl,
      'TR-2420-74105',
      TEST_PINS.baskan
    );
    const createdAccRes = await fetch(
      `${baseUrl}/api/auth/register-member-account`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${baskanSession.token}`,
        },
        body: JSON.stringify({
          memberId: 'm-new-1',
          rotaryId: 'TR-2420-95001',
          fullName: 'Rtn. Canan Ersoy',
          email: 'canan.ersoy@galatarotary.org',
          role: 'uye',
          clubId: 'club-galata',
          initialPinOrPassword: 'CananStrong#2026',
        }),
      }
    );
    assert.equal(createdAccRes.status, 201);

    const newMemberSession = await loginRole(
      baseUrl,
      'TR-2420-95001',
      'CananStrong#2026',
      'club-galata'
    );
    assert.equal(newMemberSession.user.role, 'uye');

    // 7. Logout revokes session token immediately
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${newPinSession.token}` },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogoutRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${newPinSession.token}` },
    });
    assert.equal(afterLogoutRes.status, 401);
  });
});

test('Issue #76 / #12 / #22: Authenticated ECDSA P-256 WebAuthn registration, strict origin verification, rpIdHash, monotonic signCount, and replay/forgery rejection', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. Unauthenticated WebAuthn registration attempt MUST be blocked with 401 (#12, #22)
    const unauthRegRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'TR-2420-74105' }),
      }
    );
    assert.equal(unauthRegRes.status, 401);

    // 2. Authenticate as Rifat Akın and register a real ECDSA P-256 passkey
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', TEST_PINS.uye);
    const regOptRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
      }
    );
    assert.equal(regOptRes.status, 200);
    const regOpt = await regOptRes.json();

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const publicKeySpkiDer = publicKey.export({
      type: 'spki',
      format: 'der',
    }) as Buffer;
    const publicKeySpkiB64 = publicKeySpkiDer.toString('base64url');
    const credentialId = crypto.randomBytes(16).toString('base64url');

    // 2b. Attempting registration with a mismatched phishing origin is rejected with 401 WEBAUTHN_ORIGIN_MISMATCH (#22)
    const badOriginClientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: regOpt.challenge,
        origin: 'https://evil-phishing.example.com',
      }),
      'utf8'
    ).toString('base64url');

    const badOriginRegRpIdHash = crypto
      .createHash('sha256')
      .update(regOpt.rp.id, 'utf8')
      .digest();
    const badOriginAuthData = Buffer.alloc(37);
    badOriginRegRpIdHash.copy(badOriginAuthData, 0);
    badOriginAuthData[32] = 0x05;

    const badOriginRegRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: regOpt.challengeId,
          credentialId,
          clientDataJSON: badOriginClientData,
          authenticatorData: badOriginAuthData.toString('base64url'),
          publicKeySpkiB64,
        }),
      }
    );
    assert.equal(badOriginRegRes.status, 401);
    const badOriginRegBody = await badOriginRegRes.json();
    assert.equal(badOriginRegBody.error, 'WEBAUTHN_ORIGIN_MISMATCH');

    // 2c. Attempting software-synthesized registration WITHOUT CBOR attestationObject (only 37-byte authenticatorData) MUST be rejected with 400 ATTESTATION_OBJECT_REQUIRED (#22, #76)
    const regOptSoftRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
      }
    );
    const regOptSoft = await regOptSoftRes.json();
    const softClientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: regOptSoft.challenge,
        origin: baseUrl,
      }),
      'utf8'
    ).toString('base64url');
    const softRpIdHash = crypto
      .createHash('sha256')
      .update(regOptSoft.rpId, 'utf8')
      .digest();
    const bare37ByteAuthData = Buffer.alloc(37);
    softRpIdHash.copy(bare37ByteAuthData, 0);
    bare37ByteAuthData[32] = 0x05; // Missing AT (0x40) and missing Attested Credential Data

    const bareSoftRegRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: regOptSoft.challengeId,
          credentialId,
          clientDataJSON: softClientData,
          authenticatorData: bare37ByteAuthData.toString('base64url'),
          publicKeySpkiB64,
        }),
      }
    );
    assert.equal(bareSoftRegRes.status, 400);
    const bareSoftRegBody = await bareSoftRegRes.json();
    assert.equal(bareSoftRegBody.error, 'ATTESTATION_OBJECT_REQUIRED');

    // 2d. Attempting CBOR attestationObject wrapping a bare 37-byte authData (no AT=0x40 flag / no COSE_Key) MUST be rejected with 401 ATTESTED_CREDENTIAL_DATA_REQUIRED (#22, #76)
    const regOptBareCborRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
      }
    );
    const regOptBareCbor = await regOptBareCborRes.json();
    const bareCborClientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: regOptBareCbor.challenge,
        origin: baseUrl,
      }),
      'utf8'
    ).toString('base64url');
    const fakeAttObj37 = encodeCborAttestationObject({
      fmt: 'none',
      authData: bare37ByteAuthData,
    });
    const bareCborVerifyRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: regOptBareCbor.challengeId,
          credentialId,
          clientDataJSON: bareCborClientData,
          attestationObject: fakeAttObj37.toString('base64url'),
        }),
      }
    );
    assert.equal(bareCborVerifyRes.status, 401);
    const bareCborVerifyBody = await bareCborVerifyRes.json();
    assert.equal(
      bareCborVerifyBody.error,
      'ATTESTED_CREDENTIAL_DATA_REQUIRED'
    );

    // 2e. Attempting CBOR attestationObject with all-zero software AAGUID (00000000-0000-0000-0000-000000000000) MUST be rejected with 401 SOFTWARE_AUTHENTICATOR_REJECTED (#22, #17, #76)
    const regOptZeroAaguidRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
      }
    );
    const regOptZeroAaguid = await regOptZeroAaguidRes.json();
    const zeroAaguidPayload = buildTestWebAuthnRegistrationPayload({
      rpId: regOptZeroAaguid.rpId,
      challenge: regOptZeroAaguid.challenge,
      origin: baseUrl,
      credentialIdB64Url: credentialId,
      publicKeySpkiDer,
      privateKey,
      aaguidHex: '00000000000000000000000000000000',
      fmt: 'none',
    });
    const zeroAaguidVerifyRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: regOptZeroAaguid.challengeId,
          ...zeroAaguidPayload,
        }),
      }
    );
    assert.equal(zeroAaguidVerifyRes.status, 401);
    const zeroAaguidVerifyBody = await zeroAaguidVerifyRes.json();
    assert.equal(
      zeroAaguidVerifyBody.error,
      'SOFTWARE_AUTHENTICATOR_REJECTED'
    );

    // 2f. Negative Test (#22, #17): Unattested (fmt: 'none') payload spoofing Apple's AAGUID (fbfc3007-154e-4ecc-8c0b-6e020557d7bd) MUST be rejected with 401 UNATTESTED_REGISTRATION_REJECTED
    const regOptUnattestedRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
      }
    );
    const regOptUnattested = await regOptUnattestedRes.json();
    const unattestedSpoofPayload = buildTestWebAuthnRegistrationPayload({
      rpId: regOptUnattested.rpId,
      challenge: regOptUnattested.challenge,
      origin: baseUrl,
      credentialIdB64Url: credentialId,
      publicKeySpkiDer,
      privateKey,
      aaguidHex: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      fmt: 'none',
    });
    const unattestedSpoofRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: regOptUnattested.challengeId,
          ...unattestedSpoofPayload,
        }),
      }
    );
    assert.equal(unattestedSpoofRes.status, 401);
    const unattestedSpoofBody = await unattestedSpoofRes.json();
    assert.equal(
      unattestedSpoofBody.error,
      'UNATTESTED_REGISTRATION_REJECTED'
    );

    // 2g. Negative Test (#22, #17): Self-attested (fmt: 'packed' without x5c, signed by software credential key) spoofing Apple's AAGUID MUST be rejected with 401 SELF_ATTESTATION_REJECTED
    const regOptSelfAttRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
      }
    );
    const regOptSelfAtt = await regOptSelfAttRes.json();
    const selfAttSpoofPayload = buildTestWebAuthnRegistrationPayload({
      rpId: regOptSelfAtt.rpId,
      challenge: regOptSelfAtt.challenge,
      origin: baseUrl,
      credentialIdB64Url: credentialId,
      publicKeySpkiDer,
      privateKey,
      aaguidHex: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      fmt: 'packed',
      omitX5c: true,
    });
    const selfAttSpoofRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: regOptSelfAtt.challengeId,
          ...selfAttSpoofPayload,
        }),
      }
    );
    assert.equal(selfAttSpoofRes.status, 401);
    const selfAttSpoofBody = await selfAttSpoofRes.json();
    assert.equal(selfAttSpoofBody.error, 'SELF_ATTESTATION_REJECTED');

    // 2h. Negative Test (#22, #17): Rogue / Untrusted Root CA or Self-Signed x5c certificate chain spoofing hardware AAGUID MUST be rejected with 401 UNTRUSTED_ATTESTATION_ROOT
    const rogueRootCa = createHardwareTestRootCa('Rogue Attacker Root CA');
    const regOptRogueCaRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
      }
    );
    const regOptRogueCa = await regOptRogueCaRes.json();
    const rogueCaPayload = buildTestWebAuthnRegistrationPayload({
      rpId: regOptRogueCa.rpId,
      challenge: regOptRogueCa.challenge,
      origin: baseUrl,
      credentialIdB64Url: credentialId,
      publicKeySpkiDer,
      privateKey,
      aaguidHex: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      fmt: 'packed',
      rootCa: rogueRootCa,
    });
    const rogueCaRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: regOptRogueCa.challengeId,
          ...rogueCaPayload,
        }),
      }
    );
    assert.equal(rogueCaRes.status, 401);
    const rogueCaBody = await rogueCaRes.json();
    assert.equal(rogueCaBody.error, 'UNTRUSTED_ATTESTATION_ROOT');

    // 2i. Negative Test (#22, #17): Valid trusted x5c certificate for AAGUID A, but authData spoofs AAGUID B -> rejected with 401 ATTESTATION_AAGUID_MISMATCH
    const regOptAaguidMismatchRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
      }
    );
    const regOptAaguidMismatch = await regOptAaguidMismatchRes.json();
    const mismatchedAaguidPayload = buildTestWebAuthnRegistrationPayload({
      rpId: regOptAaguidMismatch.rpId,
      challenge: regOptAaguidMismatch.challenge,
      origin: baseUrl,
      credentialIdB64Url: credentialId,
      publicKeySpkiDer,
      privateKey,
      aaguidHex: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      certAaguidHex: 'ee882879-721c-4913-9775-3dfcce97072a',
      fmt: 'packed',
    });
    const mismatchedAaguidRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: regOptAaguidMismatch.challengeId,
          ...mismatchedAaguidPayload,
        }),
      }
    );
    assert.equal(mismatchedAaguidRes.status, 401);
    const mismatchedAaguidBody = await mismatchedAaguidRes.json();
    assert.equal(mismatchedAaguidBody.error, 'ATTESTATION_AAGUID_MISMATCH');

    // 2j. Negative Test (#22, #17): Spoofed Host header on verify OR insecure http:// origin on non-localhost domain MUST be rejected with 401 WEBAUTHN_ORIGIN_MISMATCH
    const regOptHostSpoofRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
          'X-Forwarded-Host': 'galata.rotary2420.org',
          'X-Forwarded-Proto': 'https',
        },
      }
    );
    const regOptHostSpoof = await regOptHostSpoofRes.json();
    assert.equal(regOptHostSpoof.rpId, 'galata.rotary2420.org');
    assert.equal(
      regOptHostSpoof.expectedOrigin,
      'https://galata.rotary2420.org'
    );

    const insecureHttpOriginPayload = buildTestWebAuthnRegistrationPayload({
      rpId: 'galata.rotary2420.org',
      challenge: regOptHostSpoof.challenge,
      origin: 'http://galata.rotary2420.org', // Plain HTTP on non-localhost domain!
      credentialIdB64Url: credentialId,
      publicKeySpkiDer,
      privateKey,
      fmt: 'packed',
    });
    const insecureHttpVerifyRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
          'X-Forwarded-Host': 'galata.rotary2420.org',
        },
        body: JSON.stringify({
          challengeId: regOptHostSpoof.challengeId,
          ...insecureHttpOriginPayload,
        }),
      }
    );
    assert.equal(insecureHttpVerifyRes.status, 401);
    const insecureHttpVerifyBody = await insecureHttpVerifyRes.json();
    assert.equal(insecureHttpVerifyBody.error, 'WEBAUTHN_ORIGIN_MISMATCH');

    // 2k. Positive Test (#22): Genuine W3C CBOR attestationObject + X.509 Hardware PKI Trust Chain (x5c + OID 1.3.6.1.4.1.45724.1.1.4 AAGUID + COSE_Key P-256) succeeds!
    const regOptRes2 = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
      }
    );
    const regOpt2 = await regOptRes2.json();

    const validHwRegPayload = buildTestWebAuthnRegistrationPayload({
      rpId: regOpt2.rpId,
      challenge: regOpt2.challenge,
      origin: baseUrl,
      credentialIdB64Url: credentialId,
      publicKeySpkiDer,
      privateKey,
      aaguidHex: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      fmt: 'packed',
    });

    const regVerifyRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: regOpt2.challengeId,
          ...validHwRegPayload,
        }),
      }
    );
    assert.equal(regVerifyRes.status, 200);

    // 2l. Positive Test (#22): Genuine Apple Anonymous Attestation (fmt: 'apple' with x5c + OID 1.2.840.113635.100.8.2 nonce over HTTPS origin) succeeds on iPhone Safari!
    const iphoneKeyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const iphoneSpkiDer = iphoneKeyPair.publicKey.export({
      format: 'der',
      type: 'spki',
    }) as Buffer;
    const iphoneCredId = crypto.randomBytes(20).toString('base64url');

    const iphoneOptRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-options`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
          'X-Forwarded-Host': 'galata.rotary2420.org',
          'X-Forwarded-Proto': 'https',
        },
      }
    );
    const iphoneOpt = await iphoneOptRes.json();
    const iphoneApplePayload = buildTestWebAuthnRegistrationPayload({
      rpId: 'galata.rotary2420.org',
      challenge: iphoneOpt.challenge,
      origin: 'https://galata.rotary2420.org',
      credentialIdB64Url: iphoneCredId,
      publicKeySpkiDer: iphoneSpkiDer,
      privateKey: iphoneKeyPair.privateKey,
      aaguidHex: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      fmt: 'apple',
    });
    const iphoneVerifyRes = await fetch(
      `${baseUrl}/api/auth/webauthn-register-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uyeSession.token}`,
        },
        body: JSON.stringify({
          challengeId: iphoneOpt.challengeId,
          ...iphoneApplePayload,
        }),
      }
    );
    assert.equal(iphoneVerifyRes.status, 200);
    const iphoneVerifyBody = await iphoneVerifyRes.json();
    assert.equal(iphoneVerifyBody.fmt, 'apple');

    // 3. Request assertion challenge and verify that a forged signature is rejected with 401 INVALID_WEBAUTHN_SIGNATURE
    const challengeRes1 = await fetch(
      `${baseUrl}/api/auth/webauthn-challenge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: 'TR-2420-88412',
          clubId: 'club-galata',
        }),
      }
    );
    const challengeData1 = await challengeRes1.json();

    const clientDataBytes1 = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: challengeData1.challenge,
        origin: baseUrl,
      }),
      'utf8'
    );
    const rpIdHash = crypto
      .createHash('sha256')
      .update(challengeData1.rpId, 'utf8')
      .digest();
    const authDataBuf1 = Buffer.alloc(37);
    rpIdHash.copy(authDataBuf1, 0);
    authDataBuf1[32] = 0x05; // UP + UV
    authDataBuf1.writeUInt32BE(1, 33); // signCount = 1

    const forgedRes = await fetch(`${baseUrl}/api/auth/webauthn-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challengeData1.challengeId,
        credentialId,
        clientDataJSON: clientDataBytes1.toString('base64url'),
        authenticatorData: authDataBuf1.toString('base64url'),
        signature: Buffer.from('forged-signature-bytes', 'utf8').toString(
          'base64url'
        ),
      }),
    });
    assert.equal(forgedRes.status, 401);
    const forgedBody = await forgedRes.json();
    assert.equal(forgedBody.error, 'INVALID_WEBAUTHN_SIGNATURE');

    // 4. Request new challenge and sign with the real ECDSA P-256 private key -> succeeds (200)
    const challengeRes2 = await fetch(
      `${baseUrl}/api/auth/webauthn-challenge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: 'TR-2420-88412',
          clubId: 'club-galata',
        }),
      }
    );
    const challengeData2 = await challengeRes2.json();
    const clientDataBytes2 = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: challengeData2.challenge,
        origin: baseUrl,
      }),
      'utf8'
    );
    const clientDataHash2 = crypto
      .createHash('sha256')
      .update(clientDataBytes2)
      .digest();
    const signedBytes2 = Buffer.concat([authDataBuf1, clientDataHash2]);
    const validSignature2 = crypto
      .sign('sha256', signedBytes2, privateKey)
      .toString('base64url');

    const validVerifyRes = await fetch(`${baseUrl}/api/auth/webauthn-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challengeData2.challengeId,
        credentialId,
        clientDataJSON: clientDataBytes2.toString('base64url'),
        authenticatorData: authDataBuf1.toString('base64url'),
        signature: validSignature2,
      }),
    });
    assert.equal(validVerifyRes.status, 200);
    const validVerifyBody = await validVerifyRes.json();
    assert.equal(validVerifyBody.ok, true);
    assert.equal(validVerifyBody.user.authMethod, 'webauthn');

    // 5. Replaying the same challengeId is rejected with 401 INVALID_OR_EXPIRED_CHALLENGE
    const replayRes = await fetch(`${baseUrl}/api/auth/webauthn-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challengeData2.challengeId,
        credentialId,
        clientDataJSON: clientDataBytes2.toString('base64url'),
        authenticatorData: authDataBuf1.toString('base64url'),
        signature: validSignature2,
      }),
    });
    assert.equal(replayRes.status, 401);

    // 6. Cloned authenticator test: sending a new challenge with non-incremented signCount (1 <= 1) is rejected with 401 CLONED_AUTHENTICATOR_DETECTED
    const challengeRes3 = await fetch(
      `${baseUrl}/api/auth/webauthn-challenge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: 'TR-2420-88412',
          clubId: 'club-galata',
        }),
      }
    );
    const challengeData3 = await challengeRes3.json();
    const clientDataBytes3 = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: challengeData3.challenge,
        origin: baseUrl,
      }),
      'utf8'
    );
    const clientDataHash3 = crypto
      .createHash('sha256')
      .update(clientDataBytes3)
      .digest();
    const signedBytes3 = Buffer.concat([authDataBuf1, clientDataHash3]);
    const validSignature3 = crypto
      .sign('sha256', signedBytes3, privateKey)
      .toString('base64url');

    const clonedRes = await fetch(`${baseUrl}/api/auth/webauthn-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challengeData3.challengeId,
        credentialId,
        clientDataJSON: clientDataBytes3.toString('base64url'),
        authenticatorData: authDataBuf1.toString('base64url'),
        signature: validSignature3,
      }),
    });
    assert.equal(clonedRes.status, 401);
    const clonedBody = await clonedRes.json();
    assert.equal(clonedBody.error, 'CLONED_AUTHENTICATOR_DETECTED');
  });
});

test('Issue #76 / #14 / #16 / #20: KVKK redaction for uye and prevention of redacted state clobbering when sekreter syncs members', async () => {
  await withTestServer(async (baseUrl) => {
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', TEST_PINS.uye);
    const sekreterSession = await loginRole(
      baseUrl,
      'TR-2420-81024',
      TEST_PINS.sekreter
    );
    const saymanSession = await loginRole(
      baseUrl,
      'TR-2420-79310',
      TEST_PINS.sayman
    );

    // Regular member blocked from /api/pilot/backup
    const backupRes = await fetch(`${baseUrl}/api/pilot/backup`, {
      headers: { Authorization: `Bearer ${uyeSession.token}` },
    });
    assert.equal(backupRes.status, 403);

    // Regular member state redacts other members' phone numbers, bloodGroup, and debt balances (#16, #20)
    const stateRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${uyeSession.token}` },
    });
    assert.equal(stateRes.status, 200);
    const stateData = await stateRes.json();
    const otherMember = stateData.members.find(
      (m: { id: string }) => m.id !== 'm-rifat'
    );
    assert.ok(otherMember);
    assert.equal(otherMember.duesBalance, 0);
    assert.equal(otherMember.bloodGroup, 'KVKK Gizli');
    assert.equal(otherMember.phone.includes('***'), true);

    // v5.3 P1 Audit: Verify field-level access control for 'uye' on scholars, boardResolutions, auditLogs, treasuryLedger
    assert.equal(Array.isArray(stateData.auditLogs), true);
    assert.equal(stateData.auditLogs.length, 0);
    assert.equal(stateData.auditLedger.length, 0);
    assert.equal(stateData.treasuryLedger.length, 0);
    assert.equal(stateData.overdueMembers.length, 0);
    assert.equal(stateData.bankStatements.length, 0);

    for (const scholar of stateData.scholars) {
      assert.equal(
        scholar.mentorMember,
        'Burs Komitesi Mentörü (KVKK Korumalı)'
      );
      assert.equal(scholar.statusNote, 'Burs Programı Aktif');
    }
    for (const resItem of stateData.boardResolutions) {
      assert.equal(
        resItem.summary,
        'Yönetim Kurulu Karar Defteri tam metni yalnızca YK üyelerine açıktır.'
      );
      assert.equal(resItem.signedBy, 'Yönetim Kurulu (Yetki Korumalı)');
    }

    // Issue #14 Fix: Sekreter fetches state (where other members' duesBalance is 0) and syncs members back.
    // Server MUST NOT overwrite members' actual duesBalance or unmasked phones with redacted values!
    const sekStateRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${sekreterSession.token}` },
    });
    const sekState = await sekStateRes.json();

    const sekSyncRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sekreterSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: sekState.revision,
        state: {
          members: sekState.members,
        },
      }),
    });
    assert.equal(sekSyncRes.status, 200);

    // Verify with Sayman that Kerem Soylu's real debt balance (9000 TL) was NOT zeroed out by Sekreter's sync!
    const saymanStateRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${saymanSession.token}` },
    });
    const saymanState = await saymanStateRes.json();
    const kerem = saymanState.members.find(
      (m: { fullName: string }) => m.fullName.includes('Kerem Soylu')
    );
    assert.ok(kerem);
    assert.ok(
      kerem.duesBalance > 0,
      'Sekreter sync must not zero out member debt balances!'
    );
  });
});

test('Issue #76 / #14 / #18 / #19: Mandatory expectedRevision (428 if missing, 409 if stale), lossless schema migration with .bak backup, and verified backup restore', async () => {
  await withTestServer(async (baseUrl, tmpDbFile) => {
    const sekreterSession = await loginRole(
      baseUrl,
      'TR-2420-81024',
      TEST_PINS.sekreter
    );
    const baskanSession = await loginRole(
      baseUrl,
      'TR-2420-74105',
      TEST_PINS.baskan
    );

    const forbiddenReset = await fetch(`${baseUrl}/api/pilot/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sekreterSession.token}` },
    });
    assert.equal(forbiddenReset.status, 403);

    // 1. Omitting expectedRevision on POST /api/pilot/sync is rejected with 428 REVISION_REQUIRED (#14)
    const missingRevRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        state: { rsvpStatus: 'excused' },
      }),
    });
    assert.equal(missingRevRes.status, 428);
    const missingRevBody = await missingRevRes.json();
    assert.equal(missingRevBody.error, 'REVISION_REQUIRED');

    const beforeVerifyRes = await fetch(`${baseUrl}/api/pilot/audit-verify`, {
      headers: { Authorization: `Bearer ${baskanSession.token}` },
    });
    const beforeVerify = await beforeVerifyRes.json();
    assert.equal(beforeVerify.valid, true);
    const countBefore = beforeVerify.totalEntries;

    // 2. Sync WITH valid expectedRevision succeeds and increments revision (#14, #18)
    const syncRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: 1,
        state: { rsvpStatus: 'excused' },
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.revision, 2);
    assert.equal(syncBody.auditVerification.totalEntries, countBefore + 1);

    // 3. Stale expectedRevision is rejected with 409 REVISION_CONFLICT (#14)
    const staleSyncRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: 1,
        state: { rsvpStatus: 'attending' },
      }),
    });
    assert.equal(staleSyncRes.status, 409);
    const staleBody = await staleSyncRes.json();
    assert.equal(staleBody.error, 'REVISION_CONFLICT');

    // 4. Export backup, tamper with checksum -> restore fails (422 BACKUP_CHECKSUM_MISMATCH); valid restore succeeds (#19)
    const backupRes = await fetch(`${baseUrl}/api/pilot/backup`, {
      headers: { Authorization: `Bearer ${baskanSession.token}` },
    });
    assert.equal(backupRes.status, 200);
    const backupJson = await backupRes.json();
    assert.ok(backupJson.backupChecksum);

    const tamperedRestoreRes = await fetch(`${baseUrl}/api/pilot/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        backup: {
          ...backupJson,
          backupChecksum: '0000000000000000000000000000000000000000000000000000000000000000',
        },
      }),
    });
    assert.equal(tamperedRestoreRes.status, 422);
    const tamperedBody = await tamperedRestoreRes.json();
    assert.equal(tamperedBody.error, 'BACKUP_CHECKSUM_MISMATCH');

    const validRestoreRes = await fetch(`${baseUrl}/api/pilot/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        backup: backupJson,
      }),
    });
    assert.equal(validRestoreRes.status, 200);

    // 5. Lossless Schema Migration test (#19): simulate an older schemaVersion ('5.1.0-hardened') on disk with custom data
    const rawDisk = JSON.parse(fs.readFileSync(tmpDbFile, 'utf8'));
    rawDisk.schemaVersion = '5.1.0-hardened';
    rawDisk.tenants['club-galata'].guestNameInput = 'Lossless Migration Preserved Guest';
    fs.writeFileSync(tmpDbFile, JSON.stringify(rawDisk, null, 2), 'utf8');

    const { store: migratedStore } = createPilotExpressApp(tmpDbFile);
    const migratedTenant = migratedStore.getTenantState('club-galata');
    assert.equal(
      migratedTenant.guestNameInput,
      'Lossless Migration Preserved Guest'
    );
    const bakPath = `${tmpDbFile}.pre-migration-5.1.0-hardened.bak`;
    assert.equal(fs.existsSync(bakPath), true);
  });
});

test('Issue #76 / #39 / #6: Server-managed accounting ledger blocks direct sync mutations to treasuryLedger/balances (422), blocks reused bankRef (409), and validates expenses & accruals', async () => {
  await withTestServer(async (baseUrl) => {
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', TEST_PINS.uye);
    const saymanSession = await loginRole(
      baseUrl,
      'TR-2420-79310',
      TEST_PINS.sayman
    );

    const initStateRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${saymanSession.token}` },
    });
    const initState = await initStateRes.json();

    // 1. Even Sayman CANNOT directly mutate treasuryLedger via /api/pilot/sync (#39)
    const directLedgerSyncRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${saymanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: initState.revision,
        state: {
          treasuryLedger: [
            {
              id: 'tr-fake-999',
              date: '23 Ekim 2026',
              type: 'Gelir',
              category: 'Aidat & Kuver Tahsilatı',
              title: 'Mutabakatsız Sahte Gelir',
              counterparty: 'Test',
              amount: 50000,
              referenceNo: 'FAKE-REF-999',
            },
          ],
        },
      }),
    });
    assert.equal(directLedgerSyncRes.status, 422);
    const directLedgerBody = await directLedgerSyncRes.json();
    assert.equal(directLedgerBody.error, 'DIRECT_LEDGER_MUTATION_FORBIDDEN');

    // 2. Sayman CANNOT record 'Gelir' (income) via /api/pilot/reconcile-expense — income requires bank reconciliation (#39)
    const fakeIncomeExpenseRes = await fetch(
      `${baseUrl}/api/pilot/reconcile-expense`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${saymanSession.token}`,
        },
        body: JSON.stringify({
          clubId: 'club-galata',
          type: 'Gelir',
          category: 'Aidat & Kuver Tahsilatı',
          title: 'Sahte Gelir Denemesi',
          counterparty: 'Bilinmeyen',
          amount: 10000,
          referenceNo: 'EXP-2026-001',
        }),
      }
    );
    assert.equal(fakeIncomeExpenseRes.status, 422);
    const fakeIncomeBody = await fakeIncomeExpenseRes.json();
    assert.equal(fakeIncomeBody.error, 'INCOME_REQUIRES_BANK_RECONCILIATION');

    // 3. Sayman CAN record a valid club expense via /api/pilot/reconcile-expense, and duplicate referenceNo is blocked with 409 (#39)
    const validExpenseRes = await fetch(
      `${baseUrl}/api/pilot/reconcile-expense`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${saymanSession.token}`,
        },
        body: JSON.stringify({
          clubId: 'club-galata',
          type: 'Gider',
          category: 'Otel & Banket Gideri',
          title: 'Pera Palace Ses Sistemi Faturası',
          counterparty: 'Pera Palace Hotel',
          amount: 8500,
          referenceNo: 'PERA-INV-2026-771',
        }),
      }
    );
    assert.equal(validExpenseRes.status, 200);

    const dupExpenseRes = await fetch(
      `${baseUrl}/api/pilot/reconcile-expense`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${saymanSession.token}`,
        },
        body: JSON.stringify({
          clubId: 'club-galata',
          type: 'Gider',
          category: 'Otel & Banket Gideri',
          title: 'Mükerrer Fatura Kaydı',
          counterparty: 'Pera Palace Hotel',
          amount: 8500,
          referenceNo: '#pera-inv-2026-771',
        }),
      }
    );
    assert.equal(dupExpenseRes.status, 409);
    const dupExpenseBody = await dupExpenseRes.json();
    assert.equal(dupExpenseBody.error, 'DUPLICATE_LEDGER_REFERENCE');

    // 4. Sayman cannot mark a pending payment 'Onaylandı' via /api/pilot/sync bypassing bank reconciliation (#39)
    const currentStateRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${saymanSession.token}` },
    });
    const currentState = await currentStateRes.json();

    const bypassApprovalRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${saymanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: currentState.revision,
        state: {
          paymentNotifications: currentState.paymentNotifications.map(
            (p: { id: string }) =>
              p.id === 'pay-901' ? { ...p, status: 'Onaylandı' } : p
          ),
        },
      }),
    });
    assert.equal(bypassApprovalRes.status, 422);
    const bypassBody = await bypassApprovalRes.json();
    assert.equal(bypassBody.error, 'UNRECONCILED_PAYMENT_APPROVAL_FORBIDDEN');

    // 5. Regular member ('m-rifat') cannot submit a payment claiming another member's receiptRef ('GAR-2026-88341' belonging to Kerem Soylu) (#39)
    const crossMemberRefTheftRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: currentState.revision,
        state: {
          paymentNotifications: [
            ...currentState.paymentNotifications,
            {
              id: 'pay-theft-1',
              memberId: 'm-rifat',
              memberName: 'Rtn. Rifat Akın',
              category: 'Dönem Aidatı',
              amount: 9000,
              description: 'Başkasının Dekontunu Kullanma Denemesi',
              submittedAt: '23 Ekim 2026',
              receiptRef: 'GAR-2026-88341',
              status: 'Bekliyor',
            },
          ],
        },
      }),
    });
    assert.equal(crossMemberRefTheftRes.status, 409);
    const theftBody = await crossMemberRefTheftRes.json();
    assert.equal(theftBody.error, 'DUPLICATE_RECEIPT_REF');

    // 6. Reconciling Kerem Soylu's valid payment (pay-901, GAR-2026-88341, 9000 TL) succeeds
    const validRefRes = await fetch(`${baseUrl}/api/pilot/reconcile-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${saymanSession.token}`,
      },
      body: JSON.stringify({
        paymentId: 'pay-901',
        bankRef: 'GAR-2026-88341',
        clubId: 'club-galata',
      }),
    });
    assert.equal(validRefRes.status, 200);

    // 6b. v5.3 P0 Audit: Attempting to mutate an approved payment record's amount, description, or status is blocked with 422 IMMUTABLE_PAYMENT_RECORD_VIOLATION
    const afterApproveStateRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${saymanSession.token}` },
    });
    const afterApproveState = await afterApproveStateRes.json();

    const mutateApprovedPaymentRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${saymanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: afterApproveState.revision,
        state: {
          paymentNotifications: afterApproveState.paymentNotifications.map(
            (p: { id: string; amount: number }) =>
              p.id === 'pay-901' ? { ...p, amount: 1500 } : p
          ),
        },
      }),
    });
    assert.equal(mutateApprovedPaymentRes.status, 422);
    const mutateApprovedBody = await mutateApprovedPaymentRes.json();
    assert.equal(
      mutateApprovedBody.error,
      'IMMUTABLE_PAYMENT_RECORD_VIOLATION'
    );

    // 6c. v5.3 P0 Audit: Attempting to delete an existing payment record via sync is also blocked with 422 IMMUTABLE_PAYMENT_RECORD_VIOLATION
    const deletePaymentRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${saymanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: afterApproveState.revision,
        state: {
          paymentNotifications: afterApproveState.paymentNotifications.filter(
            (p: { id: string }) => p.id !== 'pay-901'
          ),
        },
      }),
    });
    assert.equal(deletePaymentRes.status, 422);
    const deletePaymentBody = await deletePaymentRes.json();
    assert.equal(deletePaymentBody.error, 'IMMUTABLE_PAYMENT_RECORD_VIOLATION');

    // 6d. v5.3 P0 Audit: Bulk dues accrual is idempotent; repeating the same accrual period/description is rejected with 409 DUPLICATE_ACCRUAL_IDEMPOTENCY
    const firstAccrualRes = await fetch(`${baseUrl}/api/pilot/accrue-dues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${saymanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        amountPerMember: 9000,
        period: '2026-2027 2. Yarıyıl',
        description: '2026-2027 2. Yarıyıl Kulüp Aidatı Tahakkuku',
        idempotencyKey: 'accrual-galata-2026-h2',
      }),
    });
    assert.equal(firstAccrualRes.status, 200);

    const duplicateAccrualRes = await fetch(
      `${baseUrl}/api/pilot/accrue-dues`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${saymanSession.token}`,
        },
        body: JSON.stringify({
          clubId: 'club-galata',
          amountPerMember: 9000,
          period: '2026-2027 2. Yarıyıl',
          description: '2026-2027 2. Yarıyıl Kulüp Aidatı Tahakkuku',
          idempotencyKey: 'accrual-galata-2026-h2',
        }),
      }
    );
    assert.equal(duplicateAccrualRes.status, 409);
    const duplicateAccrualBody = await duplicateAccrualRes.json();
    assert.equal(duplicateAccrualBody.error, 'DUPLICATE_ACCRUAL_IDEMPOTENCY');

    // 7. Member submits a valid project contribution (GAR-2026-99501 for 5000 TL)
    const stateBeforeRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${saymanSession.token}` },
    });
    const stateBefore = await stateBeforeRes.json();
    const targetProject = stateBefore.projects[0];
    const initialCollected = targetProject.collectedAmount;

    const projectPaymentSync = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: stateBefore.revision,
        state: {
          paymentNotifications: [
            ...stateBefore.paymentNotifications,
            {
              id: 'pay-proj-5000',
              memberId: 'm-rifat',
              memberName: 'Rtn. Rifat Akın',
              category: 'Vakıf / Proje Katkı Payı',
              amount: 5000,
              description: `${targetProject.title} Bağışı`,
              submittedAt: '23 Ekim 2026',
              receiptRef: 'GAR-2026-99501',
              status: 'Bekliyor',
              targetProjectId: targetProject.id,
            },
          ],
        },
      }),
    });
    assert.equal(projectPaymentSync.status, 200);

    // 8. Reconcile pay-proj-5000 with GAR-2026-99501 -> collectedAmount increases by 5000
    const reconcileProjRes = await fetch(
      `${baseUrl}/api/pilot/reconcile-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${saymanSession.token}`,
        },
        body: JSON.stringify({
          paymentId: 'pay-proj-5000',
          bankRef: '#GAR-2026-99501',
          clubId: 'club-galata',
        }),
      }
    );
    assert.equal(reconcileProjRes.status, 200);
    const reconcileProjBody = await reconcileProjRes.json();
    assert.equal(
      reconcileProjBody.state.projects[0].collectedAmount,
      initialCollected + 5000
    );

    // 9. Attempting to reuse the already-reconciled GAR-2026-99501 on another 5000 TL payment is blocked with 409 BANK_REF_ALREADY_USED (#39)
    await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        expectedRevision: reconcileProjBody.state.revision,
        state: {
          paymentNotifications: [
            ...reconcileProjBody.state.paymentNotifications,
            {
              id: 'pay-reuse-attempt',
              memberId: 'm-rifat',
              memberName: 'Rtn. Rifat Akın',
              category: 'Vakıf / Proje Katkı Payı',
              amount: 5000,
              description: 'İkinci Ödeme Bildirimi',
              submittedAt: '23 Ekim 2026',
              receiptRef: 'GAR-2026-99999',
              status: 'Bekliyor',
            },
          ],
        },
      }),
    });

    const reuseBankRefRes = await fetch(
      `${baseUrl}/api/pilot/reconcile-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${saymanSession.token}`,
        },
        body: JSON.stringify({
          paymentId: 'pay-reuse-attempt',
          bankRef: 'GAR-2026-99501',
          clubId: 'club-galata',
        }),
      }
    );
    assert.equal(reuseBankRefRes.status, 409);
    const reuseBody = await reuseBankRefRes.json();
    assert.equal(reuseBody.error, 'BANK_REF_ALREADY_USED');
  });
});

test('Issue #76 / #70: Authentic per-club role bindings — Galata President (m-emre) cannot access Karaköy; Karaköy has its own President; District Governor is visiting uye in individual clubs', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. Galata President (m-emre) is baskan ONLY in club-galata and CANNOT log into or switch to club-karakoy (#70)
    const baskanGalata = await loginRole(
      baseUrl,
      'TR-2420-74105',
      TEST_PINS.baskan,
      'club-galata'
    );
    assert.equal(baskanGalata.user.role, 'baskan');

    const emreSwitchKarakoy = await fetch(`${baseUrl}/api/auth/switch-club`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanGalata.token}`,
      },
      body: JSON.stringify({ targetClubId: 'club-karakoy' }),
    });
    assert.equal(emreSwitchKarakoy.status, 403);
    const emreSwitchBody = await emreSwitchKarakoy.json();
    assert.equal(emreSwitchBody.error, 'CLUB_MEMBERSHIP_FORBIDDEN');

    // 2. Cross-tenant GET /api/pilot/state?clubId=club-karakoy with a club-galata token fails with 403 CROSS_TENANT_FORBIDDEN (#70)
    const crossReadRes = await fetch(
      `${baseUrl}/api/pilot/state?clubId=club-karakoy`,
      { headers: { Authorization: `Bearer ${baskanGalata.token}` } }
    );
    assert.equal(crossReadRes.status, 403);
    const crossReadBody = await crossReadRes.json();
    assert.equal(crossReadBody.error, 'CROSS_TENANT_FORBIDDEN');

    // 3. Karaköy Rotary Club's own President (TR-2420-KRK-01) logs into club-karakoy as baskan, but CANNOT switch to club-galata (#70)
    const baskanKarakoy = await loginRole(
      baseUrl,
      'TR-2420-KRK-01',
      TEST_PINS.karakoyBaskan,
      'club-karakoy'
    );
    assert.equal(baskanKarakoy.user.clubId, 'club-karakoy');
    assert.equal(baskanKarakoy.user.role, 'baskan');

    const karakoyToGalataRes = await fetch(`${baseUrl}/api/auth/switch-club`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanKarakoy.token}`,
      },
      body: JSON.stringify({ targetClubId: 'club-galata' }),
    });
    assert.equal(karakoyToGalataRes.status, 403);

    // 4. District 2420 Governor (TR-2420-GOV-01) is baskan in club-district2420, and switches to club-karakoy as visiting 'uye' (NOT baskan!)
    const districtGov = await loginRole(
      baseUrl,
      'TR-2420-GOV-01',
      TEST_PINS.districtGov,
      'club-district2420'
    );
    assert.equal(districtGov.user.role, 'baskan');

    const govSwitchKarakoy = await fetch(`${baseUrl}/api/auth/switch-club`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${districtGov.token}`,
      },
      body: JSON.stringify({ targetClubId: 'club-karakoy' }),
    });
    assert.equal(govSwitchKarakoy.status, 200);
    const govKarakoyData = await govSwitchKarakoy.json();
    assert.equal(govKarakoyData.user.clubId, 'club-karakoy');
    assert.equal(govKarakoyData.user.role, 'uye');

    // Because District Governor is only a visiting 'uye' in club-karakoy, they CANNOT reset Karaköy's operational data (403 RBAC_FORBIDDEN)
    const govResetKarakoy = await fetch(`${baseUrl}/api/pilot/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${govKarakoyData.token}`,
      },
      body: JSON.stringify({ clubId: 'club-karakoy' }),
    });
    assert.equal(govResetKarakoy.status, 403);
  });
});

test('Issue #76 v5.3 Audit: Zero-env one-time initial admin activation flow, hardware-only WebAuthn client enforcement, official Apple Root CA OpenSSL verification, and automatic discovery of v5.2 database files', async () => {
  // 0. Issue #22 & #17: Verify embedded official Apple WebAuthn Root CA certificate parses cleanly in Node crypto.X509Certificate AND OpenSSL x509, self-verifies, and is loaded in trust store without silent fallback
  const appleCert = new crypto.X509Certificate(APPLE_WEBAUTHN_ROOT_CA_PEM);
  assert.equal(appleCert.ca, true, 'Official Apple WebAuthn Root CA must have CA:TRUE');
  assert.equal(
    appleCert.serialNumber,
    '681D016C7A3CE30225A5019428475771',
    'Official Apple WebAuthn Root CA serial number must match 68:1d:01:6c:7a:3c:e3:02:25:a5:01:94:28:47:57:71'
  );
  assert.equal(
    appleCert.subject.includes('CN=Apple WebAuthn Root CA'),
    true,
    'Official Apple WebAuthn Root CA subject must include CN=Apple WebAuthn Root CA'
  );
  assert.equal(
    appleCert.verify(appleCert.publicKey),
    true,
    'Official Apple WebAuthn Root CA must cryptographically self-verify with ECDSA P-384'
  );

  // Verify with OpenSSL CLI (openssl x509 -noout -subject -serial)
  const opensslOut = execFileSync(
    'openssl',
    ['x509', '-noout', '-subject', '-issuer', '-serial'],
    { input: APPLE_WEBAUTHN_ROOT_CA_PEM, encoding: 'utf8' }
  );
  assert.equal(
    opensslOut.includes('Apple WebAuthn Root CA'),
    true,
    'OpenSSL x509 must parse Apple WebAuthn Root CA subject'
  );
  assert.equal(
    opensslOut.toUpperCase().includes('SERIAL=681D016C7A3CE30225A5019428475771'),
    true,
    'OpenSSL x509 must confirm official Apple WebAuthn Root CA serial'
  );

  const loadedRoots = loadTrustedWebAuthnRootCerts();
  assert.equal(
    loadedRoots.some((c) => c.serialNumber === '681D016C7A3CE30225A5019428475771'),
    true,
    'loadTrustedWebAuthnRootCerts() must include the official Apple WebAuthn Root CA'
  );

  // 1. Verify SplashLockScreenModal.tsx has zero software WebCrypto keypair fallback (no subtle.generateKey or subtle.sign)
  const splashModalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/SplashLockScreenModal.tsx'),
    'utf8'
  );
  assert.equal(
    splashModalSource.includes('subtle.generateKey'),
    false,
    'Client must not synthesize software WebAuthn keys via crypto.subtle.generateKey'
  );
  assert.equal(
    splashModalSource.includes('subtle.sign'),
    false,
    'Client must not sign WebAuthn assertions in software via crypto.subtle.sign'
  );

  // 2. Test zero-env initial admin bootstrap activation flow (without ROTACLUB_PIN_* env vars)
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'ROTACLUB_PIN_UYE',
    'ROTACLUB_PIN_SEKRETER',
    'ROTACLUB_PIN_SAYMAN',
    'ROTACLUB_PIN_BASKAN',
    'ROTACLUB_PIN_KARAKOY_BASKAN',
    'ROTACLUB_PIN_MACKA_BASKAN',
    'ROTACLUB_PIN_DISTRICT_GOV',
  ];
  for (const k of envKeys) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotaclub-bootstrap-'));
  try {
    const freshDbPath = path.join(tmpDir, 'rotaclub_pilot_v5_3_db.json');
    const bootstrapTokenFile = path.join(
      tmpDir,
      'rotaclub_bootstrap_claim_token.json'
    );
    const { app, store: bootstrapStore } = createPilotExpressApp(freshDbPath);
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Check bootstrap-status on fresh zero-env database -> bootstrapClaimRequired === true, no token/account leak
      const statusRes1 = await fetch(`${baseUrl}/api/auth/bootstrap-status`);
      const statusBody1 = await statusRes1.json();
      assert.equal(statusBody1.bootstrapClaimRequired, true);
      assert.equal(statusBody1.ownershipVerificationRequired, true);
      assert.equal('bootstrapToken' in statusBody1, false);
      assert.equal('targetAccount' in statusBody1, false);

      // Verify one-time ownership token exists in store and on-disk 0o600 file, and only hash is in DB
      const ownerBootstrapToken = bootstrapStore.getBootstrapOwnershipToken();
      assert.ok(ownerBootstrapToken && ownerBootstrapToken.startsWith('RC2420-'));
      assert.equal(fs.existsSync(bootstrapTokenFile), true);
      const rawDbBeforeClaim = fs.readFileSync(freshDbPath, 'utf8');
      assert.equal(
        rawDbBeforeClaim.includes(ownerBootstrapToken!),
        false,
        'Plaintext bootstrapToken must never be stored in database JSON'
      );

      // Attempting login before activation returns 403 ACCOUNT_ACTIVATION_REQUIRED
      const unactivatedLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: 'TR-2420-74105',
          pinCode: 'AnyPassword#2026',
        }),
      });
      assert.equal(unactivatedLogin.status, 403);
      const unactivatedBody = await unactivatedLogin.json();
      assert.equal(unactivatedBody.error, 'ACCOUNT_ACTIVATION_REQUIRED');

      // Attempting to claim bootstrap WITHOUT bootstrapToken MUST be rejected with 401 BOOTSTRAP_OWNERSHIP_TOKEN_REQUIRED
      const missingTokenClaimRes = await fetch(
        `${baseUrl}/api/auth/bootstrap-claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baskanPin: 'AttackerNoToken#2026',
          }),
        }
      );
      assert.equal(missingTokenClaimRes.status, 401);
      const missingTokenClaimBody = await missingTokenClaimRes.json();
      assert.equal(
        missingTokenClaimBody.error,
        'BOOTSTRAP_OWNERSHIP_TOKEN_REQUIRED'
      );

      // Attempting to claim bootstrap with an INVALID/FORGED bootstrapToken MUST be rejected with 403 INVALID_BOOTSTRAP_OWNERSHIP_TOKEN
      const forgedTokenClaimRes = await fetch(
        `${baseUrl}/api/auth/bootstrap-claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bootstrapToken: 'RC2420-forged-invalid-token-value',
            baskanPin: 'AttackerForgedToken#2026',
          }),
        }
      );
      assert.equal(forgedTokenClaimRes.status, 403);
      const forgedTokenClaimBody = await forgedTokenClaimRes.json();
      assert.equal(
        forgedTokenClaimBody.error,
        'INVALID_BOOTSTRAP_OWNERSHIP_TOKEN'
      );

      // Issue #70 & #17 Negative Test: Attempting to claim initial bootstrap for another club (club-karakoy) or activate Karaköy/Maçka/District accounts via rolePins MUST be rejected with 403 CROSS_TENANT_BOOTSTRAP_FORBIDDEN
      const crossClubBootstrapRes1 = await fetch(
        `${baseUrl}/api/auth/bootstrap-claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bootstrapToken: ownerBootstrapToken,
            clubId: 'club-karakoy',
            baskanPin: 'GalataFirstAdmin#2026',
          }),
        }
      );
      assert.equal(crossClubBootstrapRes1.status, 403);
      const crossClubBootstrapBody1 = await crossClubBootstrapRes1.json();
      assert.equal(
        crossClubBootstrapBody1.error,
        'CROSS_TENANT_BOOTSTRAP_FORBIDDEN'
      );

      const crossClubBootstrapRes2 = await fetch(
        `${baseUrl}/api/auth/bootstrap-claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bootstrapToken: ownerBootstrapToken,
            rotaryId: 'TR-2420-74105',
            baskanPin: 'GalataFirstAdmin#2026',
            rolePins: {
              karakoyBaskan: 'KarakoyHijack#2026',
            },
          }),
        }
      );
      assert.equal(crossClubBootstrapRes2.status, 403);
      const crossClubBootstrapBody2 = await crossClubBootstrapRes2.json();
      assert.equal(
        crossClubBootstrapBody2.error,
        'CROSS_TENANT_BOOTSTRAP_FORBIDDEN'
      );

      // Claim initial admin bootstrap once with verified one-time ownership token (strictly club-galata accounts only)
      const claimRes = await fetch(`${baseUrl}/api/auth/bootstrap-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bootstrapToken: ownerBootstrapToken,
          rotaryId: 'TR-2420-74105',
          email: 'baskan@galatarotary.org',
          baskanPin: 'GalataFirstAdmin#2026',
          sekreterPin: 'GalataFirstSek#2026',
          saymanPin: 'GalataFirstSay#2026',
          uyePin: 'GalataFirstUye#2026',
        }),
      });
      assert.equal(claimRes.status, 201);
      const claimBody = await claimRes.json();
      assert.equal(claimBody.ok, true);
      assert.ok(claimBody.token);
      assert.equal(claimBody.user.role, 'baskan');

      // Verify other clubs' accounts (Karaköy, Maçka, District) were NOT activated by Galata's initial bootstrap (#70)
      const karakoyAccAfterBootstrap = bootstrapStore
        .getAccounts()
        .find((a) => a.rotaryId === 'TR-2420-KRK-01');
      const mackaAccAfterBootstrap = bootstrapStore
        .getAccounts()
        .find((a) => a.rotaryId === 'TR-2420-MCK-01');
      assert.equal(karakoyAccAfterBootstrap?.activated, false);
      assert.equal(mackaAccAfterBootstrap?.activated, false);

      // Issue #70 & #17 Negative Test: Galata President attempting to activate/set PIN on Karaköy President via /api/auth/admin-provision-pin is rejected with 403 CLUB_MEMBERSHIP_FORBIDDEN
      const crossClubProvRes = await fetch(
        `${baseUrl}/api/auth/admin-provision-pin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${claimBody.token}`,
          },
          body: JSON.stringify({
            identifier: 'TR-2420-KRK-01',
            newPin: 'KarakoyHijack#2026',
          }),
        }
      );
      assert.equal(crossClubProvRes.status, 403);
      const crossClubProvBody = await crossClubProvRes.json();
      assert.equal(crossClubProvBody.error, 'CLUB_MEMBERSHIP_FORBIDDEN');
      assert.equal(
        bootstrapStore
          .getAccounts()
          .find((a) => a.rotaryId === 'TR-2420-KRK-01')?.activated,
        false
      );

      // One-time bootstrap token file must be deleted and runtime token cleared after claim
      assert.equal(fs.existsSync(bootstrapTokenFile), false);
      assert.equal(bootstrapStore.getBootstrapOwnershipToken(), null);

      // Attempting to claim bootstrap a second time is permanently rejected with 409 BOOTSTRAP_ALREADY_CLAIMED
      const secondClaimRes = await fetch(
        `${baseUrl}/api/auth/bootstrap-claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bootstrapToken: ownerBootstrapToken,
            baskanPin: 'AttackerHijack#2026',
          }),
        }
      );
      assert.equal(secondClaimRes.status, 409);
      const secondClaimBody = await secondClaimRes.json();
      assert.equal(secondClaimBody.error, 'BOOTSTRAP_ALREADY_CLAIMED');

      // Activated President can also provision/activate another account in their OWN club via /api/auth/admin-provision-pin
      const provRes = await fetch(`${baseUrl}/api/auth/admin-provision-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${claimBody.token}`,
        },
        body: JSON.stringify({
          identifier: 'TR-2420-88412',
          newPin: 'RifatAdminSet#2026',
        }),
      });
      assert.equal(provRes.status, 200);

      const rifatLogin = await loginRole(
        baseUrl,
        'TR-2420-88412',
        'RifatAdminSet#2026'
      );
      assert.equal(rifatLogin.user.role, 'uye');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 3. Test automatic discovery & lossless migration of legacy v5.2 database filename ('rotaclub_pilot_v5_2_db.json') when 'rotaclub_pilot_v5_3_db.json' does not exist
    const migDir = path.join(tmpDir, 'migration-test');
    fs.mkdirSync(migDir, { recursive: true });
    const legacyV52File = path.join(migDir, 'rotaclub_pilot_v5_2_db.json');
    const targetV53File = path.join(migDir, 'rotaclub_pilot_v5_3_db.json');

    // Copy the claimed DB as a simulated v5.2 file with custom state
    const v52Payload = JSON.parse(fs.readFileSync(freshDbPath, 'utf8'));
    v52Payload.schemaVersion = '5.2.0-hardened';
    v52Payload.tenants['club-galata'].guestNameInput =
      'Auto-Discovered v5.2 Legacy Club Data';
    fs.writeFileSync(
      legacyV52File,
      JSON.stringify(v52Payload, null, 2),
      'utf8'
    );

    const { store: autoMigratedStore } = createPilotExpressApp(targetV53File);
    assert.equal(fs.existsSync(targetV53File), true);
    assert.equal(
      autoMigratedStore.getTenantState('club-galata').guestNameInput,
      'Auto-Discovered v5.2 Legacy Club Data'
    );
    assert.equal(
      fs.existsSync(`${legacyV52File}.pre-migration-5.2.0-hardened.bak`),
      true
    );
  } finally {
    for (const k of envKeys) {
      if (savedEnv[k] !== undefined) {
        process.env[k] = savedEnv[k];
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

