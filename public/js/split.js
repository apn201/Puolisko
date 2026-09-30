// Per-side scoring from YouCam detection masks.
//
// The Skin AI API scores the whole face. It also returns, per concern, a detection mask aligned
// with the input photo. We split each mask at the face midline and measure how much of each half
// is flagged. One API call scores both sides under identical light, camera and day.
//
// All functions take plain { width, height, data } RGBA objects so they run in Node tests too.

// How strongly one pixel is flagged, 0..1. PNG masks carry it in alpha; opaque masks in brightness.
export function activationFn(img) {
  const d = img.data;
  let transparent = false;
  for (let i = 3; i < d.length; i += 4 * 97) {
    if (d[i] < 250) { transparent = true; break; }
  }
  if (transparent) return (i) => d[i + 3] / 255;
  return (i) => Math.max(d[i], d[i + 1], d[i + 2]) / 255;
}

// Bounding box of everything any mask flags. Texture and pore masks cover the skin, so this is
// close to the face box. Used to size both halves equally and as a midline fallback.
export function unionBox(masks, threshold = 0.08) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const m of masks) {
    const act = activationFn(m);
    for (let y = 0; y < m.height; y += 2) {
      for (let x = 0; x < m.width; x += 2) {
        if (act((y * m.width + x) * 4) > threshold) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1 };
}

// Decide where the midline sits in mask pixel coordinates.
// If the mask has the same shape as the photo we sent, trust the user's midline (fraction of width).
// If YouCam cropped or padded it, fall back to the centre of the flagged area.
export function resolveMidline(maskW, maskH, srcW, srcH, midFrac, box) {
  const sameShape = Math.abs(maskW / maskH - srcW / srcH) < 0.02;
  if (sameShape) return { x: midFrac * maskW, method: 'user' };
  if (box) return { x: (box.x0 + box.x1) / 2, method: 'box' };
  return { x: maskW / 2, method: 'centre' };
}

// Score one mask. Returns flagged share (0..100) of an equal-width strip on each side of the
// midline, leaving out a dead zone over the nose where alignment error would leak across.
// "imgLeft" and "imgRight" are in image coordinates; the caller maps them to product A / B.
export function scoreMask(mask, midX, box, deadFrac = 0.06) {
  const act = activationFn(mask);
  const bx0 = box ? box.x0 : 0, bx1 = box ? box.x1 : mask.width - 1;
  const by0 = box ? box.y0 : 0, by1 = box ? box.y1 : mask.height - 1;
  const faceW = Math.max(1, bx1 - bx0);
  const dead = Math.max(1, Math.round(deadFrac * faceW / 2));
  const half = Math.floor(Math.min(midX - bx0, bx1 - midX)) - dead;
  if (half < 4) return null;

  const lx0 = Math.round(midX - dead - half), lx1 = Math.round(midX - dead);
  const rx0 = Math.round(midX + dead), rx1 = Math.round(midX + dead + half);
  let ls = 0, rs = 0, n = 0;
  for (let y = by0; y <= by1; y++) {
    const row = y * mask.width;
    for (let x = lx0; x < lx1; x++) ls += act((row + x) * 4);
    for (let x = rx0; x < rx1; x++) rs += act((row + x) * 4);
    n += lx1 - lx0;
  }
  return { imgLeft: (100 * ls) / n, imgRight: (100 * rs) / n, halfWidth: half, dead };
}

// Score every concern of one analysis.
// masks: { concern: imageData }. src: { width, height, midFrac }.
// aSide: which image half got product A, 'imgLeft' or 'imgRight'.
export function scoreSides(masks, src, aSide) {
  const list = Object.values(masks);
  if (!list.length) return { sides: {}, meta: null };
  const box = unionBox(list);
  const first = list[0];
  const mid = resolveMidline(first.width, first.height, src.width, src.height, src.midFrac, box);
  const bSide = aSide === 'imgLeft' ? 'imgRight' : 'imgLeft';
  const sides = {};
  for (const [concern, m] of Object.entries(masks)) {
    const s = scoreMask(m, mid.x * (m.width / first.width), box && scaleBox(box, m.width / first.width, m.height / first.height));
    if (s) sides[concern] = { a: round(s[aSide]), b: round(s[bSide]) };
  }
  return {
    sides,
    meta: { maskW: first.width, maskH: first.height, srcW: src.width, srcH: src.height, midline: mid.method, box },
  };
}

function scaleBox(b, sx, sy) {
  if (sx === 1 && sy === 1) return b;
  return { x0: Math.round(b.x0 * sx), x1: Math.round(b.x1 * sx), y0: Math.round(b.y0 * sy), y1: Math.round(b.y1 * sy) };
}

const round = (v) => Math.round(v * 1000) / 1000;
