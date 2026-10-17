import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { contentTeam } from '../auth/roles.js';
import { badRequest, conflict, idParam, notFound, str } from '../lib/validate.js';
import {
  createUploader,
  decodeOriginalName,
  formatFor,
  handleUpload,
  matchesSignature,
  probeMedia,
  sha256File,
} from '../services/media.js';
import { mediaUrl } from '../services/settings.js';

// Media library: photos, videos and .glb models used by dishes, categories,
// the theme background and the logo. One file per request.
export function mediaRoutes({ db, config, settings, activity }) {
  const r = Router();
  const uploader = createUploader(config);

  const q = {
    list: db.prepare('SELECT * FROM media_assets ORDER BY id DESC'),
    get: db.prepare('SELECT * FROM media_assets WHERE id = ?'),
    insert: db.prepare(`
      INSERT INTO media_assets (kind, title, original_name, file_name, mime_type, size_bytes, sha256, width, height,
        duration_ms, uploaded_by)
      VALUES (@kind, @title, @original_name, @file_name, @mime_type, @size_bytes, @sha256, @width, @height,
        @duration_ms, @uploaded_by)`),
    dishes: db.prepare('SELECT id, name_ar, image_asset_id, video_asset_id, model_asset_id FROM dishes'),
    categories: db.prepare('SELECT id, name_ar, cover_asset_id FROM categories'),
    uploaders: db.prepare('SELECT id, name FROM users'),
  };

  // assetId -> [{type, id?, name}] for everything that points at a file.
  const usageMap = () => {
    const map = new Map();
    const add = (assetId, use) => {
      if (!assetId) return;
      const list = map.get(assetId) ?? [];
      list.push(use);
      map.set(assetId, list);
    };
    for (const d of q.dishes.all()) {
      for (const col of ['image_asset_id', 'video_asset_id', 'model_asset_id']) {
        add(d[col], { type: 'dish', id: d.id, name: d.name_ar, label: `طبق "${d.name_ar}"` });
      }
    }
    for (const c of q.categories.all()) {
      add(c.cover_asset_id, { type: 'category', id: c.id, name: c.name_ar, label: `تصنيف "${c.name_ar}"` });
    }
    const { general, theme } = settings.all();
    add(general.logoAssetId, { type: 'logo', name: 'شعار المطعم', label: 'شعار المطعم' });
    if (theme.background?.type !== 'preset') {
      add(theme.background?.assetId, { type: 'theme', name: 'خلفية العرض', label: 'خلفية تصميم العرض' });
    }
    return map;
  };

  const dto = (m, usage = usageMap(), names = null) => ({
    ...m,
    url: mediaUrl(m.file_name),
    uploaded_by_name: names?.get(m.uploaded_by) ?? null,
    used_by: usage.get(m.id) ?? [],
  });

  const load = (id) => {
    const asset = q.get.get(idParam(id, 'الملف'));
    if (!asset) throw notFound('الملف غير موجود');
    return asset;
  };

  r.get('/media', contentTeam, (_req, res) => {
    const usage = usageMap();
    const names = new Map(q.uploaders.all().map((u) => [u.id, u.name]));
    res.json(q.list.all().map((m) => dto(m, usage, names)));
  });

  r.post('/media', contentTeam, handleUpload(uploader, config.maxUploadMb), async (req, res) => {
    if (!req.file) throw badRequest('لم يتم إرفاق ملف (الحقل file)');
    const filePath = req.file.path;
    try {
      const originalName = decodeOriginalName(req.file.originalname);
      const format = formatFor(originalName);
      if (!(await matchesSignature(filePath, format))) {
        throw badRequest('محتوى الملف لا يطابق امتداده (قد يكون الملف تالفاً أو بصيغة أخرى)');
      }
      const [sha256, info] = await Promise.all([sha256File(filePath), format.kind === 'model3d' ? {} : probeMedia(filePath)]);
      const id = q.insert.run({
        kind: format.kind,
        title: str(req.body?.title, 'العنوان', { max: 120 }) ?? path.parse(originalName).name.slice(0, 120),
        original_name: originalName.slice(0, 255),
        file_name: req.file.filename,
        mime_type: format.mime,
        size_bytes: req.file.size,
        sha256,
        width: info.width ?? null,
        height: info.height ?? null,
        duration_ms: format.kind === 'video' ? (info.duration_ms ?? null) : null,
        uploaded_by: req.user.id,
      }).lastInsertRowid;
      activity.log(req.user, 'media.upload', { title: originalName, kind: format.kind });
      res.status(201).json(dto(q.get.get(id), usageMap(), new Map([[req.user.id, req.user.name]])));
    } catch (err) {
      await fs.rm(filePath, { force: true });
      throw err;
    }
  });

  r.patch('/media/:id', contentTeam, (req, res) => {
    const asset = load(req.params.id);
    const title = str(req.body.title, 'العنوان', { required: true, max: 120 });
    db.prepare('UPDATE media_assets SET title = ? WHERE id = ?').run(title, asset.id);
    res.json(dto(q.get.get(asset.id), usageMap(), new Map(q.uploaders.all().map((u) => [u.id, u.name]))));
  });

  // Refused while anything still uses the file; the message names the users.
  r.delete('/media/:id', contentTeam, async (req, res) => {
    const asset = load(req.params.id);
    const users = usageMap().get(asset.id) ?? [];
    if (users.length) {
      throw conflict(`لا يمكن حذف الملف لأنه مستخدم في: ${users.map((u) => u.label).join('، ')}`);
    }
    db.prepare('DELETE FROM media_assets WHERE id = ?').run(asset.id);
    await fs.rm(path.join(config.mediaDir, asset.file_name), { force: true });
    activity.log(req.user, 'media.delete', { title: asset.title });
    res.json({ ok: true });
  });

  return r;
}
