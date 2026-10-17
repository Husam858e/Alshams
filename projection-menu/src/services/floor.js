import { notFound } from '../lib/validate.js';
import { DEFAULT_SCENE } from './projectionService.js';

// Read side of the floor plan: areas with their tables, each table with its
// projectors (online or not), current scene and active order.
export function createFloor({ db, projection, orders }) {
  const q = {
    areas: db.prepare('SELECT * FROM areas ORDER BY sort_order, id'),
    tables: db.prepare('SELECT * FROM restaurant_tables ORDER BY sort_order, number'),
    table: db.prepare('SELECT * FROM restaurant_tables WHERE id = ?'),
    projectors: db.prepare('SELECT id, name, table_id FROM projectors WHERE table_id IS NOT NULL ORDER BY id'),
  };

  const context = () => {
    const projectors = new Map();
    for (const p of q.projectors.all()) {
      const list = projectors.get(p.table_id) ?? [];
      list.push({ id: p.id, name: p.name, online: projection.isOnline(p.id) });
      projectors.set(p.table_id, list);
    }
    return { projectors, scenes: projection.storedScenes(), active: orders.activeByTable() };
  };

  const tableDto = (t, ctx) => ({
    id: t.id,
    number: t.number,
    seats: t.seats,
    status: t.status,
    area_id: t.area_id,
    sort_order: t.sort_order,
    projectors: ctx.projectors.get(t.id) ?? [],
    scene: ctx.scenes.get(t.id) ?? { ...DEFAULT_SCENE },
    activeOrder: ctx.active.get(t.id)?.activeOrder ?? null,
    activeOrdersCount: ctx.active.get(t.id)?.activeCount ?? 0,
  });

  return {
    getFloor() {
      const ctx = context();
      const tables = q.tables.all().map((t) => tableDto(t, ctx));
      const areas = q.areas.all().map((a) => ({
        id: a.id,
        name: a.name,
        sort_order: a.sort_order,
        tables: tables.filter((t) => t.area_id === a.id),
      }));
      const areaIds = new Set(areas.map((a) => a.id));
      return { areas, unassigned: tables.filter((t) => !areaIds.has(t.area_id)) };
    },

    tables() {
      const ctx = context();
      return q.tables.all().map((t) => tableDto(t, ctx));
    },

    table(id) {
      const row = q.table.get(id);
      if (!row) throw notFound('الطاولة غير موجودة');
      return tableDto(row, context());
    },

    tableRow: (id) => q.table.get(id),
  };
}
