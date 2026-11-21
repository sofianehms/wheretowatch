// Minimal static file server (no dependency). Used by `npm start` and by scripts/verify.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.woff2': 'font/woff2',
};

export function startServer(root, port = 0, { prefix = '' } = {}) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (prefix && !pathname.startsWith(prefix + '/')) {
      res.writeHead(404).end('Not found');
      return;
    }
    pathname = pathname.slice(prefix.length);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(base, '.' + pathname);
    const hidden = /(^|[\\/])(\.|node_modules|scripts|package)/.test(path.relative(base, file));
    if (!file.startsWith(base + path.sep) || hidden) { res.writeHead(404).end('Not found'); return; }
    fs.readFile(file, (err, data) => {
      if (err) {
        const nf = path.join(base, '404.html');
        res.writeHead(404, { 'Content-Type': MIME['.html'] });
        res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  const prefix = process.env.PATH_PREFIX || '';
  startServer('.', port, { prefix }).then(() => console.log(`http://127.0.0.1:${port}${prefix}/`));
}
