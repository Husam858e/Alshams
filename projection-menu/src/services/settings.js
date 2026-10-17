import { parseJson } from '../db/index.js';
import { badRequest, bool, has, int, oneOf, str } from '../lib/validate.js';

export const DEFAULT_GENERAL = Object.freeze({
  restaurantName: 'مطعم الشمس',
  restaurantNameEn: 'Alshams',
  logoAssetId: null,
  currency: 'د.ع',
  welcomeTitle: 'أهلاً وسهلاً',
  welcomeText: 'تفضّلوا، المنيو أمامكم على الطاولة',
  footerText: '',
});

export const DEFAULT_THEME = Object.freeze({
  preset: 'noir',
  accent: '#d4a056',
  background: Object.freeze({ type: 'preset', assetId: null }),
  font: 'Cairo',
  cardStyle: 'glass',
  showPrices: true,
  showCalories: false,
  showDescriptions: true,
  pageSeconds: 12,
  idleSeconds: 90,
});

const PRESETS = ['noir', 'marble', 'garden', 'royal'];
const FONTS = ['Cairo', 'Tajawal'];
const CARD_STYLES = ['glass', 'solid'];
const BACKGROUND_TYPES = ['preset', 'image', 'video'];

export const mediaUrl = (fileName) => (fileName ? `/media/${fileName}` : null);

// Restaurant-wide settings, stored as JSON in the settings table under the
// keys 'general' and 'theme'. Reads always merge over the defaults so new
// fields appear without a migration.
export function createSettings(db) {
  const q = {
    get: db.prepare('SELECT value FROM settings WHERE key = ?'),
    put: db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
    asset: db.prepare('SELECT id, kind, file_name FROM media_assets WHERE id = ?'),
  };

  const read = (key, defaults) => {
    const stored = parseJson(q.get.get(key)?.value, {});
    return { ...structuredClone(defaults), ...(stored && typeof stored === 'object' ? stored : {}) };
  };

  const assetOfKind = (id, kinds, field) => {
    const asset = q.asset.get(id);
    if (!asset) throw badRequest(`الملف المختار للحقل "${field}" غير موجود في المكتبة`);
    if (!kinds.includes(asset.kind)) throw badRequest(`نوع الملف غير مناسب للحقل "${field}"`);
    return asset;
  };

  const assetUrl = (id) => (id ? mediaUrl(q.asset.get(id)?.file_name) : null);

  return {
    general: () => read('general', DEFAULT_GENERAL),
    theme: () => read('theme', DEFAULT_THEME),

    // {general, theme, logo_url, background_url} — what every UI needs.
    all() {
      const general = this.general();
      const theme = this.theme();
      const bgId = theme.background?.type === 'preset' ? null : theme.background?.assetId;
      return { general, theme, logo_url: assetUrl(general.logoAssetId), background_url: assetUrl(bgId) };
    },

    ensureDefaults() {
      for (const [key, value] of [['general', DEFAULT_GENERAL], ['theme', DEFAULT_THEME]]) {
        if (!q.get.get(key)) q.put.run(key, JSON.stringify(value));
      }
    },

    // Partial update: only the keys present in `patch` change.
    updateGeneral(patch = {}) {
      const next = this.general();
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
      q.put.run('general', JSON.stringify(next));
      return next;
    },

    updateTheme(patch = {}) {
      const next = this.theme();
      if (has(patch, 'preset')) next.preset = oneOf(patch.preset, 'النمط', PRESETS, { required: true });
      if (has(patch, 'accent')) {
        if (typeof patch.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(patch.accent)) {
          throw badRequest('لون التمييز يجب أن يكون بصيغة ‎#RRGGBB');
        }
        next.accent = patch.accent.toLowerCase();
      }
      if (has(patch, 'font')) next.font = oneOf(patch.font, 'الخط', FONTS, { required: true });
      if (has(patch, 'cardStyle')) next.cardStyle = oneOf(patch.cardStyle, 'شكل البطاقات', CARD_STYLES, { required: true });
      for (const key of ['showPrices', 'showCalories', 'showDescriptions']) {
        if (has(patch, key)) next[key] = bool(patch[key]);
      }
      if (has(patch, 'pageSeconds')) next.pageSeconds = int(patch.pageSeconds, 'مدة الصفحة', { required: true, min: 4, max: 120 });
      if (has(patch, 'idleSeconds')) next.idleSeconds = int(patch.idleSeconds, 'مدة الخمول', { required: true, min: 10, max: 3600 });
      if (has(patch, 'background')) next.background = validateBackground(patch.background, assetOfKind);
      q.put.run('theme', JSON.stringify(next));
      return next;
    },
  };
}

function validateBackground(bg, assetOfKind) {
  if (!bg || typeof bg !== 'object') throw badRequest('خلفية غير صالحة');
  const type = oneOf(bg.type, 'نوع الخلفية', BACKGROUND_TYPES, { required: true });
  if (type === 'preset') return { type, assetId: null };
  const assetId = int(bg.assetId, 'ملف الخلفية', { required: true, min: 1 });
  assetOfKind(assetId, [type], 'ملف الخلفية');
  return { type, assetId };
}
