import { Router } from 'express';
import { nowIso } from '../db/index.js';
import { HttpError } from '../lib/validate.js';

// Projector players authenticate with their device key
// (header 'x-device-key' or query '?key=').
export function playerRoutes({ db, projection }) {
  const r = Router();
  const touch = db.prepare('UPDATE projectors SET last_seen_at = ? WHERE id = ?');

  r.get('/player/bootstrap', (req, res) => {
    const key = req.get('x-device-key') ?? (typeof req.query.key === 'string' ? req.query.key : '');
    const projector = projection.projectorByKey(key);
    if (!projector) throw new HttpError(401, 'جهاز العرض غير مرتبط أو أن رابطه لم يعد صالحاً. أعد ربطه برمز جديد.');
    touch.run(nowIso(), projector.id);
    res.set('Cache-Control', 'no-store');
    res.json(projection.bootstrapFor(projector));
  });

  return r;
}
