// Start-up of the cloud pages (cloud/app.html, cloud/player.html): find the
// device's Firebase project, start the cloud backend (backend/index.js,
// createCloudHost) and keep trying until it runs, with an Arabic screen for
// each way that can fail. The pages then hand the host to the real staff app
// or player through the same seams as the offline demo (window.__PM_DEMO__).

import { bridge } from '/app/bridge.js';
import builtIn from './firebase-config.js';
import { chooseConfig, emulatorHost, emulatorOptions } from './config.js';

const RETRY_S = [5, 10, 20, 30, 60];

/**
 * The project and options of this page: {config, source, error?, emulators}
 * (emulators: the backend's option, from "?emulators=<host>").
 * Setup saved the project with the device's settings (native ConfigStore);
 * without one, the project built into the APK is used.
 */
export async function deviceProject() {
  let saved = null;
  try {
    const state = await bridge.getState();
    saved = (state.config && state.config.firebase) || null;
  } catch (err) {
    console.warn('bridge unavailable', err);
  }
  return { ...chooseConfig(saved, builtIn), emulators: emulatorOptions(emulatorHost(location.search)) };
}

// ── Status screen ──────────────────────────────────────────────────

const ICONS = {
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.6 9.06 4.75 4.75 0 0 0 7 18.5z"/>',
  offline: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.6 9.06 4.75 4.75 0 0 0 7 18.5z"/><path d="M4 4l16 16"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z"/>',
  retry: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>',
};

function svg(name, cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('class', cls);
  el.innerHTML = ICONS[name];
  return el;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * A full-screen layer over the page while the backend starts. `surface` is
 * 'app' (the staff app's dark canvas) or 'player' (black: the projector casts
 * no light, the text stays dim). Built in script so the page body stays the
 * same markup as public/app/index.html and public/player/index.html.
 */
export function statusScreen(surface) {
  const root = el('div', 'cloud-boot');
  root.dataset.surface = surface;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.hidden = true;
  const card = el('div', 'cloud-boot-card');
  root.append(card);
  document.body.append(root);

  // D-pad / arrow keys move between the buttons (a TV box has no pointer).
  root.addEventListener('keydown', (e) => {
    const dir = { ArrowLeft: 1, ArrowUp: -1, ArrowRight: -1, ArrowDown: 1 }[e.key];
    const buttons = [...root.querySelectorAll('button')];
    if (!dir || buttons.length < 2) return;
    e.preventDefault();
    const at = buttons.indexOf(document.activeElement);
    buttons[(at + dir + buttons.length) % buttons.length].focus();
  });

  let showTimer = null;
  const render = ({ icon, title, text, busy = false, actions = [], countdown = null }) => {
    card.textContent = '';
    card.dataset.kind = busy ? 'busy' : icon === 'alert' ? 'error' : 'info';
    const badge = el('span', 'cloud-boot-badge');
    badge.append(busy ? el('span', 'cloud-boot-spinner') : svg(icon, 'cloud-boot-icon'));
    card.append(badge, el('h1', 'cloud-boot-title', title));
    if (text) card.append(el('p', 'cloud-boot-text', text));
    if (countdown) card.append(countdown);
    if (actions.length) {
      const row = el('div', 'cloud-boot-actions');
      actions.forEach((action, i) => {
        const button = el('button', `cloud-boot-btn${i === 0 ? ' primary' : ''}`);
        button.type = 'button';
        button.append(svg(action.icon, 'cloud-boot-icon'), el('span', null, action.label));
        button.addEventListener('click', action.run);
        row.append(button);
      });
      card.append(row);
    }
  };

  return {
    /** A short start shows nothing: the busy state appears after `delayMs`. */
    busy(title, text, delayMs = 700) {
      clearTimeout(showTimer);
      render({ icon: 'cloud', title, text, busy: true });
      showTimer = setTimeout(() => {
        root.hidden = false;
      }, delayMs);
    },
    show(content) {
      clearTimeout(showTimer);
      render(content);
      root.hidden = false;
      const first = root.querySelector('button');
      // Focus for remotes and keyboards; the page has nothing else to focus.
      if (first) first.focus({ preventScroll: true });
    },
    hide() {
      clearTimeout(showTimer);
      root.hidden = true;
      card.textContent = '';
    },
  };
}

// "خلال 5 ثوانٍ" with Arabic number agreement (as app/offline.js).
function secondsText(n) {
  if (n <= 1) return 'ثانية واحدة';
  if (n === 2) return 'ثانيتين';
  return `${n} ${n <= 10 ? 'ثوانٍ' : 'ثانية'}`;
}

const openSettings = (reason) => bridge.openSettings(reason).catch(() => {});

/** The screen for a page without a usable project: back to setup. */
export function showMissingProject(screen, project) {
  const settings = { icon: 'settings', label: 'فتح الإعدادات', run: () => openSettings() };
  if (project.error) {
    screen.show({
      icon: 'alert',
      title: 'إعدادات مشروع Firebase غير صالحة',
      text: `${project.error}. افتح الإعدادات وأدخل إعدادات المشروع من جديد.`,
      actions: [settings],
    });
    return;
  }
  screen.show({
    icon: 'cloud',
    title: 'لم يُضبط الاتصال السحابي بعد',
    text: 'لا توجد إعدادات مشروع Firebase على هذا الجهاز. اختر المشروع من شاشة الإعداد.',
    actions: [settings],
  });
  // Nothing to wait for here: go to setup (native asks for the PIN if one is set).
  setTimeout(() => openSettings(), 1500);
}

/**
 * Starts the backend, retrying until it runs: offline (a first start needs
 * the internet to sign in and load the restaurant), or a project that
 * refuses us. `quiet` (the player) keeps its own screen while offline —
 * it shows the cached menu or "connecting" — and only covers it for errors.
 */
export function startHost(createHost, screen, { quiet = false } = {}) {
  return new Promise((resolve) => {
    let attempt = 0;
    let timer = null;
    let ticker = null;
    let running = false;

    let started = false; // once the host runs, nothing here starts another one
    const retryNow = () => {
      clearTimeout(timer);
      clearInterval(ticker);
      if (!started && !running) run();
    };
    // Back online while waiting to retry: try at once.
    const onOnline = () => {
      if (!started && !running && attempt > 0) setTimeout(retryNow, 1000);
    };
    addEventListener('online', onOnline);

    const scheduleRetry = (content) => {
      const seconds = RETRY_S[Math.min(attempt - 1, RETRY_S.length - 1)];
      const endAt = Date.now() + seconds * 1000;
      const line = el('p', 'cloud-boot-countdown');
      const tick = () => {
        const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        line.textContent = `إعادة المحاولة تلقائياً خلال ${secondsText(left)}`;
      };
      tick();
      clearInterval(ticker);
      ticker = setInterval(tick, 500);
      timer = setTimeout(retryNow, seconds * 1000);
      if (content) {
        screen.show({
          ...content,
          countdown: line,
          actions: [
            { icon: 'retry', label: 'إعادة المحاولة الآن', run: retryNow },
            { icon: 'settings', label: 'الإعدادات', run: () => openSettings() },
          ],
        });
      }
    };

    async function run() {
      running = true;
      attempt += 1;
      if (!quiet) screen.busy('جارٍ الاتصال بالسحابة…', 'نحمّل بيانات المطعم من مشروع Firebase.', attempt === 1 ? 700 : 0);
      try {
        const host = await createHost();
        running = false;
        started = true;
        removeEventListener('online', onOnline);
        resolve(host);
      } catch (err) {
        running = false;
        console.error('cloud start failed', err);
        const offline = navigator.onLine === false;
        if (offline && quiet) return scheduleRetry(null);
        scheduleRetry(
          offline
            ? {
                icon: 'offline',
                title: 'لا يوجد اتصال بالإنترنت',
                text: 'يحتاج الجهاز إلى الإنترنت عند تشغيله أول مرة لتحميل بيانات المطعم. بعدها يعمل حتى لو انقطع الاتصال.',
              }
            : {
                icon: 'alert',
                title: 'تعذّر الاتصال بمشروع Firebase',
                text: `${(err && err.message) || 'خطأ غير معروف'} — تأكد من اتصال الإنترنت ومن إعدادات المشروع.`,
              },
        );
      }
    }

    run();
  });
}

/** An unexpected failure of the page itself: reload or go to setup. */
export function showCrash(screen, err, title = 'حدث خطأ غير متوقع') {
  console.error(err);
  screen.show({
    icon: 'alert',
    title,
    text: String((err && err.message) || err),
    actions: [
      { icon: 'retry', label: 'إعادة التحميل', run: () => location.reload() },
      { icon: 'settings', label: 'الإعدادات', run: () => openSettings() },
    ],
  });
}

/** Loads the backend module (a missing or broken APK file is a setup problem, not a network one). */
export async function loadBackend() {
  return import('./backend/index.js');
}

export { openSettings };
