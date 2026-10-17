// Staff accounts (owner): create waiters / designers / owners, edit role,
// reset passwords, deactivate and reactivate.

import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../components/icons.js';
import { MenuButton, Modal, confirmDialog } from '../components/overlay.js';
import { toast } from '../components/toast.js';
import { Avatar, Badge, Button, Chip, Empty, ErrorState, Field, PageHeader, Skeleton, cx } from '../components/ui.js';
import { api } from '../lib/api.js';
import { NOUNS, count, timeAgo } from '../lib/format.js';
import { useNow } from '../lib/hooks.js';
import { ROLES } from '../lib/labels.js';
import { load, useResource } from '../lib/store.js';

const syncUsers = () => load('users', { force: true }).catch(() => {});
const ROLE_ORDER = ['owner', 'designer', 'waiter'];

export default function UsersScreen({ user: me }) {
  useNow(60000);
  const { data: users, error, reload } = useResource('users');
  const [filter, setFilter] = useState('all');
  const [dialog, setDialog] = useState(null);

  const counts = useMemo(() => {
    const c = { all: 0, owner: 0, designer: 0, waiter: 0, inactive: 0 };
    for (const u of users ?? []) {
      if (!u.is_active) c.inactive++;
      else {
        c.all++;
        c[u.role]++;
      }
    }
    return c;
  }, [users]);
  const shown = (users ?? [])
    .filter((u) => (filter === 'inactive' ? !u.is_active : u.is_active && (filter === 'all' || u.role === filter)))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name, 'ar'));

  return html`<div class="page users-page">
    <${PageHeader}
      icon="users"
      title="المستخدمون"
      subtitle=${users ? `${count(counts.all, NOUNS.user)} نشطون · كل شخص يدخل بحسابه وصلاحياته` : 'جارٍ التحميل…'}
      actions=${html`<${Button} variant="primary" icon="user-plus" onClick=${() => setDialog({ type: 'create' })}>مستخدم جديد<//>`}
    />

    <div class="role-cards">
      ${ROLE_ORDER.map(
        (r) => html`<button key=${r} type="button" class=${cx('role-card', filter === r && 'is-active')} onClick=${() => setFilter(filter === r ? 'all' : r)}>
          <span class="role-card-icon"><${Icon} name=${ROLES[r].icon} size=${20} /></span>
          <span class="role-card-text">
            <strong>${ROLES[r].label}</strong>
            <span>${ROLES[r].hint}</span>
          </span>
          <span class="role-card-count num">${users ? counts[r] : '…'}</span>
        </button>`,
      )}
    </div>

    <div class="toolbar">
      <div class="chips">
        <${Chip} active=${filter === 'all'} onClick=${() => setFilter('all')} count=${users ? counts.all : undefined}>كل النشطين<//>
        ${ROLE_ORDER.map((r) => html`<${Chip} key=${r} icon=${ROLES[r].icon} active=${filter === r} onClick=${() => setFilter(r)}>${ROLES[r].label}<//>`)}
        <${Chip} icon="lock" active=${filter === 'inactive'} onClick=${() => setFilter('inactive')} count=${users ? counts.inactive : undefined}>معطّلون<//>
      </div>
    </div>

    ${error && !users
      ? html`<${ErrorState} error=${error} onRetry=${reload} />`
      : !users
        ? html`<div class="user-list">${[0, 1, 2, 3].map((i) => html`<${Skeleton} key=${i} h=${76} r="16px" />`)}</div>`
        : shown.length === 0
          ? html`<${Empty} compact icon="users" title=${filter === 'inactive' ? 'لا يوجد مستخدمون معطّلون' : 'لا يوجد مستخدمون'} />`
          : html`<ul class="user-list" role="list">
              ${shown.map((u) => html`<${UserRow} key=${u.id} user=${u} me=${me} onDialog=${setDialog} />`)}
            </ul>`}

    ${dialog?.type === 'create' && html`<${UserDialog} onClose=${() => setDialog(null)} />`}
    ${dialog?.type === 'edit' && html`<${UserDialog} user=${dialog.user} me=${me} onClose=${() => setDialog(null)} />`}
    ${dialog?.type === 'password' && html`<${PasswordDialog} user=${dialog.user} onClose=${() => setDialog(null)} />`}
  </div>`;
}

function UserRow({ user: u, me, onDialog }) {
  const isMe = u.id === me.id;
  const deactivate = async () => {
    const ok = await confirmDialog({
      title: `تعطيل حساب ${u.name}؟`,
      message: 'لن يستطيع الدخول، وسيُسجَّل خروجه من كل الأجهزة فوراً. يمكنك إعادة تفعيله لاحقاً.',
      confirmLabel: 'تعطيل',
      danger: true,
      icon: 'lock',
    });
    if (!ok) return;
    try {
      await api.deactivateUser(u.id);
      await syncUsers();
      toast.ok(`عُطّل حساب ${u.name}`);
    } catch (err) {
      toast.error(err);
    }
  };
  const activate = async () => {
    try {
      await api.updateUser(u.id, { is_active: true });
      await syncUsers();
      toast.ok(`فُعّل حساب ${u.name}`);
    } catch (err) {
      toast.error(err);
    }
  };
  return html`<li class=${cx('user-row', !u.is_active && 'is-inactive')}>
    <${Avatar} name=${u.name} size=${46} tone=${u.role} />
    <div class="user-row-main">
      <div class="user-row-name">
        <strong>${u.name}</strong>
        ${isMe && html`<${Badge} tone="gold">أنت<//>`}
        ${!u.is_active && html`<${Badge} tone="muted" icon="lock">معطّل<//>`}
      </div>
      <span class="user-row-meta"><span class="ltr">@${u.username}</span> · ${u.last_login_at ? `آخر دخول ${timeAgo(u.last_login_at)}` : 'لم يدخل بعد'}</span>
    </div>
    <span class=${`role-pill role-${u.role}`}><${Icon} name=${ROLES[u.role]?.icon} size=${14} />${ROLES[u.role]?.label}</span>
    <${MenuButton}
      label=${`خيارات ${u.name}`}
      items=${[
        { label: 'تعديل الاسم والدور', icon: 'edit', onSelect: () => onDialog({ type: 'edit', user: u }) },
        { label: 'إعادة تعيين كلمة المرور', icon: 'key', onSelect: () => onDialog({ type: 'password', user: u }) },
        'divider',
        u.is_active
          ? { label: 'تعطيل الحساب', icon: 'lock', danger: true, disabled: isMe, onSelect: deactivate }
          : { label: 'إعادة التفعيل', icon: 'check-circle', onSelect: activate },
      ]}
    />
  </li>`;
}

function RolePicker({ value, onChange, disabled }) {
  return html`<div class="role-picker" role="radiogroup" aria-label="الدور">
    ${ROLE_ORDER.map(
      (r) => html`<button
        key=${r}
        type="button"
        role="radio"
        aria-checked=${value === r ? 'true' : 'false'}
        class=${cx('role-option', value === r && 'is-active')}
        disabled=${disabled}
        onClick=${() => onChange(r)}
      >
        <${Icon} name=${ROLES[r].icon} size=${20} />
        <strong>${ROLES[r].label}</strong>
        <span>${ROLES[r].hint}</span>
      </button>`,
    )}
  </div>`;
}

function UserDialog({ user, me, onClose }) {
  const editing = Boolean(user);
  const [form, setForm] = useState({ name: user?.name ?? '', username: user?.username ?? '', password: '', role: user?.role ?? 'waiter' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) await api.updateUser(user.id, { name: form.name.trim(), role: form.role });
      else await api.createUser({ name: form.name.trim(), username: form.username.trim(), password: form.password, role: form.role });
      await syncUsers();
      toast.ok(editing ? 'حُفظ المستخدم' : `أُنشئ حساب ${form.name.trim()} (${ROLES[form.role].label})`);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const ready = form.name.trim() && (editing || (form.username.trim() && form.password));
  return html`<${Modal}
    size="lg"
    icon=${editing ? 'edit' : 'user-plus'}
    title=${editing ? `تعديل ${user.name}` : 'مستخدم جديد'}
    subtitle=${editing ? `@${user.username}` : 'أعطِ كل موظف حسابه الخاص؛ الصلاحيات حسب الدور.'}
    onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${onClose}>إلغاء<//><${Button} variant="primary" icon="check" loading=${busy} disabled=${!ready} onClick=${save}>${editing ? 'حفظ' : 'إنشاء الحساب'}<//>`}
  >
    <form class="stack" onSubmit=${save} novalidate>
      <div class="form-grid">
        <${Field} label="الاسم" required>
          ${(id) => html`<input id=${id} class="input" maxlength="80" value=${form.name} onInput=${(e) => set('name')(e.currentTarget.value)} placeholder="مثال: علي" />`}
        <//>
        ${!editing &&
        html`<${Field} label="اسم المستخدم" required hint="بدون مسافات، يُستخدم للدخول">
          ${(id) => html`<input id=${id} class="input" dir="ltr" autocapitalize="none" spellcheck="false" autocomplete="off" maxlength="40" value=${form.username} onInput=${(e) => set('username')(e.currentTarget.value.replace(/\s/g, ''))} placeholder="waiter3" />`}
        <//>`}
      </div>
      ${!editing &&
      html`<${Field} label="كلمة المرور" required hint="4 أحرف على الأقل — أبلغها للموظف ليغيّرها لاحقاً">
        ${(id) => html`<input id=${id} class="input" dir="ltr" autocomplete="new-password" value=${form.password} onInput=${(e) => set('password')(e.currentTarget.value)} />`}
      <//>`}
      <${Field} label="الدور" hint=${editing && user.id === me?.id ? 'لا يمكنك تغيير دورك بنفسك إذا كنت المالك الوحيد' : null}>
        ${() => html`<${RolePicker} value=${form.role} onChange=${set('role')} />`}
      <//>
      ${error && html`<div class="auth-error" role="alert"><${Icon} name="alert" size=${18} /><span>${error}</span></div>`}
    </form>
  <//>`;
}

function PasswordDialog({ user, onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateUser(user.id, { password });
      toast.ok(`تغيّرت كلمة مرور ${user.name} وسُجّل خروجه من أجهزته`);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<${Modal}
    size="sm"
    icon="key"
    title="إعادة تعيين كلمة المرور"
    subtitle=${`${user.name} · @${user.username}`}
    onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${onClose}>إلغاء<//><${Button} variant="primary" icon="check" loading=${busy} disabled=${!password} onClick=${save}>تعيين<//>`}
  >
    <form onSubmit=${save}>
      <${Field} label="كلمة المرور الجديدة" error=${error} hint="سيُطلب منه الدخول من جديد على كل الأجهزة">
        ${(id) => html`<input id=${id} class="input" dir="ltr" autocomplete="new-password" value=${password} onInput=${(e) => setPassword(e.currentTarget.value)} autofocus />`}
      <//>
    </form>
  <//>`;
}
