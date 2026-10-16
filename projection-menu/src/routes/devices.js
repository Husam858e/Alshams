import { Router } from 'express';
import { parseJson } from '../db/index.js';
import { newKey } from '../lib/auth.js';
import { HttpError, bool, int, notFound, oneOf, str } from '../lib/validate.js';
import { DEFAULT_CALIBRATION, defaultZones, validateCalibration, validateZones } from '../lib/zones.js';
import { getPower, setPower } from '../services/pjlink.js';

// Admin: restaurant tables (+ tablet pairing) and projectors
// (+ calibration, seat zones, live status, power).
export function deviceRoutes({ db, projection, bus }) {
  const r = Router();

  const q = {
    tables: db.prepare(`
      SELECT t.*, (SELECT COUNT(*) FROM projectors p WHERE p.table_id = t.id) AS projector_count
      FROM restaurant_tables t ORDER BY t.code`),
    table: db.prepare('SELECT * FROM restaurant_tables WHERE id = ?'),
    projectors: db.prepare(`
      SELECT p.*, t.code AS table_code, t.seats AS table_seats
      FROM projectors p LEFT JOIN restaurant_tables t ON t.id = p.table_id ORDER BY p.id`),
    projector: db.prepare(`
      SELECT p.*, t.code AS table_code, t.seats AS table_seats
      FROM projectors p LEFT JOIN restaurant_tables t ON t.id = p.table_id WHERE p.id = ?`),
    asset: db.prepare('SELECT kind FROM media_assets WHERE id = ?'),
  };

  const serializeTable = (t) => ({
    ...t,
    is_active: Boolean(t.is_active),
    tablet_path: `/tablet/?table=${encodeURIComponent(t.code)}&key=${t.access_key}`,
  });
  const serializeProjector = (p) => ({
    ...p,
    calibration: parseJson(p.calibration, DEFAULT_CALIBRATION),
    zones: parseJson(p.zones, []),
    online: projection.isOnline(p),
    player_path: `/player/?projector=${p.id}&key=${p.access_key}`,
  });
  const loadProjector = (id) => {
    const p = q.projector.get(id);
    if (!p) throw notFound('جهاز العرض غير موجود');
    return p;
  };
  // Saving a projector re-sends its config so the change shows up live.
  const saveAndPush = async (id, res) => {
    const push = await projection.pushConfig(id);
    const projector = serializeProjector(loadProjector(id));
    bus.emit('projector:status', { id, online: projector.online });
    res.json({ projector, push });
  };

  // ── Tables ──────────────────────────────────────────────────
  r.get('/tables', (_req, res) => res.json(q.tables.all().map(serializeTable)));

  r.post('/tables', (req, res) => {
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO restaurant_tables (code, name, seats, access_key, is_active)
                VALUES (@code, @name, @seats, @access_key, @is_active)`)
      .run({ ...tableFields(req.body), access_key: newKey() });
    res.status(201).json(serializeTable(q.table.get(lastInsertRowid)));
  });

  r.put('/tables/:id', (req, res) => {
    const id = int(req.params.id, 'id');
    const { changes } = db
      .prepare('UPDATE restaurant_tables SET code = @code, name = @name, seats = @seats, is_active = @is_active WHERE id = @id')
      .run({ ...tableFields(req.body), id });
    if (!changes) throw notFound('الطاولة غير موجودة');
    res.json(serializeTable(q.table.get(id)));
  });

  r.delete('/tables/:id', (req, res) => {
    db.prepare('DELETE FROM restaurant_tables WHERE id = ?').run(int(req.params.id, 'id'));
    res.status(204).end();
  });

  // Un-pairs every tablet using the old link (e.g. a stolen tablet).
  r.post('/tables/:id/rotate-key', (req, res) => {
    const id = int(req.params.id, 'id');
    if (!db.prepare('UPDATE restaurant_tables SET access_key = ? WHERE id = ?').run(newKey(), id).changes) {
      throw notFound('الطاولة غير موجودة');
    }
    res.json(serializeTable(q.table.get(id)));
  });

  // ── Projectors ──────────────────────────────────────────────
  r.get('/projectors', (_req, res) => res.json(q.projectors.all().map(serializeProjector)));

  r.post('/projectors', async (req, res) => {
    const fields = projectorFields(req.body, q);
    const seats = fields.table_id ? q.table.get(fields.table_id).seats : 4;
    const { lastInsertRowid } = db
      .prepare(`
        INSERT INTO projectors (table_id, name, driver, agent_host, agent_port, pjlink_host, pjlink_port,
                                pjlink_password, idle_asset_id, access_key, zones)
        VALUES (@table_id, @name, @driver, @agent_host, @agent_port, @pjlink_host, @pjlink_port,
                @pjlink_password, @idle_asset_id, @access_key, @zones)`)
      .run({ ...fields, access_key: newKey(), zones: JSON.stringify(defaultZones(seats)) });
    res.status(201).json(serializeProjector(loadProjector(lastInsertRowid)));
  });

  r.put('/projectors/:id', async (req, res) => {
    const id = int(req.params.id, 'id');
    loadProjector(id);
    db.prepare(`
      UPDATE projectors SET table_id = @table_id, name = @name, driver = @driver, agent_host = @agent_host,
        agent_port = @agent_port, pjlink_host = @pjlink_host, pjlink_port = @pjlink_port,
        pjlink_password = @pjlink_password, idle_asset_id = @idle_asset_id
      WHERE id = @id`).run({ ...projectorFields(req.body, q), id });
    await saveAndPush(id, res);
  });

  r.delete('/projectors/:id', (req, res) => {
    db.prepare('DELETE FROM projectors WHERE id = ?').run(int(req.params.id, 'id'));
    res.status(204).end();
  });

  r.post('/projectors/:id/rotate-key', (req, res) => {
    const id = int(req.params.id, 'id');
    loadProjector(id);
    db.prepare('UPDATE projectors SET access_key = ? WHERE id = ?').run(newKey(), id);
    res.json(serializeProjector(loadProjector(id)));
  });

  // Corner-pin calibration, dragged live from the dashboard.
  r.put('/projectors/:id/calibration', async (req, res) => {
    const id = int(req.params.id, 'id');
    loadProjector(id);
    db.prepare('UPDATE projectors SET calibration = ? WHERE id = ?').run(JSON.stringify(validateCalibration(req.body)), id);
    await saveAndPush(id, res);
  });

  r.put('/projectors/:id/zones', async (req, res) => {
    const id = int(req.params.id, 'id');
    const projector = loadProjector(id);
    const zones = bool(req.body.reset) ? defaultZones(projector.table_seats ?? 4) : validateZones(req.body.zones);
    db.prepare('UPDATE projectors SET zones = ? WHERE id = ?').run(JSON.stringify(zones), id);
    await saveAndPush(id, res);
  });

  // Manual control: test pattern (for calibration), stop all, re-send config.
  r.post('/projectors/:id/command', async (req, res) => {
    const id = int(req.params.id, 'id');
    const action = oneOf(req.body.action, 'الأمر', ['test_pattern', 'stop', 'config'], { required: true });
    const body =
      action === 'test_pattern'
        ? { action, on: bool(req.body.on, true) }
        : action === 'stop'
          ? { action, layer: null }
          : projection.configCue(loadProjector(id));
    res.json(await projection.command(id, body));
  });

  // Projector lamp/laser power over the LAN (PJLink).
  r.get('/projectors/:id/power', async (req, res) => {
    res.json({ power: await pjlink(() => getPower(loadProjector(int(req.params.id, 'id')))) });
  });

  r.post('/projectors/:id/power', async (req, res) => {
    const on = bool(req.body.on);
    await pjlink(() => setPower(loadProjector(int(req.params.id, 'id')), on));
    res.json({ power: on ? 'warming' : 'cooling' });
  });

  return r;
}

async function pjlink(fn) {
  try {
    return await fn();
  } catch (err) {
    throw err instanceof HttpError ? err : new HttpError(502, err.message);
  }
}

function tableFields(body) {
  return {
    code: str(body.code, 'رمز الطاولة', { required: true, max: 20 }),
    name: str(body.name, 'اسم الطاولة', { required: true, max: 80 }),
    seats: int(body.seats, 'عدد المقاعد', { required: true, min: 1, max: 20 }),
    is_active: bool(body.is_active, true) ? 1 : 0,
  };
}

function projectorFields(body, q) {
  const fields = {
    table_id: int(body.table_id, 'الطاولة', { min: 1 }),
    name: str(body.name, 'اسم الجهاز', { required: true, max: 80 }),
    driver: oneOf(body.driver ?? 'browser', 'نوع التشغيل', ['browser', 'mpv_agent']),
    agent_host: str(body.agent_host, 'عنوان الوكيل', { max: 255 }),
    agent_port: int(body.agent_port, 'منفذ الوكيل', { min: 1, max: 65535 }) ?? 8765,
    pjlink_host: str(body.pjlink_host, 'عنوان البرجكتر', { max: 255 }),
    pjlink_port: int(body.pjlink_port, 'منفذ PJLink', { min: 1, max: 65535 }) ?? 4352,
    pjlink_password: str(body.pjlink_password, 'كلمة مرور PJLink', { max: 32 }),
    idle_asset_id: int(body.idle_asset_id, 'عرض الخمول', { min: 1 }),
  };
  if (fields.table_id && !q.table.get(fields.table_id)) throw notFound('الطاولة غير موجودة');
  if (fields.idle_asset_id && !q.asset.get(fields.idle_asset_id)) throw notFound('ملف عرض الخمول غير موجود');
  return fields;
}
