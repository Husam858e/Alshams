import { Router } from 'express';
import { anyStaff, contentTeam } from '../auth/roles.js';
import { nowIso } from '../db/index.js';
import { badRequest, bool, forbidden, has, idList, idParam, int, notFound, num, str } from '../lib/validate.js';

const PRICE_FORBIDDEN = 'تعديل الأسعار من صلاحيات المالك';
const MAX_PRICE = 100_000_000;

// Menu content: categories and dishes. Owner and designer edit everything
// except prices, which only the owner may set (enforced here, not in the UI).
export function menuRoutes({ db, menu, projection, activity }) {
  const r = Router();

  const q = {
    asset: db.prepare('SELECT id, kind FROM media_assets WHERE id = ?'),
    categoryIds: db.prepare('SELECT id FROM categories').pluck(),
    nextCategoryOrder: db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories').pluck(),
    nextDishOrder: db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM dishes WHERE category_id IS ?').pluck(),
    dishIdsIn: db.prepare('SELECT id FROM dishes WHERE category_id IS ?').pluck(),
  };

  // A media reference must exist and be of the right kind.
  const assetRef = (value, field, kind) => {
    const id = int(value, field, { min: 1 });
    if (!id) return null;
    const asset = q.asset.get(id);
    if (!asset) throw badRequest(`الملف المختار للحقل "${field}" غير موجود في المكتبة`);
    if (asset.kind !== kind) throw badRequest(`الحقل "${field}" يقبل ${KIND_AR[kind]} فقط`);
    return id;
  };
  const categoryRef = (value) => {
    const id = int(value, 'التصنيف', { min: 1 });
    if (id && !menu.categoryRow(id)) throw badRequest('التصنيف المختار غير موجود');
    return id;
  };
  const loadCategory = (id) => {
    const row = menu.categoryRow(idParam(id, 'التصنيف'));
    if (!row) throw notFound('التصنيف غير موجود');
    return row;
  };
  const loadDish = (id) => {
    const row = menu.dishRow(idParam(id, 'الطبق'));
    if (!row) throw notFound('الطبق غير موجود');
    return row;
  };
  const changed = () => projection.menuChanged();

  r.get('/menu', anyStaff, (_req, res) => res.json(menu.getMenu()));
  r.get('/categories/:id', anyStaff, (req, res) => res.json(menu.category(idParam(req.params.id, 'التصنيف'))));
  r.get('/dishes/:id', anyStaff, (req, res) => res.json(menu.dish(idParam(req.params.id, 'الطبق'))));

  // ── Categories ──────────────────────────────────────────────────

  const categoryFields = (b, current = {}) => {
    const pick = (key, read) => (has(b, key) ? read(b[key]) : current[key]);
    return {
      name_ar: pick('name_ar', (v) => str(v, 'الاسم بالعربية', { required: true, max: 60 })),
      name_en: pick('name_en', (v) => str(v, 'الاسم بالإنجليزية', { max: 60 })) ?? null,
      description_ar: pick('description_ar', (v) => str(v, 'الوصف', { max: 300 })) ?? null,
      icon: pick('icon', (v) => str(v, 'الأيقونة', { max: 16 })) ?? null,
      cover_asset_id: pick('cover_asset_id', (v) => assetRef(v, 'صورة الغلاف', 'image')) ?? null,
      is_visible: pick('is_visible', (v) => (bool(v, true) ? 1 : 0)) ?? 1,
      sort_order: pick('sort_order', (v) => int(v, 'الترتيب', { required: true })),
    };
  };

  r.post('/categories', contentTeam, (req, res) => {
    const fields = categoryFields(req.body);
    fields.sort_order ??= q.nextCategoryOrder.get();
    const id = db
      .prepare(`
        INSERT INTO categories (name_ar, name_en, description_ar, icon, cover_asset_id, is_visible, sort_order)
        VALUES (@name_ar, @name_en, @description_ar, @icon, @cover_asset_id, @is_visible, @sort_order)`)
      .run(fields).lastInsertRowid;
    activity.log(req.user, 'category.create', { name: fields.name_ar });
    changed();
    res.status(201).json(menu.category(id));
  });

  // Registered before '/categories/:id'.
  r.put('/categories/order', contentTeam, (req, res) => {
    const ids = idList(req.body.ids, 'الترتيب');
    const known = new Set(q.categoryIds.all());
    if (ids.some((id) => !known.has(id))) throw badRequest('الترتيب يحتوي تصنيفاً غير موجود');
    const set = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
    db.transaction(() => ids.forEach((id, i) => set.run(i, id)))();
    changed();
    res.json(menu.getMenu());
  });

  r.patch('/categories/:id', contentTeam, async (req, res) => {
    const current = loadCategory(req.params.id);
    const fields = { ...categoryFields(req.body, current), id: current.id };
    db.prepare(`
      UPDATE categories SET name_ar = @name_ar, name_en = @name_en, description_ar = @description_ar, icon = @icon,
        cover_asset_id = @cover_asset_id, is_visible = @is_visible, sort_order = @sort_order
      WHERE id = @id`).run(fields);
    changed();
    // Hidden from guests: tables showing it (or one of its dishes) go back to welcome.
    if (current.is_visible && !fields.is_visible) {
      const dishIds = new Set(q.dishIdsIn.all(current.id));
      await projection.dropScenesWhere(
        (s) => (s.type === 'category' && s.categoryId === current.id) || (s.type === 'dish' && dishIds.has(s.dishId)),
      );
    }
    res.json(menu.category(current.id));
  });

  // Its dishes stay, uncategorized.
  r.delete('/categories/:id', contentTeam, async (req, res) => {
    const current = loadCategory(req.params.id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(current.id);
    activity.log(req.user, 'category.delete', { name: current.name_ar });
    changed();
    await projection.dropScenesWhere((s) => s.type === 'category' && s.categoryId === current.id);
    res.json({ ok: true });
  });

  // ── Dishes ──────────────────────────────────────────────────────

  const dishFields = (b, current = {}) => {
    const pick = (key, read) => (has(b, key) ? read(b[key]) : current[key]);
    return {
      category_id: pick('category_id', categoryRef) ?? null,
      name_ar: pick('name_ar', (v) => str(v, 'الاسم بالعربية', { required: true, max: 80 })),
      name_en: pick('name_en', (v) => str(v, 'الاسم بالإنجليزية', { max: 80 })) ?? null,
      description_ar: pick('description_ar', (v) => str(v, 'الوصف', { max: 500 })) ?? null,
      image_asset_id: pick('image_asset_id', (v) => assetRef(v, 'الصورة', 'image')) ?? null,
      video_asset_id: pick('video_asset_id', (v) => assetRef(v, 'الفيديو', 'video')) ?? null,
      model_asset_id: pick('model_asset_id', (v) => assetRef(v, 'المجسم ثلاثي الأبعاد', 'model3d')) ?? null,
      badges: has(b, 'badges') ? JSON.stringify(badges(b.badges)) : (current.badges ?? '[]'),
      calories: pick('calories', (v) => int(v, 'السعرات', { min: 0, max: 20000 })) ?? null,
      prep_minutes: pick('prep_minutes', (v) => int(v, 'وقت التحضير', { min: 0, max: 600 })) ?? null,
      is_available: pick('is_available', (v) => (bool(v, true) ? 1 : 0)) ?? 1,
      is_featured: pick('is_featured', (v) => (bool(v) ? 1 : 0)) ?? 0,
      sort_order: pick('sort_order', (v) => int(v, 'الترتيب', { required: true })),
    };
  };
  const priceOf = (b) => num(b.price, 'السعر', { required: true, min: 0, max: MAX_PRICE });

  r.post('/dishes', contentTeam, (req, res) => {
    const fields = dishFields(req.body);
    let price = 0;
    if (has(req.body, 'price') && req.body.price !== null && req.body.price !== '') {
      price = priceOf(req.body);
      if (req.user.role !== 'owner' && price !== 0) throw forbidden(PRICE_FORBIDDEN);
    }
    fields.sort_order ??= q.nextDishOrder.get(fields.category_id);
    const now = nowIso();
    const id = db
      .prepare(`
        INSERT INTO dishes (category_id, name_ar, name_en, description_ar, price, image_asset_id, video_asset_id,
          model_asset_id, badges, calories, prep_minutes, is_available, is_featured, sort_order, created_at, updated_at)
        VALUES (@category_id, @name_ar, @name_en, @description_ar, @price, @image_asset_id, @video_asset_id,
          @model_asset_id, @badges, @calories, @prep_minutes, @is_available, @is_featured, @sort_order, @now, @now)`)
      .run({ ...fields, price, now }).lastInsertRowid;
    activity.log(req.user, 'dish.create', { name: fields.name_ar, price });
    changed();
    res.status(201).json(menu.dish(id));
  });

  // Registered before '/dishes/:id'.
  r.put('/dishes/order', contentTeam, (req, res) => {
    const categoryId = int(req.body.category_id, 'التصنيف', { min: 1 });
    if (categoryId && !menu.categoryRow(categoryId)) throw notFound('التصنيف غير موجود');
    const ids = idList(req.body.ids, 'الترتيب');
    const inCategory = new Set(q.dishIdsIn.all(categoryId));
    if (ids.some((id) => !inCategory.has(id))) throw badRequest('الترتيب يحتوي طبقاً من تصنيف آخر');
    const set = db.prepare('UPDATE dishes SET sort_order = ? WHERE id = ?');
    db.transaction(() => ids.forEach((id, i) => set.run(i, id)))();
    changed();
    res.json(menu.getMenu());
  });

  r.patch('/dishes/:id', contentTeam, async (req, res) => {
    const current = loadDish(req.params.id);
    const fields = { ...dishFields(req.body, current), id: current.id, price: current.price, now: nowIso() };
    if (has(req.body, 'price')) {
      const price = priceOf(req.body);
      if (price !== current.price) {
        if (req.user.role !== 'owner') throw forbidden(PRICE_FORBIDDEN);
        fields.price = price;
      }
    }
    // Moving to another category without an explicit order: append at its end.
    if (fields.category_id !== current.category_id && !has(req.body, 'sort_order')) {
      fields.sort_order = q.nextDishOrder.get(fields.category_id);
    }
    db.prepare(`
      UPDATE dishes SET category_id = @category_id, name_ar = @name_ar, name_en = @name_en,
        description_ar = @description_ar, price = @price, image_asset_id = @image_asset_id,
        video_asset_id = @video_asset_id, model_asset_id = @model_asset_id, badges = @badges, calories = @calories,
        prep_minutes = @prep_minutes, is_available = @is_available, is_featured = @is_featured,
        sort_order = @sort_order, updated_at = @now
      WHERE id = @id`).run(fields);
    if (fields.price !== current.price) {
      activity.log(req.user, 'dish.price', { dishId: current.id, name: fields.name_ar, from: current.price, to: fields.price });
    }
    changed();
    if (current.is_available && !fields.is_available) {
      await projection.dropScenesWhere((s) => s.type === 'dish' && s.dishId === current.id);
    }
    res.json(menu.dish(current.id));
  });

  // Past orders keep the dish name and price (snapshot).
  r.delete('/dishes/:id', contentTeam, async (req, res) => {
    const current = loadDish(req.params.id);
    db.prepare('DELETE FROM dishes WHERE id = ?').run(current.id);
    activity.log(req.user, 'dish.delete', { name: current.name_ar });
    changed();
    await projection.dropScenesWhere((s) => s.type === 'dish' && s.dishId === current.id);
    res.json({ ok: true });
  });

  return r;
}

const KIND_AR = { image: 'الصور', video: 'الفيديو', model3d: 'ملفات ‎.glb' };

// Badges: short Arabic labels ("حار", "نباتي"); a comma-separated string works too.
function badges(value) {
  const list = typeof value === 'string' ? value.split(/[,،]/) : value;
  if (list == null) return [];
  if (!Array.isArray(list)) throw badRequest('الشارات يجب أن تكون قائمة');
  const clean = [...new Set(list.map((b) => (typeof b === 'string' ? b.trim() : '')).filter(Boolean))];
  if (clean.length > 8) throw badRequest('الحد الأقصى 8 شارات');
  if (clean.some((b) => b.length > 24)) throw badRequest('الشارة يجب ألا تتجاوز 24 حرفاً');
  return clean;
}
