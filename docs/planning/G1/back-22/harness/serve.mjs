// Two localhost origins. 5190 = harness (dist/), 5191 = Archify output only, with a CSP response header.
// Env: HOST_CSP=strict|relaxed (default strict), ARCHIFY_CSP=<policy> (default: the FINAL policy = prescribed + font-src data:, because the generated page embeds its fonts as data: URIs), ARCHIFY_OUT=<dir>.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST_PORT = +(process.env.HOST_PORT || 5190);
const ARCH_PORT = +(process.env.ARCH_PORT || 5191);
const DIST = path.resolve(here, 'dist');
const ARCH_OUT = path.resolve(process.env.ARCHIFY_OUT || path.join(here, '..', 'vendor', 'archify-work', 'out'));
const LOG = process.env.SERVE_LOG ? path.resolve(process.env.SERVE_LOG) : null;
const HOST_CSP = process.env.HOST_CSP === 'relaxed'
  ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data:; frame-src http://127.0.0.1:" + ARCH_PORT
  : "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src http://127.0.0.1:" + ARCH_PORT + "; object-src 'none'; base-uri 'none'; form-action 'none'";
const ARCH_CSP = process.env.ARCHIFY_CSP
  || "default-src 'none'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self'; img-src data: 'self'; font-src data:; connect-src 'none'; frame-ancestors http://127.0.0.1:" + HOST_PORT;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

function handler(root, csp, prefix) {
  return (req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (prefix) { if (!rel.startsWith(prefix)) { res.writeHead(404); return res.end('not found'); } rel = rel.slice(prefix.length - 1); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
    if (LOG) fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), port: req.socket.localPort, url: req.url, sfd: req.headers['sec-fetch-dest'] || null }) + '\n');
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      res.end(buf);
    });
  };
}
http.createServer(handler(DIST, HOST_CSP, null)).listen(HOST_PORT, '127.0.0.1', () => console.log(`harness  http://127.0.0.1:${HOST_PORT}  CSP: ${HOST_CSP}`));
http.createServer(handler(ARCH_OUT, ARCH_CSP, '/out/')).listen(ARCH_PORT, '127.0.0.1', () => console.log(`archify  http://127.0.0.1:${ARCH_PORT}/out/  CSP: ${ARCH_CSP}`));
