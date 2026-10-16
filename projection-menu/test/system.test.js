// LAN addresses, server info for the dashboard's pairing QR codes, and the
// Android app download.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { config as baseConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';
import { lanAddresses, lanUrls } from '../src/lib/network.js';

const TOKEN = 'test-token';
const APK_BYTES = Buffer.from('PK\x03\x04 fake apk');
let tmp;
let apkPath;
let server;
let base;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-menu-system-'));
  apkPath = path.join(tmp, 'dist', 'ProjectionMenu.apk');
  const config = { ...baseConfig, adminToken: TOKEN, mediaDir: path.join(tmp, 'media'), apkPath, port: 3000 };
  ({ server } = createApp({ db: openDb(path.join(tmp, 'test.db')), config }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const serverInfo = () =>
  fetch(`${base}/api/admin/server-info`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((r) => r.json());

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

test('server-info is admin only and describes the LAN base and the APK', async () => {
  const denied = await fetch(`${base}/api/admin/server-info`);
  assert.equal(denied.status, 401);

  const info = await serverInfo();
  assert.equal(info.publicBaseUrl, baseConfig.publicBaseUrl);
  assert.ok(Array.isArray(info.lanUrls));
  for (const url of info.lanUrls) assert.match(url, /^http:\/\/\d+\.\d+\.\d+\.\d+:3000$/);
  assert.equal(info.apkAvailable, false);
  assert.equal(info.apkUrl, '/app.apk');
});

test('/app.apk answers a JSON 404 in Arabic while the APK is missing', async () => {
  const res = await fetch(`${base}/app.apk`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.match((await res.json()).error, /APK/);
});

test('/app.apk downloads the APK without login once it exists', async () => {
  fs.mkdirSync(path.dirname(apkPath), { recursive: true });
  fs.writeFileSync(apkPath, APK_BYTES);

  const res = await fetch(`${base}/app.apk`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="?ProjectionMenu\.apk"?$/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), APK_BYTES);

  const info = await serverInfo();
  assert.equal(info.apkAvailable, true);
  assert.equal(info.apkSize, APK_BYTES.length);
});

test('the dashboard can load the vendored QR generator', async () => {
  const res = await fetch(`${base}/vendor/qrcode/qrcode.mjs`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.match(await res.text(), /export default qrcode/);
});
