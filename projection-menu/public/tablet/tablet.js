// Ordering interface for the tablet on the table. Opened with the pairing
// link from the dashboard: /tablet/?table=T01&key=<access key>
//
// Browsing a dish lights it up on the table in front of the chosen seat
// (POST /api/tablet/preview); closing it returns that seat to the idle loop.

import { $, ORDER_STATUS, formatMoney, h, mount, toast } from '/shared/dom.js';

const IDLE_TIMEOUT_MS = 90_000; // close sheets (and stop previews) when nobody touches the tablet
const ORDERS_REFRESH_MS = 10_000;
const PAIRING_KEY = 'projection-menu:pairing';

const pairing = loadPairing();
const state = {
  menu: null,
  seat: 1,
  category: null,
  cart: [], // { dish, qty, seat, notes }
  openToken: null, // new object per opened sheet, so a late preview reply can tell it is stale
  openSeat: null,
  previewSeat: null,
  ordersTimer: null,
};

// ── API ────────────────────────────────────────────────────────────
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/tablet${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-table-code': pairing.code ?? '',
      'x-table-key': pairing.key ?? '',
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'حدث خطأ غير متوقع'), { status: res.status });
  return data;
}

// The pairing link is remembered so a kiosk browser that restarts on the
// bare /tablet/ URL stays paired with its table.
function loadPairing() {
  const params = new URLSearchParams(location.search);
  if (params.get('table') && params.get('key')) {
    const fresh = { code: params.get('table'), key: params.get('key') };
    try {
      localStorage.setItem(PAIRING_KEY, JSON.stringify(fresh));
    } catch {
      // Private mode / storage disabled: the URL still works.
    }
    return fresh;
  }
  try {
    return JSON.parse(localStorage.getItem(PAIRING_KEY)) ?? {};
  } catch {
    return {};
  }
}

const money = (n) => formatMoney(n, state.menu?.currency);

// ── Menu ───────────────────────────────────────────────────────────
async function init() {
  try {
    state.menu = await api('/menu');
  } catch (err) {
    return fatal(err.status === 401 ? err.message : 'تعذر تحميل المنيو. تحقق من اتصال الشبكة ثم أعد المحاولة.');
  }
  state.category = state.menu.categories[0]?.id ?? null;
  $('#table-name').textContent = state.menu.table.name;
  renderSeats();
  renderCategories();
  renderMenu();
  renderCartButton();
}

function renderSeats() {
  const seats = Array.from({ length: state.menu.table.seats }, (_, i) => i + 1);
  mount(
    $('#seats'),
    seats.map((n) =>
      h(
        'button',
        {
          class: 'chip',
          role: 'radio',
          'aria-checked': String(n === state.seat),
          onClick: () => {
            state.seat = n;
            renderSeats();
          },
        },
        n,
      ),
    ),
  );
}

function renderCategories() {
  mount(
    $('#categories'),
    state.menu.categories.map((c) =>
      h(
        'button',
        {
          class: 'tab',
          role: 'tab',
          'aria-selected': String(c.id === state.category),
          onClick: () => {
            state.category = c.id;
            renderCategories();
            renderMenu();
            scrollTo({ top: 0, behavior: 'smooth' });
          },
        },
        c.name_ar,
      ),
    ),
  );
}

function renderMenu() {
  const category = state.menu.categories.find((c) => c.id === state.category);
  if (!category) return mount($('#menu'), h('p', { class: 'empty' }, 'لا توجد أطباق متاحة حالياً'));
  mount(
    $('#menu'),
    category.dishes.map((dish) =>
      h(
        'button',
        { class: 'card', onClick: () => openDish(dish) },
        h(
          'div',
          { class: 'thumb' },
          dish.thumbnail_url
            ? h('img', { src: dish.thumbnail_url, alt: '', loading: 'lazy' })
            : h('div', { class: 'placeholder' }, '🍽'),
          dish.has_preview && h('span', { class: 'glow-badge' }, '✨ عرض على الطاولة'),
        ),
        h(
          'div',
          { class: 'body' },
          h('h3', {}, dish.name_ar),
          dish.description_ar && h('p', {}, dish.description_ar),
          h('span', { class: 'price' }, money(dish.price)),
        ),
      ),
    ),
  );
}

// ── Dish sheet + table preview ─────────────────────────────────────
const PREVIEW_MESSAGES = {
  no_projection: 'لا يوجد عرض ضوئي لهذا الطبق',
  no_projector: 'لا يوجد جهاز عرض مرتبط بهذه الطاولة',
  failed: 'جهاز العرض غير متصل حالياً',
};

async function openDish(dish) {
  const sheet = $('#dish-sheet');
  const seat = state.seat;
  let qty = 1;
  const token = {}; // the same dish can be reopened (on another seat) before the reply
  state.openToken = token;
  state.openSeat = seat;

  const status = h(
    'div',
    { class: 'projection-status' },
    dish.has_preview ? 'جارٍ تشغيل العرض على الطاولة...' : PREVIEW_MESSAGES.no_projection,
  );
  const qtyEl = h('span', {}, qty);
  const step = (delta) => {
    qty = Math.min(20, Math.max(1, qty + delta));
    qtyEl.textContent = qty;
  };
  const notes = h('textarea', { placeholder: 'ملاحظات (اختياري): بدون بصل، صوص إضافي...', maxlength: '300' });

  mount(
    sheet,
    h(
      'div',
      { class: 'sheet-body' },
      sheetHead(dish.name_ar, () => sheet.close()),
      dish.thumbnail_url && h('div', { class: 'hero' }, h('img', { src: dish.thumbnail_url, alt: '' })),
      dish.description_ar && h('p', { class: 'muted' }, dish.description_ar),
      status,
      h(
        'div',
        { class: 'row' },
        h(
          'div',
          { class: 'stepper' },
          h('button', { onClick: () => step(1), 'aria-label': 'زيادة' }, '+'),
          qtyEl,
          h('button', { onClick: () => step(-1), 'aria-label': 'إنقاص' }, '−'),
        ),
        h('span', { class: 'price' }, money(dish.price)),
      ),
      notes,
      h(
        'button',
        { class: 'primary', onClick: () => addToCart(dish, qty, notes.value.trim(), seat) },
        `أضف للسلة — مقعد ${seat}`,
      ),
    ),
  );
  sheet.showModal();

  if (!dish.has_preview) return;
  try {
    const result = await api('/preview', { method: 'POST', body: { dish_id: dish.id, seat_no: seat } });
    const live = result.status === 'sent';
    if (state.openToken !== token) {
      // Closed before the projector answered: switch it back off — unless
      // another dish is already showing on that same seat (it replaced this one).
      if (live && state.openSeat !== seat) stopPreview(seat);
      return;
    }
    state.previewSeat = live ? seat : null;
    status.dataset.state = live ? 'live' : 'off';
    status.textContent = live ? `يُعرض الآن على الطاولة أمام المقعد ${seat}` : PREVIEW_MESSAGES[result.status];
  } catch {
    status.textContent = 'تعذر تشغيل العرض';
  }
}

function stopPreview(seat) {
  api('/preview/stop', { method: 'POST', body: { seat_no: seat } }).catch(() => {});
}

// Runs for every way the sheet can close (button, Esc, backdrop, idle timer).
$('#dish-sheet').addEventListener('close', () => {
  state.openToken = null;
  state.openSeat = null;
  if (state.previewSeat) stopPreview(state.previewSeat);
  state.previewSeat = null;
});

function addToCart(dish, qty, notes, seat) {
  const same = state.cart.find((i) => i.dish.id === dish.id && i.seat === seat && i.notes === notes);
  if (same) same.qty += qty;
  else state.cart.push({ dish, qty, seat, notes });
  renderCartButton();
  $('#dish-sheet').close();
  toast(`أُضيف "${dish.name_ar}" إلى السلة`, 'ok');
}

// ── Cart ───────────────────────────────────────────────────────────
const cartTotal = () => state.cart.reduce((sum, i) => sum + i.dish.price * i.qty, 0);

function renderCartButton() {
  const count = state.cart.reduce((sum, i) => sum + i.qty, 0);
  $('#cart-btn').hidden = count === 0;
  $('#cart-count').textContent = count;
  $('#cart-total').textContent = money(cartTotal());
}

function renderCart() {
  const sheet = $('#cart-sheet');
  const close = () => sheet.close();
  if (!state.cart.length) {
    return mount(sheet, h('div', { class: 'sheet-body' }, sheetHead('السلة', close), h('p', { class: 'empty' }, 'السلة فارغة')));
  }
  const change = (item, delta) => {
    item.qty += delta;
    if (item.qty <= 0) state.cart.splice(state.cart.indexOf(item), 1);
    renderCart();
    renderCartButton();
  };
  const confirm = h('button', { class: 'primary', onClick: () => placeOrder(confirm) }, 'تأكيد الطلب');
  mount(
    sheet,
    h(
      'div',
      { class: 'sheet-body' },
      sheetHead('السلة', close),
      h(
        'div',
        {},
        state.cart.map((item) =>
          h(
            'div',
            { class: 'line-item' },
            h(
              'div',
              { class: 'info' },
              h('strong', {}, item.dish.name_ar),
              h('small', {}, [`مقعد ${item.seat}`, item.notes].filter(Boolean).join(' · ')),
            ),
            h(
              'div',
              { class: 'stepper' },
              h('button', { onClick: () => change(item, 1) }, '+'),
              h('span', {}, item.qty),
              h('button', { onClick: () => change(item, -1) }, '−'),
            ),
            h('span', { class: 'price' }, money(item.dish.price * item.qty)),
          ),
        ),
      ),
      h('div', { class: 'total' }, h('span', {}, 'الإجمالي'), h('span', { class: 'price' }, money(cartTotal()))),
      h('div', { class: 'row' }, confirm),
    ),
  );
}

async function placeOrder(button) {
  button.disabled = true;
  try {
    const order = await api('/orders', {
      method: 'POST',
      body: {
        items: state.cart.map((i) => ({ dish_id: i.dish.id, quantity: i.qty, seat_no: i.seat, notes: i.notes || undefined })),
      },
    });
    state.cart = [];
    renderCartButton();
    $('#cart-sheet').close();
    toast(`تم إرسال طلبك رقم ${order.id} ✨`, 'ok');
    openOrders();
  } catch (err) {
    toast(err.message, 'error');
    button.disabled = false;
  }
}

// ── My orders ──────────────────────────────────────────────────────
async function renderOrders() {
  const sheet = $('#orders-sheet');
  let orders;
  try {
    orders = await api('/orders');
  } catch (err) {
    return toast(err.message, 'error');
  }
  mount(
    sheet,
    h(
      'div',
      { class: 'sheet-body' },
      sheetHead('طلباتي', () => sheet.close()),
      orders.length
        ? orders.map((o) =>
            h(
              'div',
              { class: 'order' },
              h(
                'div',
                { class: 'row' },
                h('strong', { style: { flex: 1 } }, `طلب رقم ${o.id}`),
                h('span', { class: 'status-pill', dataset: { status: o.status } }, ORDER_STATUS[o.status]),
              ),
              o.items.map((i) => h('small', { class: 'muted' }, `${i.quantity} × ${i.dish_name}${i.seat_no ? ` — مقعد ${i.seat_no}` : ''}`)),
              h('span', { class: 'price' }, money(o.total)),
            ),
          )
        : h('p', { class: 'empty' }, 'لا توجد طلبات نشطة'),
    ),
  );
}

async function openOrders() {
  await renderOrders();
  const sheet = $('#orders-sheet');
  if (!sheet.open) sheet.showModal();
  clearInterval(state.ordersTimer);
  state.ordersTimer = setInterval(renderOrders, ORDERS_REFRESH_MS);
}
$('#orders-sheet').addEventListener('close', () => clearInterval(state.ordersTimer));

// ── Shared bits ────────────────────────────────────────────────────
function sheetHead(title, onClose) {
  return h(
    'div',
    { class: 'sheet-head' },
    h('h2', {}, title),
    h('button', { class: 'close', onClick: onClose, 'aria-label': 'إغلاق' }, '✕'),
  );
}

function fatal(message) {
  const el = $('#fatal');
  el.hidden = false;
  el.textContent = message;
}

// Tapping the dimmed backdrop closes a sheet.
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
}

let idleTimer;
const resetIdle = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  }, IDLE_TIMEOUT_MS);
};
addEventListener('pointerdown', resetIdle, { passive: true });
resetIdle();

$('#cart-btn').addEventListener('click', () => {
  renderCart();
  $('#cart-sheet').showModal();
});
$('#orders-btn').addEventListener('click', openOrders);

init();
