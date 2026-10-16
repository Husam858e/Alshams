import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env;

export const config = {
  root: ROOT,
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',

  // Base URL that LAN devices (mpv agents) use to download media.
  // Browser players use relative URLs and don't need it.
  publicBaseUrl: env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT ?? 3000}`,

  dbPath: env.DB_PATH ?? path.join(ROOT, 'data', 'menu.db'),
  mediaDir: env.MEDIA_DIR ?? path.join(ROOT, 'data', 'media'),
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 500),

  // Shown next to prices on the tablet.
  currency: env.CURRENCY ?? 'د.ع',

  // Single shared admin token for the prototype. Replace with real user
  // accounts (hashed passwords + sessions) before going to production.
  adminToken: env.ADMIN_TOKEN ?? 'change-me',

  // How long the server waits for a projector to acknowledge a cue.
  cueAckTimeoutMs: Number(env.CUE_ACK_TIMEOUT_MS ?? 3000),

  // An mpv agent is considered online if it sent a heartbeat this recently.
  agentOnlineWindowMs: Number(env.AGENT_ONLINE_WINDOW_MS ?? 30000),
};
