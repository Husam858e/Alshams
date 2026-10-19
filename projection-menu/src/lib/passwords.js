import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// scrypt cost parameters (N=2^15 ≈ 32 MB, ~50-100 ms on a mini-PC).
const PARAMS = { N: 32768, r: 8, p: 1 };
const KEY_LEN = 64;
const maxmem = 64 * 1024 * 1024;

// Format: scrypt$N$r$p$<salt base64>$<hash base64>
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, { ...PARAMS, maxmem });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, saltB64, hashB64] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(String(password).normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem,
  });
  return crypto.timingSafeEqual(actual, expected);
}

// A real hash to compare against when the username does not exist, so a
// failed login takes the same time either way.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('not-a-real-password');
  await verifyPassword(password, dummyHash);
  return false;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 4) return 'كلمة المرور يجب أن تكون 4 أحرف على الأقل';
  if (password.length > 128) return 'كلمة المرور طويلة جداً';
  return null;
}
