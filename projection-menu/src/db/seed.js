// Sample restaurant: users, sections, tables + projectors, a photographed
// menu and settings, from sample-content/.
//
//   npm run seed             # only into an empty database
//   npm run seed -- --reset  # delete the database and media first (also turns a v1 database into v2)

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { OutdatedDatabaseError, openDb } from './index.js';
import { loadSampleContent } from './sampleContent.js';

const reset = process.argv.includes('--reset');
if (reset) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
  fs.rmSync(config.mediaDir, { recursive: true, force: true });
  console.log('🗑️  حُذفت قاعدة البيانات والملفات القديمة.');
}

let db;
try {
  db = openDb(config.dbPath);
} catch (err) {
  if (!(err instanceof OutdatedDatabaseError)) throw err;
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

if (db.prepare('SELECT COUNT(*) FROM users').pluck().get() > 0) {
  console.log('قاعدة البيانات تحتوي بيانات مسبقاً. لإعادة إنشائها من الصفر: npm run seed -- --reset');
  db.close();
  process.exit(0);
}

console.log('⏳ تحميل المحتوى التجريبي...');
const result = await loadSampleContent({
  db,
  mediaDir: config.mediaDir,
  sampleDir: process.env.SAMPLE_DIR ?? path.join(config.root, 'sample-content'),
});
db.close();

const base = config.publicBaseUrl;
console.log(`✅ تم: ${result.categories} تصنيفات، ${result.dishes} طبقاً، ${result.assets} ملف صور وفيديو، ${result.projectors.length} طاولة.`);
console.log('\n👤 حسابات تجريبية (غيّر كلمات المرور بعد أول دخول):');
for (const u of result.users) console.log(`   ${u.role.padEnd(8)}  ${u.username.padEnd(10)}  ${u.password}   (${u.name})`);
console.log(`\n📱 تطبيق الموظفين: ${base}/app/`);
console.log('📽️  روابط أجهزة العرض (افتحها على الجهاز الموصول بالبروجكتر، أو اربط الجهاز برمز من التطبيق):');
for (const p of result.projectors) console.log(`   طاولة ${String(p.tableNumber).padStart(2)}  ${base}/player/?device=${p.key}`);
