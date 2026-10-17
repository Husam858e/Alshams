// Offline demo page (opened by the Android app's "عرض تجريبي بدون خادم").
// It hosts the in-memory backend (backend/) and shows two real UIs side by
// side: the staff app (demo/app.html = public/app on that backend) and the
// projector player (/player/?device=demo) on a table seen from above. The
// frames reach the backend through window.__PM_DEMO__ (same origin).

import { bridge } from '/app/bridge.js';
import { DEMO_DEVICE_KEY, createBackend } from './backend/index.js';
import { MEDIA, SAMPLE, TABLE_TEXTURE } from './data.js';

const HOME = { waiter: '/floor', designer: '/menu', owner: '/floor' };
const ROLE_NAMES = { waiter: 'ويتر', designer: 'مصمم', owner: 'مالك' };
const TIPS = {
  waiter: [
    'من «الطاولات» افتح طاولة برقمها — تظهر هنا على اليسار.',
    'اعرض «المنيو كامل» أو تصنيفاً على سطح الطاولة.',
    'اضغط على طبق ليظهر وحده بصورته الكبيرة.',
    'أضف أصنافاً وأرسل الطلب، ثم اختر «عرض الطلب».',
  ],
  designer: [
    'ارفع صورة أو فيديو من «المكتبة».',
    'في «المنيو» افتح طبقاً واختر له الصورة الجديدة.',
    'غيّر النمط أو اللون في «تصميم العرض» واحفظ — تتغير الطاولة فوراً.',
    'اسحب زوايا الصورة في «أجهزة العرض» لمعايرة الإسقاط.',
  ],
  owner: [
    'راجع «التقارير»: الإيرادات والأطباق الأكثر طلباً.',
    'أضف موظفاً من «المستخدمون».',
    'عدّل سعراً من «المنيو» ← «الأسعار».',
    'اربط جهاز عرض برمز من «الأقسام والطاولات».',
  ],
};

const $ = (sel) => document.querySelector(sel);
const appFrame = $('#app-frame');
const playerFrame = $('#player-frame');

// ── Backend ────────────────────────────────────────────────────────

// Size / duration of an uploaded file, like the server's ffprobe.
async function probe(blob, kind) {
  if (kind === 'image') {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = (info) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(info);
    };
    video.muted = true;
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      finish({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration_ms: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
      });
    video.onerror = () => finish({});
    setTimeout(() => finish({}), 4000);
    video.src = url;
  });
}

const backend = createBackend({ sample: SAMPLE, media: MEDIA, probe });

window.__PM_DEMO__ = {
  backend,
  request: (req) => backend.request(req),
  subscribeLive: (fn) => backend.subscribeLive(fn),
  currentUser: () => backend.currentUser(),
  openDevice: (key, on) => backend.openDevice(key, on),
  openPreview: (tableId, on) => backend.openPreview(tableId, on),
  focusDevice(key) {
    const found = backend.focusDevice(key);
    if (found) showTable();
    return found;
  },
};

// ── Roles ──────────────────────────────────────────────────────────

let role = null;
let appLoads = 0;

function start(nextRole) {
  role = nextRole;
  backend.signInAs(role);
  document.body.classList.remove('is-picking');
  document.body.dataset.role = role;
  for (const btn of document.querySelectorAll('.role-switch [data-role]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.role === role));
  }
  renderTips();
  // A fresh app page: the old one forgets its cached data and live link.
  // replace(): switching roles must not add steps to the BACK history.
  // (The query changes every time, so it is a real page load, not a hash jump.)
  const url = `/demo/app.html?as=${role}&n=${++appLoads}#${HOME[role]}`;
  if (appFrame.getAttribute('src')) appFrame.contentWindow.location.replace(url);
  else appFrame.src = url;
  if (!playerFrame.src) playerFrame.src = `/player/?device=${DEMO_DEVICE_KEY}`;
}

for (const btn of document.querySelectorAll('[data-role]')) {
  btn.addEventListener('click', () => {
    if (btn.dataset.role !== role || document.body.classList.contains('is-picking')) start(btn.dataset.role);
  });
}

for (const btn of document.querySelectorAll('[data-exit]')) {
  btn.addEventListener('click', () => bridge.openSettings().catch(() => {}));
}

function renderTips() {
  const list = $('#tips');
  list.replaceChildren(...(TIPS[role] ?? []).map((text) => Object.assign(document.createElement('li'), { textContent: text })));
}

// ── The table pane follows the table being worked on ───────────────

// '#/table/7' in the staff app -> the projector pane looks at table 7.
function followAppRoute() {
  let hash = '';
  try {
    hash = appFrame.contentWindow.location.hash;
  } catch {
    return;
  }
  const m = /^#\/table\/(\d+)/.exec(decodeURIComponent(hash));
  if (m) backend.focus(Number(m[1]));
}
appFrame.addEventListener('load', () => {
  try {
    appFrame.contentWindow.addEventListener('hashchange', followAppRoute);
  } catch {
    // not reachable: nothing to follow
  }
  followAppRoute();
});

// On a phone the table sits above the app: bring it into view when it changes.
function showTable() {
  if (matchMedia('(max-aspect-ratio: 1/1)').matches) $('.table-pane').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const STATUS_AR = { free: 'متاحة', occupied: 'مشغولة', reserved: 'محجوزة' };
let lastSeats = null;
let lastTableId = null;

// "قبل 3 دقائق" for the last scene change.
function ago(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'الآن';
  if (minutes < 60) return minutes === 1 ? 'قبل دقيقة' : minutes === 2 ? 'قبل دقيقتين' : `قبل ${minutes} ${minutes <= 10 ? 'دقائق' : 'دقيقة'}`;
  return `قبل ${Math.round(minutes / 60)} ساعة`;
}

function renderChairs(seats, dual) {
  const key = `${seats}:${dual}`;
  if (key === lastSeats) return;
  lastSeats = key;
  const far = Math.ceil(seats / 2);
  const near = seats - far;
  const chairs = (n) =>
    Array.from({ length: n }, () => {
      const chair = document.createElement('span');
      chair.className = 'chair';
      return chair;
    });
  $('#chairs-far').replaceChildren(...chairs(far));
  $('#chairs-near').replaceChildren(...chairs(near));
  $('#table-scene').dataset.seats = String(seats);
}

backend.onView((view) => {
  const { table, projector, scene, label } = view;
  const user = backend.currentUser();
  $('#who').textContent = user ? `${user.name} · ${ROLE_NAMES[user.role]}` : 'لم يُسجَّل الدخول';
  $('#accounts').hidden = Boolean(user);
  document.body.classList.toggle('is-signed-out', !user);
  if (user && user.role !== role && !document.body.classList.contains('is-picking')) {
    // Signed in again from the login screen with another account.
    role = user.role;
    document.body.dataset.role = role;
    for (const btn of document.querySelectorAll('.role-switch [data-role]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.role === role));
    }
    renderTips();
  }
  if (!table) {
    $('#table-title').textContent = 'لا توجد طاولات';
    $('#scene-label').textContent = '';
    return;
  }
  $('#table-title').textContent = `طاولة ${table.number}${table.area_name ? ` · ${table.area_name}` : ''}`;
  $('#scene-label').textContent = projector ? label : 'بدون عرض';
  $('#scene-label').dataset.scene = projector ? (scene?.type ?? '') : 'off';
  $('#table-scene').dataset.status = table.status;
  $('#table-scene').title = `طاولة ${table.number} — ${STATUS_AR[table.status] ?? ''} — ${table.seats} مقاعد`;
  renderChairs(table.seats, projector?.layout === 'dual');
  // A short fade when the pane moves to another table.
  if (lastTableId !== null && lastTableId !== table.id) {
    const sceneEl = $('#table-scene');
    sceneEl.classList.remove('is-switching');
    void sceneEl.offsetWidth;
    sceneEl.classList.add('is-switching');
  }
  lastTableId = table.id;
  const caption = $('#room-caption');
  caption.dataset.on = String(Boolean(projector));
  caption.replaceChildren(
    Object.assign(document.createElement('span'), { className: 'dot' }),
    document.createTextNode(projector ? `${projector.name} · يعمل` : 'لا يوجد عرض على هذه الطاولة'),
    ...(projector && scene?.by ? [Object.assign(document.createElement('span'), { className: 'by', textContent: `آخر تغيير: ${scene.by} · ${ago(scene.at)}` })] : []),
  );
  const note = $('#dark-note');
  note.hidden = Boolean(projector);
  note.textContent = view.hasProjectors ? 'جهاز العرض على هذه الطاولة غير متصل أو مطفأ' : 'لا يوجد جهاز عرض مربوط بهذه الطاولة';
});

// ── Layout ─────────────────────────────────────────────────────────

document.documentElement.style.setProperty('--table-texture', `url('${TABLE_TEXTURE}')`);

// The table keeps the projector's 16:9 and fits the room around it
// (chairs stick out at the long sides).
const room = $('#room');
const scene = $('#table-scene');
new ResizeObserver(() => {
  const style = getComputedStyle(room);
  const width = room.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = room.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const chairs = 0.42; // both rows of chairs (with some air), as a share of the table height
  const w = Math.max(0, Math.min(width * 0.94, (height * 0.96) / (9 / 16) / (1 + chairs)));
  scene.style.setProperty('--table-w', `${Math.round(w)}px`);
}).observe(room);

$('#zoom').addEventListener('click', () => {
  const zoomed = document.body.classList.toggle('is-zoomed');
  const btn = $('#zoom');
  btn.setAttribute('aria-pressed', String(zoomed));
  btn.title = zoomed ? 'عودة إلى التطبيق' : 'تكبير الطاولة';
  btn.querySelector('use').setAttribute('href', zoomed ? '#i-shrink' : '#i-expand');
  btn.querySelector('.sr-only').textContent = btn.title;
});

// The first role card gets the focus (TV remotes, keyboards).
document.querySelector('.role-card')?.focus();
