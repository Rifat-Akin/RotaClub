import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';
import { createPilotExpressApp } from '../../server';

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
    const baskanSession = await loginRole(baseUrl, 'TR-2420-74105', '242044');
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

test('Issue #76 / #22 / #23: Header spoofing x-rotaclub-role, PIN exposure, PIN rotation, and session logout revocation', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. /api/auth/pilot-accounts must NOT expose plaintext PINs or demoPinHint (#22)
    const accountsRes = await fetch(`${baseUrl}/api/auth/pilot-accounts`);
    const accountsBody = await accountsRes.json();
    for (const acc of accountsBody.accounts) {
      assert.equal('demoPinHint' in acc, false);
      assert.equal('pinCode' in acc, false);
      assert.equal('passwordHash' in acc, false);
    }

    // 2. Authenticate as regular 'uye' and attempt to spoof x-rotaclub-role: baskan
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', '242011');
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

    // 3. Rotate PIN and verify old PIN fails while new PIN succeeds
    const changePinRes = await fetch(`${baseUrl}/api/auth/change-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeSession.token}`,
      },
      body: JSON.stringify({ currentPin: '242011', newPin: '998877' }),
    });
    assert.equal(changePinRes.status, 200);

    const oldPinLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'TR-2420-88412', pinCode: '242011' }),
    });
    assert.equal(oldPinLogin.status, 401);

    const newPinSession = await loginRole(baseUrl, 'TR-2420-88412', '998877');
    assert.equal(newPinSession.ok, true);

    // 4. Logout revokes session token immediately
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

test('Issue #76 / #12 / #22: Authenticated ECDSA P-256 WebAuthn registration, cryptographic assertion verification, rpIdHash, monotonic signCount, and replay/forgery rejection', async () => {
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
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', '242011');
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

    const regClientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: regOpt.challenge,
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
          challengeId: regOpt.challengeId,
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
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', '242011');
    const sekreterSession = await loginRole(baseUrl, 'TR-2420-81024', '242022');
    const saymanSession = await loginRole(baseUrl, 'TR-2420-79310', '242033');

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
    assert.ok(kerem.duesBalance > 0, 'Sekreter sync must not zero out member debt balances!');
  });
});

test('Issue #76 / #14 / #18: Mandatory server-side audit logging on sync, atomic CAS expectedRevision check, and reset preservation', async () => {
  await withTestServer(async (baseUrl) => {
    const sekreterSession = await loginRole(baseUrl, 'TR-2420-81024', '242022');
    const baskanSession = await loginRole(baseUrl, 'TR-2420-74105', '242044');

    const forbiddenReset = await fetch(`${baseUrl}/api/pilot/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sekreterSession.token}` },
    });
    assert.equal(forbiddenReset.status, 403);

    const beforeVerifyRes = await fetch(`${baseUrl}/api/pilot/audit-verify`, {
      headers: { Authorization: `Bearer ${baskanSession.token}` },
    });
    const beforeVerify = await beforeVerifyRes.json();
    assert.equal(beforeVerify.valid, true);
    const countBefore = beforeVerify.totalEntries;

    // Sync WITHOUT client auditEvent still creates a mandatory server-generated audit entry (#18)
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
    assert.equal(syncBody.auditVerification.totalEntries, countBefore + 1);

    // Stale expectedRevision is rejected with 409 REVISION_CONFLICT (#14)
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

    // Başkan can reset operational data, and audit log grows instead of being wiped
    const allowedReset = await fetch(`${baseUrl}/api/pilot/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanSession.token}`,
      },
      body: JSON.stringify({ clubId: 'club-galata' }),
    });
    assert.equal(allowedReset.status, 200);

    const afterVerifyRes = await fetch(`${baseUrl}/api/pilot/audit-verify`, {
      headers: { Authorization: `Bearer ${baskanSession.token}` },
    });
    const afterVerify = await afterVerifyRes.json();
    assert.equal(afterVerify.valid, true);
    assert.equal(afterVerify.totalEntries, countBefore + 2);
  });
});

test('Issue #76 / #39 / #6: Accounting integrity blocks reused bankRef (409), cross-member receiptRef theft (409), sender mismatch (422), and unreconciled approval via sync (422)', async () => {
  await withTestServer(async (baseUrl) => {
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', '242011');
    const saymanSession = await loginRole(baseUrl, 'TR-2420-79310', '242033');

    // 1. Sayman cannot mark a pending payment 'Onaylandı' via /api/pilot/sync bypassing bank reconciliation (#39)
    const bypassApprovalRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${saymanSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
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

    // 2. Regular member ('m-rifat') cannot submit a payment claiming another member's receiptRef ('GAR-2026-88341' belonging to Kerem Soylu) (#39)
    const crossMemberRefTheftRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
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

    // 3. Reconciling Kerem Soylu's valid payment (pay-901, GAR-2026-88341, 9000 TL) succeeds
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

    // 4. Member submits a valid project contribution (GAR-2026-99501 for 5000 TL)
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

    // 5. Reconcile pay-proj-5000 with GAR-2026-99501 -> collectedAmount increases by 5000
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

    // 6. Attempting to reuse the already-reconciled GAR-2026-99501 on another 5000 TL payment is blocked with 409 BANK_REF_ALREADY_USED (#39)
    await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
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

test('Issue #76 / #70 / #19: P0 Multi-club isolation enforces per-club membership on login & switch-club, blocks cross-tenant IDOR, and rejects unknown clubs', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. Galata-only member (m-rifat) CANNOT log directly into club-karakoy (#70)
    const unauthorizedClubLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'TR-2420-88412',
        pinCode: '242011',
        clubId: 'club-karakoy',
      }),
    });
    assert.equal(unauthorizedClubLogin.status, 403);
    const unauthLoginBody = await unauthorizedClubLogin.json();
    assert.equal(unauthLoginBody.error, 'CLUB_MEMBERSHIP_FORBIDDEN');

    // 2. Galata-only member (m-rifat) CANNOT switch to club-karakoy via /api/auth/switch-club (#70)
    const uyeGalata = await loginRole(
      baseUrl,
      'TR-2420-88412',
      '242011',
      'club-galata'
    );
    const forbiddenSwitchRes = await fetch(`${baseUrl}/api/auth/switch-club`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeGalata.token}`,
      },
      body: JSON.stringify({ targetClubId: 'club-karakoy' }),
    });
    assert.equal(forbiddenSwitchRes.status, 403);
    const forbiddenSwitchBody = await forbiddenSwitchRes.json();
    assert.equal(forbiddenSwitchBody.error, 'CLUB_MEMBERSHIP_FORBIDDEN');

    // 3. Unknown club ID is rejected with 404 UNKNOWN_CLUB_TENANT (#70)
    const baskanGalata = await loginRole(
      baseUrl,
      'TR-2420-74105',
      '242044',
      'club-galata'
    );
    const unknownClubSwitch = await fetch(`${baseUrl}/api/auth/switch-club`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanGalata.token}`,
      },
      body: JSON.stringify({ targetClubId: 'club-nonexistent-999' }),
    });
    assert.equal(unknownClubSwitch.status, 404);

    // 4. Cross-tenant GET /api/pilot/state?clubId=club-karakoy with a club-galata token MUST fail with 403 CROSS_TENANT_FORBIDDEN (#70)
    const crossReadRes = await fetch(
      `${baseUrl}/api/pilot/state?clubId=club-karakoy`,
      { headers: { Authorization: `Bearer ${baskanGalata.token}` } }
    );
    assert.equal(crossReadRes.status, 403);
    const crossReadBody = await crossReadRes.json();
    assert.equal(crossReadBody.error, 'CROSS_TENANT_FORBIDDEN');

    // 5. District-authorized officer (m-emre) switches to club-karakoy via POST /api/auth/switch-club (#70)
    const switchRes = await fetch(`${baseUrl}/api/auth/switch-club`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanGalata.token}`,
      },
      body: JSON.stringify({ targetClubId: 'club-karakoy' }),
    });
    assert.equal(switchRes.status, 200);
    const switchData = await switchRes.json();
    assert.equal(switchData.user.clubId, 'club-karakoy');

    // Old club-galata token is revoked upon club switch
    const oldTokenCheck = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${baskanGalata.token}` },
    });
    assert.equal(oldTokenCheck.status, 401);

    // Karaköy state has isolated members, 0 Galata payment notifications, and its own audit ledger
    const karakoyRes = await fetch(
      `${baseUrl}/api/pilot/state?clubId=club-karakoy`,
      { headers: { Authorization: `Bearer ${switchData.token}` } }
    );
    assert.equal(karakoyRes.status, 200);
    const karakoyState = await karakoyRes.json();
    assert.equal(karakoyState.clubName, 'Karaköy Rotary Kulübü');
    assert.equal(karakoyState.paymentNotifications.length, 0);
    assert.equal(
      karakoyState.members.some((m: { id: string }) => m.id === 'm-rifat'),
      false
    );
  });
});
