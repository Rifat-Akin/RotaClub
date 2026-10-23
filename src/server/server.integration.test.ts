import test from 'node:test';
import assert from 'node:assert/strict';
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

test('Issue #76 / #12 / #20: Unauthenticated GET /api/pilot/state and URL ?token= query parameter are blocked with 401', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/pilot/state`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'AUTH_REQUIRED');

    // URL query token must be rejected (#20)
    const baskanSession = await loginRole(baseUrl, 'TR-2420-74105', '242044');
    const queryTokenRes = await fetch(
      `${baseUrl}/api/pilot/backup?token=${encodeURIComponent(baskanSession.token)}`
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

test('Issue #76 / #22: Full WebAuthn Passkey challenge & assertion verification issues signed token and blocks replay', async () => {
  await withTestServer(async (baseUrl) => {
    const challengeRes = await fetch(`${baseUrl}/api/auth/webauthn-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'TR-2420-88412',
        clubId: 'club-galata',
      }),
    });
    assert.equal(challengeRes.status, 200);
    const challengeData = await challengeRes.json();
    assert.ok(challengeData.challengeId);
    assert.ok(challengeData.challenge);

    const credentialId = challengeData.allowCredentials[0].id;
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: challengeData.challenge,
        origin: baseUrl,
      }),
      'utf8'
    ).toString('base64url');

    const authDataBuf = Buffer.alloc(37);
    authDataBuf[32] = 0x05; // User Present + User Verified
    const authenticatorData = authDataBuf.toString('base64url');
    const signature = Buffer.from('valid-assertion-sig', 'utf8').toString('base64url');

    // First verification succeeds and issues a signed token
    const verifyRes = await fetch(`${baseUrl}/api/auth/webauthn-verify`, {
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
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json();
    assert.equal(verifyBody.ok, true);
    assert.equal(verifyBody.user.authMethod, 'webauthn');

    // Replaying the same challengeId must be rejected with 401 (#22)
    const replayRes = await fetch(`${baseUrl}/api/auth/webauthn-verify`, {
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
    assert.equal(replayRes.status, 401);
    const replayBody = await replayRes.json();
    assert.equal(replayBody.error, 'INVALID_OR_EXPIRED_CHALLENGE');
  });
});

test('Issue #76 / #16 / #20: Regular uye role receives KVKK-masked phones/emails/bloodGroup and cannot toggle kvkkMaskPhone or export backup', async () => {
  await withTestServer(async (baseUrl) => {
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', '242011');

    // Regular member blocked from /api/pilot/backup
    const backupRes = await fetch(`${baseUrl}/api/pilot/backup`, {
      headers: { Authorization: `Bearer ${uyeSession.token}` },
    });
    assert.equal(backupRes.status, 403);

    // Regular member blocked from mutating kvkkMaskPhone (#16)
    const kvkkTamperRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uyeSession.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-galata',
        state: { kvkkMaskPhone: true },
      }),
    });
    assert.equal(kvkkTamperRes.status, 403);

    // Regular member state redacts other members' phone numbers, bloodGroup, and debt balances (#16, #20)
    const stateRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${uyeSession.token}` },
    });
    assert.equal(stateRes.status, 200);
    const stateData = await stateRes.json();
    assert.equal(stateData.overdueMembers.length, 0);
    assert.equal(stateData.canExportBackup, false);
    assert.equal(stateData.canResetDatabase, false);
    assert.equal(stateData.kvkkPhoneProtected, true);

    const otherMember = stateData.members.find(
      (m: { id: string }) => m.id !== 'm-rifat'
    );
    assert.ok(otherMember);
    assert.equal(otherMember.duesBalance, 0);
    assert.equal(otherMember.mealBalance, 0);
    assert.equal(otherMember.bloodGroup, 'KVKK Gizli');
    assert.equal(otherMember.phone.includes('***'), true);
    assert.equal(otherMember.email.includes('***@'), true);
  });
});

test('Issue #76 / #18: Mandatory server-side audit logging on sync, optimistic concurrency check, and reset preservation', async () => {
  await withTestServer(async (baseUrl) => {
    const sekreterSession = await loginRole(baseUrl, 'TR-2420-81024', '242022');
    const baskanSession = await loginRole(baseUrl, 'TR-2420-74105', '242044');

    // Sekreter cannot reset database
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
        state: { rsvpStatus: 'excused' },
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.auditVerification.totalEntries, countBefore + 1);

    // Stale expectedRevision is rejected with 409 REVISION_CONFLICT (#18)
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

test('Issue #76 / #39 / #6: Bank statement reconciliation blocks reused bankRef (409), duplicate receiptRef (409), and premature project revenue recognition', async () => {
  await withTestServer(async (baseUrl) => {
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', '242011');
    const saymanSession = await loginRole(baseUrl, 'TR-2420-79310', '242033');

    // 1. Invalid bank reference is rejected with 422
    const invalidRefRes = await fetch(`${baseUrl}/api/pilot/reconcile-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${saymanSession.token}`,
      },
      body: JSON.stringify({
        paymentId: 'pay-901',
        bankRef: 'FAKE-REF-000',
        clubId: 'club-galata',
      }),
    });
    assert.equal(invalidRefRes.status, 422);

    // 2. Valid bank statement reference (GAR-2026-88341 for 9000 TL) reconciles and posts to treasuryLedger
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
    const reconciledBody = await validRefRes.json();
    assert.equal(reconciledBody.ok, true);

    // 3. Duplicate receiptRef submission in /api/pilot/sync is rejected with 409 DUPLICATE_RECEIPT_REF (#39)
    const duplicateReceiptSync = await fetch(`${baseUrl}/api/pilot/sync`, {
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
              id: 'pay-dup-1',
              memberId: 'm-rifat',
              memberName: 'Rtn. Rifat Akın',
              category: 'Vakıf / Proje Katkı Payı',
              amount: 5000,
              description: 'Proje Bağışı 1',
              submittedAt: '23 Ekim 2026',
              receiptRef: '#GAR-2026-99501',
              status: 'Bekliyor',
            },
            {
              id: 'pay-dup-2',
              memberId: 'm-rifat',
              memberName: 'Rtn. Rifat Akın',
              category: 'Vakıf / Proje Katkı Payı',
              amount: 5000,
              description: 'Proje Bağışı 2',
              submittedAt: '23 Ekim 2026',
              receiptRef: 'GAR-2026-99501',
              status: 'Bekliyor',
            },
          ],
        },
      }),
    });
    assert.equal(duplicateReceiptSync.status, 409);
    const dupBody = await duplicateReceiptSync.json();
    assert.equal(dupBody.error, 'DUPLICATE_RECEIPT_REF');

    // 4. Member submits a pending project contribution (GAR-2026-99501 for 5000 TL) and attempts to prematurely inflate project.collectedAmount
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
          // Attempt to prematurely add +500000 to project.collectedAmount as regular uye
          projects: stateBefore.projects.map((p: { id: string; collectedAmount: number }) =>
            p.id === targetProject.id
              ? { ...p, collectedAmount: p.collectedAmount + 500000 }
              : p
          ),
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
    const afterMemberSync = await projectPaymentSync.json();
    // Premature collectedAmount inflation by 'uye' was ignored!
    assert.equal(afterMemberSync.state.projects[0].collectedAmount, initialCollected);

    // 5. Reconcile pay-proj-5000 with GAR-2026-99501 -> collectedAmount increases by exactly 5000
    const reconcileProjRes = await fetch(`${baseUrl}/api/pilot/reconcile-payment`, {
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
    });
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

    const reuseBankRefRes = await fetch(`${baseUrl}/api/pilot/reconcile-payment`, {
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
    });
    assert.equal(reuseBankRefRes.status, 409);
    const reuseBody = await reuseBankRefRes.json();
    assert.equal(reuseBody.error, 'BANK_REF_ALREADY_USED');
  });
});

test('Issue #76 / #70 / #19: P0 Multi-club isolation blocks cross-tenant IDOR (403), isolates club members/payments/audit chains, and scopes backups', async () => {
  await withTestServer(async (baseUrl) => {
    const baskanGalata = await loginRole(baseUrl, 'TR-2420-74105', '242044', 'club-galata');

    // 1. Cross-tenant GET /api/pilot/state?clubId=club-karakoy with a club-galata token MUST fail with 403 CROSS_TENANT_FORBIDDEN (#70)
    const crossReadRes = await fetch(
      `${baseUrl}/api/pilot/state?clubId=club-karakoy`,
      { headers: { Authorization: `Bearer ${baskanGalata.token}` } }
    );
    assert.equal(crossReadRes.status, 403);
    const crossReadBody = await crossReadRes.json();
    assert.equal(crossReadBody.error, 'CROSS_TENANT_FORBIDDEN');

    // 2. Cross-tenant POST /api/pilot/sync with clubId=club-karakoy MUST fail with 403 (#70)
    const crossWriteRes = await fetch(`${baseUrl}/api/pilot/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baskanGalata.token}`,
      },
      body: JSON.stringify({
        clubId: 'club-karakoy',
        state: { rsvpStatus: 'excused' },
      }),
    });
    assert.equal(crossWriteRes.status, 403);

    // 3. Backup for club-galata contains ONLY club-galata state and checksum, never other tenants (#19, #70)
    const backupRes = await fetch(`${baseUrl}/api/pilot/backup`, {
      headers: { Authorization: `Bearer ${baskanGalata.token}` },
    });
    assert.equal(backupRes.status, 200);
    const backupData = await backupRes.json();
    assert.equal(backupData.clubId, 'club-galata');
    assert.equal('tenants' in backupData, false);
    assert.ok(backupData.backupChecksum);
    assert.equal(backupData.auditChainVerification.valid, true);

    // 4. Switch club explicitly via POST /api/auth/switch-club to access club-karakoy (#70)
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
    assert.equal(
      karakoyState.auditLogs.every(
        (a: { clubId: string }) => a.clubId === 'club-karakoy'
      ),
      true
    );
  });
});
