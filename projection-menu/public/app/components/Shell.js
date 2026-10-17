// App frame: side bar (desktop), compact rail (tablet) or top + bottom bars
// (phone), the user menu and the live connection indicator.

import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { useViewport } from '../lib/hooks.js';
import { ROLES } from '../lib/labels.js';
import { liveStatus, onLiveStatus } from '../lib/live.js';
import { navigate } from '../lib/router.js';
import { logout } from '../lib/session.js';
import { useStore } from '../lib/store.js';
import { GROUPS, navFor, phoneNav } from '../routes.js';
import { BrandMark, Icon } from './icons.js';
import { Drawer, MenuButton, Modal } from './overlay.js';
import { toast } from './toast.js';
import { Avatar, Button, Field, cx } from './ui.js';

export function useLiveStatus() {
  const [status, setStatus] = useState(liveStatus());
  useEffect(() => onLiveStatus(setStatus), []);
  return status;
}

const LIVE_TEXT = { online: 'متصل مباشرة', connecting: 'جارٍ الاتصال…', offline: 'غير متصل', idle: 'غير متصل' };

export function LiveIndicator({ compact }) {
  const status = useLiveStatus();
  return html`<span class=${cx('live', `live-${status}`, compact && 'live-compact')} role="status" title=${LIVE_TEXT[status]} aria-label=${LIVE_TEXT[status]}>
    <span class="dot"></span>${!compact && html`<span>${LIVE_TEXT[status]}</span>`}
  </span>`;
}

// Shown when the realtime link has been down for a few seconds.
function OfflineBanner() {
  const status = useLiveStatus();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (status !== 'offline') return setShow(false);
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [status]);
  if (!show) return null;
  return html`<div class="offline-banner" role="alert">
    <${Icon} name="wifi-off" size=${18} />
    <span>انقطع الاتصال المباشر بالخادم — جارٍ إعادة المحاولة. التحديثات الحية متوقفة مؤقتاً.</span>
  </div>`;
}

function isActive(item, path) {
  if (item.path === '/floor') return path === '/floor' || path.startsWith('/table/');
  return path === item.path || path.startsWith(`${item.path}/`);
}

function NavItem({ item, path, compact }) {
  const active = isActive(item, path);
  return html`<a
    href=${`#${item.path}`}
    class=${cx('nav-item', active && 'is-active')}
    aria-current=${active ? 'page' : undefined}
    title=${compact ? item.nav.label : undefined}
  >
    <span class="nav-icon"><${Icon} name=${item.nav.icon} size=${compact ? 22 : 20} /></span>
    <span class="nav-label">${compact ? (item.nav.short ?? item.nav.label) : item.nav.label}</span>
  </a>`;
}

function UserMenu({ user, compact, onPassword, up }) {
  return html`<${MenuButton}
    class="user-menu"
    align=${up ? 'up' : 'end'}
    trigger=${({ open, toggle }) => html`<button
      type="button"
      class=${cx('user-btn', compact && 'user-btn-compact')}
      aria-haspopup="menu"
      aria-expanded=${open ? 'true' : 'false'}
      aria-label="قائمة المستخدم"
      onClick=${toggle}
    >
      <${Avatar} name=${user.name} size=${compact ? 40 : 38} />
      ${!compact &&
      html`<span class="user-meta">
          <span class="user-name">${user.name}</span>
          <span class="user-role">${ROLES[user.role]?.label}</span>
        </span>
        <${Icon} name="chevron-down" size=${16} />`}
    </button>`}
    header=${html`<div class="menu-header">
      <${Avatar} name=${user.name} size=${36} />
      <div><strong>${user.name}</strong><span>@${user.username} · ${ROLES[user.role]?.label}</span></div>
    </div>`}
    items=${[
      { label: 'تغيير كلمة المرور', icon: 'key', onSelect: onPassword },
      'divider',
      { label: 'تسجيل الخروج', icon: 'logout', danger: true, onSelect: () => logout() },
    ]}
  />`;
}

function Sidebar({ user, path, compact, restaurantName, onPassword }) {
  const items = navFor(user.role);
  const groups = Object.keys(GROUPS)
    .map((g) => ({ key: g, label: GROUPS[g], items: items.filter((i) => i.nav.group === g) }))
    .filter((g) => g.items.length);
  return html`<aside class=${cx('sidebar', compact && 'sidebar-compact')} aria-label="التنقل الرئيسي">
    <a class="sidebar-brand" href="#/" aria-label=${restaurantName}>
      <${BrandMark} size=${compact ? 40 : 42} />
      ${!compact &&
      html`<span class="brand-text">
        <span class="brand-name">${restaurantName}</span>
        <span class="brand-sub">المنيو الضوئي</span>
      </span>`}
    </a>
    <nav class="sidebar-nav">
      ${groups.map(
        (g) => html`<div class="nav-group" key=${g.key}>
          ${!compact && groups.length > 1 && html`<div class="nav-group-label">${g.label}</div>`}
          ${g.items.map((item) => html`<${NavItem} key=${item.path} item=${item} path=${path} compact=${compact} />`)}
        </div>`,
      )}
    </nav>
    <div class="sidebar-foot">
      <${LiveIndicator} compact=${compact} />
      <${UserMenu} user=${user} compact=${compact} onPassword=${onPassword} up />
    </div>
  </aside>`;
}

function PhoneBars({ user, path, restaurantName, onPassword }) {
  const { primary, rest } = phoneNav(user.role);
  const [more, setMore] = useState(false);
  const moreActive = rest.some((i) => isActive(i, path));
  return html`
    <header class="phone-top">
      <a class="phone-brand" href="#/"><${BrandMark} size=${32} /><span>${restaurantName}</span></a>
      <${LiveIndicator} compact />
      <${UserMenu} user=${user} compact onPassword=${onPassword} />
    </header>
    <nav class="bottom-bar" aria-label="التنقل الرئيسي">
      ${primary.map((item) => html`<${NavItem} key=${item.path} item=${item} path=${path} compact />`)}
      ${rest.length > 0 &&
      html`<button type="button" class=${cx('nav-item', moreActive && 'is-active')} onClick=${() => setMore(true)}>
        <span class="nav-icon"><${Icon} name="menu" size=${22} /></span><span class="nav-label">المزيد</span>
      </button>`}
    </nav>
    ${more &&
    html`<${Drawer} title="كل الأقسام" size="bottom" onClose=${() => setMore(false)}>
      <div class="more-grid" onClick=${(e) => e.target.closest('a') && setMore(false)}>
        ${rest.map((item) => html`<${NavItem} key=${item.path} item=${item} path=${path} />`)}
      </div>
    <//>`}
  `;
}

export function Shell({ user, path, full, children }) {
  const viewport = useViewport();
  const restaurantName = useStore((s) => s.settings?.general?.restaurantName) ?? 'المنيو الضوئي';
  const [pwOpen, setPwOpen] = useState(false);
  const onPassword = () => setPwOpen(true);
  return html`<div class=${cx('shell', `shell-${viewport}`, full && 'shell-full')}>
    ${viewport !== 'phone' &&
    html`<${Sidebar} user=${user} path=${path} compact=${viewport === 'tablet'} restaurantName=${restaurantName} onPassword=${onPassword} />`}
    <div class="shell-main">
      ${viewport === 'phone' && html`<${PhoneBars} user=${user} path=${path} restaurantName=${restaurantName} onPassword=${onPassword} />`}
      <${OfflineBanner} />
      <main class="shell-content" id="main" tabindex="-1">${children}</main>
    </div>
    ${pwOpen && html`<${ChangePassword} onClose=${() => setPwOpen(false)} />`}
  </div>`;
}

function ChangePassword({ onClose }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget.value });
  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) return setError('كلمتا المرور الجديدتان غير متطابقتين');
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(form.current, form.next);
      toast.ok('تم تغيير كلمة المرور. سُجّل خروج أجهزتك الأخرى.');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<${Modal} title="تغيير كلمة المرور" icon="key" size="sm" onClose=${onClose}>
    <form class="stack" onSubmit=${submit}>
      <${Field} label="كلمة المرور الحالية">${(id) => html`<input id=${id} class="input" type="password" autocomplete="current-password" value=${form.current} onInput=${set('current')} required />`}<//>
      <${Field} label="كلمة المرور الجديدة" hint="4 أحرف على الأقل">${(id) => html`<input id=${id} class="input" type="password" autocomplete="new-password" value=${form.next} onInput=${set('next')} required />`}<//>
      <${Field} label="تأكيد كلمة المرور الجديدة" error=${error}>${(id) => html`<input id=${id} class="input" type="password" autocomplete="new-password" value=${form.confirm} onInput=${set('confirm')} required />`}<//>
      <div class="form-actions">
        <${Button} variant="ghost" onClick=${onClose}>إلغاء<//>
        <${Button} variant="primary" type="submit" loading=${busy} icon="check">حفظ<//>
      </div>
    </form>
  <//>`;
}

export { navigate };
