// One featured dish, full-bleed: big photo (slow Ken Burns), video or live
// 3D model, with its name, description, badges, calories, prep time, price.

import { html } from 'htm/preact';
import { Badges, Calories, EmptyState, Ornament, PrepTime, Price } from '../components/Bits.js';
import { DishVisual } from '../components/Media.js';
import { usePlayer } from '../lib/context.js';
import { lengthClass } from '../lib/format.js';
import { findDish } from '../lib/menu.js';

export function DishScene({ scene }) {
  const { menu, theme } = usePlayer();
  const found = findDish(menu, scene.dishId);
  if (!found) {
    return html`
      <section class="scene dish is-empty">
        <${EmptyState} title="هذا الطبق غير متاح حالياً" text="اطلبوا من النادل اقتراحاً آخر" />
      </section>
    `;
  }
  const { dish, category } = found;
  const description = theme.showDescriptions !== false ? String(dish.description_ar ?? '').trim() : '';
  return html`
    <section class="scene dish">
      <div class="ds-visual">
        <${DishVisual} key=${dish.id} dish=${dish} rich=${true} kenburns=${true} icon=${category.icon} />
        <div class="ds-fade"></div>
      </div>
      <div class="ds-info">
        <div class="ds-cat">
          ${category.icon && html`<span class="ds-cat-icon">${category.icon}</span>`}
          <span>${category.name_ar}</span>
        </div>
        <h1 class="ds-name ${lengthClass(dish.name_ar, [14, 24, 38])}">${dish.name_ar}</h1>
        ${dish.name_en && html`<div class="ds-en">${dish.name_en}</div>`}
        <${Ornament} class="ds-ornament" />
        ${description && html`<p class="ds-desc ${lengthClass(description, [90, 160, 260])}">${description}</p>`}
        <${Badges} badges=${dish.badges} max=${4} class="ds-badges" />
        <div class="ds-meta">
          <${Calories} value=${dish.calories} />
          <${PrepTime} value=${dish.prep_minutes} />
        </div>
        <${Price} value=${dish.price} class="ds-price" />
      </div>
    </section>
  `;
}
