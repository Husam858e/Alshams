import { parseJson } from '../db/index.js';
import { notFound } from '../lib/validate.js';
import { mediaUrl } from './settings.js';

// Read side of the menu: categories and dishes as the UIs and players get them
// (JSON columns parsed, 0/1 flags as booleans, media ids resolved to URLs).
export function createMenu(db) {
  const q = {
    categories: db.prepare('SELECT * FROM categories ORDER BY sort_order, id'),
    dishes: db.prepare('SELECT * FROM dishes ORDER BY sort_order, id'),
    category: db.prepare('SELECT * FROM categories WHERE id = ?'),
    dish: db.prepare('SELECT * FROM dishes WHERE id = ?'),
    files: db.prepare('SELECT id, file_name FROM media_assets'),
  };

  const fileMap = () => new Map(q.files.all().map((r) => [r.id, r.file_name]));

  const dishDto = (d, files = fileMap()) => ({
    ...d,
    badges: parseBadges(d.badges),
    is_available: Boolean(d.is_available),
    is_featured: Boolean(d.is_featured),
    image_url: mediaUrl(files.get(d.image_asset_id)),
    video_url: mediaUrl(files.get(d.video_asset_id)),
    model_url: mediaUrl(files.get(d.model_asset_id)),
  });

  const categoryDto = (c, files = fileMap()) => ({
    ...c,
    is_visible: Boolean(c.is_visible),
    cover_url: mediaUrl(files.get(c.cover_asset_id)),
  });

  return {
    dishDto,
    categoryDto,

    // forPlayer: only visible categories and available dishes (what guests see).
    getMenu({ forPlayer = false } = {}) {
      const files = fileMap();
      const dishes = q.dishes.all().filter((d) => !forPlayer || d.is_available).map((d) => dishDto(d, files));
      const categories = q.categories
        .all()
        .filter((c) => !forPlayer || c.is_visible)
        .map((c) => ({ ...categoryDto(c, files), dishes: dishes.filter((d) => d.category_id === c.id) }));
      return { categories, uncategorized: dishes.filter((d) => d.category_id == null) };
    },

    dish(id) {
      const row = q.dish.get(id);
      if (!row) throw notFound('الطبق غير موجود');
      return dishDto(row);
    },

    category(id) {
      const row = q.category.get(id);
      if (!row) throw notFound('التصنيف غير موجود');
      return categoryDto(row);
    },

    dishRow: (id) => q.dish.get(id),
    categoryRow: (id) => q.category.get(id),
  };
}

export function parseBadges(text) {
  const list = parseJson(text, []);
  return Array.isArray(list) ? list.filter((b) => typeof b === 'string') : [];
}
