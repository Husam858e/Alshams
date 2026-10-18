// What the API answers, computed from the backend state `s` (same shapes as
// the server's DTOs): menu, floor, orders, settings, scenes and the
// bootstrap a projector player starts from. Pure reads of `s`, shared by
// the offline demo (index.js) and the cloud host (assets/cloud/backend/),
// whose replica of the Firestore data has the same shape.
//
// `s`: users, areas, tables, projectors, assets, categories, dishes, orders
// (items embedded), activity, scenes (Map tableId -> scene), settings
// {general, theme}.

import { ACTIVE_STATUSES, SCENE_TYPES, publicUser } from './roles.js';
import { DEFAULT_CALIBRATION } from './seed.js';
import { HttpError } from './validate.js';

export const DEFAULT_SCENE = Object.freeze({ type: 'welcome' });

// Designers get no orders: an 'order' scene reaches them without its
// snapshot (src/services/projectionService.js sceneFor).
export const sceneFor = (scene, role) => {
  if (role !== 'designer' || scene?.type !== 'order') return scene;
  const { order: _order, ...rest } = scene;
  return rest;
};

export function createModel(s) {
  // ── Lookups ────────────────────────────────────────────────────
  const assetById = (id) => (id ? s.assets.find((a) => a.id === id) ?? null : null);
  const urlOf = (id) => assetById(id)?.url ?? null;
  const tableById = (id) => s.tables.find((t) => t.id === id) ?? null;
  const areaById = (id) => s.areas.find((a) => a.id === id) ?? null;
  const userById = (id) => s.users.find((u) => u.id === id) ?? null;
  const orderById = (id) => s.orders.find((o) => o.id === id) ?? null;
  const bySort = (a, b) => a.sort_order - b.sort_order || a.id - b.id;

  // ── Menu and settings ──────────────────────────────────────────
  const dishDto = (d) => ({
    ...structuredClone(d),
    image_url: urlOf(d.image_asset_id),
    video_url: urlOf(d.video_asset_id),
    model_url: urlOf(d.model_asset_id),
  });
  const categoryDto = (c) => ({ ...structuredClone(c), cover_url: urlOf(c.cover_asset_id) });

  function menu({ forPlayer = false } = {}) {
    const dishes = [...s.dishes].sort(bySort).filter((d) => !forPlayer || d.is_available).map(dishDto);
    const categories = [...s.categories]
      .sort(bySort)
      .filter((c) => !forPlayer || c.is_visible)
      .map((c) => ({ ...categoryDto(c), dishes: dishes.filter((d) => d.category_id === c.id) }));
    return { categories, uncategorized: dishes.filter((d) => d.category_id == null) };
  }

  function settingsAll() {
    const { general, theme } = s.settings;
    const bgId = theme.background?.type === 'preset' ? null : theme.background?.assetId;
    return { general: structuredClone(general), theme: structuredClone(theme), logo_url: urlOf(general.logoAssetId), background_url: urlOf(bgId) };
  }

  // ── Orders and the floor ───────────────────────────────────────
  const orderDto = (o) => ({
    id: o.id,
    table_id: o.table_id,
    table_number: tableById(o.table_id)?.number ?? o.table_number,
    waiter_id: o.waiter_id,
    waiter_name: userById(o.waiter_id)?.name ?? null,
    status: o.status,
    notes: o.notes,
    total: o.total,
    created_at: o.created_at,
    updated_at: o.updated_at,
    items: o.items.map((i) => ({ ...i })),
  });

  function activeByTable() {
    const map = new Map();
    for (const o of [...s.orders].sort((a, b) => b.id - a.id)) {
      if (!ACTIVE_STATUSES.includes(o.status)) continue;
      const entry = map.get(o.table_id);
      if (entry) entry.activeCount += 1;
      else {
        const itemsCount = o.items.reduce((n, i) => n + i.quantity, 0);
        map.set(o.table_id, { activeOrder: { id: o.id, status: o.status, total: o.total, itemsCount }, activeCount: 1 });
      }
    }
    return map;
  }

  function tableDto(t, active = activeByTable()) {
    return {
      id: t.id,
      number: t.number,
      seats: t.seats,
      status: t.status,
      area_id: t.area_id,
      sort_order: t.sort_order,
      projectors: s.projectors.filter((p) => p.table_id === t.id).sort((a, b) => a.id - b.id).map((p) => ({ id: p.id, name: p.name, online: p.online })),
      scene: structuredClone(s.scenes.get(t.id) ?? DEFAULT_SCENE),
      activeOrder: active.get(t.id)?.activeOrder ?? null,
      activeOrdersCount: active.get(t.id)?.activeCount ?? 0,
    };
  }
  const sortedTables = () => [...s.tables].sort((a, b) => a.sort_order - b.sort_order || a.number - b.number);

  function floor() {
    const active = activeByTable();
    const tables = sortedTables().map((t) => tableDto(t, active));
    const areas = [...s.areas].sort(bySort).map((a) => ({ id: a.id, name: a.name, sort_order: a.sort_order, tables: tables.filter((t) => t.area_id === a.id) }));
    const areaIds = new Set(areas.map((a) => a.id));
    return { areas, unassigned: tables.filter((t) => !areaIds.has(t.area_id)) };
  }

  // ── Scenes and player bootstraps ───────────────────────────────
  const storedScene = (tableId) => s.scenes.get(tableId) ?? { ...DEFAULT_SCENE };
  // Order scenes carry the order (null once it is gone), like the server's.
  const resolve = (scene) => (scene.type === 'order' ? { ...scene, order: orderById(scene.orderId) ? orderDto(orderById(scene.orderId)) : null } : { ...scene });
  const getScene = (tableId) => resolve(storedScene(tableId));

  const projectorView = (p) => ({ id: p.id, name: p.name, rotation: p.rotation, layout: p.layout, calibration: structuredClone(p.calibration) });

  function bootstrapFor(p, tableId = p?.table_id) {
    const t = tableId ? tableById(tableId) : null;
    return {
      projector: projectorView(p),
      table: t ? { id: t.id, number: t.number, area_name: areaById(t.area_id)?.name ?? null } : null,
      settings: settingsAll(),
      menu: menu({ forPlayer: true }),
      scene: t ? getScene(t.id) : { ...DEFAULT_SCENE },
    };
  }

  const neutralProjector = (tableId) => ({ id: null, name: 'معاينة', table_id: tableId, rotation: 0, layout: 'single', calibration: DEFAULT_CALIBRATION() });
  const firstProjector = (tableId) => s.projectors.filter((p) => p.table_id === tableId).sort((a, b) => a.id - b.id)[0] ?? null;
  // Staff preview of a table: its first projector, or a neutral default.
  const previewBootstrap = (tableId) => bootstrapFor(firstProjector(tableId) ?? neutralProjector(tableId), tableId);

  // Same rules and messages as the server's ProjectionService.validateScene.
  function validateScene(tableId, input) {
    const type = input?.type;
    if (!SCENE_TYPES.includes(type)) throw new HttpError(400, 'نوع العرض غير صالح');
    const id = (value, label) => {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `قيمة غير صالحة للحقل "${label}"`);
      return n;
    };
    if (type === 'category') {
      const categoryId = id(input.categoryId, 'التصنيف');
      const category = s.categories.find((c) => c.id === categoryId);
      if (!category) throw new HttpError(400, 'التصنيف غير موجود');
      if (!category.is_visible) throw new HttpError(400, `التصنيف "${category.name_ar}" مخفي عن الضيوف. أظهره أولاً`);
      return { type, categoryId };
    }
    if (type === 'dish') {
      const dishId = id(input.dishId, 'الطبق');
      const dish = s.dishes.find((d) => d.id === dishId);
      if (!dish) throw new HttpError(400, 'الطبق غير موجود');
      if (!dish.is_available) throw new HttpError(400, `"${dish.name_ar}" غير متوفر حالياً ولا يظهر للضيوف`);
      const category = dish.category_id ? s.categories.find((c) => c.id === dish.category_id) : null;
      if (category && !category.is_visible) throw new HttpError(400, `تصنيف "${dish.name_ar}" مخفي عن الضيوف`);
      return { type, dishId };
    }
    if (type === 'order') {
      const orderId = id(input.orderId, 'الطلب');
      const order = orderById(orderId);
      if (!order || order.table_id !== tableId) throw new HttpError(400, 'الطلب غير موجود على هذه الطاولة');
      if (!ACTIVE_STATUSES.includes(order.status)) throw new HttpError(400, 'هذا الطلب منتهٍ ولا يُعرض على الطاولة');
      return { type, orderId };
    }
    return { type };
  }

  return {
    find: { table: tableById, area: areaById, user: userById, asset: assetById, order: orderById },
    dto: { dish: dishDto, category: categoryDto, menu, settings: settingsAll, order: orderDto, table: tableDto, floor, publicUser },
    sortedTables,
    storedScene,
    resolve,
    getScene,
    projectorView,
    bootstrapFor,
    neutralProjector,
    previewBootstrap,
    validateScene,
  };
}
