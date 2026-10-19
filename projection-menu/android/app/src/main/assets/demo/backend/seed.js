// The demo restaurant at the moment the demo starts: the sample content
// (demo/data.js, built from sample-content/) as `npm run seed` loads it, plus
// a lived-in evening: three weeks of paid orders for the reports, a few
// tables with orders in progress and scenes on their projectors.

const DAY_MS = 24 * 3600 * 1000;
const MIN_MS = 60 * 1000;

// Small deterministic PRNG: the same demo every time it opens.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_CALIBRATION = () => ({ corners: [[0, 0], [1, 0], [1, 1], [0, 1]] });

export function seedState({ sample, media, now }) {
  const t0 = now();
  const iso = (ms) => new Date(ms).toISOString();
  const s = {
    seq: {},
    users: [],
    areas: [],
    tables: [],
    projectors: [],
    assets: [],
    categories: [],
    dishes: [],
    orders: [],
    activity: [],
    scenes: new Map(), // tableId -> scene
    pairing: new Map(), // code -> {table_id, projector_name, created_by, expires_at}
    settings: { general: structuredClone(sample.general), theme: structuredClone(sample.theme) },
  };
  const nextId = (kind) => (s.seq[kind] = (s.seq[kind] ?? 0) + 1);
  s.nextId = nextId;

  // ── Users ──
  const lastLogin = { owner: t0 - DAY_MS, designer: t0 - 2 * DAY_MS, waiter: t0 - 3 * 3600 * 1000 };
  for (const u of sample.users) {
    s.users.push({
      id: nextId('user'),
      name: u.name,
      username: u.username,
      password: u.password, // demo only: the published sample passwords
      role: u.role,
      is_active: true,
      created_at: iso(t0 - 30 * DAY_MS),
      last_login_at: iso(lastLogin[u.role]),
    });
  }
  const owner = s.users.find((u) => u.role === 'owner');
  const designer = s.users.find((u) => u.role === 'designer');
  const waiters = s.users.filter((u) => u.role === 'waiter');

  // ── Media: one library entry per bundled file, like the seed's upload ──
  const assetIds = new Map();
  const asset = (file, title) => {
    if (!file) return null;
    if (assetIds.has(file)) return assetIds.get(file);
    const info = media[file];
    if (!info) throw new Error(`demo data: no media facts for ${file}`);
    const id = nextId('asset');
    s.assets.push({
      id,
      kind: info.kind,
      title,
      original_name: info.original_name,
      file_name: file,
      url: `/media/${file}`,
      mime_type: info.mime_type,
      size_bytes: info.size_bytes,
      sha256: null,
      width: info.width,
      height: info.height,
      duration_ms: info.duration_ms,
      uploaded_by: owner?.id ?? null,
      created_at: iso(t0 - 21 * DAY_MS + id * MIN_MS),
    });
    assetIds.set(file, id);
    return id;
  };

  // ── Menu ──
  for (const [ci, c] of sample.categories.entries()) {
    const categoryId = nextId('category');
    s.categories.push({
      id: categoryId,
      name_ar: c.name_ar,
      name_en: c.name_en ?? null,
      description_ar: c.description_ar ?? null,
      icon: c.icon ?? null,
      cover_asset_id: asset(c.cover, `غلاف ${c.name_ar}`),
      sort_order: ci,
      is_visible: true,
    });
    for (const [di, d] of c.dishes.entries()) {
      s.dishes.push({
        id: nextId('dish'),
        category_id: categoryId,
        name_ar: d.name_ar,
        name_en: d.name_en ?? null,
        description_ar: d.description_ar ?? null,
        price: d.price,
        image_asset_id: asset(d.image, d.name_ar),
        video_asset_id: asset(d.video, `${d.name_ar} (فيديو)`),
        model_asset_id: asset(d.model, `${d.name_ar} (مجسم)`),
        badges: [...(d.badges ?? [])],
        calories: d.calories ?? null,
        prep_minutes: d.prep_minutes ?? null,
        is_available: true,
        is_featured: Boolean(d.is_featured),
        sort_order: di,
        created_at: iso(t0 - 21 * DAY_MS),
        updated_at: iso(t0 - 21 * DAY_MS),
      });
    }
  }

  // ── Floor: sections, tables, one projector per table (all switched on) ──
  for (const [ai, a] of sample.areas.entries()) {
    const areaId = nextId('area');
    s.areas.push({ id: areaId, name: a.name, sort_order: ai });
    for (const [ti, t] of a.tables.entries()) {
      const tableId = nextId('table');
      s.tables.push({ id: tableId, number: t.number, area_id: areaId, seats: t.seats ?? 4, status: 'free', sort_order: ti });
      s.projectors.push({
        id: nextId('projector'),
        table_id: tableId,
        name: `جهاز عرض طاولة ${t.number}`,
        device_key: `demo-table-${t.number}`,
        calibration: DEFAULT_CALIBRATION(),
        rotation: 0,
        // The long VIP table seats guests on both sides: two copies of the menu.
        layout: (t.seats ?? 4) >= 10 ? 'dual' : 'single',
        pjlink_host: null,
        pjlink_port: 4352,
        pjlink_password: null,
        power: 'on',
        online: true,
        last_seen_at: iso(t0),
        created_at: iso(t0 - 30 * DAY_MS),
      });
    }
  }

  // ── Orders ──
  const random = mulberry32(2026);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const dishes = s.dishes;
  const weightOf = (d) => (d.is_featured ? 3 : 1) * (d.price >= 20000 ? 0.7 : 1);
  const weighted = dishes.flatMap((d) => Array(Math.round(weightOf(d) * 2)).fill(d));
  const drinks = dishes.filter((d) => d.category_id === s.categories[s.categories.length - 1]?.id);

  const addOrder = ({ table, waiter, status, createdMs, lines, notes = null, updatedMs = createdMs }) => {
    const order = {
      id: nextId('order'),
      table_id: table.id,
      table_number: table.number,
      waiter_id: waiter?.id ?? null,
      status,
      notes,
      total: 0,
      created_at: iso(createdMs),
      updated_at: iso(updatedMs),
      items: [],
    };
    for (const [dish, quantity, itemNotes = null] of lines) {
      order.items.push({ id: nextId('item'), dish_id: dish.id, dish_name: dish.name_ar, quantity, unit_price: dish.price, notes: itemNotes });
    }
    order.total = order.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    s.orders.push(order);
    return order;
  };

  // Three weeks of service (12:00-23:30), busier on the weekend (Thu-Sat).
  const today = new Date(t0);
  today.setHours(0, 0, 0, 0);
  const staff = [...waiters, ...waiters, owner].filter(Boolean);
  for (let back = 20; back >= 0; back--) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    const weekend = [4, 5, 6].includes(day.getDay());
    const count = 14 + (weekend ? 9 : 0) + Math.floor(random() * 8);
    const opening = day.getTime() + 12 * 3600 * 1000;
    const times = Array.from({ length: count }, () => opening + Math.floor(random() * 690) * MIN_MS).sort((a, b) => a - b);
    for (const createdMs of times) {
      if (createdMs > t0 - 75 * MIN_MS) continue; // only finished meals
      const lines = new Map();
      const n = 1 + Math.floor(random() * 3);
      for (let i = 0; i < n; i++) {
        const dish = pick(weighted);
        lines.set(dish, Math.min(4, (lines.get(dish) ?? 0) + 1 + (random() < 0.3 ? 1 : 0)));
      }
      if (random() < 0.6 && drinks.length) {
        const drink = pick(drinks);
        lines.set(drink, (lines.get(drink) ?? 0) + 1 + Math.floor(random() * 3));
      }
      addOrder({
        table: pick(s.tables),
        waiter: pick(staff),
        status: random() < 0.04 ? 'cancelled' : 'paid',
        createdMs,
        updatedMs: createdMs + (40 + Math.floor(random() * 50)) * MIN_MS,
        lines: [...lines.entries()],
      });
    }
  }

  // Tonight: four tables eating, one reserved, scenes on their projectors.
  const table = (n) => s.tables.find((t) => t.number === n);
  const dish = (name) => dishes.find((d) => d.name_ar === name) ?? dishes[0];
  const category = (name) => s.categories.find((c) => c.name_ar === name) ?? s.categories[0];
  const [ali, hassan] = waiters;
  const live = [
    { n: 2, waiter: ali, status: 'preparing', ago: 18, lines: [[dish('مشاوي مشكلة'), 1], [dish('حمص بالطحينة'), 1], [dish('ليمون بالنعناع'), 2]], scene: (o) => ({ type: 'order', orderId: o.id }) },
    { n: 5, waiter: hassan, status: 'open', ago: 6, lines: [[dish('بيتزا مارغريتا'), 2], [dish('بيتزا ببروني'), 1, 'بدون فلفل حار'], [dish('عصير برتقال طازج'), 3]], scene: () => ({ type: 'menu' }) },
    { n: 8, waiter: ali, status: 'served', ago: 46, lines: [[dish('كباب عراقي'), 2], [dish('سلطة الشيف'), 1], [dish('شاي بالأعشاب'), 2]], scene: () => ({ type: 'category', categoryId: category('حلويات').id }) },
    { n: 11, waiter: hassan, status: 'preparing', ago: 24, lines: [[dish('ستيك لحم مع بطاطا'), 2], [dish('تيراميسو'), 2], [dish('كابتشينو'), 2]], scene: () => ({ type: 'dish', dishId: dish('تيراميسو').id }) },
  ];
  for (const entry of live) {
    const t = table(entry.n);
    if (!t) continue;
    const createdMs = t0 - entry.ago * MIN_MS;
    const order = addOrder({ table: t, waiter: entry.waiter, status: entry.status, createdMs, updatedMs: createdMs + 4 * MIN_MS, lines: entry.lines });
    t.status = 'occupied';
    s.scenes.set(t.id, { ...entry.scene(order), at: iso(createdMs + 5 * MIN_MS), by: entry.waiter?.name ?? null });
  }
  if (table(4)) table(4).status = 'reserved';

  // ── Activity log: a few recent entries ──
  const log = (user, action, details, ms) => {
    s.activity.push({ id: nextId('activity'), user_id: user?.id ?? null, action, details, created_at: iso(ms) });
  };
  const fourCheese = dish('بيتزا أربع أجبان');
  log(owner, 'dish.price', { dishId: fourCheese.id, name: fourCheese.name_ar, from: fourCheese.price - 1000, to: fourCheese.price }, t0 - 3 * DAY_MS);
  log(designer, 'media.upload', { title: 'mixed-grill.webm', kind: 'video' }, t0 - 2 * DAY_MS - 3 * 3600 * 1000);
  log(designer, 'settings.theme', { name: s.settings.theme.preset }, t0 - 2 * DAY_MS);
  log(owner, 'auth.login', { username: owner?.username }, t0 - DAY_MS);
  for (const w of waiters) log(w, 'auth.login', { username: w.username }, t0 - 3 * 3600 * 1000);
  const tableEight = s.orders.find((o) => o.table_number === 8 && o.status === 'served');
  if (tableEight) {
    log(ali, 'order.status', { orderId: tableEight.id, tableNumber: 8, from: 'preparing', to: 'served', total: tableEight.total }, t0 - 20 * MIN_MS);
  }

  return s;
}
