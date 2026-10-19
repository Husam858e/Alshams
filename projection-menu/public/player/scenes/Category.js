// One category: a hero header with its cover photo and its dishes below.
// With few dishes the cards are large and play the dish video if there is one.

import { html } from 'htm/preact';
import { useEffect, useMemo } from 'preact/hooks';
import { EmptyState, PageDots, Swap } from '../components/Bits.js';
import { CardGrid } from '../components/DishCard.js';
import { SafeImage } from '../components/Media.js';
import { useFrame, usePlayer } from '../lib/context.js';
import { lengthClass } from '../lib/format.js';
import { usePager } from '../lib/hooks.js';
import { preloadAll } from '../lib/media.js';
import { chunk, findCategory } from '../lib/menu.js';

export function CategoryScene({ scene, start }) {
  const { menu, theme } = usePlayer();
  const { perPage, shape } = useFrame();
  const category = findCategory(menu, scene.categoryId);
  const pages = useMemo(() => chunk(category?.dishes ?? [], perPage), [category, perPage]);
  const index = usePager(start, theme.pageSeconds * 1000, pages.length);
  const dishes = pages[index] ?? [];

  useEffect(() => {
    const next = pages[(index + 1) % Math.max(1, pages.length)];
    if (next) preloadAll(next.map((d) => d.image_url), 0);
  }, [index, pages]);

  if (!category) {
    return html`
      <section class="scene category is-empty">
        <${EmptyState} title="هذا القسم غير متاح حالياً" text="اطلبوا من النادل عرض قسم آخر" />
      </section>
    `;
  }

  // No cover? Borrow the first dish photo so the header is never bare.
  const cover = category.cover_url || category.dishes.find((d) => d.image_url)?.image_url;
  const large = pages.length === 1 && dishes.length <= 3 && shape !== 'wide';
  return html`
    <section class="scene category ${dishes.length ? '' : 'no-dishes'}">
      <div class="ct-hero" aria-hidden="true">
        <${SafeImage} src=${cover} class="ct-cover kenburns" fallback=${html`<div class="ct-cover ct-cover-empty"></div>`} />
        <div class="ct-shade"></div>
      </div>
      <header class="ct-head">
        ${category.icon && html`<span class="ct-icon">${category.icon}</span>`}
        <div class="ct-titles">
          <h1 class="ct-name ${lengthClass(category.name_ar, [10, 16, 30])}">${category.name_ar}</h1>
          ${category.name_en && html`<span class="ct-en">${category.name_en}</span>`}
        </div>
        ${theme.showDescriptions !== false && category.description_ar && html`<p class="ct-desc">${category.description_ar}</p>`}
        <${PageDots} count=${pages.length} index=${index} />
      </header>
      <div class="ct-cards">
        ${dishes.length
          ? html`
              <${Swap} k=${index} ms=${800} class="cards-swap">
                <${CardGrid} dishes=${dishes} large=${large} icon=${category.icon} />
              </${Swap}>
            `
          : html`<${EmptyState} title="لا توجد أطباق متاحة في هذا القسم حالياً" text="نعمل على تحضير أطباق جديدة، اسألوا النادل عن البدائل" />`}
      </div>
    </section>
  `;
}
