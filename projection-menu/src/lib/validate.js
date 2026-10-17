// Tiny request validators. Each throws an HttpError with an Arabic message
// the staff app can show as-is.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'العنصر غير موجود') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);
export const forbidden = (msg = 'ليست لديك صلاحية لهذا الإجراء') => new HttpError(403, msg);

// True when the JSON body has this key (even if its value is null).
export const has = (body, key) => Object.prototype.hasOwnProperty.call(body ?? {}, key);

export function str(value, field, { required = false, max = 500 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`الحقل "${field}" مطلوب`);
    return null;
  }
  if (typeof value !== 'string') throw badRequest(`الحقل "${field}" يجب أن يكون نصاً`);
  const trimmed = value.trim();
  if (required && !trimmed) throw badRequest(`الحقل "${field}" مطلوب`);
  if (trimmed.length > max) throw badRequest(`الحقل "${field}" أطول من ${max} حرفاً`);
  return trimmed || null;
}

export function num(value, field, { required = false, min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`الحقل "${field}" مطلوب`);
    return null;
  }
  const n = typeof value === 'boolean' ? NaN : Number(value);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) {
    throw badRequest(`قيمة غير صالحة للحقل "${field}"`);
  }
  return n;
}

export const int = (value, field, opts = {}) => num(value, field, { ...opts, integer: true });

// Route ids: always a positive integer, 404 otherwise.
export function idParam(value, what = 'العنصر') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw notFound(`${what} غير موجود`);
  return n;
}

export function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

export function oneOf(value, field, allowed, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`الحقل "${field}" مطلوب`);
    return null;
  }
  if (!allowed.includes(value)) throw badRequest(`قيمة غير صالحة للحقل "${field}"`);
  return value;
}

export function idList(value, field) {
  if (!Array.isArray(value) || value.length > 1000) throw badRequest(`الحقل "${field}" يجب أن يكون قائمة أرقام`);
  const ids = value.map((v) => Number(v));
  if (ids.some((n) => !Number.isInteger(n) || n < 1) || new Set(ids).size !== ids.length) {
    throw badRequest(`الحقل "${field}" يحتوي أرقاماً غير صالحة أو مكررة`);
  }
  return ids;
}
