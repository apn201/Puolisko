// The only persistent state: numbers in this browser's localStorage. Never photos, never masks.
const KEY = 'puolisko.v2';

const empty = () => ({
  seenPrivacy: false,
  accessCode: '',
  baseline: null,   // { at, halves }
  beautyCheek: null, // 'left' | 'right', as the player sees themselves in a mirror
  last: null,       // { at, halves, result }
});

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && typeof s === 'object' ? { ...empty(), ...s } : empty();
  } catch {
    return empty();
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: memory only */ }
}

export function wipe() {
  try { localStorage.removeItem(KEY); localStorage.removeItem('puolisko.v1'); } catch { /* ignore */ }
}

// Masks carry pixel counts and densities only; strip anything else before saving.
export const numbersOnly = (halves) => JSON.parse(JSON.stringify(halves));
