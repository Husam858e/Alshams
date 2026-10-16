// Admin dashboard shell: login, navigation, live events over Socket.IO.
// Each view module exports render(container, ctx) and optionally
// onEvent(name, payload) for live updates.

import { io } from '/socket.io/socket.io.esm.min.js';
import { $, h, toast } from '/shared/dom.js';
import { AuthError, api, auth } from './api.js';
import * as devices from './views/devices.js';
import * as dishes from './views/dishes.js';
import * as log from './views/log.js';
import * as media from './views/media.js';
import * as orders from './views/orders.js';

const VIEWS = { dishes, media, devices, orders, log };
const ctx = { current: null, rerender: () => route() };

async function start() {
  if (!auth.token) return showLogin();
  try {
    await api('/categories');
  } catch (err) {
    auth.clear();
    return showLogin(err instanceof AuthError ? 'رمز الدخول غير صحيح' : err.message);
  }
  $('#login').hidden = true;
  $('#app').hidden = false;
  connectLive();
  refreshOrdersBadge();
  addEventListener('hashchange', route);
  route();
}

function showLogin(error) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-error').hidden = !error;
  $('#login-error').textContent = error ?? '';
  $('#token').focus();
}

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  auth.set($('#token').value.trim());
  start();
});

$('#logout').addEventListener('click', () => {
  auth.clear();
  location.reload();
});

async function route() {
  const name = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'dishes';
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('active', a.dataset.view === name);
  const container = $('#view');
  const current = { name, module: VIEWS[name], container };
  ctx.current = current;
  container.replaceChildren(h('p', { class: 'muted' }, 'جارٍ التحميل...'));
  try {
    await current.module.render(container, ctx);
  } catch (err) {
    if (err instanceof AuthError) return showLogin(err.message);
    container.replaceChildren(h('p', { class: 'error' }, err.message));
  }
}

function connectLive() {
  const socket = io('/admin', { auth: { token: auth.token } });
  const setLive = (on) => {
    $('#live').dataset.on = String(on);
    $('#live').textContent = on ? 'مباشر' : 'غير متصل';
  };
  socket.on('connect', () => setLive(true));
  socket.on('disconnect', () => setLive(false));
  socket.on('connect_error', () => setLive(false));

  socket.on('order:changed', (order) => {
    if (order.status === 'placed') toast(`🧾 طلب جديد #${order.id} — ${order.table_name}`, 'ok');
    refreshOrdersBadge();
  });
  for (const event of ['projector:status', 'order:changed', 'projection:log']) {
    socket.on(event, (payload) => ctx.current?.module.onEvent?.(event, payload, ctx.current.container, ctx));
  }
}

async function refreshOrdersBadge() {
  try {
    const waiting = (await api('/orders')).filter((o) => o.status === 'placed').length;
    $('#orders-badge').hidden = !waiting;
    $('#orders-badge').textContent = waiting;
  } catch {
    // The badge is cosmetic.
  }
}

start();
