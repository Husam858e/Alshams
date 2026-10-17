// Small building blocks shared by the scenes.

import { html } from 'htm/preact';
import { useEffect, useErrorBoundary, useRef, useState } from 'preact/hooks';
import { usePlayer } from '../lib/context.js';
import { formatNumber, hasPrice } from '../lib/format.js';
import { Icon } from './Icons.js';

// `always` shows it even when the theme hides menu prices (order totals).
export function Price({ value, class: cls = '', always = false }) {
  const { theme, general } = usePlayer();
  if ((!always && theme.showPrices === false) || !(always ? Number.isFinite(Number(value)) : hasPrice(value))) return null;
  return html`
    <span class="price ${cls}">
      <bdi class="price-num">${formatNumber(value)}</bdi>
      ${general.currency && html`<span class="price-cur">${general.currency}</span>`}
    </span>
  `;
}

export function badgeList(badges) {
  let list = badges;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [list];
    }
  }
  return (Array.isArray(list) ? list : []).map((b) => String(b ?? '').trim()).filter(Boolean);
}

export function Badges({ badges, max = 3, class: cls = '' }) {
  const list = badgeList(badges).slice(0, max);
  if (!list.length) return null;
  return html`<div class="badges ${cls}">${list.map((b) => html`<span class="badge">${b}</span>`)}</div>`;
}

export function Calories({ value, class: cls = '' }) {
  const { theme } = usePlayer();
  if (!theme.showCalories || !(Number(value) > 0)) return null;
  return html`<span class="meta ${cls}"><${Icon} name="flame" /><bdi>${formatNumber(value)}</bdi> سعرة</span>`;
}

export function PrepTime({ value, class: cls = '' }) {
  if (!(Number(value) > 0)) return null;
  return html`<span class="meta ${cls}"><${Icon} name="clock" /><bdi>${formatNumber(value)}</bdi> دقيقة</span>`;
}

// Hairline - diamond - hairline.
export function Ornament({ class: cls = '' }) {
  return html`
    <div class="ornament ${cls}" aria-hidden="true">
      <i class="orn-line"></i>
      <svg viewBox="0 0 24 24" class="orn-gem"><path d="M12 3l5 9-5 9-5-9z" /></svg>
      <i class="orn-line"></i>
    </div>
  `;
}

export function EmptyState({ title, text, icon = 'cutlery' }) {
  return html`
    <div class="empty">
      <div class="empty-mark"><${Icon} name=${icon} /></div>
      <div class="empty-title">${title}</div>
      ${text && html`<div class="empty-text">${text}</div>`}
    </div>
  `;
}

export function PageDots({ count, index }) {
  if (count <= 1) return null;
  return html`
    <div class="page-dots" aria-hidden="true">
      ${Array.from({ length: count }, (_, i) => html`<i class=${i === index ? 'on' : ''}></i>`)}
    </div>
  `;
}

// Cross-fades its content whenever `k` changes: the old content stays for
// `ms` with class 'is-out' while the new one enters with 'is-in'.
export function Swap({ k, ms = 900, class: cls = '', children }) {
  const items = useRef([]);
  const [, force] = useState(0);
  const now = Date.now();
  const current = items.current.find((it) => it.k === k && !it.out);
  if (current) {
    current.node = children;
  } else {
    for (const it of items.current) {
      if (!it.out) {
        it.out = true;
        it.until = now + ms;
      }
    }
    items.current = [...items.current.filter((it) => it.k !== k), { k, node: children }];
  }
  items.current = items.current.filter((it) => !it.out || it.until > now);
  const pending = items.current.filter((it) => it.out);
  useEffect(() => {
    if (!pending.length) return undefined;
    const wait = Math.max(0, Math.min(...pending.map((it) => it.until)) - Date.now()) + 20;
    const timer = setTimeout(() => force((n) => n + 1), wait);
    return () => clearTimeout(timer);
  });
  // The host is a one-cell grid: old and new content stack in the same place.
  return html`
    <div class="swap-host ${cls}">
      ${items.current.map((it) => html`<div key=${String(it.k)} class="swap ${it.out ? 'is-out' : 'is-in'}">${it.node}</div>`)}
    </div>
  `;
}

// A scene that throws must not blank the projector. A new `resetKey`
// (e.g. the next scene) tries rendering the children again.
export function Guard({ fallback = null, onError, resetKey, children }) {
  const [error, reset] = useErrorBoundary((err) => onError?.(err));
  useEffect(() => {
    if (error) reset();
  }, [resetKey]);
  return error ? fallback : children;
}
