// Two Socket.IO namespaces:
//   /live   — staff apps, authenticated by the pm_session cookie
//   /player — projector players, authenticated by their device key
export function attachSockets(io, { sessions, projection }) {
  const live = io.of('/live');
  live.use((socket, next) => {
    const found = sessions.fromCookieHeader(socket.handshake.headers.cookie);
    if (!found) return next(new Error('unauthorized'));
    socket.data.user = found.user;
    socket.data.sessionHash = found.tokenHash;
    next();
  });
  live.on('connection', (socket) => {
    const { user, sessionHash } = socket.data;
    socket.join(['staff', `role:${user.role}`, `user:${user.id}`, `session:${sessionHash}`]);
  });

  const players = io.of('/player');
  projection.players = players;
  players.use((socket, next) => {
    const projector = projection.projectorByKey(socket.handshake.auth?.deviceKey);
    if (!projector) return next(new Error('unauthorized'));
    socket.data.projector = projector;
    next();
  });
  players.on('connection', (socket) => {
    projection.playerConnected(socket, socket.data.projector);
    socket.on('status', (msg) => projection.playerStatus(socket, msg));
    socket.on('disconnect', () => projection.playerDisconnected(socket));
  });
}
