// Per-half scoring from YouCam detection masks.
//
// The Skin AI API scores the whole face. It also returns, per concern, a detection mask aligned
// with the photo. We cut each mask along the facial midline, keep only pixels inside the face
// outline, and measure how much of each half is flagged. One API call scores both halves.
//
// Geometry is in normalized image coordinates (0..1), so it applies to a mask of any size
// with the same aspect ratio as the photo. Pure functions: they run in Node tests too.

// How strongly one pixel is flagged, 0..1. Masks are alpha PNGs; opaque ones fall back to brightness.
export function activationFn(img) {
  const d = img.data;
  let transparent = false;
  for (let i = 3; i < d.length; i += 4 * 97) {
    if (d[i] < 250) { transparent = true; break; }
  }
  if (transparent) return (i) => d[i + 3] / 255;
  return (i) => Math.max(d[i], d[i + 1], d[i + 2]) / 255;
}

export const sameShape = (w1, h1, w2, h2) => Math.abs(w1 / h1 - w2 / h2) < 0.02;

// Signed horizontal distance from the midline x = a + b y, in pixels. Negative = image left.
const side = (x, y, W, H, line) => x - (line.a + line.b * (y / H)) * W;

// Score one mask.
//   line: { a, b } normalized midline
//   inside: optional Uint8Array (mask.width * mask.height), 1 where the pixel is on the face
//   dead: half-width of a strip along the midline to ignore, in pixels
// Returns per image half: weighted flagged pixels, face pixels, and density in percent.
export function scoreHalves(mask, line, inside = null, dead = 4) {
  const act = activationFn(mask);
  const W = mask.width, H = mask.height;
  const L = { flagged: 0, pixels: 0 }, R = { flagged: 0, pixels: 0 };
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (inside && !inside[row + x]) continue;
      const s = side(x + 0.5, y + 0.5, W, H, line);
      if (Math.abs(s) < dead) continue;
      const half = s < 0 ? L : R;
      half.pixels++;
      half.flagged += act((row + x) * 4);
    }
  }
  const pct = (h) => ({ flagged: Math.round(h.flagged), pixels: h.pixels, density: h.pixels ? (100 * h.flagged) / h.pixels : 0 });
  return { imgLeft: pct(L), imgRight: pct(R) };
}

// When there are no landmarks: a vertical line through the centre of everything flagged.
export function fallbackLine(masks, threshold = 0.08) {
  let x0 = Infinity, x1 = -1, W = 1;
  for (const m of masks) {
    const act = activationFn(m);
    W = m.width;
    for (let y = 0; y < m.height; y += 3) {
      for (let x = 0; x < m.width; x += 3) {
        if (act((y * m.width + x) * 4) > threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      }
    }
  }
  return { a: x1 < 0 ? 0.5 : (x0 + x1) / 2 / W, b: 0 };
}

// Score all concerns of one scan.
//   masks: { concern: imageData }
//   face: { line, oval } from landmarks on the photo we sent, or null
//   src: { width, height } of that photo
//   rasterize(oval, w, h): returns the inside array; injected so tests need no canvas
export function scoreScan(masks, face, src, rasterize) {
  const list = Object.entries(masks);
  if (!list.length) return { halves: {}, meta: null };
  const [, first] = list[0];
  const aligned = face && sameShape(first.width, first.height, src.width, src.height);
  const line = aligned ? face.line : fallbackLine(list.map(([, m]) => m));
  const cache = new Map();
  const halves = {};
  for (const [concern, m] of list) {
    let inside = null;
    if (aligned && face.oval && rasterize) {
      const k = `${m.width}x${m.height}`;
      if (!cache.has(k)) cache.set(k, rasterize(face.oval, m.width, m.height));
      inside = cache.get(k);
    }
    halves[concern] = scoreHalves(m, line, inside, Math.max(2, Math.round(m.width * 0.008)));
  }
  return {
    halves,
    meta: { maskW: first.width, maskH: first.height, srcW: src.width, srcH: src.height, midline: aligned ? 'landmarks' : 'fallback', line },
  };
}
