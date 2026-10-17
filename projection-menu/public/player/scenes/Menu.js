// The full menu: a category strip on top and pages of dish cards that turn
// by themselves every theme.pageSeconds, category after category.

import { html } from 'htm/preact';
import { useEffect, useMemo } from 'preact/hooks';
import { EmptyState, PageDots, Swap } from '../components/Bits.js';
import { CardGrid } from '../components/DishCard.js';
import { SafeImage } from '../components/Media.js';
import { useFrame, usePlayer } from '../lib/context.js';
import { usePager } from '../lib/hooks.js';
import { preloadAll } from '../lib/media.js';
import { menuCategories, menuPages } from '../lib/menu.js';

const NAV_MAX = { landscape: 5, wide: 7, square: 4, portrait: 4 };

// Shows a window of tabs around the active one when there are many.
function CategoryNav({ categories, activeId, progressKey, ms }) {
  const { shape } = useFrame();
  // When not every tab fits, one slot goes to the '•••' markers.
  const fits = NAV_MAX[shape] ?? 5;
  const max = categories.length <= fits ? fits : fits - 1;
  const at = Math.max(0, categories.findIndex((c) => c.id === activeId));
  const from = Math.max(0, Math.min(at - Math.floor(max / 2), categories.length - max));
  const visible = categories.slice(from, from + max);
  return html`
    <nav class="mn-nav ${from > 0 ? 'more-before' : ''} ${from + max < categories.length ? 'more-after' : ''}">
      ${visible.map((cat) => {
        const active = cat.id === activeId;
        return html`
          <span key=${cat.id} class="mn-tab ${active ? 'is-active' : ''}">
            ${cat.icon && html`<span class="mn-tab-icon">${cat.icon}</span>`}
            <span class="mn-tab-name">${cat.name_ar}</span>
            ${active && html`<i key=${progressKey} class="mn-progress" style=${{ animationDuration: `${ms}ms` }}></i>`}
          </span>
        `;
      })}
    </nav>
  `;
}

export function Brand({ class: cls = '' }) {
  const { general, logoUrl } = usePlayer();
  const name = html`<span class="brand-name">${general.restaurantName}</span>`;
  return html`
    <div class="brand ${cls}">
      ${logoUrl ? html`<${SafeImage} src=${logoUrl} class="brand-logo" fallback=${name} />` : name}
    </div>
  `;
}

export function MenuScene({ start }) {
  const { menu, theme } = usePlayer();
  const { perPage } = useFrame();
  const pages = useMemo(() => menuPages(menu, perPage), [menu, perPage]);
  const categories = useMemo(() => menuCategories(menu).filter((c) => c.dishes.length), [menu]);
  const ms = theme.pageSeconds * 1000;
  const index = usePager(start, ms, pages.length);
  const page = pages[index];

  // Warm up the photos of the next page while this one is on the table.
  useEffect(() => {
    const next = pages[(index + 1) % Math.max(1, pages.length)];
    if (next) preloadAll(next.dishes.map((d) => d.image_url), 0);
  }, [index, pages]);

  if (!page) {
    return html`
      <section class="scene menu is-empty">
        <${EmptyState} title="المنيو قيد التحضير" text="ستظهر الأطباق هنا قريباً" />
      </section>
    `;
  }
  const { category } = page;
  return html`
    <section class="scene menu">
      <header class="mn-head">
        <${Brand} class="mn-brand" />
        <${CategoryNav} categories=${categories} activeId=${category.id} progressKey=${index} ms=${ms} />
      </header>
      <div class="mn-title-row">
        <${Swap} k=${category.id} ms=${800} class="mn-title-swap">
          <div class="mn-title">
            <h2 class="mn-name">${category.name_ar}</h2>
            ${category.name_en && html`<span class="mn-en">${category.name_en}</span>`}
            ${theme.showDescriptions !== false && category.description_ar && html`<p class="mn-desc">${category.description_ar}</p>`}
          </div>
        </${Swap}>
        <${PageDots} count=${page.count} index=${page.index} />
      </div>
      <div class="mn-cards">
        <${Swap} k=${`${category.id}:${page.index}`} ms=${800} class="cards-swap">
          <${CardGrid} dishes=${page.dishes} icon=${category.icon} />
        </${Swap}>
      </div>
    </section>
  `;
}
