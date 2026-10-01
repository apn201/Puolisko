import * as store from './store.js';
import * as api from './api.js';
import { toPortrait, fileToCanvas, lightBalance, OUT_W, OUT_H } from './image.js';
import { scan } from './scan.js';
import { preload } from './landmarks.js';
import { CONCERNS, LABEL, result, sideScores, pickBeautyCheek, otherCheek } from './game.js';
import { renderHeatmap, COLORS } from './heatmap.js';
import { renderCard, shareCard, signed } from './card.js';

const state = store.load();
api.setAccessCode(state.accessCode);
const view = document.getElementById('view');
let cfg = { needsCode: false, configured: true };
let stream = null;
let pending = null;   // { canvas, mode } waiting to be scanned
let lastScan = null;  // { photo, masks, face } of the final scan. Memory only: gone on reload, by design.

const QUIPS = [
  'The AI is looking very closely.',
  'Counting wrinkles you drew yourself.',
  'Measuring redness, pixel by pixel.',
  'Checking under the eyes.',
  'Splitting you down the middle.',
];

// ---- helpers -----------------------------------------------------------------------------

function mount(id) {
  view.replaceChildren(document.getElementById(id).content.cloneNode(true));
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  const f = {};
  view.querySelectorAll('[data-f]').forEach((n) => { f[n.dataset.f] = n; });
  return f;
}

function banner(text) {
  const b = document.getElementById('banner');
  b.textContent = text || '';
  b.hidden = !text;
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

// Label for the half shown on screen left/right. Screens are mirrored like a mirror,
// so the player's left cheek is on screen left.
const roleOf = (cheek) => (cheek === state.beautyCheek ? 'BEAUTY' : 'BEAST');

// ---- screens -----------------------------------------------------------------------------

const screens = {
  home() {
    const f = mount('t-home');
    if (state.last?.result) f.last.hidden = false;
    preload();
  },

  start() {
    if (!state.seenPrivacy) return screens.privacy('baseline');
    location.hash = '#baseline';
  },

  privacy(next) {
    const f = mount('t-privacy');
    f.ok.textContent = next ? 'Got it. Scan my bare face.' : 'Got it';
    f.ok.addEventListener('click', () => {
      state.seenPrivacy = true;
      store.save(state);
      location.hash = next ? `#${next}` : '#home';
    });
  },

  baseline() { capture('baseline'); },

  final() {
    if (!state.baseline || !state.beautyCheek) { location.hash = '#start'; return; }
    capture('final');
  },

  scanning() {
    if (!pending) { location.hash = '#home'; return; }
    const { canvas, mode } = pending;
    const f = mount('t-scanning');
    const c = f.canvas;
    c.width = canvas.width; c.height = canvas.height;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(canvas, 0, 0);
    let q = 0;
    f.quip.textContent = QUIPS[0];
    const timer = setInterval(() => { f.quip.textContent = QUIPS[++q % QUIPS.length]; }, 2600);
    window.addEventListener('hashchange', () => clearInterval(timer), { once: true });
    f.again.addEventListener('click', () => { location.hash = `#${mode}`; });

    scan(canvas, (t) => { f.status.textContent = t; })
      .then((s) => {
        clearInterval(timer);
        pending = null;
        if (mode === 'baseline') {
          state.baseline = { at: Date.now(), halves: store.numbersOnly(s.halves) };
          state.beautyCheek = pickBeautyCheek();
          state.last = null;
          lastScan = null;
          store.save(state);
          location.hash = '#coin';
        } else {
          const r = result(state.baseline.halves, s.halves, state.beautyCheek);
          state.last = { at: Date.now(), halves: store.numbersOnly(s.halves), result: r };
          store.save(state);
          lastScan = { photo: canvas, masks: s.masks, face: s.face, line: s.meta.line };
          location.hash = '#result';
        }
      })
      .catch((e) => {
        clearInterval(timer);
        f.status.textContent = e.status === 401 ? 'This demo needs an access code. Add it in Settings.' : e.message;
        f.quip.textContent = mode === 'final'
          ? 'If heavy paint hid your face from the AI, tone it down a little and try again. No units were used.'
          : 'No units were used for a failed scan.';
        f.retry.hidden = false;
        view.querySelector('.sweep')?.remove();
      });
  },

  coin() {
    if (!state.baseline || !state.beautyCheek) { location.hash = '#start'; return; }
    const f = mount('t-coin');
    const base = sideScores(state.baseline.halves, state.beautyCheek);
    f.offset.textContent = signed(base.diff);
    f.beautyCheek.textContent = state.beautyCheek;
    f.beastCheek.textContent = otherCheek(state.beautyCheek);
    f.coin.classList.add(state.beautyCheek === 'left' ? 'land-left' : 'land-right');
    setTimeout(() => {
      f.verdict.textContent = `Beauty: ${state.beautyCheek}. Beast: ${otherCheek(state.beautyCheek)}.`;
      f.sides.hidden = false;
    }, 1900);
  },

  result() {
    const last = state.last?.result;
    if (!last) { location.hash = '#home'; return; }
    const f = mount('t-result');
    f.title.textContent = last.title;
    f.gap.textContent = signed(last.gap);
    const fill = (el, cheek) => {
      const role = roleOf(cheek);
      el.classList.add(role === 'BEAUTY' ? 'beauty' : 'beast');
      el.querySelector('.name').textContent = role;
      el.querySelector('.num').textContent = (role === 'BEAUTY' ? last.beauty : last.beast).toFixed(1);
    };
    fill(f.scoreL, 'left');
    fill(f.scoreR, 'right');
    f.offsetNote.textContent = `Skin score per half, 0 to 100. Gap = Beauty − Beast − your bare-face difference (${signed(last.offset)}).`;

    f.breakdown.innerHTML = '<tr><th></th><th class="beauty">Beauty</th><th class="beast">Beast</th></tr>';
    for (const p of last.perConcern) {
      const tr = document.createElement('tr');
      const ch = (v) => (v == null ? '' : ` <span class="muted">(${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%)</span>`);
      tr.innerHTML = `<td><i class="sw" style="background:${COLORS[p.concern]}"></i>${LABEL[p.concern]}</td>` +
        `<td>${p.beautyPixels.toLocaleString()} px${ch(p.beautyChange)}</td><td>${p.beastPixels.toLocaleString()} px${ch(p.beastChange)}</td>`;
      f.breakdown.append(tr);
    }
    f.legend.innerHTML = CONCERNS.map((c) => `<span><i class="sw" style="background:${COLORS[c]}"></i>${LABEL[c]}</span>`).join('');

    if (!lastScan) {
      f.heatWrap.hidden = true;
      f.shareRow.hidden = true;
      f.shareNote.textContent = 'The photo was deleted when the page reloaded, so there is nothing to share. Rescan to make a card.';
      view.querySelectorAll('.chip').forEach((n) => { n.hidden = true; });
      return;
    }

    const draw = () => {
      const heat = renderHeatmap(lastScan.photo, lastScan.masks, lastScan.line, { withFace: !f.shy.checked });
      f.heat.width = heat.width; f.heat.height = heat.height;
      f.heat.getContext('2d').drawImage(heat, 0, 0);
      return heat;
    };
    draw();
    f.tagL.textContent = roleOf('left');
    f.tagR.textContent = roleOf('right');
    f.tagL.className = `tag-l ${roleOf('left').toLowerCase()}`;
    f.tagR.className = `tag-r ${roleOf('right').toLowerCase()}`;
    f.shy.addEventListener('change', draw);

    f.share.addEventListener('click', async () => {
      const format = view.querySelector('input[name=fmt]:checked').value;
      const heat = renderHeatmap(lastScan.photo, lastScan.masks, lastScan.line, { withFace: !f.shy.checked });
      const url = (location.host + location.pathname).replace(/index\.html$/, '').replace(/\/$/, '');
      const card = renderCard(heat, last, state.beautyCheek, { format, url });
      const how = await shareCard(card, `puolisko-${format}.png`);
      f.shareNote.textContent = how === 'downloaded' ? 'Saved as a PNG. Post it wherever you like.' : '';
    });
  },

  settings() {
    const f = mount('t-settings');
    f.code.value = state.accessCode || '';
    if (!cfg.needsCode) { f.codeWrap.hidden = true; f.codeHelp.hidden = true; }
    f.code.addEventListener('change', () => {
      state.accessCode = f.code.value.trim();
      api.setAccessCode(state.accessCode);
      store.save(state);
      banner('');
    });
    f.wipe.addEventListener('click', () => {
      if (!confirm('Delete your baseline and scores from this phone?')) return;
      store.wipe();
      location.hash = '#home';
      location.reload();
    });
  },
};

// ---- capture -----------------------------------------------------------------------------

async function capture(mode) {
  const f = mount('t-capture');
  f.title.textContent = mode === 'baseline' ? 'Bare face. No makeup.' : 'Final scan. Show the AI what you did.';
  if (mode === 'final') {
    f.lblL.textContent = roleOf('left');
    f.lblR.textContent = roleOf('right');
    f.lblL.classList.add(roleOf('left').toLowerCase());
    f.lblR.classList.add(roleOf('right').toLowerCase());
  }
  preload();

  const go = (canvas) => {
    stopCamera();
    pending = { canvas, mode };
    location.hash = '#scanning';
  };

  f.file.addEventListener('change', async () => {
    const file = f.file.files[0];
    if (file) go(await fileToCanvas(file));
  });

  const video = view.querySelector('video');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
  } catch {
    f.light.textContent = 'No camera access. Allow the camera, or use a photo.';
    f.light.className = 'light bad';
    f.shoot.disabled = true;
    return;
  }
  video.srcObject = stream;
  await video.play().catch(() => {});

  const timer = setInterval(() => {
    if (!stream || !video.videoWidth) return;
    const lb = lightBalance(toPortrait(video, video.videoWidth, video.videoHeight), OUT_W, OUT_H);
    const bad = lb.mean < 70 || lb.imbalance > 0.2;
    f.light.className = `light ${bad ? 'bad' : 'ok'}`;
    f.light.textContent = lb.mean < 70 ? 'Too dark. Face the light.' : lb.imbalance > 0.2 ? 'Light from one side. Face it head-on.' : 'Light looks good';
  }, 400);
  window.addEventListener('hashchange', () => clearInterval(timer), { once: true });

  f.shoot.addEventListener('click', () => {
    if (!video.videoWidth) return;
    clearInterval(timer);
    go(toPortrait(video, video.videoWidth, video.videoHeight));
  });
}

// ---- router ------------------------------------------------------------------------------

function route() {
  stopCamera();
  let name = location.hash.slice(1) || 'home';
  if (!screens[name]) name = 'home';
  screens[name]();
}

window.addEventListener('hashchange', route);
route();

api.config().then((c) => {
  cfg = c;
  if (!c.configured) banner('The server has no YouCam API key yet. Scans will not work until it is set.');
  else if (c.needsCode && !state.accessCode) banner('This demo needs an access code before it can scan. Add it in Settings.');
});

