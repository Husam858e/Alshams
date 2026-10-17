// LAN addresses, public info, static routes, the Android app download,
// mDNS switch and v1 database detection.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import Database from 'better-sqlite3';
import { config as baseConfig } from '../src/config.js';
import { OutdatedDatabaseError, openDb } from '../src/db/index.js';
import { lanAddresses, lanUrls } from '../src/lib/network.js';
import { startMdns } from '../src/services/mdns.js';
import { startServer } from './helpers.js';

const APK_BYTES = Buffer.from('PK\x03\x04 fake apk');
let t;
before(async () => {
  t = await startServer({ config: { port: 3000 } });
});
after(() => t.close());

test('lanAddresses lists external IPv4 addresses, the likely LAN one first', () => {
  assert.ok(Array.isArray(lanAddresses()), 'works on the real interfaces');
  const fake = {
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
    eth0: [
      { address: 'fe80::1', family: 'IPv6', internal: false },
      { address: '169.254.10.20', family: 'IPv4', internal: false },
    ],
    wlan0: [{ address: '192.168.1.10', family: 'IPv4', internal: false }],
  };
  assert.deepEqual(lanAddresses(fake), ['192.168.1.10', '172.17.0.1', '169.254.10.20']);
  assert.equal(lanUrls(3000, fake)[0], 'http://192.168.1.10:3000');
  assert.deepEqual(lanAddresses({}), []);
});

test('config.publicBaseUrl defaults to the first LAN address', { skip: Boolean(process.env.PUBLIC_BASE_URL) }, () => {
  assert.equal(baseConfig.publicBaseUrl, `http://${lanAddresses()[0] ?? 'localhost'}:${baseConfig.port}`);
});

test('server-info (owner) describes the LAN base and the APK', async () => {
  assert.equal((await t.client().get('/api/system/server-info')).status, 401);
  assert.equal((await t.as.waiter.get('/api/system/server-info')).status, 403);
  const info = (await t.as.owner.get('/api/system/server-info')).body;
  assert.equal(info.publicBaseUrl, baseConfig.publicBaseUrl);
  for (const url of info.lanUrls) assert.match(url, /^http:\/\/\d+\.\d+\.\d+\.\d+:3000$/);
  assert.equal(info.apkAvailable, false);
  assert.equal(info.apkUrl, '/app.apk');
});

test('/app.apk: Arabic JSON 404 while missing, public download once built', async () => {
  const missing = await fetch(`${t.base}/app.apk`);
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /APK/);

  fs.mkdirSync(path.dirname(t.config.apkPath), { recursive: true });
  fs.writeFileSync(t.config.apkPath, APK_BYTES);
  const res = await fetch(`${t.base}/app.apk`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="?ProjectionMenu\.apk"?$/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), APK_BYTES);
  assert.equal((await t.as.owner.get('/api/system/server-info')).body.apkAvailable, true);
});

test('static routes: UIs, vendored browser libraries, Socket.IO client, redirects', async () => {
  const js = [
    '/vendor/preact/dist/preact.module.js',
    '/vendor/preact/hooks/dist/hooks.module.js',
    '/vendor/htm/dist/htm.module.js',
    '/vendor/htm/preact/index.module.js',
    '/vendor/three/build/three.module.js',
    '/vendor/three/examples/jsm/loaders/GLTFLoader.js',
    '/vendor/qrcode/qrcode.mjs',
    '/socket.io/socket.io.esm.min.js',
    '/shared/homography.js',
  ];
  for (const url of js) {
    const res = await fetch(t.base + url);
    assert.equal(res.status, 200, url);
    assert.match(res.headers.get('content-type'), /javascript/, url);
    await res.arrayBuffer();
  }
  for (const [from, to] of [['/', '/app/'], ['/admin/', '/app/'], ['/tablet/', '/app/'], ['/app', '/app/'], ['/player', '/player/']]) {
    const res = await fetch(t.base + from, { redirect: 'manual' });
    assert.ok([301, 302].includes(res.status), from);
    assert.equal(res.headers.get('location'), to, from);
  }
  const ui = await fetch(`${t.base}/shared/homography.js`);
  assert.equal(ui.headers.get('cache-control'), 'no-cache');
  assert.equal(ui.headers.get('x-frame-options'), 'SAMEORIGIN');
  const unknown = await fetch(`${t.base}/api/nope`);
  assert.equal(unknown.status, 404);
  assert.match((await unknown.json()).error, /غير موجود/);
  assert.equal((await fetch(`${t.base}/media/../package.json`)).status, 404);
});

test('mDNS is off when disabled (tests, MDNS=0) and never started by createApp', () => {
  assert.equal(startMdns({ config: { ...baseConfig, mdns: false }, name: 'x' }), null);
  assert.equal(t.config.mdns, false);
  assert.equal(t.ctx.mdns(), null);
});

test('a v1 database is detected and the user is told to reset it', () => {
  const file = path.join(t.tmp, 'v1.db');
  const v1 = new Database(file);
  v1.exec('CREATE TABLE dish_projections (id INTEGER PRIMARY KEY); CREATE TABLE restaurant_tables (id INTEGER PRIMARY KEY, code TEXT)');
  v1.close();
  assert.throws(
    () => openDb(file),
    (err) => err instanceof OutdatedDatabaseError && err.message.includes('npm run seed -- --reset'),
  );
  // A fresh file is fine and gets the v2 schema.
  const fresh = openDb(path.join(t.tmp, 'fresh.db'));
  assert.equal(fresh.pragma('user_version', { simple: true }), 2);
  fresh.close();
});
