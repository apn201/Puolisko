import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './youcam.js';

// If ACCESS_CODE is set, every unit-spending call must carry it. Keeps strangers off the unit budget.
export function checkAccess(req) {
  const want = process.env.ACCESS_CODE;
  if (!want) return;
  const got = String(req.headers['x-access-code'] || '');
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Access code required');
}

export function sendError(res, e) {
  const status = e instanceof HttpError ? e.status : 500;
  // Never echo request headers or env back; the message is YouCam's error code or ours.
  res.status(status).json({ error: e.message || 'error' });
}
