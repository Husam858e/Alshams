import { EventEmitter } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { requireAdmin } from './lib/auth.js';
import { HttpError } from './lib/validate.js';
import { agentRoutes } from './routes/agent.js';
import { deviceRoutes } from './routes/devices.js';
import { mediaRoutes } from './routes/media.js';
import { menuRoutes } from './routes/menu.js';
import { orderRoutes } from './routes/orders.js';
import { apkDownload, systemRoutes } from './routes/system.js';
import { tabletRoutes } from './routes/tablet.js';
import { attachSockets } from './sockets.js';
import { createBrowserDriver } from './services/drivers/browserDriver.js';
import { createMpvAgentDriver } from './services/drivers/mpvAgentDriver.js';
import { ProjectionService } from './services/projectionService.js';

export function createApp({ db, config }) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const bus = new EventEmitter();

  const drivers = {
    browser: createBrowserDriver({ nsp: io.of('/player'), timeoutMs: config.cueAckTimeoutMs }),
    mpv_agent: createMpvAgentDriver({
      publicBaseUrl: config.publicBaseUrl,
      timeoutMs: config.cueAckTimeoutMs,
      onlineWindowMs: config.agentOnlineWindowMs,
    }),
  };
  const projection = new ProjectionService({ db, drivers, bus });
  const deps = { db, config, projection, bus };

  attachSockets(io, deps);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use(
    '/api/admin',
    requireAdmin(config.adminToken),
    menuRoutes(deps),
    mediaRoutes(deps),
    deviceRoutes(deps),
    orderRoutes(deps),
    systemRoutes(deps),
  );
  app.use('/api/tablet', tabletRoutes(deps));
  app.use('/api/agent', agentRoutes(deps));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'المسار غير موجود')));

  // Uploaded files get random names and never change, so they can be cached
  // forever by players (important: videos must not re-download every play).
  app.use(
    '/media',
    express.static(config.mediaDir, {
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );
  // three.js for live .glb rendering on browser players (served locally:
  // a restaurant LAN may have no internet).
  app.use('/vendor/three', express.static(path.join(config.root, 'node_modules', 'three')));
  // QR codes for pairing tablets/players in the dashboard.
  app.use('/vendor/qrcode', express.static(path.join(config.root, 'node_modules', 'qrcode-generator', 'dist')));
  // The Android app (tablet / player / dashboard), installed over the LAN.
  app.get('/app.apk', apkDownload(deps));
  app.use(express.static(path.join(config.root, 'public')));
  app.get('/', (_req, res) => res.redirect('/admin/'));

  app.use(errorHandler);

  return { app, server, io, bus, projection };
}

function errorHandler(err, _req, res, _next) {
  let status = err instanceof HttpError ? err.status : (err.status ?? err.statusCode ?? 500);
  let message = err.message;
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    status = 409;
    message = 'لا يمكن تنفيذ العملية: العنصر مرتبط ببيانات أخرى (طلبات أو عروض)';
  } else if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    status = 409;
    message = 'القيمة مستخدمة مسبقاً';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'JSON غير صالح';
  } else if (status >= 500) {
    console.error(err);
    message = 'خطأ داخلي في الخادم';
  }
  // Missing /media files etc. come from express.static as plain 404s.
  if (status === 404 && !(err instanceof HttpError)) message = 'غير موجود';
  res.status(status).json({ error: message });
}
