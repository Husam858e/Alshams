import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { TINY_JPEG, fileForm, startServer } from './helpers.js';

let t;
before(async () => {
  t = await startServer({ config: { maxUploadMb: 1 } });
});
after(() => t.close());

const upload = (client, name, bytes, type = 'application/octet-stream', fields) =>
  client.request('POST', '/api/media', fileForm(name, bytes, type, fields));

// Smallest byte patterns the server accepts for each format.
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60)]);
const GLB = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(60)]);

test('upload: images, videos and .glb with metadata; served with immutable caching', async () => {
  const res = await upload(t.as.designer, 'صحن الكباب.jpg', TINY_JPEG, 'image/jpeg');
  assert.equal(res.status, 201);
  const a = res.body;
  assert.equal(a.kind, 'image');
  assert.equal(a.title, 'صحن الكباب', 'Arabic file names survive');
  assert.equal(a.original_name, 'صحن الكباب.jpg');
  assert.equal(a.mime_type, 'image/jpeg');
  assert.equal(a.size_bytes, TINY_JPEG.length);
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.match(a.file_name, /^[0-9a-f-]{36}\.jpg$/);
  assert.equal(a.url, `/media/${a.file_name}`);
  assert.deepEqual(a.used_by, []);
  if (a.width !== null) assert.deepEqual([a.width, a.height], [4, 4]); // ffprobe is optional

  const file = await fetch(t.base + a.url);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('cache-control'), /immutable/);
  assert.equal(file.headers.get('content-type'), 'image/jpeg');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');

  const video = await upload(t.as.owner, 'clip.webm', WEBM, 'video/webm', { title: 'دخان المشاوي' });
  assert.equal(video.status, 201);
  assert.equal(video.body.kind, 'video');
  assert.equal(video.body.title, 'دخان المشاوي');
  const model = await upload(t.as.owner, 'plate.GLB', GLB);
  assert.equal(model.body.kind, 'model3d');
  assert.equal(model.body.mime_type, 'model/gltf-binary');

  const list = (await t.as.designer.get('/api/media')).body;
  assert.equal(list.length, 3);
  assert.equal(list.find((m) => m.id === a.id).uploaded_by_name, 'المصممة');
});

test('upload validation: type, content signature, size, missing file', async () => {
  const gif = await upload(t.as.designer, 'x.gif', Buffer.from('GIF89a......'));
  assert.equal(gif.status, 400);
  assert.match(gif.body.error, /غير مدعوم/);
  const fake = await upload(t.as.designer, 'evil.jpg', Buffer.from('<html><script>alert(1)</script></html>'));
  assert.equal(fake.status, 400);
  assert.match(fake.body.error, /لا يطابق/);
  const big = await upload(t.as.designer, 'big.jpg', Buffer.concat([TINY_JPEG, Buffer.alloc(1024 * 1024 + 10)]));
  assert.equal(big.status, 413);
  const none = await t.as.designer.request('POST', '/api/media', new FormData());
  assert.equal(none.status, 400);
  // Nothing half-written stays behind.
  const known = new Set(t.db.prepare('SELECT file_name FROM media_assets').pluck().all());
  assert.deepEqual(fs.readdirSync(t.config.mediaDir).filter((f) => !known.has(f)), []);
});

test('rename; delete refused while used (names the users), allowed once free', async () => {
  const { owner, designer } = t.as;
  const photo = (await upload(designer, 'p.jpg', TINY_JPEG, 'image/jpeg')).body;
  const renamed = await designer.patch(`/api/media/${photo.id}`, { title: 'صورة الكباب' });
  assert.equal(renamed.body.title, 'صورة الكباب');
  assert.equal((await designer.patch(`/api/media/${photo.id}`, { title: '' })).status, 400);

  const cat = (await designer.post('/api/categories', { name_ar: 'مشاوي', cover_asset_id: photo.id })).body;
  const dish = (await designer.post('/api/dishes', { name_ar: 'كباب', image_asset_id: photo.id })).body;
  await designer.put('/api/settings/theme', { background: { type: 'image', assetId: photo.id } });
  await owner.put('/api/settings/general', { logoAssetId: photo.id });

  const used = (await designer.get('/api/media')).body.find((m) => m.id === photo.id).used_by;
  assert.deepEqual(used.map((u) => u.type).sort(), ['category', 'dish', 'logo', 'theme']);

  const refused = await designer.delete(`/api/media/${photo.id}`);
  assert.equal(refused.status, 409);
  for (const part of ['طبق "كباب"', 'تصنيف "مشاوي"', 'شعار المطعم', 'خلفية']) assert.ok(refused.body.error.includes(part), part);

  await designer.patch(`/api/dishes/${dish.id}`, { image_asset_id: null });
  await designer.patch(`/api/categories/${cat.id}`, { cover_asset_id: null });
  await designer.put('/api/settings/theme', { background: { type: 'preset' } });
  await owner.put('/api/settings/general', { logoAssetId: null });

  const filePath = path.join(t.config.mediaDir, photo.file_name);
  assert.ok(fs.existsSync(filePath));
  assert.equal((await designer.delete(`/api/media/${photo.id}`)).status, 200);
  assert.ok(!fs.existsSync(filePath), 'file removed from disk');
  assert.equal((await fetch(t.base + photo.url)).status, 404);
  assert.ok((await owner.get('/api/activity')).body.some((a) => a.code === 'media.delete'));
});
