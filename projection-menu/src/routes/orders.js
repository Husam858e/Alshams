import { Router } from 'express';
import { floorTeam } from '../auth/roles.js';
import { badRequest, has, idParam, int, notFound } from '../lib/validate.js';

// Orders taken by waiters on their tablets (owner sees and manages them too).
export function orderRoutes({ orders, floor, projection, live, activity }) {
  const r = Router();

  // Staff apps, floor tiles and a table showing this order all update live.
  const broadcast = (order, { floorChanged = true } = {}) => {
    live.roles(['owner', 'waiter'], 'order', order);
    if (floorChanged) live.floorChanged();
    projection.orderChanged(order);
    return order;
  };

  const orderId = (value) => idParam(value, 'الطلب');
  const loadOrder = (id) => {
    const order = orders.get(orderId(id));
    if (!order) throw notFound('الطلب غير موجود');
    return order;
  };

  r.get('/orders', floorTeam, (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'active';
    const tableId = int(req.query.table_id, 'الطاولة', { min: 1 });
    const limit = int(req.query.limit, 'العدد', { min: 1, max: 1000 }) ?? 200;
    res.json(orders.list({ status, tableId, limit }));
  });

  r.get('/orders/:id', floorTeam, (req, res) => res.json(loadOrder(req.params.id)));

  r.post('/orders', floorTeam, (req, res) => {
    const tableId = int(req.body.table_id, 'الطاولة', { required: true, min: 1 });
    if (!floor.tableRow(tableId)) throw notFound('الطاولة غير موجودة');
    const { order } = orders.create({ tableId, items: req.body.items, notes: req.body.notes, user: req.user });
    res.status(201).json(broadcast(order));
  });

  r.post('/orders/:id/items', floorTeam, (req, res) => {
    res.status(201).json(broadcast(orders.addItem(orderId(req.params.id), req.body)));
  });

  r.patch('/orders/:id/items/:itemId', floorTeam, (req, res) => {
    if (!has(req.body, 'quantity') && !has(req.body, 'notes')) throw badRequest('لا يوجد ما يُعدَّل');
    const order = orders.updateItem(orderId(req.params.id), idParam(req.params.itemId, 'الصنف'), req.body);
    res.json(broadcast(order));
  });

  r.delete('/orders/:id/items/:itemId', floorTeam, (req, res) => {
    const { order, removed } = orders.removeItem(orderId(req.params.id), idParam(req.params.itemId, 'الصنف'));
    activity.log(req.user, 'order.item-remove', {
      orderId: order.id,
      tableNumber: order.table_number,
      dish: removed.dish_name,
      quantity: removed.quantity,
    });
    res.json(broadcast(order));
  });

  // {status} and/or {notes}.
  r.patch('/orders/:id', floorTeam, (req, res) => {
    let order = loadOrder(req.params.id);
    if (!has(req.body, 'status') && !has(req.body, 'notes')) throw badRequest('لا يوجد ما يُعدَّل');
    if (has(req.body, 'notes')) order = orders.setNotes(order.id, req.body.notes);
    if (has(req.body, 'status')) {
      const result = orders.setStatus(order.id, String(req.body.status));
      order = result.order;
      if (result.from !== order.status) {
        activity.log(req.user, 'order.status', {
          orderId: order.id,
          tableNumber: order.table_number,
          from: result.from,
          to: order.status,
          total: order.total,
        });
      }
      // A cancelled order, or a table that just emptied, stops showing the order.
      if (order.status === 'cancelled' || result.tableFreed) {
        projection.dropScenesWhere((s) => s.type === 'order' && s.orderId === order.id);
      }
    }
    res.json(broadcast(order));
  });

  return r;
}
