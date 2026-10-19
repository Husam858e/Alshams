// sample-content/ (used by `npm run seed` and the Android demo) is complete
// and loads into a working restaurant.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { config as baseConfig } from '../src/config.js';
import { loadSampleContent } from '../src/db/sampleContent.js';
import { Client, startServer } from './helpers.js';

const SAMPLE = path.join(baseConfig.root, 'sample-content');
const manifest = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'manifest.json'), 'utf8'));

let t;
before(async () => {
  t = await startServer({ users: false });
});
after(() => t.close());

test('manifest: 5 categories of 3-4 dishes, realistic IQD prices, files and credits for every image', () => {
  assert.deepEqual(manifest.categories.map((c) => c.name_ar), ['مقبلات', 'مشاوي', 'بيتزا', 'حلويات', 'مشروبات']);
  const credits = fs.readFileSync(path.join(SAMPLE, 'CREDITS.md'), 'utf8');
  const files = new Set();
  for (const c of manifest.categories) {
    assert.ok(c.dishes.length >= 3 && c.dishes.length <= 4, c.name_ar);
    files.add(c.cover);
    for (const d of c.dishes) {
      assert.ok(d.name_ar && d.name_en && d.description_ar, d.name_en);
      assert.ok(Number.isInteger(d.price) && d.price >= 1000 && d.price <= 30000, `${d.name_en} price`);
      assert.ok(Array.isArray(d.badges));
      files.add(d.image);
      if (d.video) files.add(d.video);
    }
  }
  for (const file of files) {
    const buf = fs.readFileSync(path.join(SAMPLE, 'images', file));
    if (file.endsWith('.jpg')) assert.ok(buf[0] === 0xff && buf[1] === 0xd8, `${file} is a JPEG`);
    else assert.ok(file.endsWith('.webm') && buf.readUInt32BE(0) === 0x1a45dfa3, `${file} is a WebM video`);
    assert.ok(buf.length < 700 * 1024, `${file} is web-sized`);
    assert.ok(credits.includes(`| ${file} |`), `${file} credited`);
  }
  assert.deepEqual(
    manifest.areas.map((a) => [a.name, a.tables.map((x) => x.number)]),
    [
      ['الصالة الرئيسية', [1, 2, 3, 4, 5, 6]],
      ['التراس', [7, 8, 9, 10]],
      ['VIP', [11, 12]],
    ],
  );
  assert.deepEqual(
    manifest.users.map((u) => [u.username, u.password, u.role]),
    [
      ['owner', 'owner1234', 'owner'],
      ['designer', 'design1234', 'designer'],
      ['waiter1', '1111', 'waiter'],
      ['waiter2', '2222', 'waiter'],
    ],
  );
});

test('loading the sample restaurant: users log in, menu has photos, every table has a projector', async () => {
  const result = await loadSampleContent({ db: t.db, mediaDir: t.config.mediaDir, sampleDir: SAMPLE });
  assert.equal(result.categories, 5);
  assert.equal(result.projectors.length, 12);

  const owner = new Client(t.base);
  await owner.login('owner', 'owner1234');
  await new Client(t.base).login('waiter2', '2222');

  const menu = (await owner.get('/api/menu')).body;
  assert.equal(menu.categories.length, 5);
  for (const c of menu.categories) {
    assert.ok(c.cover_url, `${c.name_ar} cover`);
    for (const d of c.dishes) {
      assert.ok(d.image_url, `${d.name_ar} photo`);
      const img = await fetch(t.base + d.image_url);
      assert.equal(img.status, 200);
      await img.arrayBuffer();
    }
  }
  assert.ok(menu.categories.flatMap((c) => c.dishes).some((d) => d.is_featured), 'featured dishes for the welcome scene');

  const floor = (await owner.get('/api/floor')).body;
  assert.deepEqual(floor.areas.map((a) => a.tables.length), [6, 4, 2]);
  assert.ok(floor.areas.every((a) => a.tables.every((x) => x.projectors.length === 1)));

  const settings = (await owner.get('/api/settings')).body;
  assert.equal(settings.general.restaurantName, 'مطعم الشمس');
  assert.equal(settings.theme.preset, 'noir');

  const media = (await owner.get('/api/media')).body;
  assert.equal(media.length, result.assets);
  assert.ok(media.every((m) => m.used_by.length > 0), 'every sample file is used');
  const video = media.find((m) => m.kind === 'video');
  assert.equal(video.mime_type, 'video/webm');
  const grill = menu.categories.flatMap((c) => c.dishes).find((d) => d.name_en === 'Mixed Grill');
  assert.equal(grill.video_url, video.url);
});
