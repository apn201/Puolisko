import * as store from './store.js';
import * as api from './api.js';
import { toPortrait, fileToCanvas, toJpeg, lightBalance, OUT_W, OUT_H } from './image.js';
import { scoreSides } from './split.js';
import { analyse } from './stats.js';
import { sidesChart, diffChart } from './chart.js';

const CONCERNS = ['redness', 'acne', 'pore', 'texture', 'age_spot', 'oiliness'];
const LABEL = { redness: 'Redness', acne: 'Acne', pore: 'Pores', texture: 'Texture', age_spot: 'Spots', oiliness: 'Oiliness' };
const PLAN_DAYS = 14;

const state = store.load();
api.setAccessCode(state.accessCode);
const view = document.getElementById('view');
let cfg = { needsCode: false, configured: true };
let stream = null;
let queue = []; // photos waiting for review: { canvas, date, source, light }

// ---- helpers -----------------------------------------------------------------------------

function mount(id) {
  view.replaceChildren(document.getElementById(id).content.cloneNode(true));
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  const f = {};
  view.querySelectorAll('[data-f]').forEach((n) => { f[n.dataset.f] = n; });
  return f;
}

const bName = () => state.run?.bName || 'nothing';
const bCheek = () => (state.run?.aCheek === 'left' ? 'right' : 'left');
// Displayed images are mirrored, like a mirror. So the user's left cheek shows on screen left,
// and in the raw (unmirrored) image the user's left cheek is on the image's right.
const aImageSide = (swapped) => {
  const aOnScreenLeft = (state.run.aCheek === 'left') !== swapped;
  return aOnScreenLeft ? 'imgRight' : 'imgLeft';
};

function banner(text) {
  const b = document.getElementById('banner');
  b.textContent = text || '';
  b.hidden = !text;
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

const fmt = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

// ---- screens -----------------------------------------------------------------------------

const screens = {
  intro() { mount('t-intro'); },

  setup() {
    const f = mount('t-setup');
    const form = view.querySelector('#setup-form');
    const demo = view.querySelector('.split-demo .face');
    const sync = () => demo.classList.toggle('flip', form.aCheek.value === 'right');
    form.addEventListener('change', sync);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.entries.length && !confirm('Start over? The current test\'s numbers will be deleted. Export them first if you want them.')) return;
      store.startRun(state, {
        aName: form.aName.value.trim(),
        bName: form.bName.value.trim(),
        aCheek: form.aCheek.value,
      });
      location.hash = '#home';
    });
    return f;
  },

  home() {
    const f = mount('t-home');
    const r = state.run;
    f.aName.textContent = r.aName;
    f.bName.textContent = bName();
    f.aCheek.textContent = `${r.aCheek} cheek`;
    f.bCheek.textContent = `${bCheek()} cheek`;
    const res = analyse(state.entries, CONCERNS);
    const n = state.entries.length;
    const day = res.days;
    f.bar.style.width = `${Math.min(100, (day / PLAN_DAYS) * 100)}%`;
    f.dayText.textContent = n
      ? `${n} photo${n === 1 ? '' : 's'} over ${day} day${day === 1 ? '' : 's'}. Plan: ${PLAN_DAYS} days.`
      : `No photos yet. Plan: ${PLAN_DAYS} days.`;
    const doneToday = state.entries.some((e) => e.date === store.today());
    f.todayText.textContent = doneToday
      ? 'Today\'s photo is done. A retake replaces it.'
      : 'Apply both products as usual, wait until they have absorbed, then take the photo.';
    if (doneToday) f.captureBtn.textContent = 'Retake today\'s photo';
    f.import.addEventListener('change', async () => {
      const files = [...f.import.files];
      queue = [];
      for (const file of files) {
        const canvas = await fileToCanvas(file);
        queue.push({
          canvas,
          date: store.today(new Date(file.lastModified)),
          source: 'import',
          light: lightBalance(canvas, canvas.width, canvas.height),
        });
      }
      if (queue.length) location.hash = '#review';
    });
    f.miniResult.append(verdictBlock(res, true));
  },

  async capture() {
    const f = mount('t-capture');
    const aLeft = state.run.aCheek === 'left';
    f.lblL.textContent = aLeft ? `A · ${state.run.aName}` : `B · ${bName()}`;
    f.lblR.textContent = aLeft ? `B · ${bName()}` : `A · ${state.run.aName}`;
    const video = view.querySelector('video');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
    } catch (e) {
      f.light.textContent = 'No camera access. Allow the camera, or use Import photos on the home screen.';
      f.light.className = 'light bad';
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});

    const tick = () => {
      if (!stream || !video.videoWidth) return;
      // Measure on the same 3:4 crop we will send.
      const c = toPortrait(video, video.videoWidth, video.videoHeight);
      const lb = lightBalance(c, OUT_W, OUT_H);
      const bad = lb.mean < 70 || lb.imbalance > 0.15;
      f.light.className = `light ${bad ? 'bad' : 'ok'}`;
      f.light.textContent = lb.mean < 70 ? 'Too dark' : lb.imbalance > 0.15
        ? `Light is uneven (${Math.round(lb.imbalance * 100)}%). Face the light head-on.`
        : 'Light is even';
    };
    const timer = setInterval(tick, 400);
    const stopTimer = () => clearInterval(timer);
    window.addEventListener('hashchange', stopTimer, { once: true });

    f.shoot.addEventListener('click', () => {
      if (!video.videoWidth) return;
      const canvas = toPortrait(video, video.videoWidth, video.videoHeight);
      queue = [{ canvas, date: store.today(), source: 'camera', light: lightBalance(canvas, OUT_W, OUT_H) }];
      stopTimer();
      stopCamera();
      location.hash = '#review';
    });
  },

  review() {
    if (!queue.length) { location.hash = '#home'; return; }
    const item = queue[0];
    const f = mount('t-review');
    let swapped = false;
    if (queue.length > 1) f.title.textContent = `Check the split (${queue.length} to go)`;

    // Show mirrored, as in a mirror.
    const c = f.canvas;
    c.width = item.canvas.width; c.height = item.canvas.height;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(item.canvas, 0, 0);

    f.date.value = item.date;
    f.date.max = store.today();
    const labels = () => {
      const aLeft = (state.run.aCheek === 'left') !== swapped;
      f.labelL.textContent = aLeft ? `A · ${state.run.aName}` : `B · ${bName()}`;
      f.labelR.textContent = aLeft ? `B · ${bName()}` : `A · ${state.run.aName}`;
      f.labelL.className = aLeft ? 'lbl-a' : 'lbl-b';
      f.labelR.className = aLeft ? 'lbl-b' : 'lbl-a';
    };
    const moveLine = () => { f.midline.style.left = `${f.mid.value * 100}%`; };
    labels(); moveLine();
    f.mid.addEventListener('input', moveLine);
    f.swap.addEventListener('click', () => { swapped = !swapped; labels(); });

    if (item.light.imbalance > 0.15) {
      f.lightWarn.hidden = false;
      f.lightWarn.textContent = `One side is ${Math.round(item.light.imbalance * 100)}% brighter than the other. Side light is the one thing split-face cannot cancel. Retake facing the light if you can.`;
    }

    const next = () => {
      queue.shift();
      location.hash = queue.length ? '#review' : '#home';
      if (queue.length) screens.review();
    };
    f.cancel.addEventListener('click', next);

    f.score.addEventListener('click', async () => {
      f.score.disabled = f.cancel.disabled = f.swap.disabled = f.mid.disabled = true;
      const status = (t) => { f.status.textContent = t; };
      try {
        // Display is mirrored, the image is not: flip the midline back to image coordinates.
        const midFrac = 1 - Number(f.mid.value);
        const aSide = aImageSide(swapped);
        const output = await api.analyse(toJpeg(item.canvas), status);
        status('Splitting the masks');
        const masks = {};
        for (const c of CONCERNS) {
          const url = output[c]?.mask_urls?.[0];
          if (url) masks[c] = await api.maskImageData(url);
        }
        const { sides, meta } = scoreSides(masks, { width: OUT_W, height: OUT_H, midFrac }, aSide);
        if (!Object.keys(sides).length) throw new Error('No masks came back, so the sides could not be split.');
        const whole = {};
        for (const [k, v] of Object.entries(output)) whole[k] = { ui: v.ui_score, raw: v.raw_score };
        store.addEntry(state, {
          date: f.date.value || item.date,
          ts: Date.now(),
          source: item.source,
          midFrac: Math.round(midFrac * 1000) / 1000,
          aSide,
          light: { imbalance: Math.round(item.light.imbalance * 1000) / 1000, mean: Math.round(item.light.mean) },
          whole,
          sides,
          meta,
        });
        // The photo is dropped here. Nothing but the numbers above is kept.
        item.canvas.width = item.canvas.height = 0;
        c.width = c.height = 0;
        status('Saved. Photo discarded.');
        setTimeout(next, 700);
      } catch (e) {
        if (e.status === 401) {
          status('This deployment needs an access code. Enter it in Settings.');
        } else {
          status(e.message || 'Something went wrong.');
        }
        f.score.disabled = f.cancel.disabled = f.swap.disabled = f.mid.disabled = false;
      }
    });
  },

  results() {
    if (!state.run) { location.hash = '#intro'; return; }
    const f = mount('t-results');
    const res = analyse(state.entries, CONCERNS);
    f.verdict.append(verdictBlock(res, false));
    f.legend.innerHTML = '';
    f.legend.append(
      legendItem('a', `A · ${state.run.aName} (${state.run.aCheek})`),
      legendItem('b', `B · ${bName()} (${bCheek()})`),
      legendItem('d', 'A − B'),
    );

    for (const c of CONCERNS) {
      const r = res.perConcern[c];
      if (!r || r.n < 2) continue;
      const card = document.createElement('section');
      card.className = 'card concern';
      const h = document.createElement('h2');
      h.textContent = LABEL[c];
      const p = document.createElement('p');
      p.className = 'small';
      p.textContent = concernLine(r);
      card.append(h, sidesChart(r), diffChart(r), p);
      f.concerns.append(card);
    }

    for (const e of [...state.entries].reverse()) {
      const li = document.createElement('li');
      const warn = e.light?.imbalance > 0.15 ? ' · uneven light' : '';
      li.innerHTML = `<span>${e.date}</span><span class="muted small">${e.source}${warn}</span>`;
      const del = document.createElement('button');
      del.className = 'link';
      del.textContent = 'Remove';
      del.addEventListener('click', () => {
        if (confirm(`Remove the numbers for ${e.date}?`)) { store.removeEntry(state, e.date); screens.results(); }
      });
      li.append(del);
      f.entries.append(li);
    }
    if (!state.entries.length) f.entries.innerHTML = '<li class="muted">None yet.</li>';
  },

  settings() {
    const f = mount('t-settings');
    f.code.value = state.accessCode || '';
    if (!cfg.needsCode) { f.codeWrap.hidden = true; f.codeHelp.hidden = true; }
    f.code.addEventListener('change', () => {
      state.accessCode = f.code.value.trim();
      api.setAccessCode(state.accessCode);
      store.save(state);
    });
    f.export.addEventListener('click', () => {
      const blob = new Blob([store.exportJson(state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `puolisko-${store.today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    f.load.addEventListener('change', async () => {
      try {
        store.importJson(state, await f.load.files[0].text());
        location.hash = '#results';
      } catch (e) { alert(e.message); }
    });
    f.newRun.addEventListener('click', () => { location.hash = '#setup'; });
    f.wipe.addEventListener('click', () => {
      if (!confirm('Delete every number Puolisko has stored in this browser?')) return;
      store.wipe();
      location.hash = '#intro';
      location.reload();
    });
  },

  privacy() { mount('t-privacy'); },
};

// ---- result text -------------------------------------------------------------------------

function verdictBlock(res, compact) {
  const box = document.createElement('div');
  const h = document.createElement(compact ? 'h2' : 'h1');
  const p = document.createElement('p');
  box.append(h, p);
  const a = state.run.aName, b = bName();
  if (res.verdict === 'too-early') {
    h.textContent = 'Too early to say';
    p.textContent = `${res.photos} photo${res.photos === 1 ? '' : 's'} so far. The first honest statement needs at least 5 photos on 3 different days, and skin needs about two weeks.`;
  } else if (res.verdict === 'null') {
    h.textContent = `No measurable difference after ${res.days} days`;
    p.textContent = `Across ${res.tested} skin measures, ${a} and ${b} left your two cheeks the same, within what the measurement can tell apart. This is the most common result, and a useful one.`;
  } else {
    const hits = Object.entries(res.perConcern).filter(([, r]) => r.significant);
    h.textContent = `A difference in ${hits.map(([c]) => LABEL[c].toLowerCase()).join(', ')}`;
    const lines = hits.map(([c, r]) => `${LABEL[c]}: the ${r.favours === 'a' ? a : b} side did better`);
    p.textContent = `${lines.join('. ')}. ${res.tested - hits.length} of ${res.tested} measures showed no difference. One photo series on one face is a lead, not proof.`;
  }
  if (!compact && res.noiseRemoved != null && res.noiseRemoved > 0) {
    const n = document.createElement('p');
    n.className = 'small noise';
    n.textContent = `Your whole face moved from day to day, with light, sleep and camera. Comparing the halves removed about ${Math.round(res.noiseRemoved * 100)}% of that noise.`;
    box.append(n);
  }
  if (compact && res.photos) {
    const l = document.createElement('a');
    l.href = '#results'; l.className = 'small'; l.textContent = 'See the charts';
    box.append(l);
  }
  return box;
}

function concernLine(r) {
  if (!r.fit) return `${r.n} photos. Needs at least 5 on 3 days for a statement.`;
  const who = r.favours === 'a' ? state.run.aName : bName();
  const range = `${fmt(r.ci[0])} to ${fmt(r.ci[1])}`;
  if (!r.significant) return `A − B moved ${fmt(r.change)} points over ${r.span} days (interval ${range}). Crosses zero: no measurable difference.`;
  return `A − B moved ${fmt(r.change)} points over ${r.span} days (interval ${range}). The ${who} side is doing better. Lower is better.`;
}

function legendItem(cls, text) {
  const s = document.createElement('span');
  s.innerHTML = `<i class="sw series-${cls}"></i>`;
  s.append(text);
  return s;
}

// ---- router ------------------------------------------------------------------------------

function route() {
  stopCamera();
  let name = location.hash.slice(1) || 'home';
  if (!screens[name]) name = 'home';
  if (!state.run && !['intro', 'setup', 'privacy', 'settings'].includes(name)) name = 'intro';
  screens[name]();
}

window.addEventListener('hashchange', route);
route();

api.config().then((c) => {
  cfg = c;
  if (!c.configured) banner('The server has no YouCam API key yet. Scoring will not work until it is set.');
  else if (c.needsCode && !state.accessCode) banner('This demo needs an access code before it can score photos. Add it in Settings.');
});
