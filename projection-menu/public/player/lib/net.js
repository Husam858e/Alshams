// All network access of the player lives here (HTTP + Socket.IO), so the
// offline demo can replace it in one place.
//
//   openDevice(key, on)   real projector: '/player' namespace + device key
//   openPreview(id, on)   staff live preview: '/live' namespace + session cookie
//
// `on` receives: bootstrap(b), scene(scene), projector(p), testPattern(on),
// order(orderDTO), online(bool), fatal(reason) where reason is
// 'unauthorized' | 'login' | 'missing'. Both return
// { reportStatus(state, detail), fetchOrder(orderId) -> Promise<order|null> }.
//
// Demo seam: when window.__PM_DEMO__ (or the same-origin parent's, for the
// preview iframe inside the staff app) defines openDevice / openPreview with
// the same contract, they are used instead and no request leaves the page.
// The Socket.IO client is imported lazily, so the demo needs no fake of it.

const loadIo = () => import('/socket.io/socket.io.esm.min.js').then((m) => m.io);

function demoTransport() {
  try {
    if (globalThis.__PM_DEMO__) return globalThis.__PM_DEMO__;
    if (window.parent !== window) return window.parent.__PM_DEMO__ ?? null;
  } catch {
    // cross-origin parent
  }
  return null;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, credentials: 'same-origin', cache: 'no-store' });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // empty or non-JSON body
  }
  if (!res.ok) throw new HttpError(res.status, body?.error || `HTTP ${res.status}`);
  return body;
}

// The server embeds the order in 'order' scenes; when a scene arrives
// without it, the current bootstrap of the table has it.
const orderFrom = (bootstrap, orderId) => {
  const order = bootstrap?.scene?.order;
  return order && String(order.id) === String(orderId) ? order : null;
};

// Coalesces bursts of change events into one request.
function debounce(fn, ms) {
  let timer = null;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
  run.now = () => {
    clearTimeout(timer);
    fn();
  };
  return run;
}

const AUTH_ERROR = /unauthori|forbidden|invalid|denied|key|مفتاح|صالح|مصرح/i;

// Socket.IO does not retry by itself after the server rejected the handshake
// (middleware error) or closed the connection on purpose; a projector must
// keep trying forever, so we do.
function keepConnecting(socket, delayMs) {
  let timer = null;
  const retry = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => socket.connect(), ms);
  };
  socket.on('connect_error', () => {
    if (!socket.active) retry(delayMs); // transport errors are retried by the manager
  });
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') retry(1500);
  });
}

// Opens the socket once the client module is loaded; `wire` adds handlers.
function connect(on, namespace, options, wire) {
  let socket = null;
  loadIo().then(
    (io) => {
      socket = io(namespace, { reconnectionDelay: 1000, reconnectionDelayMax: 5000, ...options });
      socket.on('disconnect', () => on.online(false));
      keepConnecting(socket, 8000);
      wire(socket);
    },
    () => on.online(false),
  );
  return () => socket;
}

export function openDevice(deviceKey, on) {
  const demo = demoTransport();
  if (demo?.openDevice) return demo.openDevice(deviceKey, on);

  const headers = { 'x-device-key': deviceKey };
  const refetch = debounce(async () => {
    try {
      on.bootstrap(await getJson('/api/player/bootstrap', headers));
    } catch (err) {
      if (err.status === 401 || err.status === 403) on.fatal('unauthorized');
      // Network errors: keep the last menu; the socket reconnects and the
      // server sends a fresh bootstrap on connect.
    }
  }, 250);

  const socket = connect(on, '/player', { auth: { deviceKey } }, (s) => {
    s.on('connect', () => on.online(true));
    s.on('connect_error', (err) => {
      on.online(false);
      if (!s.active && AUTH_ERROR.test(err?.message ?? '')) on.fatal('unauthorized');
    });
    s.on('bootstrap', (b) => on.bootstrap(b));
    // The server waits (2 s) for this ack to report delivery to the waiter.
    s.on('scene', (payload, ack) => {
      on.scene(payload?.scene ?? payload);
      if (typeof ack === 'function') ack({ ok: true });
    });
    s.on('menu:changed', refetch);
    s.on('settings:changed', refetch);
    s.on('projector', (p) => on.projector(p));
    s.on('test-pattern', (p) => on.testPattern(Boolean(p?.on)));
    s.on('order', (o) => on.order(o));
  });

  refetch.now(); // first paint without waiting for the socket

  return {
    reportStatus(state, detail) {
      const s = socket();
      if (s?.connected) s.emit('status', detail ? { state, detail: String(detail).slice(0, 300) } : { state });
    },
    async fetchOrder(orderId) {
      try {
        return orderFrom(await getJson('/api/player/bootstrap', headers), orderId);
      } catch {
        return null;
      }
    },
  };
}

export function openPreview(tableId, on) {
  const demo = demoTransport();
  if (demo?.openPreview) return demo.openPreview(tableId, on);

  const id = encodeURIComponent(tableId);
  const refetch = debounce(async () => {
    try {
      on.bootstrap(await getJson(`/api/tables/${id}/preview-bootstrap`));
    } catch (err) {
      if (err.status === 401) on.fatal('login');
      else if (err.status === 403 || err.status === 404) on.fatal('missing');
    }
  }, 250);

  connect(on, '/live', {}, (s) => {
    // Catch up on anything missed while disconnected.
    s.on('connect', () => {
      on.online(true);
      refetch();
    });
    s.on('connect_error', () => on.online(false));
    // Preview only follows; it never acks (the real projector does).
    s.on('scene', (p) => {
      if (String(p?.tableId) === String(tableId)) on.scene(p.scene);
    });
    s.on('order', (o) => on.order(o));
    for (const event of ['menu:changed', 'settings:changed', 'floor:changed']) s.on(event, refetch);
  });

  refetch.now();

  return {
    reportStatus() {},
    async fetchOrder(orderId) {
      try {
        return orderFrom(await getJson(`/api/tables/${id}/preview-bootstrap`), orderId);
      } catch {
        return null;
      }
    },
  };
}
