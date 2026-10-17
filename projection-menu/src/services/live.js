// Staff realtime channel (Socket.IO namespace '/live'). Every logged-in user
// is in room 'staff', plus 'role:<role>' and 'user:<id>'.
export function createLive(nsp) {
  return {
    nsp,
    staff(event, payload = {}) {
      nsp.to('staff').emit(event, payload);
    },
    roles(roles, event, payload = {}) {
      nsp.to(roles.map((r) => `role:${r}`)).emit(event, payload);
    },
    floorChanged() {
      nsp.to('staff').emit('floor:changed', {});
    },
    // Session revoked / role changed: the client reconnects with fresh rights
    // (or is sent to the login screen). `keepSession` spares the caller's own.
    async disconnectUser(userId, keepSession = null) {
      for (const socket of await nsp.in(`user:${userId}`).fetchSockets()) {
        if (!keepSession || socket.data.sessionHash !== keepSession) socket.disconnect(true);
      }
    },
    disconnectSession(sessionHash) {
      if (sessionHash) nsp.in(`session:${sessionHash}`).disconnectSockets(true);
    },
  };
}
