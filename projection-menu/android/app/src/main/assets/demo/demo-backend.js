// In-memory stand-in for the server's /api/tablet/* endpoints, for the
// offline demo. demo/tablet.html loads it before the unchanged
// /tablet/tablet.js (module scripts run in document order), so tablet.js's
// fetch() calls are answered here. Cues for the projector frame go out over
// a BroadcastChannel; fake-socket.js delivers them to player.js and sends
// the acks back, like the server's browser driver.

import { CATEGORIES, CHANNEL, CURRENCY, FULL_ZONE, KITCHEN, PROJECTOR, TABLE, ZONES } from './demo-data.js';

const ACK_TIMEOUT_MS = 3000; // like CUE_ACK_TIMEOUT_MS on the server
const LATENCY_MS = 80; // a LAN round trip, so the UI behaves as with a server

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const badRequest = (message) => new HttpError(400, message);

const dishes = new Map(CATEGORIES.flatMap((c) => c.dishes).map((d) => [d.id, d]));
const orders = [];
let nextOrderId = 1;
let nextItemId = 1;
let nextCueId = 1;

// ── Cues (ProjectionService on the server) ────────────────────────
const channel = new BroadcastChannel(CHANNEL);
const waitingAcks = new Map(); // cueId -> resolve

channel.addEventListener('message', ({ data }) => {
  if (data?.type !== 'ack') return;
  waitingAcks.get(data.cueId)?.(data);
  waitingAcks.delete(data.cueId);
});

function send(body) {
  const cue = { cueId: `demo-${Date.now().toString(36)}-${nextCueId++}`, ...body };
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waitingAcks.delete(cue.cueId);
      resolve({ ok: false, result: 'timeout', error: 'لم يستجب جهاز العرض في الوقت المحدد' });
    }, ACK_TIMEOUT_MS);
    waitingAcks.set(cue.cueId, (ack) => {
      clearTimeout(timer);
      resolve(ack.ok ? { ok: true, result: 'acked' } : { ok: false, result: 'failed', error: ack.error ?? 'رفض جهاز العرض الأمر' });
    });
    channel.postMessage({ type: 'cue', cue });
  }).then((outcome) => ({ projectorId: PROJECTOR.id, cueId: cue.cueId, ...outcome }));
}

const summary = (results) => ({ status: results.some((r) => r.ok) ? 'sent' : 'failed', results });

// A seat maps to its zone; no seat (or an unknown one) lights the whole table.
function targetOf(seatNo) {
  const zone = seatNo == null ? null : ZONES.find((z) => z.seat === seatNo);
  return zone ? { layer: `seat-${seatNo}`, zone } : { layer: 'full', zone: FULL_ZONE };
}

async function playDish(dish, phase, seatNo) {
  const projection = dish.projections[phase];
  if (!projection) return { status: 'no_projection', results: [] };
  const { layer, zone } = targetOf(seatNo);
  const result = await send({
    action: 'play',
    layer,
    zone,
    media: projection.media,
    loop: projection.loop,
    durationMs: projection.durationMs,
    scale: projection.scale,
    fadeMs: 500,
    meta: { dishId: dish.id, dishName: dish.name_ar, phase },
  });
  return summary([result]);
}

async function stopSeat(seatNo) {
  return summary([await send({ action: 'stop', layer: targetOf(seatNo).layer })]);
}

// Several dishes for one seat would fight over its zone: the first one wins.
function projectOrder(order, phase) {
  const bySeat = new Map();
  for (const item of order.items) if (!bySeat.has(item.seat_no)) bySeat.set(item.seat_no, item);
  return Promise.all([...bySeat.values()].map((item) => playDish(dishes.get(item.dish_id), phase, item.seat_no)));
}

// ── Validation (src/lib/validate.js) ───────────────────────────────
function int(value, field, { required = false, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`الحقل "${field}" مطلوب`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`قيمة غير صالحة للحقل "${field}"`);
  return n;
}

function seatOf(value) {
  const seat = int(value, 'المقعد', { min: 1, max: 20 });
  if (seat && seat > TABLE.seats) throw badRequest('رقم المقعد أكبر من عدد مقاعد الطاولة');
  return seat;
}

function dishOf(value, message = 'الطبق غير متاح') {
  const dish = dishes.get(int(value, 'الطبق', { required: true, min: 1 }));
  if (!dish) throw badRequest(message);
  return dish;
}

// ── Orders and the simulated kitchen ───────────────────────────────
const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' '); // like datetime('now')
const copy = (value) => JSON.parse(JSON.stringify(value));

function placeOrder(body) {
  const raw = body.items;
  if (!Array.isArray(raw) || !raw.length || raw.length > 50) throw badRequest('السلة فارغة');
  const id = nextOrderId++;
  const items = raw.map((item) => {
    const dish = dishOf(item?.dish_id, 'أحد الأطباق لم يعد متاحاً، حدّث المنيو');
    const notes = typeof item.notes === 'string' ? item.notes.trim().slice(0, 300) : '';
    return {
      id: nextItemId++,
      order_id: id,
      dish_id: dish.id,
      seat_no: seatOf(item.seat_no),
      quantity: int(item.quantity, 'الكمية', { min: 1, max: 50 }) ?? 1,
      unit_price: dish.price,
      notes: notes || null,
      dish_name: dish.name_ar,
    };
  });
  const now = sqlNow();
  const order = {
    id,
    table_id: TABLE.id,
    status: 'placed',
    total: items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0),
    created_at: now,
    updated_at: now,
    table_code: TABLE.code,
    table_name: TABLE.name,
    items,
  };
  orders.push(order);
  // Fire-and-forget, like the server: the order stands even if a cue fails.
  projectOrder(order, 'ordered');
  setTimeout(() => setStatus(order, 'preparing'), KITCHEN.preparingAfterMs);
  setTimeout(() => {
    setStatus(order, 'served');
    projectOrder(order, 'served');
  }, KITCHEN.servedAfterMs);
  return copy(order);
}

function setStatus(order, status) {
  order.status = status;
  order.updated_at = sqlNow();
}

// ── Routes ─────────────────────────────────────────────────────────
const ROUTES = {
  'GET /menu': () => ({
    table: { code: TABLE.code, name: TABLE.name, seats: TABLE.seats },
    currency: CURRENCY,
    categories: CATEGORIES.map((c) => ({
      ...c,
      dishes: c.dishes.map(({ projections, ...dish }) => ({ ...dish, has_preview: Boolean(projections.preview) })),
    })),
  }),
  'POST /preview': (body) => playDish(dishOf(body.dish_id), 'preview', seatOf(body.seat_no)),
  'POST /preview/stop': (body) => stopSeat(seatOf(body.seat_no)),
  'POST /orders': (body) => placeOrder(body),
  'GET /orders': () =>
    copy(
      orders
        .filter((o) => ['placed', 'preparing', 'served'].includes(o.status))
        .sort((a, b) => b.id - a.id),
    ),
};
const CREATED = new Set(['POST /orders']); // answered with 201

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function handle(url, method, headers, rawBody) {
  // Same pairing check as requireTable() on the server.
  if (headers.get('x-table-code') !== TABLE.code || headers.get('x-table-key') !== TABLE.key) {
    throw new HttpError(401, 'هذا الجهاز غير مرتبط بطاولة. اطلب من الإدارة رابط الربط.');
  }
  const key = `${method} ${url.pathname.slice('/api/tablet'.length)}`;
  const route = ROUTES[key];
  if (!route) throw new HttpError(404, 'المسار غير موجود');
  let body = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw badRequest('JSON غير صالح');
    }
  }
  return json(CREATED.has(key) ? 201 : 200, await route(body ?? {}));
}

const realFetch = window.fetch.bind(window);

window.fetch = async (input, init = {}) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input), location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/tablet/')) return realFetch(input, init);

  const method = (init.method ?? request?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? request?.headers);
  const rawBody = typeof init.body === 'string' ? init.body : request ? await request.text() : '';
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  try {
    return await handle(url, method, headers, rawBody);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    console.error(err);
    return json(500, { error: 'خطأ داخلي في الخادم' });
  }
};
