// Media URL policy and image preloading.

// Only files from the restaurant server ('/media/...') or local demo uploads
// ('blob:') are ever shown; anything else is treated as missing.
export function mediaUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('blob:')) return value;
  let url;
  try {
    url = new URL(value, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin || !url.pathname.startsWith('/media/')) return null;
  if (url.pathname.includes('..')) return null;
  return url.pathname + url.search;
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
