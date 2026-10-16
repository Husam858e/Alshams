// First-run and settings screen of the Android app: pick what this device
// is (table tablet, projector player, dashboard, offline demo), pair it with
// the server by QR code or pasted link, and save. Native validates links and
// stores the config (see bridge.js for the message contract).
//
// Chrome 80 syntax and APIs only (see bridge.js).

import { BridgeError, bridge, isNative } from './bridge.js';
import { enableArrowNavigation } from './spatial-nav.js';

const $ = (sel) => document.querySelector(sel);

const MODES = {
  TABLET: {
    label: 'تابلت طاولة',
    title: 'اربط التابلت بطاولته',
    field: 'رابط التابلت',
    placeholder: 'http://192.168.1.10:3000/tablet/?table=T01&key=…',
    hint: 'لوحة التحكم ← الطاولات والأجهزة ← «رابط التابلت» في سطر الطاولة المطلوبة.',
  },
  PLAYER: {
    label: 'جهاز عرض',
    title: 'اربط جهاز العرض',
    field: 'رابط جهاز العرض',
    placeholder: 'http://192.168.1.10:3000/player/?projector=1&key=…',
    hint: 'لوحة التحكم ← الطاولات والأجهزة ← بطاقة جهاز العرض (النوع «متصفح»).',
  },
  ADMIN: {
    label: 'لوحة التحكم',
    title: 'عنوان الخادم',
    field: 'عنوان الخادم (IP:المنفذ)',
    placeholder: '192.168.1.10:3000',
    hint: 'نفس العنوان الذي تفتح به لوحة التحكم على كمبيوتر المطعم. رمز الدخول يُطلب داخل اللوحة.',
  },
};

let state = null; // last getState reply
const form = { mode: null, link: null }; // link = last successful validateLink reply

// ── Small DOM helpers ──────────────────────────────────────────────
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children.filter((c) => c != null && c !== false));
  return el;
}

const ltr = (text) => h('bdi', { dir: 'ltr' }, text);

// Element.replaceChildren needs Chrome 86.
function setChildren(el, ...children) {
  el.textContent = '';
  el.append(...children);
}

function setStatus(el, kind, ...content) {
  el.dataset.kind = kind;
  setChildren(el, ...content);
}

const errorText = (err) => (err instanceof BridgeError ? err.message : 'حدث خطأ غير متوقع');

// What a pairing link points at, for humans (never shows the access key).
function describeLink(mode, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { detail: '', host: rawUrl, origin: rawUrl };
  }
  const detail =
    mode === 'TABLET'
      ? `الطاولة ${url.searchParams.get('table')}`
      : mode === 'PLAYER'
        ? `جهاز العرض رقم ${url.searchParams.get('projector')}`
        : '';
  return { detail, host: url.host, origin: url.origin };
}

// ── Startup ────────────────────────────────────────────────────────
async function init() {
  enableArrowNavigation();
  try {
    state = await bridge.getState();
  } catch (err) {
    setStatus($('#demo-status'), 'error', errorText(err));
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

  if (state.config) showCurrent();
  else showWizard();
}

// Focus is moved for remote-control users only; on touch screens it would
// just paint focus rings (and may pop up the keyboard).
function focusForRemote(el) {
  if (state?.isTv && el) el.focus();
}

// ── Saved configuration ────────────────────────────────────────────
function showCurrent() {
  const { config } = state;
  const { detail, host } = describeLink(config.mode, config.url);
  $('#current').hidden = false;
  $('#wizard').hidden = true;
  $('#current-mode').textContent = MODES[config.mode]?.label ?? config.mode;
  $('#current-detail').textContent = detail;
  $('#current-host').textContent = host;
  setChildren(
    $('#current-tags'),
    ...[
      config.kiosk && '🔒 قفل الشاشة',
      config.hasPin && '🔑 محمي برمز PIN',
      config.launcher && '🏠 شاشة رئيسية',
    ]
      .filter(Boolean)
      .map((text) => h('span', { className: 'tag' }, text)),
  );
  setStatus($('#current-status'), '', '');
  focusForRemote($('#resume'));
}

function showWizard({ prefill = null } = {}) {
  $('#wizard').hidden = false;
  if (prefill) {
    selectMode(prefill.mode);
    // The origin keeps https and the port; it normalizes back to <origin>/admin/.
    $('#link').value = prefill.mode === 'ADMIN' ? describeLink('ADMIN', prefill.url).origin : prefill.url;
    $('#kiosk').checked = prefill.kiosk;
    $('#launcher').checked = prefill.launcher;
    validateNow();
    $('#wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    focusForRemote($(`.mode[data-mode="${prefill.mode}"]`));
  } else {
    // A TV box is almost always the projector's player.
    focusForRemote($(`.mode[data-mode="${state.isTv ? 'PLAYER' : 'TABLET'}"]`));
  }
}

$('#resume').addEventListener('click', async () => {
  setStatus($('#current-status'), 'busy', 'جارٍ الفتح...');
  try {
    await bridge.resume();
  } catch (err) {
    setStatus($('#current-status'), 'error', errorText(err));
  }
});

$('#change').addEventListener('click', () => showWizard({ prefill: state.config }));

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
    $('#current').hidden = true;
    resetForm();
    showWizard();
  } catch (err) {
    setStatus($('#current-status'), 'error', errorText(err));
  }
});

// ── Step 1: mode ───────────────────────────────────────────────────
for (const card of document.querySelectorAll('.mode[data-mode]')) {
  card.addEventListener('click', () => {
    if (form.mode === card.dataset.mode) return;
    selectMode(card.dataset.mode);
    clearLink();
    // Next logical control, so a remote only needs "OK" then "down".
    const scan = $('#scan');
    if (!scan.hidden) scan.focus();
    else if (state?.isTv) $('#link').focus();
  });
}

function selectMode(mode) {
  const copy = MODES[mode];
  const pairing = mode !== 'ADMIN';
  form.mode = mode;
  for (const card of document.querySelectorAll('.mode[data-mode]')) {
    card.setAttribute('aria-checked', String(card.dataset.mode === mode));
  }
  $('#link-step').hidden = false;
  $('#options-step').hidden = false;
  $('#save-bar').hidden = false;
  $('#link-title').textContent = copy.title;
  $('#link-label').textContent = copy.field;
  $('#link').placeholder = copy.placeholder;
  $('#link-hint').textContent = copy.hint;
  $('#scan').hidden = !pairing || !state?.hasCamera;
  $('#or').hidden = $('#scan').hidden;
  // PIN and screen lock only apply to the customer-facing kiosk modes.
  $('#pin-block').hidden = !pairing;
  $('#pin-clear-row').hidden = !pairing || !state?.config?.hasPin;
  $('#kiosk-row').hidden = !pairing;
  updatePinStatus();
}

function resetForm() {
  form.mode = null;
  for (const card of document.querySelectorAll('.mode[data-mode]')) card.setAttribute('aria-checked', 'false');
  for (const id of ['#link-step', '#options-step', '#save-bar']) $(id).hidden = true;
  clearLink();
  $('#pin').value = '';
  $('#pin2').value = '';
  $('#pin-clear').checked = false;
  $('#kiosk').checked = true;
  $('#launcher').checked = false;
  setStatus($('#save-status'), '', '');
}

$('#demo').addEventListener('click', async () => {
  setStatus($('#demo-status'), 'busy', 'جارٍ فتح العرض التجريبي...');
  try {
    await bridge.startDemo();
  } catch (err) {
    setStatus($('#demo-status'), 'error', errorText(err));
  }
});

// ── Step 2: link ───────────────────────────────────────────────────
let validateTimer = null;
let validateSeq = 0;

function clearLink() {
  clearTimeout(validateTimer);
  validateSeq++;
  form.link = null;
  $('#link').value = '';
  setStatus($('#link-status'), '', '');
}

$('#link').addEventListener('input', () => {
  form.link = null;
  validateSeq++; // an answer for the previous text is stale now
  setStatus($('#link-status'), '', '');
  clearTimeout(validateTimer);
  validateTimer = setTimeout(validateNow, 350);
});

$('#scan').addEventListener('click', async () => {
  let reply;
  try {
    reply = await bridge.scanQr();
  } catch (err) {
    return setStatus($('#link-status'), 'error', errorText(err));
  }
  if (reply.type !== 'scanResult') return;
  $('#link').value = reply.text;
  if (await validateNow()) $('#save').focus();
});

// Asks native to check the link; resolves true when it can be saved.
async function validateNow() {
  clearTimeout(validateTimer);
  const seq = ++validateSeq;
  const raw = $('#link').value.trim();
  const status = $('#link-status');
  form.link = null;
  if (!raw) {
    setStatus(status, '', '');
    return false;
  }
  setStatus(status, 'busy', 'جارٍ التحقق من الرابط...');
  let reply;
  try {
    reply = await bridge.validateLink(raw);
  } catch (err) {
    if (seq === validateSeq) setStatus(status, 'error', errorText(err));
    return false;
  }
  if (seq !== validateSeq) return false; // newer input superseded this check
  if (!reply.ok) {
    setStatus(status, 'error', reply.error || 'الرابط غير صالح');
    return false;
  }
  if (reply.mode === 'ADMIN' && form.mode !== 'ADMIN') {
    setStatus(
      status,
      'error',
      `هذا عنوان الخادم فقط. انسخ ${MODES[form.mode].field} الكامل من لوحة التحكم (الطاولات والأجهزة)، أو اختر «لوحة التحكم».`,
    );
    return false;
  }
  // A full tablet/player link decides the mode by itself.
  const switched = reply.mode !== form.mode;
  if (switched) selectMode(reply.mode);
  form.link = reply;
  const { detail, host } = describeLink(reply.mode, reply.normalizedUrl);
  setStatus(
    status,
    'ok',
    `✓ ${switched ? `تم التعرف على رابط ${MODES[reply.mode].label}: ` : ''}`,
    reply.mode === 'ADMIN' ? 'لوحة التحكم على ' : `${detail} — الخادم `,
    ltr(reply.mode === 'ADMIN' ? reply.normalizedUrl : host),
  );
  return true;
}

// ── Step 3: options ────────────────────────────────────────────────
const clearingPin = () => !$('#pin-clear-row').hidden && $('#pin-clear').checked;

function pinError() {
  if (form.mode === 'ADMIN' || clearingPin()) return null;
  const pin = $('#pin').value;
  const confirm = $('#pin2').value;
  if (!pin && !confirm) return null;
  if (!/^\d{4,8}$/.test(pin)) return 'الرمز من 4 إلى 8 أرقام فقط';
  if (pin !== confirm) return confirm ? 'الرمزان غير متطابقين' : 'أعد كتابة الرمز في خانة التأكيد';
  return null;
}

function updatePinStatus() {
  const status = $('#pin-status');
  const clearing = clearingPin();
  $('#pin').disabled = clearing;
  $('#pin2').disabled = clearing;
  if (clearing) return setStatus(status, '', 'سيُلغى الرمز الحالي عند الحفظ.');
  const error = pinError();
  if (error) return setStatus(status, 'error', error);
  const hasPin = state?.config?.hasPin;
  if ($('#pin').value) return setStatus(status, 'ok', hasPin ? '✓ سيحل هذا الرمز محل الرمز الحالي' : '✓ سيُطلب هذا الرمز لفتح الإعدادات');
  setStatus(
    status,
    '',
    hasPin ? 'يوجد رمز حالياً وسيبقى كما هو. اكتب رمزاً جديداً لتغييره.' : 'بدون رمز يستطيع أي شخص فتح الإعدادات.',
  );
}

for (const id of ['#pin', '#pin2']) {
  $(id).addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
    updatePinStatus();
  });
}
$('#pin-clear').addEventListener('change', updatePinStatus);

// ── Save ───────────────────────────────────────────────────────────
$('#wizard').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('#save-status');
  const button = $('#save');
  if (!form.mode) return;

  if (!form.link && !(await validateNow())) {
    setStatus(status, 'error', $('#link').value.trim() ? 'صحّح الرابط أولاً' : `أدخل ${MODES[form.mode].field} أولاً`);
    $('#link').focus();
    return;
  }
  const pinProblem = pinError();
  if (pinProblem) {
    setStatus(status, 'error', pinProblem);
    $('#pin').focus();
    return;
  }

  const pairing = form.mode !== 'ADMIN';
  button.disabled = true;
  setStatus(status, 'busy', 'جارٍ الحفظ...');
  try {
    await bridge.saveConfig({
      url: form.link.normalizedUrl,
      // null keeps the saved PIN (e.g. re-pairing after a key change); '' removes it.
      pin: !pairing || clearingPin() ? '' : $('#pin').value || null,
      kiosk: pairing && $('#kiosk').checked,
      launcher: $('#launcher').checked,
    });
    setStatus(status, 'ok', `✓ تم الحفظ — جارٍ فتح ${MODES[form.mode].label}...`);
  } catch (err) {
    setStatus(status, 'error', errorText(err));
    button.disabled = false;
  }
});

resetForm();
init();
// Last on purpose: if anything above throws on an outdated WebView, the inline
// fallback in setup.html shows the update warning instead of a dead page.
window.setupReady = true;
