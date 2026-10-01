// What the AI saw: concern masks tinted and laid over the photo (or over black, for the shy card).

export const COLORS = {
  wrinkle: '#ffd23f',
  redness: '#ff3b5c',
  dark_circle_v2: '#8a5cff',
  age_spot: '#2fe0c8',
};

// Inside-the-face raster for split.js, from the landmark oval in normalized coordinates.
export function rasterizeOval(oval, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.beginPath();
  oval.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return out;
}

// Draw photo (or black) + tinted masks + midline into a new canvas of the photo's size.
// photo: canvas, not mirrored. masks: { concern: ImageData }. line: normalized midline.
// mirror: draw as the player sees themselves.
export function renderHeatmap(photo, masks, line, { mirror = true, withFace = true, strength = 0.85 } = {}) {
  const W = photo.width, H = photo.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }

  if (withFace) {
    ctx.drawImage(photo, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#0b0b10';
    ctx.fillRect(0, 0, W, H);
  }

  for (const [concern, m] of Object.entries(masks)) {
    const t = document.createElement('canvas');
    t.width = m.width; t.height = m.height;
    const tctx = t.getContext('2d');
    tctx.putImageData(m, 0, 0);
    // If the mask is opaque, turn brightness into alpha first.
    const id = tctx.getImageData(0, 0, m.width, m.height);
    let opaque = true;
    for (let i = 3; i < id.data.length; i += 400) if (id.data[i] < 250) { opaque = false; break; }
    if (opaque) {
      for (let i = 0; i < id.data.length; i += 4) id.data[i + 3] = Math.max(id.data[i], id.data[i + 1], id.data[i + 2]);
      tctx.putImageData(id, 0, 0);
    }
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = COLORS[concern] || '#fff';
    tctx.fillRect(0, 0, m.width, m.height);
    ctx.globalAlpha = strength;
    ctx.drawImage(t, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (line) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, W / 250);
    ctx.setLineDash([W / 40, W / 60]);
    ctx.beginPath();
    ctx.moveTo(line.a * W, 0);
    ctx.lineTo((line.a + line.b) * W, H);
    ctx.stroke();
  }
  return c;
}
