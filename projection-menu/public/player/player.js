// Projector player — runs fullscreen (Chromium kiosk) on the small PC that
// feeds the projector over HDMI. Open it as:
//   /player/?projector=<id>&key=<access key>
// It receives cues over Socket.IO and renders them on a warped "stage".

import { io } from '/socket.io/socket.io.esm.min.js';
import { stageTransform } from '/shared/homography.js';

const STAGE_W = 1920;
const STAGE_H = 1080;
const DEFAULT_CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const FULL_ZONE = { x: 0, y: 0, w: 1, h: 1, rotate: 0 };
const noop = () => {};

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');
const idleEl = $('#idle');
const layersEl = $('#layers');
const testCanvas = $('#test-pattern');
const statusEl = $('#status');

let config = { projectorName: '', calibration: { corners: DEFAULT_CORNERS }, zones: [], idle: null };
let idleUrl = null;
let disposeIdle = noop;
// Active content per layer: 'seat-1', 'seat-2', ..., or 'full' (whole table).
const layers = new Map();

// ── Connection ─────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const socket = io('/player', {
  auth: { projectorId: params.get('projector'), key: params.get('key') },
  reconnectionDelayMax: 5000,
});

// Content keeps playing while disconnected; we only show a small notice.
socket.on('connect', () => showStatus(null));
socket.on('disconnect', () => showStatus('انقطع الاتصال بالخادم — إعادة المحاولة...'));
socket.on('connect_error', (err) =>
  showStatus(
    err.message === 'unauthorized'
      ? 'رابط غير صالح: تحقق من رقم جهاز العرض والمفتاح في لوحة التحكم'
      : 'تعذر الاتصال بالخادم — إعادة المحاولة...',
  ),
);

const handlers = {
  config: applyConfig,
  play,
  stop: (cue) => (cue.layer ? stopLayer(cue.layer) : stopAll()),
  test_pattern: (cue) => toggleTestPattern(cue.on !== false),
};

// The server waits for this ack (with a timeout) to know the cue arrived.
// Actual playback progress is reported separately via 'cue:status'.
socket.on('cue', (cue, ack) => {
  try {
    const handler = handlers[cue?.action];
    if (!handler) throw new Error(`Unknown action: ${cue?.action}`);
    handler(cue);
    ack?.({ ok: true });
  } catch (err) {
    console.error(err);
    ack?.({ ok: false, error: err.message });
  }
});

// ── Config: calibration, zones, idle loop ──────────────────────────
function applyConfig(cue) {
  config = {
    projectorName: cue.projectorName ?? '',
    calibration: cue.calibration ?? { corners: DEFAULT_CORNERS },
    zones: cue.zones ?? [],
    idle: cue.idle ?? null,
  };
  applyCalibration();
  setIdle(config.idle);
  if (!testCanvas.hidden) drawTestPattern();
}

function applyCalibration() {
  try {
    stage.style.transform = stageTransform(config.calibration.corners, STAGE_W, STAGE_H, innerWidth, innerHeight);
  } catch (err) {
    console.warn('Calibration ignored:', err.message); // keep the previous warp
  }
}
addEventListener('resize', applyCalibration);

function setIdle(media) {
  const url = media?.url ?? null;
  if (url === idleUrl) return;
  disposeIdle();
  disposeIdle = noop;
  idleUrl = url;
  if (media) disposeIdle = mount(idleEl, media, { loop: true });
}

// ── Playback ───────────────────────────────────────────────────────
function play(cue) {
  const zone = cue.zone ?? FULL_ZONE;
  const fadeMs = cue.fadeMs ?? 500;
  stopLayer(cue.layer);

  const el = document.createElement('div');
  el.className = 'zone';
  el.style.cssText = `left:${zone.x * 100}%;top:${zone.y * 100}%;width:${zone.w * 100}%;height:${zone.h * 100}%;--fade:${fadeMs}ms`;
  const inner = document.createElement('div');
  inner.className = 'zone-inner';
  orient(inner, zone, cue.scale ?? 1);
  el.append(inner);

  const layer = { cueId: cue.cueId, el, timer: null, fadeMs, dispose: noop };
  const report = (state, error) => socket.emit('cue:status', { cueId: cue.cueId, state, error });
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    report('ended');
    stopLayer(cue.layer, layer);
  };

  layer.dispose = mount(inner, cue.media, {
    loop: cue.loop,
    onPlaying: () => report('playing'),
    onEnded: () => !cue.loop && finish(),
    onError: (message) => {
      report('error', message);
      stopLayer(cue.layer, layer);
    },
  });
  layersEl.append(el);
  layers.set(cue.layer, layer);
  if (cue.durationMs) layer.timer = setTimeout(finish, cue.durationMs);
  // Two frames so the opacity transition (fade-in) actually runs.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
  updateIdleDim();
}

// Seats on the far side of the table get content rotated 180° so it reads
// the right way up for that diner. 90°/270° (table ends) swap width/height.
function orient(inner, zone, scale) {
  const w = zone.w * STAGE_W;
  const h = zone.h * STAGE_H;
  const sideways = Math.abs((zone.rotate ?? 0) % 180) === 90;
  const iw = sideways ? h : w;
  const ih = sideways ? w : h;
  Object.assign(inner.style, {
    width: `${iw}px`,
    height: `${ih}px`,
    left: `${(w - iw) / 2}px`,
    top: `${(h - ih) / 2}px`,
    transform: `rotate(${zone.rotate ?? 0}deg) scale(${scale})`,
  });
}

function stopLayer(id, expected) {
  const layer = layers.get(id);
  if (!layer || (expected && layer !== expected)) return;
  layers.delete(id);
  clearTimeout(layer.timer);
  layer.el.classList.remove('visible');
  setTimeout(() => {
    layer.dispose();
    layer.el.remove();
  }, layer.fadeMs);
  updateIdleDim();
}

function stopAll() {
  for (const id of [...layers.keys()]) stopLayer(id);
}

function updateIdleDim() {
  idleEl.classList.toggle('dim', layers.size > 0);
}

// Renders one media item into `container`; returns a dispose function.
function mount(container, media, { loop = false, onPlaying = noop, onEnded = noop, onError = noop }) {
  if (typeof media?.url !== 'string' || !media.url.startsWith('/media/')) throw new Error('Invalid media URL');

  if (media.kind === 'video') {
    const video = document.createElement('video');
    // Muted + playsInline = allowed to autoplay without a user gesture.
    video.muted = true;
    video.playsInline = true;
    video.loop = Boolean(loop);
    video.preload = 'auto';
    video.src = media.url;
    video.addEventListener('playing', () => onPlaying(), { once: true });
    video.addEventListener('ended', () => onEnded());
    video.addEventListener('error', () => onError(video.error?.message || 'تعذر تشغيل الفيديو'));
    container.append(video);
    video.play().catch((err) => err.name !== 'AbortError' && onError(err.message));
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load(); // releases the hardware decoder
      video.remove();
    };
  }

  if (media.kind === 'image') {
    const img = new Image();
    img.onload = () => onPlaying();
    img.onerror = () => onError('تعذر تحميل الصورة');
    img.src = media.url;
    container.append(img);
    return () => img.remove();
  }

  if (media.kind === 'model3d') {
    // three.js is loaded only when a 3D model is actually shown.
    let dispose = null;
    let disposed = false;
    import('./model-renderer.js')
      .then(({ renderModel }) => {
        if (!disposed) dispose = renderModel(container, media.url, { loop, onPlaying, onEnded, onError });
      })
      .catch((err) => onError(err.message));
    return () => {
      disposed = true;
      dispose?.();
    };
  }

  throw new Error(`Unsupported media kind: ${media.kind}`);
}

// ── Test pattern (for calibration from the dashboard) ──────────────
function toggleTestPattern(on) {
  testCanvas.hidden = !on;
  if (on) drawTestPattern();
}

function drawTestPattern() {
  const ctx = testCanvas.getContext('2d');
  const W = STAGE_W;
  const H = STAGE_H;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 120) ctx.moveTo(x, 0), ctx.lineTo(x, H);
  for (let y = 0; y <= H; y += 120) ctx.moveTo(0, y), ctx.lineTo(W, y);
  ctx.moveTo(0, 0), ctx.lineTo(W, H), ctx.moveTo(W, 0), ctx.lineTo(0, H);
  ctx.stroke();

  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4'];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  config.zones.forEach((z, i) => {
    const [x, y, w, h] = [z.x * W, z.y * H, z.w * W, z.h * H];
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = 6;
    ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(((z.rotate ?? 0) * Math.PI) / 180);
    ctx.fillStyle = colors[i % colors.length];
    ctx.font = '700 72px system-ui, sans-serif';
    ctx.fillText(`مقعد ${z.seat}`, 0, 0);
    ctx.restore();
  });

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);

  // Numbered corners match the draggable handles in the dashboard.
  [[0, 0], [W, 0], [W, H], [0, H]].forEach(([cx, cy], i) => {
    const px = cx === 0 ? 70 : W - 70;
    const py = cy === 0 ? 70 : H - 70;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText(String(i + 1), px, py + 3);
  });

  ctx.fillStyle = '#fff';
  ctx.font = '600 40px system-ui, sans-serif';
  ctx.fillText(config.projectorName || 'Projection Player', W / 2, H / 2);
}

// ── Misc ───────────────────────────────────────────────────────────
function showStatus(message) {
  statusEl.hidden = !message;
  statusEl.textContent = message ?? '';
}

// Keep the screen (and HDMI signal) from going to sleep.
async function keepAwake() {
  try {
    await navigator.wakeLock?.request('screen');
  } catch {
    // Not supported or not allowed — kiosk flags / OS settings cover it.
  }
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && keepAwake());

if (!params.get('projector') || !params.get('key')) {
  showStatus('أضف ?projector=…&key=… إلى الرابط (انسخه من لوحة التحكم)');
}
applyCalibration();
keepAwake();
