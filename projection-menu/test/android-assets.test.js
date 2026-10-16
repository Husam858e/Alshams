// Guards the pages bundled in the Android app (android/app/src/main/assets)
// against drift: the offline demo runs the real tablet.js / player.js on
// copies of their HTML and on in-memory data, so ids, cue shapes, zones and
// media files must keep matching the server side.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultZones } from '../src/lib/zones.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const PUBLIC = path.join(ROOT, 'public');
// Gradle copies these folders of public/ into the APK next to the assets.
const COPIED_FROM_PUBLIC = ['shared', 'tablet', 'player'];

const read = (file) => fs.readFileSync(file, 'utf8');
const idsOf = (html) => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const demo = await import(pathToFileURL(path.join(ASSETS, 'demo', 'demo-data.js')).href);

// Where an absolute URL path of a bundled page is served from in the APK
// (WebViewAssetLoader: URL path == asset path).
function assetFile(urlPath) {
  const [top] = urlPath.split('/').filter(Boolean);
  return path.join(COPIED_FROM_PUBLIC.includes(top) ? PUBLIC : ASSETS, urlPath);
}

function mediaUrls(value, found = new Set()) {
  if (typeof value === 'string' && value.startsWith('/media/')) found.add(value);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) mediaUrls(v, found);
  return found;
}

test('demo pages keep every element id of the real tablet and player pages', () => {
  for (const page of ['tablet', 'player']) {
    const real = idsOf(read(path.join(PUBLIC, page, 'index.html')));
    const copy = idsOf(read(path.join(ASSETS, 'demo', `${page}.html`)));
    const missing = [...real].filter((id) => !copy.has(id));
    assert.deepEqual(missing, [], `demo/${page}.html is missing ids of public/${page}/index.html`);
  }
});

test('demo tablet patches fetch before tablet.js; demo player swaps Socket.IO for the fake socket', () => {
  const tabletHtml = read(path.join(ASSETS, 'demo', 'tablet.html'));
  const backend = tabletHtml.indexOf('src="/demo/demo-backend.js"');
  const tabletJs = tabletHtml.indexOf('src="/tablet/tablet.js"');
  assert.ok(backend > 0 && tabletJs > backend, 'demo-backend.js must load before tablet.js');
  assert.match(read(path.join(PUBLIC, 'tablet', 'tablet.js')), /fetch\(`\/api\/tablet\$\{path\}`/, 'tablet.js API prefix changed');

  const playerHtml = read(path.join(ASSETS, 'demo', 'player.html'));
  const importMap = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(playerHtml)[1]);
  const specifier = /import \{ io \} from '([^']+)'/.exec(read(path.join(PUBLIC, 'player', 'player.js')))?.[1];
  assert.ok(specifier, 'player.js no longer imports io');
  assert.equal(importMap.imports[specifier], '/demo/fake-socket.js');
  assert.ok(playerHtml.indexOf('type="importmap"') < playerHtml.indexOf('src="/player/player.js"'));
});

test('every media URL of the demo exists in assets/media', () => {
  const source = read(path.join(ASSETS, 'demo', 'demo-data.js'));
  const urls = new Set([...mediaUrls(demo), ...[...source.matchAll(/'(\/media\/[^']+)'/g)].map((m) => m[1])]);
  assert.ok(urls.size >= 10, `expected clips + thumbnails, found ${urls.size}`);
  for (const url of urls) {
    assert.ok(fs.existsSync(path.join(ASSETS, url)), `missing ${url}`);
    assert.match(url, /^\/media\/demo-[a-z-]+\.(webm|jpg)$/);
  }
  assert.equal(demo.CONFIG_CUE.idle.url, '/media/demo-ambient.webm');
});

test('demo zones and config cue match the server defaults', () => {
  assert.equal(demo.TABLE.seats, 4);
  assert.deepEqual(demo.ZONES, defaultZones(demo.TABLE.seats));
  assert.equal(demo.CONFIG_CUE.action, 'config');
  assert.deepEqual(demo.CONFIG_CUE.zones, demo.ZONES);
  assert.deepEqual(demo.CONFIG_CUE.calibration, { corners: [[0, 0], [1, 0], [1, 1], [0, 1]] });
});

test('demo menu is the seed menu with sane prices and a projection per phase', () => {
  assert.deepEqual(demo.CATEGORIES.map((c) => c.name_ar), ['بيتزا', 'سلطات', 'حلويات']);
  const dishes = demo.CATEGORIES.flatMap((c) => c.dishes.map((d) => ({ ...d, category: c.id })));
  assert.equal(dishes.length, 6);
  assert.equal(new Set(dishes.map((d) => d.id)).size, 6, 'dish ids are unique');
  assert.deepEqual(dishes.map((d) => d.price), [12000, 11000, 8000, 7500, 6000, 5500]);
  for (const dish of dishes) {
    assert.equal(dish.category_id, dish.category);
    assert.ok(dish.name_ar && dish.description_ar && dish.thumbnail_url.endsWith('.jpg'));
    for (const phase of ['preview', 'ordered', 'served']) {
      const p = dish.projections[phase];
      assert.equal(p.media.kind, 'video', `${dish.name_en} ${phase}`);
      assert.ok(p.media.url.startsWith('/media/'), 'player.js only plays /media/ URLs');
    }
    assert.equal(dish.projections.preview.loop, true);
    assert.equal(dish.projections.served.loop, false);
  }
  assert.ok(demo.KITCHEN.preparingAfterMs < demo.KITCHEN.servedAfterMs);
});

test('local URLs referenced by the bundled pages and scripts resolve', () => {
  const files = ['app', 'demo'].flatMap((dir) =>
    fs.readdirSync(path.join(ASSETS, dir)).map((name) => path.join(ASSETS, dir, name)),
  );
  const problems = [];
  for (const file of files.filter((f) => /\.(html|js|css)$/.test(f))) {
    const text = read(file);
    const refs = [
      ...text.matchAll(/\b(?:src|href)="([^"]+)"/g),
      ...text.matchAll(/(?:\bfrom|\bimport\()\s*'([^']+)'/g),
      ...text.matchAll(/url\('([^']+)'\)/g),
    ].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|data:|#)/.test(ref)) continue;
      const urlPath = ref.split(/[?#]/)[0];
      const target = urlPath.startsWith('/') ? assetFile(urlPath) : path.resolve(path.dirname(file), urlPath);
      if (!fs.existsSync(target)) problems.push(`${path.relative(ASSETS, file)} → ${ref}`);
    }
  }
  assert.deepEqual(problems, []);
});
