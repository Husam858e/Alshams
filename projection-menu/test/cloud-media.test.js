// Cloud mode's media in Firestore (assets/cloud/backend/media.js), without
// the emulators: chunking and reassembly, image sizing, limits, the device's
// media cache (blob URLs, the Cache API store, refresh, cleanup), and the
// player's URL policy for those blob URLs. Firestore reads and writes of the
// chunks run on the emulators (test/cloud/backend.test.js).

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const load = (...p) => import(pathToFileURL(path.join(...p)).href);
const media = await load(ASSETS, 'cloud', 'backend', 'media.js');
const MB = 1024 * 1024;

const bytesOf = (n, seed = 7) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('files are cut into ≤ 900 KB chunks and put back together byte for byte', () => {
  const { CHUNK_BYTES, splitBytes, joinChunks, chunkCount } = media;
  assert.equal(CHUNK_BYTES, 900 * 1024);
  for (const size of [1, 1000, CHUNK_BYTES - 1, CHUNK_BYTES, CHUNK_BYTES + 1, 3 * CHUNK_BYTES + 5, Math.round(19.9 * MB)]) {
    const bytes = bytesOf(size);
    const parts = splitBytes(bytes);
    assert.equal(parts.length, chunkCount(size), `chunks of ${size}`);
    assert.ok(parts.every((p) => p.length > 0 && p.length <= CHUNK_BYTES));
    assert.deepEqual(joinChunks(parts), bytes);
  }
  // The largest allowed file fits the chunk limit of the security rules.
  assert.ok(media.chunkCount(media.LIMIT_MB.video * MB) <= media.MAX_CHUNKS);
  assert.equal(media.chunkId(12, 3), '12_3');
  assert.deepEqual(media.chunkDeletes(5, 2), [
    { op: 'delete', path: ['mediaChunks', '5_0'] },
    { op: 'delete', path: ['mediaChunks', '5_1'] },
  ]);
});

test('images: longest side at most 1600 px, never upscaled', () => {
  const { fitWithin } = media;
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200, scaled: true });
  assert.deepEqual(fitWithin(1200, 4800), { width: 400, height: 1600, scaled: true });
  assert.deepEqual(fitWithin(1600, 900), { width: 1600, height: 900, scaled: false });
  assert.deepEqual(fitWithin(320, 240), { width: 320, height: 240, scaled: false });
});

test('the re-encoded image is stored, unless the original is small and better', async () => {
  const { prepareImage } = media;
  const original = new Blob([bytesOf(5000)], { type: 'image/jpeg' });
  const smaller = { blob: new Blob([bytesOf(900)], { type: 'image/webp' }), width: 1600, height: 1200, scaled: true };
  const out = await prepareImage(original, 'image/jpeg', '.jpg', async () => smaller);
  assert.deepEqual([out.mime, out.ext, out.width, out.height, out.blob.size], ['image/webp', '.webp', 1600, 1200, 900]);
  // Not resized and not smaller: the original stays (with the decoded size).
  const larger = { blob: new Blob([bytesOf(9000)], { type: 'image/webp' }), width: 300, height: 200, scaled: false };
  const kept = await prepareImage(original, 'image/jpeg', '.jpg', async () => larger);
  assert.deepEqual([kept.blob, kept.mime, kept.ext, kept.width], [original, 'image/jpeg', '.jpg', 300]);
  // No encoder (Node) or an undecodable file: stored as uploaded.
  assert.equal((await prepareImage(original, 'image/jpeg', '.jpg', null)).blob, original);
  assert.equal((await prepareImage(original, 'image/jpeg', '.jpg', async () => null)).blob, original);
  // No WebP encoder: the fallback types keep their extension.
  const png = await prepareImage(original, 'image/png', '.png', async () => ({ blob: new Blob([bytesOf(10)], { type: 'image/png' }), width: 10, height: 10, scaled: true }));
  assert.equal(png.ext, '.png');
  assert.equal(media.browserImageEncoder(), null, 'no image decoder in Node');
});

test('size limits: video 20 MB, GLB 15 MB, with Arabic advice', () => {
  const { limitError, LIMIT_MB } = media;
  assert.deepEqual(LIMIT_MB, { image: 10, video: 20, model3d: 15 });
  assert.equal(limitError('video', 20 * MB), null);
  const video = limitError('video', 25.3 * MB);
  assert.equal(video.status, 413);
  assert.match(video.message, /25\.3 ميغابايت/);
  assert.match(video.message, /الحد الأقصى 20 ميغابايت/);
  assert.match(video.message, /اختصر المقطع|اضغطه/);
  assert.equal(limitError('model3d', 15 * MB), null);
  assert.match(limitError('model3d', 16 * MB).message, /الحد الأقصى 15 ميغابايت/);
  assert.match(limitError('image', 11 * MB).message, /الحد الأقصى 10 ميغابايت/);
});

test('the cache rev comes from the file content', async () => {
  const sha = await media.sha256Hex(new TextEncoder().encode('abc'));
  assert.equal(sha, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(media.revOf(sha), 'ba7816bf8f01cfea');
  assert.match(media.revOf(null), /^r[0-9a-z]+$/);
});

// A media cache over a fake Firestore read and fake blob URLs.
function harness({ store = media.memoryStore(), fail = new Set() } = {}) {
  const reads = [];
  const files = new Map();
  let made = 0;
  const revoked = [];
  const ready = [];
  const cache = media.createMediaCache({
    store,
    read: async (asset) => {
      reads.push(asset.id);
      await sleep(5);
      if (fail.has(asset.id)) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      return files.get(asset.id) ?? new Blob([bytesOf(asset.size_bytes, asset.id)], { type: asset.mime_type });
    },
    urls: { create: () => `blob:https://appassets.androidplatform.net/0000000${++made}-0000-4000-8000-000000000000`, revoke: (u) => revoked.push(u) },
    onReady: (list) => ready.push(list.map((a) => a.id)),
  });
  return { cache, store, reads, revoked, ready, files, fail };
}
const asset = (id, extra = {}) => ({ id, kind: 'image', storage: 'firestore', chunks: 1, rev: `rev${id}`, size_bytes: 100 + id, mime_type: 'image/webp', url: null, ...extra });

test('media cache: null while loading, then a blob URL and one refresh of the screens', async () => {
  const h = harness();
  const a = asset(1);
  const b = asset(2, { kind: 'video', mime_type: 'video/webm' });
  assert.equal(h.cache.url(a), null, 'not there yet');
  assert.equal(h.cache.url(b), null);
  assert.equal(h.cache.url(a), null, 'asked again while loading: no second read');
  await h.cache.idle();
  assert.deepEqual(h.reads.sort(), [1, 2]);
  assert.match(h.cache.url(a), /^blob:/);
  assert.notEqual(h.cache.url(a), h.cache.url(b));
  await sleep(400);
  assert.deepEqual(h.ready.map((l) => l.sort()), [[1, 2]], 'one debounced refresh for files arriving together');
  // Stored on the device: a new cache (a restart) reads nothing from Firestore.
  const again = harness({ store: h.store });
  again.cache.url(a);
  await again.cache.idle();
  assert.deepEqual(again.reads, []);
  assert.match(again.cache.url(a), /^blob:/);
  assert.deepEqual((await h.store.keys()).sort(), ['1-rev1', '2-rev2']);
  // Files elsewhere (Storage, the server) keep their own URL.
  assert.equal(h.cache.url({ id: 9, url: 'https://firebasestorage.googleapis.com/x' }), 'https://firebasestorage.googleapis.com/x');
  assert.equal(h.cache.url(null), null);
});

test('media cache: the uploading device has the file at once', async () => {
  const h = harness();
  const a = asset(3);
  await h.cache.put(a, new Blob([bytesOf(10)], { type: 'image/webp' }));
  assert.match(h.cache.url(a), /^blob:/);
  assert.deepEqual(h.reads, []);
  assert.deepEqual(await h.store.keys(), ['3-rev3']);
  // A library update that does not list it yet (its entry is being written) keeps it.
  await h.cache.sync([], { complete: true });
  assert.match(h.cache.url(a), /^blob:/);
  assert.deepEqual(await h.store.keys(), ['3-rev3']);
  await h.cache.sync([a], { complete: true });
  await h.cache.sync([], { complete: true });
  assert.deepEqual(await h.store.keys(), [], 'deleted later like any file');
});

test('media cache: deleted or replaced files are revoked and dropped from the device', async () => {
  const h = harness();
  const a = asset(4);
  const b = asset(5);
  h.cache.prefetch([a, b]);
  await h.cache.idle();
  const urlA = h.cache.url(a);
  // Only from the local cache: nothing is deleted from the device yet.
  await h.cache.sync([b], { complete: false });
  assert.deepEqual(h.revoked, [urlA]);
  assert.deepEqual((await h.store.keys()).sort(), ['4-rev4', '5-rev5']);
  // Confirmed by the server: gone from the device too.
  await h.cache.sync([b], { complete: true });
  assert.deepEqual(await h.store.keys(), ['5-rev5']);
  // A new revision of a file is a new cache entry.
  const b2 = { ...b, rev: 'rev5b' };
  await h.cache.sync([b2], { complete: true });
  assert.equal(h.cache.url(b2), null);
  await h.cache.idle();
  assert.match(h.cache.url(b2), /^blob:/);
  h.cache.close();
  assert.equal(h.revoked.length, 3, 'close() revokes what is left');
});

test('media cache: a failed load is retried when back online', async () => {
  const h = harness({ fail: new Set([6]) });
  const a = asset(6);
  assert.equal(h.cache.url(a), null);
  await h.cache.idle();
  assert.equal(h.cache.status(a), 'failed');
  assert.equal(h.cache.url(a), null, 'not hammered on every render');
  assert.deepEqual(h.reads, [6]);
  h.fail.clear();
  h.cache.retry();
  await h.cache.idle();
  assert.match(h.cache.url(a), /^blob:/);
  await sleep(400);
  assert.deepEqual(h.ready, [[6]]);
});

test('media cache: photos load before videos', async () => {
  const order = [];
  const cache = media.createMediaCache({
    store: media.memoryStore(),
    concurrency: 1,
    read: async (a) => {
      order.push(a.id);
      return new Blob(['x']);
    },
    urls: { create: () => 'blob:x', revoke: () => {} },
  });
  cache.prefetch([asset(10, { kind: 'video' }), asset(11, { kind: 'model3d' }), asset(12), asset(13)]);
  await cache.idle();
  assert.deepEqual(order.slice(1), [12, 13, 11], 'after the one already started: images, then models, then videos');
  cache.close();
});

test('a projector prefetches every file its menu and settings use', () => {
  const s = {
    assets: [1, 2, 3, 4, 5, 6, 7].map((id) => asset(id)),
    dishes: [{ image_asset_id: 1, video_asset_id: 2, model_asset_id: null }],
    categories: [{ cover_asset_id: 3 }],
    settings: { general: { logoAssetId: 4 }, theme: { background: { type: 'video', assetId: 5 } } },
  };
  assert.deepEqual(media.referencedAssets(s).map((a) => a.id), [1, 2, 3, 4, 5]);
  s.settings.theme.background.type = 'preset';
  assert.deepEqual(media.referencedAssets(s).map((a) => a.id), [1, 2, 3, 4]);
});

test('the shared model takes media URLs from the host (cloud) or the row (demo, server)', async () => {
  const { createModel } = await load(ASSETS, 'demo', 'backend', 'model.js');
  const s = {
    assets: [{ id: 1, url: '/media/a.jpg' }, asset(2)],
    dishes: [{ id: 1, sort_order: 0, image_asset_id: 1, video_asset_id: 2, model_asset_id: null, is_available: true, category_id: null }],
    categories: [],
    settings: { general: { logoAssetId: 2 }, theme: { background: { type: 'preset' } } },
  };
  const demo = createModel(s);
  assert.equal(demo.dto.dish(s.dishes[0]).image_url, '/media/a.jpg');
  assert.equal(demo.dto.dish(s.dishes[0]).video_url, null);
  const cloud = createModel(s, { assetUrl: (a) => (a.storage === 'firestore' ? `blob:x/${a.id}` : a.url) });
  assert.equal(cloud.dto.dish(s.dishes[0]).video_url, 'blob:x/2');
  assert.equal(cloud.dto.settings().logo_url, 'blob:x/2');
});

test('the media mode: Firestore unless the project config says storage', async () => {
  assert.equal(media.mediaMode({}), 'firestore');
  assert.equal(media.mediaMode({ media: 'storage' }), 'storage');
  const { validateFirebaseConfig, parseFirebaseConfig } = await load(ASSETS, 'cloud', 'config.js');
  const base = { apiKey: 'k', projectId: 'demo-pm', appId: '1:2:web:3', storageBucket: 'b' };
  assert.equal(validateFirebaseConfig(base).media, undefined);
  assert.equal(validateFirebaseConfig({ ...base, media: 'firestore' }).media, undefined);
  assert.equal(validateFirebaseConfig({ ...base, media: 'storage' }).media, 'storage');
  assert.throws(() => validateFirebaseConfig({ ...base, media: 's3' }), /media/);
  assert.equal(parseFirebaseConfig('const firebaseConfig = { apiKey: "k", projectId: "demo-pm", appId: "1:2:web:3", storageBucket: "b", media: "storage" };').media, 'storage');
});

test('the player shows blob: URLs of its own origin only', async (t) => {
  const ORIGIN = 'https://appassets.androidplatform.net';
  globalThis.location = new URL(`${ORIGIN}/cloud/player.html?device=p1`);
  globalThis.window = { location: globalThis.location, parent: null };
  t.after(() => {
    delete globalThis.location;
    delete globalThis.window;
  });
  const { mediaUrl } = await load(ROOT, 'public', 'player', 'lib', 'media.js');
  const own = `blob:${ORIGIN}/6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b`;
  assert.equal(mediaUrl(own), own);
  for (const bad of [
    'blob:https://evil.example/6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b',
    'blob:http://appassets.androidplatform.net/6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b',
    'blob:null/6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b',
    `blob:${ORIGIN}/../media/x`,
    `blob:${ORIGIN}/6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b?x=1`,
    'blob:',
  ]) {
    assert.equal(mediaUrl(bad), null, bad);
  }
});
