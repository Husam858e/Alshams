// A dish on the projected menu: photo, name, short description, price, badges.

import { html } from 'htm/preact';
import { usePlayer } from '../lib/context.js';
import { lengthClass } from '../lib/format.js';
import { Badges, Calories, Price } from './Bits.js';
import { Icon } from './Icons.js';
import { DishVisual } from './Media.js';

// `large` cards (few dishes on the page) may play the dish video.
export function DishCard({ dish, index = 0, large = false, icon }) {
  const { theme } = usePlayer();
  const description = theme.showDescriptions !== false ? String(dish.description_ar ?? '').trim() : '';
  return html`
    <article class="dish-card ${large ? 'is-large' : ''} ${theme.showDescriptions === false ? 'no-desc' : ''}" style=${{ '--i': index }}>
      <div class="dc-media">
        <${DishVisual} dish=${dish} video=${large} icon=${icon} />
        <${Badges} badges=${dish.badges} max=${2} class="dc-badges" />
        ${dish.is_featured ? html`<span class="dc-star" title="مميز"><${Icon} name="star" /></span>` : null}
      </div>
      <div class="dc-body">
        <h3 class="dc-name ${lengthClass(dish.name_ar, [16, 26, 40])}">${dish.name_ar}</h3>
        ${description && html`<p class="dc-desc">${description}</p>`}
        <div class="dc-foot">
          <${Price} value=${dish.price} class="dc-price" />
          <${Calories} value=${dish.calories} class="dc-cal" />
        </div>
      </div>
    </article>
  `;
}

export function CardGrid({ dishes, large = false, icon }) {
  return html`
    <div class="card-grid count-${dishes.length} ${large ? 'is-large' : ''}">
      ${dishes.map((dish, i) => html`<${DishCard} key=${dish.id} dish=${dish} index=${i} large=${large} icon=${icon} />`)}
    </div>
  `;
}
