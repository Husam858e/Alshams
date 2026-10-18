// Cloud mode ("Firebase"): the backend of the staff app and of the
// projector player when the restaurant runs without a local server. Same
// contract as the offline demo's backend (demo/backend/index.js), so the
// staff app and the player run unchanged; see docs/cloud-architecture.md.
//
//   createCloudHost(config, {role: 'staff'|'device', emulators})
//     staff:  request({method, url, body, file, fields}) -> {status, data}
//             subscribeLive(fn(event, payload)) -> unsubscribe
//             currentUser() -> publicUser | null
//             openPreview(tableId, on) -> {reportStatus, fetchOrder}
//     device: openDevice(deviceKey, on) -> {reportStatus, fetchOrder}
//     both:   onConnection(fn(online)) -> unsubscribe, close()
//   claimProjector(config, code, {emulators})  binds this device to a projector
//   probeProject(config, {emulators})          checks a pasted Firebase config
//
// `config` is the Firebase web app config; `emulators` ({host, auth,
// firestore, storage} ports) points everything at the local emulators.

import { doc, getDocFromServer } from 'firebase/firestore';
import { HttpError } from '../../demo/backend/validate.js';
import { claim, createDeviceHost } from './device.js';
import { CONFIG_ERROR, NETWORK_ERROR, RULES_ERROR, checkConfig, closeFirebase, openFirebase, withTimeout } from './firebase.js';
import { createStaffHost } from './staff.js';

// App instance names: the staff session and the projector's anonymous
// session live side by side (their Auth persistence is per name).
export const STAFF_APP = 'pm-staff';
export const DEVICE_APP = 'pm-device';

const SIGNED_OUT = { status: 401, data: { error: 'يجب تسجيل الدخول أولاً' } };

export async function createCloudHost(config, { role = 'staff', emulators = null, appName = null } = {}) {
  if (role !== 'staff' && role !== 'device') throw new Error(`createCloudHost: unknown role ${role}`);
  const services = await openFirebase(config, { name: appName ?? (role === 'device' ? DEVICE_APP : STAFF_APP), emulators });

  if (role === 'device') {
    const host = createDeviceHost(services);
    return {
      role,
      openDevice: host.openDevice,
      onConnection: host.onConnection,
      deviceId: host.deviceId,
      // Staff calls have no session on a projector.
      request: async () => structuredClone(SIGNED_OUT),
      subscribeLive: () => () => {},
      currentUser: () => null,
      openPreview(_tableId, on) {
        setTimeout(() => on.fatal('login'), 0);
        return { reportStatus() {}, fetchOrder: async () => null };
      },
      async close() {
        host.close();
        await closeFirebase(services);
      },
    };
  }

  const host = createStaffHost(services);
  return {
    role,
    request: host.request,
    subscribeLive: host.subscribeLive,
    currentUser: host.currentUser,
    openPreview: host.openPreview,
    openDevice: host.openDevice,
    onConnection: host.onConnection,
    routes: host.routes,
    // Resolves once a session kept from an earlier visit is restored (or not).
    ready: host.started.then(() => undefined),
    async close() {
      host.close();
      await closeFirebase(services);
    },
  };
}

// The projector setup screen: enter the owner's 6-digit code.
// -> {projector:{id,name}, table:{id,number}|null, restaurantName}; throws Error (Arabic message)
export async function claimProjector(config, code, { emulators = null, appName = null } = {}) {
  const services = await openFirebase(config, { name: appName ?? DEVICE_APP, emulators });
  return claim(services, code);
}

// The setup screen's "check" of a Firebase config: reachable, rules
// deployed, owner account created yet?
// -> {ok: true, needsSetup, restaurantName|null}; throws Error (Arabic message)
let probes = 0;
export async function probeProject(config, { emulators = null } = {}) {
  try {
    checkConfig(config);
  } catch {
    throw new Error(CONFIG_ERROR);
  }
  const services = await openFirebase(config, { name: `pm-probe-${++probes}`, emulators, persistent: false });
  const { db } = services;
  const fromServer = (path) => withTimeout(getDocFromServer(doc(db, ...path)), 12000);
  try {
    const setup = await fromServer(['meta', 'setup']);
    // Our rules refuse anyone reading roles/ without signing in; a project
    // without them (default "test mode" rules) would allow it.
    const open = await fromServer(['roles', 'probe']).then(
      () => true,
      (err) => {
        if (err?.code === 'permission-denied') return false;
        throw err;
      },
    );
    if (open) throw new Error(RULES_ERROR);
    const general = setup.exists() ? await fromServer(['settings', 'general']).catch(() => null) : null;
    return { ok: true, needsSetup: !setup.exists(), restaurantName: general?.data()?.restaurantName ?? null };
  } catch (err) {
    throw probeError(err);
  } finally {
    await closeFirebase(services);
  }
}

function probeError(err) {
  if (!err?.code && !(err instanceof HttpError) && err instanceof Error) return err; // ours already
  const text = String(err?.message ?? '');
  if (/api[ _-]?key/i.test(text)) return new Error('مفتاح API غير صالح. انسخ إعدادات تطبيق الويب من Firebase Console مرة أخرى.');
  if (/has not been used|is disabled|SERVICE_DISABLED|does not exist|NOT_FOUND/i.test(text) || err?.code === 'not-found') {
    return new Error('قاعدة بيانات Firestore غير منشأة في هذا المشروع (أو معرّف المشروع غير صحيح). أنشئها من Firebase Console.');
  }
  if (err?.code === 'permission-denied') return new Error(RULES_ERROR);
  if (err instanceof HttpError || ['unavailable', 'deadline-exceeded'].includes(err?.code)) return new Error(`${NETWORK_ERROR} (أو أن معرّف المشروع غير صحيح)`);
  return new Error(`تعذّر الاتصال بمشروع Firebase: ${text}`);
}
