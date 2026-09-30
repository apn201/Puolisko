// Run before every push: node scripts/secret-scan.mjs
// Scans the working tree AND every blob in git history for:
//   1. the literal values in .env (the real key, whatever its format)
//   2. generic secret patterns
// Prints file and commit, never the secret itself. Exits 1 on any hit.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28 });

const literals = [];
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && m[2].replace(/['"]/g, '').length >= 6) literals.push({ name: m[1], value: m[2].replace(/^(['"])(.*)\1$/, '$2') });
  }
} catch { /* no .env: pattern scan only */ }

const patterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Bearer\s+(?!YOUR_|\$\{|['"`])[A-Za-z0-9._\-+/=]{24,}/,
  /(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9._\-+/=]{20,}['"]/i,
];

function check(text, where, hits) {
  for (const l of literals) if (text.includes(l.value)) hits.push(`${where}: contains the value of ${l.name} from .env`);
  for (const p of patterns) if (p.test(text)) hits.push(`${where}: matches ${p.source.slice(0, 30)}...`);
}

const hits = [];

// Tracked + untracked-but-not-ignored files in the working tree.
const files = git('ls-files', '-co', '--exclude-standard', '-z').toString().split('\0').filter(Boolean);
for (const f of files) {
  if (f === 'scripts/secret-scan.mjs') continue;
  let t;
  try { t = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'); } catch { continue; }
  check(t, `worktree ${f}`, hits);
}

// Every blob ever committed, on any ref.
let blobs = [];
try {
  blobs = git('rev-list', '--objects', '--all').toString().split('\n').filter(Boolean)
    .map((l) => { const i = l.indexOf(' '); return i < 0 ? null : { sha: l.slice(0, i), path: l.slice(i + 1) }; })
    .filter((b) => b && b.path && b.path !== 'scripts/secret-scan.mjs');
} catch { /* no commits yet */ }
const seen = new Set();
for (const b of blobs) {
  if (seen.has(b.sha)) continue;
  seen.add(b.sha);
  let type;
  try { type = git('cat-file', '-t', b.sha).toString().trim(); } catch { continue; }
  if (type !== 'blob') continue;
  check(git('cat-file', '-p', b.sha).toString('utf8'), `history ${b.path} (${b.sha.slice(0, 8)})`, hits);
}

// .env must never be tracked.
const tracked = git('ls-files').toString().split('\n');
if (tracked.some((f) => /(^|\/)\.env$/.test(f))) hits.push('.env is tracked by git');

if (hits.length) {
  console.error(`SECRET SCAN FAILED (${hits.length}):\n  ` + [...new Set(hits)].join('\n  '));
  process.exit(1);
}
console.log(`Secret scan clean: ${files.length} files in tree, ${seen.size} objects in history, ${literals.length} .env values checked.`);
