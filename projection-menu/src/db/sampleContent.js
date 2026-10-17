import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { newKey } from '../lib/keys.js';
import { hashPassword } from '../lib/passwords.js';
import { formatFor, probeMedia, sha256File } from '../services/media.js';
import { createSettings } from '../services/settings.js';

// Loads sample-content/ (manifest.json + images) into an empty database:
// users, sections and tables (one projector each), menu with photos, settings.
// Used by `npm run seed`; the Android demo bundles the same folder.
export async function loadSampleContent({ db, mediaDir, sampleDir }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(sampleDir, 'manifest.json'), 'utf8'));
  fs.mkdirSync(mediaDir, { recursive: true });

  // ── Users ──
  const insertUser = db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)');
  const users = [];
  for (const u of manifest.users) {
    users.push({ ...u, id: insertUser.run(u.name, u.username, await hashPassword(u.password), u.role).lastInsertRowid });
  }
  const ownerId = users.find((u) => u.role === 'owner')?.id ?? null;

  // ── Media: copy each referenced file once under a random name ──
  const insertAsset = db.prepare(`
    INSERT INTO media_assets (kind, title, original_name, file_name, mime_type, size_bytes, sha256, width, height,
      duration_ms, uploaded_by)
    VALUES (@kind, @title, @original_name, @file_name, @mime_type, @size_bytes, @sha256, @width, @height,
      @duration_ms, @uploaded_by)`);
  const assets = new Map(); // sample file name -> asset id
  const asset = async (file, title) => {
    if (!file) return null;
    if (assets.has(file)) return assets.get(file);
    const source = path.join(sampleDir, 'images', file);
    const format = formatFor(file);
    if (!format || !fs.existsSync(source)) throw new Error(`sample-content: missing or unsupported file ${file}`);
    const fileName = `${crypto.randomUUID()}${path.extname(file).toLowerCase()}`;
    const target = path.join(mediaDir, fileName);
    fs.copyFileSync(source, target);
    const info = format.kind === 'model3d' ? {} : await probeMedia(target);
    const id = insertAsset.run({
      kind: format.kind,
      title,
      original_name: file,
      file_name: fileName,
      mime_type: format.mime,
      size_bytes: fs.statSync(target).size,
      sha256: await sha256File(target),
      width: info.width ?? null,
      height: info.height ?? null,
      duration_ms: format.kind === 'video' ? (info.duration_ms ?? null) : null,
      uploaded_by: ownerId,
    }).lastInsertRowid;
    assets.set(file, id);
    return id;
  };

  // ── Menu ──
  const insertCategory = db.prepare(`
    INSERT INTO categories (name_ar, name_en, description_ar, icon, cover_asset_id, sort_order)
    VALUES (@name_ar, @name_en, @description_ar, @icon, @cover_asset_id, @sort_order)`);
  const insertDish = db.prepare(`
    INSERT INTO dishes (category_id, name_ar, name_en, description_ar, price, image_asset_id, video_asset_id,
      model_asset_id, badges, calories, prep_minutes, is_featured, sort_order)
    VALUES (@category_id, @name_ar, @name_en, @description_ar, @price, @image_asset_id, @video_asset_id,
      @model_asset_id, @badges, @calories, @prep_minutes, @is_featured, @sort_order)`);
  let dishCount = 0;
  for (const [ci, c] of manifest.categories.entries()) {
    const categoryId = insertCategory.run({
      name_ar: c.name_ar,
      name_en: c.name_en ?? null,
      description_ar: c.description_ar ?? null,
      icon: c.icon ?? null,
      cover_asset_id: await asset(c.cover, `غلاف ${c.name_ar}`),
      sort_order: ci,
    }).lastInsertRowid;
    for (const [di, d] of c.dishes.entries()) {
      insertDish.run({
        category_id: categoryId,
        name_ar: d.name_ar,
        name_en: d.name_en ?? null,
        description_ar: d.description_ar ?? null,
        price: d.price,
        image_asset_id: await asset(d.image, d.name_ar),
        video_asset_id: await asset(d.video, `${d.name_ar} (فيديو)`),
        model_asset_id: await asset(d.model, `${d.name_ar} (مجسم)`),
        badges: JSON.stringify(d.badges ?? []),
        calories: d.calories ?? null,
        prep_minutes: d.prep_minutes ?? null,
        is_featured: d.is_featured ? 1 : 0,
        sort_order: di,
      });
      dishCount += 1;
    }
  }

  // ── Floor: sections, tables, one projector per table ──
  const insertArea = db.prepare('INSERT INTO areas (name, sort_order) VALUES (?, ?)');
  const insertTable = db.prepare('INSERT INTO restaurant_tables (number, area_id, seats, sort_order) VALUES (?, ?, ?, ?)');
  const insertProjector = db.prepare('INSERT INTO projectors (table_id, name, device_key) VALUES (?, ?, ?)');
  const projectors = [];
  for (const [ai, a] of manifest.areas.entries()) {
    const areaId = insertArea.run(a.name, ai).lastInsertRowid;
    for (const [ti, t] of a.tables.entries()) {
      const tableId = insertTable.run(t.number, areaId, t.seats ?? 4, ti).lastInsertRowid;
      const key = newKey();
      insertProjector.run(tableId, `جهاز عرض طاولة ${t.number}`, key);
      projectors.push({ tableNumber: t.number, area: a.name, key });
    }
  }

  // ── Settings (validated like the API does) ──
  const settings = createSettings(db);
  settings.ensureDefaults();
  settings.updateGeneral({ ...manifest.general, logoAssetId: null });
  settings.updateTheme({ ...manifest.theme, background: { type: 'preset', assetId: null } });

  return { users, projectors, categories: manifest.categories.length, dishes: dishCount, assets: assets.size };
}
