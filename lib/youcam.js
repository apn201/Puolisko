// The only module that talks to the YouCam API. Server side only: it reads the key from env.
// Docs: https://docs.perfectcorp.com/reference/ai_skin_analysis

export const BASE = 'https://yce-api-01.makeupar.com';

// SD concerns whose mask marks a problem (more mask = worse). 6 concerns = 12 units per photo.
export const CONCERNS = ['redness', 'acne', 'pore', 'texture', 'age_spot', 'oiliness'];

function key() {
  const k = process.env.YOUCAM_API_KEY;
  if (!k) throw new HttpError(500, 'YOUCAM_API_KEY is not set on the server');
  return k;
}

export class HttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  if (!res.ok || (body.status && body.status !== 200)) {
    const msg = body.error || body.error_code || body.message || `YouCam ${res.status}`;
    throw new HttpError(res.status >= 400 ? res.status : 502, String(msg), body);
  }
  return body.data ?? body;
}

// Upload bytes, start a skin analysis task, return the task id.
export async function startAnalysis(bytes, contentType = 'image/jpeg', concerns = CONCERNS) {
  const bad = concerns.filter((c) => !/^[a-z_2]+$/.test(c));
  if (bad.length) throw new HttpError(400, `Unknown concerns: ${bad.join(',')}`);

  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const init = await call('/s2s/v2.0/file', {
    method: 'POST',
    body: JSON.stringify({
      files: [{ content_type: contentType, file_name: `puolisko.${ext}`, file_size: bytes.length }],
    }),
  });

  const file = init.files[0];
  const req = file.requests[0];
  const put = await fetch(req.url, { method: req.method || 'PUT', headers: req.headers, body: bytes });
  if (!put.ok) throw new HttpError(502, `Upload failed: ${put.status}`);

  const task = await call('/s2s/v2.0/task/skin-analysis', {
    method: 'POST',
    body: JSON.stringify({
      src_file_id: file.file_id,
      dst_actions: concerns,
      // Separate per-concern masks, not one blended image: we need each mask's pixels.
      miniserver_args: { enable_mask_overlay: false },
      format: 'json',
    }),
  });
  return task.task_id;
}

// One poll. Returns { status: 'running' | 'success' | 'error', output?, error? }.
export async function getTask(taskId) {
  if (!/^[A-Za-z0-9_\-+/=]{10,200}$/.test(taskId)) throw new HttpError(400, 'Bad task id');
  const data = await call(`/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`, { method: 'GET' });
  const status = data.task_status;
  if (status === 'success') return { status, output: normalize(data.results) };
  if (status === 'error') return { status, error: data.error || data.error_message || 'analysis failed' };
  return { status: 'running' };
}

// Keep only what the client needs: per concern the scores and mask URLs.
function normalize(results) {
  const out = {};
  for (const o of results?.output || []) {
    out[o.type] = {
      ui_score: o.ui_score ?? null,
      raw_score: o.raw_score ?? null,
      mask_urls: o.mask_urls || [],
    };
  }
  return out;
}

// Masks live on YouCam's S3 buckets. Only proxy those hosts, never an arbitrary URL.
export function isMaskUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && /(^|\.)amazonaws\.com$/.test(url.hostname) && /^yce/.test(url.hostname);
  } catch {
    return false;
  }
}
