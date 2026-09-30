// Small SVG charts. No library.

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

function scale(d0, d1, r0, r1) {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

function nice(lo, hi, pad = 0.1) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}

// Two lines, side A and side B, over days.
export function sidesChart({ days, a, b }, { w = 340, h = 150 } = {}) {
  const m = { l: 34, r: 8, t: 8, b: 20 };
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart', role: 'img' });
  const [lo, hi] = nice(Math.min(...a, ...b), Math.max(...a, ...b));
  const x = scale(Math.min(...days), Math.max(...days, 1), m.l, w - m.r);
  const y = scale(lo, hi, h - m.b, m.t);
  axes(svg, x, y, days, lo, hi, w, h, m);
  line(svg, days, b, x, y, 'series-b');
  line(svg, days, a, x, y, 'series-a');
  return svg;
}

// The difference A - B with its fitted trend and a zero line.
export function diffChart({ days, d, fit }, { w = 340, h = 110 } = {}) {
  const m = { l: 34, r: 8, t: 8, b: 20 };
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart', role: 'img' });
  const [lo, hi] = nice(Math.min(0, ...d), Math.max(0, ...d), 0.25);
  const x = scale(Math.min(...days), Math.max(...days, 1), m.l, w - m.r);
  const y = scale(lo, hi, h - m.b, m.t);
  axes(svg, x, y, days, lo, hi, w, h, m);
  svg.append(el('line', { x1: m.l, x2: w - m.r, y1: y(0), y2: y(0), class: 'zero' }));
  if (fit) {
    const d0 = Math.min(...days), d1 = Math.max(...days);
    svg.append(el('line', {
      x1: x(d0), x2: x(d1), y1: y(fit.intercept + fit.slope * d0), y2: y(fit.intercept + fit.slope * d1), class: 'trend',
    }));
  }
  line(svg, days, d, x, y, 'series-d');
  return svg;
}

function axes(svg, x, y, days, lo, hi, w, h, m) {
  for (const v of [lo, (lo + hi) / 2, hi]) {
    svg.append(el('line', { x1: m.l, x2: w - m.r, y1: y(v), y2: y(v), class: 'grid' }));
    const t = el('text', { x: m.l - 4, y: y(v) + 3, class: 'tick', 'text-anchor': 'end' });
    t.textContent = v.toFixed(Math.abs(hi - lo) < 3 ? 1 : 0);
    svg.append(t);
  }
  const d0 = Math.min(...days), d1 = Math.max(...days);
  for (const dv of d1 > d0 ? [d0, d1] : [d0]) {
    const t = el('text', { x: x(dv), y: h - 5, class: 'tick', 'text-anchor': dv === d0 ? 'start' : 'end' });
    t.textContent = `day ${dv + 1}`;
    svg.append(t);
  }
}

function line(svg, xs, ys, x, y, cls) {
  const pts = xs.map((v, i) => `${x(v).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(' ');
  svg.append(el('polyline', { points: pts, class: `line ${cls}` }));
  xs.forEach((v, i) => svg.append(el('circle', { cx: x(v), cy: y(ys[i]), r: 2.6, class: `dot ${cls}` })));
}
