// firebase/firestore.rules and storage.rules on the emulators: each role
// allowed / refused for the cases that matter (docs/cloud-architecture.md).

import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, getDocs, collection, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { EMULATORS, PROJECT, ROOT, resetEmulators } from './helpers.js';

const rules = (file) => fs.readFileSync(path.join(ROOT, 'firebase', file), 'utf8');
let env;

const HOUR = 3600 * 1000;
const role = (r, userId, active = true) => ({ role: r, userId, active });
const user = (id, r, extra = {}) => ({ id, name: `user ${id}`, username: `u${id}`, role: r, is_active: true, created_at: '2026-01-01T00:00:00.000Z', last_login_at: null, ...extra });
const projector = (id, tableId, extra = {}) => ({ id, table_id: tableId, name: `p${id}`, rotation: 0, layout: 'single', calibration: { corners: [] }, power: 'on', last_seen_at: null, acked_at: null, test_pattern: false, device_uid: null, pending: false, ...extra });

// A small restaurant: owner, designer, waiter, a deactivated waiter, two
// tables with a projector each (projector 1 bound to device 'dev'), two
// pending projectors with pairing codes (one expired), a dish, orders.
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, data) => setDoc(doc(db, ...p.split('/')), data);
    await put('meta/setup', { ownerUid: 'own', at: 'x' });
    await put('meta/counters', { user: 4, area: 0, table: 2, projector: 4, asset: 0, category: 1, dish: 1, order: 2, activity: 1 });
    await put('roles/own', role('owner', 1));
    await put('roles/des', role('designer', 2));
    await put('roles/wai', role('waiter', 3));
    await put('roles/old', role('waiter', 4, false));
    for (const [id, r] of [[1, 'owner'], [2, 'designer'], [3, 'waiter'], [4, 'waiter']]) await put(`users/${id}`, user(id, r));
    await put('logins/u_u3', { email: 'u3@x', userId: 3 });
    await put('tables/1', { id: 1, number: 1, seats: 4, status: 'free', area_id: null, sort_order: 0 });
    await put('tables/2', { id: 2, number: 2, seats: 4, status: 'free', area_id: null, sort_order: 1 });
    await put('projectors/1', projector(1, 1, { device_uid: 'dev' }));
    await put('projectors/2', projector(2, 2));
    await put('projectors/3', projector(3, 1, { pending: true }));
    await put('projectors/4', projector(4, 1, { pending: true }));
    await put('devices/dev', { projectorId: 1, code: '111111', at: 'x' });
    await put('pairing/123456', { projectorId: 3, tableId: 1, expiresAt: Timestamp.fromMillis(Date.now() + HOUR), createdBy: 1 });
    await put('pairing/654321', { projectorId: 4, tableId: 1, expiresAt: Timestamp.fromMillis(Date.now() - 1000), createdBy: 1 });
    await put('dishes/1', { id: 1, name_ar: 'كباب', price: 12000, category_id: 1 });
    await put('categories/1', { id: 1, name_ar: 'مشاوي' });
    await put('orders/1', { id: 1, table_id: 1, status: 'open', items: [], total: 0 });
    await put('orders/2', { id: 2, table_id: 2, status: 'open', items: [], total: 0 });
    await put('activity/1', { id: 1, user_id: 1, action: 'auth.setup', details: null, created_at: 'x' });
    await put('settings/general', { restaurantName: 'مطعم' });
    await put('scenes/1', { type: 'welcome' });
  });
}

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const d = (db, p) => doc(db, ...p.split('/'));

before(async () => {
  await resetEmulators();
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: EMULATORS.host, port: EMULATORS.firestore, rules: rules('firestore.rules') },
    storage: { host: EMULATORS.host, port: EMULATORS.storage, rules: rules('storage.rules') },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe('signed out and anonymous visitors', () => {
  test('see only the public bits', async () => {
    const db = as(null);
    await assertSucceeds(getDoc(d(db, 'meta/setup')));
    await assertSucceeds(getDoc(d(db, 'settings/general')));
    await assertSucceeds(getDoc(d(db, 'logins/u_u3')));
    await assertFails(getDocs(collection(db, 'logins')));
    await assertFails(getDoc(d(db, 'tables/1')));
    await assertFails(getDoc(d(db, 'roles/own')));
    await assertFails(getDoc(d(db, 'meta/counters')));
    // An anonymous user that is not a paired projector reads no menu or floor.
    const anon = as('stranger');
    await assertFails(getDoc(d(anon, 'dishes/1')));
    await assertFails(getDoc(d(anon, 'projectors/1')));
    await assertFails(getDocs(collection(anon, 'orders')));
  });

  test('a deactivated account reads and writes nothing', async () => {
    const db = as('old');
    await assertFails(getDoc(d(db, 'tables/1')));
    await assertFails(getDocs(collection(db, 'orders')));
    await assertFails(updateDoc(d(db, 'tables/1'), { status: 'occupied' }));
  });
});

describe('roles and accounts', () => {
  test('nobody but an owner writes roles (no self-escalation)', async () => {
    await assertFails(updateDoc(d(as('wai'), 'roles/wai'), { role: 'owner' }));
    await assertFails(updateDoc(d(as('des'), 'roles/des'), { role: 'owner' }));
    await assertFails(setDoc(d(as('stranger'), 'roles/stranger'), role('owner', 9)));
    await assertFails(updateDoc(d(as('old'), 'roles/old'), { active: true }));
    await assertSucceeds(getDoc(d(as('wai'), 'roles/wai')));
    await assertFails(getDoc(d(as('wai'), 'roles/own')));
    await assertSucceeds(updateDoc(d(as('own'), 'roles/wai'), { role: 'designer' }));
    await assertFails(updateDoc(d(as('own'), 'roles/wai'), { role: 'admin' }));
  });

  test('staff record their own sign-in only; the owner manages users', async () => {
    await assertSucceeds(updateDoc(d(as('wai'), 'users/3'), { last_login_at: '2026-10-18T10:00:00.000Z' }));
    await assertFails(updateDoc(d(as('wai'), 'users/3'), { name: 'x' }));
    await assertFails(updateDoc(d(as('wai'), 'users/3'), { role: 'owner' }));
    await assertFails(updateDoc(d(as('wai'), 'users/2'), { last_login_at: 'x' }));
    await assertSucceeds(setDoc(d(as('own'), 'users/5'), user(5, 'waiter')));
    await assertFails(setDoc(d(as('own'), 'users/6'), user(6, 'waiter', { password: '1234' })));
    await assertFails(setDoc(d(as('own'), 'users/7'), user(8, 'waiter')), 'id must match');
    await assertFails(setDoc(d(as('wai'), 'logins/u_x'), { email: 'x@y', userId: 3 }));
    await assertSucceeds(setDoc(d(as('own'), 'logins/u_x'), { email: 'x@y', userId: 5 }));
  });

  test('first run: one owner bootstrap, never a second', async () => {
    await env.clearFirestore();
    const setupBatch = (uid) => {
      const db = as(uid);
      const b = writeBatch(db);
      b.set(d(db, 'meta/setup'), { ownerUid: uid, at: 'x' });
      b.set(d(db, `roles/${uid}`), role('owner', 1));
      b.set(d(db, 'users/1'), user(1, 'owner'));
      b.set(d(db, 'logins/u_owner'), { email: `${uid}@x`, userId: 1 });
      b.set(d(db, 'meta/counters'), { user: 1, activity: 1 });
      b.set(d(db, 'settings/general'), { restaurantName: 'x' });
      b.set(d(db, 'settings/theme'), { preset: 'noir' });
      b.set(d(db, 'activity/1'), { id: 1, user_id: 1, action: 'auth.setup', details: null, created_at: 'x' });
      return b.commit();
    };
    // Roles without meta/setup in the same batch: refused.
    await assertFails(setDoc(d(as('first'), 'roles/first'), role('owner', 1)));
    await assertSucceeds(setupBatch('first'));
    await assertFails(setupBatch('second'));
    await assertFails(setDoc(d(as('second'), 'roles/second'), role('owner', 2)));
  });
});

describe('content and prices', () => {
  test('designers edit the menu but never prices', async () => {
    const db = as('des');
    await assertSucceeds(updateDoc(d(db, 'dishes/1'), { description_ar: 'جديد' }));
    await assertFails(updateDoc(d(db, 'dishes/1'), { price: 1 }));
    await assertSucceeds(setDoc(d(db, 'dishes/2'), { id: 2, name_ar: 'سلطة', price: 0 }));
    await assertFails(setDoc(d(db, 'dishes/3'), { id: 3, name_ar: 'سلطة', price: 5000 }));
    await assertSucceeds(updateDoc(d(as('own'), 'dishes/1'), { price: 13000 }));
    await assertSucceeds(setDoc(d(db, 'settings/theme'), { preset: 'royal' }));
    await assertFails(setDoc(d(db, 'settings/general'), { restaurantName: 'x' }));
    await assertFails(getDocs(collection(db, 'orders')));
    await assertSucceeds(setDoc(d(db, 'scenes/1'), { type: 'menu', at: 'x' }));
    await assertFails(setDoc(d(db, 'scenes/1'), { type: 'order', orderId: 1, at: 'x' }));
    await assertSucceeds(updateDoc(d(db, 'projectors/1'), { calibration: { corners: [{ x: 0, y: 0 }] }, test_pattern: true }));
    await assertFails(updateDoc(d(db, 'projectors/1'), { name: 'x' }));
    await assertFails(setDoc(d(db, 'tables/3'), { id: 3, number: 3, status: 'free' }));
  });

  test('waiters change only the status of a table, and take orders', async () => {
    const db = as('wai');
    await assertSucceeds(updateDoc(d(db, 'tables/1'), { status: 'occupied' }));
    await assertFails(updateDoc(d(db, 'tables/1'), { status: 'broken' }));
    await assertFails(updateDoc(d(db, 'tables/1'), { number: 7 }));
    await assertFails(updateDoc(d(db, 'tables/1'), { status: 'reserved', seats: 9 }));
    await assertSucceeds(setDoc(d(db, 'orders/3'), { id: 3, table_id: 1, status: 'open', items: [], total: 0 }));
    await assertFails(setDoc(d(db, 'orders/4'), { id: 5, table_id: 1 }), 'id must match');
    await assertFails(deleteDoc(d(db, 'orders/1')));
    await assertFails(updateDoc(d(db, 'dishes/1'), { name_ar: 'x' }));
    await assertFails(setDoc(d(db, 'settings/theme'), { preset: 'royal' }));
    await assertSucceeds(setDoc(d(db, 'scenes/1'), { type: 'order', orderId: 1, at: 'x' }));
    await assertFails(updateDoc(d(db, 'projectors/1'), { test_pattern: true }));
  });

  test('id counters only go up; the activity log is append-only, as oneself', async () => {
    const db = as('wai');
    await assertSucceeds(updateDoc(d(db, 'meta/counters'), { order: 3 }));
    await assertFails(updateDoc(d(db, 'meta/counters'), { order: 1 }));
    await assertFails(updateDoc(d(db, 'meta/counters'), { order: 'x' }));
    await assertFails(updateDoc(d(db, 'meta/counters'), { hacked: 1 }));
    await assertFails(updateDoc(d(as('stranger'), 'meta/counters'), { order: 9 }));
    await assertSucceeds(setDoc(d(db, 'activity/2'), { id: 2, user_id: 3, action: 'auth.login', details: null, created_at: 'x' }));
    await assertFails(setDoc(d(db, 'activity/3'), { id: 3, user_id: 1, action: 'auth.login', details: null, created_at: 'x' }));
    await assertFails(getDoc(d(db, 'activity/1')));
    await assertSucceeds(getDoc(d(as('own'), 'activity/1')));
    await assertFails(updateDoc(d(as('own'), 'activity/1'), { action: 'x' }));
    await assertFails(deleteDoc(d(as('own'), 'activity/1')));
  });
});

describe('projector devices', () => {
  test('a device writes only its own heartbeat, acks and power', async () => {
    const db = as('dev');
    await assertSucceeds(updateDoc(d(db, 'projectors/1'), { last_seen_at: Timestamp.now(), acked_at: '2026-10-18T10:00:00.000Z' }));
    await assertSucceeds(updateDoc(d(db, 'projectors/1'), { power: 'off' }));
    await assertFails(updateDoc(d(db, 'projectors/1'), { table_id: 2 }));
    await assertFails(updateDoc(d(db, 'projectors/1'), { calibration: {} }));
    await assertFails(updateDoc(d(db, 'projectors/1'), { device_uid: 'other' }));
    await assertFails(updateDoc(d(db, 'projectors/2'), { last_seen_at: Timestamp.now() }));
    await assertFails(setDoc(d(db, 'scenes/1'), { type: 'menu' }));
    await assertFails(updateDoc(d(db, 'devices/dev'), { projectorId: 2 }));
  });

  test("a device reads its table's orders, one by one, and nothing else", async () => {
    const db = as('dev');
    await assertSucceeds(getDoc(d(db, 'orders/1')));
    await assertFails(getDoc(d(db, 'orders/2')));
    await assertFails(getDocs(collection(db, 'orders')));
    await assertFails(getDocs(query(collection(db, 'orders'), where('status', '==', 'open'))));
    await assertSucceeds(getDoc(d(db, 'dishes/1')));
    await assertSucceeds(getDoc(d(db, 'scenes/1')));
    await assertFails(getDoc(d(db, 'users/1')));
    await assertFails(getDoc(d(db, 'activity/1')));
  });

  const claim = (uid, code, projectorId, { consume = true } = {}) => {
    const db = as(uid);
    const b = writeBatch(db);
    b.set(d(db, `devices/${uid}`), { projectorId, code, at: Timestamp.now() });
    b.update(d(db, `projectors/${projectorId}`), { pending: false, device_uid: uid, last_seen_at: Timestamp.now() });
    if (consume) b.delete(d(db, `pairing/${code}`));
    return b.commit();
  };

  test('pairing: a valid code binds a new device, once', async () => {
    await assertSucceeds(getDoc(d(as('fresh'), 'pairing/123456')));
    await assertFails(getDocs(collection(as('fresh'), 'pairing')));
    await assertFails(claim('fresh', '123456', 3, { consume: false }), 'the code must be used up');
    await assertFails(claim('fresh', '123456', 2), 'the code names another projector');
    await assertFails(claim('fresh', '654321', 4), 'expired code');
    await assertFails(claim('fresh', '999999', 3), 'unknown code');
    await assertSucceeds(claim('fresh', '123456', 3));
    await assertFails(claim('late', '123456', 3), 'single use');
    // Bound now: it reads the floor and menu.
    await assertSucceeds(getDoc(d(as('fresh'), 'dishes/1')));
  });

  test('pairing codes and unbinding are the owner\'s', async () => {
    const code = { projectorId: 2, tableId: 2, expiresAt: Timestamp.fromMillis(Date.now() + HOUR), createdBy: 1 };
    await assertSucceeds(setDoc(d(as('own'), 'pairing/222222'), code));
    await assertFails(setDoc(d(as('wai'), 'pairing/333333'), code));
    await assertFails(setDoc(d(as('own'), 'pairing/abc'), code));
    await assertFails(deleteDoc(d(as('wai'), 'devices/dev')));
    await assertSucceeds(deleteDoc(d(as('own'), 'devices/dev')));
    // Unbound: the device is cut off.
    await assertFails(updateDoc(d(as('dev'), 'projectors/1'), { last_seen_at: Timestamp.now() }));
    await assertFails(getDoc(d(as('dev'), 'orders/1')));
    await assertFails(getDoc(d(as('dev'), 'dishes/1')));
  });
});

// Cross-service rules (Storage asking Firestore for roles/{uid}): the
// Storage emulator must run in the same `firebase emulators:exec` as the
// Firestore emulator. Behind an HTTP proxy, start the emulators with
// HTTPS_PROXY=undefined: firebase-tools sends its emulator-to-emulator calls
// through HTTPS_PROXY (it ignores NO_PROXY), and every role check then fails.
describe('storage', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  // Storage keeps files between runs (no reset that is safe while it runs): fresh ids per run.
  const run = Date.now();
  const path = (n, ext = 'png') => `media/${run}${n}/upload-${n}.${ext}`;
  const put = (uid, p, type = 'image/png', bytes = png) => uploadBytes(ref(env.authenticatedContext(uid).storage(), p), bytes, { contentType: type });

  test('owners and designers upload media; others cannot', async () => {
    await assertSucceeds(put('des', path(1)));
    await assertSucceeds(put('own', path(2, 'mp4'), 'video/mp4'));
    await assertFails(put('wai', path(3)));
    await assertFails(put('old', path(3)));
    await assertFails(put('stranger', path(3)));
    await assertFails(put('own', path(4, 'txt'), 'text/plain'));
    await assertFails(put('own', `other/${run}.png`));
    await assertFails(put('own', path(1)), 'files are never replaced');
    await assertSucceeds(getBytes(ref(env.authenticatedContext('wai').storage(), path(1))));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), path(1))));
    const del = (uid) => deleteObject(ref(env.authenticatedContext(uid).storage(), path(2, 'mp4')));
    await assertFails(del('wai'));
    await assertSucceeds(del('des'));
  });
});
