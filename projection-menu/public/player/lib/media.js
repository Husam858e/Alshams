// Media URL policy and image preloading.

// Only files from the restaurant server ('/media/...'), local demo uploads
// ('blob:') or, in cloud mode, the media library in Firebase Storage are ever
// shown; anything else is treated as missing.
export function mediaUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('blob:')) return value;
  let url;
  try {
    url = new URL(value, location.href);
  } catch {
    return null;
  }
  if (isStorageFile(url)) return url.href;
  if (url.origin !== location.origin || !url.pathname.startsWith('/media/')) return null;
  if (url.pathname.includes('..')) return null;
  return url.pathname + url.search;
}

// Cloud mode: a download URL of the library (media/<asset id>/<file>) in
// Firebase Storage, or in the Storage emulator a debug build was set up with
// (?emulators=<host> on the cloud page, or on the staff app around a preview).
const STORAGE_FILE = /^\/v0\/b\/[^/]+\/o\/media%2F\d+%2F[^/%]+$/;
const STORAGE_HOST = 'firebasestorage.googleapis.com';
const EMULATOR_PORT = '9199';

function isStorageFile(url) {
  if (!STORAGE_FILE.test(url.pathname) || url.searchParams.get('alt') !== 'media') return false;
  if (url.protocol === 'https:' && url.host === STORAGE_HOST) return true;
  return url.protocol === 'http:' && url.port === EMULATOR_PORT && url.hostname === emulatorHost();
}

function emulatorHost() {
  for (const win of [globalThis.window, globalThis.window?.parent]) {
    try {
      const host = win && new URLSearchParams(win.location.search).get('emulators');
      if (host) return host; // as URL.hostname writes it ([…] for IPv6)
    } catch {
      // another origin
    }
  }
  return null;
}

const loaded = new Map(); // url -> Promise<boolean>

// Resolves true when the image is decoded and ready, false when it is broken.
export function preloadImage(value) {
  const url = mediaUrl(value);
  if (!url) return Promise.resolve(false);
  if (!loaded.has(url)) {
    if (loaded.size > 120) loaded.clear(); // the HTTP cache keeps the bytes anyway
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    const done = img.decode().then(
      () => true,
      () => false,
    );
    loaded.set(url, done);
  }
  return loaded.get(url);
}

// Waits for all images, but never longer than `timeoutMs`: a slow file must
// not hold back a scene change the waiter is waiting to see.
export function preloadAll(urls, timeoutMs = 1500) {
  const list = [...new Set(urls.map(mediaUrl).filter(Boolean))];
  if (!list.length) return Promise.resolve();
  return Promise.race([
    Promise.allSettled(list.map(preloadImage)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
