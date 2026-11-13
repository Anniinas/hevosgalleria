// Paikallinen testipalvelin: sivusto site/-kansiosta ja kuvat suoraan omalta koneelta.
// Käyttö: npm run serve  →  http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, localSources, sourceDir } from './lib.mjs';

const PORT = Number(process.env.PORT) || 8080;
const SITE = path.join(ROOT, 'site');
const src = localSources();
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function send(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Ei löydy'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

// Estää ../-polut
const inside = (base, rel) => {
  const p = path.resolve(base, rel);
  return p.startsWith(path.resolve(base)) ? p : null;
};

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'] });
    res.end("export const IMAGE_BASE = '/img';\n");
    return;
  }
  const m = url.match(/^\/img\/(originals|thumbs)\/([^/]+)\/([^/]+)$/);
  if (m) {
    const [, kind, gid, file] = m;
    const dir = kind === 'thumbs'
      ? path.join(src.thumbsDir, gid)
      : sourceDir(src, gid);
    const p = dir && inside(dir, file);
    if (!p) { res.writeHead(404); res.end(); return; }
    send(res, p);
    return;
  }
  const p = inside(SITE, '.' + (url.endsWith('/') ? url + 'index.html' : url));
  if (!p) { res.writeHead(403); res.end(); return; }
  send(res, p);
}).listen(PORT, () => console.log(`Testipalvelin: http://localhost:${PORT}`));
