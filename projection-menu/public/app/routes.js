// Screens, who may open them, and how they appear in the navigation.
// The server enforces every permission; this only hides what a role cannot do.

const ALL = ['owner', 'designer', 'waiter'];

export const GROUPS = { ops: 'التشغيل', content: 'المحتوى والعرض', admin: 'الإدارة' };

export const ROUTES = [
  { path: '/floor', load: () => import('./screens/Floor.js'), roles: ALL, nav: { label: 'الطاولات', icon: 'floor', group: 'ops' } },
  { path: '/table/:id', load: () => import('./screens/Table.js'), roles: ALL, full: true },
  { path: '/orders', load: () => import('./screens/Orders.js'), roles: ['owner', 'waiter'], nav: { label: 'الطلبات', icon: 'receipt', group: 'ops' } },
  { path: '/menu', load: () => import('./screens/MenuEditor.js'), roles: ['owner', 'designer'], nav: { label: 'المنيو', icon: 'book', group: 'content' } },
  { path: '/media', load: () => import('./screens/Media.js'), roles: ['owner', 'designer'], nav: { label: 'المكتبة', icon: 'image', group: 'content' } },
  { path: '/theme', load: () => import('./screens/Theme.js'), roles: ['owner', 'designer'], nav: { label: 'تصميم العرض', short: 'التصميم', icon: 'palette', group: 'content' } },
  { path: '/projectors', load: () => import('./screens/Projectors.js'), roles: ['owner', 'designer'], nav: { label: 'أجهزة العرض', short: 'الأجهزة', icon: 'projector', group: 'content' } },
  { path: '/hall', load: () => import('./screens/Hall.js'), roles: ['owner'], nav: { label: 'الأقسام والطاولات', short: 'القاعة', icon: 'layout', group: 'admin' } },
  { path: '/users', load: () => import('./screens/Users.js'), roles: ['owner'], nav: { label: 'المستخدمون', icon: 'users', group: 'admin' } },
  { path: '/reports', load: () => import('./screens/Reports.js'), roles: ['owner'], nav: { label: 'التقارير', icon: 'chart', group: 'admin' } },
  { path: '/activity', load: () => import('./screens/Activity.js'), roles: ['owner'], nav: { label: 'سجل النشاط', short: 'السجل', icon: 'activity', group: 'admin' } },
  { path: '/settings', load: () => import('./screens/Settings.js'), roles: ['owner'], nav: { label: 'الإعدادات', icon: 'sliders', group: 'admin' } },
];

export const HOME = { owner: '/floor', waiter: '/floor', designer: '/menu' };

// Bottom bar on phones: the first four of these, the rest under "المزيد".
const PHONE_PRIORITY = {
  waiter: ['/floor', '/orders'],
  designer: ['/menu', '/media', '/theme', '/projectors'],
  owner: ['/floor', '/orders', '/menu', '/reports'],
};

export function navFor(role) {
  return ROUTES.filter((r) => r.nav && r.roles.includes(role));
}

export function phoneNav(role) {
  const items = navFor(role);
  const primary = PHONE_PRIORITY[role].map((p) => items.find((i) => i.path === p)).filter(Boolean).slice(0, 4);
  return { primary, rest: items.filter((i) => !primary.includes(i)) };
}
