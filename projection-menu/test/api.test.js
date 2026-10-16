// End-to-end: dashboard API → tablet → ProjectionService → a fake browser
// player connected over Socket.IO.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { config as baseConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';

const TOKEN = 'test-token';
let server;
let base;
let tmp;
const sockets = [];

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-menu-'));
  const config = { ...baseConfig, adminToken: TOKEN, mediaDir: path.join(tmp, 'media'), cueAckTimeoutMs: 400 };
  ({ server } = createApp({ db: openDb(path.join(tmp, 'test.db')), config }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const s of sockets) s.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function admin(method, url, body) {
  const res = await fetch(`${base}/api/admin${url}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

function tablet(table, method, url, body) {
  return fetch(`${base}/api/tablet${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-table-code': table.code, 'x-table-key': table.access_key },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, body: await res.json() }));
}

// Fake player: records every cue and acks it (unless told to stay silent).
function player(projector, { silent = false } = {}) {
  const cues = [];
  const waiters = [];
  const socket = connect(`${base}/player`, {
    auth: { projectorId: projector.id, key: projector.access_key },
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(socket);
  socket.on('cue', (cue, ack) => {
    cues.push(cue);
    if (!silent) ack?.({ ok: true });
    waiters.splice(0).forEach((w) => w());
  });
  const next = (predicate) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no matching cue')), 2000);
      const check = () => {
        const found = cues.find(predicate);
        if (found) {
          clearTimeout(timer);
          resolve(found);
        } else waiters.push(check);
      };
      check();
    });
  const connected = new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  return { socket, cues, next, connected };
}

const state = {};

test('admin API requires the token', async () => {
  const res = await fetch(`${base}/api/admin/dishes`, { headers: { authorization: 'Bearer nope' } });
  assert.equal(res.status, 401);
});

test('admin sets up a dish with a projection, a table and a projector', async () => {
  const category = await admin('POST', '/categories', { name_ar: 'بيتزا' });
  assert.equal(category.status, 201);

  const form = new FormData();
  form.append('file', new Blob([Buffer.from('fake webm bytes')], { type: 'video/webm' }), 'بيتزا-دوارة.webm');
  const upload = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: form });
  const asset = await upload.json();
  assert.equal(upload.status, 201);
  assert.equal(asset.kind, 'video');
  assert.equal(asset.title, 'بيتزا-دوارة', 'Arabic file names survive the upload');
  assert.match(asset.sha256, /^[0-9a-f]{64}$/);
  state.asset = asset;

  const badType = new FormData();
  badType.append('file', new Blob(['<script>']), 'evil.html');
  const rejected = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: badType });
  assert.equal(rejected.status, 400);

  const dish = await admin('POST', '/dishes', { name_ar: 'مارجريتا', price: 12000, category_id: category.body.id });
  assert.equal(dish.status, 201);
  state.dish = dish.body;

  for (const phase of ['preview', 'ordered', 'served']) {
    const linked = await admin('PUT', `/dishes/${dish.body.id}/projections/${phase}`, { media_asset_id: asset.id, loop: phase !== 'served' });
    assert.equal(linked.status, 200);
  }
  const reloaded = await admin('GET', `/dishes/${dish.body.id}`);
  assert.deepEqual(Object.keys(reloaded.body.projections).sort(), ['ordered', 'preview', 'served']);

  state.table = (await admin('POST', '/tables', { code: 'T01', name: 'طاولة 1', seats: 4 })).body;
  state.projector = (await admin('POST', '/projectors', { name: 'P1', table_id: state.table.id, driver: 'browser' })).body;
  assert.equal(state.projector.zones.length, 4, 'zones generated from the seat count');
  assert.equal(state.projector.online, false);
});

test('a player with a wrong key is refused', async () => {
  const fake = player({ ...state.projector, access_key: 'wrong' });
  await assert.rejects(fake.connected, /unauthorized/);
});

test('player gets its config on connect and shows up online', async () => {
  state.player = player(state.projector);
  await state.player.connected;
  const boot = await state.player.next((c) => c.action === 'config');
  assert.equal(boot.zones.length, 4);
  assert.deepEqual(boot.calibration.corners, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const list = await admin('GET', '/projectors');
  assert.equal(list.body[0].online, true);
});

test('tablet preview plays the dish in front of the chosen seat', async () => {
  const menu = await tablet(state.table, 'GET', '/menu');
  assert.equal(menu.body.categories[0].dishes[0].has_preview, true);

  const res = await tablet(state.table, 'POST', '/preview', { dish_id: state.dish.id, seat_no: 2 });
  assert.equal(res.body.status, 'sent');
  assert.equal(res.body.results[0].result, 'acked');

  const cue = await state.player.next((c) => c.action === 'play' && c.layer === 'seat-2');
  assert.equal(cue.media.url, `/media/${state.asset.file_name}`);
  assert.equal(cue.zone.rotate, 180, 'seat 2 sits on the far side');
  assert.equal(cue.meta.phase, 'preview');

  await tablet(state.table, 'POST', '/preview/stop', { seat_no: 2 });
  await state.player.next((c) => c.action === 'stop' && c.layer === 'seat-2');
});

test('tablets are scoped to their own table', async () => {
  const res = await tablet({ code: state.table.code, access_key: 'stolen' }, 'GET', '/menu');
  assert.equal(res.status, 401);
  const seat = await tablet(state.table, 'POST', '/preview', { dish_id: state.dish.id, seat_no: 9 });
  assert.equal(seat.status, 400);
});

test('ordering plays "ordered", serving plays "served"', async () => {
  const order = await tablet(state.table, 'POST', '/orders', { items: [{ dish_id: state.dish.id, seat_no: 3, quantity: 2 }] });
  assert.equal(order.status, 201);
  assert.equal(order.body.total, 24000);
  await state.player.next((c) => c.action === 'play' && c.meta?.phase === 'ordered' && c.layer === 'seat-3');

  const bad = await admin('PATCH', `/orders/${order.body.id}`, { status: 'closed' });
  assert.equal(bad.status, 409, 'cannot close an order that was never served');

  const served = await admin('PATCH', `/orders/${order.body.id}`, { status: 'served' });
  assert.equal(served.body.status, 'served');
  const cue = await state.player.next((c) => c.action === 'play' && c.meta?.phase === 'served');
  assert.equal(cue.loop, false);
});

test('media used by a dish cannot be deleted', async () => {
  const res = await admin('DELETE', `/media/${state.asset.id}`);
  assert.equal(res.status, 409);
});

test('calibration edits are pushed to the player live', async () => {
  const corners = [[0.05, 0.02], [0.95, 0.04], [0.97, 0.98], [0.03, 0.95]];
  const res = await admin('PUT', `/projectors/${state.projector.id}/calibration`, { corners });
  assert.equal(res.body.push.ok, true);
  const cue = await state.player.next((c) => c.action === 'config' && c.calibration.corners[0][0] === 0.05);
  assert.deepEqual(cue.calibration.corners, corners);
});

test('a silent player times out, a missing one is reported offline', async () => {
  state.player.socket.close();
  await new Promise((r) => setTimeout(r, 100));
  const offline = await tablet(state.table, 'POST', '/preview', { dish_id: state.dish.id, seat_no: 1 });
  assert.equal(offline.body.status, 'failed');
  assert.equal(offline.body.results[0].result, 'offline');

  const silent = player(state.projector, { silent: true });
  await silent.connected;
  const timedOut = await tablet(state.table, 'POST', '/preview', { dish_id: state.dish.id, seat_no: 1 });
  assert.equal(timedOut.body.results[0].result, 'timeout');

  const log = await admin('GET', '/projection-log?limit=50');
  assert.ok(log.body.some((l) => l.result === 'timeout'));
  assert.ok(log.body.some((l) => l.result === 'acked' && l.phase === 'served'));
});
