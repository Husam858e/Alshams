import { nowIso, parseJson } from '../db/index.js';
import { defaultCalibration, readCalibration } from '../lib/calibration.js';
import { safeEqual } from '../lib/keys.js';
import { badRequest, int } from '../lib/validate.js';

export const SCENE_TYPES = ['welcome', 'menu', 'category', 'dish', 'order', 'off'];
export const DEFAULT_SCENE = Object.freeze({ type: 'welcome' });

export const tableRoom = (tableId) => `table:${tableId}`;
export const projectorRoom = (projectorId) => `projector:${projectorId}`;

// ProjectionService decides what each table's projector shows:
//  - one scene per table (welcome / menu / category / dish / order / off),
//    persisted in table_scenes so a rebooted projector restores it;
//  - delivery to the table's connected players with an ack timeout;
//  - which projectors are online (= have a connected /player socket);
//  - the PlayerBootstrap a player (or a staff preview) starts from.
export class ProjectionService {
  constructor({ db, config, settings, menu, orders, live }) {
    this.db = db;
    this.config = config;
    this.settings = settings;
    this.menu = menu;
    this.orders = orders;
    this.live = live;
    this.players = null; // Socket.IO '/player' namespace, set by attachSockets()
    this.connections = new Map(); // projectorId -> Set<socket>
    this.q = {
      scene: db.prepare('SELECT scene FROM table_scenes WHERE table_id = ?'),
      scenes: db.prepare('SELECT table_id, scene FROM table_scenes'),
      saveScene: db.prepare(`
        INSERT INTO table_scenes (table_id, scene, updated_at, updated_by) VALUES (?, ?, ?, ?)
        ON CONFLICT(table_id) DO UPDATE SET scene = excluded.scene, updated_at = excluded.updated_at,
          updated_by = excluded.updated_by`),
      table: db.prepare(`
        SELECT t.id, t.number, a.name AS area_name
        FROM restaurant_tables t LEFT JOIN areas a ON a.id = t.area_id WHERE t.id = ?`),
      projector: db.prepare('SELECT * FROM projectors WHERE id = ?'),
      byKey: db.prepare('SELECT * FROM projectors WHERE device_key = ?'),
      firstProjector: db.prepare('SELECT * FROM projectors WHERE table_id = ? ORDER BY id LIMIT 1'),
      touch: db.prepare('UPDATE projectors SET last_seen_at = ? WHERE id = ?'),
    };
  }

  // A player authenticates with its device key (header, query or socket auth).
  projectorByKey(key) {
    if (typeof key !== 'string' || key.length < 16 || key.length > 64) return null;
    const projector = this.q.byKey.get(key);
    return projector && safeEqual(key, projector.device_key) ? projector : null;
  }

  // ── Online status ────────────────────────────────────────────────

  isOnline(projectorId) {
    return (this.connections.get(projectorId)?.size ?? 0) > 0;
  }

  playerConnected(socket, projector) {
    const id = projector.id;
    socket.data.projectorId = id;
    socket.data.tableId = projector.table_id;
    socket.join(projectorRoom(id));
    if (projector.table_id) socket.join(tableRoom(projector.table_id));
    const set = this.connections.get(id) ?? new Set();
    const wasOnline = set.size > 0;
    set.add(socket);
    this.connections.set(id, set);
    this.q.touch.run(nowIso(), id);
    socket.emit('bootstrap', this.bootstrapFor(projector));
    if (!wasOnline) this.live.staff('projector:status', { id, tableId: projector.table_id, online: true });
  }

  playerDisconnected(socket) {
    const id = socket.data.projectorId;
    const set = this.connections.get(id);
    if (!set?.delete(socket)) return;
    this.q.touch.run(nowIso(), id);
    if (set.size === 0) {
      this.connections.delete(id);
      this.live.staff('projector:status', { id, tableId: socket.data.tableId ?? null, online: false });
    }
  }

  // Player -> server 'status' {state, detail}.
  playerStatus(socket, msg) {
    if (!['ready', 'error'].includes(msg?.state)) return;
    socket.data.state = msg.state;
    socket.data.detail = msg.detail ? String(msg.detail).slice(0, 300) : null;
    this.live.staff('projector:status', {
      id: socket.data.projectorId,
      tableId: socket.data.tableId ?? null,
      online: true,
      state: socket.data.state,
      detail: socket.data.detail,
    });
  }

  // ── Scenes ───────────────────────────────────────────────────────

  // The stored scene of a table (no order snapshot).
  storedScene(tableId) {
    const scene = parseJson(this.q.scene.get(tableId)?.scene, null);
    return scene && SCENE_TYPES.includes(scene.type) ? scene : { ...DEFAULT_SCENE };
  }

  storedScenes() {
    const map = new Map();
    for (const row of this.q.scenes.all()) {
      const scene = parseJson(row.scene, null);
      if (scene && SCENE_TYPES.includes(scene.type)) map.set(row.table_id, scene);
    }
    return map;
  }

  // What players render: an 'order' scene carries the live order with it.
  resolve(scene) {
    if (scene.type !== 'order') return scene;
    return { ...scene, order: this.orders.get(scene.orderId) ?? null };
  }

  getScene(tableId) {
    return this.resolve(this.storedScene(tableId));
  }

  validateScene(tableId, input) {
    const type = input?.type;
    if (!SCENE_TYPES.includes(type)) throw badRequest('نوع العرض غير صالح');
    if (type === 'category') {
      const categoryId = int(input.categoryId, 'التصنيف', { required: true, min: 1 });
      const category = this.menu.categoryRow(categoryId);
      if (!category) throw badRequest('التصنيف غير موجود');
      if (!category.is_visible) throw badRequest(`التصنيف "${category.name_ar}" مخفي عن الضيوف. أظهره أولاً`);
      return { type, categoryId };
    }
    if (type === 'dish') {
      const dishId = int(input.dishId, 'الطبق', { required: true, min: 1 });
      const dish = this.menu.dishRow(dishId);
      if (!dish) throw badRequest('الطبق غير موجود');
      if (!dish.is_available) throw badRequest(`"${dish.name_ar}" غير متوفر حالياً ولا يظهر للضيوف`);
      const category = dish.category_id ? this.menu.categoryRow(dish.category_id) : null;
      if (category && !category.is_visible) throw badRequest(`تصنيف "${dish.name_ar}" مخفي عن الضيوف`);
      return { type, dishId };
    }
    if (type === 'order') {
      const orderId = int(input.orderId, 'الطلب', { required: true, min: 1 });
      const order = this.orders.get(orderId);
      if (!order || order.table_id !== tableId) throw badRequest('الطلب غير موجود على هذه الطاولة');
      return { type, orderId };
    }
    return { type };
  }

  // Validates, stores and delivers a scene. -> {scene, delivered:{online, acked}}
  async setScene(tableId, input, user) {
    const scene = { ...this.validateScene(tableId, input), at: nowIso(), by: user?.name ?? null };
    this.q.saveScene.run(tableId, JSON.stringify(scene), scene.at, user?.id ?? null);
    const resolved = this.resolve(scene);
    this.live.staff('scene', { tableId, scene: resolved });
    const delivered = await this.deliver(tableId, resolved);
    return { scene: resolved, delivered };
  }

  // Sends 'scene' to every player of the table and counts the acks.
  async deliver(tableId, scene) {
    const sockets = this.tableSockets(tableId);
    const acks = await Promise.all(
      sockets.map((socket) =>
        socket
          .timeout(this.config.sceneAckTimeoutMs)
          .emitWithAck('scene', { scene })
          .then((reply) => reply?.ok === true)
          .catch(() => false),
      ),
    );
    return { online: sockets.length, acked: acks.filter(Boolean).length };
  }

  // Re-sends a table's scene without waiting for acks (live order updates).
  refresh(tableId) {
    const scene = this.getScene(tableId);
    // Players always get an ack callback for 'scene', even when nobody waits.
    for (const socket of this.tableSockets(tableId)) socket.emit('scene', { scene }, () => {});
    this.live.staff('scene', { tableId, scene });
  }

  // An order changed: tables showing it get the new snapshot.
  orderChanged(order) {
    if (order?.table_id && this.storedScene(order.table_id).type === 'order') {
      const scene = this.storedScene(order.table_id);
      if (scene.orderId === order.id) this.refresh(order.table_id);
    }
  }

  // After a dish/category/order disappears, tables showing it go back to
  // welcome. The scene is stored at once; delivery is not awaited.
  dropScenesWhere(predicate) {
    for (const [tableId, scene] of this.storedScenes()) {
      if (predicate(scene)) this.setScene(tableId, DEFAULT_SCENE, null).catch(() => {});
    }
  }

  tableSockets(tableId) {
    const ids = this.players?.adapter.rooms.get(tableRoom(tableId)) ?? new Set();
    return [...ids].map((id) => this.players.sockets.get(id)).filter(Boolean);
  }

  projectorSockets(projectorId) {
    return [...(this.connections.get(projectorId) ?? [])];
  }

  // ── Projector settings ───────────────────────────────────────────

  projectorView(p) {
    return {
      id: p.id,
      name: p.name,
      rotation: p.rotation,
      layout: p.layout,
      calibration: readCalibration(p.calibration),
    };
  }

  // Calibration / rotation / layout changed.
  pushProjector(projectorId) {
    const p = this.q.projector.get(projectorId);
    if (!p) return 0;
    const { rotation, layout, calibration } = this.projectorView(p);
    const sockets = this.projectorSockets(projectorId);
    for (const socket of sockets) socket.emit('projector', { rotation, layout, calibration });
    return sockets.length;
  }

  testPattern(projectorId, on) {
    const sockets = this.projectorSockets(projectorId);
    for (const socket of sockets) socket.emit('test-pattern', { on: Boolean(on) });
    return sockets.length;
  }

  // The projector moved to another table: switch rooms and start over.
  rebootstrap(projectorId) {
    const p = this.q.projector.get(projectorId);
    if (!p) return;
    for (const socket of this.projectorSockets(projectorId)) {
      if (socket.data.tableId) socket.leave(tableRoom(socket.data.tableId));
      socket.data.tableId = p.table_id;
      if (p.table_id) socket.join(tableRoom(p.table_id));
      socket.emit('bootstrap', this.bootstrapFor(p));
    }
  }

  // Key rotated or projector deleted: its player must re-pair.
  disconnectProjector(projectorId) {
    for (const socket of this.projectorSockets(projectorId)) socket.disconnect(true);
  }

  // ── Broadcasts to every player ───────────────────────────────────

  menuChanged() {
    this.players?.emit('menu:changed', {});
    this.live.staff('menu:changed', {});
  }

  settingsChanged() {
    this.players?.emit('settings:changed', {});
    this.live.staff('settings:changed', {});
  }

  // ── Bootstrap ────────────────────────────────────────────────────

  bootstrapFor(projector) {
    const table = projector.table_id ? this.q.table.get(projector.table_id) : null;
    return {
      projector: this.projectorView(projector),
      table: table ? { id: table.id, number: table.number, area_name: table.area_name ?? null } : null,
      settings: this.settings.all(),
      menu: this.menu.getMenu({ forPlayer: true }),
      scene: table ? this.getScene(table.id) : { ...DEFAULT_SCENE },
    };
  }

  // Staff preview of a table: its first projector, or a neutral default.
  previewBootstrap(tableId) {
    const projector = this.q.firstProjector.get(tableId) ?? {
      id: null,
      name: 'معاينة',
      table_id: tableId,
      rotation: 0,
      layout: 'single',
      calibration: JSON.stringify(defaultCalibration()),
    };
    return this.bootstrapFor({ ...projector, table_id: tableId });
  }
}
