// Scenes per table, delivery to projector players with acks, persistence,
// live projector settings and staff previews.

import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { collect, connected, makeMenu, makeTable, nextEvent, startServer } from './helpers.js';

let t;
let table;
let menu;
before(async () => {
  t = await startServer();
  table = makeTable(t, { number: 7, area: 'التراس' });
  menu = makeMenu(t, {
    dishes: [
      { name_ar: 'كباب', price: 14000 },
      { name_ar: 'نفد', price: 9000, is_available: false },
    ],
  });
});
after(() => t.close());
afterEach(() => t.disconnectAll());

// A player that acks every scene, like the real one.
const ackingPlayer = (key) => {
  const socket = t.player(key);
  socket.on('scene', (_msg, ack) => ack?.({ ok: true }));
  return socket;
};

test('a player gets its bootstrap on connect; bad keys are refused', async () => {
  const socket = ackingPlayer(table.deviceKey);
  const boot = await nextEvent(socket, 'bootstrap');
  assert.deepEqual(boot.projector, {
    id: table.projectorId,
    name: 'بروجكتر 7',
    rotation: 0,
    layout: 'single',
    calibration: { corners: [[0, 0], [1, 0], [1, 1], [0, 1]] },
  });
  assert.deepEqual(boot.table, { id: table.tableId, number: 7, area_name: 'التراس' });
  assert.deepEqual(boot.scene, { type: 'welcome' });
  assert.ok(boot.settings.general && boot.settings.theme && 'logo_url' in boot.settings);
  assert.equal(boot.menu.categories[0].dishes.length, 1, 'unavailable dish not sent');
  socket.disconnect();

  const bad = t.player('not-a-real-key-at-all');
  const err = await nextEvent(bad, 'connect_error');
  assert.equal(err.message, 'unauthorized');
  assert.equal((await fetch(`${t.base}/api/player/bootstrap`, { headers: { 'x-device-key': 'nope-nope-nope-nope' } })).status, 401);
});

test('PUT scene: delivered to the table player with ack, to staff, persisted', async () => {
  const player = ackingPlayer(table.deviceKey);
  await nextEvent(player, 'bootstrap');
  const staff = t.live(t.as.owner);
  await connected(staff);

  const onPlayer = nextEvent(player, 'scene');
  const onStaff = nextEvent(staff, 'scene');
  const res = await t.as.waiter.put(`/api/tables/${table.tableId}/scene`, { scene: { type: 'category', categoryId: menu.categoryId } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.delivered, { online: 1, acked: 1 });
  assert.equal(res.body.scene.type, 'category');
  assert.equal(res.body.scene.categoryId, menu.categoryId);
  assert.equal(res.body.scene.by, 'الويتر');
  assert.ok(!Number.isNaN(Date.parse(res.body.scene.at)));

  const [msg] = await onPlayer;
  assert.deepEqual(msg.scene, res.body.scene);
  assert.deepEqual(await onStaff, { tableId: table.tableId, scene: res.body.scene });

  // Persisted: GET, floor and a rebooted projector all see it.
  assert.deepEqual((await t.as.designer.get(`/api/tables/${table.tableId}/scene`)).body.scene, res.body.scene);
  const tile = (await t.as.waiter.get('/api/floor')).body.areas[0].tables[0];
  assert.equal(tile.scene.type, 'category');
  assert.equal(tile.projectors[0].online, true);
  player.disconnect();
  const rebooted = ackingPlayer(table.deviceKey);
  assert.deepEqual((await nextEvent(rebooted, 'bootstrap')).scene, res.body.scene);
  rebooted.disconnect();
});

test('delivery counts: no player online, and a player that never acks', async () => {
  const other = makeTable(t, { number: 8 });
  let res = await t.as.owner.put(`/api/tables/${other.tableId}/scene`, { scene: { type: 'off' } });
  assert.deepEqual(res.body.delivered, { online: 0, acked: 0 });

  const silent = t.player(other.deviceKey); // receives but does not ack
  await nextEvent(silent, 'bootstrap');
  const started = Date.now();
  res = await t.as.owner.put(`/api/tables/${other.tableId}/scene`, { scene: { type: 'menu' } });
  assert.deepEqual(res.body.delivered, { online: 1, acked: 0 });
  assert.ok(Date.now() - started >= t.config.sceneAckTimeoutMs - 50, 'waited for the ack timeout');
  silent.disconnect();
});

test('scene validation', async () => {
  const put = (scene) => t.as.waiter.put(`/api/tables/${table.tableId}/scene`, { scene });
  assert.equal((await put({ type: 'disco' })).status, 400);
  assert.equal((await put({ type: 'category' })).status, 400);
  assert.equal((await put({ type: 'category', categoryId: 999 })).status, 400);
  assert.equal((await put({ type: 'dish', dishId: menu.dishIds[1] })).status, 400, 'unavailable dish');
  assert.equal((await put({ type: 'order', orderId: 12345 })).status, 400);
  assert.equal((await t.as.waiter.put('/api/tables/999/scene', { scene: { type: 'menu' } })).status, 404);
  const ok = await put({ type: 'dish', dishId: menu.dishIds[0], extra: 'dropped' });
  assert.deepEqual(Object.keys(ok.body.scene).sort(), ['at', 'by', 'dishId', 'type']);
});

test('order scene carries the live order and follows its changes', async () => {
  const player = ackingPlayer(table.deviceKey);
  const scenes = collect(player, 'scene');
  await nextEvent(player, 'bootstrap');
  const order = (await t.as.waiter.post('/api/orders', { table_id: table.tableId, items: [{ dish_id: menu.dishIds[0], quantity: 2 }] })).body;
  const res = await t.as.waiter.put(`/api/tables/${table.tableId}/scene`, { scene: { type: 'order', orderId: order.id } });
  assert.equal(res.body.scene.order.total, 28000);
  assert.equal(res.body.scene.order.items[0].dish_name, 'كباب');

  await t.as.waiter.post(`/api/orders/${order.id}/items`, { dish_id: menu.dishIds[0], quantity: 1 });
  const updated = await scenes.until((m) => m.scene.order?.total === 42000);
  assert.equal(updated.scene.type, 'order');
  assert.equal(updated.scene.order.items[0].quantity, 3);

  // Another table's order is refused.
  const elsewhere = makeTable(t, { number: 11, projector: false });
  assert.equal(
    (await t.as.waiter.put(`/api/tables/${elsewhere.tableId}/scene`, { scene: { type: 'order', orderId: order.id } })).status,
    400,
  );

  // Status changes show up live; once paid and the table is free it goes back to welcome.
  await t.as.waiter.patch(`/api/orders/${order.id}`, { status: 'served' });
  await scenes.until((m) => m.scene.order?.status === 'served');
  await t.as.waiter.patch(`/api/orders/${order.id}`, { status: 'paid' });
  await scenes.until((m) => m.scene.type === 'welcome');
  assert.deepEqual((await t.as.waiter.get(`/api/tables/${table.tableId}/scene`)).body.scene.type, 'welcome');
});

test('preview bootstrap for logged-in staff (with and without a projector)', async () => {
  const preview = await t.as.designer.get(`/api/tables/${table.tableId}/preview-bootstrap`);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.projector.id, table.projectorId);
  assert.equal(preview.body.table.number, 7);
  assert.ok(preview.body.menu.categories.length > 0);

  const bare = makeTable(t, { number: 12, projector: false });
  const def = (await t.as.waiter.get(`/api/tables/${bare.tableId}/preview-bootstrap`)).body;
  assert.equal(def.projector.rotation, 0);
  assert.equal(def.projector.layout, 'single');
  assert.deepEqual(def.projector.calibration, { corners: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  assert.deepEqual(def.scene, { type: 'welcome' });
  assert.equal((await t.client().get(`/api/tables/${bare.tableId}/preview-bootstrap`)).status, 401);
});

test('calibration, rotation/layout, test pattern and status reach the projector live', async () => {
  const staff = t.live(t.as.owner);
  await connected(staff);
  const online = nextEvent(staff, 'projector:status');
  const player = ackingPlayer(table.deviceKey);
  await nextEvent(player, 'bootstrap');
  assert.deepEqual(await online, { id: table.projectorId, tableId: table.tableId, online: true });

  const corners = [[0.02, 0.03], [0.97, 0.01], [0.99, 0.98], [0.01, 0.96]];
  let event = nextEvent(player, 'projector');
  const cal = await t.as.designer.put(`/api/projectors/${table.projectorId}/calibration`, { corners });
  assert.equal(cal.status, 200);
  assert.deepEqual(cal.body.delivered, { online: 1 });
  assert.deepEqual((await event).calibration.corners, corners);
  assert.equal((await t.as.designer.put(`/api/projectors/${table.projectorId}/calibration`, { corners: [[0, 0]] })).status, 400);

  event = nextEvent(player, 'projector');
  await t.as.owner.patch(`/api/projectors/${table.projectorId}`, { rotation: 180, layout: 'dual' });
  assert.deepEqual(await event, { rotation: 180, layout: 'dual', calibration: { corners } });
  assert.equal((await t.as.owner.patch(`/api/projectors/${table.projectorId}`, { rotation: 45 })).status, 400);

  event = nextEvent(player, 'test-pattern');
  const tp = await t.as.designer.post(`/api/projectors/${table.projectorId}/test-pattern`, { on: true });
  assert.deepEqual(tp.body, { on: true, delivered: { online: 1 } });
  assert.deepEqual(await event, { on: true });

  const status = nextEvent(staff, 'projector:status');
  player.emit('status', { state: 'error', detail: 'video failed' });
  assert.deepEqual(await status, { id: table.projectorId, tableId: table.tableId, online: true, state: 'error', detail: 'video failed' });

  const offline = nextEvent(staff, 'projector:status');
  player.disconnect();
  assert.deepEqual(await offline, { id: table.projectorId, tableId: table.tableId, online: false });
});

test('moving a projector to another table re-bootstraps it; rotating its key disconnects it', async () => {
  const target = makeTable(t, { number: 15, projector: false });
  const player = ackingPlayer(table.deviceKey);
  await nextEvent(player, 'bootstrap');
  const reboot = nextEvent(player, 'bootstrap');
  await t.as.owner.patch(`/api/projectors/${table.projectorId}`, { table_id: target.tableId });
  assert.equal((await reboot).table.number, 15);
  const scene = nextEvent(player, 'scene');
  const res = await t.as.waiter.put(`/api/tables/${target.tableId}/scene`, { scene: { type: 'menu' } });
  assert.deepEqual(res.body.delivered, { online: 1, acked: 1 });
  await scene;

  const gone = nextEvent(player, 'disconnect');
  const rotated = await t.as.owner.post(`/api/projectors/${table.projectorId}/rotate-key`);
  assert.equal(rotated.status, 200);
  assert.ok(!rotated.body.player_url.includes(table.deviceKey));
  await gone;
  assert.equal((await fetch(`${t.base}/api/player/bootstrap?key=${table.deviceKey}`)).status, 401);
});

test('order scenes: only active orders, never from designers; a paid order always leaves the table', async () => {
  const own = makeTable(t, { number: 21, projector: false });
  const order = (await t.as.waiter.post('/api/orders', { table_id: own.tableId, items: [{ dish_id: menu.dishIds[0], quantity: 1 }] })).body;
  const put = (who, scene) => t.as[who].put(`/api/tables/${own.tableId}/scene`, { scene });

  const designer = await put('designer', { type: 'order', orderId: order.id });
  assert.equal(designer.status, 403, 'designers do not see orders');
  assert.equal((await put('designer', { type: 'menu' })).status, 200, 'but test the menu scenes');

  // The waiter shows it; designers learn the scene type but never the order itself.
  const designerLive = t.live(t.as.designer);
  const waiterLive = t.live(t.as.waiter);
  await Promise.all([connected(designerLive), connected(waiterLive)]);
  const toDesigner = nextEvent(designerLive, 'scene');
  const toWaiter = nextEvent(waiterLive, 'scene');
  assert.equal((await put('waiter', { type: 'order', orderId: order.id })).status, 200);
  assert.equal((await toWaiter).scene.order.id, order.id);
  const seen = (await toDesigner).scene;
  assert.equal(seen.type, 'order');
  assert.ok(!('order' in seen), 'live scene without the order for designers');
  assert.ok(!('order' in (await t.as.designer.get(`/api/tables/${own.tableId}/scene`)).body.scene));
  assert.ok(!('order' in (await t.as.designer.get(`/api/tables/${own.tableId}/preview-bootstrap`)).body.scene));
  assert.equal((await t.as.waiter.get(`/api/tables/${own.tableId}/scene`)).body.scene.order.id, order.id);

  // Then the table is freed by hand before payment.
  await t.as.waiter.patch(`/api/tables/${own.tableId}/status`, { status: 'free' });
  for (const status of ['served', 'paid']) await t.as.waiter.patch(`/api/orders/${order.id}`, { status });
  assert.equal((await t.as.waiter.get(`/api/tables/${own.tableId}/scene`)).body.scene.type, 'welcome', 'the next guests never see it');

  const again = await put('owner', { type: 'order', orderId: order.id });
  assert.equal(again.status, 400, 'a paid order cannot be put back on the table');
});

test('renumbering a table re-bootstraps its projector with the new number', async () => {
  const own = makeTable(t, { number: 22 });
  const player = ackingPlayer(own.deviceKey);
  await nextEvent(player, 'bootstrap');
  const reboot = nextEvent(player, 'bootstrap');
  assert.equal((await t.as.owner.patch(`/api/tables/${own.tableId}`, { number: 23 })).status, 200);
  assert.equal((await reboot).table.number, 23);
});

test('a dish moved into a hidden category stops showing on the table', async () => {
  const own = makeTable(t, { number: 24, projector: false });
  const hidden = makeMenu(t, { visible: false, dishes: [] });
  const res = await t.as.waiter.put(`/api/tables/${own.tableId}/scene`, { scene: { type: 'dish', dishId: menu.dishIds[0] } });
  assert.equal(res.status, 200);
  assert.equal((await t.as.designer.patch(`/api/dishes/${menu.dishIds[0]}`, { category_id: hidden.categoryId })).status, 200);
  assert.equal((await t.as.waiter.get(`/api/tables/${own.tableId}/scene`)).body.scene.type, 'welcome');
  await t.as.designer.patch(`/api/dishes/${menu.dishIds[0]}`, { category_id: menu.categoryId });
});

test('delivery counts projectors, not sockets (a stale second socket of the same projector)', async () => {
  const own = makeTable(t, { number: 25 });
  const first = ackingPlayer(own.deviceKey);
  await nextEvent(first, 'bootstrap');
  const second = ackingPlayer(own.deviceKey);
  await nextEvent(second, 'bootstrap');
  const res = await t.as.waiter.put(`/api/tables/${own.tableId}/scene`, { scene: { type: 'menu' } });
  assert.deepEqual(res.body.delivered, { online: 1, acked: 1 });
});

test('the test pattern is remembered for a projector that connects later', async () => {
  const own = makeTable(t, { number: 26 });
  const tp = await t.as.designer.post(`/api/projectors/${own.projectorId}/test-pattern`, { on: true });
  assert.deepEqual(tp.body, { on: true, delivered: { online: 0 } });
  assert.equal((await t.as.designer.get(`/api/projectors/${own.projectorId}`)).body.test_pattern, true);

  const player = ackingPlayer(own.deviceKey);
  const pattern = nextEvent(player, 'test-pattern');
  await nextEvent(player, 'bootstrap');
  assert.deepEqual(await pattern, { on: true });

  const off = nextEvent(player, 'test-pattern');
  await t.as.designer.post(`/api/projectors/${own.projectorId}/test-pattern`, { on: false });
  assert.deepEqual(await off, { on: false });
  assert.equal((await t.as.designer.get(`/api/projectors/${own.projectorId}`)).body.test_pattern, false);
});
