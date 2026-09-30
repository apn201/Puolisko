// Client side of the proxy. The YouCam key never reaches the browser.
let accessCode = '';
export const setAccessCode = (c) => { accessCode = c || ''; };

async function req(path, init = {}) {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Access-Code': accessCode, ...(init.headers || {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* keep */ }
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return res;
}

export async function config() {
  try { return await (await fetch('/api/config')).json(); } catch { return { needsCode: false, configured: false }; }
}

// Send one JPEG data URL, wait for the result. onProgress gets short status strings.
export async function analyse(dataUrl, onProgress = () => {}) {
  onProgress('Sending photo to YouCam Skin AI');
  const { taskId } = await (await req('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ image: dataUrl, contentType: 'image/jpeg' }),
  })).json();
  onProgress('Analysing skin');
  const started = Date.now();
  for (let i = 0; ; i++) {
    await sleep(i < 5 ? 1500 : 3000);
    const r = await (await req(`/api/task?id=${encodeURIComponent(taskId)}`)).json();
    if (r.status === 'success') return r.output;
    if (r.status === 'error') throw new Error(explain(r.error));
    if (Date.now() - started > 120000) throw new Error('YouCam took over two minutes. Try again later.');
  }
}

// Mask pixels, via the proxy so the canvas is not tainted.
export async function maskImageData(url) {
  const blob = await (await req(`/api/mask?u=${encodeURIComponent(url)}`)).blob();
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ERRORS = {
  error_src_face_too_small: 'Face too small. Come closer so your face fills the oval.',
  error_src_face_out_of_bound: 'Part of the face is outside the photo. Centre it in the oval.',
  error_lighting_dark: 'Too dark. Face a window or a lamp.',
  error_below_min_image_size: 'Photo resolution too low.',
  error_exceed_max_image_size: 'Photo too large.',
};
export const explain = (code) => ERRORS[code] || String(code || 'Analysis failed');
