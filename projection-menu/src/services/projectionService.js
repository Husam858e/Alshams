import crypto from 'node:crypto';
import { parseJson } from '../db/index.js';
import { notFound } from '../lib/validate.js';
import { DEFAULT_CALIBRATION, FULL_ZONE } from '../lib/zones.js';

// ProjectionService turns business events ("seat 2 at table T01 is looking
// at the pizza") into cues for the right projector(s), and logs the outcome.
//
// A cue is a small JSON command, identical for every driver:
//   { cueId, action: 'play', layer: 'seat-2', zone: {x,y,w,h,rotate},
//     media: {kind, url, sha256}, loop, durationMs, scale, fadeMs, meta }
//   { cueId, action: 'stop', layer: 'seat-2' }      // layer null = everything
//   { cueId, action: 'config', calibration, zones, idle }
//   { cueId, action: 'test_pattern', on: true }
export class ProjectionService {
  constructor({ db, drivers, bus }) {
    this.db = db;
    this.drivers = drivers;
    this.bus = bus;
    this.stmt = {
      projector: db.prepare('SELECT * FROM projectors WHERE id = ?'),
      tableProjectors: db.prepare('SELECT * FROM projectors WHERE table_id = ? ORDER BY id'),
      dishProjection: db.prepare(`
        SELECT dp.*, d.name_ar AS dish_name, m.kind, m.file_name, m.sha256
        FROM dish_projections dp
        JOIN dishes d       ON d.id = dp.dish_id
        JOIN media_assets m ON m.id = dp.media_asset_id
        WHERE dp.dish_id = ? AND dp.phase = ?`),
      asset: db.prepare('SELECT * FROM media_assets WHERE id = ?'),
      log: db.prepare(`
        INSERT INTO projection_log
          (projector_id, table_id, dish_id, media_asset_id, cue_id, action, phase, result, error)
        VALUES (@projector_id, @table_id, @dish_id, @media_asset_id, @cue_id, @action, @phase, @result, @error)`),
    };
  }

  isOnline(projector) {
    return this.drivers[projector.driver]?.isOnline(projector) ?? false;
  }

  // Play the projection a dish has for `phase` in front of `seatNo`
  // (or across the whole table when no seat is given).
  async playDish({ tableId, dishId, phase, seatNo = null }) {
    const projection = this.stmt.dishProjection.get(dishId, phase);
    if (!projection) return { status: 'no_projection', results: [] };

    const targets = this.resolveTargets(tableId, seatNo);
    if (!targets.length) return { status: 'no_projector', results: [] };

    const results = await Promise.all(
      targets.map(({ projector, layer, zone }) =>
        this.send(
          projector,
          {
            action: 'play',
            layer,
            zone,
            media: mediaRef(projection),
            loop: Boolean(projection.loop),
            durationMs: projection.duration_ms,
            scale: projection.scale,
            fadeMs: 500,
            meta: { dishId, dishName: projection.dish_name, phase },
          },
          { table_id: tableId, dish_id: dishId, media_asset_id: projection.media_asset_id, phase },
        ),
      ),
    );
    return { status: results.some((r) => r.ok) ? 'sent' : 'failed', results };
  }

  // Clear a seat's layer (back to the idle loop underneath).
  async stopSeat({ tableId, seatNo = null }) {
    const targets = this.resolveTargets(tableId, seatNo);
    const results = await Promise.all(
      targets.map(({ projector, layer }) => this.send(projector, { action: 'stop', layer }, { table_id: tableId })),
    );
    return { status: results.some((r) => r.ok) ? 'sent' : 'failed', results };
  }

  // Push calibration/zones/idle loop to one projector (after edits in the dashboard).
  async pushConfig(projectorId) {
    const projector = this.getProjector(projectorId);
    return this.send(projector, this.configCue(projector), { table_id: projector.table_id });
  }

  async command(projectorId, body) {
    const projector = this.getProjector(projectorId);
    return this.send(projector, body, { table_id: projector.table_id });
  }

  configCue(projector) {
    const idle = projector.idle_asset_id ? this.stmt.asset.get(projector.idle_asset_id) : null;
    const calibration = parseJson(projector.calibration, {});
    return {
      action: 'config',
      projectorName: projector.name,
      calibration: calibration.corners ? calibration : DEFAULT_CALIBRATION,
      zones: parseJson(projector.zones, []),
      idle: idle ? mediaRef(idle) : null,
    };
  }

  // Which projector(s) and which layer a seat maps to. A seat is covered by
  // the projector whose zone list contains it; if no zone matches (or no seat
  // was given) every projector of the table plays it full-surface.
  resolveTargets(tableId, seatNo) {
    const projectors = this.stmt.tableProjectors.all(tableId);
    if (seatNo != null) {
      const seatTargets = projectors.flatMap((projector) => {
        const zone = parseJson(projector.zones, []).find((z) => z.seat === seatNo);
        return zone ? [{ projector, layer: `seat-${seatNo}`, zone }] : [];
      });
      if (seatTargets.length) return seatTargets;
    }
    return projectors.map((projector) => ({ projector, layer: 'full', zone: FULL_ZONE }));
  }

  getProjector(projectorId) {
    const projector = this.stmt.projector.get(projectorId);
    if (!projector) throw notFound('جهاز العرض غير موجود');
    return projector;
  }

  async send(projector, body, logCtx = {}) {
    const cue = { cueId: crypto.randomUUID(), ...body };
    const driver = this.drivers[projector.driver];
    let outcome;
    try {
      outcome = driver
        ? await driver.send(projector, cue)
        : { ok: false, result: 'failed', error: `مشغل غير معروف: ${projector.driver}` };
    } catch (err) {
      outcome = { ok: false, result: 'failed', error: err.message };
    }
    this.log({
      projector_id: projector.id,
      cue_id: cue.cueId,
      action: cue.action,
      result: outcome.result,
      error: outcome.error ?? null,
      ...logCtx,
    });
    return { projectorId: projector.id, cueId: cue.cueId, ...outcome };
  }

  log(entry) {
    const row = {
      projector_id: null,
      table_id: null,
      dish_id: null,
      media_asset_id: null,
      cue_id: null,
      phase: null,
      error: null,
      ...entry,
    };
    this.stmt.log.run(row);
    this.bus.emit('projection:log', { ...row, created_at: new Date().toISOString() });
  }
}

const mediaRef = (asset) => ({ kind: asset.kind, url: `/media/${asset.file_name}`, sha256: asset.sha256 });
