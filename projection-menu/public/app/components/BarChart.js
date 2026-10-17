// Single-series column chart in SVG (revenue by day). One hue, thin columns
// with rounded tops anchored to the baseline, a recessive grid, sparse axis
// labels and a tooltip per column. Text stays in ink colors.

import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const H = 240;
const PAD = { top: 16, right: 8, bottom: 30, left: 64 };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return ([1, 2, 2.5, 3, 4, 5, 6, 8, 10].find((step) => n <= step) ?? 10) * p;
}

// data: [{ key, label, value, tip }] ; format(value) -> axis/tooltip text
export function BarChart({ data, format = String, label }) {
  const ref = useRef();
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const slot = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(36, slot - 2)); // 2px surface gap between columns
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 64))));
  // RTL reading order: the first day sits at the right edge.
  const xOf = (i) => PAD.left + plotW - (i + 1) * slot + (slot - barW) / 2;
  const yOf = (v) => PAD.top + plotH - (v / max) * plotH;
  const r = Math.min(4, barW / 2);

  const bar = (d, i) => {
    const x = xOf(i);
    const y = yOf(d.value);
    const h = PAD.top + plotH - y;
    if (h <= 0) return null;
    const rr = Math.min(r, h);
    // Rounded data end (top), square at the baseline.
    const path = `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + barW - rr}Q${x + barW},${y} ${x + barW},${y + rr}V${y + h}Z`;
    return html`<path d=${path} class=${hover === i ? 'bc-bar is-hover' : 'bc-bar'} />`;
  };

  const tip = hover != null ? data[hover] : null;
  return html`<div class="barchart" ref=${ref}>
    ${width > 0 &&
    html`<svg width=${width} height=${H} role="img" aria-label=${label} onPointerLeave=${() => setHover(null)}>
      ${ticks.map(
        (t) => html`<g key=${t}>
          <line class="bc-grid" x1=${PAD.left} x2=${PAD.left + plotW} y1=${yOf(t)} y2=${yOf(t)} />
          <text class="bc-axis" x=${PAD.left - 10} y=${yOf(t) + 4} direction="rtl" text-anchor="start">${format(t)}</text>
        </g>`,
      )}
      ${data.map((d, i) => html`<g key=${d.key}>${bar(d, i)}</g>`)}
      ${data.map((d, i) =>
        i % every === 0 ? html`<text key=${`l${d.key}`} class="bc-axis" x=${xOf(i) + barW / 2} y=${H - 8} text-anchor="middle">${d.label}</text>` : null,
      )}
      ${data.map(
        (d, i) => html`<rect
          key=${`h${d.key}`}
          class="bc-hit"
          x=${PAD.left + plotW - (i + 1) * slot}
          y=${PAD.top}
          width=${slot}
          height=${plotH}
          onPointerEnter=${() => setHover(i)}
          onPointerDown=${() => setHover(i)}
        />`,
      )}
    </svg>`}
    ${tip &&
    html`<div
      class="bc-tip"
      style=${{ left: `${Math.min(Math.max(xOf(hover) + barW / 2, 90), width - 90)}px`, top: `${Math.max(yOf(tip.value) - 12, 8)}px` }}
      role="status"
    >
      <strong>${tip.tip ?? tip.label}</strong>
      <span class="num">${format(tip.value)}</span>
      ${tip.extra && html`<span class="muted">${tip.extra}</span>`}
    </div>`}
  </div>`;
}
