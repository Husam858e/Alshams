// In-memory stand-in for the restaurant server, for the offline demo in the
// Android app. It answers the staff app's /api/* requests (same paths,
// roles, validation and Arabic errors as src/routes/*), plays the '/live'
// channel for staff screens, and feeds projector players through the
// player's demo seam (public/player/lib/net.js: openDevice / openPreview).
//
// Nothing leaves the device and nothing is saved: closing the demo forgets
// every change (uploads are blob: URLs that live as long as the page).
//
// No DOM here (tests run it in Node); demo.js wires it to the page.

import { DEFAULT_CALIBRATION, seedState } from './seed.js';
import { ACTIVE_STATUSES, SCENE_TYPES, publicUser } from './roles.js';
import { HttpError, notFound } from './validate.js';
import { authRoutes } from './routes/auth.js';
import { floorRoutes } from './routes/floor.js';
import { menuRoutes } from './routes/menu.js';
import { orderRoutes } from './routes/orders.js';

export const DEMO_DEVICE_KEY = 'demo';
const DEFAULT_SCENE = Object.freeze({ type: 'welcome' });

// The global of the realm a function was created in (a player iframe), so
// payloads can be cloned into it and a closed frame can be noticed.
function realmOf(fn) {
  try {
    return fn.constructor('return globalThis')();
  } catch {
    return null;
  }
}

// A subscriber living in another frame: calls are dropped (and the
// subscription forgotten) once that frame is gone or navigated away.
function frameTarget(fn) {
  const realm = realmOf(fn);
  let doc;
  try {
    doc = realm?.document;
  } catch {
    doc = undefined;
  }
  return {
    alive() {
      try {
        return !realm || (!realm.closed && realm.document === doc);
      } catch {
        return false;
      }
    },
    clone(value) {
      try {
        return (realm?.structuredClone ?? structuredClone)(value);
      } catch {
        return structuredClone(value);
      }
    },
  };
}

export function createBackend({ sample, media, now = () => Date.now(), probe = null, schedule = setTimeout } = {}) {
  const s = seedState({ sample, media, now });
  const nowIso = () => new Date(now()).toISOString();
  let sessionUserId = null;

  const user = () => {
    const u = s.users.find((x) => x.id === sessionUserId);
    return u?.is_active ? u : null;
  };

  // ── Activity log ───────────────────────────────────────────────
  const log = (who, action, details = null) => {
    s.activity.push({ id: s.nextId('activity'), user_id: who?.id ?? null, action, details, created_at: nowIso() });
  };

  // ── '/live' staff channel ──────────────────────────────────────
  const liveSubs = new Map(); // fn(event, payload) -> its frame
  const live = {
    staff(event, payload = {}) {
      prune();
      if (!user()) return;
      for (const [fn, target] of [...liveSubs]) {
        if (!target.alive()) {
          liveSubs.delete(fn);
          continue;
        }
        try {
          fn(event, structuredClone(payload));
        } catch (err) {
          console.error(err);
        }
      }
    },
    roles(roles, event, payload = {}) {
      if (roles.includes(user()?.role)) live.staff(event, payload);
    },
    floorChanged() {
      live.staff('floor:changed', {});
      notifyView();
    },
  };

  // ── DTOs (same shapes as the server) ───────────────────────────
  const assetById = (id) => (id ? s.assets.find((a) => a.id === id) ?? null : null);
  const urlOf = (id) => assetById(id)?.url ?? null;
  const tableById = (id) => s.tables.find((t) => t.id === id) ?? null;
  const areaById = (id) => s.areas.find((a) => a.id === id) ?? null;
  const userById = (id) => s.users.find((u) => u.id === id) ?? null;
  const bySort = (a, b) => a.sort_order - b.sort_order || a.id - b.id;

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
  const orderById = (id) => s.orders.find((o) => o.id === id) ?? null;

  const isOnline = (projectorId) => Boolean(s.projectors.find((p) => p.id === projectorId)?.online);

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

  // ── Projection: scenes, players, previews ──────────────────────
  const storedScene = (tableId) => s.scenes.get(tableId) ?? { ...DEFAULT_SCENE };
  const resolve = (scene) => (scene.type === 'order' ? { ...scene, order: orderById(scene.orderId) ? orderDto(orderById(scene.orderId)) : null } : { ...scene });
  const getScene = (tableId) => resolve(storedScene(tableId));

  const projectorView = (p) => ({ id: p.id, name: p.name, rotation: p.rotation, layout: p.layout, calibration: structuredClone(p.calibration) });
  const testPatterns = new Set(); // projector ids showing the test pattern

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
  const previewBootstrap = (tableId) => bootstrapFor(firstProjector(tableId) ?? neutralProjector(tableId), tableId);

  // The demo's projector pane looks at one table at a time (the one being
  // worked on); it shows that table's first switched-on projector.
  let focusTableId = sortedTables()[0]?.id ?? null;
  // A projector switched off over PJLink keeps its player online but casts no light.
  const lit = (p) => p.online && !['off', 'cooling'].includes(p.power);
  const shownProjector = () => s.projectors.filter((p) => p.table_id === focusTableId && lit(p)).sort((a, b) => a.id - b.id)[0] ?? null;

  const devices = new Set(); // {on, target, projectorId}
  const previews = new Set(); // {on, target, tableId}
  // Forget players whose frame is gone (a preview closed with its screen).
  function prune() {
    for (const set of [devices, previews]) for (const sub of set) if (!sub.target.alive()) set.delete(sub);
  }

  const deliver = (sub, method, ...args) => {
    if (!sub.target.alive()) {
      devices.delete(sub);
      previews.delete(sub);
      return;
    }
    try {
      sub.on[method](...args.map((a) => sub.target.clone(a)));
    } catch (err) {
      console.error(err);
    }
  };

  function attachDevice(sub) {
    const p = shownProjector();
    sub.projectorId = p?.id ?? null;
    if (p) deliver(sub, 'bootstrap', bootstrapFor(p));
    else {
      // No projector on (or none at all): the table stays dark.
      const boot = bootstrapFor(neutralProjector(focusTableId), focusTableId);
      deliver(sub, 'bootstrap', { ...boot, scene: { type: 'off' } });
    }
    deliver(sub, 'testPattern', Boolean(p && testPatterns.has(p.id)));
  }

  const refreshers = new WeakMap();
  // Coalesces bursts (menu edits) into one bootstrap per player, like the
  // real player's debounced refetch.
  function refetchLater(sub) {
    if (refreshers.get(sub)) return;
    refreshers.set(sub, true);
    schedule(() => {
      refreshers.set(sub, false);
      if (devices.has(sub)) attachDevice(sub);
      else if (previews.has(sub)) {
        if (!user()) deliver(sub, 'fatal', 'login');
        else if (!tableById(sub.tableId)) deliver(sub, 'fatal', 'missing');
        else deliver(sub, 'bootstrap', previewBootstrap(sub.tableId));
      }
    }, 120);
  }

  // Players and previews follow the staff events, as on the server.
  liveSubs.set((event, payload) => {
    for (const sub of [...previews]) {
      if (event === 'scene' && payload.tableId === sub.tableId) deliver(sub, 'scene', payload.scene);
      else if (event === 'order') deliver(sub, 'order', payload);
      else if (['menu:changed', 'settings:changed', 'floor:changed'].includes(event)) refetchLater(sub);
    }
  }, { alive: () => true });

  function sendToTable(tableId, scene) {
    let online = 0;
    for (const p of s.projectors) if (p.table_id === tableId && p.online) online += 1;
    for (const sub of [...devices]) if (focusTableId === tableId && sub.projectorId) deliver(sub, 'scene', scene);
    return online;
  }

  const projection = {
    storedScene,
    getScene,
    isOnline,
    previewBootstrap,

    validateScene(tableId, input) {
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
        return { type, orderId };
      }
      return { type };
    },

    // -> {scene, delivered:{online, acked}}; every switched-on demo projector acks at once.
    setScene(tableId, input, by) {
      const scene = { ...projection.validateScene(tableId, input), at: nowIso(), by: by?.name ?? null };
      s.scenes.set(tableId, scene);
      const resolved = resolve(scene);
      live.staff('scene', { tableId, scene: resolved });
      const online = sendToTable(tableId, resolved);
      if (by) focus(tableId);
      else notifyView();
      return { scene: resolved, delivered: { online, acked: online } };
    },

    refresh(tableId) {
      const scene = getScene(tableId);
      sendToTable(tableId, scene);
      live.staff('scene', { tableId, scene });
      notifyView();
    },

    orderChanged(order) {
      const scene = storedScene(order.table_id);
      if (scene.type === 'order' && scene.orderId === order.id) projection.refresh(order.table_id);
    },

    dropScenesWhere(predicate) {
      for (const [tableId, scene] of [...s.scenes]) {
        if (predicate(scene)) projection.setScene(tableId, DEFAULT_SCENE, null);
      }
    },

    pushProjector(projectorId) {
      const p = s.projectors.find((x) => x.id === projectorId);
      if (!p) return 0;
      const { rotation, layout, calibration } = projectorView(p);
      for (const sub of devices) if (sub.projectorId === p.id) deliver(sub, 'projector', { rotation, layout, calibration });
      return p.online ? 1 : 0;
    },

    testPattern(projectorId, on) {
      const p = s.projectors.find((x) => x.id === projectorId);
      if (on) testPatterns.add(projectorId);
      else testPatterns.delete(projectorId);
      if (on && p?.online && p.table_id) focus(p.table_id);
      for (const sub of devices) if (sub.projectorId === projectorId) deliver(sub, 'testPattern', Boolean(on));
      return p?.online ? 1 : 0;
    },

    // Projector moved, switched off, deleted or added: players start over.
    rebootstrap() {
      for (const sub of [...devices]) attachDevice(sub);
    },

    menuChanged() {
      for (const sub of [...devices]) refetchLater(sub);
      live.staff('menu:changed', {});
    },

    settingsChanged() {
      for (const sub of [...devices]) refetchLater(sub);
      live.staff('settings:changed', {});
    },

    setOnline(p, online) {
      if (p.online === online) return;
      p.online = online;
      p.last_seen_at = nowIso();
      live.staff('projector:status', { id: p.id, tableId: p.table_id, online });
      projection.rebootstrap();
    },
  };

  // ── What the demo page shows next to the table ─────────────────
  const viewListeners = new Set();
  let viewQueued = false;
  function notifyView() {
    if (viewQueued || !viewListeners.size) return;
    viewQueued = true;
    queueMicrotask(() => {
      viewQueued = false;
      const v = view();
      for (const fn of viewListeners) fn(v);
    });
  }

  function view() {
    const t = tableById(focusTableId);
    const p = shownProjector();
    const scene = t ? getScene(t.id) : null;
    return {
      table: t ? { id: t.id, number: t.number, seats: t.seats, status: t.status, area_name: areaById(t.area_id)?.name ?? null } : null,
      projector: p ? { id: p.id, name: p.name, layout: p.layout, rotation: p.rotation } : null,
      hasProjectors: Boolean(t && s.projectors.some((x) => x.table_id === t.id)),
      scene,
      label: scene ? sceneLabel(scene) : '',
      restaurantName: s.settings.general.restaurantName,
    };
  }

  function sceneLabel(scene) {
    const base = { welcome: 'شاشة الترحيب', menu: 'المنيو كامل', category: 'تصنيف', dish: 'طبق', order: 'الطلب', off: 'مطفأ' }[scene.type] ?? scene.type;
    if (scene.type === 'category') return `تصنيف: ${s.categories.find((c) => c.id === scene.categoryId)?.name_ar ?? '—'}`;
    if (scene.type === 'dish') return `طبق: ${s.dishes.find((d) => d.id === scene.dishId)?.name_ar ?? '—'}`;
    if (scene.type === 'order') return `الطلب #${scene.orderId}`;
    return base;
  }

  function focus(tableId) {
    if (!tableById(tableId)) return;
    if (tableId !== focusTableId) {
      focusTableId = tableId;
      projection.rebootstrap();
    }
    notifyView();
  }

  // ── Router ─────────────────────────────────────────────────────
  const routes = [];
  const route = (method, pattern, roles, handler) => {
    const parts = pattern.split('/').filter(Boolean);
    routes.push({ method, pattern, parts, roles, handler });
  };
  const matchRoute = (method, path) => {
    const segs = path.split('/').filter(Boolean);
    let pathMatched = false;
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const params = {};
      if (!r.parts.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(segs[i])), true) : p === segs[i]))) continue;
      pathMatched = true;
      if (r.method === method) return { route: r, params };
    }
    return pathMatched ? 'method' : null;
  };

  const ctx = {
    state: s,
    now,
    nowIso,
    user,
    setSessionUser: (id) => {
      sessionUserId = id;
      notifyView();
    },
    log,
    live,
    projection,
    probe,
    schedule,
    dto: { dish: dishDto, category: categoryDto, menu, settings: settingsAll, order: orderDto, table: tableDto, floor, publicUser },
    find: { table: tableById, area: areaById, user: userById, asset: assetById, order: orderById },
  };
  ctx.created = (data) => ({ __status: 201, data });
  ctx.focus = focus;

  authRoutes(route, ctx);
  floorRoutes(route, ctx);
  menuRoutes(route, ctx);
  orderRoutes(route, ctx);

  // One API call: {method, url ('/api/...?...'), body, file} -> {status, data}.
  async function request({ method = 'GET', url, body = null, file = null, fields = {} }) {
    const parsed = new URL(url, 'http://demo.local');
    const path = parsed.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
    const query = Object.fromEntries(parsed.searchParams);
    try {
      const found = matchRoute(method.toUpperCase(), path);
      if (!found || found === 'method') throw notFound('المسار غير موجود');
      const { route: r, params } = found;
      const me = user();
      if (r.roles) {
        if (!me) throw new HttpError(401, 'يجب تسجيل الدخول أولاً');
        if (!r.roles.includes(me.role)) throw new HttpError(403, 'ليست لديك صلاحية لهذا الإجراء');
      }
      const out = await r.handler({ params, query, body: body && typeof body === 'object' ? body : {}, user: me, file, fields });
      if (method.toUpperCase() !== 'GET') notifyView();
      if (out && out.__status) return { status: out.__status, data: structuredClone(out.data) };
      return { status: 200, data: structuredClone(out ?? null) };
    } catch (err) {
      if (err instanceof HttpError) return { status: err.status, data: { error: err.message } };
      console.error(err);
      return { status: 500, data: { error: 'حدث خطأ في الخادم' } };
    }
  }

  return {
    request,
    routes: () => routes.map((r) => `${r.method} ${r.pattern}`),

    // The demo signs in as the chosen role (or nobody: the login screen).
    signInAs(role) {
      const u = s.users.find((x) => x.role === role && x.is_active);
      sessionUserId = u?.id ?? null;
      if (u) {
        u.last_login_at = nowIso();
        log(u, 'auth.login', { username: u.username });
      }
      notifyView();
      return publicUser(u) ?? null;
    },
    currentUser: () => publicUser(user()),

    // '/live' for the staff app's fake socket. -> unsubscribe
    subscribeLive(fn) {
      liveSubs.set(fn, frameTarget(fn));
      return () => liveSubs.delete(fn);
    },

    // The player's demo seam (same contract as net.js openDevice / openPreview).
    openDevice(deviceKey, on) {
      const sub = { on, target: frameTarget(on.bootstrap), projectorId: null };
      schedule(() => {
        if (deviceKey !== DEMO_DEVICE_KEY) return deliver(sub, 'fatal', 'unauthorized');
        devices.add(sub);
        deliver(sub, 'online', true);
        attachDevice(sub);
      }, 0);
      return {
        reportStatus() {},
        async fetchOrder(orderId) {
          const o = orderById(Number(orderId));
          return o && o.table_id === focusTableId ? sub.target.clone(orderDto(o)) : null;
        },
      };
    },

    openPreview(tableId, on) {
      const sub = { on, target: frameTarget(on.bootstrap), tableId: Number(tableId) };
      schedule(() => {
        previews.add(sub);
        deliver(sub, 'online', true);
        refetchLater(sub);
      }, 0);
      return {
        reportStatus() {},
        async fetchOrder(orderId) {
          const o = orderById(Number(orderId));
          return o && o.table_id === sub.tableId && user() ? sub.target.clone(orderDto(o)) : null;
        },
      };
    },

    // Which table the projector pane looks at.
    focus,
    focusDevice(deviceKey) {
      const p = s.projectors.find((x) => x.device_key === deviceKey);
      if (p?.table_id) focus(p.table_id);
      return Boolean(p);
    },
    view,
    // Diagnostics: how many frames are listening (closed frames are dropped).
    stats: () => ({ live: liveSubs.size, devices: devices.size, previews: previews.size }),
    onView(fn) {
      viewListeners.add(fn);
      fn(view());
      return () => viewListeners.delete(fn);
    },
  };
}
