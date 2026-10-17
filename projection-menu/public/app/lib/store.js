// Tiny app-wide store: one state object, subscriptions with selectors, and
// cached server resources (floor, menu, settings, orders...) that the live
// channel keeps fresh.

import { useEffect, useReducer, useRef } from 'preact/hooks';
import { api } from './api.js';
import { onLive } from './live.js';

const state = {
  auth: { checked: false, user: null, needsSetup: false },
};
const listeners = new Set();

export const getState = () => state;

export function setState(patch) {
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  listeners.forEach((fn) => fn());
}

// Re-renders only when the selected value changes (Object.is).
export function useStore(selector) {
  const [, force] = useReducer((n) => n + 1, 0);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const value = selector(state);
  const lastRef = useRef(value);
  lastRef.current = value;
  useEffect(() => {
    const check = () => {
      if (!Object.is(selectorRef.current(state), lastRef.current)) force();
    };
    listeners.add(check);
    check();
    return () => listeners.delete(check);
  }, []);
  return value;
}

// ── Cached resources ──────────────────────────────────────────────

const LOADERS = {
  floor: () => api.floor(),
  menu: () => api.menu(),
  settings: () => api.settings(),
  orders: () => api.orders({ status: 'active' }),
  projectors: () => api.projectors(),
  media: () => api.media(),
  users: () => api.users(),
};
const inflight = {};

export function load(key, { force = false } = {}) {
  if (!force && state[key] !== undefined) return Promise.resolve(state[key]);
  if (inflight[key] && !force) return inflight[key];
  const promise = LOADERS[key]()
    .then((value) => {
      if (inflight[key] === promise) setState({ [key]: value, [`${key}Error`]: null });
      return value;
    })
    .catch((err) => {
      if (inflight[key] === promise) setState({ [`${key}Error`]: err });
      throw err;
    })
    .finally(() => {
      if (inflight[key] === promise) delete inflight[key];
    });
  inflight[key] = promise;
  return promise;
}

// Refetch a resource only if some screen already loaded it.
const timers = {};
export function refresh(key, delay = 150) {
  if (state[key] === undefined && !inflight[key]) return;
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => load(key, { force: true }).catch(() => {}), delay);
}

export function useResource(key) {
  const data = useStore((s) => s[key]);
  const error = useStore((s) => s[`${key}Error`]);
  useEffect(() => {
    load(key).catch(() => {});
  }, [key]);
  return {
    data,
    error: data === undefined ? error : null,
    loading: data === undefined && !error,
    reload: () => load(key, { force: true }),
  };
}

// Replace a cached resource locally (after a successful mutation).
export function patchResource(key, fn) {
  if (state[key] === undefined) return;
  setState({ [key]: fn(state[key]) });
}

export function clearResources() {
  for (const key of Object.keys(LOADERS)) {
    delete inflight[key];
    delete state[key];
    delete state[`${key}Error`];
  }
  setState({});
}

// ── Helpers on cached data ────────────────────────────────────────

export const allTables = (floor) => (floor ? [...floor.areas.flatMap((a) => a.tables), ...floor.unassigned] : []);

export const allDishes = (menu) => (menu ? [...menu.categories.flatMap((c) => c.dishes), ...menu.uncategorized] : []);

function mapTables(floor, fn) {
  return {
    ...floor,
    areas: floor.areas.map((a) => ({ ...a, tables: a.tables.map(fn) })),
    unassigned: floor.unassigned.map(fn),
  };
}

export const ACTIVE_ORDER = ['open', 'preparing', 'served'];

// ── Live updates ──────────────────────────────────────────────────

const orderListeners = new Set();
// Screens that want to react to incoming orders (toasts).
export const onOrderEvent = (fn) => {
  orderListeners.add(fn);
  return () => orderListeners.delete(fn);
};

let wired = false;
export function wireLive() {
  if (wired) return;
  wired = true;

  onLive('scene', ({ tableId, scene }) => {
    patchResource('floor', (floor) => mapTables(floor, (t) => (t.id === tableId ? { ...t, scene } : t)));
  });
  onLive('floor:changed', () => {
    refresh('floor');
    refresh('projectors');
  });
  onLive('projector:status', ({ id, online }) => {
    patchResource('floor', (floor) =>
      mapTables(floor, (t) =>
        t.projectors.some((p) => p.id === id)
          ? { ...t, projectors: t.projectors.map((p) => (p.id === id ? { ...p, online } : p)) }
          : t,
      ),
    );
    patchResource('projectors', (list) => list.map((p) => (p.id === id ? { ...p, online } : p)));
  });
  onLive('order', (order) => {
    const previous = state.orders?.find((o) => o.id === order.id) ?? null;
    upsertOrder(order);
    orderListeners.forEach((fn) => fn(order, previous));
  });
  onLive('menu:changed', () => {
    refresh('menu');
    refresh('media', 400);
  });
  onLive('settings:changed', () => refresh('settings'));
  onLive('live:connected', () => {
    // Catch up on anything missed while offline.
    for (const key of ['floor', 'orders', 'menu', 'settings', 'projectors']) refresh(key, 0);
  });
}

export function upsertOrder(order) {
  patchResource('orders', (list) => {
    const others = list.filter((o) => o.id !== order.id);
    return ACTIVE_ORDER.includes(order.status) ? [order, ...others].sort((a, b) => b.id - a.id) : others;
  });
}
