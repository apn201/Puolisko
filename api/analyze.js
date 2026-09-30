// POST { image: <base64 jpeg>, contentType } -> { taskId }
// The photo is streamed to YouCam and not kept here.
import { startAnalysis, HttpError } from '../lib/youcam.js';
import { checkAccess, sendError } from '../lib/http.js';

const MAX_BYTES = 3 * 1024 * 1024;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only');
    checkAccess(req);
    const { image, contentType = 'image/jpeg' } = req.body || {};
    if (typeof image !== 'string') throw new HttpError(400, 'image missing');
    if (!['image/jpeg', 'image/png'].includes(contentType)) throw new HttpError(400, 'jpeg or png only');
    const bytes = Buffer.from(image.replace(/^data:[^,]+,/, ''), 'base64');
    if (bytes.length > MAX_BYTES) throw new HttpError(413, 'image too large');
    const taskId = await startAnalysis(bytes, contentType);
    res.status(200).json({ taskId });
  } catch (e) {
    sendError(res, e);
  }
}
