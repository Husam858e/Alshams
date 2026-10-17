// Arabic labels and visual tokens for roles, statuses and scenes.

export const ROLES = {
  owner: { label: 'مالك', hint: 'كل الصلاحيات', icon: 'crown' },
  designer: { label: 'مصمم', hint: 'المحتوى والتصميم والمعايرة', icon: 'palette' },
  waiter: { label: 'ويتر', hint: 'الطاولات والطلبات', icon: 'tray' },
};

export const TABLE_STATUS = {
  free: { label: 'متاحة', color: 'var(--c-free)' },
  occupied: { label: 'مشغولة', color: 'var(--c-occupied)' },
  reserved: { label: 'محجوزة', color: 'var(--c-reserved)' },
};

export const ORDER_STATUS = {
  open: { label: 'جديد', color: 'var(--c-open)' },
  preparing: { label: 'قيد التحضير', color: 'var(--c-preparing)' },
  served: { label: 'تم التقديم', color: 'var(--c-served)' },
  paid: { label: 'مدفوع', color: 'var(--c-paid)' },
  cancelled: { label: 'ملغى', color: 'var(--c-cancelled)' },
};

// Forward moves offered as buttons (cancel is offered separately).
export const ORDER_NEXT = {
  open: [
    { status: 'preparing', label: 'بدء التحضير', icon: 'flame' },
    { status: 'served', label: 'تم التقديم', icon: 'check' },
  ],
  preparing: [{ status: 'served', label: 'تم التقديم', icon: 'check' }],
  served: [{ status: 'paid', label: 'تم الدفع', icon: 'cash' }],
  paid: [],
  cancelled: [],
};
export const ORDER_EDITABLE = ['open', 'preparing'];
export const ORDER_CANCELLABLE = ['open', 'preparing'];

export const SCENES = {
  welcome: { label: 'ترحيب', icon: 'sparkles' },
  menu: { label: 'المنيو كامل', icon: 'grid' },
  category: { label: 'تصنيف', icon: 'layers' },
  dish: { label: 'طبق', icon: 'utensils' },
  order: { label: 'عرض الطلب', icon: 'receipt' },
  off: { label: 'إطفاء', icon: 'moon' },
};

// "المنيو كامل", "تصنيف: مشاوي", "طبق: كباب"...
export function sceneLabel(scene, menu) {
  if (!scene) return SCENES.welcome.label;
  const base = SCENES[scene.type]?.label ?? scene.type;
  if (scene.type === 'category') {
    const cat = menu?.categories.find((c) => c.id === scene.categoryId);
    return cat ? cat.name_ar : base;
  }
  if (scene.type === 'dish') {
    const dish = menu && [...menu.categories.flatMap((c) => c.dishes), ...menu.uncategorized].find((d) => d.id === scene.dishId);
    return dish ? dish.name_ar : base;
  }
  if (scene.type === 'order') return scene.orderId ? `الطلب #${scene.orderId}` : base;
  return base;
}

export const MEDIA_KIND = {
  image: { label: 'صورة', plural: 'صور', icon: 'image' },
  video: { label: 'فيديو', plural: 'فيديو', icon: 'video' },
  model3d: { label: 'مجسم 3D', plural: 'مجسمات 3D', icon: 'cube' },
};

export const BADGE_SUGGESTIONS = ['جديد', 'الأكثر طلباً', 'حار', 'نباتي', 'صحي', 'توصية الشيف', 'للمشاركة', 'خالٍ من الغلوتين'];

export const THEME_PRESETS = {
  noir: { label: 'نوار', hint: 'أسود فاخر بلمسة ذهبية', swatch: ['#050505', '#16130f', '#d4a056'] },
  marble: { label: 'رخام', hint: 'عروق رخام داكن هادئة', swatch: ['#0d0d0f', '#2a2a2e', '#e9e4da'] },
  garden: { label: 'حديقة', hint: 'أخضر عميق وأوراق ناعمة', swatch: ['#06110c', '#13291d', '#9fc38a'] },
  royal: { label: 'ملكي', hint: 'أزرق ليلي مع زخارف', swatch: ['#070a16', '#151c3a', '#c9a45c'] },
};

export const ACCENTS = ['#d4a056', '#e8c07a', '#c98a5b', '#b9a37e', '#9fc38a', '#7fb7c9', '#c97a7a', '#b48ed6', '#f2efe8'];
