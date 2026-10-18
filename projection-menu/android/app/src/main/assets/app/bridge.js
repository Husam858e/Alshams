// Requests from the app's local pages to the native side, over the
// "AndroidApp" web-message channel (androidx.webkit addWebMessageListener).
// Native injects AndroidApp only into pages served from
// https://appassets.androidplatform.net, so server pages never get it.
//
// Every request carries a string "id" and native answers the sending frame
// with the same id. In a desktop browser (no AndroidApp) a mock stands in so
// the pages can be developed and tested without a device.
//
// Requests → replies (native: AppBridge.kt):
//   getState                       → state {config: null | {mode: 'APP'|'PLAYER', url, hasPin, kiosk, launcher, label,
//                                                             firebase: null | {apiKey, projectId, …}},
//                                            appVersion, webViewVersion, webViewSupported, isTv, hasCamera, debug}
//   validateLink {url}             → validated {ok, mode, normalizedUrl} | {ok: false, error}
//   discover {timeoutMs}           → servers {servers: [{name, host, port, url}], error?}
//   scanQr                         → scanResult {text} | scanCancelled
//   saveConfig {url, pin, kiosk, launcher, label, firebase} → saved (then native opens url)
//   startDemo | resume             → ok (then native navigates)
//   openSettings {reason?}         → ok (then native asks for the PIN if set, and opens setup;
//                                        reason 'unpaired' opens it as setup.html?unpaired=1)
//   resetConfig                    → state
// Any request may instead get {type: 'error', message} (Arabic).
//
// Cloud mode: url is a bundled page, https://appassets.androidplatform.net/cloud/app.html
// or …/cloud/player.html?device=<key> (plus ?emulators=<host> in debug builds only),
// and firebase the project config pasted in setup (null: the APK's built-in one,
// cloud/firebase-config.js). The cloud pages read it back with getState. While
// the staff app or a player is shown (cloud pages included), native only answers
// getState, resume and openSettings: those pages render restaurant data, and
// must not reach the settings past the PIN.
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
  // mDNS search for servers on the LAN; native answers once the time is up.
  discover: (timeoutMs) => request('discover', { timeoutMs }, { timeoutMs: timeoutMs + 5000 }),
  scanQr: () => request('scanQr', {}, { timeoutMs: 0 }),
  // { url, pin: null | '' | '4-8 digits', kiosk, launcher, label, firebase? } → native then opens the page.
  // pin null (or missing) keeps the saved PIN, '' removes it. label: shown in setup later.
  // firebase: the cloud project config (cloud pages only; null = built in).
  saveConfig: (config) => request('saveConfig', config),
  startDemo: () => request('startDemo'),
  resume: () => request('resume'),
  resetConfig: () => request('resetConfig'),
  // Native may ask for the PIN first; it navigates away on success.
  // reason 'unpaired': a cloud projector lost its pairing (setup opens on the code).
  openSettings: (reason) => request('openSettings', reason ? { reason } : {}, { timeoutMs: 0 }),
};
