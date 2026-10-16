import { Router } from 'express';
import { safeEqual } from '../lib/auth.js';
import { HttpError, int } from '../lib/validate.js';
import { toAgentCue } from '../services/drivers/mpvAgentDriver.js';

// mpv agents (agent/projector_agent.py) call this every few seconds. The
// response carries the projector's current config so a rebooted agent
// restores its idle loop and zones without waiting for the dashboard.
export function agentRoutes({ db, projection, bus, config }) {
  const r = Router();

  r.post('/heartbeat', (req, res) => {
    const id = int(req.body.projector_id, 'projector_id', { required: true, min: 1 });
    const projector = db.prepare('SELECT * FROM projectors WHERE id = ?').get(id);
    if (!projector || !safeEqual(String(req.body.key ?? ''), projector.access_key)) {
      throw new HttpError(401, 'unauthorized');
    }
    const wasOnline = projection.isOnline(projector);
    db.prepare("UPDATE projectors SET last_seen_at = datetime('now') WHERE id = ?").run(id);
    if (!wasOnline) bus.emit('projector:status', { id, online: true });
    res.json({ config: toAgentCue(projection.configCue(projector), config.publicBaseUrl) });
  });

  return r;
}
