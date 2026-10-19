import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { connected, nextEvent, startServer } from './helpers.js';

let t;
before(async () => {
  t = await startServer();
});
after(() => t.close());

test('sections and numbered tables: CRUD, unique numbers, floor view', async () => {
  const { owner } = t.as;
  const hall = (await owner.post('/api/areas', { name: 'الصالة الرئيسية' })).body;
  const terrace = (await owner.post('/api/areas', { name: 'التراس' })).body;
  assert.equal(hall.sort_order, 0);
  assert.equal(terrace.sort_order, 1);
  assert.equal((await owner.post('/api/areas', { name: '  ' })).status, 400);

  const t1 = await owner.post('/api/tables', { number: 1, area_id: hall.id, seats: 4 });
  assert.equal(t1.status, 201);
  assert.deepEqual(
    { number: t1.body.number, seats: t1.body.seats, status: t1.body.status, area_id: t1.body.area_id },
    { number: 1, seats: 4, status: 'free', area_id: hall.id },
  );
  assert.deepEqual(t1.body.scene, { type: 'welcome' });
  assert.equal(t1.body.activeOrder, null);
  assert.deepEqual(t1.body.projectors, []);

  const dup = await owner.post('/api/tables', { number: 1, area_id: terrace.id });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /رقم الطاولة 1/);
  assert.equal((await owner.post('/api/tables', { number: 0 })).status, 400);
  assert.equal((await owner.post('/api/tables', { number: 9, area_id: 999 })).status, 400);

  const t7 = (await owner.post('/api/tables', { number: 7, area_id: terrace.id, seats: 2 })).body;
  const loose = (await owner.post('/api/tables', { number: 20 })).body;
  assert.equal(loose.area_id, null);

  const moved = await owner.patch(`/api/tables/${t7.id}`, { number: 8, seats: 6 });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.number, 8);
  assert.equal((await owner.patch(`/api/tables/${t7.id}`, { number: 1 })).status, 409);
  assert.equal((await owner.patch('/api/tables/999', { seats: 2 })).status, 404);

  const floor = (await t.as.waiter.get('/api/floor')).body;
  assert.deepEqual(floor.areas.map((a) => [a.name, a.tables.map((x) => x.number)]), [
    ['الصالة الرئيسية', [1]],
    ['التراس', [8]],
  ]);
  assert.deepEqual(floor.unassigned.map((x) => x.number), [20]);

  // Deleting a section keeps its tables (unassigned).
  assert.equal((await owner.delete(`/api/areas/${terrace.id}`)).status, 200);
  const after = (await owner.get('/api/floor')).body;
  assert.deepEqual(after.unassigned.map((x) => x.number).sort((a, b) => a - b), [8, 20]);

  const renamed = await owner.patch(`/api/areas/${hall.id}`, { name: 'الصالة' });
  assert.equal(renamed.body.name, 'الصالة');
});

test('table status: owner and waiter; designer forbidden; staff get floor:changed', async () => {
  const table = (await t.as.owner.post('/api/tables', { number: 30 })).body;
  const socket = t.live(t.as.owner);
  await connected(socket);
  const event = nextEvent(socket, 'floor:changed');
  const res = await t.as.waiter.patch(`/api/tables/${table.id}/status`, { status: 'reserved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'reserved');
  await event;
  assert.equal((await t.as.waiter.patch(`/api/tables/${table.id}/status`, { status: 'dirty' })).status, 400);
  assert.equal((await t.as.designer.patch(`/api/tables/${table.id}/status`, { status: 'free' })).status, 403);
  assert.equal((await t.as.waiter.patch(`/api/tables/${table.id}`, { seats: 3 })).status, 403);
});

test('deleting a table deletes its projectors and keeps its order history', async () => {
  const { owner } = t.as;
  const table = (await owner.post('/api/tables', { number: 40 })).body;
  const projector = (await owner.post('/api/projectors', { table_id: table.id })).body;
  assert.equal(projector.name, 'جهاز عرض طاولة 40');
  const dish = t.db.prepare("INSERT INTO dishes (name_ar, price) VALUES ('شاي', 1000)").run().lastInsertRowid;
  const order = (await owner.post('/api/orders', { table_id: table.id, items: [{ dish_id: dish, quantity: 1 }] })).body;

  assert.equal((await owner.delete(`/api/tables/${table.id}`)).status, 200);
  assert.equal(t.db.prepare('SELECT COUNT(*) FROM projectors WHERE id = ?').pluck().get(projector.id), 0);
  const kept = (await owner.get(`/api/orders/${order.id}`)).body;
  assert.equal(kept.table_id, null);
  assert.equal(kept.table_number, 40);
  assert.equal((await owner.get(`/api/tables/${table.id}`)).status, 404);
});
