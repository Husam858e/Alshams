import { Router } from 'express';
import { anyStaff, floorTeam, ownerOnly } from '../auth/roles.js';
import { badRequest, conflict, has, idParam, int, notFound, oneOf, str } from '../lib/validate.js';

const TABLE_STATUSES = ['free', 'occupied', 'reserved'];

// Floor plan: sections (areas) and numbered tables.
export function floorRoutes({ db, floor, live, activity, projection }) {
  const r = Router();

  const q = {
    area: db.prepare('SELECT * FROM areas WHERE id = ?'),
    areas: db.prepare('SELECT * FROM areas ORDER BY sort_order, id'),
    nextAreaOrder: db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM areas').pluck(),
    tableByNumber: db.prepare('SELECT id FROM restaurant_tables WHERE number = ?'),
    nextTableOrder: db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM restaurant_tables').pluck(),
    projectorIds: db.prepare('SELECT id FROM projectors WHERE table_id = ?').pluck(),
  };

  const loadArea = (id) => {
    const area = q.area.get(idParam(id, 'القسم'));
    if (!area) throw notFound('القسم غير موجود');
    return area;
  };
  const loadTable = (id) => {
    const table = floor.tableRow(idParam(id, 'الطاولة'));
    if (!table) throw notFound('الطاولة غير موجودة');
    return table;
  };
  const areaRef = (value) => {
    const id = int(value, 'القسم', { min: 1 });
    if (id && !q.area.get(id)) throw badRequest('القسم المختار غير موجود');
    return id;
  };
  const tableNumber = (value, exceptId = null) => {
    const number = int(value, 'رقم الطاولة', { required: true, min: 1, max: 9999 });
    const taken = q.tableByNumber.get(number);
    if (taken && taken.id !== exceptId) throw conflict(`رقم الطاولة ${number} مستخدم مسبقاً`);
    return number;
  };

  r.get('/floor', anyStaff, (_req, res) => res.json(floor.getFloor()));
  r.get('/tables', anyStaff, (_req, res) => res.json(floor.tables()));
  r.get('/tables/:id', anyStaff, (req, res) => res.json(floor.table(idParam(req.params.id, 'الطاولة'))));

  // ── Areas (owner) ───────────────────────────────────────────────

  r.get('/areas', anyStaff, (_req, res) => res.json(q.areas.all()));

  r.post('/areas', ownerOnly, (req, res) => {
    const name = str(req.body.name, 'اسم القسم', { required: true, max: 60 });
    const sortOrder = int(req.body.sort_order, 'الترتيب') ?? q.nextAreaOrder.get();
    const id = db.prepare('INSERT INTO areas (name, sort_order) VALUES (?, ?)').run(name, sortOrder).lastInsertRowid;
    activity.log(req.user, 'area.create', { name });
    live.floorChanged();
    res.status(201).json(q.area.get(id));
  });

  r.patch('/areas/:id', ownerOnly, (req, res) => {
    const area = loadArea(req.params.id);
    const name = has(req.body, 'name') ? str(req.body.name, 'اسم القسم', { required: true, max: 60 }) : area.name;
    const sortOrder = has(req.body, 'sort_order') ? int(req.body.sort_order, 'الترتيب', { required: true }) : area.sort_order;
    db.prepare('UPDATE areas SET name = ?, sort_order = ? WHERE id = ?').run(name, sortOrder, area.id);
    if (name !== area.name) activity.log(req.user, 'area.update', { name, from: area.name });
    live.floorChanged();
    res.json(q.area.get(area.id));
  });

  // Its tables stay, without a section.
  r.delete('/areas/:id', ownerOnly, (req, res) => {
    const area = loadArea(req.params.id);
    db.prepare('DELETE FROM areas WHERE id = ?').run(area.id);
    activity.log(req.user, 'area.delete', { name: area.name });
    live.floorChanged();
    res.json({ ok: true });
  });

  // ── Tables ──────────────────────────────────────────────────────

  r.post('/tables', ownerOnly, (req, res) => {
    const b = req.body;
    const row = {
      number: tableNumber(b.number),
      area_id: areaRef(b.area_id),
      seats: int(b.seats, 'عدد المقاعد', { min: 1, max: 50 }) ?? 4,
      sort_order: int(b.sort_order, 'الترتيب') ?? q.nextTableOrder.get(),
    };
    const id = db
      .prepare('INSERT INTO restaurant_tables (number, area_id, seats, sort_order) VALUES (@number, @area_id, @seats, @sort_order)')
      .run(row).lastInsertRowid;
    activity.log(req.user, 'table.create', { number: row.number });
    live.floorChanged();
    res.status(201).json(floor.table(id));
  });

  r.patch('/tables/:id', ownerOnly, (req, res) => {
    const table = loadTable(req.params.id);
    const b = req.body;
    const next = {
      id: table.id,
      number: has(b, 'number') ? tableNumber(b.number, table.id) : table.number,
      area_id: has(b, 'area_id') ? areaRef(b.area_id) : table.area_id,
      seats: has(b, 'seats') ? int(b.seats, 'عدد المقاعد', { required: true, min: 1, max: 50 }) : table.seats,
      status: has(b, 'status') ? oneOf(b.status, 'الحالة', TABLE_STATUSES, { required: true }) : table.status,
      sort_order: has(b, 'sort_order') ? int(b.sort_order, 'الترتيب', { required: true }) : table.sort_order,
    };
    db.prepare(`
      UPDATE restaurant_tables SET number = @number, area_id = @area_id, seats = @seats, status = @status,
        sort_order = @sort_order WHERE id = @id`).run(next);
    if (next.number !== table.number || next.area_id !== table.area_id || next.seats !== table.seats) {
      activity.log(req.user, 'table.update', { number: next.number, from: table.number });
    }
    // The projected surface shows the table number (and section) from the bootstrap.
    if (next.number !== table.number || next.area_id !== table.area_id) {
      for (const id of q.projectorIds.all(table.id)) projection.rebootstrap(id);
    }
    live.floorChanged();
    res.json(floor.table(table.id));
  });

  // Its projectors go with it; past orders keep the table number.
  r.delete('/tables/:id', ownerOnly, (req, res) => {
    const table = loadTable(req.params.id);
    const projectorIds = q.projectorIds.all(table.id);
    db.prepare('DELETE FROM restaurant_tables WHERE id = ?').run(table.id);
    for (const id of projectorIds) projection.disconnectProjector(id);
    activity.log(req.user, 'table.delete', { number: table.number });
    live.floorChanged();
    res.json({ ok: true });
  });

  r.patch('/tables/:id/status', floorTeam, (req, res) => {
    const table = loadTable(req.params.id);
    const status = oneOf(req.body.status, 'الحالة', TABLE_STATUSES, { required: true });
    db.prepare('UPDATE restaurant_tables SET status = ? WHERE id = ?').run(status, table.id);
    live.floorChanged();
    res.json(floor.table(table.id));
  });

  return r;
}
