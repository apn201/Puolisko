// One scan: photo -> YouCam AI Skin Analysis -> masks -> per-half numbers.
import * as api from './api.js';
import { toJpeg } from './image.js';
import { findFace } from './landmarks.js';
import { scoreScan } from './split.js';
import { rasterizeOval } from './heatmap.js';
import { CONCERNS } from './game.js';

// Returns { halves, masks, face, meta, whole }. masks are ImageData, kept in memory only.
export async function scan(canvas, onStatus = () => {}) {
  // Landmarks run locally while YouCam works.
  const faceP = findFace(canvas).catch(() => null);
  const output = await api.analyse(toJpeg(canvas), onStatus);
  onStatus('Reading what the AI saw');
  const masks = {};
  await Promise.all(CONCERNS.map(async (c) => {
    const url = output[c]?.mask_urls?.[0];
    if (url) masks[c] = await api.maskImageData(url);
  }));
  const face = await faceP;
  const { halves, meta } = scoreScan(masks, face, { width: canvas.width, height: canvas.height }, rasterizeOval);
  if (!Object.keys(halves).length) throw new Error('The AI returned no masks, so the halves could not be split.');
  const whole = {};
  for (const [k, v] of Object.entries(output)) whole[k] = { ui: v.ui_score, raw: v.raw_score };
  return { halves, masks, face, meta, whole };
}
