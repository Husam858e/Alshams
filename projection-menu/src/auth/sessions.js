import crypto from 'node:crypto';
import { nowIso } from '../db/index.js';
import { parseCookies, serializeCookie } from '../lib/cookies.js';

export const SESSION_COOKIE = 'pm_session';
const HOUR = 3600 * 1000;

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// Cookie sessions: a random 32-byte token in an HttpOnly cookie, only its
// sha256 in the database. Expiry slides forward while the session is used.
export function createSessions({ db, config }) {
  const ttlMs = config.sessionDays * 24 * HOUR;
  const q = {
    insert: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)'),
    find: db.prepare(`
      SELECT s.token_hash, s.expires_at, u.id, u.name, u.username, u.role
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1`),
    extend: db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?'),
    remove: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    removeUser: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash IS NOT ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  const cookie = (req, token, maxAgeSeconds) =>
    serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds, secure: Boolean(req?.secure) });

  return {
    ttlMs,

    // Starts a session and sets the cookie on the response.
    start(req, res, userId) {
      q.purge.run(nowIso());
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      q.insert.run(tokenHash, userId, new Date(Date.now() + ttlMs).toISOString(), String(req.get('user-agent') ?? '').slice(0, 200));
      res.append('Set-Cookie', cookie(req, token, ttlMs / 1000));
      return tokenHash;
    },

    // Resolves a raw cookie header to {user, tokenHash} or null.
    fromCookieHeader(header) {
      const token = parseCookies(header)[SESSION_COOKIE];
      if (!token) return null;
      const tokenHash = hashToken(token);
      const row = q.find.get(tokenHash, nowIso());
      if (!row) return null;
      const { expires_at, token_hash, ...user } = row;
      return { user, tokenHash: token_hash, expiresAt: expires_at, token };
    },

    // Express middleware: sets req.user / req.sessionHash when logged in.
    middleware() {
      return (req, res, next) => {
        const found = this.fromCookieHeader(req.headers.cookie);
        if (found) {
          req.user = found.user;
          req.sessionHash = found.tokenHash;
          // Slide the expiry at most once an hour.
          if (Date.parse(found.expiresAt) - Date.now() < ttlMs - HOUR) {
            q.extend.run(new Date(Date.now() + ttlMs).toISOString(), found.tokenHash);
            res.append('Set-Cookie', cookie(req, found.token, ttlMs / 1000));
          }
        }
        next();
      };
    },

    end(req, res) {
      if (req.sessionHash) q.remove.run(req.sessionHash);
      res.append('Set-Cookie', cookie(req, '', 0));
    },

    // Logs a user out everywhere (optionally keeping one session).
    endAllForUser(userId, keepHash = null) {
      q.removeUser.run(userId, keepHash);
    },
  };
}
