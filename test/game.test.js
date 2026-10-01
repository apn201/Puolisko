import { test } from 'node:test';
import assert from 'node:assert/strict';
import { result, halfScore, pickBeautyCheek, cheekToImage } from '../public/js/game.js';

// halves for all four concerns, with given densities per image half
const scanOf = (imgLeft, imgRight) => Object.fromEntries(['wrinkle', 'redness', 'dark_circle_v2', 'age_spot']
  .map((c) => [c, { imgLeft: { density: imgLeft, flagged: imgLeft * 100, pixels: 10000 }, imgRight: { density: imgRight, flagged: imgRight * 100, pixels: 10000 } }]));

test('player left cheek is the image right half', () => {
  assert.equal(cheekToImage('left'), 'imgRight');
  assert.equal(cheekToImage('right'), 'imgLeft');
});

test('a monstrous Beast side makes a big positive gap', () => {
  // Beauty = left cheek = image right. Beast = image left, heavily flagged.
  const r = result(scanOf(2, 2), scanOf(12, 1), 'left');
  assert.ok(r.beauty > r.beast);
  assert.ok(r.gap > 30);
});

test('natural asymmetry is subtracted', () => {
  // Bare face already worse on the Beast side by the same amount: no gap.
  const r = result(scanOf(5, 1), scanOf(5, 1), 'left');
  assert.equal(r.gap, 0);
  assert.ok(r.offset > 0);
});

test('scores stay within 0..100', () => {
  assert.equal(halfScore(scanOf(90, 0), 'imgLeft'), 0);
  assert.equal(halfScore(scanOf(0, 0), 'imgLeft'), 100);
});

test('coin is fair-ish', () => {
  let left = 0;
  let s = 1;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2000; i++) if (pickBeautyCheek(rand) === 'left') left++;
  assert.ok(left > 900 && left < 1100);
});
