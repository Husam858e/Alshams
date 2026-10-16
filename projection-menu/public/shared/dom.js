// Minimal DOM helpers shared by the tablet and the dashboard (no framework,
// no build step: the pages must load fast from a LAN server, even offline).

// h('button', { class: 'btn', onClick: fn }, 'نص') — text children are always
// inserted as text nodes, so user content can't inject HTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (key === 'class') el.className = v;
    else if (key === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (key === 'dataset') Object.assign(el.dataset, v);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), v);
    else if (key === 'value') value = v;
    else if (key === 'checked' || key === 'selected') el[key] = Boolean(v);
    else el.setAttribute(key, v === true ? '' : v);
  }
  el.append(
    ...children
      .flat(Infinity)
      .filter((c) => c != null && c !== false)
      .map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))),
  );
  if (value !== undefined) el.value = value; // after children so <select> has its options
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function mount(target, ...nodes) {
  target.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
}

let toastTimer;
export function toast(message, kind = 'info') {
  let el = $('#toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export function formatMoney(amount, currency = '') {
  const n = new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(amount);
  return currency ? `${n} ${currency}` : n;
}

export const ORDER_STATUS = {
  placed: 'تم الاستلام',
  preparing: 'قيد التحضير',
  served: 'تم التقديم',
  closed: 'مغلق',
  cancelled: 'ملغي',
};
