// Minimal cookie helpers (no dependency needed for one session cookie).

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const name = part.slice(0, idx).trim();
    if (!(name in out)) {
      try {
        out[name] = decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        out[name] = part.slice(idx + 1).trim();
      }
    }
  }
  return out;
}

export function serializeCookie(name, value, { maxAgeSeconds, secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
    if (maxAgeSeconds <= 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  }
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
