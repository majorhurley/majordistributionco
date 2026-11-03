// Local server that replays vercel.json: cleanUrls, header rules (later
// matching rules override earlier keys, as on Vercel), and Range requests so
// <video> seeks. Drops upgrade-insecure-requests on localhost (plain HTTP),
// which otherwise leaves WebKit silently JS-dead.
//   node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFileSync, statSync, createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };

export function headersFor(path) {
  const out = {};
  for (const rule of cfg.headers) {
    if (new RegExp('^' + rule.source + '$').test(path)) for (const h of rule.headers) out[h.key] = h.value;
  }
  if (out['Content-Security-Policy']) out['Content-Security-Policy'] = out['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, '');
  delete out['Strict-Transport-Security'];
  return out;
}

export function start(port = 4173) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let path = decodeURIComponent(url.pathname);
    if (cfg.cleanUrls && path.endsWith('.html')) {
      res.writeHead(308, { Location: path.replace(/(index)?\.html$/, '') || '/' });
      return res.end();
    }
    let file = join(ROOT, normalize(path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (path === '/') file = join(ROOT, 'index.html');
    else if (!extname(path) && existsSync(file + '.html')) file += '.html';
    let st;
    try { st = statSync(file); if (st.isDirectory()) throw 0; } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404');
    }
    const h = { ...headersFor(path), 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : st.size - 1;
      res.writeHead(206, { ...h, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...h, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] || 4173);
  await start(port);
  console.log(`serving ${ROOT} on http://localhost:${port}`);
}
