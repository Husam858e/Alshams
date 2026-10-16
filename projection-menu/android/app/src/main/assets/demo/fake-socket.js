// Stand-in for the Socket.IO client in the offline demo. demo/player.html's
// import map points '/socket.io/socket.io.esm.min.js' here, so the unchanged
// /player/player.js "connects" and gets its cues from the demo tablet frame
// (demo-backend.js) over a BroadcastChannel instead of from the server.
//
// Channel messages: {type:'cue', cue} in; {type:'ack', cueId, ok, error} and
// {type:'event', event, payload} (what player.js emits, e.g. 'cue:status') out.

import { CHANNEL, CONFIG_CUE, PROJECTOR } from './demo-data.js';

export function io(namespace, opts = {}) {
  const handlers = new Map();
  const channel = new BroadcastChannel(CHANNEL);
  const fire = (event, ...args) => {
    for (const fn of handlers.get(event) ?? []) fn(...args);
  };
  const deliver = (cue, ack) => fire('cue', cue, ack);

  const socket = {
    connected: false,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return socket;
    },
    emit(event, payload, ack) {
      channel.postMessage({ type: 'event', event, payload });
      ack?.({ ok: true });
      return socket;
    },
    close() {
      socket.connected = false;
      channel.close();
      return socket;
    },
  };

  // After the caller has registered its handlers, like a real connection.
  setTimeout(() => {
    const { projectorId, key } = opts.auth ?? {};
    if (namespace !== '/player' || String(projectorId) !== String(PROJECTOR.id) || key !== PROJECTOR.key) {
      fire('connect_error', new Error('unauthorized'));
      return;
    }
    socket.connected = true;
    fire('connect');
    // The server greets every player with its calibration, zones and idle loop.
    deliver({ ...CONFIG_CUE });
    channel.addEventListener('message', ({ data }) => {
      if (data?.type !== 'cue' || !socket.connected) return;
      deliver(data.cue, (result) => channel.postMessage({ type: 'ack', cueId: data.cue.cueId, ...result }));
    });
  }, 0);

  return socket;
}
