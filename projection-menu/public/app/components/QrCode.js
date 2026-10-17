// QR codes drawn on a canvas with qrcode-generator (MIT), served by the
// restaurant server from node_modules. Loaded lazily; if it is missing (for
// example in the offline demo) the link text is shown instead.

import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';

let libPromise = null;
function loadLib() {
  libPromise ??= import('/vendor/qrcode/qrcode.mjs').then((m) => {
    const qrcode = m.default;
    // The default byte mode keeps only the low byte of each char: use UTF-8.
    qrcode.stringToBytes = (text) => [...new TextEncoder().encode(text)];
    return qrcode;
  });
  return libPromise;
}

const QUIET_ZONE = 4; // white margin (modules) scanners need

async function draw(canvas, text, size) {
  const qrcode = await loadLib();
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.max(2, Math.floor(size / (count + QUIET_ZONE * 2)));
  const px = (count + QUIET_ZONE * 2) * cell;
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, px, px);
  g.fillStyle = '#000';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) g.fillRect((c + QUIET_ZONE) * cell, (r + QUIET_ZONE) * cell, cell, cell);
    }
  }
}

export function QrCode({ text, size = 200, label }) {
  const ref = useRef();
  const [state, setState] = useState('loading');
  useEffect(() => {
    let alive = true;
    setState('loading');
    draw(ref.current, text, size * 2)
      .then(() => alive && setState('ok'))
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [text, size]);
  return html`<div class=${`qr qr-${state}`} style=${{ width: `${size}px`, height: `${size}px` }}>
    <canvas ref=${ref} role="img" aria-label=${label ?? `رمز QR: ${text}`} data-qr=${text}></canvas>
    ${state === 'error' && html`<span class="qr-fallback">تعذّر رسم الرمز — استخدم الرابط</span>`}
  </div>`;
}

export function qrDataUrl(canvasParent) {
  return canvasParent?.querySelector('canvas')?.toDataURL('image/png') ?? null;
}
