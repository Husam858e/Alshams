// First-run and settings screen of the Android app:
//   1. what this device is: the staff app, a table's projector, or the offline demo;
//   2. which restaurant server: found on the LAN (mDNS through native), typed
//      in, or scanned from a QR code, then checked with GET <server>/api/info;
//   3. for a projector, the 6-digit pairing code from the staff app, traded for
//      the player link with POST <server>/api/projectors/claim; then options
//      (PIN, screen pinning, start as home screen) and save.
// Native validates links and stores the config (see bridge.js for the contract).
// The server grants CORS to this page's origin (https://appassets.androidplatform.net).
//
// Chrome 80 syntax and APIs only (see bridge.js).

import { BridgeError, bridge, isNative } from './bridge.js';
import { enableArrowNavigation } from './spatial-nav.js';

const DISCOVER_MS = 4000;
const INFO_TIMEOUT_MS = 6000;
const CLAIM_TIMEOUT_MS = 10000;
const CODE_LENGTH = 6;

const ROLES = {
  APP: { title: 'تطبيق الموظفين', icon: 'i-staff', opening: 'تطبيق الموظفين' },
  PLAYER: { title: 'جهاز عرض على طاولة', icon: 'i-projector', opening: 'العرض على الطاولة' },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));

let state = null; // last getState reply
let view = null; // 'current' | 'role' | 'server' | 'finish'

// Everything the wizard has collected so far.
const flow = {
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
const STEPS = ['role', 'server', 'finish'];

function show(next) {
  view = next;
  for (const name of ['current', 'role', 'server', 'finish']) $(`#view-${name}`).hidden = name !== next;
  const stepper = $('#stepper');
  const index = STEPS.indexOf(next);
  stepper.hidden = index < 0;
  $$('#stepper li').forEach((li, i) => {
    li.dataset.state = i < index ? 'done' : i === index ? 'current' : '';
    if (i === index) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  $('#finish-step-label').textContent = flow.role === 'APP' ? 'الخيارات' : 'الربط';
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
  $('#scan').hidden = !state.hasCamera;

  if (state.config) showCurrent();
  else showRoles();
}

// ── Saved configuration ────────────────────────────────────────────
function showCurrent() {
  const { config } = state;
  const role = ROLES[config.mode] || ROLES.APP;
  $('#current-icon').setAttribute('href', `#${role.icon}`);
  $('#current-title').textContent = role.title;
  $('#current-label').textContent = config.label || '';
  $('#current-host').textContent = hostOf(config.url);
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

// Change: the wizard starts from the saved setup (same role, server listed first).
$('#change').addEventListener('click', () => {
  const { config } = state;
  flow.role = config.mode;
  flow.current = originOf(config.url);
  flow.server = null;
  flow.playerUrl = config.mode === 'PLAYER' ? config.url : null;
  flow.linkedLabel = config.mode === 'PLAYER' ? config.label : '';
  flow.claimed = null;
  setOptions({ kiosk: config.kiosk, launcher: config.launcher });
  flow.optionsFor = config.mode;
  showRoles();
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
    Object.assign(flow, { role: null, server: null, current: null, playerUrl: null, linkedLabel: '', claimed: null, code: '', optionsFor: null });
    clearPin();
    showRoles();
  } catch (err) {
    setStatus($('#current-status'), 'error', errorText(err));
  }
});

// ── Step 1: role ───────────────────────────────────────────────────
function showRoles() {
  for (const card of $$('.role[data-role]')) {
    if (card.hasAttribute('aria-checked')) card.setAttribute('aria-checked', String(card.dataset.role === flow.role));
  }
  setStatus($('#role-status'), '', '');
  show('role');
  // A TV box is almost always a projector's player.
  focusForRemote($(`.role[data-role="${flow.role || (state?.isTv ? 'PLAYER' : 'APP')}"]`));
}

for (const card of $$('.role[data-role]')) {
  card.addEventListener('click', () => chooseRole(card.dataset.role));
}

async function chooseRole(role) {
  if (role === 'DEMO') {
    setStatus($('#role-status'), 'busy', 'جارٍ فتح العرض التجريبي…');
    try {
      await bridge.startDemo();
    } catch (err) {
      setStatus($('#role-status'), 'error', errorText(err));
    }
    return;
  }
  if (flow.role !== role) {
    flow.role = role;
    flow.server = null;
    flow.playerUrl = null;
    flow.claimed = null;
  }
  showServers();
}

// ── Step 2: server ─────────────────────────────────────────────────
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

// ── Step 3: pairing code + options ─────────────────────────────────
$('[data-back="server"]').addEventListener('click', showServers);

function needsCode() {
  return flow.role === 'PLAYER' && !flow.playerUrl && !flow.claimed;
}

function showFinish() {
  const player = flow.role === 'PLAYER';
  const { server } = flow;
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
    : 'سيفتح تطبيق الموظفين، ويدخل كل موظف باسم المستخدم وكلمة المرور الخاصة به.';

  const chip = $('#server-chip');
  chip.classList.toggle('unverified', !server.verified);
  setChildren(
    chip,
    icon(server.verified ? 'i-check' : 'i-alert'),
    server.name ? h('strong', null, server.name) : null,
    server.name ? ' · ' : null,
    ltr(hostOf(server.origin)),
    server.verified ? null : ' — لم يتم التحقق من الخادم',
  );

  $('#pair').hidden = !needsCode();
  $('#linked').hidden = !player || needsCode();
  document.querySelector('.finish-grid').classList.toggle('single', !player);
  if (player && !needsCode()) {
    const label = flow.claimed ? flow.claimed.label : flow.linkedLabel;
    $('#linked-title').textContent = flow.claimed ? 'تم ربط الجهاز' : 'هذا الجهاز مربوط برابط جاهز';
    $('#linked-label').textContent = label || 'رابط جهاز العرض من الخادم ' + hostOf(server.origin);
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
  return { url: `${flow.server.origin}/app/`, label: flow.server.name || '' };
}

function tableLabel(number) {
  return [`طاولة ${number}`, flow.server.name].filter(Boolean).join(' · ');
}

// The player link: already known, or traded for the pairing code now.
async function playerTarget() {
  if (flow.claimed) return flow.claimed;
  if (flow.playerUrl) return { url: flow.playerUrl, label: flow.linkedLabel || flow.server.name || '' };
  const status = $('#pair-status');
  if (flow.code.length !== CODE_LENGTH) {
    setStatus(status, 'error', 'أدخل رمز الربط المكوّن من 6 أرقام');
    shakeCode();
    focusForRemote($('#keypad [data-key="1"]'));
    return null;
  }
  setStatus(status, 'busy', 'جارٍ الربط بالخادم…');
  try {
    const result = await claim(flow.server.origin, flow.code);
    flow.claimed = { url: new URL(result.playerUrl, `${flow.server.origin}/`).href, label: tableLabel(result.table.number) };
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
