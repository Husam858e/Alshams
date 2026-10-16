import { Router } from 'express';
import { requireTable } from '../lib/auth.js';
import { badRequest, int, str } from '../lib/validate.js';
import { orderQueries, projectOrder } from '../services/orders.js';

// The ordering interface on the table's tablet. Every request is scoped to
// the table the tablet was paired with (x-table-code / x-table-key).
export function tabletRoutes({ db, projection, bus, config }) {
  const r = Router();
  const orders = orderQueries(db);
  r.use(requireTable(db));

  const q = {
    categories: db.prepare('SELECT id, name_ar, name_en FROM categories ORDER BY sort_order, id'),
    dishes: db.prepare(`
      SELECT d.id, d.category_id, d.name_ar, d.name_en, d.description_ar, d.price, t.file_name AS thumb_file,
        EXISTS (SELECT 1 FROM dish_projections dp WHERE dp.dish_id = d.id AND dp.phase = 'preview') AS has_preview
      FROM dishes d LEFT JOIN media_assets t ON t.id = d.thumbnail_asset_id
      WHERE d.is_available = 1
      ORDER BY d.sort_order, d.id`),
    dish: db.prepare('SELECT id, price FROM dishes WHERE id = ? AND is_available = 1'),
  };

  const seatOf = (req, value) => {
    const seat = int(value, 'المقعد', { min: 1, max: 20 });
    if (seat && seat > req.table.seats) throw badRequest('رقم المقعد أكبر من عدد مقاعد الطاولة');
    return seat;
  };

  r.get('/menu', (req, res) => {
    const dishes = q.dishes.all().map(({ thumb_file, has_preview, ...d }) => ({
      ...d,
      has_preview: Boolean(has_preview),
      thumbnail_url: thumb_file ? `/media/${thumb_file}` : null,
    }));
    const byCategory = Map.groupBy(dishes, (d) => d.category_id);
    const categories = q.categories
      .all()
      .map((c) => ({ ...c, dishes: byCategory.get(c.id) ?? [] }))
      .filter((c) => c.dishes.length);
    const uncategorized = byCategory.get(null);
    if (uncategorized) categories.push({ id: 0, name_ar: 'أخرى', name_en: 'Other', dishes: uncategorized });
    res.json({
      table: { code: req.table.code, name: req.table.name, seats: req.table.seats },
      currency: config.currency,
      categories,
    });
  });

  // Customer is looking at a dish: show it on the table in front of their seat.
  r.post('/preview', async (req, res) => {
    const dishId = int(req.body.dish_id, 'الطبق', { required: true, min: 1 });
    if (!q.dish.get(dishId)) throw badRequest('الطبق غير متاح');
    res.json(await projection.playDish({ tableId: req.table.id, dishId, phase: 'preview', seatNo: seatOf(req, req.body.seat_no) }));
  });

  r.post('/preview/stop', async (req, res) => {
    res.json(await projection.stopSeat({ tableId: req.table.id, seatNo: seatOf(req, req.body.seat_no) }));
  });

  r.post('/orders', (req, res) => {
    const raw = req.body.items;
    if (!Array.isArray(raw) || !raw.length || raw.length > 50) throw badRequest('السلة فارغة');

    const items = raw.map((item) => {
      const dishId = int(item?.dish_id, 'الطبق', { required: true, min: 1 });
      const dish = q.dish.get(dishId);
      if (!dish) throw badRequest('أحد الأطباق لم يعد متاحاً، حدّث المنيو');
      return {
        dish_id: dishId,
        quantity: int(item.quantity, 'الكمية', { min: 1, max: 50 }) ?? 1,
        seat_no: seatOf(req, item.seat_no),
        unit_price: dish.price,
        notes: str(item.notes, 'الملاحظات', { max: 300 }),
      };
    });
    const total = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

    const orderId = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO orders (table_id, total) VALUES (?, ?)')
        .run(req.table.id, Math.round(total * 100) / 100);
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, dish_id, seat_no, quantity, unit_price, notes)
        VALUES (@order_id, @dish_id, @seat_no, @quantity, @unit_price, @notes)`);
      for (const item of items) insertItem.run({ ...item, order_id: lastInsertRowid });
      return lastInsertRowid;
    })();

    const order = orders.get(orderId);
    bus.emit('order:changed', order);
    // Fire-and-forget: the order is confirmed even if a projector is offline.
    projectOrder(projection, order, 'ordered').catch(() => {});
    res.status(201).json(order);
  });

  r.get('/orders', (req, res) => {
    res.json(orders.list({ activeOnly: true, tableId: req.table.id }));
  });

  return r;
}
