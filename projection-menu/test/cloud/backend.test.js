// Cloud mode end to end on the Firebase emulators: several "devices" (each
// its own Firebase app and session) run the cloud host side by side — the
// owner's phone, a waiter's tablet, the designer's laptop and a projector —
// and see each other's changes through Firestore only.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { resolveObjectURL } from 'node:buffer';
import { CONFIG, EMULATORS, STORAGE_CONFIG, adminList, closeAllApps, loadCloud, loginAs, playerRecorder, resetEmulators, staffHost, waitFor } from './helpers.js';

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
  // The player shows the snapshot embedded in the scene: it comes again, updated.
  await waitFor(() => player.last('scene')?.order?.items?.length === 3, { label: 'order scene refreshed on the player' });

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

// Media files of a test, made without a codec: valid signatures + filler.
const filler = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 13 + seed) & 255);
const withHead = (head, n, seed = 1) => {
  const bytes = filler(n, seed);
  bytes.set(head);
  return bytes;
};
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52];
const WEBP_HEAD = [...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0)));
const WEBM_HEAD = [0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0];
const blobBytes = async (url) => new Uint8Array(await resolveObjectURL(url).arrayBuffer());
const chunksOf = async (assetId) => (await adminList('mediaChunks')).filter((d) => d.id.startsWith(`${assetId}_`));

// What a browser does before uploading a photo (media.js browserImageEncoder):
// here a "4000×3000 photo" becomes a 1600×1200 WebP of 300 KB.
const encoded = withHead(WEBP_HEAD, 300 * 1024, 5);
const fakeEncoder = async () => ({ blob: new Blob([encoded], { type: 'image/webp' }), width: 1600, height: 1200, scaled: true });

let studio; // the designer's laptop, with an image encoder
test('media in Firestore: photos are compressed, then stored in chunks with the library entry last', async () => {
  studio = track(await staffHost(cloud, 'studio', { imageEncoder: fakeEncoder }));
  await loginAs(studio, 'designer1', '1111');
  const photo = new File([withHead(PNG_HEAD, 2 * 1024 * 1024)], 'kebab.png', { type: 'image/png' });
  const progress = [];
  const up = await studio.host.request({ method: 'POST', url: '/api/media', file: photo, fields: { title: 'كباب', onProgress: (p) => progress.push(p) } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const a = up.data;
  ids.photo = a.id;
  assert.deepEqual([a.kind, a.title, a.storage, a.chunks, a.mime_type, a.size_bytes, a.width, a.height], ['image', 'كباب', 'firestore', 1, 'image/webp', encoded.length, 1600, 1200]);
  assert.equal(a.file_name, `upload-${a.id}.webp`);
  assert.equal(a.original_name, 'kebab.png');
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.equal(a.rev, a.sha256.slice(0, 16));
  assert.equal(progress.at(-1), 1);
  // The uploading device shows it at once (its own bytes, no download).
  assert.match(a.url, /^blob:/);
  assert.deepEqual(await blobBytes(a.url), encoded);
  const chunks = await chunksOf(a.id);
  assert.deepEqual(chunks.map((c) => c.id), [`${a.id}_0`]);
  assert.equal(chunks[0].fields.assetId.integerValue, String(a.id));
  assert.ok('bytesValue' in chunks[0].fields.data, 'Firestore Bytes, not base64 text');
  assert.equal((await adminList('media')).find((d) => d.id === String(a.id)).fields.url.nullValue, null);
});

test('media in Firestore: a video of several chunks reaches the projector as a working blob', async () => {
  const clip = withHead(WEBM_HEAD, Math.round(2.2 * 1024 * 1024), 9); // 3 chunks of ≤ 900 KB
  const progress = [];
  const up = await studio.host.request({ method: 'POST', url: '/api/media', file: new File([clip], 'grill.webm'), fields: { onProgress: (p) => progress.push(p) } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  ids.clip = up.data.id;
  ids.clipRev = up.data.rev;
  assert.deepEqual([up.data.kind, up.data.chunks, up.data.size_bytes, up.data.mime_type], ['video', 3, clip.length, 'video/webm']);
  assert.deepEqual(progress.map((p) => p.toFixed(2)), ['0.33', '0.67', '1.00'], 'real progress: chunks written / total');
  assert.equal((await chunksOf(ids.clip)).length, 3);

  // The designer puts both on a dish; the projector (another device) loads
  // them from Firestore and is re-bootstrapped when they are there.
  assert.equal((await studio.call('PATCH', `/dishes/${ids.dish}`, { image_asset_id: ids.photo, video_asset_id: ids.clip })).status, 200);
  const dishOnPlayer = () => player.last('bootstrap')?.menu.categories[0].dishes.find((d) => d.id === ids.dish);
  const shown = await waitFor(() => dishOnPlayer()?.video_url && dishOnPlayer()?.image_url && dishOnPlayer(), { label: 'media URLs on the player', timeout: 15000 });
  assert.match(shown.video_url, /^blob:/);
  assert.deepEqual(await blobBytes(shown.video_url), clip, 'the video, byte for byte');
  assert.deepEqual(await blobBytes(shown.image_url), encoded);
  // Kept on the projector: asked again, no second download.
  assert.equal(device.media.url({ id: ids.clip, storage: 'firestore', rev: up.data.rev }), shown.video_url);

  // Other staff devices get the file lazily, when a screen needs it, and
  // their screens are refreshed when it is there.
  waiter.clear();
  const dishOnWaiter = async () => (await waiter.call('GET', '/menu')).data.categories[0].dishes.find((d) => d.id === ids.dish);
  assert.equal((await dishOnWaiter()).video_asset_id, ids.clip);
  await waitFor(async () => (await dishOnWaiter()).video_url?.startsWith('blob:'), { label: 'the video on the waiter', timeout: 15000 });
  await waitFor(() => waiter.saw('menu:changed'), { label: 'menu:changed when the file arrived' });
  await waitFor(async () => (await owner.call('GET', '/media')).data.find((m) => m.id === ids.clip)?.url?.startsWith('blob:'), { label: 'the file in the owner library', timeout: 15000 });
});

test('media in Firestore: cancel, limits and roles', async () => {
  const before = (await adminList('mediaChunks')).length;
  const clip = () => new File([withHead(WEBM_HEAD, 2 * 1024 * 1024, 3)], 'c.webm');
  const early = new AbortController();
  early.abort();
  assert.equal((await studio.host.request({ method: 'POST', url: '/api/media', file: clip(), fields: { signal: early.signal } })).status, 499);
  // Cancelled after the first chunk: 499, no library entry, its chunks deleted.
  const during = new AbortController();
  const midway = await studio.host.request({ method: 'POST', url: '/api/media', file: clip(), fields: { signal: during.signal, onProgress: () => during.abort() } });
  assert.deepEqual([midway.status, midway.data.error], [499, 'أُلغي الرفع']);
  assert.ok(!(await studio.call('GET', '/media')).data.some((m) => m.original_name === 'c.webm'));
  await waitFor(async () => (await adminList('mediaChunks')).length === before, { label: 'chunks of the cancelled upload deleted' });

  const big = await studio.host.request({ method: 'POST', url: '/api/media', file: new File([withHead(WEBM_HEAD, 21 * 1024 * 1024)], 'long.webm'), fields: {} });
  assert.equal(big.status, 413);
  assert.match(big.data.error, /الحد الأقصى 20 ميغابايت/);
  const model = await studio.host.request({ method: 'POST', url: '/api/media', file: new File([withHead([0x67, 0x6c, 0x54, 0x46], 16 * 1024 * 1024)], 'm.glb'), fields: {} });
  assert.equal(model.status, 413);
  assert.match(model.data.error, /الحد الأقصى 15 ميغابايت/);

  const png = withHead(PNG_HEAD, 64);
  assert.equal((await studio.host.request({ method: 'POST', url: '/api/media', file: new File([new Uint8Array(20)], 'x.png'), fields: {} })).status, 400);
  assert.equal((await waiter.host.request({ method: 'POST', url: '/api/media', file: new File([png], 'a.png'), fields: {} })).status, 403);
  assert.equal((await adminList('mediaChunks')).length, before, 'refused uploads write nothing');
});

test('media in Firestore: the logo shows everywhere; delete removes the file and its chunks', async () => {
  // No encoder on this device (as in Node): the PNG is stored as it is.
  const png = withHead(PNG_HEAD, 4096, 4);
  const up = await designer.host.request({ method: 'POST', url: '/api/media', file: new File([png], 'logo.png', { type: 'image/png' }), fields: { title: 'الشعار' } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.deepEqual([up.data.mime_type, up.data.size_bytes, up.data.file_name], ['image/png', png.length, `upload-${up.data.id}.png`]);
  await waitFor(async () => (await owner.call('GET', '/media')).data.some((m) => m.id === up.data.id), { label: 'the new file on the owner' });
  owner.clear();
  assert.equal((await owner.call('PUT', '/settings/general', { logoAssetId: up.data.id })).status, 200);
  await waitFor(() => owner.saw('settings:changed'), { label: 'settings:changed when the logo arrives on the owner' });
  const logo = (await owner.call('GET', '/settings')).data.logo_url;
  assert.match(logo, /^blob:/);
  assert.deepEqual(await blobBytes(logo), png);
  await waitFor(() => player.last('bootstrap')?.settings.logo_url?.startsWith('blob:'), { label: 'the logo on the projector' });

  assert.equal((await designer.call('DELETE', `/media/${up.data.id}`)).status, 409, 'a used file cannot be deleted');
  await owner.call('PUT', '/settings/general', { logoAssetId: null });
  await waitFor(async () => (await designer.call('GET', '/settings')).data.logo_url === null, { label: 'no logo on the designer' });
  assert.equal((await designer.call('DELETE', `/media/${up.data.id}`)).status, 200);
  assert.deepEqual(await chunksOf(up.data.id), [], 'chunks deleted with the library entry');

  // The dish's video too, once it is no longer used.
  assert.equal((await studio.call('PATCH', `/dishes/${ids.dish}`, { video_asset_id: null })).status, 200);
  assert.equal((await studio.call('DELETE', `/media/${ids.clip}`)).status, 200);
  assert.deepEqual(await chunksOf(ids.clip), []);
  await waitFor(() => device.media.status({ id: ids.clip, storage: 'firestore', rev: ids.clipRev }) === null && !player.last('bootstrap')?.menu.categories[0].dishes.find((d) => d.id === ids.dish)?.video_url, { label: 'the projector drops the deleted video' });
});

test('media in Firebase Storage (a Blaze project with media: storage) still works', async () => {
  const blaze = track(await staffHost(cloud, 'blaze', { config: STORAGE_CONFIG }));
  await loginAs(blaze, 'designer1', '1111');
  const png = new Uint8Array(PNG_HEAD.concat([1, 2, 3, 4]));
  const progress = [];
  const up = await blaze.host.request({ method: 'POST', url: '/api/media', file: new File([png], 'logo.png', { type: 'image/png' }), fields: { title: 'الشعار', onProgress: (p) => progress.push(p) } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.equal(up.data.title, 'الشعار');
  assert.equal(up.data.kind, 'image');
  assert.equal(up.data.storage, undefined);
  assert.match(up.data.url, /^http:\/\/127\.0\.0\.1:9199\/.+media%2F\d+%2Fupload-\d+\.png/);
  assert.equal(progress.at(-1), 1);
  const res = await fetch(up.data.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');

  // Cancelled from the app (the XHR shim's abort() -> fields.signal): 499, no library entry.
  const before = (await blaze.call('GET', '/media')).data.length;
  const early = new AbortController();
  early.abort();
  const cancel = (fields) => blaze.host.request({ method: 'POST', url: '/api/media', file: new File([png], 'c.png', { type: 'image/png' }), fields });
  assert.equal((await cancel({ signal: early.signal })).status, 499);
  const during = new AbortController();
  const midway = await cancel({ signal: during.signal, onProgress: () => during.abort() });
  assert.deepEqual([midway.status, midway.data.error], [499, 'أُلغي الرفع']);
  assert.equal((await blaze.call('GET', '/media')).data.length, before);

  // Other devices (Firestore mode or not) show a Storage file by its URL.
  await waitFor(async () => (await owner.call('GET', '/media')).data.find((m) => m.id === up.data.id)?.url === up.data.url, { label: 'the Storage file on the owner' });
  assert.equal((await blaze.call('DELETE', `/media/${up.data.id}`)).status, 200);
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

test('re-pairing: a code for an existing projector binds a new device to it', async () => {
  const code = await owner.call('POST', '/projectors/pairing-codes', { table_id: ids.table2, projector_id: ids.projector });
  assert.equal(code.status, 201, JSON.stringify(code.data));
  // On the code's table, offline until a device claims the code; still listed.
  const waiting = (await owner.call('GET', `/projectors/${ids.projector}`)).data;
  assert.deepEqual([waiting.table_id, waiting.online, waiting.last_seen_at], [ids.table2, false, null]);
  assert.equal((await owner.call('GET', '/projectors')).data.length, 1);

  const claimed = await cloud.claimProjector(CONFIG, code.data.code, { emulators: EMULATORS, appName: 'projector-3' });
  assert.equal(claimed.projector.id, ids.projector);
  assert.deepEqual(claimed.table, { id: ids.table2, number: 2 });
  const device3 = await cloud.createCloudHost(CONFIG, { role: 'device', emulators: EMULATORS, appName: 'projector-3' });
  opened.push(device3);
  const player3 = playerRecorder();
  device3.openDevice('ignored', player3.on);
  const boot = await waitFor(() => player3.last('bootstrap'), { label: 're-paired bootstrap' });
  assert.equal(boot.projector.id, ids.projector);
  assert.equal(boot.table.number, 2);
  await waitFor(async () => (await owner.call('GET', `/projectors/${ids.projector}`)).data.online === true, { label: 're-paired projector online' });
  assert.equal((await owner.call('GET', '/projectors')).data.length, 1, 'no second projector');

  // Another re-pair cuts this device off at once.
  assert.equal((await owner.call('POST', '/projectors/pairing-codes', { table_id: ids.table2, projector_id: ids.projector })).status, 201);
  await waitFor(() => player3.last('fatal') === 'unauthorized', { label: 'device cut off by a re-pair' });
  assert.equal((await owner.call('POST', '/projectors/pairing-codes', { table_id: ids.table2, projector_id: 999 })).status, 404);
});
