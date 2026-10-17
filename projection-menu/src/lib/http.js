import { HttpError } from './validate.js';

// The Android app's local pages (setup, demo) run on this origin and call
// /api/info and /api/projectors/claim across origins.
export const ANDROID_ORIGIN = 'https://appassets.androidplatform.net';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Cheap CSRF guard: a cross-site <form> can only send urlencoded, multipart
// or text/plain, and a cross-origin JSON request needs a CORS preflight we
// never grant. POST must be JSON (or multipart for uploads); PUT/PATCH/DELETE
// cannot be sent cross-origin without a preflight, so an empty body is fine.
export function requireJsonBody({ multipartPaths = [] } = {}) {
  return (req, _res, next) => {
    if (!MUTATING.has(req.method)) return next();
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const multipartOk = type === 'multipart/form-data' && multipartPaths.some((re) => re.test(req.path));
    if (type === 'application/json' || multipartOk) return next();
    if (!type && req.method !== 'POST' && !hasBody(req)) return next();
    next(new HttpError(415, 'نوع المحتوى غير مدعوم: أرسل البيانات بصيغة JSON'));
  };
}

const hasBody = (req) => Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;

// CORS for the Android app's local pages, with preflight (and Private
// Network Access: the server lives on a private LAN address).
export function androidCors(methods = 'GET, POST') {
  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', ANDROID_ORIGIN);
    res.append('Vary', 'Origin');
    if (req.method !== 'OPTIONS') return next();
    res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    res.status(204).end();
  };
}

// Rate-limit middleware keyed by client IP (every request counts).
export function limitByIp(limiter, message) {
  return (req, _res, next) => {
    const key = req.ip ?? req.socket.remoteAddress ?? '?';
    if (limiter.hit(key) > limiter.limit) return next(new HttpError(429, message));
    next();
  };
}

export function errorHandler(err, _req, res, _next) {
  let status = err instanceof HttpError ? err.status : (err.status ?? err.statusCode ?? 500);
  let message = err.message;
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    status = 409;
    message = 'لا يمكن تنفيذ العملية: العنصر مرتبط ببيانات أخرى';
  } else if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    status = 409;
    message = 'القيمة مستخدمة مسبقاً';
  } else if (String(err.code ?? '').startsWith('SQLITE_CONSTRAINT')) {
    status = 400;
    message = 'قيمة غير صالحة';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'JSON غير صالح';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'حجم الطلب كبير جداً';
  } else if (status >= 500 && !(err instanceof HttpError)) {
    console.error(err);
    message = 'خطأ داخلي في الخادم';
  }
  // Missing static files (express.static) arrive as plain 404 errors.
  if (status === 404 && !(err instanceof HttpError)) message = 'غير موجود';
  if (res.headersSent) return;
  res.status(status).json({ error: message });
}
