// Demo data: categories, dishes, two tables, two projectors and — when ffmpeg
// is installed — generated projection clips (light "halos" around the plate).
//
//   npm run seed            # only if the database is empty
//   npm run seed -- --reset # wipe database + media first

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { newKey } from '../lib/auth.js';
import { defaultZones } from '../lib/zones.js';
import { probeMedia, sha256File } from '../services/media.js';
import { openDb } from './index.js';

const run = promisify(execFile);

if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
  fs.rmSync(config.mediaDir, { recursive: true, force: true });
}
fs.mkdirSync(config.mediaDir, { recursive: true });

const db = openDb(config.dbPath);
if (db.prepare('SELECT COUNT(*) AS n FROM dishes').get().n > 0) {
  console.log('قاعدة البيانات تحتوي بيانات مسبقاً. استخدم: npm run seed -- --reset');
  process.exit(0);
}

// ── Generated clips ────────────────────────────────────────────────
// Projection rule of thumb: black = no light. Content is drawn on pure black
// so only the glowing shapes land on the table, around the plate.
const R = 'hypot(X-W/2,Y-H/2)';
const A = 'atan2(Y-H/2,X-W/2)';
const SHAPES = {
  halo: `lte(abs(${R}-(H*0.34+6*sin(2*PI*T/3))),4)+lte(abs(${R}-H*0.42),2)*gt(sin(10*${A}+2*T),0.2)`,
  waiting: `lte(abs(${R}-H*0.36),3)*gt(sin(3*${A}-4*T),0.6)+lte(abs(${R}-H*0.42),2)*gt(sin(16*${A}+3*T),0.4)`,
  ripple: `lte(abs(mod(${R}-50*T,36)-18),3)*lt(${R},H*0.47)`,
  ambient: `0.35*lte(abs(${R}-(H*0.40+10*sin(2*PI*T/4))),3)+0.25*lte(abs(${R}-H*0.46),1)*gt(sin(24*${A}-T),0.5)`,
};

async function hasFfmpeg() {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function makeClip(shape, [r, g, b], seconds = 4) {
  const file = `${crypto.randomUUID()}.webm`;
  const expr = `clip(${SHAPES[shape]},0,1)`;
  const filter = `color=black:s=480x270:d=${seconds}:r=20,format=gbrp,geq=r='${r}*${expr}':g='${g}*${expr}':b='${b}*${expr}'`;
  // VP9/WebM plays in every Chromium build (H.264 needs Google Chrome).
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-c:v', 'libvpx-vp9', '-b:v', '400k',
    '-pix_fmt', 'yuv420p', '-an', path.join(config.mediaDir, file)]);
  return file;
}

async function makeThumbnail([r, g, b]) {
  const file = `${crypto.randomUUID()}.jpg`;
  const plate = `exp(-pow(${R}/(H*0.32),4))`;
  const filter = `color=black:s=480x360:d=1,format=gbrp,geq=r='30+${r}*0.8*${plate}':g='30+${g}*0.8*${plate}':b='40+${b}*0.8*${plate}'`;
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-frames:v', '1', '-q:v', '4',
    path.join(config.mediaDir, file)]);
  return file;
}

const insertAsset = db.prepare(`
  INSERT INTO media_assets (kind, title, original_name, file_name, mime_type, size_bytes, sha256, duration_ms, width, height)
  VALUES (@kind, @title, @original_name, @file_name, @mime_type, @size_bytes, @sha256, @duration_ms, @width, @height)`);

async function registerAsset(fileName, title) {
  const filePath = path.join(config.mediaDir, fileName);
  const video = fileName.endsWith('.webm');
  const info = await probeMedia(filePath);
  return insertAsset.run({
    kind: video ? 'video' : 'image',
    title,
    original_name: fileName,
    file_name: fileName,
    mime_type: video ? 'video/webm' : 'image/jpeg',
    size_bytes: fs.statSync(filePath).size,
    sha256: await sha256File(filePath),
    duration_ms: info.duration_ms ?? null,
    width: info.width ?? null,
    height: info.height ?? null,
  }).lastInsertRowid;
}

// ── Menu ───────────────────────────────────────────────────────────
const MENU = [
  {
    name_ar: 'بيتزا', name_en: 'Pizza', color: [255, 140, 20],
    dishes: [
      { name_ar: 'بيتزا مارجريتا', name_en: 'Margherita', price: 12000, description_ar: 'صلصة طماطم، موزاريلا طازجة، ريحان' },
      { name_ar: 'بيتزا الخضار', name_en: 'Veggie', price: 11000, description_ar: 'فلفل ملون، زيتون، فطر، بصل' },
    ],
  },
  {
    name_ar: 'سلطات', name_en: 'Salads', color: [60, 230, 110],
    dishes: [
      { name_ar: 'سلطة سيزر', name_en: 'Caesar', price: 8000, description_ar: 'خس روماني، بارميزان، خبز محمص، صوص سيزر' },
      { name_ar: 'سلطة يونانية', name_en: 'Greek', price: 7500, description_ar: 'طماطم، خيار، جبنة فيتا، زيتون' },
    ],
  },
  {
    name_ar: 'حلويات', name_en: 'Desserts', color: [255, 90, 170],
    dishes: [
      { name_ar: 'تشيز كيك', name_en: 'Cheesecake', price: 6000, description_ar: 'تشيز كيك نيويورك مع صوص التوت' },
      { name_ar: 'براونيز', name_en: 'Brownies', price: 5500, description_ar: 'براونيز بالشوكولاتة الداكنة مع آيس كريم' },
    ],
  },
];

const withMedia = await hasFfmpeg();
if (!withMedia) console.warn('⚠️  ffmpeg غير مثبت: سيتم إنشاء الأطباق بدون ملفات عرض. ارفعها من لوحة التحكم.');

let shared = {};
if (withMedia) {
  console.log('⏳ توليد مقاطع العرض التجريبية (قد يستغرق دقيقة)...');
  const [waiting, ripple, ambient] = await Promise.all([
    makeClip('waiting', [255, 200, 80]),
    makeClip('ripple', [255, 230, 180], 3),
    makeClip('ambient', [255, 170, 60], 6),
  ]);
  shared = {
    ordered: await registerAsset(waiting, 'انتظار التحضير — حلقة دوارة'),
    served: await registerAsset(ripple, 'تقديم الطبق — تموجات'),
    idle: await registerAsset(ambient, 'خلفية الطاولة — هالة هادئة'),
  };
}

const insertCategory = db.prepare('INSERT INTO categories (name_ar, name_en, sort_order) VALUES (?, ?, ?)');
const insertDish = db.prepare(`
  INSERT INTO dishes (category_id, name_ar, name_en, description_ar, price, thumbnail_asset_id, sort_order)
  VALUES (@category_id, @name_ar, @name_en, @description_ar, @price, @thumbnail_asset_id, @sort_order)`);
const linkProjection = db.prepare(`
  INSERT INTO dish_projections (dish_id, media_asset_id, phase, loop, duration_ms)
  VALUES (?, ?, ?, ?, ?)`);

for (const [ci, category] of MENU.entries()) {
  const categoryId = insertCategory.run(category.name_ar, category.name_en, ci).lastInsertRowid;
  let preview = null;
  let thumbnail = null;
  if (withMedia) {
    preview = await registerAsset(await makeClip('halo', category.color), `هالة ${category.name_ar}`);
    thumbnail = await registerAsset(await makeThumbnail(category.color), `صورة ${category.name_ar}`);
  }
  for (const [di, dish] of category.dishes.entries()) {
    const dishId = insertDish.run({ ...dish, category_id: categoryId, thumbnail_asset_id: thumbnail, sort_order: di })
      .lastInsertRowid;
    if (withMedia) {
      linkProjection.run(dishId, preview, 'preview', 1, null);
      linkProjection.run(dishId, shared.ordered, 'ordered', 1, null);
      linkProjection.run(dishId, shared.served, 'served', 0, 6000);
    }
  }
}

// ── Tables & projectors ────────────────────────────────────────────
const insertTable = db.prepare('INSERT INTO restaurant_tables (code, name, seats, access_key) VALUES (?, ?, ?, ?)');
const insertProjector = db.prepare(`
  INSERT INTO projectors (table_id, name, driver, agent_host, agent_port, access_key, zones, idle_asset_id)
  VALUES (@table_id, @name, @driver, @agent_host, @agent_port, @access_key, @zones, @idle_asset_id)`);

const t1 = insertTable.run('T01', 'طاولة 1 — النافذة', 4, newKey()).lastInsertRowid;
const t2 = insertTable.run('T02', 'طاولة 2 — الركن', 2, newKey()).lastInsertRowid;
insertProjector.run({
  table_id: t1, name: 'بروجكتر الطاولة 1 (متصفح)', driver: 'browser', agent_host: null, agent_port: 8765,
  access_key: newKey(), zones: JSON.stringify(defaultZones(4)), idle_asset_id: shared.idle ?? null,
});
insertProjector.run({
  table_id: t2, name: 'بروجكتر الطاولة 2 (Raspberry Pi + mpv)', driver: 'mpv_agent', agent_host: '127.0.0.1',
  agent_port: 8765, access_key: newKey(), zones: JSON.stringify(defaultZones(2)), idle_asset_id: shared.idle ?? null,
});

console.log('✅ تم إنشاء البيانات التجريبية.');
const base = `http://localhost:${config.port}`;
for (const t of db.prepare('SELECT * FROM restaurant_tables').all()) {
  console.log(`   تابلت ${t.code}: ${base}/tablet/?table=${t.code}&key=${t.access_key}`);
}
for (const p of db.prepare('SELECT * FROM projectors').all()) {
  console.log(
    p.driver === 'browser'
      ? `   شاشة العرض #${p.id}: ${base}/player/?projector=${p.id}&key=${p.access_key}`
      : `   وكيل mpv #${p.id}: python3 agent/projector_agent.py --server ${base} --projector ${p.id} --key ${p.access_key}`,
  );
}
db.close();
