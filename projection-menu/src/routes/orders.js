import { Router } from 'express';
import { HttpError, bool, int, notFound, oneOf } from '../lib/validate.js';
import { TRANSITIONS, clearOrderSeats, orderQueries, projectOrder } from '../services/orders.js';

// Admin / kitchen: follow orders and move them along. Marking an order
// "served" triggers each dish's 'served' projection in front of its seat.
export function orderRoutes({ db, projection, bus }) {
  const r = Router();
  const orders = orderQueries(db);

  r.get('/orders', (req, res) => {
    res.json(orders.list({ activeOnly: !bool(req.query.all) }));
  });

  r.patch('/orders/:id', (req, res) => {
    const order = orders.get(int(req.params.id, 'id'));
    if (!order) throw notFound('الطلب غير موجود');
    const status = oneOf(req.body.status, 'الحالة', Object.keys(TRANSITIONS), { required: true });
    if (!TRANSITIONS[order.status].includes(status)) {
      throw new HttpError(409, `لا يمكن نقل الطلب من "${order.status}" إلى "${status}"`);
    }
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, order.id);
    const updated = orders.get(order.id);
    bus.emit('order:changed', updated);

    // Projection is best-effort: an offline projector must never block the kitchen.
    if (status === 'served') projectOrder(projection, updated, 'served').catch(() => {});
    if (status === 'closed' || status === 'cancelled') clearOrderSeats(projection, updated).catch(() => {});
    res.json(updated);
  });

  r.get('/projection-log', (req, res) => {
    const limit = int(req.query.limit, 'limit', { min: 1, max: 500 }) ?? 100;
    res.json(
      db
        .prepare(`
          SELECT l.*, p.name AS projector_name, d.name_ar AS dish_name, t.code AS table_code
          FROM projection_log l
          LEFT JOIN projectors p        ON p.id = l.projector_id
          LEFT JOIN dishes d            ON d.id = l.dish_id
          LEFT JOIN restaurant_tables t ON t.id = l.table_id
          ORDER BY l.id DESC LIMIT ?`)
        .all(limit),
    );
  });

  return r;
}
