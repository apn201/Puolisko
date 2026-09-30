// Everything the app keeps lives here, in this browser's localStorage. Numbers only, never photos.
const KEY = 'puolisko.v1';

const empty = () => ({ run: null, entries: [], accessCode: '' });

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && typeof s === 'object' ? { ...empty(), ...s } : empty();
  } catch {
    return empty();
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: keep in memory */ }
}

export function startRun(state, { aName, bName, aCheek }) {
  state.run = { id: Date.now().toString(36), created: today(), aName, bName, aCheek };
  state.entries = [];
  save(state);
}

export function addEntry(state, entry) {
  // One photo per day: a retake replaces that day's numbers.
  state.entries = state.entries.filter((e) => e.date !== entry.date);
  state.entries.push(entry);
  state.entries.sort((a, b) => a.date.localeCompare(b.date));
  save(state);
}

export function removeEntry(state, date) {
  state.entries = state.entries.filter((e) => e.date !== date);
  save(state);
}

export function exportJson(state) {
  return JSON.stringify({ app: 'puolisko', version: 1, exported: new Date().toISOString(), run: state.run, entries: state.entries }, null, 2);
}

export function importJson(state, text) {
  const o = JSON.parse(text);
  if (o.app !== 'puolisko' || !o.run || !Array.isArray(o.entries)) throw new Error('Not a Puolisko export');
  state.run = o.run;
  state.entries = o.entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.sides);
  save(state);
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function today(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
