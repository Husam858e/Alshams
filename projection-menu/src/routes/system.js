import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { lanUrls } from '../lib/network.js';
import { HttpError } from '../lib/validate.js';

const APK_URL = '/app.apk';
const APK_TYPE = 'application/vnd.android.package-archive';

function apkFile(apkPath) {
  try {
    const stat = fs.statSync(apkPath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

// Admin: what the dashboard needs to build pairing links and QR codes that
// tablets can actually reach (never "localhost").
export function systemRoutes({ config }) {
  const r = Router();

  r.get('/server-info', (_req, res) => {
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
// is paired. The APK holds no secrets; pairing needs a link with a key.
export function apkDownload({ config }) {
  // Headers given here are only applied when the file is actually sent.
  const options = {
    maxAge: 0, // rebuilt APKs keep the same URL: always revalidate
    headers: { 'Content-Type': APK_TYPE, 'X-Content-Type-Options': 'nosniff' },
  };
  return (_req, res, next) => {
    res.download(config.apkPath, path.basename(config.apkPath), options, (err) => {
      if (!err || res.headersSent) return;
      const missing = err.status === 404 || err.code === 'ENOENT' || err.code === 'EISDIR';
      next(missing ? new HttpError(404, 'ملف التطبيق (APK) غير موجود على الخادم بعد. ابنِه من مجلد android ثم انسخه إلى dist/ProjectionMenu.apk') : err);
    });
  };
}
