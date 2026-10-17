import { Router } from 'express';
import { ownerOnly } from '../auth/roles.js';
import { badRequest, int } from '../lib/validate.js';

const DAY_MS = 24 * 3600 * 1000;
const MAX_RANGE_DAYS = 366;

// Sales reports and the activity log (owner). Served and paid orders count as
// revenue; days are the server's local calendar days.
export function reportRoutes({ db, activity }) {
  const r = Router();

  const scope = `
    WITH o AS (
      SELECT id, waiter_id, total, date(created_at, 'localtime') AS day FROM orders
      WHERE status IN ('served', 'paid') AND date(created_at, 'localtime') BETWEEN @from AND @to
    )`;
  const q = {
    totals: db.prepare(`${scope} SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue FROM o`),
    byDay: db.prepare(`${scope}
      SELECT day, COUNT(*) AS orders, SUM(total) AS revenue FROM o GROUP BY day ORDER BY day`),
    topDishes: db.prepare(`${scope}
      SELECT i.dish_id, MAX(i.dish_name) AS name, SUM(i.quantity) AS quantity,
        SUM(i.quantity * i.unit_price) AS revenue
      FROM order_items i JOIN o ON o.id = i.order_id
      GROUP BY COALESCE(CAST(i.dish_id AS TEXT), 'n:' || i.dish_name)
      ORDER BY quantity DESC, revenue DESC LIMIT 10`),
    byWaiter: db.prepare(`${scope}
      SELECT o.waiter_id, COALESCE(u.name, 'غير معروف') AS name, COUNT(*) AS orders, SUM(o.total) AS revenue
      FROM o LEFT JOIN users u ON u.id = o.waiter_id
      GROUP BY o.waiter_id ORDER BY revenue DESC`),
  };

  r.get('/reports/summary', ownerOnly, (req, res) => {
    const today = localDate(new Date());
    const to = dateParam(req.query.to, 'إلى') ?? today;
    const from = dateParam(req.query.from, 'من') ?? addDays(to, -6);
    if (from > to) throw badRequest('تاريخ البداية بعد تاريخ النهاية');
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
    if (days > MAX_RANGE_DAYS) throw badRequest('أقصى مدة للتقرير سنة واحدة');

    const params = { from, to };
    const totals = q.totals.get(params);
    const found = new Map(q.byDay.all(params).map((d) => [d.day, d]));
    // Every day of the range, zeros included, so charts have no gaps.
    const byDay = Array.from({ length: days }, (_, i) => {
      const day = addDays(from, i);
      return found.get(day) ?? { day, orders: 0, revenue: 0 };
    });
    res.json({
      from,
      to,
      totals: {
        orders: totals.orders,
        revenue: round2(totals.revenue),
        avgTicket: totals.orders ? round2(totals.revenue / totals.orders) : 0,
      },
      byDay: byDay.map((d) => ({ ...d, revenue: round2(d.revenue) })),
      topDishes: q.topDishes.all(params).map((d) => ({ ...d, revenue: round2(d.revenue) })),
      byWaiter: q.byWaiter.all(params).map((w) => ({ ...w, revenue: round2(w.revenue) })),
    });
  });

  r.get('/activity', ownerOnly, (req, res) => {
    const limit = int(req.query.limit, 'العدد', { min: 1, max: 1000 }) ?? 100;
    res.json(activity.list(limit));
  });

  return r;
}

function dateParam(value, label) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw badRequest(`تاريخ "${label}" يجب أن يكون بصيغة YYYY-MM-DD`);
  }
  return value;
}

// YYYY-MM-DD in the server's time zone (same as SQLite's 'localtime').
export function localDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Calendar arithmetic on YYYY-MM-DD strings (UTC, so no DST surprises).
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const round2 = (n) => Math.round(Number(n ?? 0) * 100) / 100;
