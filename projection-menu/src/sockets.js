import { safeEqual } from './lib/auth.js';
import { playerRoom } from './services/drivers/browserDriver.js';

// Two Socket.IO namespaces:
//   /player — one connection per projector page (receives cues, reports playback)
//   /admin  — dashboards (live projector status, new orders, projection log)
export function attachSockets(io, { db, bus, projection, config }) {
  const findProjector = db.prepare('SELECT * FROM projectors WHERE id = ?');
  const touch = db.prepare("UPDATE projectors SET last_seen_at = datetime('now') WHERE id = ?");

  const players = io.of('/player');
  players.use((socket, next) => {
    const { projectorId, key } = socket.handshake.auth ?? {};
    const projector = findProjector.get(Number(projectorId));
    if (!projector || !safeEqual(String(key ?? ''), projector.access_key)) return next(new Error('unauthorized'));
    socket.data.projectorId = projector.id;
    next();
  });

  players.on('connection', (socket) => {
    const id = socket.data.projectorId;
    socket.join(playerRoom(id));
    touch.run(id);
    // A freshly (re)booted player gets its calibration, zones and idle loop at once.
    socket.emit('cue', { cueId: 'boot', ...projection.configCue(findProjector.get(id)) });
    bus.emit('projector:status', { id, online: true });

    // After acking a cue the player reports how playback actually went.
    socket.on('cue:status', (msg) => {
      if (!['playing', 'ended', 'error'].includes(msg?.state)) return;
      projection.log({
        projector_id: id,
        cue_id: String(msg.cueId ?? '').slice(0, 64),
        action: 'status',
        result: msg.state,
        error: msg.error ? String(msg.error).slice(0, 300) : null,
      });
    });

    socket.on('disconnect', () => {
      touch.run(id);
      const projector = findProjector.get(id);
      if (projector && !projection.isOnline(projector)) bus.emit('projector:status', { id, online: false });
    });
  });

  const admins = io.of('/admin');
  admins.use((socket, next) =>
    safeEqual(String(socket.handshake.auth?.token ?? ''), config.adminToken) ? next() : next(new Error('unauthorized')),
  );
  for (const event of ['projector:status', 'order:changed', 'projection:log']) {
    bus.on(event, (payload) => admins.emit(event, payload));
  }
}
