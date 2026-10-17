// Modals (native <dialog>: focus trap, Esc and top layer for free),
// promise-based confirm dialogs, and small popover menus.

import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { setState, useStore } from '../lib/store.js';
import { Icon } from './icons.js';
import { Button, IconButton, cx } from './ui.js';

export function Modal({ title, subtitle, icon, onClose, size = 'md', children, footer, dismissable = true, class: cls, variant = 'modal' }) {
  const ref = useRef();
  const downOnBackdrop = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    document.documentElement.classList.add('has-modal');
    return () => {
      if (dialog?.open) dialog.close();
      if (!document.querySelector('dialog[open]')) document.documentElement.classList.remove('has-modal');
    };
  }, []);
  const close = () => dismissable && onClose?.();
  return html`<dialog
    ref=${ref}
    class=${cx(variant, `${variant}-${size}`, cls)}
    aria-label=${typeof title === 'string' ? title : undefined}
    onCancel=${(e) => {
      e.preventDefault();
      close();
    }}
    onPointerDown=${(e) => (downOnBackdrop.current = e.target === ref.current)}
    onClick=${(e) => {
      if (e.target === ref.current && downOnBackdrop.current) close();
    }}
  >
    <div class="modal-card">
      ${(title || onClose) &&
      html`<header class="modal-head">
        ${icon && html`<span class="modal-icon"><${Icon} name=${icon} size=${20} /></span>`}
        <div class="modal-titles">
          ${title && html`<h2 class="modal-title">${title}</h2>`}
          ${subtitle && html`<p class="modal-subtitle">${subtitle}</p>`}
        </div>
        ${onClose && dismissable && html`<${IconButton} icon="x" label="إغلاق" onClick=${close} class="modal-close" />`}
      </header>`}
      <div class="modal-body">${children}</div>
      ${footer && html`<footer class="modal-foot">${footer}</footer>`}
    </div>
  </dialog>`;
}

export const Drawer = (props) => html`<${Modal} ...${props} variant="drawer" />`;

// ── confirm() ─────────────────────────────────────────────────────

let confirmSeq = 0;
export function confirmDialog({ title, message, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', danger = false, icon }) {
  return new Promise((resolve) => {
    setState({ confirm: { id: ++confirmSeq, title, message, confirmLabel, cancelLabel, danger, icon, resolve } });
  });
}

export function ConfirmHost() {
  const req = useStore((s) => s.confirm);
  if (!req) return null;
  const done = (value) => {
    setState({ confirm: null });
    req.resolve(value);
  };
  return html`<${Modal}
    key=${req.id}
    size="sm"
    class="confirm"
    icon=${req.icon ?? (req.danger ? 'alert' : 'info')}
    title=${req.title}
    onClose=${() => done(false)}
    footer=${html`
      <${Button} variant="ghost" onClick=${() => done(false)}>${req.cancelLabel}<//>
      <${Button} variant=${req.danger ? 'danger' : 'primary'} onClick=${() => done(true)} autofocus>${req.confirmLabel}<//>
    `}
  >
    ${req.message && html`<p class="confirm-text">${req.message}</p>`}
  <//>`;
}

// ── Popover menu ──────────────────────────────────────────────────

// items: [{ label, icon, onSelect, danger, disabled }] | 'divider'
export function MenuButton({ items, label = 'خيارات', icon = 'more-v', align = 'end', trigger, header, class: cls }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return html`<div class=${cx('menu-wrap', cls)} ref=${ref}>
    ${trigger
      ? trigger({ open, toggle: () => setOpen((o) => !o) })
      : html`<${IconButton} icon=${icon} label=${label} aria-haspopup="menu" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen((o) => !o)} />`}
    ${open &&
    html`<div class=${cx('menu', `menu-${align}`)} role="menu">
      ${header}
      ${items.filter(Boolean).map((item, i) =>
        item === 'divider'
          ? html`<div class="menu-divider" key=${i} role="separator"></div>`
          : html`<button
              key=${i}
              type="button"
              role="menuitem"
              class=${cx('menu-item', item.danger && 'is-danger')}
              disabled=${item.disabled}
              onClick=${() => {
                setOpen(false);
                item.onSelect?.();
              }}
            >
              ${item.icon && html`<${Icon} name=${item.icon} size=${18} />`}
              <span>${item.label}</span>
            </button>`,
      )}
    </div>`}
  </div>`;
}
