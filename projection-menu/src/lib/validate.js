// Tiny request validators. Each throws an HttpError(400) with an Arabic
// message the dashboard can show as-is.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'العنصر غير موجود') => new HttpError(404, msg);

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
  const n = Number(value);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) {
    throw badRequest(`قيمة غير صالحة للحقل "${field}"`);
  }
  return n;
}

export const int = (value, field, opts = {}) => num(value, field, { ...opts, integer: true });

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
