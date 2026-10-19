// Guards the cloud-mode pages of the Android app (android/app/src/main/assets/cloud)
// against drift, without Firebase or emulators:
//   - cloud/app.html and cloud/player.html mirror public/app/index.html and
//     public/player/index.html (+ the start-up layer and the Firebase SDK);
//   - their import maps (and setup.html's) send both the bare 'firebase/*'
//     names and the gstatic URLs the SDK files import each other with to the
//     copies Gradle vendors from node_modules/firebase, at its version;
//   - every Firebase module the cloud code imports is mapped and vendored;
//   - the pasted-config parser reads what the Firebase console shows;
//   - the browser mock checks cloud links like native (CloudPages.kt).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const CLOUD = path.join(ASSETS, 'cloud');
const PUBLIC = path.join(ROOT, 'public');
const FIREBASE = path.join(ROOT, 'node_modules', 'firebase');
const ORIGIN = 'https://appassets.androidplatform.net';

const read = (file) => fs.readFileSync(file, 'utf8');
const load = (file) => import(pathToFileURL(file).href);
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    : [];

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
const moduleEntry = (html) => /<script type="module" src="([^"]+)"><\/script>/.exec(html)[1];

const FIREBASE_VERSION = JSON.parse(read(path.join(FIREBASE, 'package.json'))).version;
// The modules app/build.gradle.kts vendors (firebaseModules).
const GRADLE_MODULES = JSON.parse(
  `[${/val firebaseModules = listOf\(([^)]*)\)/.exec(read(path.join(ROOT, 'android', 'app', 'build.gradle.kts')))[1]}]`,
);
const gstaticUrl = (module) => `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-${module}.js`;
const vendored = (module) => `/vendor/firebase/firebase-${module}.js`;

function firebaseEntries(map) {
  return Object.fromEntries(Object.entries(map).filter(([key]) => key.startsWith('firebase/') || key.includes('gstatic.com/firebasejs/')));
}

test('cloud/app.html mirrors public/app/index.html (+ shim, fake Socket.IO, Firebase)', () => {
  const real = read(path.join(PUBLIC, 'app', 'index.html'));
  const cloud = read(path.join(CLOUD, 'app.html'));
  const abs = (href) => new URL(href, `${ORIGIN}/app/`).pathname;

  assert.deepEqual(stylesheets(cloud), [...stylesheets(real).map(abs), '/cloud/boot.css'], 'same stylesheets, then the start-up layer');
  assert.deepEqual(metas(cloud), metas(real), 'same meta tags');
  assert.equal(bodyOf(cloud), bodyOf(real), 'same body markup (the start-up layer is built in script)');

  const map = importMap(cloud);
  const rest = Object.fromEntries(Object.entries(map).filter(([key]) => !(key in firebaseEntries(map))));
  assert.deepEqual({ ...rest, '/socket.io/socket.io.esm.min.js': undefined }, { ...importMap(real), '/socket.io/socket.io.esm.min.js': undefined });
  assert.equal(map['/socket.io/socket.io.esm.min.js'], '/demo/fake-socket.js');

  assert.equal(moduleEntry(cloud), '/cloud/app.js');
  assert.equal(abs(moduleEntry(real)), '/app/main.js');
  assert.match(read(path.join(CLOUD, 'app.js')), /await import\('\/app\/main\.js'\)/, 'app.js starts the real staff app');
  assert.match(read(path.join(CLOUD, 'app.js')), /__pmInstallShim\(host, \{ realUploads: true \}\)/, 'uploads report real progress');
  const shim = cloud.indexOf('<script src="/demo/frame-shim.js"></script>');
  assert.ok(shim > 0 && shim < cloud.indexOf('type="importmap"') && shim < cloud.indexOf('type="module"'), 'frame-shim.js runs first');
});

test('cloud/player.html mirrors public/player/index.html (+ Firebase)', () => {
  const real = read(path.join(PUBLIC, 'player', 'index.html'));
  const cloud = read(path.join(CLOUD, 'player.html'));
  const abs = (href) => new URL(href, `${ORIGIN}/player/`).pathname;

  assert.deepEqual(stylesheets(cloud), [...stylesheets(real).map(abs), '/cloud/boot.css']);
  assert.deepEqual(metas(cloud), metas(real));
  assert.equal(bodyOf(cloud), bodyOf(real));
  const map = importMap(cloud);
  const rest = Object.fromEntries(Object.entries(map).filter(([key]) => !(key in firebaseEntries(map))));
  assert.deepEqual(rest, importMap(real));
  assert.equal(moduleEntry(cloud), '/cloud/player.js');
  assert.equal(abs(moduleEntry(real)), '/player/main.js');
  const boot = read(path.join(CLOUD, 'player.js'));
  assert.match(boot, /await import\('\/player\/main\.js'\)/);
  assert.match(boot, /window\.__PM_DEMO__ = /, 'the player finds the backend through its demo seam');
  assert.match(boot, /openSettings\('unpaired'\)/, 'an unpaired projector goes back to the pairing code');
});

test('Firebase import maps resolve to the vendored SDK, never to gstatic', () => {
  assert.ok(FIREBASE_VERSION, 'node_modules/firebase is installed');
  assert.deepEqual([...GRADLE_MODULES].sort(), ['app', 'auth', 'firestore', 'storage']);
  // What the vendored files import from each other.
  const sdkImports = new Set();
  for (const module of GRADLE_MODULES) {
    const file = path.join(FIREBASE, `firebase-${module}.js`);
    assert.ok(fs.existsSync(file), `node_modules/firebase/firebase-${module}.js (copied by Gradle)`);
    for (const m of read(file).matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'](https:\/\/www\.gstatic\.com\/firebasejs\/[^"']+)["']/g)) sdkImports.add(m[1]);
  }
  assert.ok(sdkImports.size > 0, 'the SDK files import each other by gstatic URL');

  for (const page of ['cloud/app.html', 'cloud/player.html', 'app/setup.html']) {
    const map = firebaseEntries(importMap(read(path.join(ASSETS, page))));
    const expected = {};
    for (const module of GRADLE_MODULES) {
      expected[`firebase/${module}`] = vendored(module);
      expected[gstaticUrl(module)] = vendored(module);
    }
    assert.deepEqual(map, expected, `${page}: Firebase ${FIREBASE_VERSION} mapped to /vendor/firebase`);
    for (const url of sdkImports) assert.ok(url in map, `${page}: ${url} (imported by the SDK) is mapped`);
  }
});

test('every Firebase module the cloud code imports is mapped and vendored', () => {
  const sources = [...walk(CLOUD), ...walk(path.join(ASSETS, 'app'))].filter((f) => f.endsWith('.js'));
  const used = new Set();
  for (const file of sources) {
    for (const m of read(file).matchAll(/(?:\bfrom|\bimport\()\s*['"](firebase\/[^'"]+|https:\/\/www\.gstatic\.com\/[^'"]+)['"]/g)) used.add(m[1]);
  }
  const map = importMap(read(path.join(CLOUD, 'app.html')));
  for (const specifier of used) assert.ok(specifier in map, `${specifier} is not in the cloud pages' import map (nor vendored by Gradle)`);
});

test('local URLs of the cloud pages resolve in the APK layout', () => {
  const problems = [];
  const fileFor = (urlPath) => {
    const parts = urlPath.split('/').filter(Boolean);
    if (parts[0] === 'vendor' && parts[1] === 'firebase') return path.join(FIREBASE, ...parts.slice(2));
    if (parts[0] === 'vendor') return path.join(ROOT, 'node_modules', parts[1] === 'qrcode' ? 'qrcode-generator/dist' : parts[1], ...parts.slice(2));
    if (['shared', 'app', 'player'].includes(parts[0]) && fs.existsSync(path.join(PUBLIC, urlPath))) return path.join(PUBLIC, urlPath);
    return path.join(ASSETS, urlPath);
  };
  for (const file of walk(CLOUD).filter((f) => /\.(html|js|css)$/.test(f))) {
    const text = read(file);
    const refs = [
      ...text.matchAll(/\b(?:src|href)="([^"]+)"/g),
      ...text.matchAll(/(?:\bfrom|\bimport\()\s*'([^']+)'/g),
    ].map((m) => m[1]);
    if (file.endsWith('.html')) refs.push(...Object.values(importMap(text)));
    for (const ref of refs) {
      if (/^(https?:|data:|#|blob:)/.test(ref) || ref.includes('${')) continue;
      if (!ref.startsWith('/') && !ref.startsWith('.')) continue;
      const pageUrl = `${ORIGIN}/${path.relative(ASSETS, file).split(path.sep).join('/')}`;
      if (!fs.existsSync(fileFor(new URL(ref, pageUrl).pathname))) problems.push(`${path.relative(ASSETS, file)} → ${ref}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the built-in Firebase config is a module exporting null or a project', async () => {
  const builtIn = (await load(path.join(CLOUD, 'firebase-config.js'))).default;
  const { validateFirebaseConfig } = await load(path.join(CLOUD, 'config.js'));
  if (builtIn !== null) validateFirebaseConfig(builtIn); // throws when incomplete
});

test('pasted Firebase configs are read without evaluating them', async () => {
  const { parseFirebaseConfig, chooseConfig, emulatorHost } = await load(path.join(CLOUD, 'config.js'));
  const expected = {
    apiKey: 'AIzaSyD-x_y',
    authDomain: 'alshams-menu.firebaseapp.com',
    projectId: 'alshams-menu',
    storageBucket: 'alshams-menu.firebasestorage.app',
    messagingSenderId: '123456789012',
    appId: '1:123456789012:web:abcdef',
  };
  const consoleSnippet = `// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD-x_y",
  authDomain: "alshams-menu.firebaseapp.com",
  projectId: "alshams-menu",
  storageBucket: "alshams-menu.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);`;
  assert.deepEqual(parseFirebaseConfig(consoleSnippet), expected);
  assert.deepEqual(parseFirebaseConfig(JSON.stringify(expected, null, 2)), expected);
  assert.deepEqual(
    parseFirebaseConfig(`{ 'apiKey': 'AIzaSyD-x_y', /* c */ authDomain: \`alshams-menu.firebaseapp.com\`, projectId: "alshams-menu",
      storageBucket: 'alshams-menu.firebasestorage.app', messagingSenderId: 123456789012, appId: '1:123456789012:web:abcdef', measurementId: '', }`),
    expected,
    'quotes of any kind, comments, numbers, trailing commas',
  );
  // Unknown keys are dropped; the object after "firebaseConfig" wins over earlier braces.
  assert.deepEqual(parseFirebaseConfig(`function x() {}\nvar firebaseConfig = ${JSON.stringify({ ...expected, extra: 'y' })};`), expected);

  const fails = (text, pattern) => assert.throws(() => parseFirebaseConfig(text), (err) => err.name === 'Error' && pattern.test(err.message), text);
  fails('', /الصق/);
  fails('hello', /لم نجد/);
  fails('const firebaseConfig = { apiKey: "k", projectId: "p-1" };', /appId.*storageBucket|storageBucket.*appId/);
  fails('{ apiKey: process.env.KEY, projectId: "p", appId: "a", storageBucket: "b" }', /apiKey/);
  fails('{ apiKey: `${key}`, projectId: "p" }', /محسوبة/);
  fails('{ apiKey: "k", projectId: "p"', /غير مكتملة/);
  fails('{ apiKey: "k\n", projectId: "p" }', /غير مغلق/);
  fails('{ apiKey: "k", nested: { a: 1 } }', /غير مفهومة/);
  fails('{ apiKey: "a key", projectId: "p-1", appId: "a", storageBucket: "b" }', /apiKey/);
  fails('{ apiKey: "k", projectId: "Bad_Id", appId: "a", storageBucket: "b" }', /projectId/);

  assert.deepEqual(chooseConfig(null, null), { config: null, source: null });
  assert.equal(chooseConfig(null, expected).source, 'builtin');
  assert.equal(chooseConfig(expected, { ...expected, projectId: 'other-one' }).config.projectId, 'alshams-menu', 'the saved project wins');
  assert.match(chooseConfig({ apiKey: 'k' }, expected).error, /ناقصة/, 'a broken saved project is reported, not replaced');
  assert.equal(emulatorHost('?emulators=10.0.2.2'), '10.0.2.2');
  assert.equal(emulatorHost('?emulators=evil.example/x'), null);
  assert.equal(emulatorHost(''), null);
});

test('the browser mock checks cloud links like native CloudPages', async () => {
  globalThis.location = new URL(`${ORIGIN}/app/setup.html`);
  const { parseCloudUrl } = await load(path.join(ASSETS, 'app', 'bridge-mock.js'));
  const app = `${ORIGIN}/cloud/app.html`;
  const player = `${ORIGIN}/cloud/player.html?device=p4`;
  // Same cases as CloudTest.kt.
  assert.deepEqual(parseCloudUrl(app), { ok: true, mode: 'APP', normalizedUrl: app });
  assert.deepEqual(parseCloudUrl(`${app}?x=1#/floor`), { ok: true, mode: 'APP', normalizedUrl: app });
  assert.deepEqual(parseCloudUrl(player), { ok: true, mode: 'PLAYER', normalizedUrl: player });
  assert.equal(parseCloudUrl(`${ORIGIN}/cloud/player.html`).ok, false);
  assert.equal(parseCloudUrl(`${app}?emulators=10.0.2.2`).ok, false, 'emulators need a debug build');
  assert.equal(parseCloudUrl(`${app}?emulators=10.0.2.2`, true).normalizedUrl, `${app}?emulators=10.0.2.2`);
  assert.equal(parseCloudUrl('http://192.168.1.10:3000/app/'), null);
  assert.equal(parseCloudUrl(`${ORIGIN}/app/setup.html`), null);
  delete globalThis.location;
});

test('the demo shim and fake socket serve the cloud pages too', () => {
  const shim = read(path.join(ASSETS, 'demo', 'frame-shim.js'));
  assert.match(shim, /window\.__pmInstallShim = install;/, 'cloud pages install it once their backend runs');
  assert.match(shim, /fields\.onProgress = function/, 'real uploads report their own progress');
  assert.match(shim, /fields\.signal = demo\.controller\.signal;/, 'real uploads get an AbortSignal (POST /api/media cancels with it)');
  assert.match(shim, /if \(this\._demo\.controller\) this\._demo\.controller\.abort\(\);/, "xhr.abort() cancels the cloud upload");
  assert.match(shim, /if \(parentHost\) install\(parentHost, \{\}\);/, 'the demo still installs it from the parent page');
  assert.match(read(path.join(ASSETS, 'demo', 'fake-socket.js')), /host\.onConnection\?\.\(/, 'the cloud connection state reaches live.js');
});

// boot.js without the page around it: the bridge and the configs are stubbed,
// the status screen is a recorder.
async function loadBoot() {
  const source = read(path.join(CLOUD, 'boot.js'))
    .replace("import { bridge } from '/app/bridge.js';", 'const bridge = { getState: async () => ({}), openSettings: async () => {} };')
    .replace("import builtIn from './firebase-config.js';", 'const builtIn = null;')
    .replace(/import \{[^}]*\} from '\.\/config\.js';/, 'const chooseConfig = () => ({}), emulatorHost = () => null, emulatorOptions = () => null;');
  assert.doesNotMatch(source, /^import /m, 'every import of boot.js is stubbed');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('the cloud pages start one backend host, also when the network comes back', async (t) => {
  const events = new EventTarget();
  globalThis.addEventListener = events.addEventListener.bind(events);
  globalThis.removeEventListener = events.removeEventListener.bind(events);
  globalThis.document = { createElement: () => ({}) };
  t.after(() => {
    delete globalThis.addEventListener;
    delete globalThis.removeEventListener;
    delete globalThis.document;
  });
  const { startHost } = await loadBoot();
  const shown = [];
  const screen = { busy() {}, show: (content) => shown.push(content.title), hide() {} };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // The first start fails (offline); "online" retries at once instead of waiting.
  let created = 0;
  const hostReady = startHost(async () => {
    created += 1;
    if (created === 1) throw new Error('offline');
    return { id: created };
  }, screen);
  await wait(10);
  assert.equal(created, 1);
  assert.equal(shown.length, 1, 'the failure is shown with a countdown');
  events.dispatchEvent(new Event('online'));
  assert.deepEqual(await hostReady, { id: 2 });

  // Running: later reconnects must not start a second host (two hosts = two
  // sets of listeners and heartbeats, and a "connecting" layer over the app).
  events.dispatchEvent(new Event('online'));
  await wait(1300);
  assert.equal(created, 2);
});

test('the player shows library files from Firebase Storage, and nothing else from outside', async (t) => {
  const page = (search = '') => {
    globalThis.location = new URL(`${ORIGIN}/cloud/player.html${search}`);
    globalThis.window = { location: globalThis.location, parent: null };
  };
  t.after(() => {
    delete globalThis.location;
    delete globalThis.window;
  });
  page('?device=p1');
  const { mediaUrl } = await load(path.join(PUBLIC, 'player', 'lib', 'media.js'));
  const storage = 'https://firebasestorage.googleapis.com/v0/b/pm.firebasestorage.app/o/media%2F12%2Fupload-12.jpg?alt=media&token=abc';
  assert.equal(mediaUrl(storage), storage);
  assert.equal(mediaUrl('/media/uploads/a.jpg'), '/media/uploads/a.jpg', 'server files as before');
  assert.equal(mediaUrl(`${ORIGIN}/media/demo/a.jpg`), '/media/demo/a.jpg');
  for (const bad of [
    'https://firebasestorage.googleapis.com/v0/b/pm/o/other%2Ffile.jpg?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/pm/o/media%2F1%2F..%2Fx.jpg?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/pm/o/media%2F1%2Fa.jpg',
    'http://firebasestorage.googleapis.com/v0/b/pm/o/media%2F1%2Fa.jpg?alt=media',
    'https://example.com/v0/b/pm/o/media%2F1%2Fa.jpg?alt=media',
    'http://127.0.0.1:9199/v0/b/demo-pm.appspot.com/o/media%2F1%2Fa.png?alt=media',
  ]) {
    assert.equal(mediaUrl(bad), null, bad);
  }
  // The Storage emulator only on a page set up with it (debug builds).
  const emulated = 'http://10.0.2.2:9199/v0/b/demo-pm.appspot.com/o/media%2F1%2Fupload-1.png?alt=media&token=t';
  page('?device=p1&emulators=10.0.2.2');
  assert.equal(mediaUrl(emulated), emulated);
  assert.equal(mediaUrl(emulated.replace(':9199', ':8080')), null);
  // A preview inside the staff app: the emulators parameter is on the parent page.
  globalThis.location = new URL(`${ORIGIN}/player/?preview=3`);
  globalThis.window = { location: globalThis.location, parent: { location: new URL(`${ORIGIN}/cloud/app.html?emulators=10.0.2.2`) } };
  assert.equal(mediaUrl(emulated), emulated);
});
