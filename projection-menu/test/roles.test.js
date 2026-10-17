// Role matrix: the server (not the UI) decides what each role may do.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { TINY_JPEG, fileForm, makeMenu, makeTable, startServer } from './helpers.js';

let t;
let table;
let menu;
before(async () => {
  t = await startServer();
  table = makeTable(t, { number: 5 });
  menu = makeMenu(t, { dishes: [{ name_ar: 'كباب', price: 12000 }] });
});
after(() => t.close());

const ALL = ['owner', 'designer', 'waiter'];

// [method, path, body, roles allowed]
const MATRIX = () => [
  ['GET', '/api/users', undefined, ['owner']],
  ['POST', '/api/users', { name: 'ن', username: `u${Math.random().toString(36).slice(2, 8)}`, password: 'abcd1', role: 'waiter' }, ['owner']],
  ['GET', '/api/floor', undefined, ALL],
  ['GET', '/api/tables', undefined, ALL],
  ['POST', '/api/areas', { name: 'قسم' }, ['owner']],
  ['POST', '/api/tables', { number: Math.floor(Math.random() * 9000) + 100 }, ['owner']],
  ['PATCH', `/api/tables/${table.tableId}/status`, { status: 'reserved' }, ['owner', 'waiter']],
  ['GET', '/api/projectors', undefined, ['owner', 'designer']],
  ['POST', '/api/projectors', { table_id: table.tableId, name: 'إضافي' }, ['owner']],
  ['PATCH', `/api/projectors/${table.projectorId}`, { layout: 'dual' }, ['owner']],
  ['PUT', `/api/projectors/${table.projectorId}/calibration`, { corners: [[0, 0], [1, 0], [1, 1], [0, 1]] }, ['owner', 'designer']],
  ['POST', `/api/projectors/${table.projectorId}/test-pattern`, { on: true }, ['owner', 'designer']],
  ['POST', '/api/projectors/pairing-codes', { table_id: table.tableId }, ['owner']],
  ['GET', '/api/menu', undefined, ALL],
  ['POST', '/api/categories', { name_ar: 'جديد' }, ['owner', 'designer']],
  ['PATCH', `/api/dishes/${menu.dishIds[0]}`, { description_ar: 'وصف' }, ['owner', 'designer']],
  ['PUT', '/api/categories/order', { ids: [menu.categoryId] }, ['owner', 'designer']],
  ['GET', '/api/media', undefined, ['owner', 'designer']],
  ['GET', '/api/settings', undefined, ALL],
  ['PUT', '/api/settings/general', { footerText: 'شكراً' }, ['owner']],
  ['PUT', '/api/settings/theme', { accent: '#c9a45c' }, ['owner', 'designer']],
  ['GET', `/api/tables/${table.tableId}/scene`, undefined, ALL],
  ['PUT', `/api/tables/${table.tableId}/scene`, { scene: { type: 'menu' } }, ALL],
  ['GET', `/api/tables/${table.tableId}/preview-bootstrap`, undefined, ALL],
  ['GET', '/api/orders', undefined, ['owner', 'waiter']],
  ['POST', '/api/orders', { table_id: table.tableId, items: [{ dish_id: menu.dishIds[0], quantity: 1 }] }, ['owner', 'waiter']],
  ['GET', '/api/reports/summary', undefined, ['owner']],
  ['GET', '/api/activity', undefined, ['owner']],
  ['GET', '/api/system/server-info', undefined, ['owner']],
];

test('every role gets exactly its rights; anonymous gets 401', async () => {
  const anon = t.client();
  const problems = [];
  for (const [method, url, body, allowed] of MATRIX()) {
    const a = await anon.request(method, url, body);
    if (a.status !== 401) problems.push(`anonymous ${method} ${url} -> ${a.status}`);
    for (const role of ALL) {
      const res = await t.as[role].request(method, url, body);
      const ok = allowed.includes(role);
      if (ok && res.status >= 400) problems.push(`${role} ${method} ${url} -> ${res.status} ${res.body?.error}`);
      if (!ok && res.status !== 403) problems.push(`${role} ${method} ${url} -> ${res.status} (expected 403)`);
    }
  }
  assert.deepEqual(problems, []);
});

test('designer cannot change prices (403 with a clear message) but edits everything else', async () => {
  const dishId = menu.dishIds[0];
  const res = await t.as.designer.patch(`/api/dishes/${dishId}`, { price: 15000 });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'تعديل الأسعار من صلاحيات المالك');
  assert.equal(t.db.prepare('SELECT price FROM dishes WHERE id = ?').pluck().get(dishId), 12000);

  // Sending the unchanged price with a full form is fine.
  const same = await t.as.designer.patch(`/api/dishes/${dishId}`, { price: 12000, name_ar: 'كباب عراقي', badges: ['حار'] });
  assert.equal(same.status, 200);
  assert.equal(same.body.name_ar, 'كباب عراقي');

  const created = await t.as.designer.post('/api/dishes', { name_ar: 'طبق المصممة', category_id: menu.categoryId });
  assert.equal(created.status, 201);
  assert.equal(created.body.price, 0, 'owner sets the price later');
  assert.equal((await t.as.designer.post('/api/dishes', { name_ar: 'بسعر', price: 5000 })).status, 403);

  const owner = await t.as.owner.patch(`/api/dishes/${created.body.id}`, { price: 9000 });
  assert.equal(owner.status, 200);
  assert.equal(owner.body.price, 9000);
  const log = (await t.as.owner.get('/api/activity')).body.find((a) => a.code === 'dish.price');
  assert.equal(log.details.to, 9000);
  assert.match(log.summary, /طبق المصممة/);
});

test('waiter cannot upload media; designer can', async () => {
  const denied = await t.as.waiter.request('POST', '/api/media', fileForm('a.jpg', TINY_JPEG, 'image/jpeg'));
  assert.equal(denied.status, 403);
  const ok = await t.as.designer.request('POST', '/api/media', fileForm('a.jpg', TINY_JPEG, 'image/jpeg'));
  assert.equal(ok.status, 201);
});

test('live socket needs a session; orders only reach owner and waiter rooms', async () => {
  const { io: ioClient } = await import('socket.io-client');
  const anonymous = ioClient(`${t.base}/live`, { reconnection: false, forceNew: true });
  t.sockets.push(anonymous);
  const err = await new Promise((resolve) => anonymous.once('connect_error', resolve));
  assert.equal(err.message, 'unauthorized');

  const sockets = Object.fromEntries(ALL.map((role) => [role, t.live(t.as[role])]));
  await Promise.all(Object.values(sockets).map((s) => new Promise((resolve) => s.once('connect', resolve))));
  const got = { owner: 0, designer: 0, waiter: 0 };
  for (const role of ALL) sockets[role].on('order', () => (got[role] += 1));
  const floorEvents = Promise.all(ALL.map((role) => new Promise((resolve) => sockets[role].once('floor:changed', resolve))));

  await t.as.waiter.post('/api/orders', { table_id: table.tableId, items: [{ dish_id: menu.dishIds[0], quantity: 2 }] });
  await floorEvents;
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(got, { owner: 1, designer: 0, waiter: 1 });
});
