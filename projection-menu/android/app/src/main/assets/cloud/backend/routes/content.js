// Cloud mode's media library uploads and deletes, with the same checks as the
// server. Where the bytes go depends on the project (media.js mediaMode):
//
//   firestore (default, free Spark plan)  images re-encoded in the browser,
//     then every file in ≤ 900 KB chunks in mediaChunks/, the media doc last;
//     delete = the doc and its chunks in one batch.
//   storage (`media: 'storage'` in the config, Blaze plan)  Firebase Storage
//     media/{assetId}/{file}, cached for a year: a file never changes under
//     its URL; delete = the doc, then the Storage object.
//
// A library entry keeps where its file is (`storage: 'firestore'` or a
// `storage_path`), so deleting works whatever the project uses today.

import { contentTeam } from '../../../demo/backend/roles.js';
import { probe } from '../../../demo/backend/probe.js';
import { inspectUpload } from '../../../demo/backend/routes/menu.js';
import { HttpError, str } from '../../../demo/backend/validate.js';
import { NETWORK_ERROR, httpErrorOf } from '../firebase.js';
import { chunkCount, chunkDeletes, deleteChunks, isFirestoreAsset, limitError, prepareImage, revOf, sha256Hex, writeChunks } from '../media.js';

const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const CANCELED = 'أُلغي الرفع';

// Uploads to Storage with progress (0..1); an aborted `signal` cancels it. -> Promise
function storageUpload(sdk, target, blob, contentType, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new HttpError(499, CANCELED));
    const task = sdk.uploadBytesResumable(target, blob, { contentType, cacheControl: CACHE_CONTROL });
    signal?.addEventListener('abort', () => task.cancel(), { once: true });
    task.on(
      'state_changed',
      (snap) => {
        if (snap.totalBytes) onProgress?.(snap.bytesTransferred / snap.totalBytes);
      },
      reject,
      () => resolve(),
    );
  });
}

// cloud.imageEncoder: (blob, mime) -> {blob, width, height, scaled} | null
// (media.js browserImageEncoder in the browser; injected or null in tests).
export function contentRoutes(route, cloud) {
  const { s, ctx, services, nowIso } = cloud;
  const db = services.db;
  const demoDelete = cloud.demo('DELETE', '/media/:id');

  const assetRow = (fields) => ({
    sha256: null,
    width: null,
    height: null,
    duration_ms: null,
    created_at: nowIso(),
    ...fields,
  });

  // The library entry, written after the file is complete.
  const publish = (user, name, kind, row) =>
    cloud.mutate(() => {
      const asset = assetRow(row);
      s.assets.push(asset);
      ctx.log(user, 'media.upload', { title: name, kind });
      return ctx.created(ctx.dto.media(asset));
    });

  async function toFirestore({ inspected, title, file, user, onProgress, signal }) {
    const { name, kind } = inspected;
    const aborted = () => signal?.aborted;
    // Videos and models are stored as they are: refuse big ones before any work.
    const early = kind === 'image' ? null : limitError(kind, file.size);
    if (early) throw early;
    if (!cloud.isOnline()) throw new HttpError(503, NETWORK_ERROR);
    if (aborted()) throw new HttpError(499, CANCELED);

    let { blob, mime, ext } = inspected;
    let info = {};
    if (kind === 'image') {
      const image = await prepareImage(blob, mime, ext, cloud.imageEncoder);
      ({ blob, mime, ext } = image);
      info = image.width ? { width: image.width, height: image.height } : ((await probe(blob, kind)) ?? {});
    } else if (kind === 'video') info = (await probe(blob, kind)) ?? {};
    const tooBig = limitError(kind, blob.size);
    if (tooBig) throw tooBig;
    if (aborted()) throw new HttpError(499, CANCELED);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sha = await sha256Hex(bytes);
    const id = await cloud.ids.take('asset');
    const chunks = chunkCount(bytes.length);
    const fileName = `upload-${id}${ext}`;
    try {
      await writeChunks(db, id, bytes, { onProgress, signal });
    } catch (err) {
      deleteChunks(db, id, chunks); // after the writes already sent, so nothing is left behind
      throw err instanceof HttpError ? err : httpErrorOf(err);
    }
    if (aborted()) {
      deleteChunks(db, id, chunks);
      throw new HttpError(499, CANCELED);
    }
    const row = {
      id,
      kind,
      title,
      original_name: name.slice(0, 255),
      file_name: fileName,
      url: null, // resolved on each device from its media cache (media.js)
      storage: 'firestore',
      chunks,
      rev: revOf(sha),
      mime_type: mime,
      size_bytes: bytes.length,
      sha256: sha,
      width: info.width ?? null,
      height: info.height ?? null,
      duration_ms: kind === 'video' ? (info.duration_ms ?? null) : null,
      uploaded_by: user.id,
    };
    // This device has the file already (blob.type is `mime`): its URL is in the answer.
    await cloud.media.put(row, blob);
    try {
      return await publish(user, name, kind, row);
    } catch (err) {
      deleteChunks(db, id, chunks); // no library entry: no orphan chunks
      throw err;
    }
  }

  async function toStorage({ inspected, title, file, user, onProgress, signal }) {
    const { name, ext, kind, mime, blob } = inspected;
    const { storage, storageSdk: sdk } = services;
    if (!storage) throw new HttpError(503, 'تخزين الملفات (Firebase Storage) غير مضبوط في إعدادات المشروع (storageBucket).');
    const info = kind === 'model3d' ? {} : ((await probe(blob, kind)) ?? {});
    const id = await cloud.ids.take('asset');
    const fileName = `upload-${id}${ext}`;
    const storagePath = `media/${id}/${fileName}`;
    const target = sdk.ref(storage, storagePath);
    let url;
    try {
      await storageUpload(sdk, target, blob, mime, { onProgress, signal });
      url = await sdk.getDownloadURL(target);
    } catch (err) {
      throw httpErrorOf(err);
    }
    onProgress?.(1);
    if (signal?.aborted) {
      sdk.deleteObject(target).catch(() => {});
      throw new HttpError(499, CANCELED);
    }
    try {
      return await publish(user, name, kind, {
        id,
        kind,
        title,
        original_name: name.slice(0, 255),
        file_name: fileName,
        url,
        storage_path: storagePath,
        mime_type: mime,
        size_bytes: file.size,
        width: info.width ?? null,
        height: info.height ?? null,
        duration_ms: kind === 'video' ? (info.duration_ms ?? null) : null,
        uploaded_by: user.id,
      });
    } catch (err) {
      sdk.deleteObject(target).catch(() => {}); // no library entry: no orphan file
      throw err;
    }
  }

  // multipart 'file' (+ optional 'title'); from the page's XHR shim:
  // fields.onProgress(0..1) and fields.signal (AbortSignal, cancels the upload).
  route('POST', '/media', contentTeam, async ({ file, fields, user }) => {
    const inspected = await inspectUpload(file);
    const title = str(fields?.title, 'العنوان', { max: 120 }) ?? inspected.name.replace(/\.[^.]+$/, '').slice(0, 120);
    const onProgress = typeof fields?.onProgress === 'function' ? fields.onProgress : null;
    const signal = fields?.signal && typeof fields.signal.addEventListener === 'function' ? fields.signal : null;
    const args = { inspected, title, file, user, onProgress, signal };
    return services.media === 'storage' ? toStorage(args) : toFirestore(args);
  });

  // The demo's checks (a file in use cannot be deleted), then the file:
  // chunks in the same batch as the doc; a Storage object afterwards.
  route('DELETE', '/media/:id', contentTeam, async (args) => {
    const asset = s.assets.find((a) => String(a.id) === String(args.params.id)) ?? null;
    const out = await cloud.mutate((extra) => {
      const result = demoDelete(args);
      if (isFirestoreAsset(asset)) extra.push(...chunkDeletes(asset.id, asset.chunks));
      return result;
    });
    const path = asset?.storage_path ?? null;
    if (path && services.storage) {
      services.storageSdk.deleteObject(services.storageSdk.ref(services.storage, path)).catch((err) => {
        if (err?.code !== 'storage/object-not-found') console.warn('cloud: media file not deleted', path, err);
      });
    }
    return out;
  });
}
