// Welcome: the restaurant's name or logo, a greeting and slow ambient light.
// After theme.idleSeconds on this scene it starts presenting featured dishes.

import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Ornament, Price, Swap } from '../components/Bits.js';
import { SafeImage } from '../components/Media.js';
import { usePlayer } from '../lib/context.js';
import { useAfter, usePager } from '../lib/hooks.js';
import { preloadImage } from '../lib/media.js';
import { featuredDishes } from '../lib/menu.js';

// Deterministic "random" motes of light drifting upwards.
const MOTES = Array.from({ length: 18 }, (_, i) => {
  const r = (n) => ((Math.sin((i + 1) * n) + 1) / 2);
  return {
    '--x': `${Math.round(r(12.9898) * 100)}%`,
    '--y': `${Math.round(40 + r(78.233) * 60)}%`,
    '--s': `${(3 + r(37.719) * 6).toFixed(1)}px`,
    '--d': `${Math.round(16 + r(4.581) * 18)}s`,
    '--delay': `${-Math.round(r(9.151) * 30)}s`,
    '--o': (0.25 + r(2.17) * 0.5).toFixed(2),
  };
});

export function Ambient() {
  return html`
    <div class="wl-ambient" aria-hidden="true">
      <div class="wl-glow"></div>
      <div class="wl-ring"></div>
      <div class="wl-ring wl-ring-2"></div>
      <div class="wl-motes">${MOTES.map((style) => html`<i style=${style}></i>`)}</div>
    </div>
  `;
}

function Featured({ dish }) {
  const { theme } = usePlayer();
  const description = theme.showDescriptions !== false ? String(dish.description_ar ?? '').trim() : '';
  return html`
    <div class="wl-feature">
      <div class="wl-plate">
        <${SafeImage} src=${dish.image_url} class="kenburns" />
      </div>
      <div class="wl-feature-text">
        <span class="wl-kicker">اقتراح الشيف</span>
        <div class="wl-feature-name">${dish.name_ar}</div>
        ${description && html`<p class="wl-feature-desc">${description}</p>`}
        <${Price} value=${dish.price} class="wl-feature-price" />
      </div>
    </div>
  `;
}

export function WelcomeScene({ start }) {
  const { general, theme, logoUrl, menu } = usePlayer();
  const idleMs = theme.idleSeconds * 1000;
  const featured = useMemo(() => featuredDishes(menu), [menu]);
  const showcase = useAfter(start, idleMs) && featured.length > 0;
  const index = usePager(start + idleMs, theme.pageSeconds * 1000, showcase ? featured.length : 1);
  const dish = featured[index % Math.max(1, featured.length)];

  useEffect(() => {
    if (featured.length) preloadImage(featured[(index + (showcase ? 1 : 0)) % featured.length].image_url);
  }, [showcase, index, featured]);

  // When the logo file is missing the big name takes its place (once).
  const [brokenLogo, setBrokenLogo] = useState(null);
  const logo = logoUrl && brokenLogo !== logoUrl ? logoUrl : null;
  const name = html`<h1 class="wl-name">${general.restaurantName}</h1>`;
  return html`
    <section class="scene welcome ${showcase ? 'is-showcase' : ''}">
      <${Ambient} />
      <div class="wl-brand">
        ${logo
          ? html`<${SafeImage} src=${logo} class="wl-logo" fallback=${name} onFail=${() => setBrokenLogo(logo)} />`
          : name}
        ${logo && general.restaurantName && html`<div class="wl-name-sub">${general.restaurantName}</div>`}
        ${general.restaurantNameEn && html`<div class="wl-en">${general.restaurantNameEn}</div>`}
        <${Ornament} class="wl-ornament" />
        ${general.welcomeTitle && html`<h2 class="wl-title">${general.welcomeTitle}</h2>`}
        ${general.welcomeText && html`<p class="wl-text">${general.welcomeText}</p>`}
      </div>
      ${showcase && dish && html`
        <div class="wl-showcase">
          <${Swap} k=${dish.id} ms=${1100} class="wl-feature-swap">
            <${Featured} dish=${dish} />
          </${Swap}>
        </div>
      `}
      ${general.footerText && html`<div class="wl-footer">${general.footerText}</div>`}
    </section>
  `;
}
