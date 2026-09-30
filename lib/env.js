// Minimal .env loader for local runs. Vercel injects env itself in production.
import { readFileSync } from 'node:fs';

export function loadEnv(path = '.env') {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
