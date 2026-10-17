// Geometry of the projected surface.
//
// The stage is always 1920x1080 (that is what calibration warps onto the
// table). Rotation turns the content inside it; 90/270 make it portrait.
// Layout 'dual' splits it into two halves for guests on both long sides: the
// far half is turned 180 degrees so it reads the right way up for them.

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export const ROTATIONS = [0, 90, 180, 270];

export function normalizeRotation(value) {
  const r = Number(value) || 0;
  return ROTATIONS.includes(r) ? r : 0;
}

export function surfaceSize(rotation) {
  return normalizeRotation(rotation) % 180 ? { w: STAGE_H, h: STAGE_W } : { w: STAGE_W, h: STAGE_H };
}

// Each frame is one copy of the scene: its rectangle on the surface, the
// virtual size it is designed at, and the scale that maps one to the other.
export function framesFor(projector) {
  const { w, h } = surfaceSize(projector?.rotation);
  if (projector?.layout !== 'dual') {
    return [{ id: 'main', x: 0, y: 0, w, h, vw: w, vh: h, scale: 1, flip: false }];
  }
  const half = h / 2;
  // Halves are small; render them at a larger virtual size and scale down a
  // little so type stays legible without crowding the layout.
  const scale = Math.min(1, Math.max(w / 2304, half / 1296));
  const vw = Math.round(w / scale);
  const vh = Math.round(half / scale);
  return [
    { id: 'far', x: 0, y: 0, w, h: half, vw, vh, scale, flip: true },
    { id: 'near', x: 0, y: half, w, h: half, vw, vh, scale, flip: false },
  ];
}

export function shapeOf(w, h) {
  const ratio = w / h;
  if (ratio >= 2.4) return 'wide';
  if (ratio >= 1.4) return 'landscape';
  if (ratio >= 0.9) return 'square';
  return 'portrait';
}

// Dish cards per page for each frame shape.
const PER_PAGE = { landscape: 4, wide: 3, square: 4, portrait: 4 };

export function perPageFor(shape) {
  return PER_PAGE[shape] ?? 4;
}

export function primaryShape(projector) {
  const [frame] = framesFor(projector);
  return shapeOf(frame.vw, frame.vh);
}
