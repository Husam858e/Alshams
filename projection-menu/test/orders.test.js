import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { makeMenu, makeTable, startServer } from './helpers.js';

let t;
let menu;
before(async () => {
  t = await startServer();
  menu = makeMenu(t, {
    dishes: [
      { name_ar: 'كباب', price: 14000 },
      { name_ar: 'شاي', price: 1500 },
      { name_ar: 'نفد', price: 5000, is_available: false },
    ],
  });
});
after(() => t.close());

const [KEBAB, TEA, SOLD_OUT] = [0, 1, 2];
const tableStatus = (id) => t.db.prepare('SELECT status FROM restaurant_tables WHERE id = ?').pluck().get(id);

test('create: price snapshot, total, occupies the table, validation', async () => {
  const { tableId } = makeTable(t, { number: 1, projector: false });
  const { waiter } = t.as;
  assert.equal((await waiter.post('/api/orders', { table_id: tableId, items: [] })).status, 400);
  assert.equal((await waiter.post('/api/orders', { table_id: 999, items: [{ dish_id: menu.dishIds[KEBAB] }] })).status, 404);
  const soldOut = await waiter.post('/api/orders', { table_id: tableId, items: [{ dish_id: menu.dishIds[SOLD_OUT], quantity: 1 }] });
  assert.equal(soldOut.status, 400);
  assert.match(soldOut.body.error, /غير متوفر/);
  assert.equal((await waiter.post('/api/orders', { table_id: tableId, items: [{ dish_id: menu.dishIds[KEBAB], quantity: 0 }] })).status, 400);
  assert.equal(tableStatus(tableId), 'free');

  const res = await waiter.post('/api/orders', {
    table_id: tableId,
    notes: 'عيد ميلاد',
    items: [
      { dish_id: menu.dishIds[KEBAB], quantity: 2, notes: 'بدون بصل' },
      { dish_id: menu.dishIds[TEA], quantity: 3 },
    ],
  });
  assert.equal(res.status, 201);
  const o = res.body;
  assert.equal(o.status, 'open');
  assert.equal(o.table_number, 1);
  assert.equal(o.waiter_name, 'الويتر');
  assert.equal(o.total, 2 * 14000 + 3 * 1500);
  assert.deepEqual(
    o.items.map((i) => [i.dish_name, i.quantity, i.unit_price, i.notes]),
    [
      ['كباب', 2, 14000, 'بدون بصل'],
      ['شاي', 3, 1500, null],
    ],
  );
  assert.equal(tableStatus(tableId), 'occupied');

  // A later price change does not touch the order.
  await t.as.owner.patch(`/api/dishes/${menu.dishIds[KEBAB]}`, { price: 16000 });
  assert.equal((await waiter.get(`/api/orders/${o.id}`)).body.items[0].unit_price, 14000);
  await t.as.owner.patch(`/api/dishes/${menu.dishIds[KEBAB]}`, { price: 14000 });

  const floor = (await waiter.get('/api/floor')).body.areas[0].tables[0];
  assert.deepEqual(floor.activeOrder, { id: o.id, status: 'open', total: 32500, itemsCount: 5 });
});

test('items: add (merging same dish), change quantity, remove — only while open/preparing', async () => {
  const { tableId } = makeTable(t, { number: 2, projector: false });
  const { waiter } = t.as;
  const o = (await waiter.post('/api/orders', { table_id: tableId, items: [{ dish_id: menu.dishIds[TEA], quantity: 1 }] })).body;

  let res = await waiter.post(`/api/orders/${o.id}/items`, { dish_id: menu.dishIds[TEA], quantity: 2 });
  assert.equal(res.status, 201);
  assert.equal(res.body.items.length, 1, 'same dish and notes: one line');
  assert.equal(res.body.items[0].quantity, 3);
  res = await waiter.post(`/api/orders/${o.id}/items`, { dish_id: menu.dishIds[KEBAB], quantity: 1, notes: 'حار' });
  assert.equal(res.body.items.length, 2);
  assert.equal(res.body.total, 3 * 1500 + 14000);

  const kebabLine = res.body.items.find((i) => i.dish_name === 'كباب');
  res = await waiter.patch(`/api/orders/${o.id}/items/${kebabLine.id}`, { quantity: 4 });
  assert.equal(res.body.total, 3 * 1500 + 4 * 14000);
  assert.equal((await waiter.patch(`/api/orders/${o.id}/items/${kebabLine.id}`, { quantity: 0 })).status, 400);
  assert.equal((await waiter.patch(`/api/orders/${o.id}/items/99999`, { quantity: 1 })).status, 404);

  res = await waiter.delete(`/api/orders/${o.id}/items/${kebabLine.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 4500);
  const log = (await t.as.owner.get('/api/activity')).body.find((a) => a.code === 'order.item-remove');
  assert.match(log.summary, /كباب/);

  await waiter.patch(`/api/orders/${o.id}`, { status: 'preparing' });
  assert.equal((await waiter.post(`/api/orders/${o.id}/items`, { dish_id: menu.dishIds[TEA] })).status, 201, 'still editable');
  await waiter.patch(`/api/orders/${o.id}`, { status: 'served' });
  const locked = await waiter.post(`/api/orders/${o.id}/items`, { dish_id: menu.dishIds[TEA] });
  assert.equal(locked.status, 409);
  assert.equal((await waiter.delete(`/api/orders/${o.id}/items/${res.body.items[0].id}`)).status, 409);
});

test('status moves follow the allowed graph; paid/cancelled free the table after its last active order', async () => {
  const { tableId } = makeTable(t, { number: 3, projector: false });
  const { waiter } = t.as;
  const item = [{ dish_id: menu.dishIds[TEA], quantity: 1 }];
  const a = (await waiter.post('/api/orders', { table_id: tableId, items: item })).body;
  const b = (await waiter.post('/api/orders', { table_id: tableId, items: item })).body;

  assert.equal((await waiter.patch(`/api/orders/${a.id}`, { status: 'paid' })).status, 409, 'open -> paid not allowed');
  assert.equal((await waiter.patch(`/api/orders/${a.id}`, { status: 'shipped' })).status, 400);
  for (const s of ['preparing', 'served', 'paid']) assert.equal((await waiter.patch(`/api/orders/${a.id}`, { status: s })).body.status, s);
  for (const s of ['open', 'cancelled', 'served']) assert.equal((await waiter.patch(`/api/orders/${a.id}`, { status: s })).status, 409, `paid is final (${s})`);
  assert.equal(tableStatus(tableId), 'occupied', 'order b is still active');

  const active = (await waiter.get(`/api/orders?status=active&table_id=${tableId}`)).body;
  assert.deepEqual(active.map((o) => o.id), [b.id]);
  const all = (await waiter.get(`/api/orders?status=all&table_id=${tableId}`)).body;
  assert.deepEqual(all.map((o) => o.id), [b.id, a.id]);
  assert.equal((await waiter.get('/api/orders?status=paid')).body.every((o) => o.status === 'paid'), true);

  assert.equal((await waiter.patch(`/api/orders/${b.id}`, { status: 'cancelled' })).body.status, 'cancelled');
  assert.equal((await waiter.patch(`/api/orders/${b.id}`, { status: 'open' })).status, 409, 'cancelled is final');
  assert.equal(tableStatus(tableId), 'free');
  assert.equal((await waiter.get('/api/floor')).body.areas.find((x) => x.tables.some((tb) => tb.id === tableId)).tables[0].activeOrder, null);

  const log = (await t.as.owner.get('/api/activity')).body.filter((x) => x.code === 'order.status');
  assert.ok(log.length >= 4);
  assert.match(log[0].summary, /ملغى/);
});

test('notes can be edited; designers have no access to orders', async () => {
  const { tableId } = makeTable(t, { number: 4, projector: false });
  const o = (await t.as.owner.post('/api/orders', { table_id: tableId, items: [{ dish_id: menu.dishIds[TEA] }] })).body;
  const res = await t.as.waiter.patch(`/api/orders/${o.id}`, { notes: 'الطاولة قرب النافذة' });
  assert.equal(res.body.notes, 'الطاولة قرب النافذة');
  assert.equal((await t.as.designer.get(`/api/orders/${o.id}`)).status, 403);
  assert.equal((await t.as.designer.patch(`/api/orders/${o.id}`, { status: 'cancelled' })).status, 403);
});
