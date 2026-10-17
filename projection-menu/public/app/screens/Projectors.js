// Ceiling projectors: status, calibration and test pattern (owner +
// designer); settings, PJLink power, pairing and keys (owner).

import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { CalibrationDialog } from '../components/Calibration.js';
import { Icon } from '../components/icons.js';
import { MenuButton, Modal, confirmDialog } from '../components/overlay.js';
import { PairingDialog, PlayerLinkDialog } from '../components/Pairing.js';
import { toast } from '../components/toast.js';
import { Button, Chip, Empty, ErrorState, Field, PageHeader, SearchInput, Segmented, Skeleton, StatusChip, cx } from '../components/ui.js';
import { api } from '../lib/api.js';
import { NOUNS, count, timeAgo } from '../lib/format.js';
import { useNow } from '../lib/hooks.js';
import { allTables, load, patchResource, useResource } from '../lib/store.js';

const syncProjectors = () => {
  load('projectors', { force: true }).catch(() => {});
  load('floor', { force: true }).catch(() => {});
};

const ROTATIONS = [0, 90, 180, 270].map((r) => ({ value: r, label: `${r}°` }));
const LAYOUTS = [
  { value: 'single', label: 'جهة واحدة', icon: 'monitor' },
  { value: 'dual', label: 'جهتان متقابلتان', icon: 'layers' },
];

export default function ProjectorsScreen({ user }) {
  useNow(30000);
  const isOwner = user.role === 'owner';
  const { data: projectors, error, reload } = useResource('projectors');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null); // {type, projector?}

  const online = (projectors ?? []).filter((p) => p.online).length;
  const shown = useMemo(
    () =>
      (projectors ?? [])
        .filter((p) => filter === 'all' || (filter === 'online' ? p.online : !p.online))
        .filter((p) => !query.trim() || `${p.name} ${p.table_number ?? ''}`.includes(query.trim())),
    [projectors, filter, query],
  );

  return html`<div class="page projectors-page">
    <${PageHeader}
      icon="projector"
      title="أجهزة العرض"
      subtitle=${projectors ? `${count(projectors.length, NOUNS.projector)} · ${online} متصل الآن` : 'جارٍ التحميل…'}
      actions=${isOwner &&
      html`<${Button} icon="plus" onClick=${() => setDialog({ type: 'add' })}>إضافة برابط مباشر<//>
        <${Button} variant="primary" icon="link" onClick=${() => setDialog({ type: 'pair' })}>ربط جهاز برمز<//>`}
    />

    <div class="toolbar">
      <${SearchInput} value=${query} onInput=${setQuery} placeholder="رقم الطاولة أو اسم الجهاز…" />
      <div class="chips">
        <${Chip} active=${filter === 'all'} onClick=${() => setFilter('all')} count=${projectors?.length}>الكل<//>
        <${Chip} active=${filter === 'online'} onClick=${() => setFilter('online')} count=${projectors ? online : undefined}><span class="dot" style=${{ background: 'var(--ok)' }}></span>متصل<//>
        <${Chip} active=${filter === 'offline'} onClick=${() => setFilter('offline')} count=${projectors ? projectors.length - online : undefined}><span class="dot" style=${{ background: 'var(--danger)' }}></span>غير متصل<//>
      </div>
    </div>

    ${error && !projectors
      ? html`<${ErrorState} error=${error} onRetry=${reload} />`
      : !projectors
        ? html`<div class="proj-grid">${Array.from({ length: 6 }, (_, i) => html`<${Skeleton} key=${i} h=${300} r="18px" />`)}</div>`
        : projectors.length === 0
          ? html`<${Empty}
              icon="projector"
              title="لا توجد أجهزة عرض بعد"
              text=${isOwner ? 'اربط جهاز أندرويد موصولاً بالبروجكتر فوق كل طاولة برمز من 6 أرقام.' : 'يضيف المالك أجهزة العرض ويربطها بالطاولات.'}
              action=${isOwner && html`<${Button} variant="primary" icon="link" onClick=${() => setDialog({ type: 'pair' })}>ربط أول جهاز<//>`}
            />`
          : shown.length === 0
            ? html`<${Empty} compact icon="filter" title="لا توجد أجهزة مطابقة" />`
            : html`<div class="proj-grid">
                ${shown.map((p) => html`<${ProjectorCard} key=${p.id} projector=${p} isOwner=${isOwner} onDialog=${(type) => setDialog({ type, projector: p })} />`)}
              </div>`}

    ${dialog?.type === 'pair' && html`<${PairingDialog} onClose=${() => (setDialog(null), syncProjectors())} />`}
    ${dialog?.type === 'add' && html`<${AddProjectorDialog} onClose=${() => setDialog(null)} onCreated=${(p) => setDialog({ type: 'link', projector: p })} />`}
    ${dialog?.type === 'calibrate' && html`<${CalibrationDialog} projector=${dialog.projector} onClose=${() => setDialog(null)} />`}
    ${dialog?.type === 'settings' && html`<${ProjectorSettings} projector=${dialog.projector} onClose=${() => setDialog(null)} />`}
    ${dialog?.type === 'link' && html`<${PlayerLinkDialog} projector=${dialog.projector} onClose=${() => setDialog(null)} />`}
  </div>`;
}

function ProjectorCard({ projector: p, isOwner, onDialog }) {
  const [pattern, setPattern] = useState(false);
  const [power, setPower] = useState(null); // null | 'loading' | state string
  const togglePattern = async () => {
    const on = !pattern;
    try {
      const res = await api.testPattern(p.id, on);
      setPattern(on);
      if (on && !res.delivered?.online) toast.info('الجهاز غير متصل؛ ستظهر شاشة الاختبار عند اتصاله.');
    } catch (err) {
      toast.error(err);
    }
  };
  const checkPower = async () => {
    setPower('loading');
    try {
      setPower((await api.projectorPower(p.id)).power);
    } catch (err) {
      setPower(null);
      toast.error(err);
    }
  };
  const setPowerOn = async (on) => {
    if (!on) {
      const ok = await confirmDialog({ title: `إطفاء "${p.name}"؟`, message: 'يُطفأ البروجكتر عبر الشبكة (PJLink). يحتاج دقيقة للتبريد.', confirmLabel: 'إطفاء', danger: true, icon: 'power' });
      if (!ok) return;
    }
    setPower('loading');
    try {
      setPower((await api.setProjectorPower(p.id, on)).power);
      toast.ok(on ? 'أُرسل أمر التشغيل' : 'أُرسل أمر الإطفاء');
    } catch (err) {
      setPower(null);
      toast.error(err);
    }
  };
  const rotateKey = async () => {
    const ok = await confirmDialog({
      title: 'تغيير مفتاح الجهاز؟',
      message: 'سيتوقف الرابط الحالي عن العمل وينفصل الجهاز. ستحتاج إلى فتح الرابط الجديد على الجهاز أو ربطه برمز جديد.',
      confirmLabel: 'تغيير المفتاح',
      danger: true,
      icon: 'key',
    });
    if (!ok) return;
    try {
      const updated = await api.rotateProjectorKey(p.id);
      patchResource('projectors', (list) => list.map((x) => (x.id === p.id ? updated : x)));
      onDialog('link');
    } catch (err) {
      toast.error(err);
    }
  };
  const remove = async () => {
    const ok = await confirmDialog({ title: `حذف "${p.name}"؟`, message: 'سيُفصل الجهاز ويتوقف رابطه. يمكنك ربط جهاز جديد بالطاولة لاحقاً.', confirmLabel: 'حذف الجهاز', danger: true });
    if (!ok) return;
    try {
      await api.deleteProjector(p.id);
      patchResource('projectors', (list) => list.filter((x) => x.id !== p.id));
      syncProjectors();
      toast.ok('حُذف جهاز العرض');
    } catch (err) {
      toast.error(err);
    }
  };

  const corners = p.calibration?.corners ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
  const calibrated = JSON.stringify(corners) !== JSON.stringify([[0, 0], [1, 0], [1, 1], [0, 1]]);
  return html`<article class=${cx('proj-card', p.online ? 'is-online' : 'is-offline')}>
    <header class="proj-head">
      <span class="proj-table">
        <span class="proj-table-label">طاولة</span>
        <span class="proj-table-num num">${p.table_number ?? '—'}</span>
      </span>
      <div class="proj-title">
        <h3 class="truncate">${p.name}</h3>
        <${StatusChip} size="sm" color=${p.online ? 'var(--ok)' : 'var(--danger)'} pulse=${p.online}>
          ${p.online ? 'متصل' : p.last_seen_at ? `آخر اتصال ${timeAgo(p.last_seen_at)}` : 'لم يتصل بعد'}
        <//>
      </div>
      ${isOwner &&
      html`<${MenuButton}
        label=${`خيارات ${p.name}`}
        items=${[
          { label: 'الإعدادات', icon: 'sliders', onSelect: () => onDialog('settings') },
          { label: 'رابط المشغل و QR', icon: 'qr', onSelect: () => onDialog('link') },
          { label: 'تغيير المفتاح', icon: 'key', onSelect: rotateKey },
          'divider',
          { label: 'حذف الجهاز', icon: 'trash', danger: true, onSelect: remove },
        ]}
      />`}
    </header>
    <button type="button" class="proj-visual" onClick=${() => onDialog('calibrate')} aria-label=${`معايرة ${p.name}`}>
      <svg viewBox="0 0 200 112.5" aria-hidden="true">
        <rect class="pv-frame" x="16" y="9" width="168" height="94.5" rx="2" />
        <polygon points=${corners.map(([x, y]) => `${16 + x * 168},${9 + y * 94.5}`).join(' ')} />
        ${p.layout === 'dual' &&
        html`<line
          x1=${16 + ((corners[0][0] + corners[3][0]) / 2) * 168}
          y1=${9 + ((corners[0][1] + corners[3][1]) / 2) * 94.5}
          x2=${16 + ((corners[1][0] + corners[2][0]) / 2) * 168}
          y2=${9 + ((corners[1][1] + corners[2][1]) / 2) * 94.5}
        />`}
      </svg>
      <span class="proj-visual-num num">${p.table_number ?? ''}</span>
      <span class="proj-visual-tag">${calibrated ? 'معايَر' : 'بدون معايرة'}</span>
    </button>
    <dl class="proj-meta">
      <div><dt>الدوران</dt><dd class="num">${p.rotation}°</dd></div>
      <div><dt>التخطيط</dt><dd>${p.layout === 'dual' ? 'جهتان' : 'جهة واحدة'}</dd></div>
      <div><dt>PJLink</dt><dd class=${p.pjlink_host ? 'ltr' : 'muted'}>${p.pjlink_host || 'غير مضبوط'}</dd></div>
    </dl>
    <footer class="proj-actions">
      <${Button} variant="primary" size="sm" icon="corners" onClick=${() => onDialog('calibrate')}>معايرة<//>
      <${Button} size="sm" variant=${pattern ? 'outline' : 'secondary'} icon="target" aria-pressed=${pattern ? 'true' : 'false'} onClick=${togglePattern}>
        ${pattern ? 'إخفاء الاختبار' : 'شاشة اختبار'}
      <//>
      ${isOwner &&
      p.pjlink_host &&
      html`<${MenuButton}
        label="الطاقة"
        trigger=${({ toggle }) => html`<${Button} size="sm" variant="ghost" icon="power" loading=${power === 'loading'} onClick=${() => (toggle(), power === null && checkPower())}>${powerLabel(power)}<//>`}
        items=${[
          { label: 'تشغيل البروجكتر', icon: 'power', onSelect: () => setPowerOn(true) },
          { label: 'إطفاء البروجكتر', icon: 'moon', danger: true, onSelect: () => setPowerOn(false) },
          'divider',
          { label: 'تحديث الحالة', icon: 'refresh', onSelect: checkPower },
        ]}
      />`}
    </footer>
  </article>`;
}

function powerLabel(state) {
  return { on: 'يعمل', off: 'مطفأ', warming: 'يسخن…', cooling: 'يبرد…', loading: 'الطاقة' }[state] ?? 'الطاقة';
}

function AddProjectorDialog({ onClose, onCreated }) {
  const { data: floor } = useResource('floor');
  const tables = useMemo(() => allTables(floor), [floor]);
  const [tableId, setTableId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const p = await api.createProjector({ table_id: tableId ? Number(tableId) : null, name: name.trim() || undefined });
      syncProjectors();
      toast.ok(`أُضيف "${p.name}"`);
      onCreated(p);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return html`<${Modal}
    icon="projector"
    title="إضافة جهاز عرض برابط مباشر"
    subtitle="للأجهزة التي تفتح المتصفح (كمبيوتر صغير أو Chromecast…): ستحصل على رابط خاص تفتحه على الجهاز."
    onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${onClose}>إلغاء<//><${Button} variant="primary" icon="plus" loading=${busy} disabled=${!tableId} onClick=${create}>إضافة<//>`}
  >
    <form class="stack" onSubmit=${create}>
      <${Field} label="الطاولة" required>
        ${(id) => html`<select id=${id} class="select" value=${tableId} onChange=${(e) => setTableId(e.currentTarget.value)}>
          <option value="">اختر رقم الطاولة</option>
          ${tables.map((t) => html`<option key=${t.id} value=${t.id}>طاولة ${t.number}${t.projectors.length ? ` (عليها ${t.projectors.length})` : ''}</option>`)}
        </select>`}
      <//>
      <${Field} label="اسم الجهاز (اختياري)">
        ${(id) => html`<input id=${id} class="input" maxlength="60" value=${name} onInput=${(e) => setName(e.currentTarget.value)} />`}
      <//>
    </form>
  <//>`;
}

function ProjectorSettings({ projector: p, onClose }) {
  const { data: floor } = useResource('floor');
  const tables = useMemo(() => allTables(floor), [floor]);
  const [form, setForm] = useState({
    name: p.name,
    table_id: p.table_id ?? '',
    rotation: p.rotation,
    layout: p.layout,
    pjlink_host: p.pjlink_host ?? '',
    pjlink_port: p.pjlink_port ?? 4352,
    pjlink_password: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    const body = {
      name: form.name.trim(),
      table_id: form.table_id ? Number(form.table_id) : null,
      rotation: form.rotation,
      layout: form.layout,
      pjlink_host: form.pjlink_host.trim() || null,
      pjlink_port: Number(form.pjlink_port) || 4352,
    };
    if (form.pjlink_password) body.pjlink_password = form.pjlink_password;
    try {
      const updated = await api.updateProjector(p.id, body);
      patchResource('projectors', (list) => list.map((x) => (x.id === p.id ? updated : x)));
      syncProjectors();
      toast.ok('حُفظت إعدادات الجهاز');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return html`<${Modal}
    size="lg"
    icon="sliders"
    title=${`إعدادات ${p.name}`}
    onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${onClose}>إلغاء<//><${Button} variant="primary" icon="check" loading=${busy} onClick=${save}>حفظ<//>`}
  >
    <form class="stack" onSubmit=${save}>
      <div class="form-grid">
        <${Field} label="اسم الجهاز" required>
          ${(id) => html`<input id=${id} class="input" maxlength="60" value=${form.name} onInput=${(e) => set('name')(e.currentTarget.value)} />`}
        <//>
        <${Field} label="الطاولة">
          ${(id) => html`<select id=${id} class="select" value=${form.table_id} onChange=${(e) => set('table_id')(e.currentTarget.value)}>
            <option value="">غير مربوط</option>
            ${tables.map((t) => html`<option key=${t.id} value=${t.id}>طاولة ${t.number}</option>`)}
          </select>`}
        <//>
      </div>
      <${Field} label="الدوران" hint="حسب اتجاه تركيب البروجكتر في السقف.">
        ${() => html`<${Segmented} options=${ROTATIONS} value=${form.rotation} onChange=${set('rotation')} label="الدوران" />`}
      <//>
      <${Field} label="التخطيط" hint="جهتان: نسختان من المنيو متقابلتان لضيوف على جانبي الطاولة.">
        ${() => html`<${Segmented} options=${LAYOUTS} value=${form.layout} onChange=${set('layout')} label="التخطيط" />`}
      <//>
      <div class="editor-section-title"><${Icon} name="power" size=${16} /> التحكم بالطاقة عبر الشبكة (PJLink) — اختياري</div>
      <div class="form-grid form-grid-3">
        <${Field} label="عنوان البروجكتر">
          ${(id) => html`<input id=${id} class="input" dir="ltr" placeholder="192.168.1.50" value=${form.pjlink_host} onInput=${(e) => set('pjlink_host')(e.currentTarget.value)} />`}
        <//>
        <${Field} label="المنفذ">
          ${(id) => html`<input id=${id} class="input input-num" inputmode="numeric" value=${form.pjlink_port} onInput=${(e) => set('pjlink_port')(e.currentTarget.value.replace(/\D/g, ''))} />`}
        <//>
        <${Field} label="كلمة المرور" hint=${p.pjlink_has_password ? 'محفوظة — اتركها فارغة للإبقاء عليها' : 'إن وُجدت'}>
          ${(id) => html`<input id=${id} class="input" dir="ltr" type="password" autocomplete="off" value=${form.pjlink_password} onInput=${(e) => set('pjlink_password')(e.currentTarget.value)} />`}
        <//>
      </div>
    </form>
  <//>`;
}
