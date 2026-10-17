// Floor: sections as tabs, a tile per table (number, status, projector,
// active order, what its projector shows). Tap a table to control it.

import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { Button, Chip, Empty, ErrorState, PageHeader, Skeleton, cx } from '../components/ui.js';
import { money } from '../lib/format.js';
import { useLocalPref } from '../lib/hooks.js';
import { ORDER_STATUS, SCENES, TABLE_STATUS, sceneLabel } from '../lib/labels.js';
import { navigate } from '../lib/router.js';
import { allTables, useResource } from '../lib/store.js';

const STATUS_FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'free', label: 'متاحة', color: 'var(--c-free)' },
  { key: 'occupied', label: 'مشغولة', color: 'var(--c-occupied)' },
  { key: 'reserved', label: 'محجوزة', color: 'var(--c-reserved)' },
  { key: 'orders', label: 'لديها طلب', icon: 'receipt' },
];

export default function FloorScreen({ user }) {
  const { data: floor, error, reload } = useResource('floor');
  const { data: menu } = useResource('menu');
  const [area, setArea] = useLocalPref('floor-area', 'all');
  const [status, setStatus] = useLocalPref('floor-status', 'all');

  const tables = useMemo(() => allTables(floor), [floor]);
  const counts = useMemo(() => {
    const c = { free: 0, occupied: 0, reserved: 0, orders: 0, all: tables.length, online: 0, projectors: 0 };
    for (const t of tables) {
      c[t.status]++;
      if (t.activeOrder) c.orders++;
      c.projectors += t.projectors.length;
      c.online += t.projectors.filter((p) => p.online).length;
    }
    return c;
  }, [tables]);

  const matches = (t) => (status === 'all' ? true : status === 'orders' ? Boolean(t.activeOrder) : t.status === status);

  const sections = useMemo(() => {
    if (!floor) return [];
    const list = floor.areas.map((a) => ({ id: a.id, name: a.name, tables: a.tables }));
    if (floor.unassigned.length) list.push({ id: 'none', name: 'بدون قسم', tables: floor.unassigned });
    return list;
  }, [floor]);
  const areaKnown = area === 'all' || sections.some((s) => String(s.id) === String(area));
  const shown = sections
    .filter((s) => !areaKnown || area === 'all' || String(s.id) === String(area))
    .map((s) => ({ ...s, tables: s.tables.filter(matches) }))
    .filter((s) => s.tables.length);

  const subtitle = floor
    ? `${counts.free} متاحة · ${counts.occupied} مشغولة · ${counts.reserved} محجوزة${counts.projectors ? ` · أجهزة العرض المتصلة ${counts.online}/${counts.projectors}` : ''}`
    : 'جارٍ التحميل…';

  return html`<div class="page floor-page">
    <${PageHeader}
      icon="floor"
      title="الطاولات"
      subtitle=${subtitle}
      actions=${html`
        <${GoToTable} tables=${tables} />
        ${user.role === 'owner' && html`<${Button} icon="layout" variant="ghost" onClick=${() => navigate('/hall')}>إدارة القاعة<//>`}
      `}
    />

    ${error && !floor
      ? html`<${ErrorState} error=${error} onRetry=${reload} />`
      : html`
          <div class="floor-filters">
            <div class="chips" role="tablist" aria-label="الأقسام">
              <${Chip} active=${area === 'all' || !areaKnown} onClick=${() => setArea('all')} count=${floor ? tables.length : undefined}>كل الأقسام<//>
              ${sections.map(
                (s) => html`<${Chip} key=${s.id} active=${String(area) === String(s.id)} onClick=${() => setArea(s.id)} count=${s.tables.length}>${s.name}<//>`,
              )}
            </div>
            <div class="chips floor-status-filter" aria-label="تصفية حسب الحالة">
              ${STATUS_FILTERS.map(
                (f) => html`<${Chip}
                  key=${f.key}
                  class="chip-sm"
                  active=${status === f.key}
                  onClick=${() => setStatus(f.key)}
                  icon=${f.icon}
                  count=${floor && f.key !== 'all' ? counts[f.key] : undefined}
                >
                  ${f.color && html`<span class="dot" style=${{ background: f.color }}></span>`}${f.label}
                <//>`,
              )}
            </div>
          </div>

          ${!floor
            ? html`<div class="table-grid">${Array.from({ length: 12 }, (_, i) => html`<${Skeleton} key=${i} h=${178} r="20px" />`)}</div>`
            : tables.length === 0
              ? html`<${Empty}
                  icon="floor"
                  title="لا توجد طاولات بعد"
                  text=${user.role === 'owner' ? 'أضف أقسام المطعم (مثل الصالة والتراس) ثم الطاولات بأرقامها.' : 'اطلب من المالك إضافة الأقسام والطاولات.'}
                  action=${user.role === 'owner' && html`<${Button} variant="primary" icon="plus" onClick=${() => navigate('/hall')}>إضافة الطاولات<//>`}
                />`
              : shown.length === 0
                ? html`<${Empty} icon="filter" title="لا توجد طاولات بهذه التصفية" action=${html`<${Button} onClick=${() => setStatus('all')}>عرض الكل<//>`} />`
                : shown.map(
                    (s) => html`<section class="floor-section" key=${s.id}>
                      ${(area === 'all' || !areaKnown) && sections.length > 1 && html`<h2 class="floor-section-title">${s.name}<span>${s.tables.length}</span></h2>`}
                      <div class="table-grid">
                        ${s.tables.map((t) => html`<${TableTile} key=${t.id} table=${t} menu=${menu} />`)}
                      </div>
                    </section>`,
                  )}
        `}
  </div>`;
}

function GoToTable({ tables }) {
  const [value, setValue] = useState('');
  const go = (e) => {
    e.preventDefault();
    const n = Number(value);
    const t = tables.find((x) => x.number === n);
    if (!t) return toast.error(`لا توجد طاولة برقم ${value}`);
    setValue('');
    navigate(`/table/${t.id}`);
  };
  return html`<form class="goto" onSubmit=${go} role="search">
    <${Icon} name="hash" size=${18} />
    <input
      class="goto-input"
      inputmode="numeric"
      pattern="[0-9]*"
      placeholder="رقم الطاولة"
      aria-label="انتقل إلى طاولة برقمها"
      value=${value}
      onInput=${(e) => setValue(e.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
    />
    <button type="submit" class="goto-btn" disabled=${!value} aria-label="فتح الطاولة"><${Icon} name="chevron-left" size=${18} /></button>
  </form>`;
}

function projectorState(projectors) {
  if (!projectors.length) return { tone: 'none', label: 'بدون جهاز عرض' };
  const online = projectors.filter((p) => p.online).length;
  if (online === projectors.length) return { tone: 'on', label: projectors.length > 1 ? `${online} أجهزة متصلة` : 'جهاز العرض متصل' };
  if (online === 0) return { tone: 'off', label: 'جهاز العرض غير متصل' };
  return { tone: 'part', label: `${online}/${projectors.length} متصل` };
}

export function TableTile({ table: t, menu }) {
  const st = TABLE_STATUS[t.status] ?? TABLE_STATUS.free;
  const proj = projectorState(t.projectors);
  const scene = t.scene ?? { type: 'welcome' };
  const order = t.activeOrder;
  return html`<a
    href=${`#/table/${t.id}`}
    class=${cx('table-tile', `is-${t.status}`, order && 'has-order')}
    style=${{ '--st': st.color }}
    aria-label=${`طاولة ${t.number}، ${st.label}${order ? `، طلب ${money(order.total)}` : ''}`}
  >
    <div class="tile-top">
      <span class="tile-status"><span class="dot"></span>${st.label}</span>
      <span class=${cx('tile-proj', `proj-${proj.tone}`)} title=${proj.label}>
        <${Icon} name="projector" size=${16} />
        <span class="dot"></span>
      </span>
    </div>
    <div class="tile-number num">${t.number}</div>
    <div class="tile-seats"><${Icon} name="users" size=${14} /> ${t.seats} مقاعد</div>
    <div class="tile-foot">
      <span class=${cx('tile-scene', scene.type === 'off' && 'is-off')} title="ما يُعرض الآن">
        <${Icon} name=${SCENES[scene.type]?.icon ?? 'sparkles'} size=${14} />
        <span class="truncate">${sceneLabel(scene, menu)}</span>
      </span>
      ${order &&
      html`<span class="tile-order" style=${{ '--oc': ORDER_STATUS[order.status]?.color }}>
        <span class="num">${money(order.total)}</span>
        <span class="tile-order-meta">${order.itemsCount} صنف · ${ORDER_STATUS[order.status]?.label}</span>
      </span>`}
    </div>
  </a>`;
}
