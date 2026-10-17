// Design-system primitives: buttons, fields, chips, switches, skeletons,
// empty states. Styling lives in styles/components.css.

import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.js';

const cx = (...parts) => parts.filter(Boolean).join(' ');
export { cx };

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  loading = false,
  block = false,
  type = 'button',
  class: cls,
  children,
  disabled,
  ...rest
}) {
  return html`<button
    type=${type}
    class=${cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', loading && 'is-loading', cls)}
    disabled=${disabled || loading}
    aria-busy=${loading ? 'true' : undefined}
    ...${rest}
  >
    ${loading ? html`<${Spinner} size=${size === 'lg' ? 20 : 16} />` : icon && html`<${Icon} name=${icon} size=${size === 'sm' ? 16 : 18} />`}
    ${children != null && children !== false && html`<span class="btn-label">${children}</span>`}
    ${iconEnd && html`<${Icon} name=${iconEnd} size=${size === 'sm' ? 16 : 18} />`}
  </button>`;
}

export function IconButton({ icon, label, variant = 'ghost', size = 'md', class: cls, badge, ...rest }) {
  return html`<button
    type="button"
    class=${cx('icon-btn', `icon-btn-${variant}`, `icon-btn-${size}`, cls)}
    aria-label=${label}
    title=${label}
    ...${rest}
  >
    <${Icon} name=${icon} size=${size === 'sm' ? 16 : size === 'lg' ? 22 : 18} />
    ${badge != null && badge !== 0 && html`<span class="icon-btn-badge">${badge}</span>`}
  </button>`;
}

let fieldSeq = 0;
// <Field label="الاسم" hint="..." error="...">{(id) => <input id=id/>}</Field>
export function Field({ label, hint, error, required, children, class: cls, aside }) {
  const [id] = useState(() => `f${++fieldSeq}`);
  const control = typeof children === 'function' ? children(id) : children;
  return html`<div class=${cx('field', error && 'has-error', cls)}>
    ${label &&
    html`<div class="field-head">
      <label class="field-label" for=${id}>${label}${required && html`<span class="field-req" aria-hidden="true"> *</span>`}</label>
      ${aside}
    </div>`}
    ${control}
    ${error ? html`<div class="field-error" role="alert">${error}</div>` : hint && html`<div class="field-hint">${hint}</div>`}
  </div>`;
}

export function Switch({ checked, onChange, label, hint, disabled, size = 'md' }) {
  return html`<label class=${cx('switch', `switch-${size}`, disabled && 'is-disabled')}>
    <input type="checkbox" role="switch" checked=${checked} disabled=${disabled} onChange=${(e) => onChange?.(e.currentTarget.checked)} />
    <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
    ${(label || hint) &&
    html`<span class="switch-text">
      ${label && html`<span class="switch-label">${label}</span>`}
      ${hint && html`<span class="switch-hint">${hint}</span>`}
    </span>`}
  </label>`;
}

// options: [{ value, label, icon }]
export function Segmented({ options, value, onChange, size = 'md', label, class: cls, disabled }) {
  return html`<div class=${cx('segmented', `segmented-${size}`, cls)} role="radiogroup" aria-label=${label}>
    ${options.map(
      (o) => html`<button
        type="button"
        role="radio"
        aria-checked=${o.value === value ? 'true' : 'false'}
        class=${cx('segmented-item', o.value === value && 'is-active')}
        disabled=${disabled || o.disabled}
        onClick=${() => o.value !== value && onChange(o.value)}
      >
        ${o.icon && html`<${Icon} name=${o.icon} size=${16} />`}
        ${o.dot && html`<span class="dot" style=${{ background: o.dot }}></span>`}
        <span>${o.label}</span>
      </button>`,
    )}
  </div>`;
}

export function Chip({ active, onClick, icon, count, children, class: cls, title, ...rest }) {
  return html`<button
    type="button"
    class=${cx('chip', active && 'is-active', cls)}
    aria-pressed=${active ? 'true' : 'false'}
    onClick=${onClick}
    title=${title}
    ...${rest}
  >
    ${icon && (icon.length <= 3 ? html`<span class="chip-emoji" aria-hidden="true">${icon}</span>` : html`<${Icon} name=${icon} size=${16} />`)}
    <span>${children}</span>
    ${count != null && html`<span class="chip-count">${count}</span>`}
  </button>`;
}

export function Badge({ tone = 'neutral', icon, children, class: cls, color, title }) {
  return html`<span class=${cx('badge', `badge-${tone}`, cls)} style=${color ? { '--badge-c': color } : undefined} title=${title}>
    ${icon && html`<${Icon} name=${icon} size=${13} />`}
    ${children}
  </span>`;
}

export function StatusChip({ color, children, pulse, size = 'md' }) {
  return html`<span class=${cx('status-chip', `status-chip-${size}`)} style=${{ '--sc': color }}>
    <span class=${cx('dot', pulse && 'dot-pulse')}></span>${children}
  </span>`;
}

export function Spinner({ size = 18 }) {
  return html`<span class="spinner" style=${{ width: `${size}px`, height: `${size}px` }} role="status" aria-label="جارٍ التحميل"></span>`;
}

export function Skeleton({ w = '100%', h = 16, r, class: cls, style }) {
  return html`<span
    class=${cx('skeleton', cls)}
    style=${{ width: typeof w === 'number' ? `${w}px` : w, height: typeof h === 'number' ? `${h}px` : h, borderRadius: r, ...style }}
    aria-hidden="true"
  ></span>`;
}

export function Empty({ icon = 'info', title, text, action, compact }) {
  return html`<div class=${cx('empty', compact && 'empty-compact')}>
    <div class="empty-icon"><${Icon} name=${icon} size=${compact ? 22 : 28} /></div>
    ${title && html`<div class="empty-title">${title}</div>`}
    ${text && html`<div class="empty-text">${text}</div>`}
    ${action && html`<div class="empty-action">${action}</div>`}
  </div>`;
}

export function ErrorState({ error, onRetry }) {
  return html`<${Empty}
    icon="wifi-off"
    title="تعذّر تحميل البيانات"
    text=${error?.message ?? String(error ?? '')}
    action=${onRetry && html`<${Button} icon="refresh" onClick=${onRetry}>إعادة المحاولة<//>`}
  />`;
}

export function Avatar({ name = '', size = 36, tone }) {
  const letter = name.trim().charAt(0) || '؟';
  return html`<span class=${cx('avatar', tone && `avatar-${tone}`)} style=${{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` }} aria-hidden="true">${letter}</span>`;
}

export function PageHeader({ title, subtitle, actions, back, icon }) {
  return html`<header class="page-head">
    <div class="page-head-main">
      ${back && html`<${IconButton} icon="chevron-right" label="رجوع" variant="glass" onClick=${back} />`}
      ${icon && html`<span class="page-head-icon"><${Icon} name=${icon} size=${22} /></span>`}
      <div class="page-head-text">
        <h1 class="page-title">${title}</h1>
        ${subtitle && html`<p class="page-subtitle">${subtitle}</p>`}
      </div>
    </div>
    ${actions && html`<div class="page-actions">${actions}</div>`}
  </header>`;
}

export function SearchInput({ value, onInput, placeholder = 'بحث…', label = 'بحث', class: cls, autoFocus }) {
  const ref = useRef();
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, []);
  return html`<div class=${cx('search', cls)}>
    <${Icon} name="search" size=${18} />
    <input
      ref=${ref}
      type="search"
      class="search-input"
      value=${value}
      placeholder=${placeholder}
      aria-label=${label}
      onInput=${(e) => onInput(e.currentTarget.value)}
    />
    ${value && html`<button type="button" class="search-clear" aria-label="مسح البحث" onClick=${() => onInput('')}><${Icon} name="x" size=${16} /></button>`}
  </div>`;
}

// Quantity stepper used in orders.
export function Stepper({ value, onChange, min = 1, max = 99, size = 'md', disabled }) {
  return html`<div class=${cx('stepper', `stepper-${size}`)}>
    <button type="button" class="stepper-btn" aria-label="زيادة" disabled=${disabled || value >= max} onClick=${() => onChange(value + 1)}>
      <${Icon} name="plus" size=${16} />
    </button>
    <span class="stepper-value num" aria-live="polite">${value}</span>
    <button type="button" class="stepper-btn" aria-label=${value <= min ? 'حذف' : 'إنقاص'} disabled=${disabled} onClick=${() => onChange(value - 1)}>
      <${Icon} name=${value <= min ? 'trash' : 'minus'} size=${16} />
    </button>
  </div>`;
}

// Image that fades in and never shows a broken-image icon.
export function Img({ src, alt = '', class: cls, fallbackIcon = 'utensils', ...rest }) {
  const [state, setState] = useState(src ? 'loading' : 'error');
  useEffect(() => setState(src ? 'loading' : 'error'), [src]);
  return html`<span class=${cx('img', `img-${state}`, cls)}>
    ${state !== 'error' &&
    html`<img src=${src} alt=${alt} loading="lazy" decoding="async" onLoad=${() => setState('ok')} onError=${() => setState('error')} ...${rest} />`}
    ${state === 'error' && html`<span class="img-fallback"><${Icon} name=${fallbackIcon} size=${26} /></span>`}
  </span>`;
}

