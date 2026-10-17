import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyHomography, solveHomography, stageTransform } from '../public/shared/homography.js';
import { defaultCalibration, readCalibration, validateCalibration } from '../src/lib/calibration.js';

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
  const css = stageTransform(defaultCalibration().corners, 1920, 1080, 1280, 720);
  const m = css.slice('matrix3d('.length, -1).split(',').map(Number);
  assert.ok(Math.abs(m[0] - 1280 / 1920) < 1e-9);
  assert.ok(Math.abs(m[5] - 720 / 1080) < 1e-9);
  assert.ok(Math.abs(m[3]) < 1e-12 && Math.abs(m[7]) < 1e-12, 'no perspective terms');
});

test('collinear corners are rejected', () => {
  assert.throws(() => solveHomography(STAGE, [[0, 0], [1, 1], [2, 2], [3, 3]]), /Degenerate/);
});

test('calibration validation and safe reading of stored values', () => {
  assert.throws(() => validateCalibration({ corners: [[0, 0]] }), /4 زوايا/);
  assert.throws(() => validateCalibration({ corners: [[0, 0], [1, 0], [1, 1], [0, 9]] }), /غير صالحة/);
  assert.deepEqual(validateCalibration({ corners: [[0, 0], ['1', 0], [1, 1], [0, 1]] }).corners[1], [1, 0]);
  assert.deepEqual(validateCalibration({ corners: [[-0.1, 0], [1.1, 0], [1, 1], [0, 1]] }).corners[0], [-0.1, 0], 'overscan allowed');
  assert.deepEqual(readCalibration('not json'), defaultCalibration());
  assert.deepEqual(readCalibration('{"corners":[[0,0]]}'), defaultCalibration());
  const a = defaultCalibration();
  a.corners[0][0] = 0.5;
  assert.deepEqual(defaultCalibration().corners[0], [0, 0], 'defaults are fresh copies');
});
