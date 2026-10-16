// Data of the offline demo bundled in the app (no server). It uses the same
// shapes as the real API (/api/tablet/menu, orders) and cue protocol, so the
// unchanged tablet.js and player.js run on top of it.
// test/android-assets.test.js keeps it in line with the server code.

export const CHANNEL = 'projection-demo'; // BroadcastChannel between the demo frames

export const TABLE = { id: 1, code: 'DEMO', key: 'demo', name: 'طاولة العرض التجريبي', seats: 4 };
export const PROJECTOR = { id: 1, key: 'demo', name: 'جهاز العرض التجريبي' };
export const CURRENCY = 'د.ع';

// Same as defaultZones(4) in src/lib/zones.js: seats 1–2 on the far side
// (content rotated 180°), seats 3–4 on the near side.
export const ZONES = [
  { seat: 1, x: 0, y: 0, w: 0.5, h: 0.5, rotate: 180 },
  { seat: 2, x: 0.5, y: 0, w: 0.5, h: 0.5, rotate: 180 },
  { seat: 3, x: 0, y: 0.5, w: 0.5, h: 0.5, rotate: 0 },
  { seat: 4, x: 0.5, y: 0.5, w: 0.5, h: 0.5, rotate: 0 },
];

export const FULL_ZONE = { seat: null, x: 0, y: 0, w: 1, h: 1, rotate: 0 };

// What the server sends a player when it connects.
export const CONFIG_CUE = {
  cueId: 'boot',
  action: 'config',
  projectorName: PROJECTOR.name,
  calibration: { corners: [[0, 0], [1, 0], [1, 1], [0, 1]] },
  zones: ZONES,
  idle: { kind: 'video', url: '/media/demo-ambient.webm' },
};

// The kitchen in the demo: an order is "preparing" after a few seconds and
// "served" a little later (that plays the served ripple, then back to idle).
export const KITCHEN = { preparingAfterMs: 6000, servedAfterMs: 15000 };

// Like dish_projections on the server: what plays for each phase.
const WAITING = { media: { kind: 'video', url: '/media/demo-waiting.webm' }, loop: true, durationMs: null, scale: 1 };
const SERVED = { media: { kind: 'video', url: '/media/demo-ripple.webm' }, loop: false, durationMs: 6000, scale: 1 };
const projections = (haloUrl) => ({
  preview: { media: { kind: 'video', url: haloUrl }, loop: true, durationMs: null, scale: 1 },
  ordered: WAITING,
  served: SERVED,
});

// The seed menu (src/db/seed.js). `projections` is internal: the menu
// endpoint answers with has_preview like the server does.
export const CATEGORIES = [
  {
    id: 1,
    name_ar: 'بيتزا',
    name_en: 'Pizza',
    dishes: [
      {
        id: 1,
        category_id: 1,
        name_ar: 'بيتزا مارجريتا',
        name_en: 'Margherita',
        description_ar: 'صلصة طماطم، موزاريلا طازجة، ريحان',
        price: 12000,
        thumbnail_url: '/media/demo-margherita.jpg',
        projections: projections('/media/demo-halo-pizza.webm'),
      },
      {
        id: 2,
        category_id: 1,
        name_ar: 'بيتزا الخضار',
        name_en: 'Veggie',
        description_ar: 'فلفل ملون، زيتون، فطر، بصل',
        price: 11000,
        thumbnail_url: '/media/demo-veggie.jpg',
        projections: projections('/media/demo-halo-pizza.webm'),
      },
    ],
  },
  {
    id: 2,
    name_ar: 'سلطات',
    name_en: 'Salads',
    dishes: [
      {
        id: 3,
        category_id: 2,
        name_ar: 'سلطة سيزر',
        name_en: 'Caesar',
        description_ar: 'خس روماني، بارميزان، خبز محمص، صوص سيزر',
        price: 8000,
        thumbnail_url: '/media/demo-caesar.jpg',
        projections: projections('/media/demo-halo-salad.webm'),
      },
      {
        id: 4,
        category_id: 2,
        name_ar: 'سلطة يونانية',
        name_en: 'Greek',
        description_ar: 'طماطم، خيار، جبنة فيتا، زيتون',
        price: 7500,
        thumbnail_url: '/media/demo-greek.jpg',
        projections: projections('/media/demo-halo-salad.webm'),
      },
    ],
  },
  {
    id: 3,
    name_ar: 'حلويات',
    name_en: 'Desserts',
    dishes: [
      {
        id: 5,
        category_id: 3,
        name_ar: 'تشيز كيك',
        name_en: 'Cheesecake',
        description_ar: 'تشيز كيك نيويورك مع صوص التوت',
        price: 6000,
        thumbnail_url: '/media/demo-cheesecake.jpg',
        projections: projections('/media/demo-halo-dessert.webm'),
      },
      {
        id: 6,
        category_id: 3,
        name_ar: 'براونيز',
        name_en: 'Brownies',
        description_ar: 'براونيز بالشوكولاتة الداكنة مع آيس كريم',
        price: 5500,
        thumbnail_url: '/media/demo-brownies.jpg',
        projections: projections('/media/demo-halo-dessert.webm'),
      },
    ],
  },
];
