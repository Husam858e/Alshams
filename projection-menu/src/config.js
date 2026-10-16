import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanAddresses } from './lib/network.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env;
const port = Number(env.PORT ?? 3000);

export const config = {
  root: ROOT,
  port,
  host: env.HOST ?? '0.0.0.0',

  // Base URL that LAN devices use to reach the server: mpv agents download
  // media from it, and the dashboard puts it in pairing links/QR codes when
  // it is itself opened via localhost. Defaults to this machine's LAN IP.
  publicBaseUrl: (env.PUBLIC_BASE_URL || `http://${lanAddresses()[0] ?? 'localhost'}:${port}`).replace(/\/+$/, ''),

  dbPath: env.DB_PATH ?? path.join(ROOT, 'data', 'menu.db'),
  mediaDir: env.MEDIA_DIR ?? path.join(ROOT, 'data', 'media'),
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 500),

  // Android app offered to tablets at /app.apk (built from android/).
  apkPath: env.APK_PATH ?? path.join(ROOT, 'dist', 'ProjectionMenu.apk'),

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
