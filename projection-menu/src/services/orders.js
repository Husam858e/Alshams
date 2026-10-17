import { nowIso } from '../db/index.js';
import { HttpError, badRequest, conflict, int, notFound, str } from '../lib/validate.js';

export const ORDER_STATUSES = ['open', 'preparing', 'served', 'paid', 'cancelled'];
export const ACTIVE_STATUSES = ['open', 'preparing', 'served'];
export const STATUS_LABELS = { open: 'جديد', preparing: 'قيد التحضير', served: 'تم التقديم', paid: 'مدفوع', cancelled: 'ملغى' };

// Allowed status moves; paid and cancelled are final.
const NEXT = {
  open: ['preparing', 'served', 'cancelled'],
  preparing: ['served', 'cancelled'],
  served: ['paid'],
  paid: [],
  cancelled: [],
};
// Items can change only before the food is served.
const EDITABLE = ['open', 'preparing'];

const ACTIVE_SQL = `('open', 'preparing', 'served')`;

// Orders and their effect on table status: the first order on a free table
// occupies it; when its last active order is paid/cancelled it is free again.
export function createOrders(db) {
  const q = {
    order: db.prepare(`
      SELECT o.*, u.name AS waiter_name, COALESCE(t.number, o.table_number) AS table_number
      FROM orders o
      LEFT JOIN users u ON u.id = o.waiter_id
      LEFT JOIN restaurant_tables t ON t.id = o.table_id
      WHERE o.id = ?`),
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id'),
    table: db.prepare('SELECT * FROM restaurant_tables WHERE id = ?'),
    dish: db.prepare('SELECT * FROM dishes WHERE id = ?'),
    insertOrder: db.prepare(`
      INSERT INTO orders (table_id, table_number, waiter_id, notes, created_at, updated_at)
      VALUES (@table_id, @table_number, @waiter_id, @notes, @now, @now)`),
    insertItem: db.prepare(`
      INSERT INTO order_items (order_id, dish_id, dish_name, quantity, unit_price, notes)
      VALUES (@order_id, @dish_id, @dish_name, @quantity, @unit_price, @notes)`),
    sameItem: db.prepare(`
      SELECT * FROM order_items WHERE order_id = ? AND dish_id = ? AND unit_price = ? AND notes IS ?`),
    item: db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?'),
    setQuantity: db.prepare('UPDATE order_items SET quantity = ? WHERE id = ?'),
    setItemNotes: db.prepare('UPDATE order_items SET notes = ? WHERE id = ?'),
    deleteItem: db.prepare('DELETE FROM order_items WHERE id = ?'),
    recalc: db.prepare(`
      UPDATE orders SET updated_at = ?,
        total = (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM order_items WHERE order_id = orders.id)
      WHERE id = ?`),
    setStatus: db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?'),
    setNotes: db.prepare('UPDATE orders SET notes = ?, updated_at = ? WHERE id = ?'),
    tableStatus: db.prepare('UPDATE restaurant_tables SET status = ? WHERE id = ?'),
    activeCount: db.prepare(`SELECT COUNT(*) FROM orders WHERE table_id = ? AND status IN ${ACTIVE_SQL}`).pluck(),
    activeSummaries: db.prepare(`
      SELECT o.id, o.table_id, o.status, o.total,
        (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS itemsCount
      FROM orders o WHERE o.status IN ${ACTIVE_SQL} ORDER BY o.id DESC`),
  };

  const get = (id) => {
    const o = q.order.get(id);
    if (!o) return null;
    return {
      id: o.id,
      table_id: o.table_id,
      table_number: o.table_number,
      waiter_id: o.waiter_id,
      waiter_name: o.waiter_name ?? null,
      status: o.status,
      notes: o.notes,
      total: o.total,
      created_at: o.created_at,
      updated_at: o.updated_at,
      items: q.items.all(id).map((i) => ({
        id: i.id,
        dish_id: i.dish_id,
        dish_name: i.dish_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        notes: i.notes,
      })),
    };
  };

  const load = (id) => {
    const order = q.order.get(id);
    if (!order) throw notFound('الطلب غير موجود');
    return order;
  };

  const assertEditable = (order) => {
    if (!EDITABLE.includes(order.status)) {
      throw conflict(`لا يمكن تعديل أصناف طلب حالته "${STATUS_LABELS[order.status]}"`);
    }
  };

  const itemInput = (raw) => {
    const dishId = int(raw?.dish_id, 'الطبق', { required: true, min: 1 });
    const quantity = int(raw?.quantity ?? 1, 'الكمية', { required: true, min: 1, max: 99 });
    const notes = str(raw?.notes, 'ملاحظات الصنف', { max: 200 });
    const dish = q.dish.get(dishId);
    if (!dish) throw badRequest('الطبق المطلوب غير موجود');
    if (!dish.is_available) throw badRequest(`"${dish.name_ar}" غير متوفر حالياً`);
    return { dish, quantity, notes };
  };

  // Same dish + same notes + same price → bump the quantity of that line.
  const addLine = (orderId, { dish, quantity, notes }) => {
    const existing = q.sameItem.get(orderId, dish.id, dish.price, notes);
    if (existing) {
      if (existing.quantity + quantity > 999) throw badRequest('الكمية كبيرة جداً');
      q.setQuantity.run(existing.quantity + quantity, existing.id);
    } else {
      q.insertItem.run({ order_id: orderId, dish_id: dish.id, dish_name: dish.name_ar, quantity, unit_price: dish.price, notes });
    }
  };

  const touch = (orderId) => q.recalc.run(nowIso(), orderId);

  return {
    get,

    list({ status = 'active', tableId = null, limit = 200 } = {}) {
      const where = [];
      const params = [];
      if (status === 'active') where.push(`o.status IN ${ACTIVE_SQL}`);
      else if (status !== 'all') {
        if (!ORDER_STATUSES.includes(status)) throw badRequest('حالة غير صالحة');
        where.push('o.status = ?');
        params.push(status);
      }
      if (tableId) {
        where.push('o.table_id = ?');
        params.push(tableId);
      }
      const sql = `SELECT o.id FROM orders o ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                   ORDER BY o.id DESC LIMIT ?`;
      return db.prepare(sql).pluck().all(...params, limit).map(get);
    },

    // -> {order, tableChanged}
    create({ tableId, items, notes, user }) {
      const table = q.table.get(tableId);
      if (!table) throw notFound('الطاولة غير موجودة');
      if (!Array.isArray(items) || items.length === 0) throw badRequest('أضف صنفاً واحداً على الأقل إلى الطلب');
      if (items.length > 100) throw badRequest('عدد الأصناف كبير جداً');
      const lines = items.map(itemInput);
      const now = nowIso();
      return db.transaction(() => {
        const orderId = q.insertOrder.run({
          table_id: table.id,
          table_number: table.number,
          waiter_id: user?.id ?? null,
          notes: str(notes, 'ملاحظات الطلب', { max: 500 }),
          now,
        }).lastInsertRowid;
        for (const line of lines) addLine(orderId, line);
        touch(orderId);
        const tableChanged = table.status !== 'occupied';
        if (tableChanged) q.tableStatus.run('occupied', table.id);
        return { order: get(orderId), tableChanged };
      })();
    },

    addItem(orderId, raw) {
      const order = load(orderId);
      assertEditable(order);
      const line = itemInput(raw);
      db.transaction(() => {
        addLine(order.id, line);
        touch(order.id);
      })();
      return get(order.id);
    },

    updateItem(orderId, itemId, body) {
      const order = load(orderId);
      assertEditable(order);
      const item = q.item.get(itemId, order.id);
      if (!item) throw notFound('الصنف غير موجود في هذا الطلب');
      db.transaction(() => {
        if (body.quantity !== undefined) {
          q.setQuantity.run(int(body.quantity, 'الكمية', { required: true, min: 1, max: 999 }), item.id);
        }
        if (body.notes !== undefined) q.setItemNotes.run(str(body.notes, 'ملاحظات الصنف', { max: 200 }), item.id);
        touch(order.id);
      })();
      return get(order.id);
    },

    removeItem(orderId, itemId) {
      const order = load(orderId);
      assertEditable(order);
      const item = q.item.get(itemId, order.id);
      if (!item) throw notFound('الصنف غير موجود في هذا الطلب');
      db.transaction(() => {
        q.deleteItem.run(item.id);
        touch(order.id);
      })();
      return { order: get(order.id), removed: item };
    },

    setNotes(orderId, notes) {
      load(orderId);
      q.setNotes.run(str(notes, 'ملاحظات الطلب', { max: 500 }), nowIso(), orderId);
      return get(orderId);
    },

    // -> {order, from, tableFreed}
    setStatus(orderId, status) {
      const order = load(orderId);
      if (!ORDER_STATUSES.includes(status)) throw badRequest('حالة الطلب غير صالحة');
      if (status === order.status) return { order: get(order.id), from: order.status, tableFreed: false };
      if (!NEXT[order.status].includes(status)) {
        throw new HttpError(
          409,
          `لا يمكن نقل الطلب من "${STATUS_LABELS[order.status]}" إلى "${STATUS_LABELS[status]}"`,
        );
      }
      return db.transaction(() => {
        q.setStatus.run(status, nowIso(), order.id);
        let tableFreed = false;
        if (!ACTIVE_STATUSES.includes(status) && order.table_id && q.activeCount.get(order.table_id) === 0) {
          const table = q.table.get(order.table_id);
          if (table && table.status === 'occupied') {
            q.tableStatus.run('free', table.id);
            tableFreed = true;
          }
        }
        return { order: get(order.id), from: order.status, tableFreed };
      })();
    },

    // tableId -> {activeOrder:{id,status,total,itemsCount}, activeCount}
    activeByTable() {
      const map = new Map();
      for (const row of q.activeSummaries.all()) {
        const entry = map.get(row.table_id);
        if (entry) entry.activeCount += 1;
        else {
          const { table_id: _t, ...activeOrder } = row;
          map.set(row.table_id, { activeOrder, activeCount: 1 });
        }
      }
      return map;
    },
  };
}
