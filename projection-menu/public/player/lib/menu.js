// Read-only helpers over the menu in the PlayerBootstrap.

const OTHER = { id: 'other', name_ar: 'أطباق أخرى', name_en: 'More', description_ar: '', icon: '✦', cover_url: null };

const isShown = (dish) => dish && dish.is_available !== 0 && dish.is_available !== false;
const isVisible = (cat) => cat && cat.is_visible !== 0 && cat.is_visible !== false;

const cache = new WeakMap();

// Visible categories with their available dishes; dishes without a category
// are grouped at the end so nothing on the menu is unreachable.
export function menuCategories(menu) {
  if (!menu || typeof menu !== 'object') return [];
  if (cache.has(menu)) return cache.get(menu);
  const list = (Array.isArray(menu.categories) ? menu.categories : [])
    .filter(isVisible)
    .map((cat) => ({ ...cat, dishes: (Array.isArray(cat.dishes) ? cat.dishes : []).filter(isShown) }));
  const rest = (Array.isArray(menu.uncategorized) ? menu.uncategorized : []).filter(isShown);
  if (rest.length) list.push({ ...OTHER, dishes: rest });
  cache.set(menu, list);
  return list;
}

export function findCategory(menu, id) {
  return menuCategories(menu).find((cat) => String(cat.id) === String(id)) ?? null;
}

export function findDish(menu, id) {
  for (const category of menuCategories(menu)) {
    const dish = category.dishes.find((d) => String(d.id) === String(id));
    if (dish) return { dish, category };
  }
  return null;
}

export function allDishes(menu) {
  return menuCategories(menu).flatMap((cat) => cat.dishes);
}

// Dishes for the welcome showcase: featured first, else any with a photo.
export function featuredDishes(menu, limit = 8) {
  const dishes = allDishes(menu);
  const featured = dishes.filter((d) => d.is_featured && d.image_url);
  return (featured.length ? featured : dishes.filter((d) => d.image_url)).slice(0, limit);
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Pages of the full-menu scene: every non-empty category, split into pages.
export function menuPages(menu, perPage) {
  return menuCategories(menu).flatMap((category) => {
    const pages = chunk(category.dishes, perPage);
    return pages.map((dishes, index) => ({ category, dishes, index, count: pages.length }));
  });
}
