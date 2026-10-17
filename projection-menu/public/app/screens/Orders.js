// Orders across all tables: a live board of active orders (new, preparing,
// served) and the history by status.

import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { Button, Empty, ErrorState, PageHeader, Segmented, Skeleton, StatusChip, cx } from '../components/ui.js';
import { api } from '../lib/api.js';
import { NOUNS, count, money, timeAgo } from '../lib/format.js';
import { useLocalPref, useNow } from '../lib/hooks.js';
import { ORDER_NEXT, ORDER_STATUS } from '../lib/labels.js';
import { navigate } from '../lib/router.js';
import { onOrderEvent, upsertOrder, useResource } from '../lib/store.js';

const FILTERS = [
  { value: 'active', label: 'النشطة' },
  { value: 'paid', label: 'المدفوعة' },
  { value: 'cancelled', label: 'الملغاة' },
  { value: 'all', label: 'الكل' },
];
const BOARD = ['open', 'preparing', 'served'];

export default function OrdersScreen() {
  useNow(30000);
  const [filter, setFilter] = useLocalPref('orders-filter', 'active');
  const { data: active, error, reload } = useResource('orders');
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState(null);

  useEffect(() => {
    if (filter === 'active') return undefined;
    let alive = true;
    const fetch = () =>
      api
        .orders({ status: filter, limit: 200 })
        .then((list) => alive && (setHistory(list), setHistoryError(null)))
        .catch((err) => alive && setHistoryError(err));
    setHistory(null);
    fetch();
    const off = onOrderEvent(() => fetch());
    return () => {
      alive = false;
      off();
    };
  }, [filter]);

  const byStatus = useMemo(() => {
    const m = { open: [], preparing: [], served: [] };
    for (const o of active ?? []) m[o.status]?.push(o);
    for (const k of BOARD) m[k].sort((a, b) => a.id - b.id);
    return m;
  }, [active]);
  const activeTotal = (active ?? []).reduce((s, o) => s + o.total, 0);

  const subtitle = active ? `النشطة الآن: ${count(active.length, NOUNS.order)} · ${money(activeTotal)}` : 'جارٍ التحميل…';

  return html`<div class="page orders-page">
    <${PageHeader}
      icon="receipt"
      title="الطلبات"
      subtitle=${subtitle}
      actions=${html`<${Segmented} options=${FILTERS} value=${filter} onChange=${setFilter} label="تصفية الطلبات" />`}
    />
    ${filter === 'active'
      ? error && !active
        ? html`<${ErrorState} error=${error} onRetry=${reload} />`
        : html`<div class="order-board">
            ${BOARD.map(
              (status) => html`<section class="board-col" key=${status} style=${{ '--oc': ORDER_STATUS[status].color }}>
                <header class="board-col-head">
                  <span class="dot"></span>
                  <h2>${ORDER_STATUS[status].label}</h2>
                  <span class="chip-count">${active ? byStatus[status].length : '…'}</span>
                </header>
                <div class="board-col-body">
                  ${!active
                    ? [0, 1].map((i) => html`<${Skeleton} key=${i} h=${170} r="16px" />`)
                    : byStatus[status].length === 0
                      ? html`<div class="board-empty">لا توجد طلبات</div>`
                      : byStatus[status].map((o) => html`<${OrderCard} key=${o.id} order=${o} />`)}
                </div>
              </section>`,
            )}
          </div>`
      : historyError
        ? html`<${ErrorState} error=${historyError} onRetry=${() => setFilter(filter)} />`
        : !history
          ? html`<div class="order-grid">${[0, 1, 2, 3, 4, 5].map((i) => html`<${Skeleton} key=${i} h=${170} r="16px" />`)}</div>`
          : history.length === 0
            ? html`<${Empty} icon="receipt" title="لا توجد طلبات" text="لا توجد طلبات بهذه الحالة بعد." />`
            : html`<div class="order-grid">${history.map((o) => html`<${OrderCard} key=${o.id} order=${o} showStatus />`)}</div>`}
  </div>`;
}

function OrderCard({ order: o, showStatus }) {
  const [busy, setBusy] = useState(null);
  const next = ORDER_NEXT[o.status] ?? [];
  const move = async (status) => {
    setBusy(status);
    try {
      upsertOrder(await api.setOrderStatus(o.id, status));
      toast.ok(`الطلب #${o.id} — ${ORDER_STATUS[status].label}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };
  const shown = o.items.slice(0, 4);
  const more = o.items.length - shown.length;
  return html`<article class=${cx('order-card', `is-${o.status}`)} style=${{ '--oc': ORDER_STATUS[o.status]?.color }}>
    <header class="oc-head">
      <button type="button" class="oc-table" onClick=${() => o.table_id && navigate(`/table/${o.table_id}`)} aria-label=${`فتح طاولة ${o.table_number}`}>
        <span class="oc-table-label">طاولة</span>
        <span class="oc-table-num num">${o.table_number ?? '—'}</span>
      </button>
      <div class="oc-meta">
        <strong class="num">#${o.id}</strong>
        <span class="muted">${o.waiter_name ?? '—'} · ${timeAgo(o.created_at)}</span>
      </div>
      ${showStatus && html`<${StatusChip} color=${ORDER_STATUS[o.status]?.color} size="sm">${ORDER_STATUS[o.status]?.label}<//>`}
    </header>
    <ul class="oc-items">
      ${shown.map(
        (i) => html`<li key=${i.id}>
          <span class="oc-qty num">${i.quantity}×</span>
          <span class="oc-name">${i.dish_name}${i.notes && html`<small> — ${i.notes}</small>`}</span>
        </li>`,
      )}
      ${more > 0 && html`<li class="muted">+ ${count(more, NOUNS.item)}</li>`}
    </ul>
    ${o.notes && html`<div class="oc-notes"><${Icon} name="note" size=${13} />${o.notes}</div>`}
    <footer class="oc-foot">
      <strong class="oc-total num">${money(o.total)}</strong>
      <div class="row">
        ${next.map(
          (a) => html`<${Button}
            key=${a.status}
            size="sm"
            variant=${a.status === 'paid' ? 'primary' : 'secondary'}
            icon=${a.icon}
            loading=${busy === a.status}
            disabled=${Boolean(busy)}
            onClick=${() => move(a.status)}
          >${a.label}<//>`,
        )}
      </div>
    </footer>
  </article>`;
}
