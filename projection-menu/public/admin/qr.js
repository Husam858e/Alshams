// QR codes drawn on a <canvas> with qrcode-generator (MIT), which the server
// serves from node_modules: the restaurant LAN may have no internet.

import qrcode from '/vendor/qrcode/qrcode.mjs';

// The library's default byte mode keeps only the low byte of each char.
qrcode.stringToBytes = (text) => [...new TextEncoder().encode(text)];

const QUIET_ZONE = 4; // white margin (in modules) that scanners need

// Level M survives a slightly blurry or glossy print; version 0 = smallest
// version that fits the text.
export function qrCanvas(text, { cell = 8 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const size = (count + QUIET_ZONE * 2) * cell;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.className = 'qr';
  canvas.dataset.qr = text;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `رمز QR: ${text}`);

  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) g.fillRect((col + QUIET_ZONE) * cell, (row + QUIET_ZONE) * cell, cell, cell);
    }
  }
  return canvas;
}
