import { Router } from 'express';
import { anyStaff } from '../auth/roles.js';
import { idParam, notFound } from '../lib/validate.js';

// What a table's projector shows. Every role may change it (waiters for
// guests, designers for testing); changes are not written to the activity log.
export function sceneRoutes({ floor, projection }) {
  const r = Router();

  const tableId = (value) => {
    const id = idParam(value, 'الطاولة');
    if (!floor.tableRow(id)) throw notFound('الطاولة غير موجودة');
    return id;
  };

  r.get('/tables/:id/scene', anyStaff, (req, res) => {
    res.json({ scene: projection.getScene(tableId(req.params.id)) });
  });

  r.put('/tables/:id/scene', anyStaff, async (req, res) => {
    const id = tableId(req.params.id);
    res.json(await projection.setScene(id, req.body.scene ?? req.body, req.user));
  });

  // Live preview in the staff app (/player/?preview=<tableId>).
  r.get('/tables/:id/preview-bootstrap', anyStaff, (req, res) => {
    res.json(projection.previewBootstrap(tableId(req.params.id)));
  });

  return r;
}
