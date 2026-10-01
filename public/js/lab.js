// Lab: the day-one spike. Answers whether per-side scoring works, on real photos, with real units.
import * as api from './api.js';
import { fileToCanvas, toJpeg, mirrorHalf, OUT_W, OUT_H } from './image.js';
import { scoreSides, activationFn } from './split.js';

const CONCERNS = ['redness', 'acne', 'pore', 'texture', 'age_spot', 'oiliness'];
const $ = (id) => document.getElementById(id);
let photos = [];
let units = 0;
const raw = [];

const status = (t) => { $('status').textContent = t; };
const spend = () => { units += 12; $('units').textContent = units; };

$('code').addEventListener('change', () => api.setAccessCode($('code').value.trim()));
try { api.setAccessCode(JSON.parse(localStorage.getItem('puolisko.v1'))?.accessCode || ''); } catch { /* none */ }

$('files').addEventListener('change', async () => {
  photos = [];
  $('thumbs').replaceChildren();
  for (const f of $('files').files) {
    const c = await fileToCanvas(f);
    photos.push({ name: f.name, canvas: c });
    const t = document.createElement('canvas');
    t.width = 90; t.height = 120;
    t.getContext('2d').drawImage(c, 0, 0, 90, 120);
    t.style.borderRadius = '6px';
    $('thumbs').append(t);
  }
  status(`${photos.length} photo(s) ready, cropped to ${OUT_W}×${OUT_H}.`);
});

async function maskSplit(photo, midFrac) {
  const output = await api.analyse(toJpeg(photo.canvas), status);
  spend();
  const masks = {};
  const info = {};
  for (const c of CONCERNS) {
    const url = output[c]?.mask_urls?.[0];
    if (!url) continue;
    const m = await api.maskImageData(url);
    masks[c] = m;
    // Does the mask carry information in alpha, or is it an opaque image?
    let alpha = false;
    for (let i = 3; i < m.data.length; i += 400) if (m.data[i] < 250) { alpha = true; break; }
    const act = activationFn(m);
    let s = 0;
    for (let i = 0; i < m.data.length; i += 4) s += act(i);
    info[c] = { w: m.width, h: m.height, alpha, coverage: (100 * s) / (m.width * m.height), ext: url.split('?')[0].split('.').pop() };
  }
  const split = scoreSides(masks, { width: OUT_W, height: OUT_H, midFrac }, 'imgLeft');
  return { output, info, split };
}

$('runMask').addEventListener('click', async () => {
  if (!photos.length) return status('Choose photos first.');
  const mid = Number($('mid').value);
  const rows = [];
  $('runMask').disabled = true;
  try {
    for (const [i, p] of photos.entries()) {
      status(`Photo ${i + 1} of ${photos.length}`);
      const r = await maskSplit(p, mid);
      rows.push({ name: p.name, ...r });
      raw.push({ kind: 'mask', name: p.name, output: r.output, info: r.info, split: r.split });
    }
    renderMask(rows);
    status('Done.');
  } catch (e) {
    status(explainError(e));
  } finally {
    $('runMask').disabled = false;
    showRaw();
  }
});

function renderMask(rows) {
  $('out').hidden = false;
  const head = '<tr><th>photo / concern</th><th>API whole (ui / raw)</th><th>img left</th><th>img right</th><th>L − R</th></tr>';
  let body = '';
  const diffs = {};
  for (const r of rows) {
    body += `<tr><th colspan="5">${esc(r.name)}</th></tr>`;
    for (const c of CONCERNS) {
      const s = r.split.sides[c];
      if (!s) continue;
      const d = s.a - s.b; // aSide = imgLeft, so a is the image's left half
      (diffs[c] ||= []).push(d);
      body += `<tr><td>${c}</td><td>${r.output[c]?.ui_score ?? '–'} / ${fix(r.output[c]?.raw_score)}</td><td>${fix(s.a)}</td><td>${fix(s.b)}</td><td>${fix(d)}</td></tr>`;
    }
  }
  if (rows.length > 1) {
    body += '<tr><th colspan="5">Repeatability: spread of L − R across photos (standard deviation)</th></tr>';
    for (const [c, ds] of Object.entries(diffs)) body += `<tr><td>${c}</td><td></td><td></td><td></td><td>${fix(sd(ds))}</td></tr>`;
  }
  $('maskTable').innerHTML = head + body;
  const m = rows[0].split.meta;
  const inf = Object.values(rows[0].info)[0] || {};
  $('maskNotes').textContent = m
    ? `Masks are ${m.maskW}×${m.maskH} (${inf.ext}, ${inf.alpha ? 'alpha channel' : 'opaque, brightness used'}); photo sent was ${m.srcW}×${m.srcH}. ` +
      `Midline method: ${m.midline === 'user' ? 'same shape as the photo, so your midline was used' : 'mask shape differs, so the centre of the flagged area was used'}.`
    : 'No masks returned.';
}

$('runMirror').addEventListener('click', async () => {
  if (!photos.length) return status('Choose photos first.');
  const mid = Number($('mid').value);
  const p = photos[0];
  $('runMirror').disabled = true;
  try {
    status('Left composite');
    const left = await api.analyse(toJpeg(mirrorHalf(p.canvas, mid, 'imgLeft')), status);
    spend();
    status('Right composite');
    const right = await api.analyse(toJpeg(mirrorHalf(p.canvas, mid, 'imgRight')), status);
    spend();
    raw.push({ kind: 'mirror', name: p.name, left, right });
    const prev = raw.find((x) => x.kind === 'mask' && x.name === p.name);
    $('outMirror').hidden = false;
    let html = '<tr><th>concern</th><th>mirror L</th><th>mirror R</th><th>mirror L − R</th><th>mask L − R</th></tr>';
    for (const c of CONCERNS) {
      const l = left[c]?.raw_score, r = right[c]?.raw_score;
      const ms = prev?.split?.sides?.[c];
      // Mirror scores: higher = healthier. Mask shares: higher = worse. Signs are opposite on purpose.
      html += `<tr><td>${c}</td><td>${fix(l)}</td><td>${fix(r)}</td><td>${l != null && r != null ? fix(l - r) : '–'}</td><td>${ms ? fix(ms.a - ms.b) : 'run mask split'}</td></tr>`;
    }
    $('mirrorTable').innerHTML = html;
    status('Done. Mirror scores are raw_score (higher = healthier); mask numbers are flagged share (higher = worse).');
  } catch (e) {
    status(explainError(e, true));
  } finally {
    $('runMirror').disabled = false;
    showRaw();
  }
});

// A network failure means our own server is not answering; only an API error says anything about the photo.
function explainError(e, composite = false) {
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(e.message)) {
    return 'Error: the Puolisko server is not answering. Start it with "node server.js" and reload this page. No units were spent.';
  }
  if (e.status === 401) return 'Error: this server needs an access code. Enter it above.';
  if (composite && !e.status) return `Error: ${e.message}. YouCam rejected the composite, so it will not score half faces this way.`;
  return `Error: ${e.message}`;
}

function showRaw() {
  if (!raw.length) return;
  $('rawWrap').hidden = false;
  // Leave out the signed URLs; they are temporary.
  $('raw').textContent = JSON.stringify(raw, (k, v) => (k === 'mask_urls' ? `[${v.length} url]` : v), 1);
}

const fix = (v) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(2));
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
function sd(xs) {
  if (xs.length < 2) return NaN;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
