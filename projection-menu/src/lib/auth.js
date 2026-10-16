import crypto from 'node:crypto';
import { HttpError } from './validate.js';

export const newKey = () => crypto.randomBytes(18).toString('base64url');

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function requireAdmin(token) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!safeEqual(given, token)) return next(new HttpError(401, 'رمز الدخول غير صحيح'));
    next();
  };
}

// Tablets are paired to a table with the link the dashboard shows:
//   /tablet/?table=T01&key=<access_key>
// and send both on every request.
export function requireTable(db) {
  const findTable = db.prepare('SELECT * FROM restaurant_tables WHERE code = ? AND is_active = 1');
  return (req, _res, next) => {
    const table = findTable.get(req.get('x-table-code') ?? '');
    if (!table || !safeEqual(req.get('x-table-key') ?? '', table.access_key)) {
      return next(new HttpError(401, 'هذا الجهاز غير مرتبط بطاولة. اطلب من الإدارة رابط الربط.'));
    }
    req.table = table;
    next();
  };
}
