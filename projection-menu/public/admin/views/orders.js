// Kitchen / floor view of orders. "Served" plays each dish's served
// projection in front of its seat; closing the table returns it to idle.

import { ORDER_STATUS, h, mount } from '/shared/dom.js';
import { api } from '../api.js';
import { btn, fmtTime, run } from '../ui.js';

const NEXT = {
  placed: [['preparing', 'بدء التحضير'], ['served', 'تم التقديم ✨'], ['cancelled', 'إلغاء']],
  preparing: [['served', 'تم التقديم ✨'], ['cancelled', 'إلغاء']],
  served: [['closed', 'إغلاق وتصفير الطاولة']],
  closed: [],
  cancelled: [],
};

let showAll = false;

export async function render(container, ctx) {
  const orders = await api(`/orders${showAll ? '?all=1' : ''}`);
  const toggle = h('input', { type: 'checkbox', checked: showAll });
  toggle.addEventListener('change', () => {
    showAll = toggle.checked;
    ctx.rerender();
  });

  mount(
    container,
    h('div', { class: 'view-head' }, h('h2', {}, 'الطلبات'), h('label', { class: 'inline' }, toggle, 'عرض المغلقة والملغاة')),
    orders.length
      ? h('div', { class: 'orders' }, orders.map((o) => orderCard(o, ctx)))
      : h('div', { class: 'card muted' }, 'لا توجد طلبات نشطة.'),
  );
}

export function onEvent(event, _payload, _container, ctx) {
  if (event === 'order:changed') ctx.rerender();
}

function orderCard(o, ctx) {
  const pillClass = { placed: 'gold', preparing: 'gold', served: 'ok', cancelled: 'off' }[o.status] ?? '';
  return h(
    'div',
    { class: 'card order' },
    h(
      'div',
      { class: 'order-head' },
      h('strong', {}, `#${o.id} · ${o.table_code}`),
      h('span', { class: `pill ${pillClass}` }, ORDER_STATUS[o.status]),
    ),
    h('div', { class: 'muted' }, `${o.table_name} · ${fmtTime(o.created_at)}`),
    h(
      'ul',
      {},
      o.items.map((i) =>
        h('li', {}, `${i.quantity} × ${i.dish_name}`, i.seat_no && ` — مقعد ${i.seat_no}`, i.notes && h('div', { class: 'muted' }, i.notes)),
      ),
    ),
    h('strong', {}, `الإجمالي: ${o.total}`),
    h(
      'div',
      { class: 'actions' },
      NEXT[o.status].map(([status, label]) => {
        const b = btn(label, () => run(b, () => api(`/orders/${o.id}`, { method: 'PATCH', body: { status } })), `small ${status === 'cancelled' ? 'danger' : 'primary'}`);
        return b;
      }),
    ),
  );
}
