import { Router } from 'express';
import { contentTeam, ownerOnly } from '../auth/roles.js';
import { nowIso } from '../db/index.js';
import { readCalibration, validateCalibration } from '../lib/calibration.js';
import { androidCors, limitByIp } from '../lib/http.js';
import { newKey, sixDigits } from '../lib/keys.js';
import { RateLimiter } from '../lib/rateLimit.js';
import { HttpError, badRequest, bool, has, idParam, int, notFound, oneOf, str } from '../lib/validate.js';
import { getPower, setPower } from '../services/pjlink.js';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const CLAIM_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };

export const playerUrl = (deviceKey) => `/player/?device=${encodeURIComponent(deviceKey)}`;

// Ceiling projectors: setup (owner), calibration and test pattern (owner +
// designer), PJLink power, and pairing a projector device with a 6-digit code.
export function projectorRoutes({ db, projection, live, activity }) {
  const r = Router();
  const claimLimiter = new RateLimiter(CLAIM_LIMIT);

  const q = {
    list: db.prepare(`
      SELECT p.*, t.number AS table_number FROM projectors p
      LEFT JOIN restaurant_tables t ON t.id = p.table_id ORDER BY t.number IS NULL, t.number, p.id`),
    one: db.prepare(`
      SELECT p.*, t.number AS table_number FROM projectors p
      LEFT JOIN restaurant_tables t ON t.id = p.table_id WHERE p.id = ?`),
    table: db.prepare('SELECT * FROM restaurant_tables WHERE id = ?'),
    insert: db.prepare('INSERT INTO projectors (table_id, name, device_key) VALUES (?, ?, ?)'),
    code: db.prepare('SELECT * FROM pairing_codes WHERE code = ?'),
    purgeCodes: db.prepare('DELETE FROM pairing_codes WHERE expires_at <= ?'),
  };

  const dto = (p) => ({
    id: p.id,
    name: p.name,
    table_id: p.table_id,
    table_number: p.table_number ?? null,
    online: projection.isOnline(p.id),
    rotation: p.rotation,
    layout: p.layout,
    calibration: readCalibration(p.calibration),
    pjlink_host: p.pjlink_host,
    pjlink_port: p.pjlink_port,
    pjlink_has_password: Boolean(p.pjlink_password),
    last_seen_at: p.last_seen_at,
    created_at: p.created_at,
    player_url: playerUrl(p.device_key),
    test_pattern: projection.testPatternOn(p.id),
  });

  const load = (id) => {
    const p = q.one.get(idParam(id, 'جهاز العرض'));
    if (!p) throw notFound('جهاز العرض غير موجود');
    return p;
  };
  const tableRef = (value, { required = false } = {}) => {
    const id = int(value, 'الطاولة', { required, min: 1 });
    if (id && !q.table.get(id)) throw badRequest('الطاولة المختارة غير موجودة');
    return id;
  };
  const defaultName = (tableId) => {
    const table = tableId ? q.table.get(tableId) : null;
    return table ? `جهاز عرض طاولة ${table.number}` : 'جهاز عرض';
  };

  // ── Pairing (registered before '/projectors/:id') ───────────────

  r.post('/projectors/pairing-codes', ownerOnly, (req, res) => {
    const tableId = tableRef(req.body.table_id, { required: true });
    const name = str(req.body.name, 'اسم الجهاز', { max: 60 });
    q.purgeCodes.run(nowIso());
    let code;
    do code = sixDigits();
    while (q.code.get(code));
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
    db.prepare('INSERT INTO pairing_codes (code, table_id, projector_name, created_by, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(code, tableId, name, req.user.id, expiresAt);
    activity.log(req.user, 'projector.pairing-code', { tableNumber: q.table.get(tableId).number, name });
    res.status(201).json({ code, expiresAt });
  });

  // Public: the Android setup page (another origin) trades a code for a player URL.
  const cors = androidCors('POST');
  r.options('/projectors/claim', cors);
  r.post(
    '/projectors/claim',
    cors,
    limitByIp(claimLimiter, 'محاولات ربط كثيرة. انتظر قليلاً ثم أعد المحاولة.'),
    (req, res) => {
      const code = String(req.body.code ?? '').replace(/\D/g, '');
      if (code.length !== 6) throw badRequest('رمز الربط يتكون من 6 أرقام');
      const row = q.code.get(code);
      if (!row) throw notFound('رمز الربط غير صحيح أو مستخدم مسبقاً');
      const consume = db.prepare('DELETE FROM pairing_codes WHERE code = ?');
      if (Date.parse(row.expires_at) <= Date.now()) {
        consume.run(code);
        throw new HttpError(410, 'انتهت صلاحية رمز الربط. اطلب رمزاً جديداً.');
      }
      // Single use: the code goes away together with creating the projector.
      const result = db.transaction(() => {
        consume.run(code);
        const table = q.table.get(row.table_id);
        const key = newKey();
        const id = q.insert.run(table.id, row.projector_name || defaultName(table.id), key).lastInsertRowid;
        return { id, key, table };
      })();
      activity.log(null, 'projector.claim', { tableNumber: result.table.number, name: q.one.get(result.id).name });
      live.floorChanged();
      res.status(201).json({
        playerUrl: playerUrl(result.key),
        table: { id: result.table.id, number: result.table.number },
        projector: { id: result.id, name: q.one.get(result.id).name },
      });
    },
  );

  // ── Projectors ──────────────────────────────────────────────────

  r.get('/projectors', contentTeam, (_req, res) => res.json(q.list.all().map(dto)));
  r.get('/projectors/:id', contentTeam, (req, res) => res.json(dto(load(req.params.id))));

  r.post('/projectors', ownerOnly, (req, res) => {
    const tableId = tableRef(req.body.table_id);
    const name = str(req.body.name, 'اسم الجهاز', { max: 60 }) ?? defaultName(tableId);
    const id = q.insert.run(tableId, name, newKey()).lastInsertRowid;
    activity.log(req.user, 'projector.create', { name });
    live.floorChanged();
    res.status(201).json(dto(load(id)));
  });

  r.patch('/projectors/:id', ownerOnly, (req, res) => {
    const p = load(req.params.id);
    const b = req.body;
    const next = {
      id: p.id,
      name: has(b, 'name') ? str(b.name, 'اسم الجهاز', { required: true, max: 60 }) : p.name,
      table_id: has(b, 'table_id') ? tableRef(b.table_id) : p.table_id,
      rotation: has(b, 'rotation') ? oneOf(Number(b.rotation), 'الدوران', [0, 90, 180, 270], { required: true }) : p.rotation,
      layout: has(b, 'layout') ? oneOf(b.layout, 'التخطيط', ['single', 'dual'], { required: true }) : p.layout,
      pjlink_host: has(b, 'pjlink_host') ? str(b.pjlink_host, 'عنوان البرجكتر', { max: 255 }) : p.pjlink_host,
      pjlink_port: has(b, 'pjlink_port') ? (int(b.pjlink_port, 'منفذ PJLink', { min: 1, max: 65535 }) ?? 4352) : p.pjlink_port,
      pjlink_password: has(b, 'pjlink_password') ? str(b.pjlink_password, 'كلمة مرور PJLink', { max: 32 }) : p.pjlink_password,
    };
    db.prepare(`
      UPDATE projectors SET name = @name, table_id = @table_id, rotation = @rotation, layout = @layout,
        pjlink_host = @pjlink_host, pjlink_port = @pjlink_port, pjlink_password = @pjlink_password
      WHERE id = @id`).run(next);
    if (next.table_id !== p.table_id) projection.rebootstrap(p.id);
    else if (next.rotation !== p.rotation || next.layout !== p.layout) projection.pushProjector(p.id);
    activity.log(req.user, 'projector.update', { name: next.name });
    live.floorChanged();
    res.json(dto(load(p.id)));
  });

  r.delete('/projectors/:id', ownerOnly, (req, res) => {
    const p = load(req.params.id);
    db.prepare('DELETE FROM projectors WHERE id = ?').run(p.id);
    projection.disconnectProjector(p.id);
    activity.log(req.user, 'projector.delete', { name: p.name });
    live.floorChanged();
    res.json({ ok: true });
  });

  // A leaked player link stops working; the device must be paired again.
  r.post('/projectors/:id/rotate-key', ownerOnly, (req, res) => {
    const p = load(req.params.id);
    db.prepare('UPDATE projectors SET device_key = ? WHERE id = ?').run(newKey(), p.id);
    projection.disconnectProjector(p.id);
    activity.log(req.user, 'projector.rotate-key', { name: p.name });
    res.json(dto(load(p.id)));
  });

  r.put('/projectors/:id/calibration', contentTeam, (req, res) => {
    const p = load(req.params.id);
    const calibration = validateCalibration(req.body);
    db.prepare('UPDATE projectors SET calibration = ? WHERE id = ?').run(JSON.stringify(calibration), p.id);
    const online = projection.pushProjector(p.id);
    res.json({ ...dto(load(p.id)), delivered: { online } });
  });

  r.post('/projectors/:id/test-pattern', contentTeam, (req, res) => {
    const p = load(req.params.id);
    const on = bool(req.body.on, true);
    res.json({ on, delivered: { online: projection.testPattern(p.id, on) } });
  });

  // ── Power over the LAN (PJLink) ─────────────────────────────────

  r.get('/projectors/:id/power', ownerOnly, async (req, res) => {
    const p = load(req.params.id);
    res.json({ power: await pjlink(() => getPower(p)) });
  });

  r.post('/projectors/:id/power', ownerOnly, async (req, res) => {
    const p = load(req.params.id);
    if (!has(req.body, 'on')) throw badRequest('حدد التشغيل أو الإطفاء');
    const on = bool(req.body.on);
    await pjlink(() => setPower(p, on));
    activity.log(req.user, 'projector.power', { name: p.name, on });
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
