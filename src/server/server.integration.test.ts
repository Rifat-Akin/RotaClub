import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';
import { createPilotExpressApp } from '../../server';

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
  const { app } = createPilotExpressApp(tmpDbFile);

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
    const publicKeySpkiB64 = (
      publicKey.export({ type: 'spki', format: 'der' }) as Buffer
    ).toString('base64url');
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
          publicKeySpkiB64,
        }),
      }
    );
    assert.equal(badOriginRegRes.status, 401);
    const badOriginRegBody = await badOriginRegRes.json();
    assert.equal(badOriginRegBody.error, 'WEBAUTHN_ORIGIN_MISMATCH');

    // Request fresh registration options and register with the legitimate origin
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

    const regClientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: regOpt2.challenge,
        origin: baseUrl,
      }),
      'utf8'
    ).toString('base64url');

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
          credentialId,
          clientDataJSON: regClientDataJSON,
          publicKeySpkiB64,
        }),
      }
    );
    assert.equal(regVerifyRes.status, 200);

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
          paymentNotifications: [
            {
              id: 'pay-901',
              memberId: 'm-kerem',
              memberName: 'Rtn. Kerem Soylu',
              category: 'Dönem Aidatı',
              amount: 9000,
              description: 'Bypass Onay Denemesi',
              submittedAt: '22 Ekim 2026',
              receiptRef: 'GAR-2026-88341',
              status: 'Onaylandı',
            },
          ],
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
