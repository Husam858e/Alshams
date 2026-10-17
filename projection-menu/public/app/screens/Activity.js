// Activity log (owner): who did what and when, grouped by day.

import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../components/icons.js';
import { Avatar, Button, Chip, Empty, ErrorState, PageHeader, SearchInput, Skeleton, cx } from '../components/ui.js';
import { api } from '../lib/api.js';
import { dayLabel, time, timeAgo, toDate } from '../lib/format.js';
import { useNow } from '../lib/hooks.js';

const GROUPS = [
  { key: 'all', label: 'الكل', icon: 'activity' },
  { key: 'order', label: 'الطلبات', icon: 'receipt', prefixes: ['order.'] },
  { key: 'menu', label: 'المنيو والمكتبة', icon: 'book', prefixes: ['dish.', 'category.', 'media.'] },
  { key: 'floor', label: 'القاعة والأجهزة', icon: 'projector', prefixes: ['area.', 'table.', 'projector.'] },
  { key: 'users', label: 'المستخدمون', icon: 'users', prefixes: ['user.', 'auth.'] },
  { key: 'settings', label: 'الإعدادات والتصميم', icon: 'sliders', prefixes: ['settings.'] },
];

const ICONS = {
  order: 'receipt',
  dish: 'utensils',
  category: 'layers',
  media: 'image',
  area: 'layout',
  table: 'floor',
  projector: 'projector',
  user: 'user',
  auth: 'key',
  settings: 'sliders',
};
const TONES = { 'dish.price': 'gold', 'order.status': 'info', 'user.deactivate': 'danger', 'projector.delete': 'danger', 'table.delete': 'danger', 'dish.delete': 'danger', 'media.delete': 'danger', 'category.delete': 'danger', 'area.delete': 'danger', 'order.item-remove': 'danger' };

const STEP = 150;
const norm = (s) => String(s ?? '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export default function ActivityScreen() {
  useNow(60000);
  const [limit, setLimit] = useState(STEP);
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');

  const fetchList = (n = limit) => {
    setBusy(true);
    setError(null);
    api
      .activity(n)
      .then(setList)
      .catch(setError)
      .finally(() => setBusy(false));
  };
  useEffect(() => fetchList(limit), [limit]);

  const g = GROUPS.find((x) => x.key === group);
  const q = norm(query.trim());
  const shown = useMemo(
    () =>
      (list ?? []).filter(
        (e) => (!g?.prefixes || g.prefixes.some((p) => e.code.startsWith(p))) && (!q || norm(`${e.summary} ${e.action} ${e.user_name}`).includes(q)),
      ),
    [list, group, q],
  );
  const days = useMemo(() => {
    const map = new Map();
    for (const e of shown) {
      const d = toDate(e.created_at);
      const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : '?';
      if (!map.has(key)) map.set(key, { key, label: dayLabel(e.created_at), items: [] });
      map.get(key).items.push(e);
    }
    return [...map.values()];
  }, [shown]);

  return html`<div class="page activity-page">
    <${PageHeader}
      icon="activity"
      title="سجل النشاط"
      subtitle="العمليات المهمة: الطلبات، الأسعار، المحتوى، الأجهزة والمستخدمون"
      actions=${html`<${Button} variant="ghost" icon="refresh" loading=${busy && Boolean(list)} onClick=${() => fetchList()}>تحديث<//>`}
    />
    <div class="toolbar">
      <${SearchInput} value=${query} onInput=${setQuery} placeholder="ابحث في السجل…" />
      <div class="chips">
        ${GROUPS.map((x) => html`<${Chip} key=${x.key} icon=${x.icon} active=${group === x.key} onClick=${() => setGroup(x.key)}>${x.label}<//>`)}
      </div>
    </div>

    ${error && !list
      ? html`<${ErrorState} error=${error} onRetry=${() => fetchList()} />`
      : !list
        ? html`<div class="stack-sm">${Array.from({ length: 8 }, (_, i) => html`<${Skeleton} key=${i} h=${60} r="14px" />`)}</div>`
        : shown.length === 0
          ? html`<${Empty} icon="activity" title="لا توجد عمليات مطابقة" />`
          : html`<div class="timeline">
              ${days.map(
                (d) => html`<section key=${d.key} class="timeline-day">
                  <h2 class="timeline-day-title">${d.label}<span class="chip-count">${d.items.length}</span></h2>
                  <ul class="timeline-list" role="list">
                    ${d.items.map((e) => {
                      const kind = e.code.split('.')[0];
                      return html`<li key=${e.id} class=${cx('tl-item', TONES[e.code] && `tone-${TONES[e.code]}`)}>
                        <span class="tl-icon"><${Icon} name=${ICONS[kind] ?? 'activity'} size=${17} /></span>
                        <div class="tl-main">
                          <span class="tl-summary">${e.summary}</span>
                          ${!e.summary.startsWith(e.action) && html`<span class="tl-meta">${e.action}</span>`}
                          <span class="tl-by">${e.user_name} · <span class="num">${time(e.created_at)}</span></span>
                        </div>
                        <span class="tl-user"><${Avatar} name=${e.user_name} size=${26} /><span class="truncate">${e.user_name}</span></span>
                        <time class="tl-time" title=${timeAgo(e.created_at)}><span class="num">${time(e.created_at)}</span></time>
                      </li>`;
                    })}
                  </ul>
                </section>`,
              )}
              ${list.length >= limit &&
              limit < 1000 &&
              html`<div class="center"><${Button} icon="chevron-down" loading=${busy} onClick=${() => setLimit(Math.min(1000, limit + STEP * 2))}>عرض عمليات أقدم<//></div>`}
            </div>`}
  </div>`;
}
