// Demo backend: sections, tables, projectors (pairing, calibration, power)
// and the scene each table shows (mirrors src/routes/floor.js,
// projectors.js, scenes.js and player.js).

import { anyStaff, contentTeam, floorTeam, ownerOnly } from '../roles.js';
import { DEFAULT_CALIBRATION } from '../seed.js';
import { HttpError, badRequest, bool, conflict, has, idParam, int, notFound, oneOf, str } from '../validate.js';

const TABLE_STATUSES = ['free', 'occupied', 'reserved'];
const PAIRING_TTL_MS = 10 * 60 * 1000;
// In the demo a make-believe device types the code in after a few seconds.
const DEMO_CLAIM_AFTER_MS = 7000;

export function floorRoutes(route, ctx) {
  const { state: s, log, live, projection, nowIso, now, schedule, dto, find } = ctx;

  const loadArea = (id) => {
    const area = find.area(idParam(id, 'القسم'));
    if (!area) throw notFound('القسم غير موجود');
    return area;
  };
  const loadTable = (id) => {
    const table = find.table(idParam(id, 'الطاولة'));
    if (!table) throw notFound('الطاولة غير موجودة');
    return table;
  };
  const areaRef = (value) => {
    const id = int(value, 'القسم', { min: 1 });
    if (id && !find.area(id)) throw badRequest('القسم المختار غير موجود');
    return id;
  };
  const tableNumber = (value, exceptId = null) => {
    const number = int(value, 'رقم الطاولة', { required: true, min: 1, max: 9999 });
    const taken = s.tables.find((t) => t.number === number);
    if (taken && taken.id !== exceptId) throw conflict(`رقم الطاولة ${number} مستخدم مسبقاً`);
    return number;
  };
  const nextOrder = (list) => list.reduce((m, x) => Math.max(m, x.sort_order), -1) + 1;

  route('GET', '/floor', anyStaff, () => dto.floor());
  route('GET', '/tables', anyStaff, () => {
    const f = dto.floor();
    return [...f.areas.flatMap((a) => a.tables), ...f.unassigned];
  });
  route('GET', '/tables/:id', anyStaff, ({ params }) => dto.table(loadTable(params.id)));
  route('GET', '/areas', anyStaff, () => [...s.areas].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id));

  // ── Areas (owner) ──

  route('POST', '/areas', ownerOnly, ({ body, user }) => {
    const name = str(body.name, 'اسم القسم', { required: true, max: 60 });
    const area = { id: s.nextId('area'), name, sort_order: int(body.sort_order, 'الترتيب') ?? nextOrder(s.areas) };
    s.areas.push(area);
    log(user, 'area.create', { name });
    live.floorChanged();
    return ctx.created({ ...area });
  });

  route('PATCH', '/areas/:id', ownerOnly, ({ params, body, user }) => {
    const area = loadArea(params.id);
    const name = has(body, 'name') ? str(body.name, 'اسم القسم', { required: true, max: 60 }) : area.name;
    const sortOrder = has(body, 'sort_order') ? int(body.sort_order, 'الترتيب', { required: true }) : area.sort_order;
    if (name !== area.name) log(user, 'area.update', { name, from: area.name });
    Object.assign(area, { name, sort_order: sortOrder });
    live.floorChanged();
    return { ...area };
  });

  route('DELETE', '/areas/:id', ownerOnly, ({ params, user }) => {
    const area = loadArea(params.id);
    s.areas.splice(s.areas.indexOf(area), 1);
    for (const t of s.tables) if (t.area_id === area.id) t.area_id = null;
    log(user, 'area.delete', { name: area.name });
    live.floorChanged();
    return { ok: true };
  });

  // ── Tables ──

  route('POST', '/tables', ownerOnly, ({ body: b, user }) => {
    const table = {
      id: s.nextId('table'),
      number: tableNumber(b.number),
      area_id: areaRef(b.area_id),
      seats: int(b.seats, 'عدد المقاعد', { min: 1, max: 50 }) ?? 4,
      status: 'free',
      sort_order: int(b.sort_order, 'الترتيب') ?? nextOrder(s.tables),
    };
    s.tables.push(table);
    log(user, 'table.create', { number: table.number });
    live.floorChanged();
    return ctx.created(dto.table(table));
  });

  route('PATCH', '/tables/:id', ownerOnly, ({ params, body: b, user }) => {
    const table = loadTable(params.id);
    const next = {
      number: has(b, 'number') ? tableNumber(b.number, table.id) : table.number,
      area_id: has(b, 'area_id') ? areaRef(b.area_id) : table.area_id,
      seats: has(b, 'seats') ? int(b.seats, 'عدد المقاعد', { required: true, min: 1, max: 50 }) : table.seats,
      status: has(b, 'status') ? oneOf(b.status, 'الحالة', TABLE_STATUSES, { required: true }) : table.status,
      sort_order: has(b, 'sort_order') ? int(b.sort_order, 'الترتيب', { required: true }) : table.sort_order,
    };
    if (next.number !== table.number || next.area_id !== table.area_id || next.seats !== table.seats) {
      log(user, 'table.update', { number: next.number, from: table.number });
    }
    Object.assign(table, next);
    live.floorChanged();
    projection.rebootstrap(); // the number or seats may be on the projected table
    return dto.table(table);
  });

  route('DELETE', '/tables/:id', ownerOnly, ({ params, user }) => {
    const table = loadTable(params.id);
    s.tables.splice(s.tables.indexOf(table), 1);
    s.projectors = s.projectors.filter((p) => p.table_id !== table.id);
    s.scenes.delete(table.id);
    for (const [code, row] of s.pairing) if (row.table_id === table.id) s.pairing.delete(code);
    log(user, 'table.delete', { number: table.number });
    live.floorChanged();
    const first = [...s.tables].sort((a, b) => a.sort_order - b.sort_order || a.number - b.number)[0];
    if (first) ctx.focus?.(first.id);
    projection.rebootstrap();
    return { ok: true };
  });

  route('PATCH', '/tables/:id/status', floorTeam, ({ params, body }) => {
    const table = loadTable(params.id);
    table.status = oneOf(body.status, 'الحالة', TABLE_STATUSES, { required: true });
    live.floorChanged();
    return dto.table(table);
  });

  // ── Projectors ──

  const playerUrl = (key) => `/player/?device=${encodeURIComponent(key)}`;
  const projectorDto = (p) => ({
    id: p.id,
    name: p.name,
    table_id: p.table_id,
    table_number: find.table(p.table_id)?.number ?? null,
    online: p.online,
    rotation: p.rotation,
    layout: p.layout,
    calibration: structuredClone(p.calibration),
    pjlink_host: p.pjlink_host,
    pjlink_port: p.pjlink_port,
    pjlink_has_password: Boolean(p.pjlink_password),
    last_seen_at: p.last_seen_at,
    created_at: p.created_at,
    player_url: playerUrl(p.device_key),
  });
  const loadProjector = (id) => {
    const p = s.projectors.find((x) => x.id === idParam(id, 'جهاز العرض'));
    if (!p) throw notFound('جهاز العرض غير موجود');
    return p;
  };
  const tableRef = (value, { required = false } = {}) => {
    const id = int(value, 'الطاولة', { required, min: 1 });
    if (id && !find.table(id)) throw badRequest('الطاولة المختارة غير موجودة');
    return id;
  };
  const defaultName = (tableId) => {
    const t = tableId ? find.table(tableId) : null;
    return t ? `جهاز عرض طاولة ${t.number}` : 'جهاز عرض';
  };
  const newKey = () => `demo-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  const addProjector = (tableId, name, online) => {
    const p = {
      id: s.nextId('projector'),
      table_id: tableId,
      name,
      device_key: newKey(),
      calibration: DEFAULT_CALIBRATION(),
      rotation: 0,
      layout: 'single',
      pjlink_host: null,
      pjlink_port: 4352,
      pjlink_password: null,
      power: 'on',
      online,
      last_seen_at: online ? nowIso() : null,
      created_at: nowIso(),
    };
    s.projectors.push(p);
    return p;
  };

  // The demo's pretend device "types" the code a few seconds after it is shown.
  const claim = (code) => {
    const row = s.pairing.get(code);
    if (!row || Date.parse(row.expires_at) <= now()) return;
    s.pairing.delete(code);
    const table = find.table(row.table_id);
    if (!table) return;
    const p = addProjector(table.id, row.projector_name || defaultName(table.id), true);
    log(null, 'projector.claim', { tableNumber: table.number, name: p.name });
    live.staff('projector:status', { id: p.id, tableId: table.id, online: true });
    live.floorChanged();
    projection.rebootstrap();
    ctx.focus(table.id); // the demo's table pane shows the new projector at work
  };

  route('POST', '/projectors/pairing-codes', ownerOnly, ({ body, user }) => {
    const tableId = tableRef(body.table_id, { required: true });
    const name = str(body.name, 'اسم الجهاز', { max: 60 });
    for (const [c, row] of s.pairing) if (Date.parse(row.expires_at) <= now()) s.pairing.delete(c);
    let code;
    do code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    while (s.pairing.has(code));
    const expiresAt = new Date(now() + PAIRING_TTL_MS).toISOString();
    s.pairing.set(code, { table_id: tableId, projector_name: name, created_by: user.id, expires_at: expiresAt });
    log(user, 'projector.pairing-code', { tableNumber: find.table(tableId).number, name });
    schedule(() => claim(code), DEMO_CLAIM_AFTER_MS);
    return ctx.created({ code, expiresAt });
  });

  route('POST', '/projectors/claim', null, ({ body }) => {
    const code = String(body.code ?? '').replace(/\D/g, '');
    if (code.length !== 6) throw badRequest('رمز الربط يتكون من 6 أرقام');
    const row = s.pairing.get(code);
    if (!row) throw notFound('رمز الربط غير صحيح أو مستخدم مسبقاً');
    const count = s.projectors.length;
    claim(code);
    const p = s.projectors.length > count ? s.projectors[s.projectors.length - 1] : null;
    if (!p) throw new HttpError(410, 'انتهت صلاحية رمز الربط. اطلب رمزاً جديداً.');
    const table = find.table(p.table_id);
    return ctx.created({ playerUrl: playerUrl(p.device_key), table: { id: table.id, number: table.number }, projector: { id: p.id, name: p.name } });
  });

  route('GET', '/projectors', contentTeam, () =>
    [...s.projectors]
      .sort((a, b) => (find.table(a.table_id)?.number ?? Infinity) - (find.table(b.table_id)?.number ?? Infinity) || a.id - b.id)
      .map(projectorDto),
  );
  route('GET', '/projectors/:id', contentTeam, ({ params }) => projectorDto(loadProjector(params.id)));

  // Added by hand there is no device behind it yet: it stays offline.
  route('POST', '/projectors', ownerOnly, ({ body, user }) => {
    const tableId = tableRef(body.table_id);
    const p = addProjector(tableId, str(body.name, 'اسم الجهاز', { max: 60 }) ?? defaultName(tableId), false);
    log(user, 'projector.create', { name: p.name });
    live.floorChanged();
    return ctx.created(projectorDto(p));
  });

  route('PATCH', '/projectors/:id', ownerOnly, ({ params, body: b, user }) => {
    const p = loadProjector(params.id);
    const next = {
      name: has(b, 'name') ? str(b.name, 'اسم الجهاز', { required: true, max: 60 }) : p.name,
      table_id: has(b, 'table_id') ? tableRef(b.table_id) : p.table_id,
      rotation: has(b, 'rotation') ? oneOf(Number(b.rotation), 'الدوران', [0, 90, 180, 270], { required: true }) : p.rotation,
      layout: has(b, 'layout') ? oneOf(b.layout, 'التخطيط', ['single', 'dual'], { required: true }) : p.layout,
      pjlink_host: has(b, 'pjlink_host') ? str(b.pjlink_host, 'عنوان البرجكتر', { max: 255 }) : p.pjlink_host,
      pjlink_port: has(b, 'pjlink_port') ? (int(b.pjlink_port, 'منفذ PJLink', { min: 1, max: 65535 }) ?? 4352) : p.pjlink_port,
      pjlink_password: has(b, 'pjlink_password') ? str(b.pjlink_password, 'كلمة مرور PJLink', { max: 32 }) : p.pjlink_password,
    };
    const moved = next.table_id !== p.table_id;
    const reshaped = next.rotation !== p.rotation || next.layout !== p.layout;
    Object.assign(p, next);
    if (moved) projection.rebootstrap();
    else if (reshaped) projection.pushProjector(p.id);
    if (reshaped && p.online && p.table_id) ctx.focus?.(p.table_id);
    log(user, 'projector.update', { name: p.name });
    live.floorChanged();
    return projectorDto(p);
  });

  route('DELETE', '/projectors/:id', ownerOnly, ({ params, user }) => {
    const p = loadProjector(params.id);
    s.projectors.splice(s.projectors.indexOf(p), 1);
    log(user, 'projector.delete', { name: p.name });
    live.floorChanged();
    projection.rebootstrap();
    return { ok: true };
  });

  // A new key cuts the device off until it is paired again.
  route('POST', '/projectors/:id/rotate-key', ownerOnly, ({ params, user }) => {
    const p = loadProjector(params.id);
    p.device_key = newKey();
    projection.setOnline(p, false);
    log(user, 'projector.rotate-key', { name: p.name });
    return projectorDto(p);
  });

  route('PUT', '/projectors/:id/calibration', contentTeam, ({ params, body }) => {
    const p = loadProjector(params.id);
    p.calibration = validateCalibration(body);
    if (p.online && p.table_id) ctx.focus?.(p.table_id);
    const online = projection.pushProjector(p.id);
    return { ...projectorDto(p), delivered: { online } };
  });

  route('POST', '/projectors/:id/test-pattern', contentTeam, ({ params, body }) => {
    const p = loadProjector(params.id);
    const on = bool(body.on, true);
    return { on, delivered: { online: projection.testPattern(p.id, on) } };
  });

  // PJLink power: simulated (warming up / cooling down take a few seconds).
  const pjlinkTarget = (p) => {
    if (!p.pjlink_host) throw new HttpError(502, 'لم يُحدد عنوان IP للبرجكتر (PJLink)');
  };
  route('GET', '/projectors/:id/power', ownerOnly, ({ params }) => {
    const p = loadProjector(params.id);
    pjlinkTarget(p);
    return { power: p.power };
  });
  route('POST', '/projectors/:id/power', ownerOnly, ({ params, body, user }) => {
    const p = loadProjector(params.id);
    if (!has(body, 'on')) throw badRequest('حدد التشغيل أو الإطفاء');
    pjlinkTarget(p);
    const on = bool(body.on);
    p.power = on ? 'warming' : 'cooling';
    projection.rebootstrap();
    schedule(() => {
      p.power = on ? 'on' : 'off';
      projection.rebootstrap();
    }, on ? 4000 : 2500);
    log(user, 'projector.power', { name: p.name, on });
    return { power: p.power };
  });

  // ── Scenes ──

  const sceneTable = (id) => loadTable(id).id;

  route('GET', '/tables/:id/scene', anyStaff, ({ params }) => ({ scene: projection.getScene(sceneTable(params.id)) }));

  route('PUT', '/tables/:id/scene', anyStaff, ({ params, body, user }) => {
    const id = sceneTable(params.id);
    return projection.setScene(id, body.scene ?? body, user);
  });

  route('GET', '/tables/:id/preview-bootstrap', anyStaff, ({ params }) => projection.previewBootstrap(sceneTable(params.id)));
}

// Same rules as src/lib/calibration.js.
function validateCalibration(cal) {
  const corners = cal?.corners;
  if (!Array.isArray(corners) || corners.length !== 4) throw badRequest('المعايرة تحتاج 4 زوايا');
  return {
    corners: corners.map((p) => {
      const [x, y] = Array.isArray(p) && p.length === 2 ? p.map(Number) : [];
      if (![x, y].every((v) => Number.isFinite(v) && v >= -0.5 && v <= 1.5)) throw badRequest('إحداثيات زاوية غير صالحة');
      return [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5];
    }),
  };
}
