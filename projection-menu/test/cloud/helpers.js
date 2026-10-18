// Shared setup of the cloud-mode tests (run against the Firebase emulators:
// `npm run test:cloud`). The project id starts with "demo-", so nothing can
// reach a real Firebase project.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deleteApp, getApps } from 'firebase/app';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECT = 'demo-pm';
export const EMULATORS = { host: '127.0.0.1', auth: 9099, firestore: 8080, storage: 9199 };
export const CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: `${PROJECT}.firebaseapp.com`,
  projectId: PROJECT,
  storageBucket: `${PROJECT}.appspot.com`,
  appId: '1:000000000000:web:demo',
};

export const loadCloud = () => import(pathToFileURL(path.join(ROOT, 'android/app/src/main/assets/cloud/backend/index.js')).href);

// Empties Firestore and Auth (each test file starts from a new project).
export async function resetEmulators() {
  const { host, firestore, auth } = EMULATORS;
  const ok = async (res) => {
    if (!res.ok) throw new Error(`emulator reset failed: ${res.status} ${await res.text()}`);
  };
  await ok(await fetch(`http://${host}:${firestore}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' }));
  await ok(await fetch(`http://${host}:${auth}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' }));
}

// Polls until fn() returns something truthy. -> that value
export async function waitFor(fn, { timeout = 8000, label = 'condition' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

let hosts = 0;
// A staff host with its own Firebase app (= its own device and session).
export async function staffHost(cloud, name = 'staff') {
  const host = await cloud.createCloudHost(CONFIG, { role: 'staff', emulators: EMULATORS, appName: `${name}-${++hosts}` });
  const call = async (method, url, body) => host.request({ method, url: `/api${url}`, body });
  const events = [];
  host.subscribeLive((event, payload) => events.push({ event, payload }));
  const saw = (event, pred = () => true) => events.some((e) => e.event === event && pred(e.payload));
  return { host, call, events, saw, clear: () => events.splice(0) };
}

// A projector player's `on` callbacks, recorded.
export function playerRecorder() {
  const log = [];
  const on = {};
  for (const name of ['bootstrap', 'scene', 'projector', 'testPattern', 'order', 'online', 'fatal']) on[name] = (value) => log.push({ name, value });
  const last = (name) => [...log].reverse().find((e) => e.name === name)?.value;
  return { on, log, last, count: (name) => log.filter((e) => e.name === name).length };
}

export const loginAs = async (staff, username, password) => {
  const res = await staff.call('POST', '/auth/login', { username, password });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.user;
};

// Every Firebase app of this process (hosts, claims, probes): closed, so the
// test process can exit.
export async function closeAllApps() {
  await Promise.all(getApps().map((app) => deleteApp(app).catch(() => {})));
}
