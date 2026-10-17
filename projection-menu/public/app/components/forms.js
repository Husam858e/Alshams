// Form controls beyond the basics in ui.js: tag input (dish badges), emoji
// picker field, color field, range with value, and a drag-to-reorder hook.

import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.js';
import { cx } from './ui.js';

// Short labels ("حار", "نباتي"): Enter or comma adds, Backspace removes.
export function TagInput({ id, value = [], onChange, suggestions = [], max = 8, placeholder = 'اكتب ثم Enter' }) {
  const [text, setText] = useState('');
  const add = (raw) => {
    const t = raw.trim().slice(0, 24);
    if (!t || value.includes(t) || value.length >= max) return;
    onChange([...value, t]);
    setText('');
  };
  const remove = (t) => onChange(value.filter((x) => x !== t));
  const left = suggestions.filter((s) => !value.includes(s));
  return html`<div class="tag-field">
    <div class="tag-input" onClick=${(e) => e.currentTarget.querySelector('input')?.focus()}>
      ${value.map(
        (t) => html`<span class="tag" key=${t}>
          ${t}
          <button type="button" class="tag-x" aria-label=${`إزالة ${t}`} onClick=${() => remove(t)}><${Icon} name="x" size=${12} /></button>
        </span>`,
      )}
      <input
        id=${id}
        value=${text}
        placeholder=${value.length >= max ? '' : placeholder}
        disabled=${value.length >= max}
        maxlength="24"
        onInput=${(e) => {
          const v = e.currentTarget.value;
          if (/[,،]/.test(v)) add(v.replace(/[,،]/g, ''));
          else setText(v);
        }}
        onKeyDown=${(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) remove(value.at(-1));
        }}
        onBlur=${() => text.trim() && add(text)}
      />
    </div>
    ${left.length > 0 &&
    value.length < max &&
    html`<div class="tag-suggest" aria-label="اقتراحات">
      ${left.map((s) => html`<button type="button" class="tag-suggestion" key=${s} onClick=${() => add(s)}><${Icon} name="plus" size=${12} />${s}</button>`)}
    </div>`}
  </div>`;
}

const EMOJIS = ['🥗', '🔥', '🍕', '🍰', '🥤', '☕', '🍔', '🍝', '🥘', '🍲', '🍣', '🍤', '🥩', '🍗', '🥙', '🌯', '🥪', '🍟', '🍨', '🧁', '🍹', '🍵', '🥐', '🍳', '🫖', '🍋', '⭐', '🌿'];

export function EmojiField({ id, value, onChange }) {
  return html`<div class="emoji-field">
    <input id=${id} class="input emoji-input" value=${value ?? ''} maxlength="4" placeholder="🍽" onInput=${(e) => onChange(e.currentTarget.value)} aria-label="الأيقونة" />
    <div class="emoji-grid" role="group" aria-label="أيقونات مقترحة">
      ${EMOJIS.map(
        (e) => html`<button type="button" key=${e} class=${cx('emoji-btn', value === e && 'is-active')} aria-pressed=${value === e ? 'true' : 'false'} onClick=${() => onChange(e)}>${e}</button>`,
      )}
    </div>
  </div>`;
}

export function RangeField({ id, value, onChange, min, max, step = 1, unit = '', marks }) {
  const pct = ((value - min) / (max - min)) * 100;
  return html`<div class="range-field">
    <input
      id=${id}
      type="range"
      class="range"
      min=${min}
      max=${max}
      step=${step}
      value=${value}
      style=${{ '--pct': `${pct}%` }}
      onInput=${(e) => onChange(Number(e.currentTarget.value))}
    />
    <span class="range-value"><span class="num">${value}</span>${unit && html` ${unit}`}</span>
    ${marks && html`<div class="range-marks">${marks.map((m) => html`<span key=${m}>${m}</span>`)}</div>`}
  </div>`;
}

// Drag to reorder (mouse / pen; touch uses the up/down buttons).
// ids: current order. onCommit(newIds) runs once on drop if the order changed.
export function useDragSort(ids, onCommit) {
  const key = ids.join(',');
  const [order, setOrder] = useState(ids);
  const [dragId, setDragId] = useState(null);
  const dragging = useRef(null);
  const latest = useRef(ids);
  latest.current = order;
  useEffect(() => {
    if (dragging.current == null) setOrder(ids);
  }, [key]);

  const bind = (id) => ({
    draggable: true,
    onDragStart: (e) => {
      if (e.target.closest?.('input, textarea, select')) return e.preventDefault();
      dragging.current = id;
      setDragId(id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(id));
    },
    onDragOver: (e) => {
      const from = dragging.current;
      if (from == null) return;
      e.preventDefault();
      if (from === id) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      setOrder((o) => {
        const a = o.filter((x) => x !== from);
        const i = a.indexOf(id);
        a.splice(after ? i + 1 : i, 0, from);
        return a.join(',') === o.join(',') ? o : a;
      });
    },
    onDrop: (e) => e.preventDefault(),
    onDragEnd: () => {
      dragging.current = null;
      setDragId(null);
      if (latest.current.join(',') !== key) onCommit(latest.current);
    },
  });

  // Keyboard / touch: move one step up (-1) or down (+1).
  const move = (id, delta) => {
    const a = [...order];
    const i = a.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setOrder(a);
    onCommit(a);
  };

  return { order, bind, dragId, move };
}
