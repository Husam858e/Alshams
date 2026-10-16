// Shown by native when the configured page can't load (network error or
// server 5xx): offline.html?url=<target>. Retries on its own with a visible
// countdown — 5 s, backing off to 30 s while failures keep coming — because
// a kiosk device must come back by itself once the server is up again.
//
// Chrome 80 APIs only (see bridge.js): this page must work on any WebView.

import { bridge } from './bridge.js';
import { enableArrowNavigation } from './spatial-nav.js';

const BACKOFF_S = [5, 10, 20, 30];
const STORE_KEY = 'projection-menu:offline';
const RING = 2 * Math.PI * 34; // circumference of the SVG ring

const $ = (sel) => document.querySelector(sel);

// Remote-control users need a focused button; on a touch screen (the table
// tablet) focus would only paint a ring around it for the whole outage.
function focusForKeys(el) {
  if (!matchMedia('(any-pointer: coarse)').matches) el.focus();
}

// Only http(s) targets are followed (the parameter must never run script).
function parseTarget(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

// Each failed retry lands here again, so the attempt count lives in
// sessionStorage. A failure long after the previous one starts over at 5 s.
function nextDelay(target) {
  let prev = null;
  try {
    prev = JSON.parse(sessionStorage.getItem(STORE_KEY));
  } catch {
    // storage unavailable: always 5 s
  }
  const now = Date.now();
  const recent = prev && prev.url === target.href && now - prev.at < (prev.delay + 90) * 1000;
  const attempt = recent ? prev.attempt + 1 : 0;
  const delay = BACKOFF_S[Math.min(attempt, BACKOFF_S.length - 1)];
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ url: target.href, attempt, delay, at: now }));
  } catch {
    // ignore
  }
  return delay;
}

const target = parseTarget(new URLSearchParams(location.search).get('url'));
let timer = null;

function retry() {
  clearInterval(timer);
  $('#countdown-text').textContent = 'جارٍ الاتصال...';
  $('#retry').disabled = true;
  location.replace(target.href);
}

// Arabic number agreement: ثانية واحدة / ثانيتين / 3–10 ثوانٍ / 11+ ثانية.
function secondsText(n) {
  if (n <= 1) return 'ثانية واحدة';
  if (n === 2) return 'ثانيتين';
  return `${n} ${n <= 10 ? 'ثوانٍ' : 'ثانية'}`;
}

function startCountdown(seconds) {
  const endAt = Date.now() + seconds * 1000;
  const bar = $('#ring-bar');
  bar.style.strokeDasharray = String(RING);
  const tick = () => {
    const left = Math.max(0, endAt - Date.now());
    const whole = Math.ceil(left / 1000);
    $('#seconds').textContent = String(whole);
    $('#countdown-text').textContent = `إعادة المحاولة تلقائياً خلال ${secondsText(whole)}`;
    bar.style.strokeDashoffset = String(RING * (1 - left / (seconds * 1000)));
    if (left <= 0) retry();
  };
  tick();
  timer = setInterval(tick, 250);
}

function init() {
  enableArrowNavigation();
  $('#settings').addEventListener('click', () => {
    bridge.openSettings().catch(() => {});
  });

  if (!target) {
    $('#reason').textContent = 'لا يوجد عنوان صالح لإعادة المحاولة. افتح الإعدادات واربط الجهاز من جديد.';
    $('#countdown').hidden = true;
    $('#retry').hidden = true;
    $('#settings').classList.add('primary');
    focusForKeys($('#settings'));
    return;
  }

  $('#retry').addEventListener('click', retry);
  // Back on the network: try again right away.
  addEventListener('online', () => setTimeout(retry, 1000));
  // The host only: the full link carries the device's access key.
  // (textContent + append: Element.replaceChildren needs Chrome 86.)
  const host = document.createElement('bdi');
  host.dir = 'ltr';
  host.textContent = target.host;
  const reason = $('#reason');
  reason.textContent = navigator.onLine === false ? 'الجهاز غير متصل بأي شبكة حالياً. الخادم: ' : 'لا يستجيب الخادم على العنوان ';
  reason.append(host);
  startCountdown(nextDelay(target));
  focusForKeys($('#retry'));
}

init();
