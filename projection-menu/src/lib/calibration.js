import { badRequest } from './validate.js';

// Corner-pin calibration: where the 4 corners of the 1920x1080 stage land on
// the projector output, normalized 0..1 (top-left, top-right, bottom-right,
// bottom-left). The player turns it into a CSS matrix3d (public/shared/homography.js).
export const DEFAULT_CALIBRATION = Object.freeze({
  corners: Object.freeze([[0, 0], [1, 0], [1, 1], [0, 1]].map((p) => Object.freeze(p))),
});

export const defaultCalibration = () => ({ corners: DEFAULT_CALIBRATION.corners.map((p) => [...p]) });

export function validateCalibration(cal) {
  const corners = cal?.corners;
  if (!Array.isArray(corners) || corners.length !== 4) throw badRequest('المعايرة تحتاج 4 زوايا');
  return {
    corners: corners.map((p) => {
      const [x, y] = Array.isArray(p) && p.length === 2 ? p.map(Number) : [];
      // Allow corners slightly outside the frame (projector overscan).
      if (![x, y].every((v) => Number.isFinite(v) && v >= -0.5 && v <= 1.5)) {
        throw badRequest('إحداثيات زاوية غير صالحة');
      }
      return [round(x), round(y)];
    }),
  };
}

// Stored JSON may be missing or broken; always hand out a usable calibration.
export function readCalibration(text) {
  try {
    return validateCalibration(JSON.parse(text));
  } catch {
    return defaultCalibration();
  }
}

const round = (v) => Math.round(v * 1e5) / 1e5;
