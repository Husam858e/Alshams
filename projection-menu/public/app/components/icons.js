// Inline SVG icon set (24px grid, 1.75 stroke). No icon fonts: the app must
// work on a LAN without internet. Directional icons are named by what they
// draw; in RTL "back" is chevron-right.

import { html } from 'htm/preact';
import { useMemo } from 'preact/hooks';

const dot = (cx, cy, r = 1.4) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

const PATHS = {
  floor:
    '<circle cx="12" cy="12" r="4.5"/><rect x="10" y="2.5" width="4" height="3" rx="1.2"/><rect x="10" y="18.5" width="4" height="3" rx="1.2"/><rect x="2.5" y="10" width="3" height="4" rx="1.2"/><rect x="18.5" y="10" width="3" height="4" rx="1.2"/>',
  receipt: '<path d="M5.5 3h13v18l-2.6-1.6L13.3 21l-1.3-1-1.3 1-2.6-1.6L5.5 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6M9 11h4"/>',
  utensils: '<path d="M5 3v5a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M7 3v18"/><path d="M17 21V3c-2 1.4-3 3.9-3 7v3.5h3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="M21 15.5l-5-5L6 20"/>',
  video: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M10 9.2v5.6l4.8-2.8z"/>',
  cube: '<path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z"/><path d="M3.5 7.3L12 12l8.5-4.7M12 12v9.5"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/>' +
    dot(7.5, 11.5, 1.3) + dot(10, 7.5, 1.3) + dot(15, 7.8, 1.3),
  projector:
    '<rect x="2.5" y="8" width="19" height="9.5" rx="2.5"/><circle cx="15.5" cy="12.75" r="2.6"/><path d="M6 11.5h3.5M6 14h2M5.5 17.5v2M18.5 17.5v2M14 4.5l1.5 2.2M18.5 3.8l-.6 2.6M21.5 6.5l-2.2 1"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9h18M9.5 21V9"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  'user-plus': '<circle cx="10" cy="8" r="4"/><path d="M2.5 21a7.5 7.5 0 0 1 12.8-5.3M19 14v6M16 17h6"/>',
  chart: '<path d="M3.5 3.5v17h17"/><path d="M8 16.5V12M12 16.5V8M16 16.5v-3.5M20 16.5V6"/>',
  activity: '<path d="M3 12h4l3-7.5 4 15 3-7.5h4"/>',
  sliders:
    '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  logout: '<path d="M9.5 21H6a2.5 2.5 0 0 1-2.5-2.5v-13A2.5 2.5 0 0 1 6 3h3.5"/><path d="M15.5 16.5L20 12l-4.5-4.5M20 12H9"/>',
  key: '<circle cx="8" cy="15.5" r="4.5"/><path d="M11.2 12.3L20 3.5M16.5 7l3 3M14 9.5l2 2"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.5 12.5l5 5 10-10.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.5 9.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  upload: '<path d="M12 15.5V4M7 9l5-5 5 5"/><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15"/>',
  download: '<path d="M12 4v11.5M7 10.5l5 5 5-5"/><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.6A2 2 0 0 0 8.5 21.5h7a2 2 0 0 0 2-1.9l1-12.6M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  edit: '<path d="M4 20h4.2L19 9.2a2.9 2.9 0 0 0-4.2-4.2L4 15.8z"/><path d="M13.5 6.5l4 4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':
    '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  'chevron-left': '<path d="M15 18l-6-6 6-6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-up': '<path d="M18 15l-6-6-6 6"/>',
  'arrow-up': '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>',
  'arrow-down': '<path d="M12 5v14M18.5 12.5L12 19l-6.5-6.5"/>',
  power: '<path d="M12 3v8.5"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><path d="M14 14h3v3h-3zM20.5 14v.5M14 20.5h.5M17 20.5h3.5V17"/>',
  more: dot(5, 12, 1.6) + dot(12, 12, 1.6) + dot(19, 12, 1.6),
  'more-v': dot(12, 5, 1.6) + dot(12, 12, 1.6) + dot(12, 19, 1.6),
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  sparkles:
    '<path d="M11 3.5l1.9 4.9 4.9 1.9-4.9 1.9L11 17.1l-1.9-4.9-4.9-1.9 4.9-1.9z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/>' + dot(4.5, 6.5, 1.2) + dot(4.5, 12, 1.2) + dot(4.5, 17.5, 1.2),
  moon: '<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.4L3.5 9"/><path d="M3.5 4v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.4l1.9-2.4"/><path d="M20.5 20v-5h-5"/>',
  star: '<path d="M12 3.2l2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.3 9.6l6-.9z"/>',
  drag: dot(9, 6) + dot(15, 6) + dot(9, 12) + dot(15, 12) + dot(9, 18) + dot(15, 18),
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.6"/><path d="M10.5 18.5h3"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 17v4"/>',
  wifi: '<path d="M2.5 8.8a14.5 14.5 0 0 1 19 0M5.5 12.3a10 10 0 0 1 13 0M8.6 15.7a5.4 5.4 0 0 1 6.8 0"/>' + dot(12, 19.2, 1.3),
  'wifi-off': '<path d="M3 3l18 18"/><path d="M8.6 15.7a5.4 5.4 0 0 1 6.8 0M5.5 12.3a10 10 0 0 1 4-2.1M2.5 8.8a14.5 14.5 0 0 1 4.3-2.6M13.5 9.6a10 10 0 0 1 5 2.7M21.5 8.8a14.5 14.5 0 0 0-10-3.6"/>' + dot(12, 19.2, 1.3),
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.8 1.8H4.2z"/><path d="M10 21h4"/>',
  alert: '<path d="M12 3.8L2.8 20h18.4z"/><path d="M12 10v4.5"/>' + dot(12, 17.3, 1.1),
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/>' + dot(12, 7.8, 1.1),
  flame:
    '<path d="M12 21.5c-3.9 0-7-2.9-7-6.6 0-4.4 4.3-6.6 4.3-11.4 2.9 1.7 4.4 4.3 4.4 6.8 1-1 1.4-2.1 1.5-3.3 1.8 1.6 2.8 4.4 2.8 7.4 0 4-3.1 7.1-6 7.1z"/>',
  note: '<path d="M5 3.5h10l4 4v13H5z"/><path d="M15 3.5v4h4M8.5 12h7M8.5 15.5h5"/>',
  corners: '<path d="M4 8.5V4h4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5"/><path d="M8.5 9l7-1 .5 7.5-7.5.5z"/>',
  target: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>' + dot(12, 12, 1.4),
  rotate: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.7"/><path d="M4 3.5v5.2h5.2"/>',
  tag: '<path d="M3 12.6V4.5A1.5 1.5 0 0 1 4.5 3h8.1l8.4 8.4-9.6 9.6z"/>' + dot(8, 8, 1.5),
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  bag: '<path d="M5 8h14l-1.1 12.5H6.1z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  send: '<path d="M20.5 3.5L10 14"/><path d="M20.5 3.5L14 20.5l-4-6.5-6.5-4z"/>',
  layers: '<path d="M12 3.5l9 5-9 5-9-5z"/><path d="M3 13.5l9 5 9-5"/>',
  filter: '<path d="M3.5 5h17l-6.8 8.3V20l-3.4-1.7v-5z"/>',
  type: '<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>',
  droplet: '<path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3z"/>',
  play: '<path d="M7 4.8v14.4L19 12z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 3 18.5v-10A2.5 2.5 0 0 1 5.5 6H10"/>',
  hash: '<path d="M5 9h14.5M4.5 15H19M10 4l-2 16M16 4l-2 16"/>',
  crown: '<path d="M3.5 8l4.2 3.5L12 5l4.3 6.5L20.5 8 19 18H5z"/><path d="M5 21h14"/>',
  tray: '<path d="M3 17h18M5 17a7 7 0 0 1 14 0"/><path d="M12 7v3M10.5 7h3"/>',
  store: '<path d="M4 9.5V20h16V9.5"/><path d="M2.5 9.5L5 4h14l2.5 5.5a2.6 2.6 0 0 1-5 .5 2.6 2.6 0 0 1-4.5 0 2.6 2.6 0 0 1-4.5 0 2.6 2.6 0 0 1-5-.5z"/><path d="M10 20v-5h4v5"/>',
  seat: '<path d="M7 3.5h10v8H7z"/><path d="M5 11.5h14v3H5zM7 14.5V21M17 14.5V21"/>',
  wand: '<path d="M4 20L15 9"/><path d="M14 4v2.5M19.5 9.5H17M17.9 5.9l-1.6 1.6M10.5 5.5l1 1M18.5 13.5l-1-1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5V6z"/>',
};

export function Icon({ name, size = 20, class: cls = '', label, style }) {
  return html`<svg
    class=${`icon ${cls}`}
    width=${size}
    height=${size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    style=${style}
    aria-hidden=${label ? undefined : 'true'}
    role=${label ? 'img' : undefined}
    aria-label=${label}
    focusable="false"
    dangerouslySetInnerHTML=${{ __html: PATHS[name] ?? '' }}
  ></svg>`;
}

// The brand mark: a sun disc with rays (Alshams = "the sun").
let markSeq = 0;
export function BrandMark({ size = 40 }) {
  const id = useMemo(() => `bm-g${++markSeq}`, []);
  return html`<svg class="brand-mark" width=${size} height=${size} viewBox="0 0 48 48" aria-hidden="true">
    <defs>
      <linearGradient id=${id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f1d08f" />
        <stop offset="0.55" stop-color="#d4a056" />
        <stop offset="1" stop-color="#9c6d33" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="46" height="46" rx="14" fill="#15120d" stroke="rgba(212,160,86,0.35)" />
    <circle cx="24" cy="24" r="7.5" fill=${`url(#${id})`} />
    <g stroke=${`url(#${id})`} stroke-width="2.4" stroke-linecap="round">
      <path d="M24 8.5v4M24 35.5v4M8.5 24h4M35.5 24h4M13 13l2.8 2.8M32.2 32.2L35 35M13 35l2.8-2.8M32.2 15.8L35 13" />
    </g>
  </svg>`;
}
