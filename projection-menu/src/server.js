import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db/index.js';

const db = openDb(config.dbPath);
const { server, io } = createApp({ db, config });

if (config.adminToken === 'change-me') {
  console.warn('⚠️  ADMIN_TOKEN غير مضبوط — يُستخدم الرمز الافتراضي "change-me". غيّره قبل التشغيل الفعلي.');
}

server.listen(config.port, config.host, () => {
  const base = `http://localhost:${config.port}`;
  console.log(`🍽️  Projection menu server on ${base}`);
  console.log(`   لوحة التحكم : ${base}/admin/`);
  console.log(`   على الشبكة  : ${config.publicBaseUrl}/admin/  (عنوان التابلتات وأجهزة العرض)`);
  console.log(`   روابط التابلت وأجهزة العرض ورموز QR تظهر في لوحة التحكم ← الطاولات والأجهزة`);
});

// io.close() disconnects players/dashboards and closes the HTTP server.
const shutdown = () => io.close(() => {
  db.close();
  process.exit(0);
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
