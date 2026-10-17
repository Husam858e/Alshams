// Stand-in for the Socket.IO client in the offline demo. demo/app.html's
// import map points '/socket.io/socket.io.esm.min.js' here, so the staff
// app's lib/live.js runs unchanged and receives the '/live' events of the
// demo backend (window.__PM_DEMO__, set by frame-shim.js) instead of a server.
// Only what live.js uses is implemented: on, off, onAny, emit, connect,
// disconnect and the 'connect' / 'disconnect' / 'connect_error' events.

export function io(namespace = '/', _options = {}) {
  const host = globalThis.__PM_DEMO__ ?? null;
  const handlers = new Map(); // event -> Set(fn)
  const anyHandlers = new Set();
  let unsubscribe = null;

  const fire = (event, ...args) => {
    for (const fn of [...(handlers.get(event) ?? [])]) fn(...args);
  };
  // Payloads come from the parent page: copy them into this page.
  const deliver = (event, payload) => {
    const copy = structuredClone(payload);
    for (const fn of [...anyHandlers]) fn(event, copy);
    fire(event, copy);
  };

  const socket = {
    connected: false,
    active: true,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return socket;
    },
    off(event, fn) {
      if (fn) handlers.get(event)?.delete(fn);
      else handlers.delete(event);
      return socket;
    },
    onAny(fn) {
      anyHandlers.add(fn);
      return socket;
    },
    // Staff clients never emit on '/live'; acknowledge anyway if asked.
    emit(_event, ...args) {
      const ack = args[args.length - 1];
      if (typeof ack === 'function') setTimeout(() => ack({ ok: true }), 0);
      return socket;
    },
    connect() {
      if (socket.connected) return socket;
      socket.active = true;
      setTimeout(() => {
        if (!socket.active || socket.connected) return;
        if (!host || namespace !== '/live' || !host.currentUser()) {
          fire('connect_error', new Error('unauthorized'));
          return;
        }
        unsubscribe = host.subscribeLive(deliver);
        socket.connected = true;
        fire('connect');
      }, 0);
      return socket;
    },
    disconnect() {
      socket.active = false;
      unsubscribe?.();
      unsubscribe = null;
      if (socket.connected) {
        socket.connected = false;
        fire('disconnect', 'io client disconnect');
      }
      return socket;
    },
    close() {
      return socket.disconnect();
    },
  };

  // The page goes away (reload, role switch): stop listening.
  addEventListener('pagehide', () => socket.disconnect());
  return socket.connect();
}

export default io;
