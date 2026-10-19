// Owner's price board: every dish with an inline price field. Enter or
// leaving the field saves; Esc restores. Dishes without a price (added by
// the designer) are flagged so none is forgotten.

import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../../components/icons.js';
import { MediaThumb } from '../../components/media.js';
import { toast } from '../../components/toast.js';
import { Chip, Empty, SearchInput, cx } from '../../components/ui.js';
import { api } from '../../lib/api.js';
import { currency, money } from '../../lib/format.js';
import { load } from '../../lib/store.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export function PriceBoard({ menu }) {
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const groups = useMemo(() => {
    const list = menu.categories.map((c) => ({ id: c.id, name: c.name_ar, icon: c.icon, dishes: c.dishes }));
    if (menu.uncategorized.length) list.push({ id: 'none', name: 'بدون تصنيف', icon: '', dishes: menu.uncategorized });
    return list;
  }, [menu]);
  const all = groups.flatMap((g) => g.dishes);
  const missing = all.filter((d) => !(d.price > 0)).length;
  const q = norm(query.trim());
  const shown = groups
    .map((g) => ({ ...g, dishes: g.dishes.filter((d) => (!onlyMissing || !(d.price > 0)) && (!q || norm(`${d.name_ar} ${d.name_en ?? ''}`).includes(q))) }))
    .filter((g) => g.dishes.length);

  return html`<div class="price-board">
    <div class="toolbar">
      <${SearchInput} value=${query} onInput=${setQuery} placeholder="ابحث عن طبق…" />
      <${Chip} icon="alert" active=${onlyMissing} onClick=${() => setOnlyMissing(!onlyMissing)} count=${missing}>بدون سعر<//>
      <div class="spacer"></div>
      <span class="muted price-hint"><${Icon} name="info" size=${15} /> اكتب السعر ثم Enter — يُحفظ ويظهر على الطاولات فوراً</span>
    </div>
    ${shown.length === 0
      ? html`<${Empty} compact icon=${onlyMissing ? 'check-circle' : 'search'} title=${onlyMissing ? 'كل الأطباق مسعّرة' : 'لا توجد نتائج'} />`
      : html`<div class="price-groups">
          ${shown.map(
            (g) => html`<section class="panel price-group" key=${g.id}>
              <div class="panel-head">
                <div class="panel-title">${g.icon && html`<span aria-hidden="true">${g.icon}</span>`}${g.name}</div>
                <span class="chip-count">${g.dishes.length}</span>
              </div>
              <ul class="price-rows" role="list">
                ${g.dishes.map((d) => html`<${PriceRow} key=${d.id} dish=${d} />`)}
              </ul>
            </section>`,
          )}
        </div>`}
  </div>`;
}

function PriceRow({ dish: d }) {
  const [value, setValue] = useState(String(d.price ?? 0));
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  useEffect(() => {
    if (state !== 'saving') setValue(String(d.price ?? 0));
  }, [d.price]);
  useEffect(() => {
    if (state !== 'saved') return undefined;
    const t = setTimeout(() => setState('idle'), 1800);
    return () => clearTimeout(t);
  }, [state]);

  const dirty = Number(value) !== Number(d.price) && value !== '';
  // Reads the field itself: Enter can blur before the last keystroke re-rendered.
  const commit = async (e) => {
    const raw = e.currentTarget.value.replace(/[^\d.]/g, '');
    if (raw === '' || Number(raw) === Number(d.price)) return setValue(String(d.price ?? 0));
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) {
      setState('error');
      return toast.error('سعر غير صالح');
    }
    setState('saving');
    try {
      await api.updateDish(d.id, { price });
      await load('menu', { force: true }).catch(() => {});
      setState('saved');
      toast.ok(`سعر "${d.name_ar}": ${money(price)}`);
    } catch (err) {
      setState('error');
      toast.error(err);
    }
  };

  return html`<li class=${cx('price-row', !(d.price > 0) && 'is-missing', dirty && 'is-dirty')}>
    <span class="price-thumb"><${MediaThumb} url=${d.image_url} /></span>
    <span class="price-name">
      <span class="truncate">${d.name_ar}</span>
      ${!d.is_available && html`<span class="badge badge-muted">غير متوفر</span>`}
    </span>
    <label class="price-input">
      <span class="sr-only">سعر ${d.name_ar}</span>
      <input
        class="input input-num"
        inputmode="decimal"
        value=${value}
        data-dish=${d.id}
        onInput=${(e) => setValue(e.currentTarget.value.replace(/[^\d.]/g, ''))}
        onFocus=${(e) => e.currentTarget.select()}
        onKeyDown=${(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setValue(String(d.price ?? 0));
            e.currentTarget.blur();
          }
        }}
        onBlur=${commit}
      />
      <span class="affix">${currency()}</span>
    </label>
    <span class=${cx('price-state', `is-${state}`)} aria-live="polite">
      ${state === 'saving'
        ? html`<span class="spinner" style=${{ width: '16px', height: '16px' }}></span>`
        : state === 'saved'
          ? html`<${Icon} name="check-circle" size=${18} label="حُفظ" />`
          : state === 'error'
            ? html`<${Icon} name="alert" size=${18} label="لم يُحفظ" />`
            : null}
    </span>
  </li>`;
}
