// Inline SVG icons (stroke style, inherit currentColor).

import { html } from 'htm/preact';

const PATHS = {
  cutlery: html`
    <path d="M7 3v8a2 2 0 0 0 2 2v8" />
    <path d="M11 3v8a2 2 0 0 1-2 2" />
    <path d="M9 3v6" />
    <path d="M17 21V3c-2.2 1.2-3.5 3.8-3.5 7v3.5H17" />
  `,
  flame: html`
    <path d="M12 21c3.9 0 6.5-2.6 6.5-6.2 0-3.6-2.6-5.9-4.2-8.8-.5 1.9-1.5 3.1-2.7 3.9C11.7 7 10.6 4.6 8.4 3c.3 3.4-2.9 5.8-2.9 10.4C5.5 18.1 8.1 21 12 21z" />
    <path d="M12 21c-1.7 0-3-1.3-3-3.1 0-2 1.6-3 2.5-4.6.9 1.6 3.5 2.6 3.5 4.6 0 1.8-1.3 3.1-3 3.1z" />
  `,
  clock: html`
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  `,
  star: html`<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />`,
  receipt: html`
    <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  `,
  check: html`<path d="M5 12.5l4.5 4.5L19 7.5" />`,
  signal: html`
    <path d="M3 3l18 18" />
    <path d="M8.5 16.5a5 5 0 0 1 7 0" />
    <path d="M5 13a10 10 0 0 1 5.3-2.8M14 10.3A10 10 0 0 1 19 13" />
  `,
};

export function Icon({ name, class: cls = '' }) {
  return html`
    <svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${PATHS[name] ?? null}
    </svg>
  `;
}
