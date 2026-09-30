// Local dev server: serves public/ and runs api/*.js with a Vercel-like req/res.
// node server.js  ->  http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.js';

const root = fileURLToPath(new URL('.', import.meta.url));
loadEnv(join(root, '.env'));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

function wrapRes(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(b); return res; };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
      const mod = await import(`./api/${name}.js`).catch(() => null);
      if (!mod) { res.statusCode = 404; return res.end('no such api'); }
      req.query = Object.fromEntries(url.searchParams);
      req.body = await readBody(req);
      return await mod.default(req, wrapRes(res));
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
    if (!p || /[/\\]$/.test(p)) p += 'index.html';
    if (p.includes('..')) { res.statusCode = 400; return res.end(); }
    const data = await readFile(join(root, 'public', p));
    res.setHeader('Content-Type', TYPES[extname(p)] || 'application/octet-stream');
    res.end(data);
  } catch (e) {
    if (!res.headersSent) res.statusCode = e.code === 'ENOENT' ? 404 : 500;
    res.end(e.code === 'ENOENT' ? 'not found' : 'server error');
    if (e.code !== 'ENOENT') console.error(e.message);
  }
}).listen(PORT, () => {
  console.log(`Puolisko on http://localhost:${PORT}`);
  console.log(process.env.YOUCAM_API_KEY ? 'YouCam key loaded from .env' : 'No YOUCAM_API_KEY: put it in .env');
});
