// The /api route table of the in-page backends (offline demo and cloud
// host): routes are registered by routes/*.js as
// route(method, '/path/:param', roles | null, handler), and a backend may
// register the same method + pattern again to replace a handler (the cloud
// host does, where Firestore needs another implementation).

import { HttpError, notFound } from './validate.js';

export function createRouter() {
  const routes = [];

  function route(method, pattern, roles, handler, options = {}) {
    const parts = pattern.split('/').filter(Boolean);
    const entry = { method, pattern, parts, roles, handler, ...options };
    const at = routes.findIndex((r) => r.method === method && r.pattern === pattern);
    if (at >= 0) routes[at] = entry;
    else routes.push(entry);
  }

  // -> {route, params}, or throws 404 (unknown path or method).
  function match(method, path) {
    const segs = path.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== method || r.parts.length !== segs.length) continue;
      const params = {};
      const ok = r.parts.every((p, i) => {
        if (!p.startsWith(':')) return p === segs[i];
        params[p.slice(1)] = decodeURIComponent(segs[i]);
        return true;
      });
      if (ok) return { route: r, params };
    }
    throw notFound('المسار غير موجود');
  }

  return { route, match, list: () => routes.map((r) => `${r.method} ${r.pattern}`) };
}

// '/api/menu?x=1' -> {path: '/menu', query: {x: '1'}}
export function parseUrl(url) {
  const parsed = new URL(url, 'http://backend.local');
  return { path: parsed.pathname.replace(/^\/api(?=\/|$)/, '') || '/', query: Object.fromEntries(parsed.searchParams) };
}

// Roles of a route against the signed-in user (null: nobody signed in).
export function authorize(route, me) {
  if (!route.roles) return;
  if (!me) throw new HttpError(401, 'يجب تسجيل الدخول أولاً');
  if (!route.roles.includes(me.role)) throw new HttpError(403, 'ليست لديك صلاحية لهذا الإجراء');
}

// A handler's result -> {status, data}; `out.__status` comes from ctx.created().
export function reply(out) {
  if (out && out.__status) return { status: out.__status, data: structuredClone(out.data) };
  return { status: 200, data: structuredClone(out ?? null) };
}

// A thrown error -> {status, data:{error}}; unexpected ones are logged.
export function errorReply(err) {
  if (err instanceof HttpError) return { status: err.status, data: { error: err.message } };
  console.error(err);
  return { status: 500, data: { error: 'حدث خطأ في الخادم' } };
}
