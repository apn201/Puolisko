// Honest statistics for one split-face run. No dependencies.
//
// For each concern we have, per day, the flagged share on side A and side B.
// Lighting, camera, sleep and diet hit both sides at once, so they cancel in d = A - B.
// A product effect shows up as d drifting over the run. We fit a line to d over days and ask
// whether the drift is distinguishable from zero, correcting for testing several concerns.

export const MIN_POINTS = 5;

// ---- Student t distribution -------------------------------------------------------------

function lgamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a, b, x) {
  const TINY = 1e-30;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}

function ibeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// P(T <= t) for df degrees of freedom.
export function tCdf(t, df) {
  const p = 0.5 * ibeta(df / 2, 0.5, df / (df + t * t));
  return t >= 0 ? 1 - p : p;
}

// Two-sided critical value: P(|T| > q) = alpha.
export function tCrit(alpha, df) {
  let lo = 0, hi = 1000;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (2 * (1 - tCdf(mid, df)) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---- basic pieces ------------------------------------------------------------------------

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
function sd(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

// Ordinary least squares y = a + b x, with the slope's standard error.
export function fitLine(xs, ys) {
  const n = xs.length;
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const resid = ys.map((y, i) => y - (intercept + slope * xs[i]));
  const s2 = n > 2 ? resid.reduce((s, r) => s + r * r, 0) / (n - 2) : NaN;
  return { slope, intercept, se: sxx ? Math.sqrt(s2 / sxx) : NaN, residSd: Math.sqrt(s2), df: n - 2 };
}

const DAY = 86400000;
export const dayNumber = (dateStr, startStr) =>
  Math.round((Date.parse(dateStr + 'T12:00:00Z') - Date.parse(startStr + 'T12:00:00Z')) / DAY);

// ---- the analysis ------------------------------------------------------------------------

// entries: [{ date: 'YYYY-MM-DD', sides: { concern: { a, b } } }]
// Returns per-concern results plus an overall verdict.
export function analyse(entries, concerns, alpha = 0.05) {
  const sorted = [...entries].sort((x, y) => x.date.localeCompare(y.date));
  const start = sorted[0]?.date;
  const tested = concerns.filter((c) => sorted.filter((e) => e.sides?.[c]).length >= MIN_POINTS);
  const k = Math.max(1, tested.length);
  const adjAlpha = alpha / k; // Bonferroni: six concerns means six chances to fool ourselves

  const perConcern = {};
  for (const c of concerns) {
    const pts = sorted.filter((e) => e.sides?.[c]);
    const days = pts.map((e) => dayNumber(e.date, start));
    const a = pts.map((e) => e.sides[c].a);
    const b = pts.map((e) => e.sides[c].b);
    const d = pts.map((_, i) => a[i] - b[i]);
    const r = { n: pts.length, days, a, b, d };
    if (pts.length >= MIN_POINTS && new Set(days).size >= 3) {
      const fit = fitLine(days, d);
      const span = Math.max(...days) - Math.min(...days);
      const q = tCrit(adjAlpha, fit.df);
      r.fit = fit;
      r.span = span;
      r.change = fit.slope * span;               // how far A - B moved over the run
      r.ci = [(fit.slope - q * fit.se) * span, (fit.slope + q * fit.se) * span];
      r.p = Math.min(1, 2 * (1 - tCdf(Math.abs(fit.slope / fit.se), fit.df)) * k);
      r.significant = r.ci[0] > 0 || r.ci[1] < 0;
      // Masks flag problems, so a falling A - B means A is doing better than B.
      r.favours = !r.significant ? null : r.change < 0 ? 'a' : 'b';
      // Noise removed by the split: how much the face as a whole swings day to day,
      // against how much the A - B difference swings around its trend.
      const whole = pts.map((_, i) => (a[i] + b[i]) / 2);
      r.wholeSd = sd(whole);
      r.diffSd = fit.residSd;
    }
    perConcern[c] = r;
  }

  const ready = Object.values(perConcern).filter((r) => r.fit);
  const hits = ready.filter((r) => r.significant);
  let verdict;
  if (!ready.length) verdict = 'too-early';
  else if (!hits.length) verdict = 'null';
  else verdict = 'difference';

  const ratios = ready.filter((r) => r.wholeSd > 0 && r.diffSd >= 0).map((r) => r.diffSd / r.wholeSd);
  const noiseRemoved = ratios.length ? 1 - median(ratios) : null;

  const lastDay = sorted.length ? dayNumber(sorted.at(-1).date, start) + 1 : 0;
  return { perConcern, verdict, hits: hits.length, tested: ready.length, days: lastDay, photos: sorted.length, adjAlpha, noiseRemoved };
}

function median(xs) {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
