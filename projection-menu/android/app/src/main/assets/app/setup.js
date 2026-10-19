// First-run and settings screen of the Android app:
//   1. how the device reaches the system: the cloud (the restaurant's Firebase
//      project), a local server, or the offline demo;
//   local server:
//   2. what this device is: the staff app or a table's projector;
//   3. which restaurant server: found on the LAN (mDNS through native), typed
//      in, or scanned from a QR code, then checked with GET <server>/api/info;
//   4. for a projector, the 6-digit pairing code from the staff app, traded for
//      the player link with POST <server>/api/projectors/claim; then options
//      (PIN, screen pinning, start as home screen) and save.
//   cloud:
//   2. which Firebase project: the one built into the APK (cloud/firebase-config.js),
//      the one saved on the device, or a config pasted from the Firebase console,
//      checked with the cloud backend's probeProject();
//   3. what this device is: staff tablet or projector;
//   4. for a projector, the pairing code traded with claimProjector() (the
//      device signs in to the project anonymously and binds itself to the
//      projector); then the same options, and save. The device then opens the
//      bundled cloud pages (cloud/app.html, cloud/player.html?device=…).
// Native validates links and stores the config (see bridge.js for the contract).
// The server grants CORS to this page's origin (https://appassets.androidplatform.net).
//
// Chrome 80 syntax and APIs only (see bridge.js); the cloud backend is only
// loaded once the cloud is chosen.

import { BridgeError, bridge, isNative } from './bridge.js';
import { enableArrowNavigation } from './spatial-nav.js';
import { ConfigError, emulatorOptions, parseFirebaseConfig, validateFirebaseConfig } from '../cloud/config.js';
import builtInFirebase from '../cloud/firebase-config.js';

const DISCOVER_MS = 4000;
const INFO_TIMEOUT_MS = 6000;
const CLAIM_TIMEOUT_MS = 10000;
const PROBE_TIMEOUT_MS = 20000;
const CODE_LENGTH = 6;

const ROLES = {
  APP: { title: 'تطبيق الموظفين', icon: 'i-staff', opening: 'تطبيق الموظفين' },
  PLAYER: { title: 'جهاز عرض على طاولة', icon: 'i-projector', opening: 'العرض على الطاولة' },
};

// Role cards in the cloud flow; the local texts are the page's own (read at start).
const ROLE_TEXT = {
  cloud: {
    APP: ['تابلت الموظفين', 'ويتر · مصمم · مالك', 'الطاولات والطلبات والمنيو وتصميم العرض، من مشروع المطعم السحابي. يدخل كل موظف باسمه وصلاحياته.'],
    PLAYER: ['جهاز عرض (بروجكتر)', 'موصول بالبروجكتر فوق الطاولة', 'يعرض المنيو على سطح الطاولة، ويُربط بطاولته برمز من 6 أرقام من تطبيق الموظفين.'],
  },
};

// Step labels per connection (the stepper is hidden on the first screen's siblings).
const STEPS = {
  local: [
    ['connection', 'الاتصال'],
    ['role', 'الدور'],
    ['server', 'الخادم'],
    ['finish', null],
  ],
  cloud: [
    ['connection', 'الاتصال'],
    ['cloud', 'المشروع'],
    ['role', 'الدور'],
    ['finish', null],
  ],
};

// The bundled cloud pages (same origin as this page); native checks them again (CloudPages.kt).
const CLOUD_APP = '/cloud/app.html';
const CLOUD_PLAYER = '/cloud/player.html';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));

let state = null; // last getState reply
let view = null; // 'current' | 'connection' | 'cloud' | 'role' | 'server' | 'finish'

// Everything the wizard has collected so far.
const flow = {
  kind: null, // 'cloud' | 'local'
  // cloud: { config, source: 'builtin'|'saved'|'pasted', emulators, restaurantName, needsSetup, verified }
  cloud: null,
  unpaired: false, // a cloud projector sent back here to be paired again
  role: null, // 'APP' | 'PLAYER'
  server: null, // { origin, name, verified }
  current: null, // origin of the saved config's server, listed first in step 2
  playerUrl: null, // a player link that needs no code (QR, or the saved one)
  linkedLabel: '',
  claimed: null, // { url, label } once a code was traded (it is single use)
  code: '',
  optionsFor: null, // role the option defaults were last set for
};

class SetupError extends Error {}

// ── Small DOM helpers ──────────────────────────────────────────────
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      if (key === 'class') el.className = props[key];
      else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role' || key === 'dir') el.setAttribute(key, props[key]);
      else el[key] = props[key];
    }
  }
  el.append(...children.filter((c) => c != null && c !== false));
  return el;
}

function icon(id, cls = 'icon') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

const ltr = (text) => h('bdi', { dir: 'ltr' }, text);

// Element.replaceChildren needs Chrome 86.
function setChildren(el, ...children) {
  el.textContent = '';
  el.append(...children.filter((c) => c != null && c !== false));
}

function setStatus(el, kind, ...content) {
  el.dataset.kind = kind;
  setChildren(el, ...content);
}

const errorText = (err) =>
  err instanceof BridgeError || err instanceof SetupError ? err.message : 'حدث خطأ غير متوقع، أعد المحاولة';

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Focus is moved for remote-control users only; on touch screens it would
// just paint focus rings (and may pop up the keyboard).
function focusForRemote(el) {
  if (el && (state?.isTv || document.documentElement.classList.contains('keyboard'))) {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }
}

// ── Views ──────────────────────────────────────────────────────────
function show(next) {
  view = next;
  for (const name of ['current', 'connection', 'cloud', 'role', 'server', 'finish']) $(`#view-${name}`).hidden = name !== next;
  const steps = STEPS[flow.kind || 'local'];
  const index = steps.findIndex((step) => step[0] === next);
  $('#stepper').hidden = index < 0;
  $$('#stepper li').forEach((li, i) => {
    li.dataset.state = i < index ? 'done' : i === index ? 'current' : '';
    li.dataset.step = steps[i][0];
    li.querySelector('.step-label').textContent = steps[i][1] || (flow.role === 'APP' ? 'الخيارات' : 'الربط');
    if (i === index) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  $('#unpaired-notice').hidden = !(flow.unpaired && next === 'finish');
  window.scrollTo(0, 0);
}

// ── Startup ────────────────────────────────────────────────────────
async function init() {
  enableArrowNavigation();
  try {
    state = await bridge.getState();
  } catch (err) {
    show('role');
    setStatus($('#role-status'), 'error', errorText(err));
    return;
  }

  $('#webview-warning').hidden = state.webViewSupported !== false;
  $('#webview-version').textContent = state.webViewVersion ? ` (${state.webViewVersion})` : '';
  $('#versions').textContent = [
    `v${state.appVersion}`,
    state.webViewVersion && `WebView ${state.webViewVersion}`,
    !isNative && 'browser mock',
  ]
    .filter(Boolean)
    .join(' · ');
  document.body.classList.toggle('tv', Boolean(state.isTv));
  // A remote has no pointer: show the focus ring from the first screen on.
  if (state.isTv) document.documentElement.classList.add('keyboard');
  $('#scan').hidden = !state.hasCamera;
  $('#emulators-row').hidden = !state.debug;

  if (state.config && new URLSearchParams(location.search).get('unpaired') === '1' && isCloudUrl(state.config.url, CLOUD_PLAYER)) {
    startRepairing();
  } else if (state.config) {
    showCurrent();
  } else {
    showConnection();
  }
}

// ── Cloud helpers ──────────────────────────────────────────────────
function isCloudUrl(url, path) {
  try {
    const parsed = new URL(url);
    return parsed.origin === location.origin && (path ? parsed.pathname === path : parsed.pathname.indexOf('/cloud/') === 0);
  } catch {
    return false;
  }
}

function urlParam(url, name) {
  try {
    return new URL(url).searchParams.get(name);
  } catch {
    return null;
  }
}

function validBuiltIn() {
  try {
    return builtInFirebase ? validateFirebaseConfig(builtInFirebase) : null;
  } catch {
    return null; // a broken built-in project is simply not offered
  }
}

// The project a saved cloud config uses: {config, source} or null.
function savedProject(config) {
  if (!config || !isCloudUrl(config.url)) return null;
  if (config.firebase) {
    try {
      return { config: validateFirebaseConfig(config.firebase), source: 'saved' };
    } catch {
      return null;
    }
  }
  const builtIn = validBuiltIn();
  return builtIn ? { config: builtIn, source: 'builtin' } : null;
}

// "<page>?device=…&emulators=…" on this origin.
function cloudUrl(path, params) {
  const query = Object.keys(params)
    .filter((key) => params[key])
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
  return `${location.origin}${path}${query ? `?${query}` : ''}`;
}

// The cloud backend: loaded on first use (Firebase SDK, import map, Chrome 89+).
let backendModule = null;
function cloudBackend() {
  if (!backendModule) {
    backendModule = import('../cloud/backend/index.js').catch((err) => {
      backendModule = null;
      console.error(err);
      throw new SetupError(
        state && state.webViewSupported === false
          ? 'الوضع السحابي يحتاج نسخة أحدث من «Android System WebView» — حدّثها من Google Play'
          : 'تعذّر تحميل الوضع السحابي في هذه النسخة من التطبيق',
      );
    });
  }
  return backendModule;
}

// A cloud call with a time limit and its Arabic error as a SetupError.
async function cloudCall(run, timeoutMs, timeoutMessage) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new SetupError(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([run(await cloudBackend()), timeout]);
  } catch (err) {
    if (err instanceof SetupError) throw err;
    console.warn(err); // the message is shown; the stack helps over remote debugging
    throw new SetupError((err && err.message) || 'تعذّر الاتصال بمشروع Firebase');
  } finally {
    clearTimeout(timer);
  }
}

function projectLabel(cloud) {
  return cloud.restaurantName || `Firebase · ${cloud.config.projectId}`;
}

// ── Saved configuration ────────────────────────────────────────────
function showCurrent() {
  const { config } = state;
  const role = ROLES[config.mode] || ROLES.APP;
  $('#current-icon').setAttribute('href', `#${role.icon}`);
  $('#current-title').textContent = role.title;
  $('#current-label').textContent = config.label || '';
  if (isCloudUrl(config.url)) {
    const project = savedProject(config);
    const emulators = urlParam(config.url, 'emulators');
    $('#current-host-icon').setAttribute('href', '#i-cloud');
    $('#current-host').textContent = [
      `Firebase · ${project ? project.config.projectId : '—'}`,
      emulators && `emulators @ ${emulators}`,
    ]
      .filter(Boolean)
      .join(' · ');
  } else {
    $('#current-host-icon').setAttribute('href', '#i-server');
    $('#current-host').textContent = hostOf(config.url);
  }
  setChildren(
    $('#current-tags'),
    ...[
      config.kiosk && ['i-lock', 'قفل الشاشة'],
      config.hasPin && ['i-key', 'محمي برمز PIN'],
      config.launcher && ['i-home', 'يبدأ تلقائياً'],
    ]
      .filter(Boolean)
      .map(([id, text]) => h('span', { class: 'tag' }, icon(id), text)),
  );
  setStatus($('#current-status'), '', '');
  show('current');
  focusForRemote($('#resume'));
}

$('#resume').addEventListener('click', async () => {
  setStatus($('#current-status'), 'busy', 'جارٍ الفتح…');
  try {
    await bridge.resume();
  } catch (err) {
    setStatus($('#current-status'), 'error', errorText(err));
  }
});

// Change: the wizard starts from the saved setup (same connection and role,
// the saved server or project listed first).
$('#change').addEventListener('click', () => {
  const { config } = state;
  const cloud = isCloudUrl(config.url);
  flow.kind = cloud ? 'cloud' : 'local';
  flow.cloud = null;
  flow.unpaired = false;
  flow.role = config.mode;
  flow.current = cloud ? null : originOf(config.url);
  flow.server = null;
  flow.playerUrl = config.mode === 'PLAYER' ? config.url : null;
  flow.linkedLabel = config.mode === 'PLAYER' ? config.label : '';
  flow.claimed = null;
  setOptions({ kiosk: config.kiosk, launcher: config.launcher });
  flow.optionsFor = config.mode;
  showConnection();
});

// Two-step delete instead of confirm(): works the same with a TV remote.
let resetArmed = null;
$('#reset').addEventListener('click', async () => {
  const button = $('#reset');
  if (!resetArmed) {
    button.textContent = 'اضغط مرة أخرى لتأكيد الحذف';
    resetArmed = setTimeout(() => {
      resetArmed = null;
      button.textContent = 'حذف الإعداد';
    }, 4000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  button.textContent = 'حذف الإعداد';
  try {
    state = await bridge.resetConfig();
    Object.assign(flow, {
      kind: null,
      cloud: null,
      unpaired: false,
      role: null,
      server: null,
      current: null,
      playerUrl: null,
      linkedLabel: '',
      claimed: null,
      code: '',
      optionsFor: null,
    });
    clearPin();
    showConnection();
  } catch (err) {
    setStatus($('#current-status'), 'error', errorText(err));
  }
});

// ── Step 1: connection ─────────────────────────────────────────────
function showConnection() {
  for (const card of $$('.role[data-connection]')) card.setAttribute('aria-checked', String(card.dataset.connection === flow.kind));
  setStatus($('#connection-status'), '', '');
  show('connection');
  focusForRemote($(`.role[data-connection="${flow.kind || 'cloud'}"]`));
}

for (const card of $$('.role[data-connection]')) {
  card.addEventListener('click', () => chooseConnection(card.dataset.connection));
}

function chooseConnection(kind) {
  if (flow.kind !== kind) {
    flow.kind = kind;
    // A link or a claim of the other connection means nothing here.
    flow.server = null;
    flow.cloud = null;
    flow.playerUrl = null;
    flow.linkedLabel = '';
    flow.claimed = null;
  }
  if (kind === 'cloud') showCloud();
  else showRoles();
}

$('.role[data-role="DEMO"]').addEventListener('click', async () => {
  setStatus($('#connection-status'), 'busy', 'جارٍ فتح العرض التجريبي…');
  try {
    await bridge.startDemo();
  } catch (err) {
    setStatus($('#connection-status'), 'error', errorText(err));
  }
});

// ── Cloud step 2: the Firebase project ─────────────────────────────
function showCloud() {
  setStatus($('#projects-status'), '', '');
  setStatus($('#cloud-status'), '', '');
  if (state.config && isCloudUrl(state.config.url)) {
    const emulators = urlParam(state.config.url, 'emulators');
    if (emulators && !$('#emulators').value) $('#emulators').value = emulators;
  }
  renderProjects();
  show('cloud');
  focusForRemote($('#projects .server-item') || $('#firebase-config'));
}

$('[data-back="connection"]').addEventListener('click', showConnection);

// The built-in project and the one saved on this device (when another).
function renderProjects() {
  const items = [];
  const saved = savedProject(state.config);
  if (saved && saved.source === 'saved') {
    items.push({ config: saved.config, source: 'saved', tag: 'المشروع الحالي', name: '' });
  }
  const builtIn = validBuiltIn();
  if (builtIn && !items.some((item) => item.config.projectId === builtIn.projectId)) {
    items.push({ config: builtIn, source: 'builtin', tag: saved && saved.source === 'builtin' ? 'المشروع الحالي · مدمج في التطبيق' : 'مدمج في التطبيق', name: '' });
  }
  setChildren(
    $('#projects'),
    ...items.map((item) => {
      const button = h(
        'button',
        { type: 'button', class: 'server-item' },
        h('span', { class: 'server-icon' }, icon('i-cloud')),
        h(
          'span',
          { class: 'server-text' },
          h('span', { class: 'server-tag' }, item.tag),
          h('strong', null, item.name || 'مشروع المطعم'),
          h('span', { class: 'server-host' }, ltr(`Firebase · ${item.config.projectId}`)),
        ),
        h('span', { class: 'spinner', 'aria-hidden': 'true' }),
        icon('i-chevron', 'icon chevron'),
      );
      button.addEventListener('click', () => chooseProject(item.config, item.source, { from: button }));
      return h('li', null, button);
    }),
  );
  $('#projects-empty').hidden = items.length > 0;
}

$('#cloud-check').addEventListener('click', () => {
  let config;
  try {
    config = parseFirebaseConfig($('#firebase-config').value);
  } catch (err) {
    setStatus($('#cloud-status'), 'error', err instanceof ConfigError ? err.message : errorText(err));
    $('#firebase-config').focus();
    return;
  }
  chooseProject(config, 'pasted', { from: null });
});

function emulatorsValue() {
  if (!state.debug) return null;
  const value = $('#emulators').value.trim();
  return value || null;
}

// Checks the project with probeProject(), then continues to the role.
let probing = false;
async function chooseProject(config, source, { from }) {
  if (probing) return;
  const emulators = emulatorsValue();
  if (emulators && !/^([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])$/.test(emulators)) {
    setStatus($('#cloud-status'), 'error', 'عنوان المحاكيات غير صالح — اكتب اسم الكمبيوتر أو عنوان IP فقط');
    return;
  }
  probing = true;
  const status = from ? $('#projects-status') : $('#cloud-status');
  const busyEl = from || $('#cloud-check');
  busyEl.setAttribute('aria-busy', 'true');
  setStatus($('#projects-status'), '', '');
  setStatus($('#cloud-status'), '', '');
  setStatus(status, 'busy', 'جارٍ الاتصال بمشروع ', ltr(config.projectId), '…');
  try {
    const info = await cloudCall(
      (backend) => backend.probeProject(config, { emulators: emulatorOptions(emulators) }),
      PROBE_TIMEOUT_MS,
      'انتهت مهلة الاتصال بمشروع Firebase — تأكد من اتصال الإنترنت',
    );
    if (!info || info.ok === false) throw new SetupError('لم يقبل مشروع Firebase الاتصال — تأكد من الإعدادات');
    useProject({ config, source, emulators, restaurantName: info.restaurantName || '', needsSetup: Boolean(info.needsSetup), verified: true });
  } catch (err) {
    // The staff app can still be opened unchecked: its own page shows what is wrong.
    const force = h('button', { type: 'button', class: 'btn ghost small force' }, 'المتابعة دون التحقق');
    force.addEventListener('click', () => useProject({ config, source, emulators, restaurantName: '', needsSetup: false, verified: false }));
    setStatus(status, 'error', h('span', null, errorText(err)), force);
  } finally {
    busyEl.removeAttribute('aria-busy');
    probing = false;
  }
}

function useProject(cloud) {
  // A saved projector link only counts for the project it was paired with.
  const saved = savedProject(state.config);
  const sameProject = saved && saved.config.projectId === cloud.config.projectId;
  if (flow.playerUrl && !(sameProject && isCloudUrl(flow.playerUrl, CLOUD_PLAYER))) {
    flow.playerUrl = null;
    flow.linkedLabel = '';
  }
  if (flow.cloud && flow.cloud.config.projectId !== cloud.config.projectId) flow.claimed = null;
  flow.cloud = cloud;
  showRoles();
}

// ── Role ───────────────────────────────────────────────────────────
// The local texts, as written in the page.
const LOCAL_ROLE_TEXT = {};
for (const card of $$('#view-role .role[data-role]')) {
  LOCAL_ROLE_TEXT[card.dataset.role] = ['strong', '.role-who', 'small'].map((sel) => card.querySelector(sel).textContent);
}

function showRoles() {
  const texts = flow.kind === 'cloud' ? ROLE_TEXT.cloud : LOCAL_ROLE_TEXT;
  for (const card of $$('#view-role .role[data-role]')) {
    card.setAttribute('aria-checked', String(card.dataset.role === flow.role));
    const [title, who, text] = texts[card.dataset.role];
    card.querySelector('strong').textContent = title;
    card.querySelector('.role-who').textContent = who;
    card.querySelector('small').textContent = text;
  }
  // A new cloud project has no owner yet: only the staff app can create one.
  if (flow.kind === 'cloud' && flow.cloud && flow.cloud.needsSetup) {
    setStatus($('#role-status'), '', 'المشروع جديد: ابدأ بتابلت الموظفين لإنشاء حساب المالك، ثم اربط أجهزة العرض.');
  } else {
    setStatus($('#role-status'), '', '');
  }
  show('role');
  // A TV box is almost always a projector's player.
  focusForRemote($(`#view-role .role[data-role="${flow.role || (state?.isTv ? 'PLAYER' : 'APP')}"]`));
}

$('#role-back').addEventListener('click', () => (flow.kind === 'cloud' ? showCloud() : showConnection()));

for (const card of $$('#view-role .role[data-role]')) {
  card.addEventListener('click', () => chooseRole(card.dataset.role));
}

function chooseRole(role) {
  if (flow.role !== role) {
    flow.role = role;
    flow.server = null;
    flow.playerUrl = null;
    flow.claimed = null;
  }
  if (flow.kind === 'cloud') showFinish();
  else showServers();
}

// A cloud projector whose pairing was removed: straight to a new code.
function startRepairing() {
  const { config } = state;
  const project = savedProject(config);
  if (!project) return showCurrent();
  Object.assign(flow, {
    kind: 'cloud',
    cloud: {
      config: project.config,
      source: project.source,
      emulators: urlParam(config.url, 'emulators'),
      restaurantName: '',
      needsSetup: false,
      verified: false,
    },
    unpaired: true,
    role: 'PLAYER',
    playerUrl: null,
    linkedLabel: '',
    claimed: null,
  });
  setOptions({ kiosk: config.kiosk, launcher: config.launcher });
  flow.optionsFor = 'PLAYER';
  showFinish();
}

// ── Local step 3: server ───────────────────────────────────────────
let found = []; // last discovery result
let searching = false;

function showServers() {
  setStatus($('#manual-status'), '', '');
  renderServers();
  show('server');
  search();
  focusForRemote($('#servers .server-item') || $('#search'));
}

$('[data-back="role"]').addEventListener('click', showRoles);
$('#search').addEventListener('click', () => search());

async function search() {
  if (searching) return;
  searching = true;
  const button = $('#search');
  button.setAttribute('aria-busy', 'true');
  $('#search-label').textContent = 'جارٍ البحث…';
  $('#discover-empty').hidden = true;
  setStatus($('#discover-status'), 'busy', 'نبحث عن خوادم المنيو الضوئي على هذه الشبكة…');
  let reply = null;
  try {
    reply = await bridge.discover(DISCOVER_MS);
  } catch (err) {
    reply = { servers: [], error: errorText(err) };
  }
  searching = false;
  button.removeAttribute('aria-busy');
  $('#search-label').textContent = 'بحث مجدداً';
  found = Array.isArray(reply.servers) ? reply.servers : [];
  renderServers();
  const listed = $$('#servers .server-item').length;
  setStatus($('#discover-status'), '', '');
  if (!listed) {
    $('#discover-empty').hidden = false;
    $('#discover-empty-text').textContent =
      reply.error || 'لم نعثر على خادم. تأكد أن الخادم يعمل وأن هذا الجهاز على نفس شبكة الواي فاي، أو أدخل العنوان يدوياً.';
  }
  // A remote user who has not moved yet lands on the first server found.
  if (view === 'server' && (document.activeElement === button || document.activeElement === document.body)) {
    focusForRemote($('#servers .server-item') || button);
  }
}

function renderServers() {
  const items = [];
  const seen = new Set();
  if (flow.current) {
    items.push({ origin: flow.current, name: '', tag: 'الخادم الحالي' });
    seen.add(flow.current);
  }
  for (const server of found) {
    const origin = originOf(server.url);
    if (!origin || seen.has(origin)) {
      // The saved server was found too: give it its announced name.
      const known = items.find((item) => item.origin === origin);
      if (known && !known.name) known.name = server.name;
      continue;
    }
    seen.add(origin);
    items.push({ origin, name: server.name || '' });
  }
  setChildren(
    $('#servers'),
    ...items.map((item) => {
      const button = h(
        'button',
        { type: 'button', class: 'server-item' },
        h('span', { class: 'server-icon' }, icon('i-server')),
        h(
          'span',
          { class: 'server-text' },
          item.tag && h('span', { class: 'server-tag' }, item.tag),
          h('strong', null, item.name || 'خادم المنيو الضوئي'),
          h('span', { class: 'server-host' }, ltr(hostOf(item.origin))),
        ),
        h('span', { class: 'spinner', 'aria-hidden': 'true' }),
        icon('i-chevron', 'icon chevron'),
      );
      button.addEventListener('click', () => chooseServer(item, { from: button }));
      return h('li', null, button);
    }),
  );
}

// Checks a server with GET /api/info, then continues to step 3.
let checking = false;
async function chooseServer(candidate, { from = null } = {}) {
  if (checking) return;
  checking = true;
  const status = from ? $('#discover-status') : $('#manual-status');
  const busyEl = from || $('#connect');
  busyEl.setAttribute('aria-busy', 'true');
  setStatus($('#discover-status'), '', '');
  setStatus($('#manual-status'), '', '');
  setStatus(status, 'busy', 'جارٍ الاتصال بالخادم ', ltr(hostOf(candidate.origin)), '…');
  try {
    const info = await fetchInfo(candidate.origin);
    useServer({ origin: candidate.origin, name: info.restaurantName || candidate.name || '', verified: true });
  } catch (err) {
    // The staff app can still be opened unchecked: its own page then shows what is wrong.
    const force =
      flow.role === 'APP' &&
      h('button', { type: 'button', class: 'btn ghost small force' }, 'المتابعة دون التحقق');
    if (force) force.addEventListener('click', () => useServer({ origin: candidate.origin, name: candidate.name || '', verified: false }));
    setStatus(status, 'error', h('span', null, errorText(err)), force);
  } finally {
    busyEl.removeAttribute('aria-busy');
    checking = false;
  }
}

function useServer(server) {
  flow.server = server;
  // A player link (QR or saved) only counts for the server it belongs to.
  if (flow.playerUrl && originOf(flow.playerUrl) !== server.origin) {
    flow.playerUrl = null;
    flow.linkedLabel = '';
  }
  if (flow.claimed && originOf(flow.claimed.url) !== server.origin) flow.claimed = null;
  showFinish();
}

async function fetchInfo(origin) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INFO_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${origin}/api/info`, { cache: 'no-store', credentials: 'omit', signal: ctrl.signal });
  } catch (err) {
    throw new SetupError(
      err && err.name === 'AbortError'
        ? 'انتهت مهلة الاتصال بالخادم — تأكد من العنوان ومن اتصال الشبكة'
        : 'تعذّر الوصول إلى الخادم على هذا العنوان — تأكد أنه يعمل وأن الجهاز على نفس الشبكة',
    );
  } finally {
    clearTimeout(timer);
  }
  const info = res.ok ? await res.json().catch(() => null) : null;
  if (!info || info.app !== 'projection-menu') {
    throw new SetupError('هذا العنوان يعمل لكنه ليس خادم المنيو الضوئي (أو نسخة قديمة منه)');
  }
  return info;
}

// Typed address (or a pasted link) → native normalizes it like a QR code.
$('#manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#address').value.trim();
  if (!text) {
    setStatus($('#manual-status'), 'error', 'اكتب عنوان الخادم، مثل 192.168.1.10:3000');
    $('#address').focus();
    return;
  }
  useLink(text);
});

$('#scan').addEventListener('click', async () => {
  let reply;
  try {
    reply = await bridge.scanQr();
  } catch (err) {
    setStatus($('#manual-status'), 'error', errorText(err));
    return;
  }
  if (reply.type === 'scanResult') useLink(reply.text);
});

// A server address, a staff-app link or a projector link (/player/?device=…).
async function useLink(text) {
  let reply;
  try {
    reply = await bridge.validateLink(text);
  } catch (err) {
    setStatus($('#manual-status'), 'error', errorText(err));
    return;
  }
  if (!reply.ok) {
    setStatus($('#manual-status'), 'error', reply.error || 'العنوان غير صالح');
    return;
  }
  const origin = originOf(reply.normalizedUrl);
  if (reply.mode === 'PLAYER') {
    // A projector link carries its own key: no pairing code needed.
    flow.role = 'PLAYER';
    flow.playerUrl = reply.normalizedUrl;
    flow.linkedLabel = '';
    flow.claimed = null;
  } else if (flow.role === 'PLAYER') {
    flow.playerUrl = null;
  }
  await chooseServer({ origin, name: '' });
}

// ── Last step: pairing code + options ──────────────────────────────
$('#finish-back').addEventListener('click', () => (flow.kind === 'cloud' ? showRoles() : showServers()));

function needsCode() {
  return flow.role === 'PLAYER' && !flow.playerUrl && !flow.claimed;
}

function showFinish() {
  const player = flow.role === 'PLAYER';
  const cloud = flow.kind === 'cloud';
  if (flow.optionsFor !== flow.role) {
    // Projectors are locked by default; staff tablets are not.
    setOptions({ kiosk: player, launcher: false });
    flow.optionsFor = flow.role;
  }
  $('#finish-title').textContent = player ? (needsCode() ? 'اربط الجهاز بطاولته' : 'جاهز للعرض') : 'جاهز للتشغيل';
  $('#finish-sub').textContent = player
    ? needsCode()
      ? 'أدخل رمز الربط المكوّن من 6 أرقام الظاهر في تطبيق الموظفين.'
      : 'راجع خيارات الجهاز ثم ابدأ العرض.'
    : cloud && flow.cloud.needsSetup
      ? 'سيفتح تطبيق الموظفين على المشروع السحابي الجديد لإنشاء حساب المالك أولاً.'
      : 'سيفتح تطبيق الموظفين، ويدخل كل موظف باسم المستخدم وكلمة المرور الخاصة به.';

  const chip = $('#server-chip');
  if (cloud) {
    const project = flow.cloud;
    chip.classList.toggle('unverified', !project.verified);
    setChildren(
      chip,
      icon(project.verified ? 'i-check' : 'i-cloud'),
      project.restaurantName ? h('strong', null, project.restaurantName) : null,
      project.restaurantName ? ' · ' : null,
      ltr(`Firebase · ${project.config.projectId}`),
      project.emulators ? ltr(` · emulators @ ${project.emulators}`) : null,
      project.verified ? null : ' — لم يتم التحقق من المشروع',
    );
  } else {
    const { server } = flow;
    chip.classList.toggle('unverified', !server.verified);
    setChildren(
      chip,
      icon(server.verified ? 'i-check' : 'i-alert'),
      server.name ? h('strong', null, server.name) : null,
      server.name ? ' · ' : null,
      ltr(hostOf(server.origin)),
      server.verified ? null : ' — لم يتم التحقق من الخادم',
    );
  }

  $('#pair').hidden = !needsCode();
  $('#linked').hidden = !player || needsCode();
  document.querySelector('.finish-grid').classList.toggle('single', !player);
  if (player && !needsCode()) {
    const label = flow.claimed ? flow.claimed.label : flow.linkedLabel;
    $('#linked-title').textContent = flow.claimed ? 'تم ربط الجهاز' : 'هذا الجهاز مربوط برابط جاهز';
    $('#linked-label').textContent =
      label || (cloud ? `جهاز عرض في مشروع ${flow.cloud.config.projectId}` : 'رابط جهاز العرض من الخادم ' + hostOf(flow.server.origin));
    $('#relink').hidden = Boolean(flow.claimed);
  }
  setCode('');
  setStatus($('#pair-status'), '', '');
  setStatus($('#save-status'), '', '');
  updateSaveLabel();
  updatePinStatus();
  $('#save').disabled = false;
  show('finish');
  focusForRemote(needsCode() ? $('#keypad [data-key="1"]') : $('#save'));
}

function updateSaveLabel() {
  setChildren($('#save'), icon(needsCode() ? 'i-link' : 'i-play'), needsCode() ? 'ربط وتشغيل' : 'حفظ وتشغيل');
}

$('#relink').addEventListener('click', () => {
  flow.playerUrl = null;
  flow.linkedLabel = '';
  showFinish();
});

function setOptions({ kiosk, launcher }) {
  $('#kiosk').checked = Boolean(kiosk);
  $('#launcher').checked = Boolean(launcher);
}

// Pairing code: on-screen keypad (D-pad friendly), digit keys anywhere.
function setCode(code) {
  flow.code = code;
  const digits = $$('#code .digit');
  digits.forEach((el, i) => {
    el.textContent = code[i] || '';
    el.classList.toggle('filled', i < code.length);
    el.classList.toggle('active', i === code.length);
  });
  $('#code').setAttribute('aria-label', code ? `رمز الربط ${code.split('').join(' ')}` : 'رمز الربط فارغ');
}

function typeKey(key) {
  if (key === 'back') setCode(flow.code.slice(0, -1));
  else if (key === 'clear') setCode('');
  else if (/^[0-9]$/.test(key) && flow.code.length < CODE_LENGTH) setCode(flow.code + key);
  else return;
  setStatus($('#pair-status'), '', '');
  // Six digits typed: the next OK press pairs.
  if (flow.code.length === CODE_LENGTH) focusForRemote($('#save'));
}

$('#keypad').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-key]');
  if (button) typeKey(button.dataset.key);
});

document.addEventListener('keydown', (e) => {
  if (view !== 'finish' || $('#pair').hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  const target = e.target;
  if (target && target.tagName === 'INPUT' && target.type !== 'checkbox') return; // typing a PIN
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    typeKey(e.key);
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    typeKey('back');
  }
});

// ── PIN ────────────────────────────────────────────────────────────
const clearingPin = () => !$('#pin-clear-row').hidden && $('#pin-clear').checked;

function clearPin() {
  $('#pin').value = '';
  $('#pin2').value = '';
  $('#pin-clear').checked = false;
}

function pinError() {
  if (clearingPin()) return null;
  const pin = $('#pin').value;
  const confirm = $('#pin2').value;
  if (!pin && !confirm) return null;
  if (!/^\d{4,8}$/.test(pin)) return 'الرمز من 4 إلى 8 أرقام فقط';
  if (pin !== confirm) return confirm ? 'الرمزان غير متطابقين' : 'أعد كتابة الرمز في خانة التأكيد';
  return null;
}

function updatePinStatus() {
  const hasPin = Boolean(state?.config?.hasPin);
  $('#pin-clear-row').hidden = !hasPin;
  const status = $('#pin-status');
  const clearing = clearingPin();
  $('#pin').disabled = clearing;
  $('#pin2').disabled = clearing;
  if (clearing) return setStatus(status, '', 'سيُلغى الرمز الحالي عند الحفظ.');
  const error = pinError();
  if (error) return setStatus(status, 'error', error);
  if ($('#pin').value) return setStatus(status, 'ok', hasPin ? '✓ سيحل هذا الرمز محل الرمز الحالي' : '✓ سيُطلب هذا الرمز لفتح الإعدادات');
  setStatus(status, '', hasPin ? 'يوجد رمز حالياً وسيبقى كما هو. اكتب رمزاً جديداً لتغييره.' : 'بدون رمز يستطيع أي شخص فتح الإعدادات.');
}

for (const id of ['#pin', '#pin2']) {
  $(id).addEventListener('input', (e) => {
    // Arabic-Indic digits from Arabic keyboards count as 0-9.
    e.target.value = e.target.value
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
      .replace(/\D/g, '')
      .slice(0, 8);
    updatePinStatus();
  });
}
$('#pin-clear').addEventListener('change', updatePinStatus);

// ── Save ───────────────────────────────────────────────────────────
let saving = false;
$('#save').addEventListener('click', async () => {
  if (saving) return;
  const pinProblem = pinError();
  if (pinProblem) {
    setStatus($('#save-status'), 'error', pinProblem);
    $('#pin').focus();
    return;
  }
  saving = true;
  $('#save').disabled = true;
  try {
    const target = flow.role === 'PLAYER' ? await playerTarget() : appTarget();
    if (!target) return;
    setStatus($('#save-status'), 'busy', 'جارٍ الحفظ…');
    await bridge.saveConfig({
      url: target.url,
      label: target.label,
      // null keeps the saved PIN (e.g. re-pairing); '' removes it.
      pin: clearingPin() ? '' : $('#pin').value || null,
      kiosk: $('#kiosk').checked,
      launcher: $('#launcher').checked,
      // Cloud: the project's config, or null for the APK's built-in one (it then
      // follows the installed app).
      firebase: flow.kind === 'cloud' && flow.cloud.source !== 'builtin' ? flow.cloud.config : null,
    });
    setStatus($('#save-status'), 'ok', `✓ تم الحفظ — جارٍ فتح ${ROLES[flow.role].opening}…`);
  } catch (err) {
    setStatus($('#save-status'), 'error', errorText(err));
  } finally {
    saving = false;
    $('#save').disabled = false;
  }
});

function appTarget() {
  if (flow.kind === 'cloud') {
    return { url: cloudUrl(CLOUD_APP, { emulators: flow.cloud.emulators }), label: projectLabel(flow.cloud) };
  }
  return { url: `${flow.server.origin}/app/`, label: flow.server.name || '' };
}

function tableLabel(number, name) {
  return [`طاولة ${number}`, name].filter(Boolean).join(' · ');
}

// The player link: already known, or traded for the pairing code now.
async function playerTarget() {
  if (flow.claimed) return flow.claimed;
  if (flow.playerUrl) {
    const fallback = flow.kind === 'cloud' ? projectLabel(flow.cloud) : flow.server.name || '';
    return { url: flow.playerUrl, label: flow.linkedLabel || fallback };
  }
  const status = $('#pair-status');
  if (flow.code.length !== CODE_LENGTH) {
    setStatus(status, 'error', 'أدخل رمز الربط المكوّن من 6 أرقام');
    shakeCode();
    focusForRemote($('#keypad [data-key="1"]'));
    return null;
  }
  setStatus(status, 'busy', flow.kind === 'cloud' ? 'جارٍ الربط بمشروع المطعم…' : 'جارٍ الربط بالخادم…');
  try {
    flow.claimed = flow.kind === 'cloud' ? await claimCloud(flow.code) : await claimLocal(flow.code);
  } catch (err) {
    setStatus(status, 'error', errorText(err));
    setCode('');
    shakeCode();
    focusForRemote($('#keypad [data-key="1"]'));
    return null;
  }
  // The code is spent: from now on this device keeps the link it got.
  setStatus(status, 'ok', `✓ تم الربط بـ${flow.claimed.label}`);
  return flow.claimed;
}

async function claimLocal(code) {
  const result = await claim(flow.server.origin, code);
  return { url: new URL(result.playerUrl, `${flow.server.origin}/`).href, label: tableLabel(result.table.number, flow.server.name) };
}

// The device signs in to the project and binds itself to the projector of the
// code; its player page then needs no key (device=<projector> only keeps the
// player's cached menu apart from another table's).
async function claimCloud(code) {
  const { config, emulators } = flow.cloud;
  const result = await cloudCall(
    // The player page signs in with the same app instance (DEVICE_APP), so it
    // finds the anonymous user that this claim bound to the projector.
    (backend) => backend.claimProjector(config, code, { appName: backend.DEVICE_APP, emulators: emulatorOptions(emulators) }),
    CLAIM_TIMEOUT_MS * 2,
    'انتهت مهلة الاتصال بمشروع Firebase — تأكد من اتصال الإنترنت ثم أعد المحاولة',
  );
  if (!result || !result.projector || result.projector.id == null) throw new SetupError('ردّ غير متوقع من مشروع Firebase');
  if (result.restaurantName) flow.cloud.restaurantName = result.restaurantName;
  const name = flow.cloud.restaurantName;
  return {
    url: cloudUrl(CLOUD_PLAYER, { device: `p${result.projector.id}`, emulators }),
    // A projector not on a table yet (the owner places it later) is named instead.
    label: result.table ? tableLabel(result.table.number, name) : [result.projector.name, name].filter(Boolean).join(' · '),
  };
}

async function claim(origin, code) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLAIM_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${origin}/api/projectors/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl.signal,
    });
  } catch {
    throw new SetupError('تعذّر الاتصال بالخادم — تأكد من الشبكة ثم أعد المحاولة');
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new SetupError((body && body.error) || 'تعذّر الربط، أعد المحاولة');
  if (!body || typeof body.playerUrl !== 'string' || !body.table) throw new SetupError('ردّ غير متوقع من الخادم');
  return body;
}

function shakeCode() {
  const code = $('#code');
  code.classList.remove('shake');
  void code.offsetWidth; // restart the animation
  code.classList.add('shake');
}

setCode('');
init();
// Last on purpose: if anything above throws on an outdated WebView, the inline
// fallback in setup.html shows the update warning instead of a dead page.
window.setupReady = true;
