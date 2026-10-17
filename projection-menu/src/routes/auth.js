import { Router } from 'express';
import { nowIso } from '../db/index.js';
import { ROLES, anyStaff, ownerOnly, publicUser } from '../auth/roles.js';
import { burnPasswordCheck, hashPassword, validatePassword, verifyPassword } from '../lib/passwords.js';
import { RateLimiter } from '../lib/rateLimit.js';
import { HttpError, badRequest, bool, conflict, forbidden, has, idParam, notFound, oneOf, str } from '../lib/validate.js';

const LOGIN_FAILURES = { limit: 10, windowMs: 10 * 60 * 1000 };

// Login / first-run setup / own password, and owner-managed user accounts.
export function authRoutes({ db, sessions, activity, live }) {
  const r = Router();
  const failures = new RateLimiter(LOGIN_FAILURES);

  const q = {
    count: db.prepare('SELECT COUNT(*) FROM users').pluck(),
    byUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    list: db.prepare(`
      SELECT id, name, username, role, is_active, created_at, last_login_at
      FROM users ORDER BY is_active DESC, role, name COLLATE NOCASE`),
    insert: db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)'),
    loggedIn: db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    activeOwners: db.prepare("SELECT COUNT(*) FROM users WHERE role = 'owner' AND is_active = 1").pluck(),
  };

  const userDto = (u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    is_active: Boolean(u.is_active),
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  });

  const credentials = (body) => {
    const username = str(body.username, 'اسم المستخدم', { required: true, max: 40 });
    if (!/^[\p{L}\p{N}._-]+$/u.test(username)) throw badRequest('اسم المستخدم يحتوي أحرفاً غير مسموحة (بدون مسافات)');
    const password = body.password;
    const problem = validatePassword(password);
    if (problem) throw badRequest(problem);
    return { username, password };
  };

  // ── Session ─────────────────────────────────────────────────────

  r.get('/auth/state', (req, res) => {
    res.json({ needsSetup: q.count.get() === 0, user: publicUser(req.user) ?? null });
  });

  // First run: create the owner account (only while there are no users).
  r.post('/auth/setup', async (req, res) => {
    if (q.count.get() > 0) throw conflict('تم إعداد النظام مسبقاً. سجّل الدخول بحساب المالك.');
    const name = str(req.body.name, 'الاسم', { required: true, max: 80 });
    const { username, password } = credentials(req.body);
    const hash = await hashPassword(password);
    const id = db.transaction(() => {
      if (q.count.get() > 0) throw conflict('تم إعداد النظام مسبقاً. سجّل الدخول بحساب المالك.');
      return q.insert.run(name, username, hash, 'owner').lastInsertRowid;
    })();
    const user = q.byId.get(id);
    sessions.start(req, res, user.id);
    q.loggedIn.run(nowIso(), user.id);
    activity.log(user, 'auth.setup', { username });
    res.status(201).json({ user: publicUser(user) });
  });

  r.post('/auth/login', async (req, res) => {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password) throw badRequest('أدخل اسم المستخدم وكلمة المرور');
    const key = `${username.toLowerCase()}|${req.ip}`;
    if (failures.isLimited(key)) {
      throw new HttpError(429, 'محاولات دخول فاشلة كثيرة. انتظر 10 دقائق ثم حاول مجدداً.');
    }
    const user = q.byUsername.get(username);
    const ok = user ? user.is_active && (await verifyPassword(password, user.password_hash)) : await burnPasswordCheck(password);
    if (!ok) {
      failures.hit(key);
      throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    failures.reset(key);
    sessions.start(req, res, user.id);
    q.loggedIn.run(nowIso(), user.id);
    activity.log(user, 'auth.login', { username: user.username });
    res.json({ user: publicUser(user) });
  });

  r.post('/auth/logout', (req, res) => {
    live.disconnectSession(req.sessionHash);
    sessions.end(req, res);
    res.json({ ok: true });
  });

  r.post('/me/password', anyStaff, async (req, res) => {
    const user = q.byId.get(req.user.id);
    if (typeof req.body.current !== 'string' || !(await verifyPassword(req.body.current, user.password_hash))) {
      throw badRequest('كلمة المرور الحالية غير صحيحة');
    }
    const problem = validatePassword(req.body.next);
    if (problem) throw badRequest(problem);
    q.setPassword.run(await hashPassword(req.body.next), user.id);
    sessions.endAllForUser(user.id, req.sessionHash); // other devices log out
    live.disconnectUser(user.id, req.sessionHash);
    activity.log(req.user, 'auth.password', { username: user.username });
    res.json({ ok: true });
  });

  // ── Users (owner) ───────────────────────────────────────────────

  const loadUser = (id) => {
    const user = q.byId.get(idParam(id, 'المستخدم'));
    if (!user) throw notFound('المستخدم غير موجود');
    return user;
  };

  // Never leave the restaurant without an active owner.
  const assertKeepsAnOwner = (user, nextRole, nextActive) => {
    const losesOwner = user.role === 'owner' && user.is_active && (nextRole !== 'owner' || !nextActive);
    if (losesOwner && q.activeOwners.get() <= 1) throw conflict('لا يمكن إزالة آخر مالك نشط للنظام');
  };

  r.get('/users', ownerOnly, (_req, res) => res.json(q.list.all().map(userDto)));

  r.post('/users', ownerOnly, async (req, res) => {
    const name = str(req.body.name, 'الاسم', { required: true, max: 80 });
    const role = oneOf(req.body.role, 'الدور', ROLES, { required: true });
    const { username, password } = credentials(req.body);
    if (q.byUsername.get(username)) throw conflict('اسم المستخدم مستخدم مسبقاً');
    const id = q.insert.run(name, username, await hashPassword(password), role).lastInsertRowid;
    activity.log(req.user, 'user.create', { name, username, role });
    res.status(201).json(userDto(q.byId.get(id)));
  });

  r.patch('/users/:id', ownerOnly, async (req, res) => {
    const user = loadUser(req.params.id);
    const b = req.body;
    const next = {
      name: has(b, 'name') ? str(b.name, 'الاسم', { required: true, max: 80 }) : user.name,
      role: has(b, 'role') ? oneOf(b.role, 'الدور', ROLES, { required: true }) : user.role,
      is_active: has(b, 'is_active') ? (bool(b.is_active) ? 1 : 0) : user.is_active,
    };
    if (user.id === req.user.id && !next.is_active) throw forbidden('لا يمكنك تعطيل حسابك');
    assertKeepsAnOwner(user, next.role, next.is_active);
    let passwordHash = null;
    if (has(b, 'password')) {
      const problem = validatePassword(b.password);
      if (problem) throw badRequest(problem);
      passwordHash = await hashPassword(b.password);
    }
    db.transaction(() => {
      assertKeepsAnOwner(q.byId.get(user.id), next.role, next.is_active); // again, after the await
      db.prepare('UPDATE users SET name = ?, role = ?, is_active = ? WHERE id = ?').run(next.name, next.role, next.is_active, user.id);
      if (passwordHash) q.setPassword.run(passwordHash, user.id);
    })();
    // New password, lost access or another role: sign that user out (except this session).
    const revoke = passwordHash || !next.is_active || next.role !== user.role;
    if (revoke) {
      const keep = user.id === req.user.id ? req.sessionHash : null;
      sessions.endAllForUser(user.id, keep);
      live.disconnectUser(user.id, keep);
    }
    activity.log(req.user, next.is_active || !user.is_active ? 'user.update' : 'user.deactivate', {
      name: next.name,
      username: user.username,
      changes: Object.keys(b).filter((k) => ['name', 'role', 'is_active', 'password'].includes(k)),
    });
    res.json(userDto(q.byId.get(user.id)));
  });

  // Soft delete: deactivate and end every session (orders keep the name).
  r.delete('/users/:id', ownerOnly, (req, res) => {
    const user = loadUser(req.params.id);
    if (user.id === req.user.id) throw forbidden('لا يمكنك حذف حسابك');
    assertKeepsAnOwner(user, user.role, 0);
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);
    sessions.endAllForUser(user.id);
    live.disconnectUser(user.id);
    activity.log(req.user, 'user.deactivate', { name: user.name, username: user.username });
    res.json(userDto(q.byId.get(user.id)));
  });

  return r;
}
