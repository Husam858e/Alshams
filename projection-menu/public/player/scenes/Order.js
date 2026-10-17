// The table's current order: items, quantities, line totals, total and a
// status chip with a small progress tracker.

import { html } from 'htm/preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { EmptyState, Ornament, PageDots, Price, Swap } from '../components/Bits.js';
import { Icon } from '../components/Icons.js';
import { SafeImage } from '../components/Media.js';
import { useFrame, usePlayer } from '../lib/context.js';
import { formatNumber, ORDER_STATUS, ORDER_STEPS } from '../lib/format.js';
import { usePager } from '../lib/hooks.js';
import { chunk, findDish } from '../lib/menu.js';

// Rows per page to start from; fewer are used when they do not fit.
const ITEMS_PER_PAGE = { landscape: 5, wide: 4, square: 6, portrait: 10 };

export function resolveOrder(scene, orders) {
  if (scene?.order && String(scene.order.id) === String(scene.orderId)) return scene.order;
  return orders?.[String(scene?.orderId)] ?? null;
}

function Tracker({ status }) {
  if (status === 'cancelled') return null;
  const reached = status === 'paid' ? ORDER_STEPS.length : ORDER_STEPS.findIndex((s) => s.status === status) + 1;
  return html`
    <ol class="od-tracker">
      ${ORDER_STEPS.map((step, i) => {
        const state = i < reached - 1 || status === 'paid' ? 'done' : i === reached - 1 ? 'now' : 'next';
        return html`
          <li class="st-${state}">
            <span class="od-step-dot">${state === 'done' ? html`<${Icon} name="check" />` : null}</span>
            <span class="od-step-label">${step.label}</span>
          </li>
        `;
      })}
    </ol>
  `;
}

export function OrderScene({ scene, start }) {
  const { orders, menu, theme } = usePlayer();
  const { shape } = useFrame();
  const order = resolveOrder(scene, orders);
  const items = Array.isArray(order?.items) ? order.items : [];

  // Rows have different heights (notes), so measure: while the current page
  // overflows the list area, put one row less on each page.
  const root = useRef(null);
  const fitKey = `${order?.id}:${items.length}:${shape}:${order?.status}:${order?.notes ?? ''}`;
  const [fit, setFit] = useState({ key: '', per: 0 });
  const perPage = fit.key === fitKey ? fit.per : ITEMS_PER_PAGE[shape] ?? 5;
  const pages = useMemo(() => chunk(items, perPage), [items, perPage]);
  const index = usePager(start, theme.pageSeconds * 1000, pages.length);
  useLayoutEffect(() => {
    const list = root.current?.querySelector('.od-swap > .swap.is-in > .od-items');
    const box = list?.parentElement?.parentElement;
    if (list && box && perPage > 1 && list.offsetHeight > box.clientHeight + 1) setFit({ key: fitKey, per: perPage - 1 });
  });

  // Up to three photos of what was ordered, like plates on the table.
  const plates = useMemo(() => {
    const urls = [];
    for (const item of items) {
      const url = findDish(menu, item.dish_id)?.dish.image_url;
      if (url && !urls.includes(url)) urls.push(url);
    }
    return urls.slice(0, 3);
  }, [items, menu]);

  if (!order) {
    return html`
      <section class="scene order is-empty">
        <${EmptyState} icon="receipt" title="لا يوجد طلب لعرضه" text="سيظهر طلبكم هنا بعد أن يسجّله النادل" />
      </section>
    `;
  }

  const count = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const total = Number.isFinite(Number(order.total)) && order.total !== null
    ? Number(order.total)
    : items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const status = ORDER_STATUS[order.status] ? order.status : 'open';

  return html`
    <section class="scene order ${plates.length ? '' : 'no-plates'}" ref=${root}>
      ${plates.length > 0 && html`
        <div class="od-visual" aria-hidden="true">
          ${plates.map((url, i) => html`<div key=${url} class="od-plate p${i + 1}"><${SafeImage} src=${url} /></div>`)}
        </div>
      `}
      <div class="od-panel">
        <header class="od-head">
          <div class="od-titles">
            <h1 class="od-title">طلبكم</h1>
            <div class="od-sub">
              <span>طلب رقم <bdi>${order.id}</bdi></span>
              <span class="od-sep">·</span>
              <span><bdi>${formatNumber(count)}</bdi> ${count === 1 ? 'صنف' : 'أصناف'}</span>
            </div>
          </div>
          <span class="od-chip st-${status}">${ORDER_STATUS[status]}</span>
        </header>
        <${Tracker} status=${status} />
        <div class="od-items-wrap">
          ${items.length
            ? html`
                <${Swap} k=${index} ms=${700} class="od-swap">
                  <ul class="od-items">
                    ${(pages[index] ?? []).map((item, i) => html`
                      <li key=${item.id ?? i} style=${{ '--i': i }}>
                        <span class="od-qty"><bdi>${formatNumber(item.quantity)}</bdi>×</span>
                        <span class="od-name">
                          <span class="od-dish">${item.dish_name ?? findDish(menu, item.dish_id)?.dish.name_ar ?? ''}</span>
                          ${item.notes && html`<span class="od-note">${item.notes}</span>`}
                        </span>
                        <span class="od-leader"></span>
                        <${Price} always=${true} value=${(Number(item.quantity) || 0) * (Number(item.unit_price) || 0)} class="od-line" />
                      </li>
                    `)}
                  </ul>
                </${Swap}>
              `
            : html`<div class="od-none">لم تُضف أصناف بعد</div>`}
          <${PageDots} count=${pages.length} index=${index} />
        </div>
        ${order.notes && html`<div class="od-notes">${order.notes}</div>`}
        <${Ornament} class="od-ornament" />
        <footer class="od-total">
          <span class="od-total-label">المجموع</span>
          <${Price} always=${true} value=${total} class="od-total-price" />
        </footer>
        ${status === 'paid' && html`<div class="od-thanks">شكراً لزيارتكم، نتمنى أن نراكم قريباً</div>`}
      </div>
    </section>
  `;
}
