// Facial midline and face outline from MediaPipe Face Landmarker, run in the browser.
// Faces tilt, so the midline is a fitted line, not the image centre.
// Nothing leaves the device here: the model and wasm load from a CDN, inference is local.

const VER = '1.0.1';
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Face mesh indices on the vertical midline, forehead to chin. Lips left out: they move.
const MIDLINE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 17, 18, 200, 199, 175, 152];
// Face oval, in order around the face.
export const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

let landmarkerP = null;

function landmarker() {
  landmarkerP ||= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import(BUNDLE);
    const files = await FilesetResolver.forVisionTasks(WASM);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'IMAGE',
      numFaces: 1,
    });
    try {
      return await FaceLandmarker.createFromOptions(files, opts('GPU'));
    } catch {
      return FaceLandmarker.createFromOptions(files, opts('CPU'));
    }
  })();
  landmarkerP.catch(() => { landmarkerP = null; });
  return landmarkerP;
}

// Start loading early so the first scan does not wait.
export const preload = () => landmarker().catch(() => null);

// Returns { line: { a, b }, oval: [[x, y], ...] } in normalized image coordinates,
// where the midline is x = a + b * y. Returns null if no face is found.
export async function findFace(canvas) {
  let lm;
  try {
    lm = await landmarker();
  } catch {
    return null;
  }
  const res = lm.detect(canvas);
  const pts = res?.faceLandmarks?.[0];
  if (!pts) return null;
  return { line: fitMidline(MIDLINE.map((i) => [pts[i].x, pts[i].y])), oval: OVAL.map((i) => [pts[i].x, pts[i].y]) };
}

// Least squares x = a + b y. x as a function of y, because the line is near vertical.
export function fitMidline(points) {
  const n = points.length;
  let sy = 0, sx = 0, syy = 0, sxy = 0;
  for (const [x, y] of points) { sx += x; sy += y; syy += y * y; sxy += x * y; }
  const den = n * syy - sy * sy;
  const b = den ? (n * sxy - sx * sy) / den : 0;
  return { a: (sx - b * sy) / n, b };
}
