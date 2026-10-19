// Toast notifications: toast('تم الحفظ'), toast.error(err), toast.info(...).

import { html } from 'htm/preact';
import { useEffect, useRef } from 'preact/hooks';
import { getState, setState, useStore } from '../lib/store.js';
import { Icon } from './icons.js';

let seq = 0;
const ICONS = { ok: 'check-circle', error: 'alert', info: 'info', order: 'bell' };

function push(message, { tone = 'ok', title, duration, action } = {}) {
  const id = ++seq;
  const item = { id, message: String(message ?? ''), tone, title, action };
  const list = [...(getState().toasts ?? []), item].slice(-4);
  setState({ toasts: list });
  setTimeout(() => dismiss(id), duration ?? (tone === 'error' ? 6000 : 3500));
  return id;
}

export function dismiss(id) {
  setState({ toasts: (getState().toasts ?? []).filter((t) => t.id !== id) });
}

export const toast = (message, opts) => push(message, opts);
toast.ok = (message, opts) => push(message, { ...opts, tone: 'ok' });
toast.info = (message, opts) => push(message, { ...opts, tone: 'info' });
toast.error = (err, opts) => push(err?.message ?? err, { ...opts, tone: 'error' });
toast.order = (message, opts) => push(message, { duration: 6000, ...opts, tone: 'order' });

export function ToastHost() {
  const toasts = useStore((s) => s.toasts) ?? [];
  const ref = useRef();
  // Open modals live in the browser's top layer, above any z-index. As a
  // manual popover, re-shown on each change, the toasts stay above them.
  useEffect(() => {
    const el = ref.current;
    if (!el?.showPopover) return;
    try {
      const open = el.matches(':popover-open');
      if (!toasts.length) {
        if (open) el.hidePopover();
      } else if (!open) {
        el.showPopover();
      } else if (document.querySelector('dialog[open]')) {
        // A modal opened after the toasts: move them back on top of it.
        el.hidePopover();
        el.showPopover();
      }
    } catch {
      // popover unsupported or element detached
    }
  }, [toasts]);
  return html`<div class="toasts" ref=${ref} popover="manual" role="region" aria-label="الإشعارات" aria-live="polite">
    ${toasts.map(
      (t) => html`<div key=${t.id} class=${`toast toast-${t.tone}`} role=${t.tone === 'error' ? 'alert' : 'status'}>
        <span class="toast-icon"><${Icon} name=${ICONS[t.tone] ?? 'info'} size=${18} /></span>
        <div class="toast-text">
          ${t.title && html`<strong>${t.title}</strong>`}
          <span>${t.message}</span>
        </div>
        ${t.action &&
        html`<button type="button" class="toast-action" onClick=${() => {
          dismiss(t.id);
          t.action.onClick();
        }}>${t.action.label}</button>`}
        <button type="button" class="toast-close" aria-label="إغلاق" onClick=${() => dismiss(t.id)}><${Icon} name="x" size=${14} /></button>
      </div>`,
    )}
  </div>`;
}

