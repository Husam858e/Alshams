// The cloud host of the staff app (and of the player preview inside it):
// the demo backend's routes running on a live replica of the Firestore data
// (replica.js), a staff session from Firebase Auth + roles/{uid}, and the
// '/live' events derived from Firestore snapshots, not from the handlers
// (the demo's ctx.live calls are no-ops here, so nothing fires twice).

import { signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocFromServer, onSnapshot, query, where } from 'firebase/firestore';
import { ACTIVE_STATUSES, publicUser } from '../../demo/backend/roles.js';
import { HttpError } from '../../demo/backend/validate.js';
import { frameTarget } from '../../demo/backend/frames.js';
import { DEFAULT_SCENE, createModel, sceneFor } from '../../demo/backend/model.js';
import { authorize, createRouter, errorReply, parseUrl, reply } from '../../demo/backend/router.js';
import { probe } from '../../demo/backend/probe.js';
import { authRoutes } from '../../demo/backend/routes/auth.js';
import { floorRoutes } from '../../demo/backend/routes/floor.js';
import { menuRoutes } from '../../demo/backend/routes/menu.js';
import { orderRoutes } from '../../demo/backend/routes/orders.js';
import { httpErrorOf, watchConnection } from './firebase.js';
import { createIds } from './ids.js';
import { createReplica } from './replica.js';
import { ACK_WAIT_MS, ONLINE_CHECK_MS, ONLINE_MS, ORDER_WINDOW_MS, emptyState, loginKey } from './schema.js';
import { accountRoutes } from './routes/accounts.js';
import { contentRoutes } from './routes/content.js';
import { projectorRoutes } from './routes/projectors.js';
import { orderHistoryRoutes } from './routes/orders.js';

const READY_TIMEOUT_MS = 15000; // offline with an empty cache: answer with what we have
const MENU_KEYS = ['assets', 'categories', 'dishes'];
// Fields a projector device writes; changes of only these are not floor changes.
const DEVICE_FIELDS = ['last_seen_at', 'acked_at', 'power'];
const ORDER_ROLES = ['owner', 'waiter'];

// Timers that never keep Node (tests) alive on their own.
const later = (fn, ms) => {
  const timer = setTimeout(fn, ms);
  timer?.unref?.();
  return timer;
};
const timeout = (ms) => new Promise((resolve) => later(resolve, ms));
const sameExcept = (a, b, skip) => {
  const strip = (d) => JSON.stringify(Object.entries(d ?? {}).filter(([k]) => !skip.includes(k)).sort(([x], [y]) => (x < y ? -1 : 1)));
  return strip(a) === strip(b);
};

export function createStaffHost(services, { now = () => Date.now() } = {}) {
  const { auth, db } = services;
  const s = emptyState();
  const nowIso = () => new Date(now()).toISOString();
  const model = createModel(s);
  const { dto, find } = model;
  const ids = createIds(db, { wantsSpare: (kind) => connected && (kind !== 'order' || ORDER_ROLES.includes(session?.role)) });
  s.nextId = (kind) => ids.next(kind);

  // ── Session: Firebase Auth user + roles/{uid} ──────────────────
  let session = null; // {uid, userId, role}
  let roleOff = null;
  let establishing = null; // Promise<session|null>
  let settleEstablishing = null;
  let replica = null;
  let replicaReady = null; // Promise
  let liveReady = false;

  // The signed-in user's row (roles/{uid} is the source of truth for the role).
  function user() {
    if (!session) return null;
    const row = s.users.find((u) => u.id === session.userId);
    if (!row) return null;
    return row.role === session.role && row.is_active ? row : { ...row, role: session.role, is_active: true };
  }

  // Follows roles/{uid} of the signed-in Auth user. -> Promise<session|null>
  function establish() {
    const fbUser = auth.currentUser;
    stopSession();
    if (!fbUser || fbUser.isAnonymous) return Promise.resolve(null);
    const uid = fbUser.uid;
    establishing = new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        if (settleEstablishing === settle) settleEstablishing = null;
        resolve(value);
      };
      settleEstablishing = settle;
      later(() => settle(session), READY_TIMEOUT_MS);
      roleOff = onSnapshot(
        doc(db, 'roles', uid),
        (snap) => {
          const r = snap.exists() ? snap.data() : null;
          if (!session) {
            if (!r && snap.metadata.fromCache) return; // offline, nothing cached yet: wait for the server
            if (!r?.active) {
              endSession();
              return settle(null);
            }
            session = { uid, userId: r.userId, role: r.role };
            startReplica();
            replicaReady.then(() => settle(session));
            return;
          }
          if (!r?.active) {
            // Deactivated, or the account was replaced (password reset).
            endSession();
            kick();
          } else if (r.role !== session.role || r.userId !== session.userId) {
            session = { uid, userId: r.userId, role: r.role };
            startReplica();
            kick();
          }
        },
        () => {
          // permission-denied: the roles doc is gone or the rules changed.
          endSession();
          settle(null);
          kick();
        },
      );
    });
    return establishing;
  }

  function stopSession() {
    roleOff?.();
    roleOff = null;
    session = null;
    stopReplica();
    settleEstablishing?.(null); // a restore still in progress ends without a session
  }

  // Signed out, by the user or because the account was turned off.
  function endSession() {
    stopSession();
    establishing = null;
    if (auth.currentUser) signOut(auth).catch(() => {});
  }

  // Whatever a request needs before it can be answered from `s`.
  async function whenReady() {
    await started; // a session kept from an earlier visit is being restored
    if (establishing) await establishing;
    if (replicaReady) await replicaReady;
  }

  // ── Replica lifecycle ──────────────────────────────────────────
  function resetState() {
    const fresh = emptyState();
    for (const key of Object.keys(fresh)) if (key !== 'nextId') s[key] = fresh[key];
    online.clear();
  }

  function stopReplica() {
    replica?.stop();
    replica = null;
    replicaReady = null;
    liveReady = false;
    resetState();
  }

  function startReplica() {
    stopReplica();
    const role = session.role;
    replica = createReplica({
      db,
      s,
      ids,
      hidden: (key, data) => key === 'projectors' && data.pending === true,
      decorate: (key, row) => (key === 'projectors' ? { ...row, online: isFresh(row.last_seen_at) } : row),
      extraWrites,
      onChange,
      isOnline: () => connected,
      onLateFailure: () => {
        // The UI showed a change the server then refused: refresh every screen.
        for (const event of ['floor:changed', 'menu:changed', 'settings:changed']) emit(event, {});
      },
    });
    const onError = (err) => {
      if (err?.code === 'permission-denied') recheckSoon();
      else console.error('cloud: listener failed', err);
    };
    const firsts = [
      ['users', 'users'],
      ['areas', 'areas'],
      ['tables', 'tables'],
      ['projectors', 'projectors'],
      ['assets', 'media'],
      ['categories', 'categories'],
      ['dishes', 'dishes'],
      ['settings', 'settings'],
      ['scenes', 'scenes'],
    ].map(([key, path]) => replica.listen(path, key, collection(db, path), { onError }));
    // Orders: the active ones and the last 24 hours (history is queried on demand).
    if (ORDER_ROLES.includes(role)) {
      const since = new Date(now() - ORDER_WINDOW_MS).toISOString();
      firsts.push(replica.listen('orders:active', 'orders', query(collection(db, 'orders'), where('status', 'in', ACTIVE_STATUSES)), { onError }));
      firsts.push(replica.listen('orders:recent', 'orders', query(collection(db, 'orders'), where('created_at', '>=', since)), { onError }));
    }
    const mine = replica;
    replicaReady = Promise.race([Promise.all(firsts), timeout(READY_TIMEOUT_MS)]).then(() => {
      if (replica !== mine) return;
      liveReady = true;
      emit('live:connected', {});
    });
  }

  // A listener was refused: the role is probably gone or changed, which
  // roles/{uid} reports by itself. If the session still looks fine a moment
  // later, ask the server and restart the replica (a refused listener is dead).
  let recheckTimer = null;
  function recheckSoon() {
    if (recheckTimer || !session) return;
    recheckTimer = later(async () => {
      recheckTimer = null;
      if (!session) return;
      const uid = session.uid;
      try {
        const r = (await getDocFromServer(doc(db, 'roles', uid))).data();
        if (session?.uid !== uid) return;
        if (!r?.active) {
          endSession();
          kick();
        } else startReplica();
      } catch {
        // offline: the roles listener reports when back
      }
    }, 2000);
  }

  // Users: their Auth account's role and login live in roles/ and logins/.
  function extraWrites(key, { before, after }) {
    if (key === 'projectors') {
      // A deleted or unbound projector (or one of a deleted table) cuts its
      // device off. The device must first see the projector change (it stops
      // and shows the pairing screen); its access goes in a second commit.
      if (before?.device_uid && (!after || after.device_uid !== before.device_uid)) return [{ op: 'delete', path: ['devices', before.device_uid], later: true }];
      return [];
    }
    if (key !== 'users' || !after?.uid) return [];
    const roleDoc = { role: after.role, userId: after.id, active: Boolean(after.is_active) };
    if (!before || before.uid !== after.uid) {
      const writes = [
        { op: 'set', path: ['roles', after.uid], data: roleDoc },
        { op: 'set', path: ['logins', loginKey(after.username)], data: { email: after.email, userId: after.id } },
      ];
      if (before?.uid) writes.push({ op: 'delete', path: ['roles', before.uid] });
      return writes;
    }
    if (before.role !== after.role || before.is_active !== after.is_active) {
      return [{ op: 'update', path: ['roles', after.uid], data: { role: roleDoc.role, active: roleDoc.active } }];
    }
    return [];
  }

  // ── Projectors online (heartbeat within ONLINE_MS) and scene acks ──
  const online = new Map(); // projector id -> last reported online
  const isFresh = (iso) => Boolean(iso) && now() - Date.parse(iso) < ONLINE_MS;
  const ackWaiters = new Set();

  function checkOnline({ quiet = false } = {}) {
    const seen = new Set();
    for (const p of s.projectors) {
      seen.add(p.id);
      p.online = isFresh(p.last_seen_at);
      if (online.get(p.id) === p.online) continue;
      const known = online.has(p.id);
      online.set(p.id, p.online);
      if (known && !quiet) emit('projector:status', { id: p.id, tableId: p.table_id, online: p.online });
    }
    for (const id of [...online.keys()]) if (!seen.has(id)) online.delete(id);
  }
  const onlineTimer = setInterval(() => checkOnline(), ONLINE_CHECK_MS);
  onlineTimer.unref?.();

  const onlineAt = (tableId) => s.projectors.filter((p) => p.table_id === tableId && p.online);

  // Waits (up to ACK_WAIT_MS) for the table's online projectors to report
  // the scene `at`. -> {online, acked}
  function waitForAcks(tableId, at) {
    const count = () => {
      const list = onlineAt(tableId);
      return { online: list.length, acked: list.filter((p) => p.acked_at === at).length };
    };
    const first = count();
    if (!first.online || first.acked === first.online) return Promise.resolve(first);
    return new Promise((resolve) => {
      const waiter = () => {
        const c = count();
        if (c.acked < c.online) return;
        finish(c);
      };
      const finish = (c) => {
        clearTimeout(timer);
        ackWaiters.delete(waiter);
        resolve(c);
      };
      const timer = later(() => finish(count()), ACK_WAIT_MS);
      ackWaiters.add(waiter);
    });
  }

  // ── Snapshots -> live events ───────────────────────────────────
  function onChange(key, changes, { initial }) {
    if (key === 'projectors') {
      checkOnline({ quiet: initial || !liveReady });
      for (const w of [...ackWaiters]) w();
    }
    if (initial || !liveReady || !changes.length) return;
    if (key === 'areas' || key === 'tables') emit('floor:changed', {});
    else if (key === 'projectors') {
      if (changes.some((c) => !c.before || !c.after || !sameExcept(c.before, c.after, DEVICE_FIELDS))) emit('floor:changed', {});
    } else if (MENU_KEYS.includes(key)) emit('menu:changed', {});
    else if (key === 'settings') emit('settings:changed', {});
    else if (key === 'scenes') {
      for (const c of changes) emit('scene', { tableId: Number(c.id), scene: model.getScene(Number(c.id)) });
    } else if (key === 'orders') {
      const changed = changes.filter((c) => c.after).map((c) => find.order(Number(c.id))).filter(Boolean);
      for (const o of changed) {
        emit('order', dto.order(o));
        // A table showing this order shows its new version.
        for (const [tableId, scene] of s.scenes) {
          if (scene.type === 'order' && scene.orderId === o.id) emit('scene', { tableId, scene: model.getScene(tableId) });
        }
      }
      if (changed.length) emit('floor:changed', {});
    }
  }

  // ── '/live' subscribers (the staff app's fake socket) and previews ──
  const subscribers = new Map(); // fn(event, payload) -> its frame
  const previews = new Set(); // {on, target, tableId}

  function emit(event, payload, { force = false } = {}) {
    const me = user();
    if (!me && !force) return;
    if (event === 'order' && !ORDER_ROLES.includes(me?.role)) return;
    const data = event === 'scene' ? { ...payload, scene: sceneFor(payload.scene, me?.role) } : payload;
    for (const [fn, target] of [...subscribers]) {
      if (!target.alive()) {
        subscribers.delete(fn);
        continue;
      }
      try {
        fn(event, target.clone(data));
      } catch (err) {
        console.error(err);
      }
    }
    previewEvent(event, data);
  }

  // The app re-checks the session (and logs out if it is gone).
  const kick = () => emit('live:kicked', { reason: 'session' }, { force: true });

  const deliver = (sub, method, ...args) => {
    if (!sub.target.alive()) {
      previews.delete(sub);
      return;
    }
    try {
      sub.on[method](...args.map((a) => sub.target.clone(a)));
    } catch (err) {
      console.error(err);
    }
  };

  // Coalesces bursts of changes into one bootstrap per preview.
  function refetchLater(sub) {
    if (sub.timer) return;
    sub.timer = setTimeout(async () => {
      sub.timer = null;
      await whenReady();
      if (!previews.has(sub)) return;
      const me = user();
      if (!me) deliver(sub, 'fatal', 'login');
      else if (!find.table(sub.tableId)) deliver(sub, 'fatal', 'missing');
      else {
        const boot = model.previewBootstrap(sub.tableId);
        deliver(sub, 'bootstrap', { ...boot, scene: sceneFor(boot.scene, me.role) });
      }
    }, 120);
  }

  function previewEvent(event, payload) {
    for (const sub of [...previews]) {
      if (event === 'scene' && payload.tableId === sub.tableId) deliver(sub, 'scene', payload.scene);
      else if (event === 'order') deliver(sub, 'order', payload);
      else if (['menu:changed', 'settings:changed', 'floor:changed', 'live:kicked'].includes(event)) refetchLater(sub);
    }
  }

  // ── Connection ─────────────────────────────────────────────────
  let connected = true;
  const connectionListeners = new Set();
  const offConnection = watchConnection(db, (value) => {
    const back = value && !connected;
    connected = value;
    for (const fn of [...connectionListeners]) fn(value);
    for (const sub of [...previews]) deliver(sub, 'online', value);
    if (back && liveReady) emit('live:connected', {}); // catch up on what was missed
  });

  // ── The demo's routes on the replica ───────────────────────────
  const projection = {
    storedScene: model.storedScene,
    getScene: model.getScene,
    previewBootstrap: model.previewBootstrap,
    validateScene: model.validateScene,
    isOnline: (id) => Boolean(s.projectors.find((p) => p.id === id)?.online),

    // Writes the scene; the projectors pick it up from Firestore and ack it.
    setScene(tableId, input, by) {
      const scene = { ...model.validateScene(tableId, input), at: nowIso(), by: by?.name ?? null };
      s.scenes.set(tableId, scene);
      return { scene: model.resolve(scene), delivered: { online: onlineAt(tableId).length, acked: 0 } };
    },
    dropScenesWhere(predicate) {
      for (const [tableId, scene] of [...s.scenes]) if (predicate(scene)) projection.setScene(tableId, DEFAULT_SCENE, null);
    },
    pushProjector: (id) => (projection.isOnline(id) ? 1 : 0),
    testPattern(id, on) {
      const p = s.projectors.find((x) => x.id === id);
      if (p) p.test_pattern = Boolean(on);
      return p?.online ? 1 : 0;
    },
    testPatternOn: (id) => Boolean(s.projectors.find((p) => p.id === id)?.test_pattern),
    // Players follow Firestore themselves: nothing to push from here.
    refresh() {},
    orderChanged() {},
    rebootstrap() {},
    menuChanged() {},
    settingsChanged() {},
    setOnline() {},
  };

  const silent = () => {};
  const ctx = {
    state: s,
    now,
    nowIso,
    user,
    setSessionUser: silent,
    log: (who, action, details = null) => {
      s.activity.push({ id: s.nextId('activity'), user_id: who?.id ?? null, action, details, created_at: nowIso() });
    },
    live: { staff: silent, roles: silent, floorChanged: silent },
    projection,
    probe,
    schedule: setTimeout,
    dto,
    find,
    created: (data) => ({ __status: 201, data }),
    focus: silent,
    // Order item ids are unique within their order (no global counter).
    nextItemId(o) {
      o.item_seq = Math.max(o.item_seq ?? 0, ...o.items.map((i) => i.id)) + 1;
      return o.item_seq;
    },
  };

  const router = createRouter();
  authRoutes(router.route, ctx);
  floorRoutes(router.route, ctx);
  menuRoutes(router.route, ctx);
  orderRoutes(router.route, ctx);

  // Cloud versions of the routes that need Auth, Storage, queries or acks.
  let setupDone = false;
  const cloud = {
    s,
    ctx,
    model,
    services,
    ids,
    user,
    now,
    nowIso,
    whenReady,
    waitForAcks,
    endSession,
    async establish() {
      const result = await establish();
      if (result) await whenReady();
      return result;
    },
    mutate: (fn) => {
      if (!replica) throw new HttpError(401, 'يجب تسجيل الدخول أولاً');
      return replica.mutate(fn);
    },
    // The original (demo) handler of a route, to run inside a cloud one.
    demo: (method, pattern) => {
      const r = router.match(method, pattern.replace(/:\w+/g, '0')).route;
      return r.handler;
    },
    // First run: the owner account does not exist yet.
    async needsSetup() {
      if (setupDone) return false;
      try {
        setupDone = (await getDoc(doc(db, 'meta', 'setup'))).exists();
      } catch (err) {
        throw httpErrorOf(err);
      }
      return !setupDone;
    },
    setupFinished() {
      setupDone = true;
    },
    pendingProjectors: () => (replica ? replica.rawAll('projectors').filter((x) => x.data.pending === true) : []),
  };
  const cloudRoute = (method, pattern, roles, handler) => router.route(method, pattern, roles, handler, { cloud: true });
  accountRoutes(cloudRoute, cloud);
  projectorRoutes(cloudRoute, cloud);
  contentRoutes(cloudRoute, cloud);
  orderHistoryRoutes(cloudRoute, cloud);

  // One API call: {method, url ('/api/...?...'), body, file, fields} -> {status, data}.
  async function request({ method = 'GET', url, body = null, file = null, fields = {} }) {
    const verb = method.toUpperCase();
    const { path, query: q } = parseUrl(url);
    try {
      const { route: r, params } = router.match(verb, path);
      if (r.roles) await whenReady();
      const me = user();
      authorize(r, me);
      const args = { params, query: q, body: body && typeof body === 'object' ? body : {}, user: me, file, fields: fields ?? {} };
      const out = verb === 'GET' || r.cloud ? await r.handler(args) : await cloud.mutate(() => r.handler(args));
      return reply(out);
    } catch (err) {
      return errorReply(httpErrorOf(err));
    }
  }

  // A signed-in user from an earlier visit (Auth keeps the session).
  const started = auth.authStateReady().then(() => establish());

  return {
    started,
    request,
    currentUser: () => publicUser(user()) ?? null,

    subscribeLive(fn) {
      subscribers.set(fn, frameTarget(fn));
      if (liveReady) {
        setTimeout(() => {
          if (subscribers.has(fn) && user()) fn('live:connected', {});
        }, 0);
      }
      return () => subscribers.delete(fn);
    },

    openPreview(tableId, on) {
      const sub = { on, target: frameTarget(on.bootstrap), tableId: Number(tableId), timer: null };
      setTimeout(() => {
        previews.add(sub);
        deliver(sub, 'online', connected);
        refetchLater(sub);
      }, 0);
      return {
        reportStatus() {},
        async fetchOrder(orderId) {
          await whenReady();
          const o = find.order(Number(orderId));
          return o && o.table_id === sub.tableId && ORDER_ROLES.includes(user()?.role) ? sub.target.clone(dto.order(o)) : null;
        },
      };
    },

    // A staff host is not a projector.
    openDevice(_key, on) {
      setTimeout(() => on.fatal('unauthorized'), 0);
      return { reportStatus() {}, fetchOrder: async () => null };
    },

    onConnection(fn) {
      connectionListeners.add(fn);
      setTimeout(() => connectionListeners.has(fn) && fn(connected), 0);
      return () => connectionListeners.delete(fn);
    },

    // Tests / page unload: stop listeners and timers.
    close() {
      clearInterval(onlineTimer);
      offConnection();
      stopSession();
      subscribers.clear();
      previews.clear();
    },

    routes: router.list,
  };
}
