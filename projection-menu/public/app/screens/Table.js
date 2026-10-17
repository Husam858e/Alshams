// Table screen: what the table's projector shows (live preview + scene
// controls), the menu to build an order, and the order itself.
// Waiters and the owner take orders; designers use it to test scenes.

import { html } from 'htm/preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../components/icons.js';
import { confirmDialog } from '../components/overlay.js';
import { toast } from '../components/toast.js';
import { Button, Empty, ErrorState, IconButton, Segmented, Skeleton, cx } from '../components/ui.js';
import { api } from '../lib/api.js';
import { NOUNS, count } from '../lib/format.js';
import { useMedia } from '../lib/hooks.js';
import { TABLE_STATUS } from '../lib/labels.js';
import { navigate } from '../lib/router.js';
import { allDishes, allTables, load, patchResource, upsertOrder, useResource, useStore } from '../lib/store.js';
import { MenuBrowser } from './table/MenuBrowser.js';
import { OrderPanel } from './table/OrderPanel.js';
import { ScenePanel } from './table/ScenePanel.js';

// Unsent order drafts survive leaving the screen (per table, this tab only).
const drafts = new Map();
let lineSeq = 0;

export default function TableScreen({ params, user }) {
  const tableId = Number(params.id);
  const canOrder = user.role !== 'designer';
  const { data: floor, error: floorError, reload } = useResource('floor');
  const { data: menu } = useResource('menu');
  const orders = useStore((s) => s.orders);
  useEffect(() => {
    if (canOrder) load('orders').catch(() => {});
  }, []);

  const table = useMemo(() => allTables(floor).find((t) => t.id === tableId) ?? null, [floor, tableId]);
  const area = floor?.areas.find((a) => a.id === table?.area_id);
  const dishes = useMemo(() => new Map(allDishes(menu).map((d) => [d.id, d])), [menu]);
  const dishById = useCallback((id) => dishes.get(id), [dishes]);

  const tableOrders = useMemo(
    () => (orders ?? []).filter((o) => o.table_id === tableId).sort((a, b) => a.id - b.id),
    [orders, tableId],
  );

  // Selected order: the newest active one unless the waiter picked another.
  const [picked, setPicked] = useState(undefined);
  const selected = picked !== undefined && (picked === null || tableOrders.some((o) => o.id === picked)) ? picked : (tableOrders.at(-1)?.id ?? null);
  const activeOrder = tableOrders.find((o) => o.id === selected) ?? tableOrders.at(-1) ?? null;

  // Draft lines
  const [draft, setDraftState] = useState(() => drafts.get(tableId)?.lines ?? []);
  const [orderNotes, setOrderNotesState] = useState(() => drafts.get(tableId)?.notes ?? '');
  const setDraft = (fn) =>
    setDraftState((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      drafts.set(tableId, { lines: next, notes: drafts.get(tableId)?.notes ?? '' });
      return next;
    });
  const setOrderNotes = (v) => {
    setOrderNotesState(v);
    drafts.set(tableId, { lines: drafts.get(tableId)?.lines ?? [], notes: v });
  };
  const draftQty = (dishId) => draft.filter((l) => l.dish_id === dishId && !l.notes).reduce((n, l) => n + l.quantity, 0);
  const addDish = (dish) => {
    setDraft((lines) => {
      const same = lines.find((l) => l.dish_id === dish.id && !l.notes);
      if (same) return lines.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l));
      return [...lines, { key: ++lineSeq, dish_id: dish.id, quantity: 1, notes: '' }];
    });
  };
  const setDishQty = (dish, n) => {
    setDraft((lines) => {
      const same = lines.find((l) => l.dish_id === dish.id && !l.notes);
      if (!same) return lines;
      return n <= 0 ? lines.filter((l) => l !== same) : lines.map((l) => (l === same ? { ...l, quantity: n } : l));
    });
  };
  const setLineQty = (key, n) => setDraft((lines) => (n <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, quantity: n } : l))));
  const setLineNotes = (key, notes) => setDraft((lines) => lines.map((l) => (l.key === key ? { ...l, notes } : l)));

  // ── Scenes ──
  const [delivery, setDelivery] = useState(null);
  const [sceneBusy, setSceneBusy] = useState(false);
  const show = async (scene) => {
    if (!table) return;
    setSceneBusy(true);
    setDelivery({ state: 'sending' });
    const before = table.scene;
    // Optimistic: the tile and the preview label switch at once.
    patchScene(tableId, { ...scene, at: new Date().toISOString(), by: user.name });
    try {
      const res = await api.setScene(tableId, scene);
      patchScene(tableId, res.scene);
      setDelivery({ state: 'done', result: res.delivered });
    } catch (err) {
      patchScene(tableId, before);
      setDelivery({ state: 'error', message: err.message });
      toast.error(err);
    } finally {
      setSceneBusy(false);
    }
  };
  useEffect(() => {
    if (delivery?.state !== 'done') return undefined;
    const t = setTimeout(() => setDelivery(null), 6000);
    return () => clearTimeout(t);
  }, [delivery]);

  // ── Orders ──
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!draft.length || sending) return;
    setSending(true);
    const items = draft.map((l) => ({ dish_id: l.dish_id, quantity: l.quantity, notes: l.notes.trim() || undefined }));
    const target = tableOrders.find((o) => o.id === selected && ['open', 'preparing'].includes(o.status));
    try {
      let order;
      if (target) {
        for (const item of items) order = await api.addOrderItem(target.id, item);
      } else {
        order = await api.createOrder({ table_id: tableId, items, notes: orderNotes.trim() || undefined });
      }
      upsertOrder(order);
      // The server marks a free table occupied; show it before the live refresh.
      if (table.status === 'free') patchTable(tableId, { status: 'occupied' });
      setPicked(order.id);
      setDraft([]);
      setOrderNotes('');
      toast.ok(target ? `أُضيفت الأصناف إلى الطلب #${order.id}` : `أُرسل الطلب #${order.id} لطاولة ${table.number}`, {
        action: { label: 'اعرضه على الطاولة', onClick: () => show({ type: 'order', orderId: order.id }) },
      });
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  };

  const setItemQty = async (order, item, n) => {
    try {
      if (n <= 0) {
        const ok = await confirmDialog({
          title: `حذف "${item.dish_name}"؟`,
          message: `سيُحذف الصنف من الطلب #${order.id}.`,
          confirmLabel: 'حذف',
          danger: true,
        });
        if (!ok) return;
        upsertOrder(await api.removeOrderItem(order.id, item.id));
      } else {
        upsertOrder(await api.updateOrderItem(order.id, item.id, { quantity: n }));
      }
    } catch (err) {
      toast.error(err);
    }
  };

  const [statusBusy, setStatusBusy] = useState(null);
  const setStatus = async (order, status) => {
    setStatusBusy(status);
    try {
      const updated = await api.setOrderStatus(order.id, status);
      upsertOrder(updated);
      const msg = { preparing: 'بدأ التحضير', served: 'تم التقديم', paid: 'تم الدفع — شكراً!', cancelled: 'أُلغي الطلب' }[status];
      toast.ok(`الطلب #${order.id}: ${msg}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setStatusBusy(null);
    }
  };

  const setTableStatus = async (status) => {
    const prev = table.status;
    patchTable(tableId, { status });
    try {
      await api.setTableStatus(tableId, status);
    } catch (err) {
      patchTable(tableId, { status: prev });
      toast.error(err);
    }
  };

  // ── Layout ──
  const wide = useMedia('(min-width: 1200px)');
  const medium = useMedia('(min-width: 760px)');
  const [tab, setTab] = useState(canOrder ? 'menu' : 'show');

  if (floorError && !floor) return html`<div class="page"><${ErrorState} error=${floorError} onRetry=${reload} /></div>`;
  if (!floor) return html`<${TableSkeleton} />`;
  if (!table) {
    return html`<div class="page">
      <${Empty} icon="floor" title="الطاولة غير موجودة" text="ربما حُذفت أو تغيّر رقمها." action=${html`<${Button} icon="chevron-right" onClick=${() => navigate('/floor')}>العودة إلى الطاولات<//>`} />
    </div>`;
  }

  const scenePanel = html`<${ScenePanel}
    table=${table}
    menu=${menu}
    scene=${table.scene}
    onShow=${show}
    delivery=${delivery}
    busy=${sceneBusy}
    activeOrder=${canOrder ? activeOrder : null}
    compact=${!wide}
  />`;
  const browser = html`<${MenuBrowser}
    menu=${menu}
    canOrder=${canOrder}
    draftQty=${draftQty}
    onAdd=${addDish}
    onSetQty=${setDishQty}
    onShow=${show}
    shownDishId=${table.scene?.type === 'dish' ? table.scene.dishId : null}
    busy=${sceneBusy}
  />`;
  const orderPanel =
    canOrder &&
    html`<${OrderPanel}
      table=${table}
      orders=${tableOrders}
      selected=${selected}
      onSelect=${setPicked}
      draft=${draft}
      dishById=${dishById}
      onDraftQty=${setLineQty}
      onDraftNotes=${setLineNotes}
      onClearDraft=${() => setDraft([])}
      onSend=${send}
      sending=${sending}
      onItemQty=${setItemQty}
      onStatus=${setStatus}
      statusBusy=${statusBusy}
      onShowOrder=${(o) => show({ type: 'order', orderId: o.id })}
      orderNotes=${orderNotes}
      setOrderNotes=${setOrderNotes}
    />`;

  const draftCount = draft.reduce((n, l) => n + l.quantity, 0);
  const tabs = [
    !wide && !medium && { value: 'show', label: 'العرض', icon: 'projector' },
    !wide && { value: 'menu', label: 'المنيو', icon: 'book' },
    !wide && canOrder && { value: 'order', label: draftCount ? `الطلب (${draftCount})` : 'الطلب', icon: 'receipt' },
  ].filter(Boolean);
  const currentTab = tabs.some((t) => t.value === tab) ? tab : tabs[0]?.value;

  return html`<div class=${cx('table-screen', wide ? 'ts-wide' : medium ? 'ts-medium' : 'ts-phone', !canOrder && 'ts-no-order')}>
    <${TableHeader} table=${table} area=${area} user=${user} onStatus=${setTableStatus} canOrder=${canOrder} />
    ${tabs.length > 1 &&
    html`<div class="ts-tabs">
      <${Segmented} options=${tabs} value=${currentTab} onChange=${setTab} label="أقسام شاشة الطاولة" class="segmented-block" />
    </div>`}
    <div class="ts-body">
      ${wide
        ? html`<div class="ts-col ts-menu">${browser}</div>
            ${canOrder && html`<div class="ts-col ts-order">${orderPanel}</div>`}
            <div class="ts-col ts-show">${scenePanel}</div>`
        : medium
          ? html`<div class="ts-col ts-main">${currentTab === 'order' ? orderPanel : browser}</div>
              <div class="ts-col ts-show">${scenePanel}</div>`
          : html`<div class="ts-col ts-main">${currentTab === 'show' ? scenePanel : currentTab === 'order' ? orderPanel : browser}</div>`}
    </div>
  </div>`;
}

function TableHeader({ table, area, onStatus, canOrder }) {
  const proj = table.projectors;
  const online = proj.filter((p) => p.online).length;
  return html`<header class="ts-head">
    <${IconButton} icon="chevron-right" label="العودة إلى الطاولات" variant="glass" onClick=${() => navigate('/floor')} />
    <div class="ts-title">
      <span class="ts-number num">${table.number}</span>
      <div class="ts-title-text">
        <h1>طاولة ${table.number}</h1>
        <span class="muted">${area?.name ?? 'بدون قسم'} · ${count(table.seats, NOUNS.seat)}</span>
      </div>
    </div>
    <span class=${cx('ts-proj', !proj.length ? 'proj-none' : online === proj.length ? 'proj-on' : online ? 'proj-part' : 'proj-off')}>
      <${Icon} name="projector" size=${16} />
      <span class="dot"></span>
      <span class="ts-proj-text">${!proj.length ? 'بدون جهاز عرض' : online === proj.length ? 'العرض متصل' : online ? `${online}/${proj.length} متصل` : 'العرض غير متصل'}</span>
    </span>
    <div class="spacer"></div>
    ${canOrder
      ? html`<${Segmented}
          label="حالة الطاولة"
          value=${table.status}
          onChange=${onStatus}
          options=${Object.entries(TABLE_STATUS).map(([value, s]) => ({ value, label: s.label, dot: s.color }))}
        />`
      : html`<span class="badge badge-gold"><${Icon} name="palette" size=${13} /> وضع تجربة العرض</span>`}
  </header>`;
}

function TableSkeleton() {
  return html`<div class="table-screen ts-wide">
    <div class="ts-head"><${Skeleton} w=${260} h=${44} r="12px" /></div>
    <div class="ts-body">
      <div class="ts-col ts-menu"><${Skeleton} h="100%" r="18px" /></div>
      <div class="ts-col ts-order"><${Skeleton} h="100%" r="18px" /></div>
      <div class="ts-col ts-show"><${Skeleton} h=${240} r="18px" /></div>
    </div>
  </div>`;
}

// Local cache edits so the UI reacts before the live event comes back.
function mapTable(floor, id, fn) {
  const map = (t) => (t.id === id ? fn(t) : t);
  return { ...floor, areas: floor.areas.map((a) => ({ ...a, tables: a.tables.map(map) })), unassigned: floor.unassigned.map(map) };
}
function patchScene(id, scene) {
  patchResource('floor', (f) => mapTable(f, id, (t) => ({ ...t, scene })));
}
function patchTable(id, patch) {
  patchResource('floor', (f) => mapTable(f, id, (t) => ({ ...t, ...patch })));
}
