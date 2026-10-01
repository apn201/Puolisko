import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreHalves, scoreScan, fallbackLine } from '../public/js/split.js';
import { fitMidline } from '../public/js/landmarks.js';

// Transparent RGBA mask painted by paint(x, y) -> alpha.
function mask(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = 255; data[i + 3] = paint(x, y);
  }
  return { width: w, height: h, data };
}

test('symmetric mask: equal halves', () => {
  const m = mask(200, 100, (x) => (x >= 40 && x < 160 ? 80 : 0));
  const r = scoreHalves(m, { a: 0.5, b: 0 }, null, 2);
  assert.ok(Math.abs(r.imgLeft.density - r.imgRight.density) < 1e-9);
});

test('drawn lines on image-left raise only image-left', () => {
  const m = mask(200, 100, (x) => (x >= 50 && x < 70 ? 255 : 0));
  const r = scoreHalves(m, { a: 0.5, b: 0 }, null, 2);
  assert.ok(r.imgLeft.flagged > 0);
  assert.equal(r.imgRight.flagged, 0);
});

test('tilted midline splits along the tilt', () => {
  // Flags exactly left of a line that runs from x=80 at top to x=120 at bottom.
  const line = { a: 0.4, b: 0.2 };
  const m = mask(200, 200, (x, y) => (x < 200 * (line.a + line.b * (y / 200)) - 3 ? 255 : 0));
  const tilted = scoreHalves(m, line, null, 2);
  assert.equal(tilted.imgRight.flagged, 0);
  const straight = scoreHalves(m, { a: 0.5, b: 0 }, null, 2);
  assert.ok(straight.imgRight.flagged > 0);
});

test('inside raster excludes background', () => {
  const m = mask(100, 100, () => 255);
  const inside = new Uint8Array(100 * 100);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 30; x++) inside[y * 100 + x] = 1;
  const r = scoreHalves(m, { a: 0.5, b: 0 }, inside, 2);
  assert.equal(r.imgRight.pixels, 0);
  assert.equal(r.imgLeft.pixels, 3000);
});

test('scoreScan uses landmarks only when the mask matches the photo shape', () => {
  const m = mask(150, 200, (x) => (x > 20 && x < 130 ? 50 : 0));
  const face = { line: { a: 0.45, b: 0 }, oval: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]] };
  const ok = scoreScan({ wrinkle: m }, face, { width: 768, height: 1024 }, null);
  assert.equal(ok.meta.midline, 'landmarks');
  const crop = scoreScan({ wrinkle: m }, face, { width: 1024, height: 1024 }, null);
  assert.equal(crop.meta.midline, 'fallback');
});

test('fallbackLine centres on the flagged area', () => {
  const m = mask(200, 100, (x) => (x >= 20 && x < 120 ? 200 : 0));
  assert.ok(Math.abs(fallbackLine([m]).a - 0.345) < 0.02);
});

test('fitMidline recovers a tilted line', () => {
  const pts = [0, 0.25, 0.5, 0.75, 1].map((y) => [0.4 + 0.1 * y, y]);
  const l = fitMidline(pts);
  assert.ok(Math.abs(l.a - 0.4) < 1e-9 && Math.abs(l.b - 0.1) < 1e-9);
});
