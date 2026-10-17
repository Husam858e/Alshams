// Desktop stand-in for the native bridge, used only when window.AndroidApp
// is missing (a normal browser): the config lives in localStorage and
// "native navigation" is a plain location change. Lets the local pages be
// developed and tested without a device.
//
// The setup page calls the server from https://appassets.androidplatform.net
// (CORS is granted to that origin only), so serve the assets under that origin
// as the device does, e.g. with Playwright's page.route().
//
// Query flags for trying UI variants:
//   ?mock-servers=مطعم الشمس@127.0.0.1:3000,192.168.1.20:3000   servers "found" by discover
//   ?mock-camera=0   ?mock-tv=1   ?mock-webview=80   ?mock-discover-error=1

const STORAGE_KEY = 'projection-menu:mock-config';
const MIN_WEBVIEW = 89; // import maps (used by the web UIs)
// Same texts as PairingLink.kt, so the browser shows what the device will.
const LINK_ERRORS = {
  empty: 'أدخل عنوان الخادم أو امسح رمز QR',
  malformed: 'العنوان غير صالح — تأكد من كتابته كاملاً',
  scheme: 'يجب أن يبدأ العنوان بـ http:// أو https://',
  host: 'العنوان لا يحتوي على اسم الخادم أو رقم IP',
  player: 'رابط جهاز العرض ناقص: يجب أن يحتوي على مفتاح الجهاز (device)',
  playerV1: 'هذا رابط جهاز عرض من النسخة السابقة — اربط الجهاز برمز الربط من تطبيق الموظفين',
  unknown: 'الرابط غير معروف — استخدم عنوان الخادم أو رمز QR من تطبيق الموظفين',
};
const DISCOVER_FAILED = 'تعذّر البحث في الشبكة — تأكد من اتصال الواي فاي أو اكتب العنوان يدوياً';

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
  const fail = (key) => ({ ok: false, error: LINK_ERRORS[key] });
  let text = String(raw ?? '').trim();
  if (!text) return fail('empty');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `http://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return fail('malformed');
  }
  if (url.username || url.password) return fail('malformed'); // user@host disguises the real host
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail('scheme');
  if (!url.hostname) return fail('host');

  const path = url.pathname.replace(/^\/{2,}/, '/');
  const under = (prefix) => path === prefix || path.startsWith(`${prefix}/`); // not /app.apk
  const param = (name) => Boolean(url.searchParams.get(name)?.trim());
  if (under('/player')) {
    if (param('device')) return { ok: true, mode: 'PLAYER', normalizedUrl: url.href };
    return fail(param('projector') && param('key') ? 'playerV1' : 'player');
  }
  if (path === '' || path === '/' || under('/app') || under('/admin') || under('/tablet')) {
    return { ok: true, mode: 'APP', normalizedUrl: `${url.protocol}//${url.host}/app/` };
  }
  return fail('unknown');
}

// "name@host:port" entries of ?mock-servers.
function mockServers() {
  return (flags.get('mock-servers') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.lastIndexOf('@');
      const name = at > 0 ? entry.slice(0, at) : 'Projection Menu';
      const [host, port = '3000'] = entry.slice(at + 1).split(':');
      return { name, host, port: Number(port), url: `http://${host}:${port}` };
    });
}

function webViewInfo() {
  const version = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? '0';
  const major = Number(flags.get('mock-webview') ?? version.split('.')[0]);
  return { webViewVersion: flags.has('mock-webview') ? `${major}.0.0.0` : version, webViewSupported: major >= MIN_WEBVIEW };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        label: config.label || '',
      },
      appVersion: '2.0.0 (محاكاة المتصفح)',
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
    // Native browses mDNS for timeoutMs; the mock answers sooner with ?mock-servers.
    discover: async (msg) => {
      await wait(Math.min(Number(msg.timeoutMs) || 4000, 1200));
      const servers = mockServers();
      const failed = flags.get('mock-discover-error') === '1' && servers.length === 0;
      return failed ? { type: 'servers', servers, error: DISCOVER_FAILED } : { type: 'servers', servers };
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
        hasPin: msg.pin == null ? Boolean(loadConfig()?.hasPin) : Boolean(msg.pin), // null keeps it
        kiosk: Boolean(msg.kiosk),
        launcher: Boolean(msg.launcher),
        label: String(msg.label || '').trim().slice(0, 80),
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
      if (!config) return { type: 'error', message: 'لا توجد إعدادات محفوظة على هذا الجهاز' };
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
      await wait(60); // replies are async on a device too
      const handler = handlers[msg.type];
      const reply = handler ? await handler(msg) : { type: 'error', message: 'طلب غير معروف' };
      return { ...reply, id: msg.id };
    },
  };
}
