// Cloud mode: what the replica does not hold is queried on demand — order
// history older than the replica's 24 hours, sales reports and the activity
// log — and computed by the demo's code (single-field queries only: no
// composite index to deploy).

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { floorTeam, ownerOnly } from '../../../demo/backend/roles.js';
import { activityDto, rangeBounds, reportRange, reportSummary } from '../../../demo/backend/routes/orders.js';
import { idParam, int, notFound } from '../../../demo/backend/validate.js';
import { httpErrorOf } from '../firebase.js';
import { ORDER_WINDOW_MS, spec } from '../schema.js';

const HISTORY_LIMIT = 500; // older orders fetched for the history list
const HISTORY_TTL_MS = 10 * 60 * 1000; // they hardly change: refetch at most this often

export function orderHistoryRoutes(route, cloud) {
  const { s, ctx, services, now } = cloud;
  const { db } = services;
  const orders = spec('orders');
  const demoList = cloud.demo('GET', '/orders');
  const rowsOf = (snap) => snap.docs.map((d) => orders.fromDoc(d.id, d.data()));
  const run = async (q) => {
    try {
      return rowsOf(await getDocs(q));
    } catch (err) {
      throw httpErrorOf(err);
    }
  };

  // The demo's list logic on another set of orders (handlers are synchronous,
  // so swapping s.orders for the call cannot interleave with anything).
  const withOrders = (list, fn) => {
    const saved = s.orders;
    s.orders = list;
    try {
      return fn();
    } finally {
      s.orders = saved;
    }
  };
  // Replica rows win: they include this device's latest changes.
  const merge = (fresh, older) => {
    const ids = new Set(fresh.map((o) => o.id));
    return [...fresh, ...older.filter((o) => !ids.has(o.id))];
  };

  let older = null; // {at, rows}
  async function olderOrders() {
    if (older && now() - older.at < HISTORY_TTL_MS) return older.rows;
    const before = new Date(now() - ORDER_WINDOW_MS).toISOString();
    const rows = await run(query(collection(db, 'orders'), where('created_at', '<', before), orderBy('created_at', 'desc'), limit(HISTORY_LIMIT)));
    older = { at: now(), rows };
    return rows;
  }

  route('GET', '/orders', floorTeam, async (args) => {
    const active = demoList(args); // also validates the query
    const status = typeof args.query.status === 'string' ? args.query.status : 'active';
    if (status === 'active') return active;
    const rows = merge(s.orders, await olderOrders());
    return withOrders(rows, () => demoList(args));
  });

  route('GET', '/orders/:id', floorTeam, async ({ params }) => {
    const id = idParam(params.id, 'الطلب');
    const o = ctx.find.order(id);
    if (o) return ctx.dto.order(o);
    let snap;
    try {
      snap = await getDoc(doc(db, 'orders', String(id)));
    } catch (err) {
      throw httpErrorOf(err);
    }
    if (!snap.exists()) throw notFound('الطلب غير موجود');
    return ctx.dto.order(orders.fromDoc(snap.id, snap.data()));
  });

  route('GET', '/reports/summary', ownerOnly, async ({ query: q }) => {
    const range = reportRange(q, now);
    const { startIso, endIso } = rangeBounds(range);
    const rows = await run(query(collection(db, 'orders'), where('created_at', '>=', startIso), where('created_at', '<', endIso)));
    return reportSummary(merge(s.orders.filter((o) => o.created_at >= startIso && o.created_at < endIso), rows), range, ctx.find.user);
  });

  // Newest first by time (ids come from several devices' reserved ranges).
  route('GET', '/activity', ownerOnly, async ({ query: q }) => {
    const n = int(q.limit, 'العدد', { min: 1, max: 1000 }) ?? 100;
    const rows = await run(query(collection(db, 'activity'), orderBy('created_at', 'desc'), limit(n)));
    return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id)).map((row) => activityDto(row, ctx.find.user));
  });
}
