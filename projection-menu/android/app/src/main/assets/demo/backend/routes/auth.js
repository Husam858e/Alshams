// Demo backend: sign-in, own password, user accounts (owner) and the
// public /api/info (mirrors src/routes/auth.js and src/routes/system.js).

import { ROLES, anyStaff, ownerOnly } from '../roles.js';
import { HttpError, badRequest, bool, conflict, forbidden, has, idParam, notFound, oneOf, str, validatePassword } from '../validate.js';
import { VERSION } from '../../data.js';

// An address that looks like a restaurant LAN, for the QR codes the owner sees.
const EXAMPLE_SERVER = 'http://192.168.1.10:3000';

// Username + password of a new account, checked like the server does.
export function credentials(body) {
  const username = str(body.username, 'اسم المستخدم', { required: true, max: 40 });
  if (!/^[\p{L}\p{N}._-]+$/u.test(username)) throw badRequest('اسم المستخدم يحتوي أحرفاً غير مسموحة (بدون مسافات)');
  const problem = validatePassword(body.password);
  if (problem) throw badRequest(problem);
  return { username, password: body.password };
}

export function authRoutes(route, { state: s, user, setSessionUser, log, live, nowIso, dto }) {
  const userDto = (u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    is_active: Boolean(u.is_active),
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  });
  dto.user = userDto;
  const byUsername = (name) => s.users.find((u) => u.username.toLowerCase() === String(name).toLowerCase());
  const activeOwners = () => s.users.filter((u) => u.role === 'owner' && u.is_active).length;

  const loadUser = (id) => {
    const u = s.users.find((x) => x.id === idParam(id, 'المستخدم'));
    if (!u) throw notFound('المستخدم غير موجود');
    return u;
  };

  const assertKeepsAnOwner = (u, nextRole, nextActive) => {
    const losesOwner = u.role === 'owner' && u.is_active && (nextRole !== 'owner' || !nextActive);
    if (losesOwner && activeOwners() <= 1) throw conflict('لا يمكن إزالة آخر مالك نشط للنظام');
  };

  route('GET', '/info', null, () => ({ app: 'projection-menu', version: VERSION, restaurantName: s.settings.general.restaurantName }));

  route('GET', '/auth/state', null, () => ({ needsSetup: false, user: dto.publicUser(user()) ?? null }));

  route('POST', '/auth/setup', null, () => {
    throw conflict('تم إعداد النظام مسبقاً. سجّل الدخول بحساب المالك.');
  });

  route('POST', '/auth/login', null, ({ body }) => {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) throw badRequest('أدخل اسم المستخدم وكلمة المرور');
    const u = byUsername(username);
    if (!u || !u.is_active || u.password !== password) throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    setSessionUser(u.id);
    u.last_login_at = nowIso();
    log(u, 'auth.login', { username: u.username });
    return { user: dto.publicUser(u) };
  });

  route('POST', '/auth/logout', null, () => {
    setSessionUser(null);
    return { ok: true };
  });

  route('POST', '/me/password', anyStaff, ({ body, user: me }) => {
    if (typeof body.current !== 'string' || body.current !== me.password) throw badRequest('كلمة المرور الحالية غير صحيحة');
    const problem = validatePassword(body.next);
    if (problem) throw badRequest(problem);
    me.password = body.next;
    log(me, 'auth.password', { username: me.username });
    return { ok: true };
  });

  // ── Users (owner) ──

  route('GET', '/users', ownerOnly, () =>
    [...s.users]
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name, 'ar'))
      .map(userDto),
  );

  route('POST', '/users', ownerOnly, ({ body, user: me }) => {
    const name = str(body.name, 'الاسم', { required: true, max: 80 });
    const role = oneOf(body.role, 'الدور', ROLES, { required: true });
    const { username, password } = credentials(body);
    if (byUsername(username)) throw conflict('اسم المستخدم مستخدم مسبقاً');
    const u = { id: s.nextId('user'), name, username, password, role, is_active: true, created_at: nowIso(), last_login_at: null };
    s.users.push(u);
    log(me, 'user.create', { name, username, role });
    return { __status: 201, data: userDto(u) };
  });

  route('PATCH', '/users/:id', ownerOnly, ({ params, body: b, user: me }) => {
    const u = loadUser(params.id);
    const next = {
      name: has(b, 'name') ? str(b.name, 'الاسم', { required: true, max: 80 }) : u.name,
      role: has(b, 'role') ? oneOf(b.role, 'الدور', ROLES, { required: true }) : u.role,
      is_active: has(b, 'is_active') ? bool(b.is_active) : u.is_active,
    };
    if (u.id === me.id && !next.is_active) throw forbidden('لا يمكنك تعطيل حسابك');
    assertKeepsAnOwner(u, next.role, next.is_active);
    if (has(b, 'password')) {
      const problem = validatePassword(b.password);
      if (problem) throw badRequest(problem);
      u.password = b.password;
    }
    const wasActive = u.is_active;
    Object.assign(u, next);
    log(me, next.is_active || !wasActive ? 'user.update' : 'user.deactivate', {
      name: next.name,
      username: u.username,
      changes: Object.keys(b).filter((k) => ['name', 'role', 'is_active', 'password'].includes(k)),
    });
    // The owner changed their own role: the app re-checks the session.
    if (u.id === me.id && next.role !== me.role) live.staff('floor:changed', {});
    return userDto(u);
  });

  route('DELETE', '/users/:id', ownerOnly, ({ params, user: me }) => {
    const u = loadUser(params.id);
    if (u.id === me.id) throw forbidden('لا يمكنك حذف حسابك');
    assertKeepsAnOwner(u, u.role, false);
    u.is_active = false;
    log(me, 'user.deactivate', { name: u.name, username: u.username });
    return userDto(u);
  });

  route('GET', '/system/server-info', ownerOnly, () => ({
    publicBaseUrl: EXAMPLE_SERVER,
    lanUrls: [EXAMPLE_SERVER],
    apkAvailable: false,
    apkUrl: '/app.apk',
    apkSize: null,
    apkUpdatedAt: null,
  }));
}
