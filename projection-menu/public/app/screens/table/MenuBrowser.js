// Menu browser of the table screen: search, category chips and dish cards.
// "+" adds to the order draft; the projector button shows the dish on the table.

import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../../components/icons.js';
import { Chip, Empty, Img, SearchInput, Skeleton, Stepper, cx } from '../../components/ui.js';
import { money } from '../../lib/format.js';

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْ]/g, '');

export function MenuBrowser({ menu, canOrder, draftQty, onAdd, onSetQty, onShow, shownDishId, busy }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');

  const groups = useMemo(() => {
    if (!menu) return [];
    const list = menu.categories.map((c) => ({ id: c.id, name: c.name_ar, icon: c.icon, dishes: c.dishes }));
    if (menu.uncategorized.length) list.push({ id: 'none', name: 'أخرى', icon: '', dishes: menu.uncategorized });
    return list;
  }, [menu]);

  const q = norm(query.trim());
  const filtered = groups
    .filter((g) => cat === 'all' || String(g.id) === String(cat) || q)
    .map((g) => ({
      ...g,
      dishes: q ? g.dishes.filter((d) => norm(`${d.name_ar} ${d.name_en ?? ''} ${d.description_ar ?? ''}`).includes(q)) : g.dishes,
    }))
    .filter((g) => g.dishes.length);

  return html`<div class="menu-browser">
    <div class="mb-head">
      <${SearchInput} value=${query} onInput=${setQuery} placeholder="ابحث عن طبق…" label="ابحث في المنيو" />
      <div class="chips mb-cats">
        <${Chip} active=${cat === 'all'} onClick=${() => setCat('all')}>الكل<//>
        ${groups.map((g) => html`<${Chip} key=${g.id} active=${String(cat) === String(g.id)} icon=${g.icon || undefined} onClick=${() => setCat(g.id)}>${g.name}<//>`)}
      </div>
    </div>
    <div class="mb-body">
      ${!menu
        ? html`<div class="dish-grid">${Array.from({ length: 6 }, (_, i) => html`<${Skeleton} key=${i} h=${220} r="16px" />`)}</div>`
        : filtered.length === 0
          ? html`<${Empty} compact icon="search" title=${q ? 'لا توجد نتائج' : 'المنيو فارغ'} text=${q ? `لا يوجد طبق يطابق "${query}"` : 'لم تُضف أطباق بعد.'} />`
          : filtered.map(
              (g) => html`<section class="mb-group" key=${g.id}>
                ${(cat === 'all' || q) && html`<h3 class="mb-group-title">${g.icon && html`<span aria-hidden="true">${g.icon}</span>`}${g.name}</h3>`}
                <div class="dish-grid">
                  ${g.dishes.map(
                    (d) => html`<${DishCard}
                      key=${d.id}
                      dish=${d}
                      canOrder=${canOrder}
                      qty=${draftQty(d.id)}
                      onAdd=${() => onAdd(d)}
                      onSetQty=${(n) => onSetQty(d, n)}
                      onShow=${() => onShow({ type: 'dish', dishId: d.id })}
                      shown=${shownDishId === d.id}
                      busy=${busy}
                    />`,
                  )}
                </div>
              </section>`,
            )}
    </div>
  </div>`;
}

function DishCard({ dish: d, canOrder, qty, onAdd, onSetQty, onShow, shown, busy }) {
  const unavailable = !d.is_available;
  return html`<article class=${cx('dish-card', unavailable && 'is-unavailable', qty > 0 && 'in-draft', shown && 'is-shown')}>
    <div class="dish-media">
      <${Img} src=${d.image_url} alt="" class="dish-img" />
      ${d.video_url && html`<span class="dish-media-tag" title="يحتوي فيديو"><${Icon} name="video" size=${14} /></span>`}
      ${shown && html`<span class="dish-shown"><span class="dot dot-pulse"></span>على الطاولة</span>`}
      <button
        type="button"
        class="dish-show"
        disabled=${busy || unavailable}
        onClick=${onShow}
        aria-label=${`اعرض ${d.name_ar} على الطاولة`}
        title="اعرض على الطاولة"
      >
        <${Icon} name="projector" size=${18} />
      </button>
    </div>
    <div class="dish-body">
      <div class="dish-name">${d.name_ar}</div>
      ${d.description_ar && html`<div class="dish-desc">${d.description_ar}</div>`}
      <div class="dish-foot">
        <span class="dish-price num">${money(d.price)}</span>
        ${unavailable
          ? html`<span class="badge badge-muted">غير متوفر</span>`
          : canOrder &&
            (qty > 0
              ? html`<${Stepper} size="sm" value=${qty} min=${1} onChange=${onSetQty} />`
              : html`<button type="button" class="dish-add" onClick=${onAdd} aria-label=${`أضف ${d.name_ar} إلى الطلب`}>
                  <${Icon} name="plus" size=${20} />
                </button>`)}
      </div>
    </div>
  </article>`;
}
