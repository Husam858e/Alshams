// Every cue sent to a projector and how it went — first stop when a table
// "doesn't show anything".

import { h, mount } from '/shared/dom.js';
import { api } from '../api.js';
import { fmtTime } from '../ui.js';

const GOOD = new Set(['acked', 'playing', 'ended']);
let pending = null;

export async function render(container) {
  const rows = await api('/projection-log?limit=150');
  mount(
    container,
    h('div', { class: 'view-head' }, h('h2', {}, 'سجل العرض')),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, ['الوقت', 'الجهاز', 'الطاولة', 'الطبق', 'الأمر', 'المرحلة', 'النتيجة', 'الخطأ'].map((t) => h('th', {}, t)))),
        h(
          'tbody',
          {},
          rows.map((r) =>
            h(
              'tr',
              {},
              h('td', {}, fmtTime(r.created_at)),
              h('td', {}, r.projector_name ?? '—'),
              h('td', {}, r.table_code ?? '—'),
              h('td', {}, r.dish_name ?? '—'),
              h('td', {}, h('code', {}, r.action)),
              h('td', {}, r.phase ?? ''),
              h('td', {}, h('span', { class: `pill ${GOOD.has(r.result) ? 'ok' : 'off'}` }, r.result)),
              h('td', { class: 'muted' }, r.error ?? ''),
            ),
          ),
        ),
      ),
    ),
  );
}

// Live: re-render at most twice a second.
export function onEvent(event, _payload, container, ctx) {
  if (event !== 'projection:log' || pending) return;
  pending = setTimeout(() => {
    pending = null;
    if (ctx.current?.name === 'log') render(container);
  }, 500);
}
