import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanAddresses } from './lib/network.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const env = process.env;
const port = Number(env.PORT ?? 3000);

export const config = {
  root: ROOT,
  version: pkg.version,
  port,
  host: env.HOST ?? '0.0.0.0',

  // Base URL LAN devices use to reach the server (printed at start-up and
  // used for links shown to staff). Defaults to this machine's LAN IP.
  publicBaseUrl: (env.PUBLIC_BASE_URL || `http://${lanAddresses()[0] ?? 'localhost'}:${port}`).replace(/\/+$/, ''),

  dbPath: env.DB_PATH ?? path.join(ROOT, 'data', 'menu.db'),
  mediaDir: env.MEDIA_DIR ?? path.join(ROOT, 'data', 'media'),
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 500),

  // Android app offered at /app.apk (built from android/).
  apkPath: env.APK_PATH ?? path.join(ROOT, 'dist', 'ProjectionMenu.apk'),

  // Advertise the server on the LAN (mDNS/zeroconf) so the Android app finds it.
  mdns: env.MDNS !== '0' && env.MDNS !== 'false',

  // Login sessions (cookie pm_session) live this long and slide on use.
  sessionDays: Number(env.SESSION_DAYS ?? 30),

  // How long a scene change waits for the table's projectors to acknowledge.
  sceneAckTimeoutMs: Number(env.SCENE_ACK_TIMEOUT_MS ?? 2000),
};
