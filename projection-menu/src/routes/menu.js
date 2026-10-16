import { Router } from 'express';
import { badRequest, bool, int, notFound, num, oneOf, str } from '../lib/validate.js';

export const PHASES = ['preview', 'ordered', 'served'];

// Admin: categories, dishes, and the dish ↔ projection links.
export function menuRoutes({ db, projection }) {
  const r = Router();

  const q = {
    categories: db.prepare('SELECT * FROM categories ORDER BY sort_order, id'),
    category: db.prepare('SELECT * FROM categories WHERE id = ?'),
    dishes: db.prepare(`
      SELECT d.*, c.name_ar AS category_name, t.file_name AS thumb_file
      FROM dishes d
      LEFT JOIN categories c   ON c.id = d.category_id
      LEFT JOIN media_assets t ON t.id = d.thumbnail_asset_id
      ORDER BY c.sort_order, d.sort_order, d.id`),
    dish: db.prepare(`
      SELECT d.*, c.name_ar AS category_name, t.file_name AS thumb_file
      FROM dishes d
      LEFT JOIN categories c   ON c.id = d.category_id
      LEFT JOIN media_assets t ON t.id = d.thumbnail_asset_id
      WHERE d.id = ?`),
    projections: db.prepare(`
      SELECT dp.*, m.title AS media_title, m.kind AS media_kind, m.file_name
      FROM dish_projections dp JOIN media_assets m ON m.id = dp.media_asset_id`),
    asset: db.prepare('SELECT * FROM media_assets WHERE id = ?'),
  };

  const withProjections = (dishes) => {
    const byDish = Map.groupBy(q.projections.all(), (p) => p.dish_id);
    return dishes.map((d) => serializeDish(d, byDish.get(d.id) ?? []));
  };
  const loadDish = (id) => {
    const dish = q.dish.get(id);
    if (!dish) throw notFound('الطبق غير موجود');
    return withProjections([dish])[0];
  };

  // ── Categories ──────────────────────────────────────────────
  r.get('/categories', (_req, res) => res.json(q.categories.all()));

  r.post('/categories', (req, res) => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO categories (name_ar, name_en, sort_order) VALUES (@name_ar, @name_en, @sort_order)')
      .run(categoryFields(req.body));
    res.status(201).json(q.category.get(lastInsertRowid));
  });

  r.put('/categories/:id', (req, res) => {
    const id = int(req.params.id, 'id');
    const { changes } = db
      .prepare('UPDATE categories SET name_ar = @name_ar, name_en = @name_en, sort_order = @sort_order WHERE id = @id')
      .run({ ...categoryFields(req.body), id });
    if (!changes) throw notFound('التصنيف غير موجود');
    res.json(q.category.get(id));
  });

  r.delete('/categories/:id', (req, res) => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(int(req.params.id, 'id'));
    res.status(204).end();
  });

  // ── Dishes ──────────────────────────────────────────────────
  r.get('/dishes', (_req, res) => res.json(withProjections(q.dishes.all())));
  r.get('/dishes/:id', (req, res) => res.json(loadDish(int(req.params.id, 'id'))));

  r.post('/dishes', (req, res) => {
    const fields = dishFields(req.body, q);
    const { lastInsertRowid } = db
      .prepare(`
        INSERT INTO dishes (category_id, name_ar, name_en, description_ar, price, thumbnail_asset_id, is_available, sort_order)
        VALUES (@category_id, @name_ar, @name_en, @description_ar, @price, @thumbnail_asset_id, @is_available, @sort_order)`)
      .run(fields);
    res.status(201).json(loadDish(lastInsertRowid));
  });

  r.put('/dishes/:id', (req, res) => {
    const id = int(req.params.id, 'id');
    const { changes } = db
      .prepare(`
        UPDATE dishes SET category_id = @category_id, name_ar = @name_ar, name_en = @name_en,
          description_ar = @description_ar, price = @price, thumbnail_asset_id = @thumbnail_asset_id,
          is_available = @is_available, sort_order = @sort_order, updated_at = datetime('now')
        WHERE id = @id`)
      .run({ ...dishFields(req.body, q), id });
    if (!changes) throw notFound('الطبق غير موجود');
    res.json(loadDish(id));
  });

  // Dishes that already appear in orders can't be deleted (order history);
  // the error handler turns the FK violation into a 409 — hide them instead.
  r.delete('/dishes/:id', (req, res) => {
    db.prepare('DELETE FROM dishes WHERE id = ?').run(int(req.params.id, 'id'));
    res.status(204).end();
  });

  // ── Dish ↔ projection link (one per phase) ──────────────────
  r.put('/dishes/:id/projections/:phase', (req, res) => {
    const dishId = int(req.params.id, 'id');
    const phase = oneOf(req.params.phase, 'المرحلة', PHASES, { required: true });
    loadDish(dishId);
    const mediaAssetId = int(req.body.media_asset_id, 'ملف العرض', { required: true, min: 1 });
    if (!q.asset.get(mediaAssetId)) throw notFound('ملف العرض غير موجود');

    db.prepare(`
      INSERT INTO dish_projections (dish_id, media_asset_id, phase, loop, duration_ms, scale)
      VALUES (@dish_id, @media_asset_id, @phase, @loop, @duration_ms, @scale)
      ON CONFLICT (dish_id, phase) DO UPDATE SET
        media_asset_id = excluded.media_asset_id, loop = excluded.loop,
        duration_ms = excluded.duration_ms, scale = excluded.scale`).run({
      dish_id: dishId,
      media_asset_id: mediaAssetId,
      phase,
      loop: bool(req.body.loop, true) ? 1 : 0,
      duration_ms: int(req.body.duration_ms, 'المدة', { min: 500, max: 3_600_000 }),
      scale: num(req.body.scale, 'الحجم', { min: 0.1, max: 3 }) ?? 1,
    });
    res.json(loadDish(dishId));
  });

  r.delete('/dishes/:id/projections/:phase', (req, res) => {
    const dishId = int(req.params.id, 'id');
    const phase = oneOf(req.params.phase, 'المرحلة', PHASES, { required: true });
    db.prepare('DELETE FROM dish_projections WHERE dish_id = ? AND phase = ?').run(dishId, phase);
    res.json(loadDish(dishId));
  });

  // "Try it on a table" button in the dashboard.
  r.post('/dishes/:id/test', async (req, res) => {
    const result = await projection.playDish({
      dishId: int(req.params.id, 'id'),
      tableId: int(req.body.table_id, 'الطاولة', { required: true, min: 1 }),
      phase: oneOf(req.body.phase ?? 'preview', 'المرحلة', PHASES),
      seatNo: int(req.body.seat_no, 'المقعد', { min: 1, max: 20 }),
    });
    res.json(result);
  });

  return r;
}

function categoryFields(body) {
  return {
    name_ar: str(body.name_ar, 'اسم التصنيف', { required: true, max: 80 }),
    name_en: str(body.name_en, 'الاسم بالإنجليزية', { max: 80 }),
    sort_order: int(body.sort_order, 'الترتيب') ?? 0,
  };
}

function dishFields(body, q) {
  const fields = {
    category_id: int(body.category_id, 'التصنيف', { min: 1 }),
    name_ar: str(body.name_ar, 'اسم الطبق', { required: true, max: 120 }),
    name_en: str(body.name_en, 'الاسم بالإنجليزية', { max: 120 }),
    description_ar: str(body.description_ar, 'الوصف', { max: 1000 }),
    price: num(body.price, 'السعر', { required: true, min: 0, max: 1_000_000 }),
    thumbnail_asset_id: int(body.thumbnail_asset_id, 'الصورة', { min: 1 }),
    is_available: bool(body.is_available, true) ? 1 : 0,
    sort_order: int(body.sort_order, 'الترتيب') ?? 0,
  };
  if (fields.category_id && !q.category.get(fields.category_id)) throw notFound('التصنيف غير موجود');
  if (fields.thumbnail_asset_id && q.asset.get(fields.thumbnail_asset_id)?.kind !== 'image') {
    throw badRequest('صورة الطبق يجب أن تكون ملف صورة من المكتبة');
  }
  return fields;
}

export function serializeDish(d, projections) {
  const { thumb_file, ...dish } = d;
  return {
    ...dish,
    is_available: Boolean(d.is_available),
    thumbnail_url: thumb_file ? `/media/${thumb_file}` : null,
    projections: Object.fromEntries(
      projections.map((p) => [
        p.phase,
        {
          media_asset_id: p.media_asset_id,
          media_title: p.media_title,
          media_kind: p.media_kind,
          media_url: `/media/${p.file_name}`,
          loop: Boolean(p.loop),
          duration_ms: p.duration_ms,
          scale: p.scale,
        },
      ]),
    ),
  };
}
