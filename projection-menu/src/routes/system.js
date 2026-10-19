import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { ownerOnly } from '../auth/roles.js';
import { androidCors } from '../lib/http.js';
import { lanUrls } from '../lib/network.js';
import { HttpError } from '../lib/validate.js';

export const APK_URL = '/app.apk';
const APK_TYPE = 'application/vnd.android.package-archive';

function apkFile(apkPath) {
  try {
    const stat = fs.statSync(apkPath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

export function systemRoutes({ config, settings }) {
  const r = Router();
  const cors = androidCors('GET');

  // Public: the Android setup page checks a typed/discovered address with it.
  r.options('/info', cors);
  r.get('/info', cors, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ app: 'projection-menu', version: config.version, restaurantName: settings.general().restaurantName });
  });

  // Owner: addresses tablets and projectors can reach (for QR codes), never "localhost".
  r.get('/system/server-info', ownerOnly, (_req, res) => {
    const apk = apkFile(config.apkPath);
    res.json({
      publicBaseUrl: config.publicBaseUrl,
      lanUrls: lanUrls(config.port),
      apkAvailable: Boolean(apk),
      apkUrl: APK_URL,
      apkSize: apk?.size ?? null,
      apkUpdatedAt: apk?.mtime.toISOString() ?? null,
    });
  });

  return r;
}

// Public on purpose: a fresh tablet downloads the app over the LAN before it
// is paired. The APK holds no secrets.
export function apkDownload({ config }) {
  const options = {
    maxAge: 0, // rebuilt APKs keep the same URL: always revalidate
    headers: { 'Content-Type': APK_TYPE, 'X-Content-Type-Options': 'nosniff' },
  };
  return (_req, res, next) => {
    res.download(config.apkPath, path.basename(config.apkPath), options, (err) => {
      if (!err || res.headersSent) return;
      const missing = err.status === 404 || err.code === 'ENOENT' || err.code === 'EISDIR';
      next(
        missing
          ? new HttpError(404, 'ملف التطبيق (APK) غير موجود على الخادم بعد. ابنِه من مجلد android ثم انسخه إلى dist/ProjectionMenu.apk')
          : err,
      );
    });
  };
}
