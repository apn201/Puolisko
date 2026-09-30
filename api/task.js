// GET ?id=<taskId> -> { status, output?, error? }
import { getTask, HttpError } from '../lib/youcam.js';
import { checkAccess, sendError } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'GET only');
    checkAccess(req);
    const r = await getTask(String(req.query.id || ''));
    res.status(200).json(r);
  } catch (e) {
    sendError(res, e);
  }
}
