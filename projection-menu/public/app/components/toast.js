// Toast notifications: toast('تم الحفظ'), toast.error(err), toast.info(...).

import { html } from 'htm/preact';
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
  return html`<div class="toasts" role="region" aria-label="الإشعارات" aria-live="polite">
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

// Runs an async action; shows the error as a toast. Returns the result or undefined.
export async function attempt(fn, okMessage) {
  try {
    const result = await fn();
    if (okMessage) toast.ok(typeof okMessage === 'function' ? okMessage(result) : okMessage);
    return result;
  } catch (err) {
    toast.error(err);
    return undefined;
  }
}
