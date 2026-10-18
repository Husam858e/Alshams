// Demo backend: menu content, prices (owner only), the media library with
// uploads kept in memory as blob: URLs, and settings / theme (mirrors
// src/routes/menu.js, media.js and settings.js).

import { anyStaff, contentTeam, ownerOnly } from '../roles.js';
import { HttpError, badRequest, bool, conflict, forbidden, has, idList, idParam, int, notFound, num, oneOf, str } from '../validate.js';

const PRICE_FORBIDDEN = 'تعديل الأسعار من صلاحيات المالك';
const MAX_PRICE = 100_000_000;
const KIND_AR = { image: 'الصور', video: 'الفيديو', model3d: 'ملفات ‎.glb' };
// Uploads live in this device's memory: keep them reasonable.
const MAX_UPLOAD_MB = 100;

const FORMATS = {
  '.mp4': { kind: 'video', mime: 'video/mp4' },
  '.webm': { kind: 'video', mime: 'video/webm' },
  '.png': { kind: 'image', mime: 'image/png' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.webp': { kind: 'image', mime: 'image/webp' },
  '.glb': { kind: 'model3d', mime: 'model/gltf-binary' },
};
const latin = (b, from, to) => String.fromCharCode(...b.slice(from, to));
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  'image/webp': (b) => latin(b, 0, 4) === 'RIFF' && latin(b, 8, 12) === 'WEBP',
  'video/mp4': (b) => latin(b, 4, 8) === 'ftyp',
  'video/webm': (b) => [0x1a, 0x45, 0xdf, 0xa3].every((v, i) => b[i] === v),
  'model/gltf-binary': (b) => latin(b, 0, 4) === 'glTF',
};

const PRESETS = ['noir', 'marble', 'garden', 'royal'];
const FONTS = ['Cairo', 'Tajawal'];
const CARD_STYLES = ['glass', 'solid'];
const BACKGROUND_TYPES = ['preset', 'image', 'video'];

export function menuRoutes(route, ctx) {
  const { state: s, log, projection, nowIso, dto, find } = ctx;

  const assetRef = (value, field, kind) => {
    const id = int(value, field, { min: 1 });
    if (!id) return null;
    const asset = find.asset(id);
    if (!asset) throw badRequest(`الملف المختار للحقل "${field}" غير موجود في المكتبة`);
    if (asset.kind !== kind) throw badRequest(`الحقل "${field}" يقبل ${KIND_AR[kind]} فقط`);
    return id;
  };
  const categoryRef = (value) => {
    const id = int(value, 'التصنيف', { min: 1 });
    if (id && !s.categories.some((c) => c.id === id)) throw badRequest('التصنيف المختار غير موجود');
    return id;
  };
  const loadCategory = (id) => {
    const c = s.categories.find((x) => x.id === idParam(id, 'التصنيف'));
    if (!c) throw notFound('التصنيف غير موجود');
    return c;
  };
  const loadDish = (id) => {
    const d = s.dishes.find((x) => x.id === idParam(id, 'الطبق'));
    if (!d) throw notFound('الطبق غير موجود');
    return d;
  };
  const nextOrder = (list) => list.reduce((m, x) => Math.max(m, x.sort_order), -1) + 1;
  const dishesIn = (categoryId) => s.dishes.filter((d) => (d.category_id ?? null) === (categoryId ?? null));

  route('GET', '/menu', anyStaff, () => dto.menu());
  route('GET', '/categories/:id', anyStaff, ({ params }) => dto.category(loadCategory(params.id)));
  route('GET', '/dishes/:id', anyStaff, ({ params }) => dto.dish(loadDish(params.id)));

  // ── Categories ──

  const categoryFields = (b, current = {}) => {
    const pick = (key, read) => (has(b, key) ? read(b[key]) : current[key]);
    return {
      name_ar: pick('name_ar', (v) => str(v, 'الاسم بالعربية', { required: true, max: 60 })),
      name_en: pick('name_en', (v) => str(v, 'الاسم بالإنجليزية', { max: 60 })) ?? null,
      description_ar: pick('description_ar', (v) => str(v, 'الوصف', { max: 300 })) ?? null,
      icon: pick('icon', (v) => str(v, 'الأيقونة', { max: 16 })) ?? null,
      cover_asset_id: pick('cover_asset_id', (v) => assetRef(v, 'صورة الغلاف', 'image')) ?? null,
      is_visible: pick('is_visible', (v) => bool(v, true)) ?? true,
      sort_order: pick('sort_order', (v) => int(v, 'الترتيب', { required: true })),
    };
  };

  route('POST', '/categories', contentTeam, ({ body, user }) => {
    const fields = categoryFields(body);
    if (!fields.name_ar) throw badRequest('الحقل "الاسم بالعربية" مطلوب');
    fields.sort_order ??= nextOrder(s.categories);
    const c = { id: s.nextId('category'), ...fields };
    s.categories.push(c);
    log(user, 'category.create', { name: c.name_ar });
    projection.menuChanged();
    return ctx.created(dto.category(c));
  });

  route('PUT', '/categories/order', contentTeam, ({ body }) => {
    const ids = idList(body.ids, 'الترتيب');
    if (ids.some((id) => !s.categories.some((c) => c.id === id))) throw badRequest('الترتيب يحتوي تصنيفاً غير موجود');
    ids.forEach((id, i) => (s.categories.find((c) => c.id === id).sort_order = i));
    projection.menuChanged();
    return dto.menu();
  });

  route('PATCH', '/categories/:id', contentTeam, ({ params, body }) => {
    const current = loadCategory(params.id);
    const wasVisible = current.is_visible;
    Object.assign(current, categoryFields(body, current));
    projection.menuChanged();
    if (wasVisible && !current.is_visible) {
      const dishIds = new Set(dishesIn(current.id).map((d) => d.id));
      projection.dropScenesWhere((sc) => (sc.type === 'category' && sc.categoryId === current.id) || (sc.type === 'dish' && dishIds.has(sc.dishId)));
    }
    return dto.category(current);
  });

  route('DELETE', '/categories/:id', contentTeam, ({ params, user }) => {
    const current = loadCategory(params.id);
    s.categories.splice(s.categories.indexOf(current), 1);
    for (const d of s.dishes) if (d.category_id === current.id) d.category_id = null;
    log(user, 'category.delete', { name: current.name_ar });
    projection.menuChanged();
    projection.dropScenesWhere((sc) => sc.type === 'category' && sc.categoryId === current.id);
    return { ok: true };
  });

  // ── Dishes ──

  const badges = (value) => {
    const list = typeof value === 'string' ? value.split(/[,،]/) : value;
    if (list == null) return [];
    if (!Array.isArray(list)) throw badRequest('الشارات يجب أن تكون قائمة');
    const clean = [...new Set(list.map((b) => (typeof b === 'string' ? b.trim() : '')).filter(Boolean))];
    if (clean.length > 8) throw badRequest('الحد الأقصى 8 شارات');
    if (clean.some((b) => b.length > 24)) throw badRequest('الشارة يجب ألا تتجاوز 24 حرفاً');
    return clean;
  };

  const dishFields = (b, current = {}) => {
    const pick = (key, read) => (has(b, key) ? read(b[key]) : current[key]);
    return {
      category_id: pick('category_id', categoryRef) ?? null,
      name_ar: pick('name_ar', (v) => str(v, 'الاسم بالعربية', { required: true, max: 80 })),
      name_en: pick('name_en', (v) => str(v, 'الاسم بالإنجليزية', { max: 80 })) ?? null,
      description_ar: pick('description_ar', (v) => str(v, 'الوصف', { max: 500 })) ?? null,
      image_asset_id: pick('image_asset_id', (v) => assetRef(v, 'الصورة', 'image')) ?? null,
      video_asset_id: pick('video_asset_id', (v) => assetRef(v, 'الفيديو', 'video')) ?? null,
      model_asset_id: pick('model_asset_id', (v) => assetRef(v, 'المجسم ثلاثي الأبعاد', 'model3d')) ?? null,
      badges: has(b, 'badges') ? badges(b.badges) : (current.badges ?? []),
      calories: pick('calories', (v) => int(v, 'السعرات', { min: 0, max: 20000 })) ?? null,
      prep_minutes: pick('prep_minutes', (v) => int(v, 'وقت التحضير', { min: 0, max: 600 })) ?? null,
      is_available: pick('is_available', (v) => bool(v, true)) ?? true,
      is_featured: pick('is_featured', (v) => bool(v)) ?? false,
      sort_order: pick('sort_order', (v) => int(v, 'الترتيب', { required: true })),
    };
  };
  const priceOf = (b) => num(b.price, 'السعر', { required: true, min: 0, max: MAX_PRICE });

  route('POST', '/dishes', contentTeam, ({ body, user }) => {
    const fields = dishFields(body);
    if (!fields.name_ar) throw badRequest('الحقل "الاسم بالعربية" مطلوب');
    let price = 0;
    if (has(body, 'price') && body.price !== null && body.price !== '') {
      price = priceOf(body);
      if (user.role !== 'owner' && price !== 0) throw forbidden(PRICE_FORBIDDEN);
    }
    fields.sort_order ??= nextOrder(dishesIn(fields.category_id));
    const d = { id: s.nextId('dish'), ...fields, price, created_at: nowIso(), updated_at: nowIso() };
    s.dishes.push(d);
    log(user, 'dish.create', { name: d.name_ar, price });
    projection.menuChanged();
    return ctx.created(dto.dish(d));
  });

  route('PUT', '/dishes/order', contentTeam, ({ body }) => {
    const categoryId = int(body.category_id, 'التصنيف', { min: 1 });
    if (categoryId && !s.categories.some((c) => c.id === categoryId)) throw notFound('التصنيف غير موجود');
    const ids = idList(body.ids, 'الترتيب');
    const inCategory = new Set(dishesIn(categoryId).map((d) => d.id));
    if (ids.some((id) => !inCategory.has(id))) throw badRequest('الترتيب يحتوي طبقاً من تصنيف آخر');
    ids.forEach((id, i) => (s.dishes.find((d) => d.id === id).sort_order = i));
    projection.menuChanged();
    return dto.menu();
  });

  route('PATCH', '/dishes/:id', contentTeam, ({ params, body, user }) => {
    const current = loadDish(params.id);
    const fields = dishFields(body, current);
    let price = current.price;
    if (has(body, 'price')) {
      const next = priceOf(body);
      if (next !== current.price) {
        if (user.role !== 'owner') throw forbidden(PRICE_FORBIDDEN);
        price = next;
      }
    }
    if (fields.category_id !== current.category_id && !has(body, 'sort_order')) fields.sort_order = nextOrder(dishesIn(fields.category_id));
    if (price !== current.price) log(user, 'dish.price', { dishId: current.id, name: fields.name_ar, from: current.price, to: price });
    // Unavailable, or moved into a hidden category: tables showing it go back to welcome.
    const guestsSee = (d) => Boolean(d.is_available) && (!d.category_id || Boolean(s.categories.find((c) => c.id === d.category_id)?.is_visible));
    const wasShown = guestsSee(current);
    Object.assign(current, fields, { price, updated_at: nowIso() });
    projection.menuChanged();
    if (wasShown && !guestsSee(current)) projection.dropScenesWhere((sc) => sc.type === 'dish' && sc.dishId === current.id);
    return dto.dish(current);
  });

  route('DELETE', '/dishes/:id', contentTeam, ({ params, user }) => {
    const current = loadDish(params.id);
    s.dishes.splice(s.dishes.indexOf(current), 1);
    log(user, 'dish.delete', { name: current.name_ar });
    projection.menuChanged();
    projection.dropScenesWhere((sc) => sc.type === 'dish' && sc.dishId === current.id);
    return { ok: true };
  });

  // ── Media library ──

  const usageMap = () => {
    const map = new Map();
    const add = (assetId, use) => {
      if (!assetId) return;
      map.set(assetId, [...(map.get(assetId) ?? []), use]);
    };
    for (const d of s.dishes) {
      for (const col of ['image_asset_id', 'video_asset_id', 'model_asset_id']) add(d[col], { type: 'dish', id: d.id, name: d.name_ar, label: `طبق "${d.name_ar}"` });
    }
    for (const c of s.categories) add(c.cover_asset_id, { type: 'category', id: c.id, name: c.name_ar, label: `تصنيف "${c.name_ar}"` });
    const { general, theme } = s.settings;
    add(general.logoAssetId, { type: 'logo', name: 'شعار المطعم', label: 'شعار المطعم' });
    if (theme.background?.type !== 'preset') add(theme.background?.assetId, { type: 'theme', name: 'خلفية العرض', label: 'خلفية تصميم العرض' });
    return map;
  };
  const mediaDto = (a, usage = usageMap()) => {
    const { url, ...row } = a;
    return { ...row, url, uploaded_by_name: find.user(a.uploaded_by)?.name ?? null, used_by: usage.get(a.id) ?? [] };
  };
  const loadAsset = (id) => {
    const a = find.asset(idParam(id, 'الملف'));
    if (!a) throw notFound('الملف غير موجود');
    return a;
  };

  route('GET', '/media', contentTeam, () => {
    const usage = usageMap();
    return [...s.assets].sort((a, b) => b.id - a.id).map((a) => mediaDto(a, usage));
  });

  // multipart 'file' (+ optional 'title'), one file per request like the server.
  route('POST', '/media', contentTeam, async ({ file, fields, user }) => {
    if (!file) throw badRequest('لم يتم إرفاق ملف (الحقل file)');
    const name = String(file.name || 'file');
    const ext = (/\.[^.]+$/.exec(name)?.[0] ?? '').toLowerCase();
    const format = FORMATS[ext];
    if (!format) throw badRequest(`نوع الملف غير مدعوم. الأنواع المسموحة: ${Object.keys(FORMATS).join(' ')}`);
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new HttpError(413, `حجم الملف أكبر من ${MAX_UPLOAD_MB} ميغابايت`);
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (head.length < 12 || !SIGNATURES[format.mime](head)) {
      throw badRequest('محتوى الملف لا يطابق امتداده (قد يكون الملف تالفاً أو بصيغة أخرى)');
    }
    const blob = file.type === format.mime ? file : file.slice(0, file.size, format.mime);
    const info = format.kind === 'model3d' ? {} : ((await ctx.probe?.(blob, format.kind)) ?? {});
    const id = s.nextId('asset');
    const asset = {
      id,
      kind: format.kind,
      title: str(fields?.title, 'العنوان', { max: 120 }) ?? name.replace(/\.[^.]+$/, '').slice(0, 120),
      original_name: name.slice(0, 255),
      file_name: `upload-${id}${ext}`,
      url: URL.createObjectURL(blob),
      mime_type: format.mime,
      size_bytes: file.size,
      sha256: null,
      width: info.width ?? null,
      height: info.height ?? null,
      duration_ms: format.kind === 'video' ? (info.duration_ms ?? null) : null,
      uploaded_by: user.id,
      created_at: nowIso(),
    };
    s.assets.push(asset);
    log(user, 'media.upload', { title: name, kind: format.kind });
    return ctx.created(mediaDto(asset));
  });

  route('PATCH', '/media/:id', contentTeam, ({ params, body }) => {
    const a = loadAsset(params.id);
    a.title = str(body.title, 'العنوان', { required: true, max: 120 });
    return mediaDto(a);
  });

  route('DELETE', '/media/:id', contentTeam, ({ params, user }) => {
    const a = loadAsset(params.id);
    const users = usageMap().get(a.id) ?? [];
    if (users.length) throw conflict(`لا يمكن حذف الملف لأنه مستخدم في: ${users.map((u) => u.label).join('، ')}`);
    s.assets.splice(s.assets.indexOf(a), 1);
    if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url);
    log(user, 'media.delete', { title: a.title });
    return { ok: true };
  });

  // ── Settings ──

  const assetOfKind = (id, kinds, field) => {
    const asset = find.asset(id);
    if (!asset) throw badRequest(`الملف المختار للحقل "${field}" غير موجود في المكتبة`);
    if (!kinds.includes(asset.kind)) throw badRequest(`نوع الملف غير مناسب للحقل "${field}"`);
    return asset;
  };

  route('GET', '/settings', anyStaff, () => dto.settings());

  route('PUT', '/settings/general', ownerOnly, ({ body: patch, user }) => {
    const next = structuredClone(s.settings.general);
    const text = (key, label, opts) => {
      if (has(patch, key)) next[key] = str(patch[key], label, opts) ?? '';
    };
    text('restaurantName', 'اسم المطعم', { required: true, max: 80 });
    text('restaurantNameEn', 'الاسم بالإنجليزية', { max: 80 });
    text('currency', 'العملة', { required: true, max: 12 });
    text('welcomeTitle', 'عنوان الترحيب', { max: 80 });
    text('welcomeText', 'نص الترحيب', { max: 240 });
    text('footerText', 'نص التذييل', { max: 240 });
    if (has(patch, 'logoAssetId')) {
      const id = int(patch.logoAssetId, 'الشعار', { min: 1 });
      if (id) assetOfKind(id, ['image'], 'الشعار');
      next.logoAssetId = id;
    }
    s.settings.general = next;
    log(user, 'settings.general', { name: next.restaurantName });
    projection.settingsChanged();
    return dto.settings();
  });

  route('PUT', '/settings/theme', contentTeam, ({ body: patch, user }) => {
    const next = structuredClone(s.settings.theme);
    if (has(patch, 'preset')) next.preset = oneOf(patch.preset, 'النمط', PRESETS, { required: true });
    if (has(patch, 'accent')) {
      if (typeof patch.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(patch.accent)) throw badRequest('لون التمييز يجب أن يكون بصيغة ‎#RRGGBB');
      next.accent = patch.accent.toLowerCase();
    }
    if (has(patch, 'font')) next.font = oneOf(patch.font, 'الخط', FONTS, { required: true });
    if (has(patch, 'cardStyle')) next.cardStyle = oneOf(patch.cardStyle, 'شكل البطاقات', CARD_STYLES, { required: true });
    for (const key of ['showPrices', 'showCalories', 'showDescriptions']) if (has(patch, key)) next[key] = bool(patch[key]);
    if (has(patch, 'pageSeconds')) next.pageSeconds = int(patch.pageSeconds, 'مدة الصفحة', { required: true, min: 4, max: 120 });
    if (has(patch, 'idleSeconds')) next.idleSeconds = int(patch.idleSeconds, 'مدة الخمول', { required: true, min: 10, max: 3600 });
    if (has(patch, 'background')) {
      const bg = patch.background;
      if (!bg || typeof bg !== 'object') throw badRequest('خلفية غير صالحة');
      const type = oneOf(bg.type, 'نوع الخلفية', BACKGROUND_TYPES, { required: true });
      if (type === 'preset') next.background = { type, assetId: null };
      else {
        const assetId = int(bg.assetId, 'ملف الخلفية', { required: true, min: 1 });
        assetOfKind(assetId, [type], 'ملف الخلفية');
        next.background = { type, assetId };
      }
    }
    s.settings.theme = next;
    log(user, 'settings.theme', { name: next.preset });
    projection.settingsChanged();
    return dto.settings();
  });
}
