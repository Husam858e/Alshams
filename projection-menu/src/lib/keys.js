import crypto from 'node:crypto';

// Random URL-safe secret (projector device keys).
export const newKey = () => crypto.randomBytes(18).toString('base64url');

// Constant-time string comparison.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// 6-digit pairing code ("042917"), uniformly random.
export const sixDigits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
