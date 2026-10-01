// Game rules. Pure functions, no DOM.
//
// A scan gives, per concern, flagged pixels and density for each image half.
// The photo is not mirrored, so the image's left half is the player's RIGHT cheek.

export const CONCERNS = ['wrinkle', 'redness', 'dark_circle_v2', 'age_spot'];
export const LABEL = { wrinkle: 'Wrinkles', redness: 'Redness', dark_circle_v2: 'Dark circles', age_spot: 'Spots' };

// Density (% of half-face flagged, intensity weighted) to points lost. Tuned after the spike.
export const PENALTY = 4;

export const cheekToImage = (cheek) => (cheek === 'left' ? 'imgRight' : 'imgLeft');
export const otherCheek = (cheek) => (cheek === 'left' ? 'right' : 'left');

// Skin score of one half, 0..100. Higher = the AI likes it more.
export function halfScore(halves, imgSide, concerns = CONCERNS) {
  const used = concerns.filter((c) => halves[c]);
  if (!used.length) return null;
  const damage = used.reduce((s, c) => s + halves[c][imgSide].density, 0) / used.length;
  return clamp(100 - PENALTY * damage);
}

// Beauty minus Beast for one scan, by cheek.
export function sideScores(halves, beautyCheek) {
  const beauty = halfScore(halves, cheekToImage(beautyCheek));
  const beast = halfScore(halves, cheekToImage(otherCheek(beautyCheek)));
  return { beauty, beast, diff: beauty - beast };
}

// The headline: (Beauty - Beast) now, minus (Beauty - Beast) of the bare face.
// Your natural asymmetry is subtracted, so nobody wins on genetics.
export function result(baseline, final, beautyCheek) {
  const now = sideScores(final, beautyCheek);
  const base = baseline ? sideScores(baseline, beautyCheek) : { diff: 0 };
  const bImg = cheekToImage(beautyCheek), xImg = cheekToImage(otherCheek(beautyCheek));
  const perConcern = CONCERNS.filter((c) => final[c]).map((c) => ({
    concern: c,
    beautyPixels: final[c][bImg].flagged,
    beastPixels: final[c][xImg].flagged,
    beautyChange: baseline?.[c] ? final[c][bImg].density - baseline[c][bImg].density : null,
    beastChange: baseline?.[c] ? final[c][xImg].density - baseline[c][xImg].density : null,
  }));
  return {
    beauty: round1(now.beauty),
    beast: round1(now.beast),
    offset: round1(base.diff),
    gap: round1(now.diff - base.diff),
    perConcern,
    title: titleFor(now.diff - base.diff),
  };
}

export function titleFor(gap) {
  if (gap >= 40) return 'Two different people';
  if (gap >= 25) return 'Full split personality';
  if (gap >= 12) return 'Proper monster';
  if (gap >= 5) return 'Getting there';
  if (gap > -5) return 'Suspiciously symmetrical';
  return 'The Beast won the wrong half';
}

// Fair coin. crypto when available.
export function pickBeautyCheek(rand = defaultRand) {
  return rand() < 0.5 ? 'left' : 'right';
}

function defaultRand() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  return Math.random();
}

const clamp = (v) => Math.max(0, Math.min(100, v));
const round1 = (v) => Math.round(v * 10) / 10;
