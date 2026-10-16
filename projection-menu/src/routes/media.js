import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { HttpError, badRequest, int, notFound, str } from '../lib/validate.js';
import { createUploader, decodeOriginalName, formatFor, handleUpload, probeMedia, sha256File } from '../services/media.js';

// Admin: the media library (projection videos, images, 3D models).
export function mediaRoutes({ db, config }) {
  const r = Router();
  const uploader = createUploader(config);

  const q = {
    list: db.prepare(`
      SELECT m.*,
        (SELECT COUNT(*) FROM dish_projections dp WHERE dp.media_asset_id = m.id) AS used_by_projections,
        (SELECT COUNT(*) FROM dishes d WHERE d.thumbnail_asset_id = m.id)         AS used_as_thumbnail,
        (SELECT COUNT(*) FROM projectors p WHERE p.idle_asset_id = m.id)           AS used_as_idle
      FROM media_assets m ORDER BY m.id DESC`),
    get: db.prepare('SELECT * FROM media_assets WHERE id = ?'),
    insert: db.prepare(`
      INSERT INTO media_assets (kind, title, original_name, file_name, mime_type, size_bytes, sha256, duration_ms, width, height)
      VALUES (@kind, @title, @original_name, @file_name, @mime_type, @size_bytes, @sha256, @duration_ms, @width, @height)`),
  };

  r.get('/media', (_req, res) => res.json(q.list.all().map(serializeAsset)));

  r.post('/media', handleUpload(uploader, config.maxUploadMb), async (req, res) => {
    if (!req.file) throw badRequest('لم يتم إرفاق ملف');
    const filePath = req.file.path;
    try {
      const originalName = decodeOriginalName(req.file.originalname);
      const format = formatFor(originalName);
      const [sha256, info] = await Promise.all([sha256File(filePath), probeMedia(filePath)]);
      const { lastInsertRowid } = q.insert.run({
        kind: format.kind,
        title: str(req.body.title, 'العنوان', { max: 120 }) ?? path.parse(originalName).name,
        original_name: originalName,
        file_name: req.file.filename,
        mime_type: format.mime,
        size_bytes: req.file.size,
        sha256,
        duration_ms: info.duration_ms ?? null,
        width: info.width ?? null,
        height: info.height ?? null,
      });
      res.status(201).json(serializeAsset(q.get.get(lastInsertRowid)));
    } catch (err) {
      await fs.rm(filePath, { force: true });
      throw err;
    }
  });

  r.patch('/media/:id', (req, res) => {
    const id = int(req.params.id, 'id');
    const title = str(req.body.title, 'العنوان', { required: true, max: 120 });
    if (!db.prepare('UPDATE media_assets SET title = ? WHERE id = ?').run(title, id).changes) throw notFound();
    res.json(serializeAsset(q.get.get(id)));
  });

  // Deleting a file that a dish projection still uses is refused (FK RESTRICT);
  // thumbnails and idle loops that point at it are simply cleared.
  r.delete('/media/:id', async (req, res) => {
    const asset = q.get.get(int(req.params.id, 'id'));
    if (!asset) throw notFound();
    const inUse = db.prepare('SELECT COUNT(*) AS n FROM dish_projections WHERE media_asset_id = ?').get(asset.id).n;
    if (inUse) throw new HttpError(409, `الملف مرتبط بـ ${inUse} عرض/عروض لأطباق. فك الربط أولاً.`);
    db.prepare('DELETE FROM media_assets WHERE id = ?').run(asset.id);
    await fs.rm(path.join(config.mediaDir, asset.file_name), { force: true });
    res.status(204).end();
  });

  return r;
}

export function serializeAsset(m) {
  return { ...m, url: `/media/${m.file_name}` };
}
