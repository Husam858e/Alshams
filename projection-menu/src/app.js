import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { createSessions } from './auth/sessions.js';
import { errorHandler, requireJsonBody } from './lib/http.js';
import { HttpError } from './lib/validate.js';
import { authRoutes } from './routes/auth.js';
import { floorRoutes } from './routes/floor.js';
import { mediaRoutes } from './routes/media.js';
import { menuRoutes } from './routes/menu.js';
import { orderRoutes } from './routes/orders.js';
import { playerRoutes } from './routes/player.js';
import { projectorRoutes } from './routes/projectors.js';
import { reportRoutes } from './routes/reports.js';
import { sceneRoutes } from './routes/scenes.js';
import { settingsRoutes } from './routes/settings.js';
import { apkDownload, systemRoutes } from './routes/system.js';
import { createActivity } from './services/activity.js';
import { createFloor } from './services/floor.js';
import { createLive } from './services/live.js';
import { createMenu } from './services/menu.js';
import { createOrders } from './services/orders.js';
import { ProjectionService } from './services/projectionService.js';
import { createSettings } from './services/settings.js';
import { attachSockets } from './sockets.js';

// Builds the HTTP server, Socket.IO and every service around one database.
// Nothing listens yet and mDNS is not started (see server.js), so tests can
// create as many isolated instances as they like.
export function createApp({ db, config }) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { serveClient: true });

  const settings = createSettings(db);
  settings.ensureDefaults();
  const live = createLive(io.of('/live'));
  const menu = createMenu(db);
  const orders = createOrders(db);
  const activity = createActivity(db);
  const sessions = createSessions({ db, config });
  const projection = new ProjectionService({ db, config, settings, menu, orders, live });
  const floor = createFloor({ db, projection, orders });

  const ctx = {
    db,
    config,
    settings,
    live,
    menu,
    orders,
    activity,
    sessions,
    projection,
    floor,
    mdnsHandle: null,
    mdns: () => ctx.mdnsHandle,
  };

  attachSockets(io, ctx);

  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // ── API ───────────────────────────────────────────────────────────
  app.use(
    '/api',
    requireJsonBody({ multipartPaths: [/^\/media\/?$/] }),
    express.json({ limit: '1mb' }),
    (req, _res, next) => {
      if (req.body === null || typeof req.body !== 'object') req.body = {};
      next();
    },
    sessions.middleware(),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
    systemRoutes(ctx),
    authRoutes(ctx),
    floorRoutes(ctx),
    projectorRoutes(ctx),
    sceneRoutes(ctx),
    menuRoutes(ctx),
    mediaRoutes(ctx),
    settingsRoutes(ctx),
    orderRoutes(ctx),
    reportRoutes(ctx),
    playerRoutes(ctx),
  );
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'المسار غير موجود')));

  // ── Files ─────────────────────────────────────────────────────────
  // Uploaded files get random names and never change: cache them forever
  // (players must not re-download videos on every loop).
  app.use('/media', express.static(config.mediaDir, { immutable: true, maxAge: '365d', fallthrough: false, index: false }));

  // '/app' and '/player' (query kept) -> the folder URL, so relative links work.
  app.use((req, res, next) => {
    const m = /^\/(app|player)(\?.*)?$/.exec(req.originalUrl);
    if (m && (req.method === 'GET' || req.method === 'HEAD')) return res.redirect(301, `/${m[1]}/${m[2] ?? ''}`);
    next();
  });
  // The web UIs: always revalidate so an update reaches tablets at once.
  const pub = (dir) => express.static(path.join(config.root, 'public', dir), { maxAge: 0, setHeaders: noCache });
  app.use('/app', pub('app'));
  app.use('/player', pub('player'));
  app.use('/shared', pub('shared'));

  // Browser libraries, served locally: a restaurant LAN may have no internet.
  const modules = path.join(config.root, 'node_modules');
  const vendor = (dir) => express.static(path.join(modules, dir), { maxAge: '1d', index: false });
  app.use('/vendor/preact', vendor('preact'));
  app.use('/vendor/htm', vendor('htm'));
  app.use('/vendor/three', vendor('three'));
  app.use('/vendor/qrcode', vendor(path.join('qrcode-generator', 'dist')));

  // The Android app (staff app / projector player), installed over the LAN.
  app.get('/app.apk', apkDownload(ctx));

  app.get('/', (_req, res) => res.redirect('/app/'));
  // v1 bookmarks and QR codes.
  app.get(['/admin', '/admin/', '/tablet', '/tablet/'], (_req, res) => res.redirect('/app/'));

  app.use((_req, _res, next) => next(new HttpError(404, 'الصفحة غير موجودة')));
  app.use(errorHandler);

  return { app, server, io, ctx };
}

function noCache(res) {
  res.setHeader('Cache-Control', 'no-cache');
}
