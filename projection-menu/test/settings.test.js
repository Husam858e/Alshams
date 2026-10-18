import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { DEFAULT_GENERAL, DEFAULT_THEME } from '../src/services/settings.js';
import { connected, makeTable, nextEvent, startServer } from './helpers.js';

let t;
before(async () => {
  t = await startServer();
});
after(() => t.close());

test('defaults match the contract', async () => {
  const s = (await t.as.waiter.get('/api/settings')).body;
  assert.deepEqual(s.general, { ...DEFAULT_GENERAL });
  assert.deepEqual(s.general.restaurantName, 'مطعم الشمس');
  assert.equal(s.general.currency, 'د.ع');
  assert.deepEqual(s.theme, JSON.parse(JSON.stringify(DEFAULT_THEME)));
  assert.equal(s.theme.accent, '#d4a056');
  assert.equal(s.logo_url, null);
  assert.equal(s.background_url, null);
});

test('general (owner) and theme (owner + designer): partial updates with validation', async () => {
  const general = await t.as.owner.put('/api/settings/general', { restaurantName: 'مطعم النخيل', welcomeText: 'مرحباً بكم' });
  assert.equal(general.status, 200);
  assert.equal(general.body.general.restaurantName, 'مطعم النخيل');
  assert.equal(general.body.general.currency, 'د.ع', 'untouched keys keep their value');
  assert.equal((await t.as.owner.put('/api/settings/general', { restaurantName: '' })).status, 400);
  assert.equal((await t.as.owner.put('/api/settings/general', { logoAssetId: 77 })).status, 400);
  assert.equal((await t.as.designer.put('/api/settings/general', { footerText: 'x' })).status, 403);

  const theme = await t.as.designer.put('/api/settings/theme', {
    preset: 'royal',
    accent: '#C9A45C',
    font: 'Tajawal',
    cardStyle: 'solid',
    showCalories: true,
    pageSeconds: 20,
    idleSeconds: 120,
  });
  assert.equal(theme.status, 200);
  assert.deepEqual(
    { ...theme.body.theme },
    {
      preset: 'royal',
      accent: '#c9a45c',
      background: { type: 'preset', assetId: null },
      font: 'Tajawal',
      cardStyle: 'solid',
      showPrices: true,
      showCalories: true,
      showDescriptions: true,
      pageSeconds: 20,
      idleSeconds: 120,
    },
  );
  for (const bad of [{ preset: 'neon' }, { accent: 'gold' }, { font: 'Arial' }, { pageSeconds: 1 }, { background: { type: 'image' } }]) {
    assert.equal((await t.as.designer.put('/api/settings/theme', bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await t.as.waiter.put('/api/settings/theme', { preset: 'noir' })).status, 403);
  assert.equal((await t.as.waiter.get('/api/activity')).status, 403);
  const log = (await t.as.owner.get('/api/activity')).body;
  const codes = log.map((a) => a.code);
  assert.ok(codes.includes('settings.general') && codes.includes('settings.theme'));
  assert.equal(log.find((a) => a.code === 'settings.theme').summary, 'تعديل تصميم العرض: نمط ملكي', 'the preset is named in Arabic');
});

test('every change is broadcast as settings:changed to staff and projectors', async () => {
  const table = makeTable(t, { number: 9 });
  const staff = t.live(t.as.designer);
  const player = t.player(table.deviceKey);
  const boot = await nextEvent(player, 'bootstrap');
  await connected(staff);
  assert.equal(boot.settings.general.restaurantName, 'مطعم النخيل');

  let events = [nextEvent(staff, 'settings:changed'), nextEvent(player, 'settings:changed')];
  await t.as.owner.put('/api/settings/general', { welcomeTitle: 'حياكم الله' });
  await Promise.all(events);

  events = [nextEvent(staff, 'settings:changed'), nextEvent(player, 'settings:changed')];
  await t.as.designer.put('/api/settings/theme', { preset: 'garden' });
  await Promise.all(events);

  const res = await fetch(`${t.base}/api/player/bootstrap?key=${encodeURIComponent(table.deviceKey)}`);
  const bootstrap = await res.json();
  assert.equal(bootstrap.settings.general.welcomeTitle, 'حياكم الله');
  assert.equal(bootstrap.settings.theme.preset, 'garden');
});
