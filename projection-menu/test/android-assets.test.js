// Guards the pages bundled in the Android app (android/app/src/main/assets)
// against drift. The offline demo runs the REAL staff app and projector
// player (copied into the APK from public/ by Gradle) on an in-memory
// backend (assets/demo/backend/), so the seams it relies on must hold:
//   - demo/app.html mirrors public/app/index.html, plus the fetch/XHR shim
//     and the Socket.IO client remapped to the demo's;
//   - the staff app reaches the network only through lib/api.js + lib/live.js,
//     the player only through lib/net.js (with its __PM_DEMO__ seam);
//   - every API call of lib/api.js has a demo route, behaving like the server;
//   - demo/data.js and assets/media match sample-content/ (the generator ran);
//   - every local URL of the bundled pages exists in the APK layout.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const PUBLIC = path.join(ROOT, 'public');
const MODULES = path.join(ROOT, 'node_modules');
const DEMO = path.join(ASSETS, 'demo');

const read = (file) => fs.readFileSync(file, 'utf8');
const load = (file) => import(pathToFileURL(file).href);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

// Where a URL path of a bundled page lives (app/build.gradle.kts copies
// public/{shared,app,player} and the vendor libraries next to the assets).
const VENDOR = { preact: 'preact', htm: 'htm', three: 'three', qrcode: path.join('qrcode-generator', 'dist') };
function assetFile(urlPath) {
  const parts = urlPath.split('/').filter(Boolean);
  if (parts[0] === 'vendor') return path.join(MODULES, VENDOR[parts[1]] ?? parts[1], ...parts.slice(2));
  const file = urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath;
  if (['shared', 'app', 'player'].includes(parts[0]) && fs.existsSync(path.join(PUBLIC, file))) return path.join(PUBLIC, file);
  return path.join(ASSETS, file);
}

const importMap = (html) => JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
const stylesheets = (html) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
const bodyOf = (html) =>
  /<body[^>]*>([\s\S]*?)<\/body>/
    .exec(html)[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const metas = (html) => [...html.matchAll(/<meta [^>]+>/g)].map((m) => m[0]).sort();

test('demo/app.html mirrors public/app/index.html (+ shim and fake Socket.IO)', () => {
  const real = read(path.join(PUBLIC, 'app', 'index.html'));
  const demo = read(path.join(DEMO, 'app.html'));
  const abs = (href) => new URL(href, 'https://appassets.androidplatform.net/app/').pathname;

  assert.deepEqual(stylesheets(demo), stylesheets(real).map(abs), 'same stylesheets in the same order');
  assert.deepEqual(metas(demo), metas(real), 'same meta tags');
  assert.equal(bodyOf(demo), bodyOf(real), 'same body markup');

  const realMap = importMap(real);
  const demoMap = importMap(demo);
  assert.deepEqual({ ...demoMap, '/socket.io/socket.io.esm.min.js': undefined }, { ...realMap, '/socket.io/socket.io.esm.min.js': undefined });
  assert.equal(demoMap['/socket.io/socket.io.esm.min.js'], '/demo/fake-socket.js');

  const entry = /<script type="module" src="([^"]+)"><\/script>/.exec(real)[1];
  assert.ok(demo.includes(`<script type="module" src="${abs(entry)}"></script>`), 'same module entry, absolute');
  const shim = demo.indexOf('<script src="/demo/frame-shim.js"></script>');
  assert.ok(shim > 0 && shim < demo.indexOf('type="importmap"') && shim < demo.indexOf('type="module"'), 'frame-shim.js runs first');
});

test('the staff app talks to the server only through lib/api.js and lib/live.js', () => {
  const allowed = new Set(['lib/api.js', 'lib/live.js']);
  const offenders = [];
  for (const file of walk(path.join(PUBLIC, 'app')).filter((f) => f.endsWith('.js'))) {
    const rel = path.relative(path.join(PUBLIC, 'app'), file).split(path.sep).join('/');
    if (allowed.has(rel)) continue;
    const text = read(file);
    if (/\bfetch\(\s*[`'"/]|\b(?:window|globalThis)\.fetch\b|XMLHttpRequest|socket\.io|new WebSocket|EventSource/.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], 'network access outside lib/api.js / lib/live.js is invisible to the offline demo');
  assert.match(read(path.join(PUBLIC, 'app', 'lib', 'live.js')), /import \{ io \} from '\/socket\.io\/socket\.io\.esm\.min\.js';/);
  const api = read(path.join(PUBLIC, 'app', 'lib', 'api.js'));
  assert.match(api, /fetch\(`\/api\$\{path\}`/, 'api.js requests /api/... with fetch');
  assert.match(api, /new XMLHttpRequest\(\)[\s\S]*xhr\.open\('POST', '\/api\/media'\)/, 'uploads go through XHR to /api/media');
});

test('the player keeps its offline-demo seam and loads Socket.IO lazily', () => {
  const net = read(path.join(PUBLIC, 'player', 'lib', 'net.js'));
  assert.match(net, /__PM_DEMO__/);
  assert.match(net, /demo\?\.openDevice\) return demo\.openDevice\(deviceKey, on\)/);
  assert.match(net, /demo\?\.openPreview\) return demo\.openPreview\(tableId, on\)/);
  assert.match(net, /window\.parent\.__PM_DEMO__/, 'previews inside the staff app find the demo in their parent');
  for (const file of walk(path.join(PUBLIC, 'player')).filter((f) => f.endsWith('.js'))) {
    const text = read(file);
    assert.doesNotMatch(text, /^import[^;]*socket\.io/m, `${path.basename(file)}: static Socket.IO import (not in the APK)`);
    if (!file.endsWith(path.join('lib', 'net.js'))) assert.doesNotMatch(text, /\bfetch\(/, `${path.basename(file)}: fetch outside lib/net.js`);
  }
  const demoPage = read(path.join(DEMO, 'index.html')) + read(path.join(DEMO, 'demo.js'));
  assert.match(demoPage, /\/player\/\?device=\$\{DEMO_DEVICE_KEY\}/, 'the table pane runs the real player as a device');
});

test('every API call of the staff app has a route in the demo backend', async () => {
  const api = read(path.join(PUBLIC, 'app', 'lib', 'api.js'));
  const METHOD = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', del: 'DELETE' };
  const norm = (p) => p.replace(/\$\{qs\([^)]*\)\}/g, '').replace(/\$\{[^}]+\}/g, ':p').replace(/\/:[a-zA-Z]+/g, '/:p');
  const calls = new Set([...api.matchAll(/\b(get|post|put|patch|del)\(\s*[`'](\/[^`'?]*)[`']/g)].map((m) => `${METHOD[m[1]]} ${norm(m[2])}`));
  calls.add('POST /media'); // uploadMedia (XHR)
  assert.ok(calls.size >= 50, `parsed ${calls.size} API calls from api.js`);

  const { createBackend } = await load(path.join(DEMO, 'backend', 'index.js'));
  const { SAMPLE, MEDIA } = await load(path.join(DEMO, 'data.js'));
  const routes = new Set(createBackend({ sample: SAMPLE, media: MEDIA }).routes().map((r) => r.replace(/ (.*)$/, (_, p) => ` ${norm(p)}`)));
  const missing = [...calls].filter((c) => !routes.has(c));
  assert.deepEqual(missing, [], 'api.js calls without a demo route');
});

test('the demo backend enforces roles and follows the server rules', async () => {
  const { createBackend } = await load(path.join(DEMO, 'backend', 'index.js'));
  const { SAMPLE, MEDIA } = await load(path.join(DEMO, 'data.js'));
  const timers = [];
  const b = createBackend({ sample: SAMPLE, media: MEDIA, schedule: (fn) => timers.push(fn) });
  const call = (method, url, body) => b.request({ method, url: `/api${url}`, body });

  assert.equal((await call('GET', '/floor')).status, 401);
  assert.equal((await call('POST', '/auth/login', { username: 'waiter1', password: 'nope' })).status, 401);
  assert.equal((await call('POST', '/auth/login', { username: 'waiter1', password: '1111' })).status, 200);

  const floor = (await call('GET', '/floor')).data;
  assert.deepEqual(floor.areas.map((a) => a.name), SAMPLE.areas.map((a) => a.name));
  const tables = floor.areas.flatMap((a) => a.tables);
  assert.equal(tables.length, SAMPLE.areas.reduce((n, a) => n + a.tables.length, 0));
  assert.ok(tables.every((t) => t.projectors.length === 1 && t.projectors[0].online), 'one switched-on projector per table');
  const free = tables.find((t) => t.status === 'free');
  const menu = (await call('GET', '/menu')).data;
  const [dishA, dishB] = menu.categories[1].dishes;
  assert.ok(dishA.image_url.startsWith('/media/demo-'), 'menu photos are bundled files');

  // Waiter: scene, order, status moves, table frees.
  const shown = await call('PUT', `/tables/${free.id}/scene`, { scene: { type: 'dish', dishId: dishA.id } });
  assert.deepEqual(shown.data.delivered, { online: 1, acked: 1 });
  assert.equal((await call('PUT', `/tables/${free.id}/scene`, { scene: { type: 'dance' } })).status, 400);
  const order = await call('POST', '/orders', { table_id: free.id, items: [{ dish_id: dishA.id, quantity: 2 }, { dish_id: dishB.id }] });
  assert.equal(order.status, 201);
  assert.equal(order.data.total, dishA.price * 2 + dishB.price);
  assert.equal((await call('GET', `/tables/${free.id}`)).data.status, 'occupied');
  const orderScene = await call('PUT', `/tables/${free.id}/scene`, { scene: { type: 'order', orderId: order.data.id } });
  assert.equal(orderScene.data.scene.order.total, order.data.total, 'order scenes carry the order');
  assert.equal((await call('PATCH', `/orders/${order.data.id}`, { status: 'paid' })).status, 409);
  for (const status of ['preparing', 'served', 'paid']) assert.equal((await call('PATCH', `/orders/${order.data.id}`, { status })).data.status, status);
  assert.equal((await call('GET', `/tables/${free.id}`)).data.status, 'free');
  assert.equal((await call('GET', `/tables/${free.id}/scene`)).data.scene.type, 'welcome', 'a paid order leaves the table');
  assert.equal((await call('GET', '/users')).status, 403);
  assert.equal((await call('PUT', '/settings/theme', { preset: 'royal' })).status, 403);

  // Designer: content yes, prices and orders no.
  b.signInAs('designer');
  assert.equal((await call('PATCH', `/dishes/${dishA.id}`, { description_ar: 'وصف جديد', price: dishA.price })).status, 200);
  const price = await call('PATCH', `/dishes/${dishA.id}`, { price: dishA.price + 500 });
  assert.deepEqual([price.status, price.data.error], [403, 'تعديل الأسعار من صلاحيات المالك']);
  assert.equal((await call('POST', '/dishes', { name_ar: 'طبق', price: 9000 })).status, 403);
  assert.equal((await call('POST', '/dishes', { name_ar: 'طبق' })).data.price, 0);
  assert.equal((await call('GET', '/orders')).status, 403);
  assert.equal((await call('PUT', '/settings/theme', { preset: 'royal' })).data.theme.preset, 'royal');
  const used = (await call('GET', '/media')).data.find((m) => m.used_by.length);
  assert.equal((await call('DELETE', `/media/${used.id}`)).status, 409, 'a used file cannot be deleted');

  // Owner: prices, users, reports from the demo's history, pairing.
  b.signInAs('owner');
  assert.equal((await call('PATCH', `/dishes/${dishA.id}`, { price: dishA.price + 500 })).data.price, dishA.price + 500);
  assert.equal((await call('GET', '/users')).data.length, SAMPLE.users.length);
  const report = (await call('GET', '/reports/summary')).data;
  assert.equal(report.byDay.length, 7);
  assert.ok(report.totals.orders > 0 && report.totals.revenue > 0 && report.topDishes.length > 0, 'reports have data');
  const pair = await call('POST', '/projectors/pairing-codes', { table_id: free.id });
  assert.match(pair.data.code, /^\d{6}$/);
  timers.forEach((fn) => fn()); // the demo's pretend device claims the code
  assert.equal((await call('GET', `/tables/${free.id}`)).data.projectors.length, 2);
  assert.ok((await call('GET', '/activity')).data.some((a) => a.code === 'dish.price'));
});

test('demo data and media are generated from sample-content/', async () => {
  const manifest = JSON.parse(read(path.join(ROOT, 'sample-content', 'manifest.json')));
  const tool = await load(path.join(ROOT, 'android', 'tools', 'make-demo-content.mjs'));
  const data = await load(path.join(DEMO, 'data.js'));
  const hint = 'run: node android/tools/make-demo-content.mjs';
  assert.deepEqual(data.SAMPLE, tool.demoManifest(manifest), `demo/data.js is out of date (${hint})`);
  assert.equal(data.VERSION, JSON.parse(read(path.join(ROOT, 'package.json'))).version, hint);

  const expected = [...tool.referencedFiles(manifest).map(tool.demoName), tool.TABLE_TEXTURE].sort();
  const bundled = fs.readdirSync(path.join(ASSETS, 'media')).sort();
  assert.deepEqual(bundled, expected, `assets/media holds exactly the demo files (${hint})`);
  for (const file of tool.referencedFiles(manifest).map(tool.demoName)) {
    assert.equal(data.MEDIA[file]?.size_bytes, fs.statSync(path.join(ASSETS, 'media', file)).size, `${file}: facts match the file (${hint})`);
  }
  assert.equal(data.TABLE_TEXTURE, `/media/${tool.TABLE_TEXTURE}`);
});

test('local URLs referenced by the bundled pages and scripts resolve', () => {
  const files = [...walk(path.join(ASSETS, 'app')), ...walk(DEMO)].filter((f) => /\.(html|js|css)$/.test(f));
  const problems = [];
  for (const file of files) {
    const text = read(file);
    const refs = [
      ...text.matchAll(/\b(?:src|href)="([^"]+)"/g),
      ...text.matchAll(/(?:\bfrom|\bimport\()\s*'([^']+)'/g),
      ...text.matchAll(/url\('([^']+)'\)/g),
    ].map((m) => m[1]);
    if (file.endsWith('.html') && text.includes('type="importmap"')) refs.push(...Object.values(importMap(text)));
    for (const ref of refs) {
      if (/^(https?:|data:|#|blob:)/.test(ref) || ref.includes('${')) continue;
      if (!ref.startsWith('/') && !ref.startsWith('.')) continue; // bare specifiers come from the import map
      // Relative refs resolve against the page's URL (asset path == URL path).
      const pageUrl = `https://appassets.androidplatform.net/${path.relative(ASSETS, file).split(path.sep).join('/')}`;
      const target = assetFile(new URL(ref, pageUrl).pathname);
      if (!fs.existsSync(target)) problems.push(`${path.relative(ASSETS, file)} → ${ref}`);
    }
  }
  assert.deepEqual(problems, []);
});
