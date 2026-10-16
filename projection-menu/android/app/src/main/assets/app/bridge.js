// Requests from the app's local pages to the native side, over the
// "AndroidApp" web-message channel (androidx.webkit addWebMessageListener).
// Native injects AndroidApp only into pages served from
// https://appassets.androidplatform.net, so server pages never get it.
//
// Every request carries a string "id" and native answers the sending frame
// with the same id. In a desktop browser (no AndroidApp) a mock stands in so
// the pages can be developed and tested without a device.
//
// Keep this file to Chrome 80 syntax: on an outdated WebView the setup page
// must still run far enough to say so.

const native = window.AndroidApp || null;
const pending = new Map();
let seq = 0;

if (native) {
  native.onmessage = (event) => {
    let reply;
    try {
      reply = JSON.parse(event.data);
    } catch {
      return;
    }
    const entry = pending.get(reply?.id);
    if (!entry) return;
    pending.delete(reply.id);
    clearTimeout(entry.timer);
    entry.resolve(reply);
  };
}

// The mock is only ever loaded when the native bridge is missing.
let mock = null;
function getMock() {
  if (!mock) mock = import('./bridge-mock.js').then((m) => m.createMockBridge());
  return mock;
}

export const isNative = Boolean(native);

export class BridgeError extends Error {}

// Sends one request and resolves with the reply; {type: 'error'} replies
// reject with a BridgeError carrying native's (Arabic) message.
// timeoutMs = 0 waits forever (QR scanner, PIN dialog).
export async function request(type, payload = {}, { timeoutMs = 15000 } = {}) {
  const msg = { ...payload, type, id: `${Date.now().toString(36)}-${++seq}` };
  const reply = native ? await send(msg, timeoutMs) : await (await getMock()).handle(msg);
  if (reply.type === 'error') throw new BridgeError(reply.message || 'حدث خطأ غير متوقع');
  return reply;
}

function send(msg, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            pending.delete(msg.id);
            reject(new BridgeError('لم يستجب التطبيق، أعد المحاولة'));
          }, timeoutMs)
        : null;
    pending.set(msg.id, { resolve, timer });
    native.postMessage(JSON.stringify(msg));
  });
}

export const bridge = {
  getState: () => request('getState'),
  validateLink: (url) => request('validateLink', { url }),
  scanQr: () => request('scanQr', {}, { timeoutMs: 0 }),
  // { url, pin: '' | '4-8 digits', kiosk, launcher } → native then opens the page.
  saveConfig: (config) => request('saveConfig', config),
  startDemo: () => request('startDemo'),
  resume: () => request('resume'),
  resetConfig: () => request('resetConfig'),
  // Native may ask for the PIN first; it navigates away on success.
  openSettings: () => request('openSettings', {}, { timeoutMs: 0 }),
};
