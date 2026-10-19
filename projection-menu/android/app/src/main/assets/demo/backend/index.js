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

import { seedState } from './seed.js';
import { publicUser } from './roles.js';
import { frameTarget, sameRealm } from './frames.js';
import { DEFAULT_SCENE, createModel, sceneFor } from './model.js';
import { authorize, createRouter, errorReply, parseUrl, reply } from './router.js';
import { authRoutes } from './routes/auth.js';
import { floorRoutes } from './routes/floor.js';
import { menuRoutes } from './routes/menu.js';
import { orderRoutes } from './routes/orders.js';

export const DEMO_DEVICE_KEY = 'demo';

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
      // Designers get order scenes without the order (like the server).
      if (event === 'scene') payload = { ...payload, scene: sceneFor(payload.scene, user().role) };
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
  const model = createModel(s);
  const { dto, find, sortedTables, storedScene, getScene, projectorView, bootstrapFor, neutralProjector, previewBootstrap } = model;
  const { table: tableById, area: areaById, order: orderById } = find;
  const orderDto = dto.order;
  const isOnline = (projectorId) => Boolean(s.projectors.find((p) => p.id === projectorId)?.online);
  const testPatterns = new Set(); // projector ids showing the test pattern

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
  }, sameRealm);

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

    validateScene: model.validateScene,

    // -> {scene, delivered:{online, acked}}; every switched-on demo projector acks at once.
    setScene(tableId, input, by) {
      const scene = { ...projection.validateScene(tableId, input), at: nowIso(), by: by?.name ?? null };
      s.scenes.set(tableId, scene);
      const resolved = model.resolve(scene);
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

    testPatternOn: (projectorId) => testPatterns.has(projectorId),

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
  const router = createRouter();

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
    dto,
    find,
  };
  ctx.created = (data) => ({ __status: 201, data });
  ctx.focus = focus;

  authRoutes(router.route, ctx);
  floorRoutes(router.route, ctx);
  menuRoutes(router.route, ctx);
  orderRoutes(router.route, ctx);

  // One API call: {method, url ('/api/...?...'), body, file} -> {status, data}.
  async function request({ method = 'GET', url, body = null, file = null, fields = {} }) {
    const { path, query } = parseUrl(url);
    try {
      const { route: r, params } = router.match(method.toUpperCase(), path);
      const me = user();
      authorize(r, me);
      const out = await r.handler({ params, query, body: body && typeof body === 'object' ? body : {}, user: me, file, fields });
      if (method.toUpperCase() !== 'GET') notifyView();
      return reply(out);
    } catch (err) {
      return errorReply(err);
    }
  }

  return {
    request,
    routes: router.list,

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
