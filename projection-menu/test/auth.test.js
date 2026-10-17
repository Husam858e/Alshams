import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { connected, nextEvent, startServer } from './helpers.js';

let t;
before(async () => {
  t = await startServer({ users: false });
});
after(() => t.close());

test('first run: setup creates the owner once and logs in with a secure cookie', async () => {
  const anon = t.client();
  assert.deepEqual((await anon.get('/api/auth/state')).body, { needsSetup: true, user: null });

  const bad = await anon.post('/api/auth/setup', { name: 'أبو علي', username: 'boss', password: '12' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /كلمة المرور/);

  const res = await anon.post('/api/auth/setup', { name: 'أبو علي', username: 'boss', password: 'secret-1' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.user, { id: 1, name: 'أبو علي', username: 'boss', role: 'owner' });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('pm_session='));
  assert.ok(cookie, 'session cookie set');
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${30 * 24 * 3600}`]) assert.ok(cookie.includes(flag), flag);
  assert.ok(!cookie.includes('Secure'), 'plain http on the LAN: no Secure flag');
  assert.match(cookie, /^pm_session=[A-Za-z0-9_-]{43};/);

  const state = (await anon.get('/api/auth/state')).body;
  assert.equal(state.needsSetup, false);
  assert.equal(state.user.role, 'owner');

  // Only the token hash is stored.
  const stored = t.db.prepare('SELECT token_hash FROM sessions').pluck().all();
  assert.equal(stored.length, 1);
  assert.match(stored[0], /^[0-9a-f]{64}$/);
  assert.ok(!cookie.includes(stored[0]));

  const again = await t.client().post('/api/auth/setup', { name: 'x', username: 'other', password: 'secret-2' });
  assert.equal(again.status, 409);
  assert.equal(t.db.prepare('SELECT COUNT(*) FROM users').pluck().get(), 1);
});

test('login: wrong password, unknown user, inactive user and success', async () => {
  const c = t.client();
  const wrong = await c.post('/api/auth/login', { username: 'boss', password: 'nope-nope' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  assert.equal((await c.post('/api/auth/login', { username: 'ghost', password: 'whatever' })).status, 401);
  assert.equal((await c.get('/api/users')).status, 401);

  const ok = await c.post('/api/auth/login', { username: 'BOSS', password: 'secret-1' });
  assert.equal(ok.status, 200, 'usernames are case-insensitive');
  assert.equal(ok.body.user.username, 'boss');
  assert.equal((await c.get('/api/users')).status, 200);
  assert.ok(t.db.prepare('SELECT last_login_at FROM users WHERE id = 1').pluck().get());

  const created = await c.post('/api/users', { name: 'سارة', username: 'sara', password: 'pass-1234', role: 'waiter' });
  assert.equal(created.status, 201);
  await c.delete(`/api/users/${created.body.id}`);
  assert.equal((await t.client().post('/api/auth/login', { username: 'sara', password: 'pass-1234' })).status, 401);
});

test('login rate limit: 10 failures per username+IP, then 429 even with the right password', async () => {
  const c = t.client();
  const owner = t.client();
  await owner.login('boss', 'secret-1');
  await owner.post('/api/users', { name: 'هدف', username: 'target', password: 'right-pass', role: 'waiter' });

  for (let i = 0; i < 10; i++) {
    assert.equal((await c.post('/api/auth/login', { username: 'target', password: `bad-${i}` })).status, 401);
  }
  const blocked = await c.post('/api/auth/login', { username: 'target', password: 'right-pass' });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /محاولات/);
  // Other usernames are not affected.
  assert.equal((await t.client().post('/api/auth/login', { username: 'boss', password: 'secret-1' })).status, 200);
});

test('logout ends the session server-side and clears the cookie', async () => {
  const c = t.client();
  await c.login('boss', 'secret-1');
  const token = c.cookies.get('pm_session');
  const socket = t.live(c);
  await connected(socket);
  const dropped = nextEvent(socket, 'disconnect');
  const res = await c.post('/api/auth/logout');
  assert.equal((await dropped)[0], 'io server disconnect', 'the live channel of that session closes too');
  assert.equal(res.status, 200);
  assert.match(res.headers.getSetCookie()[0], /^pm_session=;.*Max-Age=0/);
  assert.equal((await c.get('/api/auth/state')).body.user, null);

  // The old token is dead even if replayed.
  const replay = await fetch(`${t.base}/api/users`, { headers: { cookie: `pm_session=${token}` } });
  assert.equal(replay.status, 401);
});

test('mutating requests need a JSON content type (CSRF guard)', async () => {
  const c = t.client();
  await c.login('boss', 'secret-1');
  const form = await c.request('POST', '/api/areas', 'name=x', { headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  const plain = await c.request('POST', '/api/auth/logout', 'x', { headers: { 'content-type': 'text/plain' } });
  assert.equal(plain.status, 415);
  const noType = await fetch(`${t.base}/api/auth/logout`, { method: 'POST', headers: { cookie: c.cookieHeader() } });
  assert.equal(noType.status, 415);
  assert.equal((await c.get('/api/auth/state')).body.user.username, 'boss', 'still logged in');
  const badJson = await c.request('POST', '/api/areas', '{oops', {});
  assert.equal(badJson.status, 400);
});

test('own password change logs out the other sessions', async () => {
  const phone = t.client();
  const tablet = t.client();
  await phone.login('boss', 'secret-1');
  await tablet.login('boss', 'secret-1');
  assert.equal((await phone.post('/api/me/password', { current: 'wrong', next: 'secret-2' })).status, 400);
  assert.equal((await phone.post('/api/me/password', { current: 'secret-1', next: 'secret-2' })).status, 200);
  assert.equal((await phone.get('/api/auth/state')).body.user.username, 'boss');
  assert.equal((await tablet.get('/api/auth/state')).body.user, null);
  assert.equal((await t.client().post('/api/auth/login', { username: 'boss', password: 'secret-1' })).status, 401);
  assert.equal((await t.client().post('/api/auth/login', { username: 'boss', password: 'secret-2' })).status, 200);
});

test('users: last active owner cannot be demoted or removed, nor can you remove yourself', async () => {
  const owner = t.client();
  await owner.login('boss', 'secret-2');
  const demote = await owner.patch('/api/users/1', { role: 'waiter' });
  assert.equal(demote.status, 409);
  assert.equal((await owner.delete('/api/users/1')).status, 403);
  assert.equal((await owner.patch('/api/users/1', { is_active: false })).status, 403);

  const second = await owner.post('/api/users', { name: 'شريك', username: 'partner', password: 'partner-1', role: 'owner' });
  assert.equal(second.status, 201);
  assert.equal((await owner.post('/api/users', { name: 'x', username: 'PARTNER', password: 'abcd', role: 'waiter' })).status, 409);
  const res = await owner.patch(`/api/users/${second.body.id}`, { role: 'designer', name: 'شريك مصمم' });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'designer');

  const list = (await owner.get('/api/users')).body;
  assert.ok(list.every((u) => !('password_hash' in u)));
  assert.ok(list.find((u) => u.username === 'partner').is_active);

  const log = (await owner.get('/api/activity')).body.map((a) => a.code);
  for (const code of ['auth.setup', 'auth.login', 'user.create', 'user.deactivate', 'auth.password']) assert.ok(log.includes(code), code);
});

test('a deactivated user is logged out everywhere at once', async () => {
  const owner = t.client();
  await owner.login('boss', 'secret-2');
  const u = (await owner.post('/api/users', { name: 'مؤقت', username: 'temp', password: 'temp-1234', role: 'waiter' })).body;
  const temp = t.client();
  await temp.login('temp', 'temp-1234');
  assert.equal((await temp.get('/api/floor')).status, 200);
  await owner.patch(`/api/users/${u.id}`, { is_active: false });
  assert.equal((await temp.get('/api/floor')).status, 401);
});
