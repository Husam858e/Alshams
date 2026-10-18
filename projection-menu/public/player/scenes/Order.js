// The table's current order: items, quantities, line totals, total and a
// status chip with a small progress tracker.

import { html } from 'htm/preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Count, EmptyState, Ornament, PageDots, Price, Swap } from '../components/Bits.js';
import { Icon } from '../components/Icons.js';
import { SafeImage } from '../components/Media.js';
import { useFrame, usePlayer } from '../lib/context.js';
import { formatNumber, NOUNS, ORDER_STATUS, ORDER_STEPS } from '../lib/format.js';
import { usePager } from '../lib/hooks.js';
import { chunk, findDish } from '../lib/menu.js';

// Rows per page until the rows have been measured.
const ITEMS_PER_PAGE = { landscape: 5, wide: 4, square: 6, portrait: 10 };
// Height the page dots take below the list (12px dots + 16px gap).
const DOTS_SPACE = 30;

// Splits rows of the given heights into pages that each fit `room` px;
// returns [start, end) index pairs.
function fitPages(heights, room) {
  const total = heights.reduce((a, b) => a + b, 0);
  if (total <= room + 1) return [[0, heights.length]];
  const limit = room - DOTS_SPACE;
  const ranges = [];
  let start = 0;
  let used = 0;
  heights.forEach((h, i) => {
    if (i > start && used + h > limit + 1) {
      ranges.push([start, i]);
      start = i;
      used = 0;
    }
    used += h;
  });
  ranges.push([start, heights.length]);
  return ranges;
}

function OrderRow({ item, index, menu }) {
  return html`
    <li style=${{ '--i': index }}>
      <span class="od-qty"><bdi>${formatNumber(item.quantity)}</bdi>×</span>
      <span class="od-name">
        <span class="od-dish">${item.dish_name ?? findDish(menu, item.dish_id)?.dish.name_ar ?? ''}</span>
        ${item.notes && html`<span class="od-note">${item.notes}</span>`}
      </span>
      <span class="od-leader"></span>
      <${Price} always=${true} value=${(Number(item.quantity) || 0) * (Number(item.unit_price) || 0)} class="od-line" />
    </li>
  `;
}

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

  // Rows differ in height (notes) and the free height depends on the frame
  // and the status, so a hidden copy of the whole list is measured once per
  // content and pages are filled greedily. offsetHeight is in stage pixels,
  // unaffected by the stage scale/warp.
  const measure = useRef(null);
  const [fontsTick, setFontsTick] = useState(0);
  const fitKey = `${order?.id}:${JSON.stringify(items.map((i) => [i.id, i.quantity, i.notes, i.dish_name]))}:${shape}:${order?.status}:${order?.notes ?? ''}:${fontsTick}`;
  const [fit, setFit] = useState({ key: '', ranges: null });
  const pages = useMemo(
    () => (fit.key === fitKey && fit.ranges ? fit.ranges.map(([a, b]) => items.slice(a, b)) : chunk(items, ITEMS_PER_PAGE[shape] ?? 5)),
    [items, fit, fitKey, shape],
  );
  const index = usePager(start, theme.pageSeconds * 1000, pages.length);
  useLayoutEffect(() => {
    if (fit.key === fitKey || !items.length) return;
    const list = measure.current;
    const room = list?.parentElement?.clientHeight;
    if (!list || !room) return;
    const heights = [...list.children].map((li) => li.offsetHeight);
    setFit({ key: fitKey, ranges: fitPages(heights, room) });
  });
  // Web fonts change line heights: measure again once they are in.
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontsTick(1));
    return () => {
      alive = false;
    };
  }, []);

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
    <section class="scene order ${plates.length ? '' : 'no-plates'}">
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
              <span><${Count} value=${count} noun=${NOUNS.item} /></span>
            </div>
          </div>
          <span class="od-chip st-${status}">${ORDER_STATUS[status]}</span>
        </header>
        <${Tracker} status=${status} />
        <div class="od-items-wrap">
          ${items.length > 0 && html`
            <ul class="od-items od-measure" ref=${measure} aria-hidden="true">
              ${items.map((item, i) => html`<${OrderRow} key=${item.id ?? i} item=${item} index=${0} menu=${menu} />`)}
            </ul>
          `}
          ${items.length
            ? html`
                <${Swap} k=${index} ms=${700} class="od-swap">
                  <ul class="od-items">
                    ${(pages[index] ?? []).map((item, i) => html`<${OrderRow} key=${item.id ?? i} item=${item} index=${i} menu=${menu} />`)}
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
