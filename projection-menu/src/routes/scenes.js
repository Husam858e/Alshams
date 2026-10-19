import { Router } from 'express';
import { anyStaff } from '../auth/roles.js';
import { forbidden, idParam, notFound } from '../lib/validate.js';
import { sceneFor } from '../services/projectionService.js';

// What a table's projector shows. Every role may change it (waiters for
// guests, designers for testing, but not order scenes); changes are not
// written to the activity log.
export function sceneRoutes({ floor, projection }) {
  const r = Router();

  const tableId = (value) => {
    const id = idParam(value, 'الطاولة');
    if (!floor.tableRow(id)) throw notFound('الطاولة غير موجودة');
    return id;
  };

  r.get('/tables/:id/scene', anyStaff, (req, res) => {
    res.json({ scene: sceneFor(projection.getScene(tableId(req.params.id)), req.user.role) });
  });

  r.put('/tables/:id/scene', anyStaff, async (req, res) => {
    const id = tableId(req.params.id);
    const scene = req.body.scene ?? req.body;
    // Orders are not the designer's business (they test with the menu scenes).
    if (req.user.role === 'designer' && scene?.type === 'order') throw forbidden('عرض الطلبات من صلاحيات المالك والويتر');
    res.json(await projection.setScene(id, scene, req.user));
  });

  // Live preview in the staff app (/player/?preview=<tableId>).
  r.get('/tables/:id/preview-bootstrap', anyStaff, (req, res) => {
    const boot = projection.previewBootstrap(tableId(req.params.id));
    res.json({ ...boot, scene: sceneFor(boot.scene, req.user.role) });
  });

  return r;
}
