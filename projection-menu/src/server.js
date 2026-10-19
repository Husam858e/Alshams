import { createApp } from './app.js';
import { config } from './config.js';
import { OutdatedDatabaseError, openDb } from './db/index.js';
import { startMdns } from './services/mdns.js';

let db;
try {
  db = openDb(config.dbPath);
} catch (err) {
  if (!(err instanceof OutdatedDatabaseError)) throw err;
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const { server, io, ctx } = createApp({ db, config });

server.listen(config.port, config.host, () => {
  const restaurantName = ctx.settings.general().restaurantName;
  ctx.mdnsHandle = startMdns({ config, name: restaurantName });
  const users = db.prepare('SELECT COUNT(*) FROM users').pluck().get();
  console.log(`🍽️  ${restaurantName} — خادم المنيو الضوئي v${config.version}`);
  console.log(`   تطبيق الموظفين : http://localhost:${config.port}/app/`);
  console.log(`   على الشبكة     : ${config.publicBaseUrl}/app/  (للتابلت وأجهزة العرض)`);
  console.log(`   تطبيق أندرويد  : ${config.publicBaseUrl}/app.apk`);
  console.log(ctx.mdnsHandle ? `   الإعلان على الشبكة (mDNS): _projection-menu._tcp باسم "${ctx.mdnsHandle.name}"` : '   الإعلان على الشبكة (mDNS): معطّل');
  if (users === 0) console.log('   ⚠️  لا يوجد مستخدمون بعد: افتح التطبيق لإنشاء حساب المالك، أو شغّل npm run seed');
});

// io.close() disconnects every socket and closes the HTTP server.
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await ctx.mdnsHandle?.stop().catch(() => {});
  io.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
