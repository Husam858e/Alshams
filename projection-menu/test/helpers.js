// Shared test harness: an isolated server (temp database + media dir, mDNS
// off) on a random port, staff users per role, and small HTTP/socket clients.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioClient } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { config as baseConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';
import { hashPassword } from '../src/lib/passwords.js';

export const PASSWORDS = { owner: 'owner-pass', designer: 'designer-pass', waiter: 'waiter-pass' };

export async function startServer({ users = true, config: overrides = {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-menu-test-'));
  const db = openDb(path.join(tmp, 'test.db'));
  const config = {
    ...baseConfig,
    mediaDir: path.join(tmp, 'media'),
    apkPath: path.join(tmp, 'dist', 'ProjectionMenu.apk'),
    mdns: false,
    sceneAckTimeoutMs: 600,
    ...overrides,
  };
  fs.mkdirSync(config.mediaDir, { recursive: true });
  const { server, io, ctx } = createApp({ db, config });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const t = { tmp, db, config, server, io, ctx, base, sockets: [] };
  t.client = () => new Client(base);
  t.disconnectAll = () => {
    for (const s of t.sockets.splice(0)) s.disconnect();
  };
  t.close = async () => {
    t.disconnectAll();
    await new Promise((resolve) => io.close(() => resolve()));
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  };

  if (users) {
    const insert = db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)');
    const names = { owner: 'المالك', designer: 'المصممة', waiter: 'الويتر' };
    for (const role of ['owner', 'designer', 'waiter']) {
      insert.run(names[role], role, await hashPassword(PASSWORDS[role]), role);
    }
    t.as = {};
    for (const role of ['owner', 'designer', 'waiter']) {
      t.as[role] = t.client();
      await t.as[role].login(role, PASSWORDS[role]);
    }
  }

  // Socket.IO clients that the harness disconnects on close.
  t.live = (client) => track(t, ioClient(`${base}/live`, { extraHeaders: { cookie: client.cookieHeader() }, reconnection: false, forceNew: true }));
  t.player = (deviceKey) => track(t, ioClient(`${base}/player`, { auth: { deviceKey }, reconnection: false, forceNew: true }));
  return t;
}

function track(t, socket) {
  t.sockets.push(socket);
  return socket;
}

// Minimal cookie-keeping fetch client.
export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(method, url, body, { headers = {}, raw = false } = {}) {
    const init = { method, headers: { ...headers } };
    if (this.cookies.size) init.headers.cookie = this.cookieHeader();
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) {
      init.headers['content-type'] ??= 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    } else if (method !== 'GET' && method !== 'HEAD') {
      init.headers['content-type'] ??= 'application/json';
    }
    const res = await fetch(this.base + url, init);
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, ...rest] = pair.split('=');
      const value = rest.join('=');
      if (!value || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    if (raw) return res;
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, headers: res.headers, body: data };
  }

  get(url, opts) {
    return this.request('GET', url, undefined, opts);
  }
  post(url, body = {}, opts) {
    return this.request('POST', url, body, opts);
  }
  put(url, body = {}, opts) {
    return this.request('PUT', url, body, opts);
  }
  patch(url, body = {}, opts) {
    return this.request('PATCH', url, body, opts);
  }
  delete(url, opts) {
    return this.request('DELETE', url, undefined, opts);
  }

  async login(username, password) {
    const res = await this.post('/api/auth/login', { username, password });
    if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res;
  }
}

// Resolves with the next `event` on `socket` (or rejects after `ms`).
export function nextEvent(socket, event, ms = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
    socket.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args.length > 1 ? args : args[0]);
    });
  });
}

// Records every `event` on `socket`; until(pred) waits for a matching one.
export function collect(socket, event) {
  const seen = [];
  const waiters = [];
  socket.on(event, (...args) => {
    const value = args.length > 1 && typeof args.at(-1) !== 'function' ? args : args[0];
    seen.push(value);
    for (const w of [...waiters]) if (w.pred(value)) w.done(value);
  });
  return {
    seen,
    until(pred, ms = 2000) {
      const hit = seen.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const w = {
          pred,
          done: (v) => {
            clearTimeout(timer);
            waiters.splice(waiters.indexOf(w), 1);
            resolve(v);
          },
        };
        const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
        waiters.push(w);
      });
    },
  };
}

export function connected(socket, ms = 2000) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket did not connect')), ms);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// A real 4x4 JPEG (made with ffmpeg) for upload tests.
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMm' +
    'JigoKDAwLi44ODpFRVP/xABLAAEBAAAAAAAAAAAAAAAAAAAABgEBAAAAAAAAAAAAAAAAAAAABhABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/A' +
    'ABEIAAQABAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AKgARIH/2Q==',
  'base64',
);

export function fileForm(name, bytes, type = 'application/octet-stream', fields = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([bytes], { type }), name);
  return form;
}

// Creates an area, a table and (optionally) a projector straight in the DB.
export function makeTable(t, { number = 1, seats = 4, area = 'الصالة', projector = true } = {}) {
  const areaId = t.db.prepare('INSERT INTO areas (name) VALUES (?)').run(area).lastInsertRowid;
  const tableId = t.db.prepare('INSERT INTO restaurant_tables (number, area_id, seats) VALUES (?, ?, ?)').run(number, areaId, seats)
    .lastInsertRowid;
  let deviceKey = null;
  let projectorId = null;
  if (projector) {
    deviceKey = `test-device-key-${number}-${Math.random().toString(36).slice(2, 10)}`;
    projectorId = t.db.prepare('INSERT INTO projectors (table_id, name, device_key) VALUES (?, ?, ?)').run(tableId, `بروجكتر ${number}`, deviceKey)
      .lastInsertRowid;
  }
  return { areaId, tableId, deviceKey, projectorId };
}

// A category with dishes, straight in the DB. -> {categoryId, dishIds}
export function makeMenu(t, { dishes = [{ name_ar: 'كباب', price: 12000 }], visible = true } = {}) {
  const categoryId = t.db.prepare('INSERT INTO categories (name_ar, is_visible) VALUES (?, ?)').run('مشاوي', visible ? 1 : 0)
    .lastInsertRowid;
  const insert = t.db.prepare('INSERT INTO dishes (category_id, name_ar, price, is_available) VALUES (?, ?, ?, ?)');
  const dishIds = dishes.map((d) => insert.run(categoryId, d.name_ar, d.price ?? 0, d.is_available === false ? 0 : 1).lastInsertRowid);
  return { categoryId, dishIds };
}
