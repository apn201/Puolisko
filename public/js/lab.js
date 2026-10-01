// Lab: the day-one spike. Does makeup register, per half, in the YouCam masks?
import * as api from './api.js';
import { fileToCanvas, OUT_W, OUT_H } from './image.js';
import { scan } from './scan.js';
import { preload } from './landmarks.js';
import { renderHeatmap } from './heatmap.js';
import { CONCERNS, LABEL } from './game.js';

const $ = (id) => document.getElementById(id);
let photos = [];
let units = 0;
const status = (t) => { $('status').textContent = t; };

$('code').addEventListener('change', () => api.setAccessCode($('code').value.trim()));
try { api.setAccessCode(JSON.parse(localStorage.getItem('puolisko.v2'))?.accessCode || ''); } catch { /* none */ }
preload();

$('files').addEventListener('change', async () => {
  photos = [];
  $('thumbs').replaceChildren();
  for (const f of $('files').files) {
    const c = await fileToCanvas(f);
    photos.push({ name: f.name, canvas: c });
    $('thumbs').append(figure(c, `${photos.length === 1 ? "BARE · " : ""}${esc(f.name)}`, true));
  }
  $('run').textContent = `Scan ${photos.length} photo${photos.length === 1 ? '' : 's'} · ${photos.length * 9} units`;
  status(`${photos.length} photo(s) ready, cropped to ${OUT_W}×${OUT_H}.`);
});

$('run').addEventListener('click', async () => {
  if (!photos.length) return status('Choose photos first.');
  $('run').disabled = true;
  const results = [];
  try {
    for (const [i, p] of photos.entries()) {
      status(`Photo ${i + 1} of ${photos.length}: `);
      try {
        const s = await scan(p.canvas, (t) => status(`Photo ${i + 1} of ${photos.length}: ${t}`));
        units += 9;
        $('units').textContent = units;
        results.push({ ...p, ...s });
      } catch (e) {
        if (e instanceof TypeError || /failed to fetch/i.test(e.message)) throw e;
        if (e.status === 401) throw e;
        results.push({ ...p, error: e.message });
      }
    }
    render(results);
    status('Done.');
  } catch (e) {
    status(e.status === 401 ? 'This server needs an access code. Enter it above.'
      : /failed to fetch/i.test(e.message) ? 'The Puolisko server is not answering. Start it with "node server.js" and reload.'
      : `Error: ${e.message}`);
    if (results.length) render(results);
  } finally {
    $('run').disabled = false;
  }
});

// Image halves -> player's cheeks. The photo is unmirrored: image left = player's right cheek.
const cheeks = (h) => ({ L: h.imgRight.density, R: h.imgLeft.density });

function render(results) {
  $('out').hidden = false;
  $('heats').replaceChildren();
  const base = results[0]?.halves ? results[0] : null;
  let html = '<tr><th>photo / concern</th><th>API ui / raw</th><th>your L</th><th>your R</th><th>Δ L</th><th>Δ R</th></tr>';
  const raw = [];
  for (const [i, r] of results.entries()) {
    html += `<tr><th colspan="6">${i === 0 ? 'BARE · ' : ''}${esc(r.name)}</th></tr>`;
    if (r.error) {
      html += `<tr><td colspan="6" class="beast">Rejected: ${esc(r.error)}</td></tr>`;
      raw.push({ photo: i, name: r.name, error: r.error });
      continue;
    }
    $('heats').append(figure(renderHeatmap(r.canvas, r.masks, r.meta.line, { mirror: true }), `${esc(r.name)} · midline: ${r.meta.midline}`));
    const row = { photo: i, name: r.name, midline: r.meta.midline, mask: `${r.meta.maskW}x${r.meta.maskH}`, concerns: {} };
    for (const c of CONCERNS) {
      const h = r.halves[c];
      if (!h) continue;
      const now = cheeks(h);
      const was = base?.halves?.[c] && i > 0 ? cheeks(base.halves[c]) : null;
      const d = (k) => (was ? delta(now[k] - was[k]) : '');
      html += `<tr><td>${LABEL[c]}</td><td>${r.whole[c]?.ui ?? '–'} / ${fix(r.whole[c]?.raw)}</td>` +
        `<td>${fix(now.L)}</td><td>${fix(now.R)}</td><td>${d('L')}</td><td>${d('R')}</td></tr>`;
      row.concerns[c] = { ui: r.whole[c]?.ui, raw: r.whole[c]?.raw, L: +now.L.toFixed(3), R: +now.R.toFixed(3) };
    }
    raw.push(row);
  }
  $('table').innerHTML = html;
  const fb = results.filter((r) => r.meta?.midline === 'fallback').length;
  $('notes').textContent = fb
    ? `${fb} photo(s) used the fallback midline: no face landmarks found, or the masks came back in a different shape than the photo.`
    : 'All photos split on the landmark midline.';
  $('rawWrap').hidden = false;
  $('raw').textContent = JSON.stringify(raw, null, 1);
}

function figure(canvas, caption, mirror = false) {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas');
  c.width = 240; c.height = Math.round(240 * canvas.height / canvas.width);
  const ctx = c.getContext('2d');
  if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  const cap = document.createElement('figcaption');
  cap.innerHTML = caption;
  fig.append(c, cap);
  return fig;
}

const fix = (v) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(2));
const delta = (v) => `<span class="${v > 0.05 ? 'beast' : v < -0.05 ? 'beauty' : 'muted'}">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}</span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
