// Cloud mode end to end on the Firebase emulators: several "devices" (each
// its own Firebase app and session) run the cloud host side by side — the
// owner's phone, a waiter's tablet, the designer's laptop and a projector —
// and see each other's changes through Firestore only.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { CONFIG, EMULATORS, closeAllApps, loadCloud, loginAs, playerRecorder, resetEmulators, staffHost, waitFor } from './helpers.js';

let cloud;
let owner;
let waiter;
let designer;
let device;
let player;
const ids = {};
const opened = [];

before(async () => {
  await resetEmulators();
  cloud = await loadCloud();
});

after(async () => {
  for (const h of opened) await h.close().catch(() => {});
  await closeAllApps();
});

const track = (staff) => {
  opened.push(staff.host);
  return staff;
};

test('first run: the owner account is created on an empty project', async () => {
  const probe = await cloud.probeProject(CONFIG, { emulators: EMULATORS });
  assert.deepEqual(probe, { ok: true, needsSetup: true, restaurantName: null });

  owner = track(await staffHost(cloud, 'owner'));
  assert.deepEqual((await owner.call('GET', '/auth/state')).data, { needsSetup: true, user: null });
  assert.equal((await owner.call('GET', '/floor')).status, 401);
  const bad = await owner.call('POST', '/auth/setup', { name: 'المالك', username: 'owner', password: '12' });
  assert.equal(bad.status, 400);
  const setup = await owner.call('POST', '/auth/setup', { name: 'المالك', username: 'owner', password: '1234' });
  assert.equal(setup.status, 201, JSON.stringify(setup.data));
  assert.equal(setup.data.user.role, 'owner');
  assert.equal((await owner.call('GET', '/auth/state')).data.user.username, 'owner');
  assert.equal((await owner.call('POST', '/auth/setup', { name: 'x', username: 'x', password: '1234' })).status, 409);

  const after = await cloud.probeProject(CONFIG, { emulators: EMULATORS });
  assert.equal(after.needsSetup, false);
  assert.equal(after.restaurantName, 'مطعم الشمس');
});

test('the owner builds the restaurant and creates staff accounts', async () => {
  const area = await owner.call('POST', '/areas', { name: 'الصالة' });
  assert.equal(area.status, 201, JSON.stringify(area.data));
  for (const number of [1, 2]) {
    const t = await owner.call('POST', '/tables', { number, area_id: area.data.id, seats: 4 });
    assert.equal(t.status, 201, JSON.stringify(t.data));
    ids[`table${number}`] = t.data.id;
  }
  const cat = await owner.call('POST', '/categories', { name_ar: 'مشاوي' });
  assert.equal(cat.status, 201);
  ids.category = cat.data.id;
  const dish = await owner.call('POST', '/dishes', { name_ar: 'كباب', price: 12000, category_id: cat.data.id });
  assert.equal(dish.status, 201);
  assert.equal(dish.data.price, 12000);
  ids.dish = dish.data.id;
  const dish2 = await owner.call('POST', '/dishes', { name_ar: 'تكة', price: 9000, category_id: cat.data.id });
  ids.dish2 = dish2.data.id;

  for (const [username, role] of [['waiter1', 'waiter'], ['designer1', 'designer']]) {
    const u = await owner.call('POST', '/users', { name: username, username, password: '1111', role });
    assert.equal(u.status, 201, JSON.stringify(u.data));
    assert.equal(u.data.role, role);
    ids[username] = u.data.id;
  }
  assert.equal((await owner.call('POST', '/users', { name: 'x', username: 'WAITER1', password: '1111', role: 'waiter' })).status, 409);
  const users = (await owner.call('GET', '/users')).data;
  assert.equal(users.length, 3);
  assert.ok(users.every((u) => !('password' in u) && !('uid' in u)), 'no secrets in the user list');

  const floor = (await owner.call('GET', '/floor')).data;
  assert.deepEqual(floor.areas[0].tables.map((t) => t.number), [1, 2]);
});

test('staff sign in with username + password on their own devices', async () => {
  waiter = track(await staffHost(cloud, 'waiter'));
  assert.equal((await waiter.call('POST', '/auth/login', { username: 'waiter1', password: 'nope' })).status, 401);
  assert.equal((await waiter.call('POST', '/auth/login', { username: 'nobody', password: '1111' })).status, 401);
  const me = await loginAs(waiter, 'Waiter1', '1111');
  assert.equal(me.role, 'waiter');
  assert.deepEqual(waiter.host.currentUser(), me);
  const menu = (await waiter.call('GET', '/menu')).data;
  assert.equal(menu.categories[0].dishes.length, 2);
  assert.equal((await waiter.call('GET', '/users')).status, 403);

  designer = track(await staffHost(cloud, 'designer'));
  assert.equal((await loginAs(designer, 'designer1', '1111')).role, 'designer');
  await waitFor(() => waiter.saw('live:connected'), { label: 'live:connected' });
});

test('a menu edit on one device reaches the others as menu:changed', async () => {
  owner.clear();
  waiter.clear();
  const res = await designer.call('PATCH', `/dishes/${ids.dish}`, { description_ar: 'مشوي على الفحم' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  await waitFor(() => owner.saw('menu:changed') && waiter.saw('menu:changed'), { label: 'menu:changed on other hosts' });
  const dish = (await waiter.call('GET', `/dishes/${ids.dish}`)).data;
  assert.equal(dish.description_ar, 'مشوي على الفحم');

  // Prices stay the owner's (the app says so; the rules enforce it too).
  const price = await designer.call('PATCH', `/dishes/${ids.dish}`, { price: 1 });
  assert.deepEqual([price.status, price.data.error], [403, 'تعديل الأسعار من صلاحيات المالك']);
  const newDish = await designer.call('POST', '/dishes', { name_ar: 'سلطة', category_id: ids.category });
  assert.equal(newDish.status, 201);
  assert.equal(newDish.data.price, 0);
});

test('pairing: the owner makes a code, the projector device claims it', async () => {
  const code = await owner.call('POST', '/projectors/pairing-codes', { table_id: ids.table1, name: 'سقف 1' });
  assert.equal(code.status, 201, JSON.stringify(code.data));
  assert.match(code.data.code, /^\d{6}$/);
  // Not on the floor until a device claims it (the pairing dialog waits for it).
  assert.equal((await owner.call('GET', `/tables/${ids.table1}`)).data.projectors.length, 0);

  await assert.rejects(cloud.claimProjector(CONFIG, '000000', { emulators: EMULATORS, appName: 'projector-1' }), /رمز الربط غير صحيح/);
  await assert.rejects(cloud.claimProjector(CONFIG, '12', { emulators: EMULATORS, appName: 'projector-1' }), /6 أرقام/);
  owner.clear();
  const claimed = await cloud.claimProjector(CONFIG, code.data.code, { emulators: EMULATORS, appName: 'projector-1' });
  assert.equal(claimed.projector.name, 'سقف 1');
  assert.deepEqual(claimed.table, { id: ids.table1, number: 1 });
  assert.equal(claimed.restaurantName, 'مطعم الشمس');
  // Single use.
  await assert.rejects(cloud.claimProjector(CONFIG, code.data.code, { emulators: EMULATORS, appName: 'projector-2' }), /رمز الربط غير صحيح/);

  await waitFor(() => owner.saw('floor:changed'), { label: 'floor:changed after the claim' });
  const table = (await owner.call('GET', `/tables/${ids.table1}`)).data;
  assert.equal(table.projectors.length, 1);
  assert.equal(table.projectors[0].online, true, 'a claimed projector is online');
  ids.projector = table.projectors[0].id;
  const list = (await designer.call('GET', '/projectors')).data;
  assert.equal(list[0].table_number, 1);
});

test('the projector player gets its bootstrap from Firestore', async () => {
  device = await cloud.createCloudHost(CONFIG, { role: 'device', emulators: EMULATORS, appName: 'projector-1' });
  opened.push(device);
  player = playerRecorder();
  device.openDevice('ignored', player.on);
  const boot = await waitFor(() => player.last('bootstrap'), { label: 'bootstrap' });
  assert.equal(boot.projector.id, ids.projector);
  assert.deepEqual(boot.table, { id: ids.table1, number: 1, area_name: 'الصالة' });
  assert.deepEqual(boot.scene, { type: 'welcome' });
  assert.equal(boot.menu.categories[0].name_ar, 'مشاوي');
  // Unavailable / zero-price dishes follow the server's player menu rules.
  assert.ok(boot.menu.categories[0].dishes.some((d) => d.id === ids.dish));
  assert.equal(boot.settings.general.restaurantName, 'مطعم الشمس');
  assert.equal(player.last('online'), true);
  assert.equal(player.last('testPattern'), false);

  // Menu edits re-bootstrap the player (debounced).
  const before = player.count('bootstrap');
  await owner.call('PATCH', `/dishes/${ids.dish2}`, { name_ar: 'تكة لحم' });
  await waitFor(() => player.count('bootstrap') > before, { label: 'bootstrap after a menu edit' });
  assert.ok(player.last('bootstrap').menu.categories[0].dishes.some((d) => d.name_ar === 'تكة لحم'));
});

test('order flow: waiter orders, the table shows the order, the projector acks', async () => {
  owner.clear();
  const order = await waiter.call('POST', '/orders', { table_id: ids.table1, items: [{ dish_id: ids.dish, quantity: 2 }, { dish_id: ids.dish2 }] });
  assert.equal(order.status, 201, JSON.stringify(order.data));
  assert.equal(order.data.total, 12000 * 2 + 9000);
  assert.deepEqual(order.data.items.map((i) => i.id), [1, 2], 'item ids are per order');
  ids.order = order.data.id;
  await waitFor(() => owner.saw('order', (o) => o.id === ids.order), { label: 'order event on the owner' });
  assert.equal((await owner.call('GET', `/tables/${ids.table1}`)).data.status, 'occupied');
  assert.equal((await designer.call('GET', '/orders')).status, 403);

  const shown = await waiter.call('PUT', `/tables/${ids.table1}/scene`, { scene: { type: 'order', orderId: ids.order } });
  assert.equal(shown.status, 200, JSON.stringify(shown.data));
  assert.deepEqual(shown.data.delivered, { online: 1, acked: 1 });
  assert.equal(shown.data.scene.order.total, order.data.total);
  const scene = await waitFor(() => player.last('scene')?.type === 'order' && player.last('scene'), { label: 'order scene on the player' });
  assert.equal(scene.order.id, ids.order);

  // Designers never see order snapshots.
  assert.equal((await designer.call('GET', `/tables/${ids.table1}/scene`)).data.scene.order, undefined);
  assert.equal((await designer.call('GET', `/tables/${ids.table1}/preview-bootstrap`)).data.scene.order, undefined);
  await waitFor(() => designer.saw('scene', (p) => p.tableId === ids.table1 && p.scene.type === 'order'), { label: 'scene event on the designer' });
  assert.ok(designer.events.filter((e) => e.event === 'scene').every((e) => !('order' in e.payload.scene)));
  assert.ok(!designer.saw('order'), 'designers get no order events');
  assert.equal((await designer.call('PUT', `/tables/${ids.table1}/scene`, { scene: { type: 'order', orderId: ids.order } })).status, 403);

  // Item added: the projector gets the new version of the order.
  const added = await waiter.call('POST', `/orders/${ids.order}/items`, { dish_id: ids.dish2, quantity: 1, notes: 'بدون بصل' });
  assert.equal(added.status, 201);
  assert.deepEqual(added.data.items.map((i) => i.id), [1, 2, 3]);
  await waitFor(() => player.last('order')?.items?.length === 3, { label: 'order update on the player' });

  // Status moves; paid frees the table and the table goes back to welcome.
  assert.equal((await waiter.call('PATCH', `/orders/${ids.order}`, { status: 'paid' })).status, 409);
  for (const status of ['preparing', 'served', 'paid']) {
    const res = await waiter.call('PATCH', `/orders/${ids.order}`, { status });
    assert.equal(res.data.status, status, JSON.stringify(res.data));
  }
  assert.equal((await waiter.call('GET', `/tables/${ids.table1}`)).data.status, 'free');
  assert.equal((await waiter.call('GET', `/tables/${ids.table1}/scene`)).data.scene.type, 'welcome');
  await waitFor(() => player.last('scene')?.type === 'welcome', { label: 'welcome scene on the player' });
  await waitFor(async () => (await owner.call('GET', '/orders')).data.length === 0, { label: 'no active orders on the owner' });
});

test('the player preview in the staff app follows the table (designers without orders)', async () => {
  const preview = playerRecorder();
  owner.host.openPreview(ids.table1, preview.on);
  const boot = await waitFor(() => preview.last('bootstrap'), { label: 'preview bootstrap' });
  assert.equal(boot.table.number, 1);
  assert.equal(boot.projector.id, ids.projector);
  assert.equal(preview.last('online'), true);
  await owner.call('PUT', `/tables/${ids.table1}/scene`, { scene: { type: 'menu' } });
  await waitFor(() => preview.last('scene')?.type === 'menu', { label: 'preview scene' });

  const designerPreview = playerRecorder();
  designer.host.openPreview(ids.table1, designerPreview.on);
  await waitFor(() => designerPreview.last('bootstrap'), { label: 'designer preview bootstrap' });
  assert.equal(await designer.host.openPreview(ids.table1, playerRecorder().on).fetchOrder(ids.order), null);

  const missing = playerRecorder();
  owner.host.openPreview(999, missing.on);
  await waitFor(() => missing.last('fatal') === 'missing', { label: 'preview of a missing table' });
  await owner.call('PUT', `/tables/${ids.table1}/scene`, { scene: { type: 'welcome' } });
});

test('test pattern and calibration reach the projector', async () => {
  const on = await designer.call('POST', `/projectors/${ids.projector}/test-pattern`, { on: true });
  assert.deepEqual(on.data, { on: true, delivered: { online: 1 } });
  await waitFor(() => player.last('testPattern') === true, { label: 'test pattern on' });
  assert.equal((await owner.call('GET', `/projectors/${ids.projector}`)).data.test_pattern, true);
  const corners = [[0.01, 0], [1, 0.02], [0.99, 1], [0, 0.98]];
  const cal = await designer.call('PUT', `/projectors/${ids.projector}/calibration`, { corners });
  assert.equal(cal.status, 200, JSON.stringify(cal.data));
  await waitFor(() => JSON.stringify(player.last('projector')?.calibration?.corners) === JSON.stringify(corners), { label: 'calibration on the player' });
  await designer.call('POST', `/projectors/${ids.projector}/test-pattern`, { on: false });
  await waitFor(() => player.last('testPattern') === false, { label: 'test pattern off' });
  // PJLink needs the LAN.
  assert.deepEqual((await owner.call('GET', `/projectors/${ids.projector}/power`)).data, { supported: false, power: null });
  assert.equal((await owner.call('POST', `/projectors/${ids.projector}/power`, { on: true })).status, 501);
});

test('ids stay unique when two devices create at the same time', async () => {
  const make = (staff, n) => Array.from({ length: n }, () => staff.call('POST', '/orders', { table_id: ids.table2, items: [{ dish_id: ids.dish }] }));
  const results = await Promise.all([...make(waiter, 4), ...make(owner, 4)]);
  assert.ok(results.every((r) => r.status === 201), JSON.stringify(results.map((r) => r.data)));
  const orderIds = results.map((r) => r.data.id);
  assert.equal(new Set(orderIds).size, orderIds.length, `unique order ids: ${orderIds}`);
  await waitFor(async () => (await owner.call('GET', '/orders')).data.length === 8, { label: 'all 8 orders on the owner' });
  await waitFor(async () => (await waiter.call('GET', '/orders')).data.length === 8, { label: 'all 8 orders on the waiter' });

  const cats = await Promise.all([owner.call('POST', '/categories', { name_ar: 'أ' }), designer.call('POST', '/categories', { name_ar: 'ب' }), owner.call('POST', '/categories', { name_ar: 'ج' })]);
  const catIds = cats.map((r) => r.data.id);
  assert.equal(new Set(catIds).size, 3, `unique category ids: ${catIds}`);
  for (const r of results) await waiter.call('PATCH', `/orders/${r.data.id}`, { status: 'cancelled' });
});

test('reports, history and activity come from on-demand queries', async () => {
  const report = (await owner.call('GET', '/reports/summary')).data;
  assert.equal(report.byDay.length, 7);
  assert.equal(report.totals.orders, 1);
  assert.equal(report.totals.revenue, 12000 * 2 + 9000 * 2);
  assert.equal(report.byWaiter[0].name, 'waiter1');
  assert.equal(report.topDishes[0].dish_id, ids.dish);

  const paid = (await owner.call('GET', '/orders?status=paid')).data;
  assert.deepEqual(paid.map((o) => o.id), [ids.order]);
  assert.equal((await owner.call('GET', '/orders?status=all')).data.length, 9);
  assert.equal((await owner.call('GET', '/orders?status=nope')).status, 400);
  assert.equal((await owner.call('GET', `/orders/${ids.order}`)).data.status, 'paid');

  const activity = (await owner.call('GET', '/activity?limit=200')).data;
  const codes = activity.map((a) => a.code);
  for (const code of ['auth.setup', 'auth.login', 'user.create', 'dish.create', 'order.status', 'projector.pairing-code']) assert.ok(codes.includes(code), `activity has ${code}`);
  assert.equal(new Set(activity.map((a) => a.id)).size, activity.length, 'unique activity ids');
  assert.ok(activity.find((a) => a.code === 'auth.setup').user_name === 'المالك');
  assert.equal((await waiter.call('GET', '/activity')).status, 403);
  assert.equal((await waiter.call('GET', '/reports/summary')).status, 403);
});

test('media upload to Storage and delete', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3, 4]);
  const progress = [];
  const up = await designer.host.request({ method: 'POST', url: '/api/media', file: new File([png], 'logo.png', { type: 'image/png' }), fields: { title: 'الشعار', onProgress: (p) => progress.push(p) } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.equal(up.data.title, 'الشعار');
  assert.equal(up.data.kind, 'image');
  assert.match(up.data.url, /^http:\/\/127\.0\.0\.1:9199\/.+media%2F\d+%2Fupload-\d+\.png/);
  assert.equal(progress.at(-1), 1);
  const res = await fetch(up.data.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');

  const fake = await designer.host.request({ method: 'POST', url: '/api/media', file: new File([new Uint8Array(20)], 'x.png'), fields: {} });
  assert.equal(fake.status, 400);
  assert.equal((await waiter.host.request({ method: 'POST', url: '/api/media', file: new File([png], 'a.png'), fields: {} })).status, 403);

  await waitFor(async () => (await owner.call('GET', '/media')).data.length === 1, { label: 'media on the owner' });
  assert.equal((await owner.call('PUT', '/settings/general', { logoAssetId: up.data.id })).status, 200);
  await waitFor(async () => (await designer.call('GET', '/settings')).data.logo_url === up.data.url, { label: 'the logo on the designer' });
  assert.equal((await designer.call('DELETE', `/media/${up.data.id}`)).status, 409, 'a used file cannot be deleted');
  await owner.call('PUT', '/settings/general', { logoAssetId: null });
  await waitFor(async () => (await designer.call('GET', '/settings')).data.logo_url === null, { label: 'no logo on the designer' });
  assert.equal((await designer.call('DELETE', `/media/${up.data.id}`)).status, 200);
  // Gone from Storage (the emulator answers 403 for a deleted object's URL, production 404).
  await waitFor(async () => [403, 404].includes((await fetch(up.data.url)).status), { label: 'Storage object deleted' });
});

test('accounts: own password, reset by the owner, deactivation kick the session', async () => {
  // Own password (re-authenticates with the current one).
  assert.equal((await waiter.call('POST', '/me/password', { current: 'nope', next: '2222' })).status, 400);
  assert.equal((await waiter.call('POST', '/me/password', { current: '1111', next: '2222' })).status, 200);

  // The owner resets it: a new Auth account; the waiter's open app is kicked.
  waiter.clear();
  const reset = await owner.call('PATCH', `/users/${ids.waiter1}`, { password: '3333' });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  await waitFor(() => waiter.saw('live:kicked'), { label: 'live:kicked after a password reset' });
  assert.equal(waiter.host.currentUser(), null);
  assert.equal((await waiter.call('GET', '/auth/state')).data.user, null);
  assert.equal((await waiter.call('POST', '/auth/login', { username: 'waiter1', password: '2222' })).status, 401);
  assert.equal((await loginAs(waiter, 'waiter1', '3333')).id, ids.waiter1);
  assert.equal((await waiter.call('GET', '/floor')).status, 200);

  // Role change: the session follows it.
  waiter.clear();
  assert.equal((await owner.call('PATCH', `/users/${ids.waiter1}`, { role: 'designer' })).status, 200);
  await waitFor(() => waiter.saw('live:kicked'), { label: 'live:kicked after a role change' });
  assert.equal((await waiter.call('GET', '/auth/state')).data.user.role, 'designer');
  assert.equal((await waiter.call('GET', '/orders')).status, 403);
  assert.equal((await owner.call('PATCH', `/users/${ids.waiter1}`, { role: 'waiter' })).status, 200);
  await waitFor(async () => (await waiter.call('GET', '/auth/state')).data.user?.role === 'waiter', { label: 'back to waiter' });

  // Deactivation signs the designer out everywhere.
  designer.clear();
  assert.equal((await owner.call('DELETE', `/users/${ids.designer1}`)).status, 200);
  await waitFor(() => designer.saw('live:kicked'), { label: 'live:kicked after deactivation' });
  assert.equal(designer.host.currentUser(), null);
  assert.equal((await designer.call('POST', '/auth/login', { username: 'designer1', password: '1111' })).status, 401);
  assert.equal((await owner.call('DELETE', `/users/${ids.waiter1 - 99}`)).status, 404);
});

test('unpairing ("rotate key") cuts the projector off', async () => {
  const res = await owner.call('POST', `/projectors/${ids.projector}/rotate-key`, {});
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.online, false);
  await waitFor(() => player.last('fatal') === 'unauthorized', { label: 'device fatal' });
  await waitFor(() => owner.saw('projector:status', (p) => p.id === ids.projector && p.online === false), { label: 'projector:status offline' });
  // Nobody acks a table without an online projector.
  const shown = await owner.call('PUT', `/tables/${ids.table1}/scene`, { scene: { type: 'menu' } });
  assert.deepEqual(shown.data.delivered, { online: 0, acked: 0 });
});
