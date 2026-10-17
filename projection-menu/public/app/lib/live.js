// Realtime staff channel: a thin wrapper over the Socket.IO '/live'
// namespace (authenticated by the session cookie). The rest of the app only
// uses onLive / onLiveStatus, so the offline demo can swap the socket module.

import { io } from '/socket.io/socket.io.esm.min.js';

const handlers = new Map(); // event -> Set(fn)
const statusListeners = new Set();
let socket = null;
let status = 'idle'; // idle | connecting | online | offline

function setStatus(next) {
  if (next === status) return;
  status = next;
  statusListeners.forEach((fn) => fn(status));
}

function dispatch(event, payload) {
  handlers.get(event)?.forEach((fn) => {
    try {
      fn(payload);
    } catch (err) {
      console.error(err);
    }
  });
}

export function connectLive() {
  if (socket) return;
  setStatus('connecting');
  socket = io('/live', {
    withCredentials: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 6000,
  });
  socket.on('connect', () => {
    setStatus('online');
    dispatch('live:connected', {});
  });
  socket.on('disconnect', (reason) => {
    setStatus('offline');
    // The server ends the socket when the session was revoked or the role
    // changed; the app re-checks the session and reconnects (or logs out).
    if (reason === 'io server disconnect') dispatch('live:kicked', { reason });
  });
  socket.on('connect_error', (err) => {
    setStatus('offline');
    if (err?.message === 'unauthorized') dispatch('live:unauthorized', {});
  });
  socket.onAny((event, payload) => dispatch(event, payload));
}

export function disconnectLive() {
  socket?.disconnect();
  socket = null;
  setStatus('idle');
}

// Reconnect with the current cookie (after a role change, for example).
export function reconnectLive() {
  disconnectLive();
  connectLive();
}

export function onLive(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event)?.delete(fn);
}

export function liveStatus() {
  return status;
}

export function onLiveStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
