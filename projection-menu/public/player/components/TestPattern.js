// Calibration test pattern, drawn on the (warped) stage itself: grid,
// diagonals, numbered corners matching the draggable handles in the staff
// app (1 top-left, 2 top-right, 3 bottom-right, 4 bottom-left) and the table.

import { html } from 'htm/preact';
import { STAGE_H, STAGE_W } from '../lib/layout.js';

const STEP = 120;
const CORNER_COLORS = ['#f2b84b', '#5fd0a0', '#6aa7ff', '#ef6f9d'];

export function TestPattern({ tableNumber, projectorName, layout, rotation }) {
  const W = STAGE_W;
  const H = STAGE_H;
  const lines = [];
  for (let x = STEP; x < W; x += STEP) lines.push(`M${x} 0V${H}`);
  for (let y = STEP; y < H; y += STEP) lines.push(`M0 ${y}H${W}`);
  const corners = [
    [72, 72],
    [W - 72, 72],
    [W - 72, H - 72],
    [72, H - 72],
  ];
  return html`
    <svg class="test-pattern" viewBox="0 0 ${W} ${H}" width=${W} height=${H} aria-hidden="true">
      <rect width=${W} height=${H} fill="#000" />
      <path d=${lines.join('')} stroke="#2c2c2c" stroke-width="2" />
      <path d="M0 0L${W} ${H}M${W} 0L0 ${H}" stroke="#3a3a3a" stroke-width="2" />
      <path d="M${W / 2} 0V${H}M0 ${H / 2}H${W}" stroke="#5a5a5a" stroke-width="3" />
      <circle cx=${W / 2} cy=${H / 2} r="300" fill="none" stroke="#4a4a4a" stroke-width="3" />
      ${layout === 'dual' && html`<path d="M0 ${H / 2}H${W}" stroke="#d4a056" stroke-width="4" stroke-dasharray="24 16" />`}
      <rect x="6" y="6" width=${W - 12} height=${H - 12} fill="none" stroke="#fff" stroke-width="12" />
      ${corners.map(([cx, cy], i) => html`
        <g>
          <circle cx=${cx} cy=${cy} r="50" fill=${CORNER_COLORS[i]} />
          <text x=${cx} y=${cy + 2} class="tp-num">${i + 1}</text>
        </g>
      `)}
      <text x=${W / 2} y=${H / 2 - 30} class="tp-table">${tableNumber != null ? `طاولة ${tableNumber}` : 'جهاز عرض'}</text>
      ${projectorName && html`<text x=${W / 2} y=${H / 2 + 70} class="tp-name">${projectorName}</text>`}
      <text x=${W / 2} y=${H / 2 + 130} class="tp-hint">
        ${`اسحب الزوايا الأربع في التطبيق حتى تنطبق على حواف الطاولة · تدوير \u2066${rotation}°\u2069 · ${layout === 'dual' ? 'عرض مزدوج' : 'عرض واحد'}`}
      </text>
      <path d="M${W / 2} 150l-34 52h68z" fill="#fff" />
      <text x=${W / 2} y="250" class="tp-hint">أعلى الصورة</text>
    </svg>
  `;
}
