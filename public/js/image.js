// Photo preparation. Everything happens on canvases in memory; nothing is written to disk.

export const OUT_W = 768;
export const OUT_H = 1024; // 3:4 portrait, short side above YouCam's SD minimum of 480

// Crop any source (video, bitmap) to 3:4 portrait around its centre and scale to OUT_W x OUT_H.
export function toPortrait(src, srcW, srcH) {
  const target = OUT_W / OUT_H;
  let w = srcW, h = srcH;
  if (w / h > target) w = h * target; else h = w / target;
  const c = document.createElement('canvas');
  c.width = OUT_W; c.height = OUT_H;
  c.getContext('2d').drawImage(src, (srcW - w) / 2, (srcH - h) / 2, w, h, 0, 0, OUT_W, OUT_H);
  return c;
}

export async function fileToCanvas(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const c = toPortrait(bmp, bmp.width, bmp.height);
  bmp.close?.();
  return c;
}

export const toJpeg = (canvas, q = 0.92) => canvas.toDataURL('image/jpeg', q);

// Brightness of the left and right cheek zones, 0..255. Light from one side would favour one half,
// so the camera screen warns about it.
export function lightBalance(source, w, h) {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 64;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h, 0, 0, 48, 64);
  const d = ctx.getImageData(0, 0, 48, 64).data;
  const zone = (x0, x1) => {
    let s = 0, n = 0;
    for (let y = 26; y < 44; y++) for (let x = x0; x < x1; x++) {
      const i = (y * 48 + x) * 4;
      s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++;
    }
    return s / n;
  };
  const l = zone(9, 19), r = zone(29, 39);
  return { imgLeft: l, imgRight: r, mean: (l + r) / 2, imbalance: Math.abs(l - r) / Math.max(1, (l + r) / 2) };
}
