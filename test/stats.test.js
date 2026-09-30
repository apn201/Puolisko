import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tCrit, tCdf, analyse, fitLine } from '../public/js/stats.js';

test('t distribution matches tables', () => {
  assert.ok(Math.abs(tCrit(0.05, 10) - 2.228) < 0.002);
  assert.ok(Math.abs(tCrit(0.05, 3) - 3.182) < 0.002);
  assert.ok(Math.abs(tCdf(0, 7) - 0.5) < 1e-9);
});

test('fitLine recovers a slope', () => {
  const f = fitLine([0, 1, 2, 3], [1, 3, 5, 7]);
  assert.ok(Math.abs(f.slope - 2) < 1e-9);
});

// Deterministic pseudo-noise so the test does not flake.
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5; }
const date = (i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);

function run(effectPerDay, seed) {
  const r = rng(seed);
  return Array.from({ length: 14 }, (_, i) => {
    const day = 8 * r();           // light, sleep: hits both sides
    return { date: date(i), sides: { redness: { a: 20 + day + 0.3 * r() - effectPerDay * i, b: 20 + day + 0.3 * r() } } };
  });
}

test('no effect gives a null verdict and shows noise removed', () => {
  const r = analyse(run(0, 42), ['redness']);
  assert.equal(r.verdict, 'null');
  assert.ok(r.noiseRemoved > 0.8);
});

test('a real effect is found and credited to A', () => {
  const r = analyse(run(0.5, 7), ['redness']);
  assert.equal(r.verdict, 'difference');
  assert.equal(r.perConcern.redness.favours, 'a');
});

test('too few photos says too early', () => {
  assert.equal(analyse(run(0, 1).slice(0, 3), ['redness']).verdict, 'too-early');
});
