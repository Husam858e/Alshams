import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { localDate } from '../src/routes/reports.js';
import { makeMenu, makeTable, startServer } from './helpers.js';

let t;
before(async () => {
  t = await startServer();
});
after(() => t.close());

test('summary: revenue from served + paid orders, by day, top dishes, by waiter', async () => {
  const { dishIds: [kebab, tea, pizza] } = makeMenu(t, {
    dishes: [
      { name_ar: 'كباب', price: 10000 },
      { name_ar: 'شاي', price: 1000 },
      { name_ar: 'بيتزا', price: 8000 },
    ],
  });
  const { tableId } = makeTable(t, { number: 1, projector: false });
  const order = async (client, items, status) => {
    const o = (await client.post('/api/orders', { table_id: tableId, items: items.map(([dish_id, quantity]) => ({ dish_id, quantity })) })).body;
    const path = { open: [], served: ['served'], paid: ['served', 'paid'], cancelled: ['cancelled'] }[status];
    for (const s of path) await client.patch(`/api/orders/${o.id}`, { status: s });
    return o.id;
  };

  // Today: waiter 25,000 (paid) + 8,000 (served); owner 3,000 (paid). Not counted: open + cancelled.
  await order(t.as.waiter, [[kebab, 2], [tea, 5]], 'paid'); // 25,000
  await order(t.as.waiter, [[pizza, 1]], 'served'); // 8,000
  await order(t.as.owner, [[tea, 3]], 'paid'); // 3,000
  await order(t.as.waiter, [[kebab, 9]], 'open');
  await order(t.as.owner, [[pizza, 9]], 'cancelled');
  // Two days ago: owner 10,000 (paid).
  const old = await order(t.as.owner, [[kebab, 1]], 'paid');
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  t.db.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(twoDaysAgo.toISOString(), old);

  const today = localDate(new Date());
  const from = localDate(twoDaysAgo);
  const res = await t.as.owner.get(`/api/reports/summary?from=${from}&to=${today}`);
  assert.equal(res.status, 200);
  const r = res.body;
  assert.deepEqual(r.totals, { orders: 4, revenue: 46000, avgTicket: 11500 });
  assert.equal(r.byDay.length, 3, 'every day of the range, zeros included');
  assert.deepEqual(r.byDay[0], { day: from, orders: 1, revenue: 10000 });
  assert.deepEqual(r.byDay[1].orders, 0);
  assert.deepEqual(r.byDay[2], { day: today, orders: 3, revenue: 36000 });
  assert.deepEqual(
    r.topDishes.map((d) => [d.name, d.quantity, d.revenue]),
    [
      ['شاي', 8, 8000],
      ['كباب', 3, 30000],
      ['بيتزا', 1, 8000],
    ],
  );
  assert.deepEqual(
    r.byWaiter.map((w) => [w.name, w.orders, w.revenue]),
    [
      ['الويتر', 2, 33000],
      ['المالك', 2, 13000],
    ],
  );

  // Today only.
  const todayOnly = (await t.as.owner.get(`/api/reports/summary?from=${today}&to=${today}`)).body;
  assert.deepEqual(todayOnly.totals, { orders: 3, revenue: 36000, avgTicket: 12000 });

  // Defaults to the last 7 days.
  const def = (await t.as.owner.get('/api/reports/summary')).body;
  assert.equal(def.byDay.length, 7);
  assert.equal(def.to, today);
});

test('summary: validation and access', async () => {
  assert.equal((await t.as.owner.get('/api/reports/summary?from=2026-13-01')).status, 400);
  assert.equal((await t.as.owner.get('/api/reports/summary?from=2026-05-02&to=2026-05-01')).status, 400);
  assert.equal((await t.as.owner.get('/api/reports/summary?from=2020-01-01&to=2026-01-01')).status, 400);
  const empty = (await t.as.owner.get('/api/reports/summary?from=2020-01-01&to=2020-01-02')).body;
  assert.deepEqual(empty.totals, { orders: 0, revenue: 0, avgTicket: 0 });
  assert.deepEqual(empty.topDishes, []);
  assert.equal((await t.as.waiter.get('/api/reports/summary')).status, 403);
  assert.equal((await t.as.designer.get('/api/reports/summary')).status, 403);
});
