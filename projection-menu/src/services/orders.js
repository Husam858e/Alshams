// Orders shared by the tablet (placing) and the dashboard (status changes).

// Allowed status moves; anything else is rejected.
export const TRANSITIONS = {
  placed: ['preparing', 'served', 'cancelled'],
  preparing: ['served', 'cancelled'],
  served: ['closed'],
  closed: [],
  cancelled: [],
};

export function orderQueries(db) {
  const items = db.prepare(`
    SELECT oi.*, d.name_ar AS dish_name
    FROM order_items oi JOIN dishes d ON d.id = oi.dish_id
    WHERE oi.order_id = ? ORDER BY oi.id`);
  const withItems = (order) => order && { ...order, items: items.all(order.id) };
  const base = `
    SELECT o.*, t.code AS table_code, t.name AS table_name
    FROM orders o JOIN restaurant_tables t ON t.id = o.table_id`;
  const one = db.prepare(`${base} WHERE o.id = ?`);
  const many = db.prepare(`
    ${base}
    WHERE (@tableId IS NULL OR o.table_id = @tableId)
      AND (@activeOnly = 0 OR o.status IN ('placed', 'preparing', 'served'))
    ORDER BY o.id DESC LIMIT 200`);

  return {
    get: (id) => withItems(one.get(id)),
    list: ({ activeOnly, tableId = null }) => many.all({ activeOnly: activeOnly ? 1 : 0, tableId }).map(withItems),
  };
}

// Plays a phase ('ordered' / 'served') for an order. Several dishes for the
// same seat would fight over one zone, so the first dish per seat wins.
export function projectOrder(projection, order, phase) {
  const bySeat = new Map();
  for (const item of order.items) {
    const seat = item.seat_no ?? null;
    if (!bySeat.has(seat)) bySeat.set(seat, item);
  }
  return Promise.all(
    [...bySeat.values()].map((item) =>
      projection.playDish({ tableId: order.table_id, dishId: item.dish_id, phase, seatNo: item.seat_no ?? null }),
    ),
  );
}

export function clearOrderSeats(projection, order) {
  const seats = new Set(order.items.map((i) => i.seat_no ?? null));
  return Promise.all([...seats].map((seatNo) => projection.stopSeat({ tableId: order.table_id, seatNo })));
}
