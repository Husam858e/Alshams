import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { TINY_JPEG, connected, fileForm, makeTable, nextEvent, startServer } from './helpers.js';

let t;
before(async () => {
  t = await startServer();
});
after(() => t.close());

const upload = async (name, bytes, type) => (await t.as.designer.request('POST', '/api/media', fileForm(name, bytes, type))).body;

test('categories and dishes: create, edit, DTO shape with media URLs and badges', async () => {
  const { designer } = t.as;
  const photo = await upload('kebab.jpg', TINY_JPEG, 'image/jpeg');
  const cat = await designer.post('/api/categories', { name_ar: 'مشاوي', name_en: 'Grills', icon: '🔥', cover_asset_id: photo.id });
  assert.equal(cat.status, 201);
  assert.equal(cat.body.cover_url, photo.url);
  assert.equal(cat.body.is_visible, true);

  const dish = await designer.post('/api/dishes', {
    category_id: cat.body.id,
    name_ar: 'كباب عراقي',
    description_ar: 'لحم غنم على الفحم',
    image_asset_id: photo.id,
    badges: 'حار، الأكثر طلباً',
    calories: 780,
    prep_minutes: 18,
    is_featured: true,
  });
  assert.equal(dish.status, 201);
  assert.deepEqual(dish.body.badges, ['حار', 'الأكثر طلباً']);
  assert.equal(dish.body.image_url, photo.url);
  assert.equal(dish.body.video_url, null);
  assert.equal(dish.body.model_url, null);
  assert.equal(dish.body.is_available, true);
  assert.equal(dish.body.is_featured, true);

  // Wrong media kind / missing file / too many badges.
  assert.equal((await designer.patch(`/api/dishes/${dish.body.id}`, { video_asset_id: photo.id })).status, 400);
  assert.equal((await designer.patch(`/api/dishes/${dish.body.id}`, { image_asset_id: 9999 })).status, 400);
  assert.equal((await designer.patch(`/api/dishes/${dish.body.id}`, { badges: Array(9).fill('x').map((x, i) => x + i) })).status, 400);
  assert.equal((await designer.post('/api/dishes', { name_ar: '' })).status, 400);
  assert.equal((await designer.post('/api/dishes', { name_ar: 'x', category_id: 999 })).status, 400);

  const edited = await designer.patch(`/api/dishes/${dish.body.id}`, { is_available: false, badges: [] });
  assert.equal(edited.body.is_available, false);
  assert.deepEqual(edited.body.badges, []);

  const menu = (await t.as.waiter.get('/api/menu')).body;
  assert.equal(menu.categories.length, 1);
  assert.equal(menu.categories[0].dishes[0].name_ar, 'كباب عراقي');
  assert.equal(menu.categories[0].dishes[0].is_available, false, 'staff see unavailable dishes too');
  assert.deepEqual(menu.uncategorized, []);
});

test('ordering categories and dishes; moving and deleting', async () => {
  const { owner } = t.as;
  const a = (await owner.post('/api/categories', { name_ar: 'أ' })).body;
  const b = (await owner.post('/api/categories', { name_ar: 'ب' })).body;
  const ids = (await owner.get('/api/menu')).body.categories.map((c) => c.id);
  const reversed = [...ids].reverse();
  const res = await owner.put('/api/categories/order', { ids: reversed });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.categories.map((c) => c.id), reversed);
  assert.equal((await owner.put('/api/categories/order', { ids: [a.id, a.id] })).status, 400);
  assert.equal((await owner.put('/api/categories/order', { ids: [12345] })).status, 400);

  const d1 = (await owner.post('/api/dishes', { name_ar: 'واحد', category_id: a.id, price: 1000 })).body;
  const d2 = (await owner.post('/api/dishes', { name_ar: 'اثنان', category_id: a.id, price: 2000 })).body;
  const d3 = (await owner.post('/api/dishes', { name_ar: 'ثلاثة', category_id: a.id, price: 3000 })).body;
  assert.deepEqual([d1.sort_order, d2.sort_order, d3.sort_order], [0, 1, 2]);
  const ordered = await owner.put('/api/dishes/order', { category_id: a.id, ids: [d3.id, d1.id, d2.id] });
  assert.equal(ordered.status, 200);
  assert.deepEqual(ordered.body.categories.find((c) => c.id === a.id).dishes.map((d) => d.id), [d3.id, d1.id, d2.id]);
  assert.equal((await owner.put('/api/dishes/order', { category_id: b.id, ids: [d1.id] })).status, 400, 'dish of another category');

  // Moving appends to the end of the target category.
  const moved = (await owner.patch(`/api/dishes/${d1.id}`, { category_id: b.id })).body;
  assert.equal(moved.category_id, b.id);
  assert.equal(moved.sort_order, 0);

  // Deleting a category leaves its dishes uncategorized.
  assert.equal((await owner.delete(`/api/categories/${a.id}`)).status, 200);
  const menu = (await owner.get('/api/menu')).body;
  assert.deepEqual(menu.uncategorized.map((d) => d.id).sort(), [d2.id, d3.id].sort());
  assert.equal((await owner.delete(`/api/dishes/${d2.id}`)).status, 200);
  assert.equal((await owner.get('/api/menu')).body.uncategorized.length, 1);
  assert.equal((await owner.delete(`/api/dishes/${d2.id}`)).status, 404);
});

test('menu changes reach staff (/live) and projectors (/player); players only see guest-visible items', async () => {
  const table = makeTable(t, { number: 3 });
  const staff = t.live(t.as.waiter);
  const player = t.player(table.deviceKey);
  const boot = await nextEvent(player, 'bootstrap');
  await connected(staff);
  const hidden = (await t.as.owner.post('/api/categories', { name_ar: 'سري', is_visible: false })).body;
  await t.as.owner.post('/api/dishes', { name_ar: 'مخفي', category_id: hidden.id, price: 1 });
  assert.ok(boot.menu.categories.every((c) => c.is_visible));

  const toStaff = nextEvent(staff, 'menu:changed');
  const toPlayer = nextEvent(player, 'menu:changed');
  await t.as.designer.patch(`/api/categories/${hidden.id}`, { description_ar: 'وصف' });
  await Promise.all([toStaff, toPlayer]);

  const res = await fetch(`${t.base}/api/player/bootstrap`, { headers: { 'x-device-key': table.deviceKey } });
  const bootstrap = await res.json();
  assert.ok(!bootstrap.menu.categories.some((c) => c.id === hidden.id), 'hidden category not sent to players');
  for (const c of bootstrap.menu.categories) assert.ok(c.dishes.every((d) => d.is_available));
  assert.ok((await t.as.owner.get('/api/menu')).body.categories.some((c) => c.id === hidden.id), 'staff still see it');
});
