// Pairing a projector device with a 6-digit code from the Android setup page.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { makeTable, nextEvent, startServer } from './helpers.js';

const ANDROID = 'https://appassets.androidplatform.net';

let t;
let table;
before(async () => {
  t = await startServer();
  table = makeTable(t, { number: 4, projector: false });
});
after(() => t.close());

const claim = (code, base = t.base) =>
  fetch(`${base}/api/projectors/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ANDROID },
    body: JSON.stringify({ code }),
  });

test('owner creates a code; the device claims it once and becomes the table projector', async () => {
  assert.equal((await t.as.designer.post('/api/projectors/pairing-codes', { table_id: table.tableId })).status, 403);
  assert.equal((await t.as.owner.post('/api/projectors/pairing-codes', { table_id: 999 })).status, 400);

  const res = await t.as.owner.post('/api/projectors/pairing-codes', { table_id: table.tableId, name: 'بروجكتر السقف' });
  assert.equal(res.status, 201);
  assert.match(res.body.code, /^\d{6}$/);
  const ttl = Date.parse(res.body.expiresAt) - Date.now();
  assert.ok(ttl > 9 * 60 * 1000 && ttl <= 10 * 60 * 1000, 'valid for 10 minutes');

  const ok = await claim(res.body.code);
  assert.equal(ok.status, 201);
  assert.equal(ok.headers.get('access-control-allow-origin'), ANDROID);
  const body = await ok.json();
  assert.match(body.playerUrl, /^\/player\/\?device=[A-Za-z0-9_-]{24}$/);
  assert.deepEqual(body.table, { id: table.tableId, number: 4 });
  assert.equal(body.projector.name, 'بروجكتر السقف');

  const projectors = (await t.as.owner.get('/api/projectors')).body;
  const created = projectors.find((p) => p.id === body.projector.id);
  assert.equal(created.table_id, table.tableId);
  assert.equal(created.player_url, body.playerUrl);

  // The new device works right away.
  const key = new URLSearchParams(body.playerUrl.split('?')[1]).get('device');
  const player = t.player(key);
  assert.equal((await nextEvent(player, 'bootstrap')).table.number, 4);
  player.disconnect();

  // Single use.
  const again = await claim(res.body.code);
  assert.equal(again.status, 404);
  assert.match((await again.json()).error, /رمز الربط/);
  assert.equal(again.headers.get('access-control-allow-origin'), ANDROID, 'errors are readable cross-origin too');
});

test('expired codes are refused and removed; malformed codes are 400', async () => {
  const { code } = (await t.as.owner.post('/api/projectors/pairing-codes', { table_id: table.tableId })).body;
  t.db.prepare('UPDATE pairing_codes SET expires_at = ? WHERE code = ?').run(new Date(Date.now() - 1000).toISOString(), code);
  const res = await claim(code);
  assert.equal(res.status, 410);
  assert.match((await res.json()).error, /انتهت صلاحية/);
  assert.equal(t.db.prepare('SELECT COUNT(*) FROM pairing_codes WHERE code = ?').pluck().get(code), 0);
  assert.equal((await claim('12ab')).status, 400);
});

test('CORS preflight for the Android app origin on claim and info', async () => {
  const pre = await fetch(`${t.base}/api/projectors/claim`, {
    method: 'OPTIONS',
    headers: {
      origin: ANDROID,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
      'access-control-request-private-network': 'true',
    },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ANDROID);
  assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  assert.match(pre.headers.get('access-control-allow-headers'), /Content-Type/i);
  assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');

  const info = await fetch(`${t.base}/api/info`, { headers: { origin: ANDROID } });
  assert.equal(info.status, 200);
  assert.equal(info.headers.get('access-control-allow-origin'), ANDROID);
  const body = await info.json();
  assert.equal(body.app, 'projection-menu');
  assert.equal(body.restaurantName, 'مطعم الشمس');
  assert.match(body.version, /^\d+\.\d+\.\d+/);

  // Other endpoints grant no CORS.
  const other = await fetch(`${t.base}/api/auth/state`, { headers: { origin: ANDROID } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('claim is rate limited to 20 attempts per 10 minutes per IP', async () => {
  const fresh = await startServer({ users: false });
  try {
    for (let i = 0; i < 20; i++) assert.equal((await claim(String(100000 + i), fresh.base)).status, 404);
    const blocked = await claim('123456', fresh.base);
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /محاولات/);
  } finally {
    await fresh.close();
  }
});
