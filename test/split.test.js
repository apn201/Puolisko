import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSides, scoreMask, unionBox, resolveMidline } from '../public/js/split.js';

// A 200x100 transparent mask with a face-sized opaque-ish block and extra flags on one side.
function mask(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = 255; data[i + 3] = paint(x, y);
  }
  return { width: w, height: h, data };
}

test('symmetric mask scores equal on both sides', () => {
  const m = mask(200, 100, (x) => (x >= 40 && x < 160 ? 50 : 0));
  const box = unionBox([m]);
  const s = scoreMask(m, 100, box);
  assert.ok(Math.abs(s.imgLeft - s.imgRight) < 1e-9);
});

test('extra flags on image-left raise only image-left', () => {
  const m = mask(200, 100, (x) => (x >= 40 && x < 160 ? (x < 80 ? 200 : 50) : 0));
  const s = scoreMask(m, 100, unionBox([m]));
  assert.ok(s.imgLeft > s.imgRight);
});

test('product A mapped to the chosen image side', () => {
  const m = mask(200, 100, (x) => (x >= 40 && x < 160 ? (x < 80 ? 200 : 50) : 0));
  const src = { width: 200, height: 100, midFrac: 0.5 };
  const r1 = scoreSides({ redness: m }, src, 'imgLeft');
  const r2 = scoreSides({ redness: m }, src, 'imgRight');
  assert.ok(r1.sides.redness.a > r1.sides.redness.b);
  assert.equal(r1.sides.redness.a, r2.sides.redness.b);
  assert.equal(r1.meta.midline, 'user');
});

test('cropped mask falls back to the flagged-area centre', () => {
  const mid = resolveMidline(100, 100, 300, 400, 0.5, { x0: 10, x1: 70, y0: 0, y1: 99 });
  assert.deepEqual(mid, { x: 40, method: 'box' });
});

test('opaque (jpeg-like) mask uses brightness', () => {
  const w = 200, h = 50, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, v = x >= 40 && x < 160 ? (x > 130 ? 255 : 60) : 0;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const m = { width: w, height: h, data };
  const s = scoreMask(m, 100, unionBox([m]));
  assert.ok(s.imgRight > s.imgLeft);
});
