// Floor setup (owner): sections (areas) and numbered tables, and which
// projector serves each table (pairing straight from a table card).

import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../components/icons.js';
import { MenuButton, Modal, confirmDialog } from '../components/overlay.js';
import { PairingDialog } from '../components/Pairing.js';
import { toast } from '../components/toast.js';
import { Button, Empty, ErrorState, Field, IconButton, PageHeader, Skeleton, cx } from '../components/ui.js';
import { api } from '../lib/api.js';
import { NOUNS, count } from '../lib/format.js';
import { TABLE_STATUS } from '../lib/labels.js';
import { navigate } from '../lib/router.js';
import { allTables, load, useResource } from '../lib/store.js';

const syncFloor = () => Promise.all([load('floor', { force: true }), load('projectors', { force: true })]).catch(() => {});

export default function HallScreen() {
  const { data: floor, error, reload } = useResource('floor');
  const [dialog, setDialog] = useState(null);
  const tables = useMemo(() => allTables(floor), [floor]);
  const projectorCount = tables.reduce((n, t) => n + t.projectors.length, 0);
  const nextNumber = tables.reduce((m, t) => Math.max(m, t.number), 0) + 1;

  const sections = floor
    ? [...floor.areas, ...(floor.unassigned.length ? [{ id: null, name: 'بدون قسم', tables: floor.unassigned }] : [])]
    : [];

  return html`<div class="page hall-page">
    <${PageHeader}
      icon="layout"
      title="الأقسام والطاولات"
      subtitle=${floor ? `${count(floor.areas.length, NOUNS.section)} · ${count(tables.length, NOUNS.table)} · ${count(projectorCount, NOUNS.projector)}` : 'جارٍ التحميل…'}
      actions=${html`
        <${Button} icon="layers" onClick=${() => setDialog({ type: 'area' })}>قسم جديد<//>
        <${Button} icon="grid" onClick=${() => setDialog({ type: 'bulk' })} disabled=${!floor}>إضافة عدة طاولات<//>
        <${Button} variant="primary" icon="plus" onClick=${() => setDialog({ type: 'table', areaId: floor?.areas[0]?.id ?? null })} disabled=${!floor}>طاولة جديدة<//>
      `}
    />

    ${error && !floor
      ? html`<${ErrorState} error=${error} onRetry=${reload} />`
      : !floor
        ? html`<div class="stack">${[0, 1].map((i) => html`<${Skeleton} key=${i} h=${260} r="20px" />`)}</div>`
        : sections.length === 0
          ? html`<${Empty}
              icon="layout"
              title="ابدأ بتقسيم المطعم"
              text="أضف الأقسام (مثل الصالة الرئيسية، التراس، VIP) ثم الطاولات بأرقامها. كل طاولة يخدمها جهاز عرض في السقف."
              action=${html`<${Button} variant="primary" icon="layers" onClick=${() => setDialog({ type: 'area' })}>أضف أول قسم<//>`}
            />`
          : html`<div class="hall-sections">
              ${sections.map(
                (s, i) => html`<${AreaPanel}
                  key=${s.id ?? 'none'}
                  area=${s}
                  index=${i}
                  total=${floor.areas.length}
                  areas=${floor.areas}
                  onDialog=${setDialog}
                />`,
              )}
            </div>`}

    ${dialog?.type === 'area' && html`<${AreaDialog} area=${dialog.area} onClose=${() => setDialog(null)} />`}
    ${dialog?.type === 'table' &&
    html`<${TableDialog} table=${dialog.table} areaId=${dialog.areaId} areas=${floor.areas} suggested=${nextNumber} onClose=${() => setDialog(null)} />`}
    ${dialog?.type === 'bulk' && html`<${BulkDialog} areas=${floor.areas} tables=${tables} from=${nextNumber} onClose=${() => setDialog(null)} />`}
    ${dialog?.type === 'pair' && html`<${PairingDialog} tableId=${dialog.tableId} onClose=${() => (setDialog(null), syncFloor())} />`}
  </div>`;
}

function AreaPanel({ area, index, total, areas, onDialog }) {
  const isNone = area.id == null;
  const move = async (delta) => {
    const ids = areas.map((a) => a.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await Promise.all(ids.map((id, i) => api.updateArea(id, { sort_order: i })));
      await syncFloor();
    } catch (err) {
      toast.error(err);
    }
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: `حذف قسم "${area.name}"؟`,
      message: area.tables.length ? `طاولاته (${area.tables.length}) لن تُحذف، ستبقى "بدون قسم".` : 'القسم فارغ.',
      confirmLabel: 'حذف القسم',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteArea(area.id);
      await syncFloor();
      toast.ok('حُذف القسم');
    } catch (err) {
      toast.error(err);
    }
  };
  return html`<section class=${cx('panel hall-area', isNone && 'is-none')}>
    <header class="panel-head">
      <div class="panel-title">${isNone ? html`<${Icon} name="info" size=${18} />` : html`<${Icon} name="layers" size=${18} />`} ${area.name}</div>
      <span class="chip-count">${area.tables.length}</span>
      <div class="spacer"></div>
      ${!isNone &&
      html`<${IconButton} icon="arrow-up" size="sm" label="تقديم القسم" disabled=${index === 0} onClick=${() => move(-1)} />
        <${IconButton} icon="arrow-down" size="sm" label="تأخير القسم" disabled=${index >= total - 1} onClick=${() => move(1)} />
        <${MenuButton}
          label=${`خيارات ${area.name}`}
          items=${[
            { label: 'إعادة التسمية', icon: 'edit', onSelect: () => onDialog({ type: 'area', area }) },
            { label: 'حذف القسم', icon: 'trash', danger: true, onSelect: remove },
          ]}
        />`}
    </header>
    <div class="hall-grid">
      ${area.tables.map((t) => html`<${HallTable} key=${t.id} table=${t} onDialog=${onDialog} />`)}
      ${!isNone &&
      html`<button type="button" class="hall-add" onClick=${() => onDialog({ type: 'table', areaId: area.id })}>
        <${Icon} name="plus" size=${22} />
        <span>طاولة في ${area.name}</span>
      </button>`}
    </div>
  </section>`;
}

function HallTable({ table: t, onDialog }) {
  const st = TABLE_STATUS[t.status] ?? TABLE_STATUS.free;
  const remove = async () => {
    const ok = await confirmDialog({
      title: `حذف طاولة ${t.number}؟`,
      message: t.projectors.length
        ? `سيُحذف معها جهاز العرض المربوط بها (${t.projectors.map((p) => p.name).join('، ')}). الطلبات السابقة تحتفظ برقم الطاولة.`
        : 'الطلبات السابقة تحتفظ برقم الطاولة.',
      confirmLabel: 'حذف الطاولة',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteTable(t.id);
      await syncFloor();
      toast.ok(`حُذفت طاولة ${t.number}`);
    } catch (err) {
      toast.error(err);
    }
  };
  return html`<article class="hall-table" style=${{ '--st': st.color }}>
    <div class="hall-table-top">
      <span class="hall-table-num num">${t.number}</span>
      <div class="hall-table-info">
        <span><${Icon} name="users" size=${14} /> ${count(t.seats, NOUNS.seat)}</span>
        <span class="hall-status"><span class="dot" style=${{ background: st.color }}></span>${st.label}</span>
      </div>
      <${MenuButton}
        label=${`خيارات طاولة ${t.number}`}
        items=${[
          { label: 'تعديل', icon: 'edit', onSelect: () => onDialog({ type: 'table', table: t }) },
          { label: 'ربط جهاز عرض', icon: 'link', onSelect: () => onDialog({ type: 'pair', tableId: t.id }) },
          { label: 'فتح شاشة الطاولة', icon: 'external', onSelect: () => navigate(`/table/${t.id}`) },
          'divider',
          { label: 'حذف الطاولة', icon: 'trash', danger: true, onSelect: remove },
        ]}
      />
    </div>
    <div class="hall-proj">
      ${t.projectors.length
        ? t.projectors.map(
            (p) => html`<span key=${p.id} class=${cx('hall-proj-item', p.online ? 'is-on' : 'is-off')} title=${p.online ? 'متصل' : 'غير متصل'}>
              <${Icon} name="projector" size=${14} /><span class="truncate">${p.name}</span><span class="dot"></span>
            </span>`,
          )
        : html`<button type="button" class="hall-pair" onClick=${() => onDialog({ type: 'pair', tableId: t.id })}>
            <${Icon} name="link" size=${14} /> ربط جهاز عرض
          </button>`}
    </div>
  </article>`;
}

function AreaDialog({ area, onClose }) {
  const [name, setName] = useState(area?.name ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (area) await api.updateArea(area.id, { name: name.trim() });
      else await api.createArea({ name: name.trim() });
      await syncFloor();
      toast.ok(area ? 'حُفظ اسم القسم' : `أُضيف قسم "${name.trim()}"`);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return html`<${Modal}
    size="sm"
    icon="layers"
    title=${area ? 'إعادة تسمية القسم' : 'قسم جديد'}
    onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${onClose}>إلغاء<//><${Button} variant="primary" icon="check" loading=${busy} disabled=${!name.trim()} onClick=${save}>${area ? 'حفظ' : 'إضافة'}<//>`}
  >
    <form onSubmit=${save}>
      <${Field} label="اسم القسم" hint="مثل: الصالة الرئيسية، التراس، VIP، العائلات">
        ${(id) => html`<input id=${id} class="input" maxlength="60" value=${name} onInput=${(e) => setName(e.currentTarget.value)} autofocus />`}
      <//>
    </form>
  <//>`;
}

function TableDialog({ table, areaId, areas, suggested, onClose }) {
  const [form, setForm] = useState({
    number: String(table?.number ?? suggested),
    seats: String(table?.seats ?? 4),
    area_id: table ? (table.area_id ?? '') : (areaId ?? ''),
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget.value });
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const body = { number: Number(form.number), seats: Number(form.seats) || 4, area_id: form.area_id ? Number(form.area_id) : null };
    try {
      if (table) await api.updateTable(table.id, body);
      else await api.createTable(body);
      await syncFloor();
      toast.ok(table ? `حُفظت طاولة ${body.number}` : `أُضيفت طاولة ${body.number}`);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<${Modal}
    icon="floor"
    title=${table ? `تعديل طاولة ${table.number}` : 'طاولة جديدة'}
    onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${onClose}>إلغاء<//><${Button} variant="primary" icon="check" loading=${busy} disabled=${!form.number} onClick=${save}>${table ? 'حفظ' : 'إضافة الطاولة'}<//>`}
  >
    <form class="stack" onSubmit=${save}>
      <div class="form-grid">
        <${Field} label="رقم الطاولة" required error=${error} hint="الرقم الذي يختاره الويتر على التابلت">
          ${(id) => html`<input id=${id} class="input input-num input-big" inputmode="numeric" value=${form.number} onInput=${(e) => setForm({ ...form, number: e.currentTarget.value.replace(/\D/g, '').slice(0, 4) })} />`}
        <//>
        <${Field} label="عدد المقاعد">
          ${(id) => html`<input id=${id} class="input input-num input-big" inputmode="numeric" value=${form.seats} onInput=${(e) => setForm({ ...form, seats: e.currentTarget.value.replace(/\D/g, '').slice(0, 2) })} />`}
        <//>
      </div>
      <${Field} label="القسم">
        ${(id) => html`<select id=${id} class="select" value=${form.area_id} onChange=${set('area_id')}>
          <option value="">بدون قسم</option>
          ${areas.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}
        </select>`}
      <//>
    </form>
  <//>`;
}

function BulkDialog({ areas, tables, from: start, onClose }) {
  const [form, setForm] = useState({ from: String(start), to: String(start + 3), seats: '4', area_id: areas[0]?.id ?? '' });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const from = Number(form.from);
  const to = Number(form.to);
  const taken = new Set(tables.map((t) => t.number));
  const numbers = from && to && to >= from && to - from < 100 ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [];
  const fresh = numbers.filter((n) => !taken.has(n));
  const save = async (e) => {
    e?.preventDefault();
    if (!fresh.length) return;
    setBusy(true);
    let done = 0;
    try {
      for (const n of fresh) {
        await api.createTable({ number: n, seats: Number(form.seats) || 4, area_id: form.area_id ? Number(form.area_id) : null });
        setProgress(++done);
      }
      toast.ok(`أُضيفت ${count(done, NOUNS.table)}`);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
      syncFloor();
    }
  };
  const num = (k, max) => (e) => setForm({ ...form, [k]: e.currentTarget.value.replace(/\D/g, '').slice(0, max) });
  return html`<${Modal}
    icon="grid"
    title="إضافة عدة طاولات"
    subtitle="أرقام متتالية بنفس عدد المقاعد والقسم"
    onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${onClose}>إلغاء<//><${Button} variant="primary" icon="plus" loading=${busy} disabled=${!fresh.length} onClick=${save}>
      ${busy && progress ? `${progress}/${fresh.length}` : fresh.length ? `إضافة ${count(fresh.length, NOUNS.table)}` : 'إضافة'}
    <//>`}
  >
    <form class="stack" onSubmit=${save}>
      <div class="form-grid form-grid-3">
        <${Field} label="من رقم">${(id) => html`<input id=${id} class="input input-num" inputmode="numeric" value=${form.from} onInput=${num('from', 4)} />`}<//>
        <${Field} label="إلى رقم">${(id) => html`<input id=${id} class="input input-num" inputmode="numeric" value=${form.to} onInput=${num('to', 4)} />`}<//>
        <${Field} label="المقاعد">${(id) => html`<input id=${id} class="input input-num" inputmode="numeric" value=${form.seats} onInput=${num('seats', 2)} />`}<//>
      </div>
      <${Field} label="القسم">
        ${(id) => html`<select id=${id} class="select" value=${form.area_id} onChange=${(e) => setForm({ ...form, area_id: e.currentTarget.value })}>
          <option value="">بدون قسم</option>
          ${areas.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}
        </select>`}
      <//>
      ${numbers.length > 0 &&
      html`<div class="bulk-preview">
        ${numbers.map((n) => html`<span key=${n} class=${cx('bulk-num num', taken.has(n) && 'is-taken')} title=${taken.has(n) ? 'موجودة مسبقاً' : ''}>${n}</span>`)}
      </div>`}
      ${numbers.length > fresh.length && html`<p class="field-hint">الأرقام المشطوبة موجودة مسبقاً وستُتخطى.</p>`}
    </form>
  <//>`;
}
