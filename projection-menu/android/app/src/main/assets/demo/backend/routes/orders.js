// Demo backend: orders and their effect on table status, sales reports
// computed from the demo's orders, and the activity log (mirrors
// src/routes/orders.js, src/services/orders.js and src/routes/reports.js).

import { ACTIVE_STATUSES, floorTeam, ownerOnly } from '../roles.js';
import { HttpError, badRequest, conflict, has, idParam, int, notFound, str } from '../validate.js';

const ORDER_STATUSES = ['open', 'preparing', 'served', 'paid', 'cancelled'];
const STATUS_LABELS = { open: 'جديد', preparing: 'قيد التحضير', served: 'تم التقديم', paid: 'مدفوع', cancelled: 'ملغى' };
const NEXT = { open: ['preparing', 'served', 'cancelled'], preparing: ['served', 'cancelled'], served: ['paid'], paid: [], cancelled: [] };
const EDITABLE = ['open', 'preparing'];
const DAY_MS = 24 * 3600 * 1000;

const ACTIVITY_LABELS = {
  'auth.setup': 'إعداد النظام وإنشاء حساب المالك',
  'auth.login': 'تسجيل دخول',
  'auth.password': 'تغيير كلمة المرور',
  'user.create': 'إضافة مستخدم',
  'user.update': 'تعديل مستخدم',
  'user.deactivate': 'تعطيل مستخدم',
  'area.create': 'إضافة قسم',
  'area.update': 'تعديل قسم',
  'area.delete': 'حذف قسم',
  'table.create': 'إضافة طاولة',
  'table.update': 'تعديل طاولة',
  'table.delete': 'حذف طاولة',
  'projector.create': 'إضافة جهاز عرض',
  'projector.update': 'تعديل جهاز عرض',
  'projector.delete': 'حذف جهاز عرض',
  'projector.rotate-key': 'تغيير مفتاح جهاز عرض',
  'projector.power': 'تشغيل/إطفاء جهاز عرض',
  'projector.pairing-code': 'إنشاء رمز ربط جهاز عرض',
  'projector.claim': 'ربط جهاز عرض برمز',
  'category.create': 'إضافة تصنيف',
  'category.delete': 'حذف تصنيف',
  'dish.create': 'إضافة طبق',
  'dish.delete': 'حذف طبق',
  'dish.price': 'تعديل سعر',
  'media.upload': 'رفع ملف',
  'media.delete': 'حذف ملف',
  'settings.general': 'تعديل الإعدادات العامة',
  'settings.theme': 'تعديل تصميم العرض',
  'order.status': 'تغيير حالة طلب',
  'order.item-remove': 'حذف صنف من طلب',
};
const STATUS_AR = { open: 'جديد', preparing: 'قيد التحضير', served: 'تم التقديم', paid: 'مدفوع', cancelled: 'ملغى' };
const PRESET_AR = { noir: 'نوار', marble: 'رخام', garden: 'حديقة', royal: 'ملكي' };

function summarize(code, d) {
  if (!d) return ACTIVITY_LABELS[code] ?? code;
  switch (code) {
    case 'dish.price':
      return `سعر "${d.name}" من ${d.from} إلى ${d.to}`;
    case 'order.status':
      return `الطلب #${d.orderId} (طاولة ${d.tableNumber ?? '؟'}): ${STATUS_AR[d.from] ?? d.from} ← ${STATUS_AR[d.to] ?? d.to}`;
    case 'order.item-remove':
      return `حذف "${d.dish}" ×${d.quantity} من الطلب #${d.orderId}`;
    case 'projector.power':
      return `${d.on ? 'تشغيل' : 'إطفاء'} "${d.name}"`;
    case 'projector.claim':
    case 'projector.pairing-code':
      return `طاولة ${d.tableNumber}${d.name ? ` — ${d.name}` : ''}`;
    case 'settings.theme':
      return `${ACTIVITY_LABELS[code]}: نمط ${PRESET_AR[d.name] ?? d.name}`;
    default: {
      const name = d.name ?? d.title ?? d.username ?? (d.number != null ? `طاولة ${d.number}` : null);
      return name ? `${ACTIVITY_LABELS[code] ?? code}: ${name}` : (ACTIVITY_LABELS[code] ?? code);
    }
  }
}

// YYYY-MM-DD in this device's time zone (the server uses its own).
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const round2 = (n) => Math.round(Number(n ?? 0) * 100) / 100;

export function dateParam(value, label) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw badRequest(`تاريخ "${label}" يجب أن يكون بصيغة YYYY-MM-DD`);
  }
  return value;
}

export function orderRoutes(route, ctx) {
  const { state: s, log, live, projection, nowIso, now, dto, find } = ctx;

  const loadOrder = (id) => {
    const o = find.order(idParam(id, 'الطلب'));
    if (!o) throw notFound('الطلب غير موجود');
    return o;
  };
  const assertEditable = (o) => {
    if (!EDITABLE.includes(o.status)) throw conflict(`لا يمكن تعديل أصناف طلب حالته "${STATUS_LABELS[o.status]}"`);
  };
  const itemInput = (raw) => {
    const dishId = int(raw?.dish_id, 'الطبق', { required: true, min: 1 });
    const quantity = int(raw?.quantity ?? 1, 'الكمية', { required: true, min: 1, max: 99 });
    const notes = str(raw?.notes, 'ملاحظات الصنف', { max: 200 });
    const dish = s.dishes.find((d) => d.id === dishId);
    if (!dish) throw badRequest('الطبق المطلوب غير موجود');
    if (!dish.is_available) throw badRequest(`"${dish.name_ar}" غير متوفر حالياً`);
    return { dish, quantity, notes };
  };
  // Same dish + same notes + same price -> one line with a bigger quantity.
  const addLine = (o, { dish, quantity, notes }) => {
    const same = o.items.find((i) => i.dish_id === dish.id && i.unit_price === dish.price && (i.notes ?? null) === (notes ?? null));
    if (same) {
      if (same.quantity + quantity > 999) throw badRequest('الكمية كبيرة جداً');
      same.quantity += quantity;
    } else {
      // Item ids: global in the demo (like the server); the cloud host
      // numbers them within their order (ctx.nextItemId).
      const id = ctx.nextItemId ? ctx.nextItemId(o) : s.nextId('item');
      o.items.push({ id, dish_id: dish.id, dish_name: dish.name_ar, quantity, unit_price: dish.price, notes });
    }
  };
  const touch = (o) => {
    o.total = o.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    o.updated_at = nowIso();
  };

  // Staff apps, floor tiles and a table showing this order all update live.
  const broadcast = (o, { floorChanged = true } = {}) => {
    const order = dto.order(o);
    live.roles(['owner', 'waiter'], 'order', order);
    if (floorChanged) live.floorChanged();
    projection.orderChanged(order);
    return order;
  };

  route('GET', '/orders', floorTeam, ({ query }) => {
    const status = typeof query.status === 'string' ? query.status : 'active';
    const tableId = int(query.table_id, 'الطاولة', { min: 1 });
    const limit = int(query.limit, 'العدد', { min: 1, max: 1000 }) ?? 200;
    if (!['active', 'all', ...ORDER_STATUSES].includes(status)) throw badRequest('حالة غير صالحة');
    return [...s.orders]
      .filter((o) => (status === 'active' ? ACTIVE_STATUSES.includes(o.status) : status === 'all' || o.status === status))
      .filter((o) => !tableId || o.table_id === tableId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map(dto.order);
  });

  route('GET', '/orders/:id', floorTeam, ({ params }) => dto.order(loadOrder(params.id)));

  route('POST', '/orders', floorTeam, ({ body, user }) => {
    const tableId = int(body.table_id, 'الطاولة', { required: true, min: 1 });
    const table = find.table(tableId);
    if (!table) throw notFound('الطاولة غير موجودة');
    const items = body.items;
    if (!Array.isArray(items) || items.length === 0) throw badRequest('أضف صنفاً واحداً على الأقل إلى الطلب');
    if (items.length > 100) throw badRequest('عدد الأصناف كبير جداً');
    const lines = items.map(itemInput);
    const o = {
      id: s.nextId('order'),
      table_id: table.id,
      table_number: table.number,
      waiter_id: user.id,
      status: 'open',
      notes: str(body.notes, 'ملاحظات الطلب', { max: 500 }),
      total: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
      items: [],
    };
    for (const line of lines) addLine(o, line);
    touch(o);
    s.orders.push(o);
    if (table.status !== 'occupied') table.status = 'occupied';
    return ctx.created(broadcast(o));
  });

  route('POST', '/orders/:id/items', floorTeam, ({ params, body }) => {
    const o = loadOrder(params.id);
    assertEditable(o);
    addLine(o, itemInput(body));
    touch(o);
    return ctx.created(broadcast(o));
  });

  route('PATCH', '/orders/:id/items/:itemId', floorTeam, ({ params, body }) => {
    if (!has(body, 'quantity') && !has(body, 'notes')) throw badRequest('لا يوجد ما يُعدَّل');
    const o = loadOrder(params.id);
    assertEditable(o);
    const item = o.items.find((i) => i.id === idParam(params.itemId, 'الصنف'));
    if (!item) throw notFound('الصنف غير موجود في هذا الطلب');
    if (body.quantity !== undefined) item.quantity = int(body.quantity, 'الكمية', { required: true, min: 1, max: 999 });
    if (body.notes !== undefined) item.notes = str(body.notes, 'ملاحظات الصنف', { max: 200 });
    touch(o);
    return broadcast(o);
  });

  route('DELETE', '/orders/:id/items/:itemId', floorTeam, ({ params, user }) => {
    const o = loadOrder(params.id);
    assertEditable(o);
    const item = o.items.find((i) => i.id === idParam(params.itemId, 'الصنف'));
    if (!item) throw notFound('الصنف غير موجود في هذا الطلب');
    o.items.splice(o.items.indexOf(item), 1);
    touch(o);
    log(user, 'order.item-remove', { orderId: o.id, tableNumber: o.table_number, dish: item.dish_name, quantity: item.quantity });
    return broadcast(o);
  });

  route('PATCH', '/orders/:id', floorTeam, ({ params, body, user }) => {
    const o = loadOrder(params.id);
    if (!has(body, 'status') && !has(body, 'notes')) throw badRequest('لا يوجد ما يُعدَّل');
    if (has(body, 'notes')) {
      o.notes = str(body.notes, 'ملاحظات الطلب', { max: 500 });
      o.updated_at = nowIso();
    }
    if (has(body, 'status')) {
      const status = String(body.status);
      if (!ORDER_STATUSES.includes(status)) throw badRequest('حالة الطلب غير صالحة');
      if (status !== o.status) {
        if (!NEXT[o.status].includes(status)) {
          throw new HttpError(409, `لا يمكن نقل الطلب من "${STATUS_LABELS[o.status]}" إلى "${STATUS_LABELS[status]}"`);
        }
        const from = o.status;
        o.status = status;
        o.updated_at = nowIso();
        let tableFreed = false;
        const table = find.table(o.table_id);
        const stillActive = s.orders.some((x) => x.table_id === o.table_id && ACTIVE_STATUSES.includes(x.status));
        if (!ACTIVE_STATUSES.includes(status) && table && !stillActive && table.status === 'occupied') {
          table.status = 'free';
          tableFreed = true;
        }
        log(user, 'order.status', { orderId: o.id, tableNumber: o.table_number, from, to: status, total: o.total });
        // A paid or cancelled order stops showing on the table, whatever the table status.
        if (status === 'paid' || status === 'cancelled') projection.dropScenesWhere((sc) => sc.type === 'order' && sc.orderId === o.id);
      }
    }
    return broadcast(o);
  });

  // ── Reports (owner): served and paid orders count as revenue ──

  route('GET', '/reports/summary', ownerOnly, ({ query }) => reportSummary(s.orders, reportRange(query, now), find.user));

  route('GET', '/activity', ownerOnly, ({ query }) => {
    const limit = int(query.limit, 'العدد', { min: 1, max: 1000 }) ?? 100;
    return [...s.activity]
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map((row) => activityDto(row, find.user));
  });
}

// ── Reports and the activity log (shared with the cloud host, which feeds
// them the orders / rows of a Firestore query) ──

// The days a report covers: ?from&to (YYYY-MM-DD, this device's time zone),
// the last 7 days by default. -> {from, to, days}
export function reportRange(query, now) {
  const today = localDate(new Date(now()));
  const to = dateParam(query.to, 'إلى') ?? today;
  const from = dateParam(query.from, 'من') ?? addDays(to, -6);
  if (from > to) throw badRequest('تاريخ البداية بعد تاريخ النهاية');
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  if (days > 366) throw badRequest('أقصى مدة للتقرير سنة واحدة');
  return { from, to, days };
}

// Local midnight at the start of `from` and the end of `to`, as ISO
// instants (the bounds of a query on orders.created_at).
export function rangeBounds({ from, to }) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${addDays(to, 1)}T00:00:00`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// Served and paid orders count as revenue.
export function reportSummary(orders, { from, to, days }, findUser) {
  const inRange = orders
    .filter((o) => ['served', 'paid'].includes(o.status))
    .map((o) => ({ o, day: localDate(new Date(o.created_at)) }))
    .filter(({ day }) => day >= from && day <= to);
  const revenue = inRange.reduce((sum, { o }) => sum + o.total, 0);

  const perDay = new Map();
  for (const { o, day } of inRange) {
    const d = perDay.get(day) ?? { day, orders: 0, revenue: 0 };
    d.orders += 1;
    d.revenue += o.total;
    perDay.set(day, d);
  }
  const dishes = new Map();
  for (const { o } of inRange) {
    for (const i of o.items) {
      const key = i.dish_id ?? `n:${i.dish_name}`;
      const d = dishes.get(key) ?? { dish_id: i.dish_id, name: i.dish_name, quantity: 0, revenue: 0 };
      d.quantity += i.quantity;
      d.revenue += i.quantity * i.unit_price;
      dishes.set(key, d);
    }
  }
  const waiters = new Map();
  for (const { o } of inRange) {
    const w = waiters.get(o.waiter_id) ?? { waiter_id: o.waiter_id, name: findUser(o.waiter_id)?.name ?? 'غير معروف', orders: 0, revenue: 0 };
    w.orders += 1;
    w.revenue += o.total;
    waiters.set(o.waiter_id, w);
  }
  return {
    from,
    to,
    totals: { orders: inRange.length, revenue: round2(revenue), avgTicket: inRange.length ? round2(revenue / inRange.length) : 0 },
    byDay: Array.from({ length: days }, (_, i) => {
      const day = addDays(from, i);
      const d = perDay.get(day) ?? { day, orders: 0, revenue: 0 };
      return { ...d, revenue: round2(d.revenue) };
    }),
    topDishes: [...dishes.values()]
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 10)
      .map((d) => ({ ...d, revenue: round2(d.revenue) })),
    byWaiter: [...waiters.values()].sort((a, b) => b.revenue - a.revenue).map((w) => ({ ...w, revenue: round2(w.revenue) })),
  };
}

// One activity row as GET /activity answers it.
export function activityDto(row, findUser) {
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: findUser(row.user_id)?.name ?? 'النظام',
    action: ACTIVITY_LABELS[row.action] ?? row.action,
    code: row.action,
    details: row.details,
    summary: summarize(row.action, row.details),
    created_at: row.created_at,
  };
}
