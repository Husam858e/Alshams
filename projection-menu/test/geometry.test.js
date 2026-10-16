import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyHomography, solveHomography, stageTransform } from '../public/shared/homography.js';
import { defaultZones, validateCalibration, validateZones } from '../src/lib/zones.js';

const STAGE = [[0, 0], [1920, 0], [1920, 1080], [0, 1080]];

test('homography maps each stage corner onto its calibrated corner', () => {
  const dst = [[130, 40], [1180, 85], [1090, 690], [64, 640]];
  const H = solveHomography(STAGE, dst);
  STAGE.forEach((p, i) => {
    const [x, y] = applyHomography(H, p);
    assert.ok(Math.abs(x - dst[i][0]) < 1e-6 && Math.abs(y - dst[i][1]) < 1e-6, `corner ${i}`);
  });
});

test('default corners give a pure scale matrix3d', () => {
  const css = stageTransform([[0, 0], [1, 0], [1, 1], [0, 1]], 1920, 1080, 1280, 720);
  const m = css.slice('matrix3d('.length, -1).split(',').map(Number);
  assert.ok(Math.abs(m[0] - 1280 / 1920) < 1e-9);
  assert.ok(Math.abs(m[5] - 720 / 1080) < 1e-9);
  assert.ok(Math.abs(m[3]) < 1e-12 && Math.abs(m[7]) < 1e-12, 'no perspective terms');
});

test('collinear corners are rejected', () => {
  assert.throws(() => solveHomography(STAGE, [[0, 0], [1, 1], [2, 2], [3, 3]]), /Degenerate/);
});

test('default zones split seats between the two long sides', () => {
  const zones = defaultZones(4);
  assert.deepEqual(zones.map((z) => [z.seat, z.rotate, z.y]), [[1, 180, 0], [2, 180, 0], [3, 0, 0.5], [4, 0, 0.5]]);
  const odd = defaultZones(3);
  assert.equal(odd.filter((z) => z.rotate === 180).length, 2);
  assert.equal(odd.reduce((s, z) => s + z.w * z.h, 0), 1, 'zones cover the whole table');
  assert.deepEqual(defaultZones(1), [{ seat: 1, x: 0, y: 0, w: 1, h: 0.5, rotate: 180 }]);
});

test('zone and calibration validation', () => {
  assert.throws(() => validateZones([{ seat: 1, x: 0, y: 0, w: 2, h: 1 }]), /بين 0 و 1/);
  assert.throws(() => validateZones([{ seat: 1, x: 0, y: 0, w: 1, h: 1 }, { seat: 1, x: 0, y: 0, w: 1, h: 1 }]));
  assert.throws(() => validateCalibration({ corners: [[0, 0]] }));
  assert.deepEqual(validateCalibration({ corners: [[0, 0], ['1', 0], [1, 1], [0, 1]] }).corners[1], [1, 0]);
});
