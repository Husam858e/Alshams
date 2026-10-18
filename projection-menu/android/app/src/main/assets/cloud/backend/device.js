// The cloud host of a projector device: an anonymous Firebase Auth user
// bound to one projector through devices/{uid} (claimProjector). It follows
// only what that projector shows — its projector doc, its table, the
// table's scene (and the order on it), the menu and the settings — and
// feeds the player through its seam (public/player/lib/net.js openDevice).
// It writes nothing but its own heartbeat (last_seen_at, every 2 minutes)
// and scene acks (acked_at = the scene's `at`).

import { signInAnonymously } from 'firebase/auth';
import { collection, doc, getDoc, getDocFromServer, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { frameTarget } from '../../demo/backend/frames.js';
import { DEFAULT_SCENE, createModel } from '../../demo/backend/model.js';
import { NETWORK_ERROR, httpErrorOf, watchConnection, withTimeout } from './firebase.js';
import { createReplica } from './replica.js';
import { HEARTBEAT_MS, emptyState, spec } from './schema.js';

const REFETCH_MS = 250; // bursts of menu edits -> one bootstrap (like the player's refetch)
const VIEW_FIELDS = ['rotation', 'layout', 'calibration'];

export const CLAIM_ERRORS = {
  format: 'رمز الربط يتكون من 6 أرقام',
  unknown: 'رمز الربط غير صحيح أو مستخدم مسبقاً',
  expired: 'انتهت صلاحية رمز الربط. اطلب رمزاً جديداً.',
  anonymous: 'تسجيل الدخول المجهول (Anonymous) غير مفعّل في مشروع Firebase. فعّله من Authentication ثم أعد المحاولة.',
};

// The device's anonymous user (kept by Auth across restarts).
async function deviceUser(auth, { create }) {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  if (!create) return null;
  try {
    return (await signInAnonymously(auth)).user;
  } catch (err) {
    if (err?.code === 'auth/operation-not-allowed' || err?.code === 'auth/admin-restricted-operation') throw new Error(CLAIM_ERRORS.anonymous);
    if (err?.code === 'auth/network-request-failed') throw new Error(NETWORK_ERROR);
    throw new Error(httpErrorOf(err).message);
  }
}

// Binds this device to the projector of a pairing code (one batch, checked
// by the security rules). -> {projector:{id,name}, table:{id,number}|null, restaurantName}
export async function claim(services, rawCode) {
  const { auth, db } = services;
  const code = String(rawCode ?? '').replace(/\D/g, '');
  if (code.length !== 6) throw new Error(CLAIM_ERRORS.format);
  const me = await deviceUser(auth, { create: true });
  const fail = (err) => {
    if (err?.code === 'permission-denied') return new Error(CLAIM_ERRORS.unknown);
    return new Error(httpErrorOf(err).message);
  };
  let pairing;
  try {
    pairing = await withTimeout(getDoc(doc(db, 'pairing', code)), 15000);
  } catch (err) {
    throw fail(err);
  }
  if (!pairing.exists()) throw new Error(CLAIM_ERRORS.unknown);
  const { projectorId, tableId, expiresAt } = pairing.data();
  if (expiresAt.toMillis() <= Date.now()) throw new Error(CLAIM_ERRORS.expired);

  const batch = writeBatch(db);
  batch.set(doc(db, 'devices', me.uid), { projectorId, code, at: serverTimestamp() });
  batch.update(doc(db, 'projectors', String(projectorId)), { pending: false, device_uid: me.uid, last_seen_at: serverTimestamp() });
  batch.delete(doc(db, 'pairing', code));
  try {
    await withTimeout(batch.commit(), 15000);
  } catch (err) {
    throw fail(err);
  }
  const [p, t, g] = await Promise.all([
    getDoc(doc(db, 'projectors', String(projectorId))),
    tableId ? getDoc(doc(db, 'tables', String(tableId))) : null,
    getDoc(doc(db, 'settings', 'general')),
  ]).catch(() => []);
  return {
    projector: { id: projectorId, name: p?.data()?.name ?? null },
    table: t?.exists() ? { id: tableId, number: t.data().number } : null,
    restaurantName: g?.data()?.restaurantName ?? null,
  };
}

export function createDeviceHost(services, { now = () => Date.now() } = {}) {
  const { auth, db } = services;
  let current = null; // the open player connection (one per page)

  let connected = true;
  const connectionListeners = new Set();
  const offConnection = watchConnection(db, (value) => {
    const back = value && !connected;
    connected = value;
    for (const fn of [...connectionListeners]) fn(value);
    current?.online(value, back);
  });

  // One player (the projector page). -> {reportStatus, fetchOrder}
  function openDevice(_deviceKey, on) {
    current?.close();
    const conn = connect(on);
    current = conn;
    return { reportStatus() {}, fetchOrder: conn.fetchOrder };
  }

  function connect(on) {
    const target = frameTarget(on.bootstrap);
    const s = emptyState();
    const model = createModel(s);
    const replica = createReplica({ db, s, decorate: (key, row) => (key === 'projectors' ? { ...row, online: true } : row), onChange });
    // A refused listener usually means this device was unpaired (it then
    // reads nothing); the server says for sure.
    const onError = (err) => {
      if (err?.code === 'permission-denied') confirmUnbound();
      else console.error('cloud: device listener failed', err);
    };
    let closed = false;
    let uid = null;
    let projectorId = null;
    let tableId = null;
    let orderId = null;
    let ready = false;
    let fatal = false;
    let lastAck = null;
    let heartbeat = null;
    let refetchTimer = null;
    let offDevice = null;

    const deliver = (method, ...args) => {
      if (closed || fatal) return;
      if (!target.alive()) return close();
      try {
        on[method](...args.map((a) => target.clone(a)));
      } catch (err) {
        console.error(err);
      }
    };
    const projector = () => s.projectors.find((p) => p.id === projectorId) ?? null;
    const sceneNow = () => (tableId ? model.getScene(tableId) : { ...DEFAULT_SCENE });

    function stopAll() {
      clearInterval(heartbeat);
      clearTimeout(refetchTimer);
      heartbeat = null;
      offDevice?.();
      offDevice = null;
      replica.stop();
    }
    function close() {
      closed = true;
      stopAll();
      if (current === api) current = null;
    }
    function unauthorized() {
      if (fatal || closed) return;
      deliver('fatal', 'unauthorized');
      fatal = true;
      stopAll();
    }

    function bootstrap() {
      const p = projector();
      if (!p) return;
      deliver('bootstrap', model.bootstrapFor(p));
    }
    function refetchLater() {
      if (!ready || refetchTimer) return;
      refetchTimer = setTimeout(() => {
        refetchTimer = null;
        bootstrap();
      }, REFETCH_MS);
    }

    // last_seen_at (+ the scene ack): at start, every 2 minutes, after a reconnect.
    function beat(fields = {}) {
      if (!projectorId || fatal || closed) return;
      updateDoc(doc(db, 'projectors', String(projectorId)), { last_seen_at: serverTimestamp(), ...fields }).catch((err) => {
        if (err?.code === 'permission-denied') confirmUnbound(); // unpaired while no listener said so
        else console.warn('cloud: heartbeat failed', err);
      });
    }
    function ack() {
      const at = s.scenes.get(tableId)?.at ?? null;
      if (!at || at === lastAck) return;
      lastAck = at;
      beat({ acked_at: at });
    }

    // The order shown by an 'order' scene is followed while it is shown.
    async function followOrder() {
      const scene = tableId ? s.scenes.get(tableId) : null;
      const want = scene?.type === 'order' ? scene.orderId : null;
      if (want === orderId) return;
      orderId = want;
      if (!want) return replica.unlisten('order');
      // Refused when the order is not on this table (any more): no order shown.
      await replica.listen('order', 'orders', doc(db, 'orders', String(want)), { onError: () => replica.unlisten('order') });
    }

    async function setTable(next) {
      if (next === tableId && replica.loaded('scene')) return;
      tableId = next;
      replica.unlisten('table');
      replica.unlisten('scene');
      replica.unlisten('order');
      orderId = null;
      if (!tableId) return;
      await Promise.all([
        replica.listen('table', 'tables', doc(db, 'tables', String(tableId)), { onError }),
        replica.listen('scene', 'scenes', doc(db, 'scenes', String(tableId)), { onError }),
      ]);
      await followOrder();
    }

    async function onChange(key, changes, { initial }) {
      if (closed || fatal) return;
      if (key === 'projectors') {
        const change = changes[0];
        if (change && !change.after) return confirmGone(['projectors', String(projectorId)]); // deleted
        const p = projector();
        if (!p || !ready) return;
        // Unbound by the owner ("rotate key"), or paired to another device.
        if (p.device_uid !== uid) return confirmGone(['projectors', String(projectorId)], (data) => data?.device_uid !== uid);
        if (p.table_id !== tableId) {
          await setTable(p.table_id);
          lastAck = null;
          bootstrap();
          ack();
          return;
        }
        const was = change?.before;
        if (was && VIEW_FIELDS.some((f) => JSON.stringify(was[f]) !== JSON.stringify(change.after[f]))) {
          const { rotation, layout, calibration } = model.projectorView(p);
          deliver('projector', { rotation, layout, calibration });
        }
        if (Boolean(was?.test_pattern) !== Boolean(p.test_pattern)) deliver('testPattern', Boolean(p.test_pattern));
        if (was && was.name !== p.name) refetchLater();
        return;
      }
      if (!ready || initial) return;
      if (key === 'scenes') {
        await followOrder();
        deliver('scene', sceneNow());
        ack();
      } else if (key === 'orders') {
        const o = s.orders.find((x) => x.id === orderId);
        if (o) deliver('order', model.dto.order(o));
      } else refetchLater(); // menu, settings, areas, the table
    }

    // Everything the first bootstrap needs, then the steady state.
    async function attach(nextProjectorId) {
      projectorId = nextProjectorId;
      ready = false;
      const firsts = [
        replica.listen('projector', 'projectors', doc(db, 'projectors', String(projectorId)), { onError }),
        ...[
          ['areas', 'areas'],
          ['assets', 'media'],
          ['categories', 'categories'],
          ['dishes', 'dishes'],
          ['settings', 'settings'],
        ].map(([key, path]) => (replica.loaded(path) ? null : replica.listen(path, key, collection(db, path), { onError }))),
      ];
      const [snap] = await Promise.all(firsts);
      if (closed || fatal || projectorId !== nextProjectorId) return;
      const p = projector();
      if (!p) {
        // No such projector (deleted while this device was off): unpaired.
        if (snap && !snap.metadata.fromCache) unauthorized();
        return;
      }
      await setTable(p.table_id);
      if (closed || fatal || projectorId !== nextProjectorId) return;
      ready = true;
      deliver('online', connected);
      bootstrap();
      deliver('testPattern', Boolean(p.test_pattern));
      lastAck = null;
      beat();
      ack();
      clearInterval(heartbeat);
      heartbeat = setInterval(() => connected && beat(), HEARTBEAT_MS);
      heartbeat.unref?.();
    }

    async function start() {
      let me;
      try {
        me = await deviceUser(auth, { create: false });
      } catch {
        me = null;
      }
      if (closed) return;
      if (!me) return unauthorized(); // never paired on this device
      uid = me.uid;
      // devices/{uid}: deleted by the owner ("rotate key") -> pairing screen.
      offDevice = onSnapshot(
        doc(db, 'devices', uid),
        (snap) => {
          if (closed || fatal) return;
          if (!snap.exists()) {
            // Gone: unpaired. A snapshot can say "from cache" right after
            // access was revoked, so ask the server before giving up.
            if (!snap.metadata.fromCache) unauthorized();
            else confirmUnbound();
            return;
          }
          const next = Number(snap.data().projectorId);
          if (next !== projectorId) attach(next).catch((err) => console.error('cloud: device attach failed', err));
        },
        () => unauthorized(),
      );
    }

    // Asks the server whether `path` is gone (or `lost(data)`): then this
    // device is no longer paired. A refused read means the same.
    async function confirmGone(path, lost = () => false) {
      try {
        const snap = await getDocFromServer(doc(db, ...path));
        if (!snap.exists() || lost(snap.data())) unauthorized();
      } catch (err) {
        if (err?.code === 'permission-denied') unauthorized();
        // offline: the listeners tell once the server is back
      }
    }
    const confirmUnbound = () => confirmGone(['devices', uid]);

    async function fetchOrder(id) {
      const wanted = Number(id);
      const known = s.orders.find((o) => o.id === wanted);
      if (known) return target.clone(model.dto.order(known));
      try {
        const snap = await getDoc(doc(db, 'orders', String(wanted)));
        if (!snap.exists() || snap.data().table_id !== tableId) return null;
        return target.clone(model.dto.order(spec('orders').fromDoc(snap.id, snap.data())));
      } catch {
        return null;
      }
    }

    const api = {
      fetchOrder,
      close,
      online(value, back) {
        deliver('online', value);
        if (back) beat();
      },
    };
    setTimeout(() => start().catch((err) => console.error('cloud: device start failed', err)), 0);
    return api;
  }

  return {
    openDevice,
    onConnection(fn) {
      connectionListeners.add(fn);
      setTimeout(() => connectionListeners.has(fn) && fn(connected), 0);
      return () => connectionListeners.delete(fn);
    },
    // The uid of this device's anonymous user (diagnostics), or null.
    deviceId: () => auth.currentUser?.uid ?? null,
    close() {
      offConnection();
      current?.close();
      current = null;
    },
    now,
  };
}
