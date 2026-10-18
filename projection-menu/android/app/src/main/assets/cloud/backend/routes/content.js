// Cloud mode: media uploads go to Firebase Storage (media/{assetId}/{file},
// cached for a year: a file never changes under its URL), with the same
// checks as the server; deleting a library entry deletes its file.

import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { contentTeam } from '../../../demo/backend/roles.js';
import { probe } from '../../../demo/backend/probe.js';
import { inspectUpload } from '../../../demo/backend/routes/menu.js';
import { HttpError, str } from '../../../demo/backend/validate.js';
import { httpErrorOf } from '../firebase.js';

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

// Uploads with progress (0..1); an aborted `signal` cancels the upload. -> Promise
function upload(target, blob, contentType, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new HttpError(499, 'أُلغي الرفع'));
    const task = uploadBytesResumable(target, blob, { contentType, cacheControl: CACHE_CONTROL });
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

export function contentRoutes(route, cloud) {
  const { s, ctx, services, nowIso } = cloud;
  const demoDelete = cloud.demo('DELETE', '/media/:id');

  // multipart 'file' (+ optional 'title'); from the page's XHR shim:
  // fields.onProgress(0..1) and fields.signal (AbortSignal, cancels the upload).
  route('POST', '/media', contentTeam, async ({ file, fields, user }) => {
    const { name, ext, kind, mime, blob } = await inspectUpload(file);
    const title = str(fields?.title, 'العنوان', { max: 120 }) ?? name.replace(/\.[^.]+$/, '').slice(0, 120);
    if (!services.storage) throw new HttpError(503, 'تخزين الملفات (Firebase Storage) غير مضبوط في إعدادات المشروع (storageBucket).');
    const info = kind === 'model3d' ? {} : ((await probe(blob, kind)) ?? {});
    const id = await cloud.ids.take('asset');
    const fileName = `upload-${id}${ext}`;
    const storagePath = `media/${id}/${fileName}`;
    const target = ref(services.storage, storagePath);
    const onProgress = typeof fields?.onProgress === 'function' ? fields.onProgress : null;
    const signal = fields?.signal && typeof fields.signal.addEventListener === 'function' ? fields.signal : null;
    let url;
    try {
      await upload(target, blob, mime, { onProgress, signal });
      url = await getDownloadURL(target);
    } catch (err) {
      throw httpErrorOf(err);
    }
    onProgress?.(1);
    if (signal?.aborted) {
      deleteObject(target).catch(() => {});
      throw new HttpError(499, 'أُلغي الرفع');
    }
    try {
      return await cloud.mutate(() => {
        const asset = {
          id,
          kind,
          title,
          original_name: name.slice(0, 255),
          file_name: fileName,
          url,
          storage_path: storagePath,
          mime_type: mime,
          size_bytes: file.size,
          sha256: null,
          width: info.width ?? null,
          height: info.height ?? null,
          duration_ms: kind === 'video' ? (info.duration_ms ?? null) : null,
          uploaded_by: user.id,
          created_at: nowIso(),
        };
        s.assets.push(asset);
        ctx.log(user, 'media.upload', { title: name, kind });
        return ctx.created(ctx.dto.media(asset));
      });
    } catch (err) {
      deleteObject(target).catch(() => {}); // no library entry: no orphan file
      throw err;
    }
  });

  // The demo's checks (a file in use cannot be deleted), then its Storage object.
  route('DELETE', '/media/:id', contentTeam, async (args) => {
    const path = s.assets.find((a) => String(a.id) === String(args.params.id))?.storage_path ?? null;
    const out = await cloud.mutate(() => demoDelete(args));
    if (path && services.storage) {
      deleteObject(ref(services.storage, path)).catch((err) => {
        if (err?.code !== 'storage/object-not-found') console.warn('cloud: media file not deleted', path, err);
      });
    }
    return out;
  });
}
