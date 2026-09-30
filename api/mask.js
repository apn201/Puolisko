// GET ?u=<mask url> -> mask image bytes. Only YouCam's own S3 hosts are allowed.
// Proxied because the browser needs same-origin pixels to read a mask on a canvas.
import { isMaskUrl, HttpError } from '../lib/youcam.js';
import { checkAccess, sendError } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    checkAccess(req);
    const u = String(req.query.u || '');
    if (!isMaskUrl(u)) throw new HttpError(400, 'not a YouCam mask url');
    const r = await fetch(u);
    if (!r.ok) throw new HttpError(502, `mask fetch ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buf);
  } catch (e) {
    sendError(res, e);
  }
}
