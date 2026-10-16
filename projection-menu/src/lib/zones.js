import { badRequest } from './validate.js';

// A "zone" is the rectangle of the projected surface in front of one seat,
// in normalized stage coordinates (0..1), after corner-pin calibration.
//
// Diners sit on two sides of the table, so the default layout puts half the
// seats on the near edge (content upright) and half on the far edge
// (content rotated 180° so it reads correctly from the other side).
export function defaultZones(seats) {
  const far = Math.ceil(seats / 2);
  const near = seats - far;
  const zones = [];
  const row = (count, y, rotate, firstSeat) => {
    for (let i = 0; i < count; i++) {
      zones.push({
        seat: firstSeat + i,
        x: round(i / count),
        y,
        w: round(1 / count),
        h: 0.5,
        rotate,
      });
    }
  };
  row(far, 0, 180, 1);
  row(near, 0.5, 0, far + 1);
  return zones;
}

// The whole table surface; used for table-wide shows and the idle loop.
export const FULL_ZONE = Object.freeze({ seat: null, x: 0, y: 0, w: 1, h: 1, rotate: 0 });

export function validateZones(zones) {
  if (!Array.isArray(zones) || zones.length > 20) throw badRequest('مناطق المقاعد غير صالحة');
  const seen = new Set();
  return zones.map((z) => {
    const seat = Number(z?.seat);
    const fields = ['x', 'y', 'w', 'h'].map((k) => Number(z?.[k]));
    if (!Number.isInteger(seat) || seat < 1 || seen.has(seat)) throw badRequest('رقم مقعد غير صالح في المناطق');
    if (fields.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) throw badRequest('إحداثيات المنطقة يجب أن تكون بين 0 و 1');
    seen.add(seat);
    const [x, y, w, h] = fields;
    return { seat, x, y, w, h, rotate: Number(z.rotate) || 0 };
  });
}

// Corner-pin calibration: where the 4 corners of the stage land on the
// projector output, normalized 0..1 (top-left, top-right, bottom-right, bottom-left).
export const DEFAULT_CALIBRATION = Object.freeze({
  corners: [[0, 0], [1, 0], [1, 1], [0, 1]],
});

export function validateCalibration(cal) {
  const corners = cal?.corners;
  if (!Array.isArray(corners) || corners.length !== 4) throw badRequest('المعايرة تحتاج 4 زوايا');
  return {
    corners: corners.map((p) => {
      const [x, y] = Array.isArray(p) ? p.map(Number) : [];
      // Allow corners slightly outside the frame (projector overscan).
      if (![x, y].every((v) => Number.isFinite(v) && v >= -0.5 && v <= 1.5)) {
        throw badRequest('إحداثيات زاوية غير صالحة');
      }
      return [x, y];
    }),
  };
}

const round = (v) => Math.round(v * 10000) / 10000;
