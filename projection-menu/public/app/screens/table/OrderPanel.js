// Order panel of the table screen: the table's active order(s) with their
// items, the draft of new items, totals, sending, and status actions.

import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../../components/icons.js';
import { confirmDialog } from '../../components/overlay.js';
import { Button, Empty, StatusChip, Stepper, cx } from '../../components/ui.js';
import { money, time } from '../../lib/format.js';
import { ORDER_CANCELLABLE, ORDER_EDITABLE, ORDER_NEXT, ORDER_STATUS } from '../../lib/labels.js';

export function OrderPanel({
  table,
  orders,
  selected,
  onSelect,
  draft,
  dishById,
  onDraftQty,
  onDraftNotes,
  onClearDraft,
  onSend,
  sending,
  onItemQty,
  onStatus,
  statusBusy,
  onShowOrder,
  orderNotes,
  setOrderNotes,
}) {
  const order = orders.find((o) => o.id === selected) ?? null;
  const editable = order && ORDER_EDITABLE.includes(order.status);
  const draftTotal = draft.reduce((sum, l) => sum + (dishById(l.dish_id)?.price ?? 0) * l.quantity, 0);
  const draftCount = draft.reduce((n, l) => n + l.quantity, 0);
  const [notesOpen, setNotesOpen] = useState(false);

  const sendLabel = editable ? `إضافة إلى الطلب #${order.id}` : 'إرسال الطلب';

  return html`<div class="order-panel">
    <div class="op-head">
      <div class="op-title"><${Icon} name="receipt" size=${18} /> الطلب</div>
      ${orders.length > 0 &&
      html`<div class="op-tabs" role="tablist" aria-label="طلبات الطاولة">
        ${orders.map(
          (o) => html`<button
            key=${o.id}
            type="button"
            role="tab"
            aria-selected=${o.id === selected ? 'true' : 'false'}
            class=${cx('op-tab', o.id === selected && 'is-active')}
            style=${{ '--oc': ORDER_STATUS[o.status]?.color }}
            onClick=${() => onSelect(o.id)}
          >
            <span class="dot"></span><span class="num">#${o.id}</span>
          </button>`,
        )}
        <button
          type="button"
          role="tab"
          aria-selected=${selected == null ? 'true' : 'false'}
          class=${cx('op-tab', selected == null && 'is-active')}
          onClick=${() => onSelect(null)}
          title="طلب جديد منفصل"
        >
          <${Icon} name="plus" size=${14} /> جديد
        </button>
      </div>`}
    </div>

    <div class="op-body">
      ${order &&
      html`<div class="op-order">
        <div class="op-order-meta">
          <${StatusChip} color=${ORDER_STATUS[order.status]?.color} size="sm">${ORDER_STATUS[order.status]?.label}<//>
          <span class="muted">${order.waiter_name ?? '—'} · ${time(order.created_at)}</span>
        </div>
        <ul class="op-lines">
          ${order.items.map(
            (item) => html`<li key=${item.id} class="op-line">
              <div class="op-line-main">
                <span class="op-line-name">${item.dish_name}</span>
                ${item.notes && html`<span class="op-line-note"><${Icon} name="note" size=${13} />${item.notes}</span>`}
                <span class="op-line-unit muted num">${money(item.unit_price)}</span>
              </div>
              ${editable
                ? html`<${Stepper} size="sm" value=${item.quantity} min=${1} onChange=${(n) => onItemQty(order, item, n)} />`
                : html`<span class="op-qty num">×${item.quantity}</span>`}
              <span class="op-line-total num">${money(item.quantity * item.unit_price)}</span>
            </li>`,
          )}
        </ul>
        ${order.notes && html`<div class="op-notes"><${Icon} name="note" size=${14} />${order.notes}</div>`}
      </div>`}

      ${draft.length > 0 &&
      html`<div class="op-draft">
        <div class="op-draft-head">
          <span class="section-title"><${Icon} name="plus" size=${14} /> ${order ? 'إضافات جديدة' : 'طلب جديد'}</span>
          <button type="button" class="link-btn" onClick=${onClearDraft}>مسح</button>
        </div>
        <ul class="op-lines">
          ${draft.map((line) => {
            const dish = dishById(line.dish_id);
            return html`<${DraftLine}
              key=${line.key}
              line=${line}
              dish=${dish}
              onQty=${(n) => onDraftQty(line.key, n)}
              onNotes=${(v) => onDraftNotes(line.key, v)}
            />`;
          })}
        </ul>
        ${!editable &&
        html`<div class="op-order-notes">
          ${notesOpen || orderNotes
            ? html`<textarea
                class="textarea"
                rows="2"
                placeholder="ملاحظة للطلب كله (اختياري)"
                aria-label="ملاحظة للطلب"
                value=${orderNotes}
                onInput=${(e) => setOrderNotes(e.currentTarget.value)}
              ></textarea>`
            : html`<button type="button" class="link-btn" onClick=${() => setNotesOpen(true)}><${Icon} name="note" size=${14} /> إضافة ملاحظة للطلب</button>`}
        </div>`}
      </div>`}

      ${!order &&
      draft.length === 0 &&
      html`<${Empty}
        compact
        icon="bag"
        title=${`لا يوجد طلب لطاولة ${table.number}`}
        text="أضف الأطباق من المنيو بزر + ثم أرسل الطلب."
      />`}
    </div>

    <div class="op-foot">
      ${order &&
      html`<div class="op-total-row"><span>إجمالي الطلب #${order.id}</span><strong class="num">${money(order.total)}</strong></div>`}
      ${draft.length > 0 &&
      html`<div class="op-total-row op-total-draft"><span>${order ? 'الإضافات' : 'الإجمالي'} · ${draftCount} صنف</span><strong class="num">${money(draftTotal)}</strong></div>`}
      ${draft.length > 0 && order && editable &&
      html`<div class="op-total-row op-total-grand"><span>الإجمالي بعد الإضافة</span><strong class="num">${money(order.total + draftTotal)}</strong></div>`}

      ${draft.length > 0
        ? html`<${Button} variant="primary" size="lg" block icon="send" loading=${sending} onClick=${onSend}>${sendLabel}<//>
            ${order && !editable && html`<p class="op-hint">الطلب #${order.id} ${ORDER_STATUS[order.status]?.label} ولا يقبل إضافات، سيُرسل كطلب جديد.</p>`}`
        : order &&
          html`<div class="op-actions">
            ${ORDER_NEXT[order.status].map(
              (a) => html`<${Button}
                key=${a.status}
                variant=${a.status === 'paid' ? 'primary' : 'success'}
                icon=${a.icon}
                loading=${statusBusy === a.status}
                disabled=${Boolean(statusBusy)}
                onClick=${() => onStatus(order, a.status)}
              >${a.label}<//>`,
            )}
            <div class="op-actions-row">
              <${Button} variant="secondary" size="sm" icon="projector" onClick=${() => onShowOrder(order)}>اعرض على الطاولة<//>
              ${ORDER_CANCELLABLE.includes(order.status) &&
              html`<${Button}
                variant="ghost"
                size="sm"
                icon="x"
                disabled=${Boolean(statusBusy)}
                onClick=${async () => {
                  const ok = await confirmDialog({
                    title: `إلغاء الطلب #${order.id}؟`,
                    message: 'سيُلغى الطلب ولن يُحتسب في المبيعات. لا يمكن التراجع.',
                    confirmLabel: 'إلغاء الطلب',
                    cancelLabel: 'رجوع',
                    danger: true,
                  });
                  if (ok) onStatus(order, 'cancelled');
                }}
              >إلغاء الطلب<//>`}
            </div>
          </div>`}
    </div>
  </div>`;
}

function DraftLine({ line, dish, onQty, onNotes }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef();
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  return html`<li class="op-line op-line-draft">
    <div class="op-line-main">
      <span class="op-line-name">${dish?.name_ar ?? 'طبق محذوف'}</span>
      ${editing
        ? html`<input
            class="input op-note-input"
            placeholder="مثال: بدون بصل"
            value=${line.notes}
            aria-label="ملاحظة الصنف"
            ref=${inputRef}
            onInput=${(e) => onNotes(e.currentTarget.value)}
            onBlur=${() => setEditing(false)}
            onKeyDown=${(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />`
        : line.notes
          ? html`<button type="button" class="op-line-note" onClick=${() => setEditing(true)}><${Icon} name="note" size=${13} />${line.notes}</button>`
          : html`<button type="button" class="link-btn op-add-note" onClick=${() => setEditing(true)}><${Icon} name="note" size=${13} /> ملاحظة</button>`}
    </div>
    <${Stepper} size="sm" value=${line.quantity} min=${1} onChange=${onQty} />
    <span class="op-line-total num">${money((dish?.price ?? 0) * line.quantity)}</span>
  </li>`;
}
