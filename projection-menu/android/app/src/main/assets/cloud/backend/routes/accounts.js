// Cloud mode: sign-in, first-run setup, own password and staff accounts on
// Firebase Auth (see "Accounts" in docs/cloud-architecture.md), and the
// public / system info routes.
//
// A staff account = an Auth account (synthetic email, prefixed password) +
// roles/{uid} (the role the security rules trust) + users/{id} (the app's
// user row) + logins/{username} (which email to sign in with). The users
// spec's extraWrites (staff.js) keeps roles/ and logins/ in step with
// users/ for every change made through the demo's handlers.

import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { VERSION } from '../../../demo/data.js';
import { anyStaff, ownerOnly, publicUser } from '../../../demo/backend/roles.js';
import { credentials } from '../../../demo/backend/routes/auth.js';
import { HttpError, badRequest, conflict, has, str, validatePassword } from '../../../demo/backend/validate.js';
import { httpErrorOf, withSecondaryAuth, withTimeout } from '../firebase.js';
import { DEFAULT_GENERAL, DEFAULT_THEME, ID_KINDS, authPassword, loginKey, staffEmail } from '../schema.js';

const BAD_LOGIN = 'اسم المستخدم أو كلمة المرور غير صحيحة';
const SETUP_DONE = 'تم إعداد النظام مسبقاً. سجّل الدخول بحساب المالك.';
const SETUP_TIMEOUT_MS = 20000;
const WRONG_PASSWORD_CODES = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/user-disabled', 'auth/invalid-login-credentials'];

export function accountRoutes(route, cloud) {
  const { s, ctx, services, nowIso } = cloud;
  const { auth, db } = services;
  const demoCreateUser = cloud.demo('POST', '/users');
  const demoUpdateUser = cloud.demo('PATCH', '/users/:id');

  // A new Auth account for user `userId` (the owner stays signed in). -> {uid, email}
  async function createAccount(userId, password) {
    const email = staffEmail(userId);
    try {
      const uid = await withSecondaryAuth(services, async (secondary) => {
        const cred = await createUserWithEmailAndPassword(secondary, email, authPassword(password));
        await signOut(secondary);
        return cred.user.uid;
      });
      return { uid, email };
    } catch (err) {
      if (err?.code === 'auth/operation-not-allowed') throw new HttpError(503, 'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في مشروع Firebase (Authentication).');
      throw httpErrorOf(err);
    }
  }

  // ── Public ──

  route('GET', '/info', null, async () => {
    let restaurantName = s.settings.general.restaurantName;
    if (!cloud.user()) {
      try {
        restaurantName = (await getDoc(doc(db, 'settings', 'general'))).data()?.restaurantName ?? restaurantName;
      } catch {
        // offline: the default name
      }
    }
    return { app: 'projection-menu', version: VERSION, mode: 'cloud', restaurantName };
  });

  route('GET', '/auth/state', null, async () => {
    await cloud.whenReady();
    const me = cloud.user();
    if (me) return { needsSetup: false, user: publicUser(me) };
    return { needsSetup: await cloud.needsSetup(), user: null };
  });

  // First run: the owner's account and the restaurant's first documents, in one batch.
  route('POST', '/auth/setup', null, async ({ body }) => {
    if (!(await cloud.needsSetup())) throw conflict(SETUP_DONE);
    const name = str(body.name, 'الاسم', { required: true, max: 80 });
    const { username, password } = credentials(body);
    if (auth.currentUser) await signOut(auth);
    const email = staffEmail(1);
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, email, authPassword(password));
    } catch (err) {
      if (err?.code === 'auth/operation-not-allowed') throw new HttpError(503, 'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في مشروع Firebase (Authentication).');
      throw httpErrorOf(err);
    }
    const uid = cred.user.uid;
    const at = nowIso();
    const counters = Object.fromEntries(ID_KINDS.map((k) => [k, 0]));
    Object.assign(counters, { user: 1, activity: 1 });
    const batch = writeBatch(db);
    batch.set(doc(db, 'meta', 'setup'), { ownerUid: uid, at });
    batch.set(doc(db, 'meta', 'counters'), counters);
    batch.set(doc(db, 'roles', uid), { role: 'owner', userId: 1, active: true });
    batch.set(doc(db, 'users', '1'), { id: 1, name, username, role: 'owner', is_active: true, created_at: at, last_login_at: at, uid, email });
    batch.set(doc(db, 'logins', loginKey(username)), { email, userId: 1 });
    batch.set(doc(db, 'settings', 'general'), { ...DEFAULT_GENERAL });
    batch.set(doc(db, 'settings', 'theme'), structuredClone(DEFAULT_THEME));
    batch.set(doc(db, 'activity', '1'), { id: 1, user_id: 1, action: 'auth.setup', details: { username }, created_at: at });
    try {
      await withTimeout(batch.commit(), SETUP_TIMEOUT_MS);
    } catch (err) {
      // Someone else finished the setup first, or the rules are missing: undo the account.
      await cred.user.delete().catch(() => signOut(auth).catch(() => {}));
      if (err?.code === 'permission-denied') {
        const done = await getDoc(doc(db, 'meta', 'setup')).then((d) => d.exists(), () => false);
        throw done ? conflict(SETUP_DONE) : new HttpError(503, 'رفض Firebase إنشاء الحساب: تأكد من نشر قواعد الأمان (firestore.rules).');
      }
      throw httpErrorOf(err);
    }
    cloud.setupFinished();
    const session = await cloud.establish();
    if (!session) throw new HttpError(503, 'تعذّر بدء الجلسة. أعد المحاولة.');
    return ctx.created({ user: publicUser(cloud.user()) });
  });

  route('POST', '/auth/login', null, async ({ body }) => {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) throw badRequest('أدخل اسم المستخدم وكلمة المرور');
    let login;
    try {
      login = await getDoc(doc(db, 'logins', loginKey(username)));
    } catch (err) {
      throw httpErrorOf(err);
    }
    if (!login.exists()) throw new HttpError(401, BAD_LOGIN);
    try {
      await signInWithEmailAndPassword(auth, login.data().email, authPassword(password));
    } catch (err) {
      if (WRONG_PASSWORD_CODES.includes(err?.code)) throw new HttpError(401, BAD_LOGIN);
      throw httpErrorOf(err);
    }
    // roles/{uid} decides: a deactivated (or replaced) account cannot sign in.
    const session = await cloud.establish();
    const me = cloud.user();
    if (!session || !me) {
      cloud.endSession();
      throw new HttpError(401, BAD_LOGIN);
    }
    try {
      await cloud.mutate(() => {
        me.last_login_at = nowIso();
        ctx.log(me, 'auth.login', { username: me.username });
      });
    } catch (err) {
      console.warn('cloud: login not recorded', err); // signed in all the same
    }
    return { user: publicUser(cloud.user()) };
  });

  route('POST', '/auth/logout', null, () => {
    cloud.endSession();
    return { ok: true };
  });

  // Own password: Auth needs the current one again (re-authentication).
  route('POST', '/me/password', anyStaff, async ({ body, user: me }) => {
    const current = auth.currentUser;
    if (typeof body.current !== 'string' || !current?.email) throw badRequest('كلمة المرور الحالية غير صحيحة');
    try {
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, authPassword(body.current)));
    } catch (err) {
      if (WRONG_PASSWORD_CODES.includes(err?.code)) throw badRequest('كلمة المرور الحالية غير صحيحة');
      throw httpErrorOf(err);
    }
    const problem = validatePassword(body.next);
    if (problem) throw badRequest(problem);
    try {
      await updatePassword(current, authPassword(body.next));
    } catch (err) {
      throw httpErrorOf(err);
    }
    await cloud.mutate(() => ctx.log(me, 'auth.password', { username: me.username }));
    return { ok: true };
  });

  // ── Users (owner) ──

  route('POST', '/users', ownerOnly, async (args) => {
    const { body } = args;
    str(body.name, 'الاسم', { required: true, max: 80 });
    const { username, password } = credentials(body);
    const taken = () => s.users.some((u) => u.username.toLowerCase() === username.toLowerCase());
    if (taken()) throw conflict('اسم المستخدم مستخدم مسبقاً');
    // logins/ also knows usernames this device has not replicated yet.
    if ((await getDoc(doc(db, 'logins', loginKey(username))).catch(() => null))?.exists()) throw conflict('اسم المستخدم مستخدم مسبقاً');
    const label = Math.max(0, ...s.users.map((u) => u.id)) + 1; // only names the Auth email
    const account = await createAccount(label, password);
    return cloud.mutate(() => {
      const out = demoCreateUser(args);
      const row = s.users.find((u) => u.id === out.data.id);
      delete row.password;
      Object.assign(row, account);
      return out;
    });
  });

  // A new password = a new Auth account (another user's Auth password cannot
  // be changed from a client); the old account loses its roles doc at once.
  route('PATCH', '/users/:id', ownerOnly, async (args) => {
    const { params, body, user: me } = args;
    let account = null;
    if (has(body, 'password')) {
      const problem = validatePassword(body.password);
      if (problem) throw badRequest(problem);
      const target = s.users.find((u) => String(u.id) === String(params.id));
      if (target && target.id === me.id) throw badRequest('لتغيير كلمة مرورك استخدم «تغيير كلمة المرور» من قائمة حسابك');
      if (target) account = await createAccount(target.id, body.password);
    }
    return cloud.mutate(() => {
      const out = demoUpdateUser(args);
      const row = s.users.find((u) => u.id === out.id);
      delete row.password;
      if (account) Object.assign(row, account);
      return out;
    });
  });

  // What the owner's settings screen shows about "the server": in cloud mode
  // there is none on the LAN; devices reach the Firebase project.
  route('GET', '/system/server-info', ownerOnly, () => {
    const origin = globalThis.location?.origin ?? '';
    return {
      mode: 'cloud',
      projectId: services.config.projectId,
      publicBaseUrl: origin,
      lanUrls: [],
      apkAvailable: false,
      apkUrl: '/app.apk',
      apkSize: null,
      apkUpdatedAt: null,
    };
  });
}
