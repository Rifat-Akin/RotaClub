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
    user: { role: string; rotaryId: string; memberId: string; clubId: string };
  };
}

test('Issue #76 / #12 / #20: Unauthenticated GET /api/pilot/state is blocked with 401', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/pilot/state`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'AUTH_REQUIRED');
  });
});

test('Issue #76 / #22 / #23: Header spoofing x-rotaclub-role without valid token or with mismatched token is blocked', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. Spoofing header without Bearer token
    const unauthRes = await fetch(`${baseUrl}/api/pilot/reset`, {
      method: 'POST',
      headers: { 'x-rotaclub-role': 'baskan' },
    });
    assert.equal(unauthRes.status, 401);

    // 2. Authenticate as regular 'uye' (Rifat Akın, PIN 242011) and attempt to spoof x-rotaclub-role: baskan
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
  });
});

test('Issue #76 / #20: Regular uye role cannot download /api/pilot/backup and receives redacted financial state', async () => {
  await withTestServer(async (baseUrl) => {
    const uyeSession = await loginRole(baseUrl, 'TR-2420-88412', '242011');

    // Regular member blocked from /api/pilot/backup
    const backupRes = await fetch(`${baseUrl}/api/pilot/backup`, {
      headers: { Authorization: `Bearer ${uyeSession.token}` },
    });
    assert.equal(backupRes.status, 403);

    // Regular member state redacts other members' debt balances and overdue list
    const stateRes = await fetch(`${baseUrl}/api/pilot/state`, {
      headers: { Authorization: `Bearer ${uyeSession.token}` },
    });
    assert.equal(stateRes.status, 200);
    const stateData = await stateRes.json();
    assert.equal(stateData.overdueMembers.length, 0);
    assert.equal(stateData.canExportBackup, false);
    assert.equal(stateData.canResetDatabase, false);

    const otherMember = stateData.members.find(
      (m: { id: string }) => m.id !== 'm-rifat'
    );
    assert.ok(otherMember);
    assert.equal(otherMember.duesBalance, 0);
    assert.equal(otherMember.mealBalance, 0);
  });
});

test('Issue #76 / #18: Reset endpoint requires baskan role and preserves SHA-256 hash-chained audit ledger', async () => {
  await withTestServer(async (baseUrl) => {
    const sekreterSession = await loginRole(baseUrl, 'TR-2420-81024', '242022');
    const baskanSession = await loginRole(baseUrl, 'TR-2420-74105', '242044');

    // Sekreter cannot reset database
    const forbiddenReset = await fetch(`${baseUrl}/api/pilot/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sekreterSession.token}` },
    });
    assert.equal(forbiddenReset.status, 403);

    // Check audit count before reset
    const beforeVerifyRes = await fetch(`${baseUrl}/api/pilot/audit-verify`, {
      headers: { Authorization: `Bearer ${baskanSession.token}` },
    });
    const beforeVerify = await beforeVerifyRes.json();
    assert.equal(beforeVerify.valid, true);
    const countBefore = beforeVerify.totalEntries;

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
    assert.equal(afterVerify.totalEntries, countBefore + 1);
  });
});

test('Issue #76 / #6: Bank statement reconciliation enforces valid bankRef and sayman/baskan role before posting revenue', async () => {
  await withTestServer(async (baseUrl) => {
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
    const updatedPayment = reconciledBody.state.paymentNotifications.find(
      (p: { id: string }) => p.id === 'pay-901'
    );
    assert.equal(updatedPayment.status, 'Onaylandı');
  });
});

test('Issue #76 / #11: Multi-tenant club isolation separates club-galata and club-karakoy data', async () => {
  await withTestServer(async (baseUrl) => {
    const baskanSession = await loginRole(baseUrl, 'TR-2420-74105', '242044');

    // Update RSVP in club-galata to 'excused'
    await fetch(`${baseUrl}/api/pilot/sync`, {
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

    const galataRes = await fetch(
      `${baseUrl}/api/pilot/state?clubId=club-galata`,
      { headers: { Authorization: `Bearer ${baskanSession.token}` } }
    );
    const karakoyRes = await fetch(
      `${baseUrl}/api/pilot/state?clubId=club-karakoy`,
      { headers: { Authorization: `Bearer ${baskanSession.token}` } }
    );

    const galataState = await galataRes.json();
    const karakoyState = await karakoyRes.json();

    assert.equal(galataState.rsvpStatus, 'excused');
    assert.equal(karakoyState.rsvpStatus, 'attending');
    assert.equal(karakoyState.clubName, 'Karaköy Rotary Kulübü');
  });
});
