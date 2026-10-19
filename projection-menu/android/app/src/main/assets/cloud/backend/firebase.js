// Firebase services for the cloud host: one app instance per role on this
// device (so the staff sign-in and a projector's anonymous sign-in never
// share a session), emulator wiring for tests, Firestore's local cache
// (IndexedDB in the browser: a device keeps working on its cached data when
// the internet drops; memory in Node), and Firebase errors -> the API's
// Arabic HTTP errors.
//
// Media files live in Firestore by default (media.js). Firebase Storage is
// opened only for a project whose config says `media: 'storage'` (it needs the
// Blaze plan), so the default never loads the Storage SDK.

import { deleteApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  inMemoryPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
} from 'firebase/firestore';
import { HttpError } from '../../demo/backend/validate.js';
import { mediaMode } from './media.js';

const inBrowser = () => typeof indexedDB !== 'undefined' && typeof window !== 'undefined';

export const NETWORK_ERROR = 'تعذّر الاتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.';
export const CONFIG_ERROR = 'إعدادات Firebase غير صالحة: تأكد من نسخ إعدادات تطبيق الويب كاملة (apiKey و projectId و appId).';
export const RULES_ERROR = 'قواعد الأمان غير منشورة على مشروع Firebase (firestore.rules). انشرها ثم أعد المحاولة.';

export function checkConfig(config) {
  if (!config || typeof config !== 'object') throw new Error(CONFIG_ERROR);
  for (const key of ['apiKey', 'projectId']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(CONFIG_ERROR);
  }
}

const sameConfig = (a, b) => ['apiKey', 'projectId', 'appId', 'storageBucket', 'authDomain', 'media'].every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));

// Services opened on this page, by app name (initializeFirestore may only
// run once per app, and the device setup screen and the player share one).
const opened = new Map();

// -> {app, auth, db, media: 'firestore'|'storage', storage, storageSdk, config, emulators}
// persistent: Firestore's IndexedDB cache (browser only; off for one-off probes)
export async function openFirebase(config, { name, emulators = null, persistent = inBrowser() } = {}) {
  checkConfig(config);
  const current = opened.get(name);
  if (current && sameConfig(current.config, config) && JSON.stringify(current.emulators) === JSON.stringify(emulators)) return current;
  if (current) await closeFirebase(current); // the project was changed in setup

  // `media` is ours, not a Firebase option.
  const { media: _media, ...options } = config;
  const media = mediaMode(config);
  const app = getApps().find((a) => a.name === name) ?? initializeApp(options, name);
  const browser = inBrowser();
  const auth = initializeAuth(app, { persistence: browser && persistent ? [indexedDBLocalPersistence, browserLocalPersistence] : inMemoryPersistence });
  const db = initializeFirestore(app, {
    localCache: browser && persistent ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : memoryLocalCache(),
    ignoreUndefinedProperties: true,
  });
  const storageSdk = media === 'storage' && (config.storageBucket || emulators) ? await import('firebase/storage') : null;
  const storage = storageSdk ? storageSdk.getStorage(app) : null;
  // An upload over a dead connection fails after this long instead of 10 minutes.
  if (storage) storage.maxUploadRetryTime = 2 * 60 * 1000;
  if (emulators) {
    const host = emulators.host ?? '127.0.0.1';
    if (emulators.auth) connectAuthEmulator(auth, `http://${host}:${emulators.auth}`, { disableWarnings: true });
    if (emulators.firestore) connectFirestoreEmulator(db, host, emulators.firestore);
    if (emulators.storage && storage) storageSdk.connectStorageEmulator(storage, host, emulators.storage);
  }
  const services = { app, auth, db, media, storage, storageSdk, config, options, emulators, name };
  opened.set(name, services);
  return services;
}

export async function closeFirebase(services) {
  if (opened.get(services.name) === services) opened.delete(services.name);
  try {
    await terminate(services.db);
  } catch {
    // already terminated
  }
  try {
    await deleteApp(services.app);
  } catch {
    // already deleted
  }
}

// Auth of a short-lived extra app instance: the owner creates staff
// accounts with it and stays signed in on the main one.
let secondaryCount = 0;
export async function withSecondaryAuth(services, fn) {
  const app = initializeApp(services.options ?? services.config, `${services.name}-accounts-${++secondaryCount}`);
  try {
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    const emu = services.emulators;
    if (emu?.auth) connectAuthEmulator(auth, `http://${emu.host ?? '127.0.0.1'}:${emu.auth}`, { disableWarnings: true });
    return await fn(auth);
  } finally {
    await deleteApp(app).catch(() => {});
  }
}

// Best-effort reachability of Firestore: a one-document listener whose
// snapshots say whether they came from the server or only from the cache
// (metadata-only changes cost no reads). -> unsubscribe
export function watchConnection(db, fn) {
  let last = null;
  const emit = (online) => {
    if (online === last) return;
    last = online;
    fn(online);
  };
  const off = onSnapshot(
    doc(db, 'meta', 'setup'),
    { includeMetadataChanges: true },
    (snap) => emit(!snap.metadata.fromCache),
    () => emit(false),
  );
  // The browser knows first when the network is gone.
  const onOffline = () => emit(false);
  if (typeof window !== 'undefined') window.addEventListener('offline', onOffline);
  return () => {
    off();
    if (typeof window !== 'undefined') window.removeEventListener('offline', onOffline);
  };
}

// ── Errors ───────────────────────────────────────────────────────

// A Firestore / Storage / Auth error -> HttpError with an Arabic message.
export function httpErrorOf(err) {
  if (err instanceof HttpError) return err;
  const code = String(err?.code ?? '').replace(/^(firestore|storage|auth)\//, '');
  switch (code) {
    case 'permission-denied':
    case 'unauthorized':
    case 'unauthenticated':
      // The app checks roles first: a refusal by the security rules is worth a log line.
      console.warn('cloud: refused by Firebase', err?.code, err?.message);
      return new HttpError(403, 'ليست لديك صلاحية لهذا الإجراء');
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
    case 'retry-limit-exceeded':
      return new HttpError(503, NETWORK_ERROR);
    case 'resource-exhausted':
    case 'quota-exceeded':
      return new HttpError(429, 'تم تجاوز الحد المسموح لمشروع Firebase اليوم. حاول لاحقاً.');
    case 'too-many-requests':
      return new HttpError(429, 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة');
    case 'not-found':
    case 'object-not-found':
      return new HttpError(404, 'العنصر غير موجود');
    case 'canceled':
      return new HttpError(499, 'أُلغي الرفع');
    default:
      console.error(err);
      return new HttpError(500, 'حدث خطأ في الخادم');
  }
}

// Rejects after `ms` with a network error (a request must not hang forever
// on an operation that needs the server, like a transaction).
export function withTimeout(promise, ms, message = NETWORK_ERROR) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(503, message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
