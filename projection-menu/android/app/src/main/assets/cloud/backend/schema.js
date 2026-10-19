// How the backend state `s` (the demo backend's shape) maps onto Firestore
// documents, and the constants of cloud mode. See docs/cloud-architecture.md.
//
// Each spec says where the rows of one part of `s` live:
//   list   s[key] is an array of rows with a numeric `id` (doc id = String(id))
//   map    s.scenes: Map tableId -> scene (doc id = String(tableId))
//   object s.settings: {general, theme} (doc ids 'general', 'theme')
// and converts between a row and its document (Firestore has no nested
// arrays and stores instants as Timestamps).

import { Timestamp } from 'firebase/firestore';

// ── Timing ───────────────────────────────────────────────────────
export const HEARTBEAT_MS = 2 * 60 * 1000; // a projector writes last_seen_at this often
export const ONLINE_MS = 5 * 60 * 1000; // ...and counts as online this long after it
export const ONLINE_CHECK_MS = 30 * 1000; // staff re-evaluate "online" this often
export const ACK_WAIT_MS = 2000; // PUT /tables/:id/scene waits this long for acks (as the server)
export const COMMIT_WAIT_MS = 8000; // a request waits this long for the server to accept its writes
export const ORDER_WINDOW_MS = 24 * 3600 * 1000; // finished orders kept in the replica
export const PAIRING_TTL_MS = 10 * 60 * 1000;

// ── Accounts ─────────────────────────────────────────────────────
// Staff sign in with username + password; the Auth account behind it has a
// synthetic email (found through logins/{loginKey}) and a password with a
// fixed prefix, so the app's 4-character minimum meets Auth's 6.
export const EMAIL_DOMAIN = 'staff.projection-menu.app';
export const PASSWORD_PREFIX = 'pm#';
export const authPassword = (password) => `${PASSWORD_PREFIX}${password}`;
// Usernames are case-insensitive (like the demo); the prefix keeps doc ids
// like '.' or '__x__' (allowed usernames, reserved doc ids) valid.
export const loginKey = (username) => `u_${String(username).trim().toLowerCase()}`;
// A fresh address for every Auth account of a user (password resets make a new one).
export const staffEmail = (userId) => `u${userId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@${EMAIL_DOMAIN}`;

// Counters in meta/counters (ids are positive integers, unique across devices).
export const ID_KINDS = ['user', 'area', 'table', 'projector', 'asset', 'category', 'dish', 'order', 'activity'];

// Settings of a new restaurant (same as src/services/settings.js).
export const DEFAULT_GENERAL = Object.freeze({
  restaurantName: 'مطعم الشمس',
  restaurantNameEn: 'Alshams',
  logoAssetId: null,
  currency: 'د.ع',
  welcomeTitle: 'أهلاً وسهلاً',
  welcomeText: 'تفضّلوا، المنيو أمامكم على الطاولة',
  footerText: '',
});

export const DEFAULT_THEME = Object.freeze({
  preset: 'noir',
  accent: '#d4a056',
  background: Object.freeze({ type: 'preset', assetId: null }),
  font: 'Cairo',
  cardStyle: 'glass',
  showPrices: true,
  showCalories: false,
  showDescriptions: true,
  pageSeconds: 12,
  idleSeconds: 90,
});

// ── Conversions ──────────────────────────────────────────────────

const isTimestamp = (v) => v && typeof v === 'object' && typeof v.toMillis === 'function';
export const isoOf = (v) => (isTimestamp(v) ? new Date(v.toMillis()).toISOString() : (v ?? null));
export const timestampOf = (iso) => (iso ? Timestamp.fromMillis(Date.parse(iso)) : null);

// Top-level Timestamps -> ISO strings (what the demo rows hold).
function plainRow(data) {
  const row = {};
  for (const [k, v] of Object.entries(data)) row[k] = isTimestamp(v) ? isoOf(v) : v;
  return row;
}

const plain = {
  toDoc: (row) => structuredClone(row),
  fromDoc: (_id, data) => plainRow(data),
};

// Projectors: calibration corners are [[x,y]×4] in the app, {x,y} maps in
// Firestore; last_seen_at is a server Timestamp; `online` and `device_key`
// exist only on the device that computes them. The PJLink password is not
// stored: PJLink needs the LAN server, and every staff member could read it.
const projectorCodec = {
  toDoc(row) {
    const { online: _online, device_key: _key, pjlink_password: _secret, ...doc } = structuredClone(row);
    if (doc.calibration?.corners) doc.calibration = { corners: doc.calibration.corners.map(([x, y]) => ({ x, y })) };
    if ('last_seen_at' in doc) doc.last_seen_at = timestampOf(doc.last_seen_at);
    return doc;
  },
  fromDoc(_id, data) {
    const row = plainRow(data);
    const corners = data.calibration?.corners;
    if (Array.isArray(corners)) row.calibration = { corners: corners.map((c) => [c.x, c.y]) };
    row.device_key = ''; // cloud players have no key (the player link means nothing here)
    return row;
  },
};

// Users: never a password in Firestore (Auth holds it).
const userCodec = {
  toDoc(row) {
    const { password: _password, ...doc } = structuredClone(row);
    return doc;
  },
  fromDoc: plain.fromDoc,
};

export const SPECS = [
  { key: 'users', path: 'users', shape: 'list', ...userCodec },
  { key: 'areas', path: 'areas', shape: 'list', ...plain },
  { key: 'tables', path: 'tables', shape: 'list', ...plain },
  { key: 'projectors', path: 'projectors', shape: 'list', ...projectorCodec },
  { key: 'assets', path: 'media', shape: 'list', ...plain },
  { key: 'categories', path: 'categories', shape: 'list', ...plain },
  { key: 'dishes', path: 'dishes', shape: 'list', ...plain },
  { key: 'orders', path: 'orders', shape: 'list', ...plain },
  // Written, never replicated: rows a request logs are committed, then dropped.
  { key: 'activity', path: 'activity', shape: 'list', outbox: true, ...plain },
  { key: 'scenes', path: 'scenes', shape: 'map', ...plain },
  { key: 'settings', path: 'settings', shape: 'object', toDoc: plain.toDoc, fromDoc: (id, data) => settingsRow(id, data) },
];
export const spec = (key) => SPECS.find((x) => x.key === key);

// ── Rows of `s` by document id ───────────────────────────────────

export function rowsOf(sp, s) {
  if (sp.shape === 'map') return new Map([...s.scenes].map(([tableId, scene]) => [String(tableId), scene]));
  if (sp.shape === 'object') return new Map(Object.entries(s.settings).filter(([, v]) => v));
  return new Map(s[sp.key].map((row) => [String(row.id), row]));
}

export function putRow(sp, s, id, row) {
  if (sp.shape === 'map') s.scenes.set(Number(id), row);
  else if (sp.shape === 'object') s.settings[id] = row;
  else {
    const list = s[sp.key];
    const at = list.findIndex((r) => String(r.id) === id);
    if (at >= 0) list[at] = row;
    else list.push(row);
  }
}

export function removeRow(sp, s, id) {
  if (sp.shape === 'map') s.scenes.delete(Number(id));
  else if (sp.shape === 'object') s.settings[id] = sp.key === 'settings' ? defaultSetting(id) : null;
  else {
    const list = s[sp.key];
    const at = list.findIndex((r) => String(r.id) === id);
    if (at >= 0) list.splice(at, 1);
  }
}

function defaultSetting(id) {
  return structuredClone(id === 'theme' ? DEFAULT_THEME : DEFAULT_GENERAL);
}

// Settings docs merge over the defaults (fields added later still appear).
function settingsRow(id, data) {
  return { ...defaultSetting(id), ...plainRow(data) };
}

// An empty backend state (the demo seed's shape) for a replica to fill.
export function emptyState() {
  return {
    seq: {},
    users: [],
    areas: [],
    tables: [],
    projectors: [],
    assets: [],
    categories: [],
    dishes: [],
    orders: [],
    activity: [],
    scenes: new Map(),
    pairing: new Map(), // unused in cloud mode (codes live in Firestore)
    settings: { general: defaultSetting('general'), theme: defaultSetting('theme') },
    nextId: () => {
      throw new Error('nextId: no id source');
    },
  };
}
