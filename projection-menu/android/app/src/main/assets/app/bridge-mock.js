// Desktop stand-in for the native bridge, used only when window.AndroidApp
// is missing (a normal browser): the config lives in localStorage and
// "native navigation" is a plain location change. Lets the local pages be
// developed and tested without a device.
//
// Query flags for trying UI variants: ?mock-camera=0  ?mock-tv=1  ?mock-webview=80

const STORAGE_KEY = 'projection-menu:mock-config';
const MIN_WEBVIEW = 89; // import maps (used by the demo player)
const UNKNOWN_LINK = 'الرابط غير معروف — انسخه أو امسحه من لوحة التحكم';

const flags = new URLSearchParams(location.search);
let memory = null; // fallback when storage is disabled

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? null;
  } catch {
    return memory;
  }
}

function storeConfig(config) {
  memory = config;
  try {
    if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the in-memory copy lasts for this page.
  }
}

// Same rules as PairingLink.parse on the native side.
export function parseLink(raw) {
  let text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'الصق الرابط أولاً' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `http://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: 'الرابط غير صالح' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'الرابط يجب أن يبدأ بـ http أو https' };
  if (!url.hostname) return { ok: false, error: 'عنوان الخادم مفقود في الرابط' };

  const path = url.pathname;
  const params = url.searchParams;
  if (path.startsWith('/tablet')) {
    if (!params.get('table') || !params.get('key')) return { ok: false, error: 'رابط التابلت ناقص (table و key)' };
    return { ok: true, mode: 'TABLET', normalizedUrl: url.href };
  }
  if (path.startsWith('/player')) {
    if (!params.get('projector') || !params.get('key')) return { ok: false, error: 'رابط جهاز العرض ناقص (projector و key)' };
    return { ok: true, mode: 'PLAYER', normalizedUrl: url.href };
  }
  if (path === '' || path === '/' || path.startsWith('/admin')) {
    return { ok: true, mode: 'ADMIN', normalizedUrl: `${url.protocol}//${url.host}/admin/` };
  }
  return { ok: false, error: UNKNOWN_LINK };
}

function webViewInfo() {
  const version = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? '0';
  const major = Number(flags.get('mock-webview') ?? version.split('.')[0]);
  return { webViewVersion: flags.has('mock-webview') ? `${major}.0.0.0` : version, webViewSupported: major >= MIN_WEBVIEW };
}

// Navigation happens after the reply, like native does.
const navigate = (url) => setTimeout(() => window.top.location.assign(url), 150);

export function createMockBridge() {
  const state = () => {
    const config = loadConfig();
    return {
      type: 'state',
      config: config && {
        mode: config.mode,
        url: config.url,
        hasPin: Boolean(config.hasPin),
        kiosk: Boolean(config.kiosk),
        launcher: Boolean(config.launcher),
      },
      appVersion: '0.1.0 (محاكاة المتصفح)',
      ...webViewInfo(),
      isTv: flags.get('mock-tv') === '1',
      hasCamera: flags.get('mock-camera') !== '0',
    };
  };

  const handlers = {
    getState: () => state(),
    validateLink: (msg) => {
      const result = parseLink(msg.url);
      return result.ok ? { type: 'validated', ...result } : { type: 'validated', ok: false, error: result.error };
    },
    // No camera here: the "scanned" text is typed into a prompt.
    scanQr: () => {
      const text = window.prompt('محاكاة مسح رمز QR — الصق نص الرمز:');
      return text ? { type: 'scanResult', text } : { type: 'scanCancelled' };
    },
    saveConfig: (msg) => {
      const link = parseLink(msg.url);
      if (!link.ok) return { type: 'error', message: link.error };
      if (msg.pin && !/^\d{4,8}$/.test(msg.pin)) return { type: 'error', message: 'رمز PIN يجب أن يكون من 4 إلى 8 أرقام' };
      storeConfig({
        mode: link.mode,
        url: link.normalizedUrl,
        hasPin: Boolean(msg.pin),
        kiosk: Boolean(msg.kiosk) && link.mode !== 'ADMIN',
        launcher: Boolean(msg.launcher),
      });
      navigate(link.normalizedUrl);
      return { type: 'saved' };
    },
    startDemo: () => {
      navigate('/demo/index.html');
      return { type: 'ok' };
    },
    resume: () => {
      const config = loadConfig();
      if (!config) return { type: 'error', message: 'لا يوجد إعداد محفوظ' };
      navigate(config.url);
      return { type: 'ok' };
    },
    resetConfig: () => {
      storeConfig(null);
      return state();
    },
    openSettings: () => {
      navigate('/app/setup.html');
      return { type: 'ok' };
    },
  };

  return {
    async handle(msg) {
      await new Promise((resolve) => setTimeout(resolve, 60)); // replies are async on a device too
      const handler = handlers[msg.type];
      const reply = handler ? handler(msg) : { type: 'error', message: 'طلب غير معروف' };
      return { ...reply, id: msg.id };
    },
  };
}
