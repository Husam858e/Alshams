// Cloud mode's media library without Firebase Storage (the default): the
// files live in Firestore itself, so a project on the free Spark plan needs
// nothing but Firestore. See "Media in Firestore" in docs/cloud-architecture.md.
//
//   upload   images are re-encoded in the browser first (longest side ≤ 1600 px,
//            WebP ~0.82); videos and GLB models go as they are, within limits.
//            The bytes are cut into ≤ 900 KB chunks, written as Firestore Bytes
//            to mediaChunks/{assetId}_{index}; the media doc comes last
//            ({storage: 'firestore', chunks, rev, …}), so nobody sees half a file.
//   display  every device keeps the files it has shown in the Cache API
//            ('pm-media-v1', keyed by asset id + rev): a file is read from
//            Firestore once per device, then from the cache, also offline. The
//            screens get blob: URLs; until a file is there its URL is null and
//            the host refreshes the screens when it arrives.
//
// No DOM needed: the tests run this in Node (no canvas: images are stored as
// they are unless an encoder is injected; the cache lives in memory).

import { Bytes, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { HttpError } from '../../demo/backend/validate.js';

// ── Limits and formats (one place; the security rules repeat the chunk ones) ──
export const MEDIA_CHUNKS = 'mediaChunks';
export const CHUNK_BYTES = 900 * 1024; // under Firestore's 1 MiB per document, with room for the fields
export const MAX_CHUNKS = 32; // firestore.rules: index < 32 (32 × 900 KB > the largest limit below)
export const LIMIT_MB = { image: 10, video: 20, model3d: 15 }; // stored size (images: after compression)
export const IMAGE_MAX_SIDE = 1600; // px, longest side (photos, covers, logos, backgrounds alike)
export const IMAGE_QUALITY = 0.82; // WebP (and the JPEG fallback)
export const CACHE_NAME = 'pm-media-v1';
const MB = 1024 * 1024;

// 'firestore' (default) or 'storage' (a project on Blaze that set `media: 'storage'`).
export const mediaMode = (config) => (config?.media === 'storage' ? 'storage' : 'firestore');
export const chunkId = (assetId, index) => `${assetId}_${index}`;
export const chunkCount = (size) => Math.max(1, Math.ceil(size / CHUNK_BYTES));
export const isFirestoreAsset = (asset) => asset?.storage === 'firestore';

const CANCELED = 'أُلغي الرفع';
const canceled = () => new HttpError(499, CANCELED);
const megabytes = (bytes) => (bytes / MB).toFixed(1);

// A file above its kind's limit -> HttpError 413 (Arabic, with what to do), else null.
export function limitError(kind, size) {
  const limit = LIMIT_MB[kind];
  if (!limit || size <= limit * MB) return null;
  const mb = megabytes(size);
  if (kind === 'video') {
    return new HttpError(413, `حجم الفيديو ${mb} ميغابايت، والحد الأقصى ${limit} ميغابايت. اختصر المقطع (10 إلى 20 ثانية تكفي على الطاولة) أو اضغطه بدقة أقل (مثلاً 720p) ثم ارفعه من جديد.`);
  }
  if (kind === 'model3d') {
    return new HttpError(413, `حجم المجسم ${mb} ميغابايت، والحد الأقصى ${limit} ميغابايت لملفات ‎.glb. صغّر الصور (الخامات) داخل المجسم أو قلّل تفاصيله ثم صدّره من جديد.`);
  }
  return new HttpError(413, `حجم الصورة ${mb} ميغابايت حتى بعد ضغطها، والحد الأقصى ${limit} ميغابايت. صغّر الصورة ثم ارفعها من جديد.`);
}

// ── Bytes <-> chunks ─────────────────────────────────────────────

// -> Uint8Array[] (views into `bytes`, each ≤ size; one empty chunk for no bytes)
export function splitBytes(bytes, size = CHUNK_BYTES) {
  if (!bytes.length) return [bytes];
  const parts = [];
  for (let at = 0; at < bytes.length; at += size) parts.push(bytes.subarray(at, Math.min(at + size, bytes.length)));
  return parts;
}

export function joinChunks(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Hex SHA-256 (the asset's `sha256`; its first 16 digits are the cache `rev`).
export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null; // not a secure context: the rev falls back to a random one
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const revOf = (sha) => (sha ? sha.slice(0, 16) : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

// ── Images: re-encoded in the browser before upload ──────────────

// The size an image is stored at: longest side ≤ max, never upscaled.
export function fitWithin(width, height, max = IMAGE_MAX_SIDE) {
  const side = Math.max(width, height);
  if (!(side > max)) return { width, height, scaled: false };
  const k = max / side;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

const EXT_OF = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' };
export const extOf = (mime) => EXT_OF[mime] ?? null;

// An encoder: (blob, mime) -> Promise<{blob, width, height, scaled} | null>
// (null: not decodable here; the file is stored as it is). The browser's,
// or null where there is no image decoder (Node: tests inject their own).
export function browserImageEncoder({ maxSide = IMAGE_MAX_SIDE, quality = IMAGE_QUALITY } = {}) {
  if (typeof createImageBitmap !== 'function') return null;
  const canvasOf = (width, height) => {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const encode = (canvas, type, q) =>
    canvas.convertToBlob ? canvas.convertToBlob({ type, quality: q }).catch(() => null) : new Promise((resolve) => canvas.toBlob(resolve, type, q));
  // Any pixel not fully opaque (PNG / WebP sources only; JPEG has no alpha).
  const hasAlpha = (g, width, height) => {
    const px = g.getImageData(0, 0, width, height).data;
    for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) return true;
    return false;
  };
  return async (blob, mime) => {
    let bitmap;
    try {
      bitmap = await createImageBitmap(blob); // EXIF orientation applied (and baked in)
    } catch {
      return null;
    }
    try {
      const size = fitWithin(bitmap.width, bitmap.height, maxSide);
      const canvas = canvasOf(size.width, size.height);
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(bitmap, 0, 0, size.width, size.height);
      const alpha = mime !== 'image/jpeg' && hasAlpha(g, size.width, size.height);
      let out = await encode(canvas, 'image/webp', quality); // keeps alpha
      // No WebP encoder (a browser that falls back to PNG): JPEG for photos, PNG for transparency.
      if (!out || out.type !== 'image/webp') out = alpha ? await encode(canvas, 'image/png') : await encode(canvas, 'image/jpeg', quality);
      return out ? { blob: out, width: size.width, height: size.height, scaled: size.scaled } : null;
    } finally {
      bitmap.close?.();
    }
  };
}

// What is stored for an uploaded image: the re-encoded one, or the original
// when nothing was gained (already small enough and not larger re-encoded).
// -> {blob, mime, ext, width, height}
export async function prepareImage(blob, mime, ext, encoder) {
  let out = null;
  try {
    out = encoder ? await encoder(blob, mime) : null;
  } catch (err) {
    console.warn('cloud: image not re-encoded, stored as uploaded', err); // e.g. out of memory on a huge image
  }
  const type = out?.blob?.type;
  if (!out || !extOf(type) || (!out.scaled && out.blob.size >= blob.size)) {
    return { blob, mime, ext, width: out?.width ?? null, height: out?.height ?? null };
  }
  return { blob: out.blob, mime: type, ext: extOf(type), width: out.width, height: out.height };
}

// ── Chunks in Firestore ──────────────────────────────────────────

const STALL_MS = 60 * 1000; // one chunk not acknowledged this long: the upload fails

function stalled(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(503, 'تعذّر رفع الملف: الاتصال بالإنترنت بطيء جداً أو مقطوع. أعد المحاولة.')), ms);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

// Writes the chunks of one asset (two at a time; each write resolves when the
// server has it). onProgress(written / total); an aborted `signal` stops at
// once with 499 (the caller deletes what was written: deletes sent after the
// writes are applied after them). -> number of chunks
export async function writeChunks(db, assetId, bytes, { onProgress = null, signal = null, concurrency = 2, stallMs = STALL_MS } = {}) {
  const parts = splitBytes(bytes);
  if (parts.length > MAX_CHUNKS) throw new HttpError(413, `الملف أكبر من ${megabytes(MAX_CHUNKS * CHUNK_BYTES)} ميغابايت`);
  if (signal?.aborted) throw canceled();
  let next = 0;
  let written = 0;
  let stop = false;
  const worker = async () => {
    while (!stop && next < parts.length) {
      const index = next++;
      const write = setDoc(doc(db, MEDIA_CHUNKS, chunkId(assetId, index)), { assetId, index, data: Bytes.fromUint8Array(parts[index]) });
      await stalled(write, stallMs);
      written += 1;
      if (!stop) onProgress?.(written / parts.length);
    }
  };
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => {
      stop = true;
      reject(canceled());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  const work = Promise.all(Array.from({ length: Math.min(concurrency, parts.length) }, worker));
  // Whichever loses the race must not become an unhandled rejection.
  work.catch(() => {
    stop = true;
  });
  aborted.catch(() => {});
  try {
    await Promise.race([work, aborted]);
  } finally {
    stop = true;
    signal?.removeEventListener('abort', onAbort);
  }
  return parts.length;
}

// The writes that delete an asset's chunks (for a batch / the replica's `extra`).
export function chunkDeletes(assetId, count) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({ op: 'delete', path: [MEDIA_CHUNKS, chunkId(assetId, index)] }));
}

// Deletes an asset's chunks in the background (queued while offline).
export function deleteChunks(db, assetId, count) {
  const batch = writeBatch(db);
  for (const w of chunkDeletes(assetId, count)) batch.delete(doc(db, ...w.path));
  return batch.commit().catch((err) => console.warn('cloud: media chunks not deleted', assetId, err));
}

// Reads one asset's chunks (a few at a time) -> Blob of the file.
export async function readAsset(db, asset, { parallel = 4 } = {}) {
  const count = Number(asset.chunks);
  if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) throw new Error(`media ${asset.id}: bad chunk count`);
  const parts = new Array(count);
  for (let from = 0; from < count; from += parallel) {
    const indexes = Array.from({ length: Math.min(parallel, count - from) }, (_, i) => from + i);
    const snaps = await Promise.all(indexes.map((index) => getDoc(doc(db, MEDIA_CHUNKS, chunkId(asset.id, index)))));
    snaps.forEach((snap, i) => {
      const data = snap.exists() ? snap.data() : null;
      if (!data || data.assetId !== asset.id || data.index !== indexes[i] || typeof data.data?.toUint8Array !== 'function') {
        throw new Error(`media ${asset.id}: chunk ${indexes[i]} missing`);
      }
      parts[indexes[i]] = data.data.toUint8Array();
    });
  }
  const bytes = joinChunks(parts);
  if (Number.isInteger(asset.size_bytes) && bytes.length !== asset.size_bytes) throw new Error(`media ${asset.id}: ${bytes.length} bytes, expected ${asset.size_bytes}`);
  return new Blob([bytes], { type: asset.mime_type || 'application/octet-stream' });
}

// ── Where files are kept on the device ───────────────────────────
// A store: {get(key) -> Blob|null, put(key, blob), delete(key), keys() -> key[]}

// The Cache API (survives restarts; per origin, so per app on Android).
export function cacheApiStore(name = CACHE_NAME) {
  if (typeof caches === 'undefined' || typeof Request === 'undefined' || typeof location === 'undefined') return null;
  const PREFIX = '/__pm-media/';
  let opened = null;
  const open = () => {
    if (!opened) opened = caches.open(name);
    return opened;
  };
  const request = (key) => new Request(new URL(`${PREFIX}${encodeURIComponent(key)}`, location.origin).href);
  return {
    async get(key) {
      const res = await (await open()).match(request(key));
      return res ? res.blob() : null;
    },
    async put(key, blob) {
      await (await open()).put(request(key), new Response(blob, { headers: { 'content-type': blob.type || 'application/octet-stream', 'content-length': String(blob.size) } }));
    },
    async delete(key) {
      await (await open()).delete(request(key));
    },
    async keys() {
      return (await (await open()).keys()).map((r) => decodeURIComponent(new URL(r.url).pathname.slice(PREFIX.length)));
    },
  };
}

// In memory (Node tests; browsers without the Cache API).
export function memoryStore() {
  const map = new Map();
  return {
    get: async (key) => map.get(key) ?? null,
    put: async (key, blob) => void map.set(key, blob),
    delete: async (key) => void map.delete(key),
    keys: async () => [...map.keys()],
    map,
  };
}

export const cacheKey = (asset) => `${asset.id}-${asset.rev ?? asset.size_bytes ?? 0}`;

// ── The media cache of one device ────────────────────────────────

const RETRY_MS = 30 * 1000; // a file that failed is tried again when asked after this
const NOTIFY_MS = 300; // loads finishing close together -> one refresh of the screens
const NOTIFY_MAX_MS = 1500; // ...but at least this often while files keep arriving
const KIND_ORDER = { image: 0, model3d: 1, video: 2 }; // small first: photos fill the screens soonest

// url(asset) is synchronous (the shared model needs it so): the blob: URL once
// the file is on this device, else null — and the file starts loading (cache,
// then Firestore). onReady(assets) is called (debounced) with the files that
// arrived, so the host re-renders the screens that show them.
//
// options: db, store (cacheApiStore() ?? memoryStore()), onReady, concurrency,
//          read(asset) -> Blob (default: readAsset from Firestore),
//          urls {create(blob), revoke(url)} (default: URL.createObjectURL / revokeObjectURL),
//          now()
export function createMediaCache({ db, store = cacheApiStore() ?? memoryStore(), onReady = () => {}, concurrency = 2, read = (asset) => readAsset(db, asset), urls = null, now = () => Date.now() } = {}) {
  const createUrl = urls?.create ?? ((blob) => URL.createObjectURL(blob));
  const revokeUrl = urls?.revoke ?? ((url) => URL.revokeObjectURL(url));
  const entries = new Map(); // cacheKey -> {asset, status: 'queued'|'loading'|'ready'|'failed', url, failedAt}
  // Files this device just uploaded, kept until the library lists them (a
  // sync running between the upload and its library entry must not drop them).
  const fresh = new Set();
  const queue = [];
  let active = 0;
  let closed = false;
  let notifyTimer = null;
  let firstPending = 0;
  const waiters = new Set(); // idle() promises

  let arrived = []; // assets loaded since the last onReady

  function notify(asset) {
    if (closed) return;
    arrived.push(asset);
    const t = now();
    if (!notifyTimer) firstPending = t;
    clearTimeout(notifyTimer);
    const wait = Math.max(0, Math.min(NOTIFY_MS, firstPending + NOTIFY_MAX_MS - t));
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      const list = arrived;
      arrived = [];
      if (!closed) onReady(list);
    }, wait);
    notifyTimer.unref?.();
  }

  function settleIdle() {
    if (active || queue.length) return;
    for (const resolve of [...waiters]) resolve();
    waiters.clear();
  }

  function pump() {
    while (!closed && active < concurrency && queue.length) {
      queue.sort((a, b) => (KIND_ORDER[a.asset.kind] ?? 9) - (KIND_ORDER[b.asset.kind] ?? 9));
      const entry = queue.shift();
      if (entries.get(cacheKey(entry.asset)) !== entry) continue; // forgotten meanwhile
      active += 1;
      entry.status = 'loading';
      load(entry).finally(() => {
        active -= 1;
        pump();
        settleIdle();
      });
    }
    settleIdle();
  }

  async function load(entry) {
    const key = cacheKey(entry.asset);
    try {
      let blob = await store.get(key).catch(() => null);
      if (!blob) {
        blob = await read(entry.asset);
        await store.put(key, blob).catch((err) => console.warn('cloud: media not kept on this device', key, err));
      }
      if (closed || entries.get(key) !== entry) return;
      entry.url = createUrl(blob);
      entry.status = 'ready';
      notify(entry.asset);
    } catch (err) {
      if (closed || entries.get(key) !== entry) return;
      entry.status = 'failed';
      entry.failedAt = now();
      if (err?.code !== 'unavailable') console.warn('cloud: media file not loaded', key, err?.code ?? err?.message ?? err);
    }
  }

  function enqueue(asset) {
    const key = cacheKey(asset);
    let entry = entries.get(key);
    if (!entry) {
      entry = { asset, status: 'queued', url: null, failedAt: 0 };
      entries.set(key, entry);
    } else entry.status = 'queued';
    queue.push(entry);
    pump();
  }

  function url(asset) {
    if (!asset) return null;
    if (!isFirestoreAsset(asset)) return asset.url ?? null; // Storage / server URL as stored
    if (closed) return null;
    const entry = entries.get(cacheKey(asset));
    if (entry?.status === 'ready') return entry.url;
    if (!entry || (entry.status === 'failed' && now() - entry.failedAt >= RETRY_MS)) enqueue(asset);
    return null;
  }

  return {
    url,
    // Starts loading every file of `assets` (a projector: all it may show).
    prefetch(assets) {
      for (const a of assets) url(a);
    },
    // The uploading device has the bytes already: ready at once, kept for later.
    async put(asset, blob) {
      if (closed || !isFirestoreAsset(asset)) return;
      const key = cacheKey(asset);
      const old = entries.get(key);
      if (old?.url) revokeUrl(old.url);
      entries.set(key, { asset, status: 'ready', url: createUrl(blob), failedAt: 0 });
      fresh.add(key);
      await store.put(key, blob).catch((err) => console.warn('cloud: media not kept on this device', key, err));
    },
    // The library changed: URLs of files that are gone (or replaced) are
    // revoked. `complete` (a list confirmed by the server, not just the local
    // cache): files of this device's cache that are gone are dropped too.
    async sync(assets, { complete = false } = {}) {
      const live = new Set(assets.filter(isFirestoreAsset).map(cacheKey));
      for (const key of [...fresh]) {
        if (live.has(key)) fresh.delete(key);
        else live.add(key);
      }
      for (const [key, entry] of [...entries]) {
        if (live.has(key)) continue;
        if (entry.url) revokeUrl(entry.url);
        entries.delete(key);
      }
      if (!complete || closed) return;
      try {
        for (const key of await store.keys()) if (!live.has(key)) await store.delete(key);
      } catch (err) {
        console.warn('cloud: media cache not cleaned', err);
      }
    },
    // Back online: files that failed are tried again (the screens refresh when they arrive).
    retry() {
      for (const entry of entries.values()) if (entry.status === 'failed') enqueue(entry.asset);
    },
    // Resolves when nothing is loading (tests, diagnostics).
    idle() {
      if (!active && !queue.length) return Promise.resolve();
      return new Promise((resolve) => waiters.add(resolve));
    },
    status: (asset) => entries.get(cacheKey(asset))?.status ?? null,
    close() {
      closed = true;
      clearTimeout(notifyTimer);
      for (const entry of entries.values()) if (entry.url) revokeUrl(entry.url);
      entries.clear();
      queue.length = 0;
      for (const resolve of [...waiters]) resolve();
      waiters.clear();
    },
  };
}

// Every file a projector may show: dish photos / videos / models, category
// covers, the logo and the theme background (what it prefetches to work offline).
export function referencedAssets(s) {
  const ids = new Set();
  for (const d of s.dishes) for (const k of ['image_asset_id', 'video_asset_id', 'model_asset_id']) if (d[k]) ids.add(d[k]);
  for (const c of s.categories) if (c.cover_asset_id) ids.add(c.cover_asset_id);
  const { general, theme } = s.settings;
  if (general?.logoAssetId) ids.add(general.logoAssetId);
  if (theme?.background?.type !== 'preset' && theme?.background?.assetId) ids.add(theme.background.assetId);
  return s.assets.filter((a) => ids.has(a.id));
}
